import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { configPath } from 'dsh-life-core/internal/paths';
import { apply } from '../src/index.js';
import { DEFAULT_CONFIG, saveConfig } from '../src/config.mjs';
import { EMPTY_CONCLUSIONS_TEXT, FOCUS_SOURCE_KIND } from '../src/render.mjs';
import { FOCUS_TOOL_NAME, FocusToolArgsError, validateFocusConcludeArgs } from '../src/tools.mjs';

const SURFACE_TYPES = new Set([
  'system/message',
  'developer/message',
  'user/message',
  'assistant/message',
  'tool/result',
]);

/**
 * Minimal faithful replica of DSH `Session` + `SurfaceManager`:
 * enforces contiguous `seq`, `surfaceOp: 'append' | { op: 'replace', startSeq, endSeq }`,
 * complete `sourceEventSeqs` coverage over shadowed surface nodes, node 0 system head protection,
 * and monotonic `replaceGeneration` / `contentGeneration`.
 */
class FakeSession {
  constructor(id = 'main-session') {
    this.id = id;
    this.log = [];
    this._nodes = [];
    this._replaceGen = 0;
    this._contentGen = 0;
    this._clock = 1_700_000_000_000;
  }

  get seq() {
    return this.log.length;
  }

  setClock(ms) {
    this._clock = ms;
  }

  advanceClock(deltaMs) {
    this._clock += deltaMs;
  }

  get surface() {
    const self = this;
    return {
      get nodes() { return [...self._nodes]; },
      get replaceGeneration() { return self._replaceGen; },
      get contentGeneration() { return self._contentGen; },
    };
  }

  eventAt(seq) {
    return this.log[seq];
  }

  snapshotEvents() {
    return Object.freeze([...this.log]);
  }

  append(type, data, opts) {
    const seq = this.log.length;
    const isSurface = SURFACE_TYPES.has(type);
    if (isSurface) {
      assert.ok(opts && opts.surfaceOp !== undefined, `surface event ${type} requires surfaceOp`);
      const op = opts.surfaceOp;
      if (op === 'append') {
        this._nodes.push(seq);
      } else {
        assert.equal(op.op, 'replace');
        const startIdx = this._nodes.indexOf(op.startSeq);
        const endIdx = this._nodes.indexOf(op.endSeq);
        assert.notEqual(startIdx, -1, `startSeq ${op.startSeq} must exist in surface`);
        assert.notEqual(endIdx, -1, `endSeq ${op.endSeq} must exist in surface`);
        assert.ok(startIdx <= endIdx, 'startIdx <= endIdx');
        if (startIdx === 0 && this.log[this._nodes[0]]?.type === 'system/message') {
          assert.equal(type, 'system/message', 'node 0 system prompt cannot be replaced by non-system event');
          assert.equal(startIdx, endIdx);
        }
        const shadowed = this._nodes.slice(startIdx, endIdx + 1);
        const sources = new Set(opts.sourceEventSeqs ?? []);
        assert.equal(sources.size, (opts.sourceEventSeqs ?? []).length, 'sourceEventSeqs must have no duplicates');
        for (const s of sources) assert.ok(s < seq, 'sourceEventSeqs must precede current seq');
        for (const s of shadowed) assert.ok(sources.has(s), `shadowed node ${s} must be listed in sourceEventSeqs`);
        this._nodes.splice(startIdx, endIdx - startIdx + 1, seq);
        this._replaceGen += 1;
        this._contentGen += 1;
      }
    } else {
      assert.equal(opts, undefined, `non-surface event ${type} must not carry surface opts`);
    }
    const event = Object.freeze({
      type,
      seq,
      time: this._clock,
      data: structuredClone(data),
      ...(opts?.surfaceOp !== undefined ? { surfaceOp: structuredClone(opts.surfaceOp) } : {}),
      ...(opts?.sourceEventSeqs !== undefined ? { sourceEventSeqs: [...opts.sourceEventSeqs] } : {}),
    });
    this.log.push(event);
    return event;
  }
}

const sysMsg = (text = 'System instructions') => ({
  turn: 1,
  step: 1,
  message: { id: randomUUID(), role: 'system', content: [{ type: 'text', text }], source: { kind: 'system-prompt' } },
});

const userMsg = (text, source = { kind: 'user' }) => ({
  id: randomUUID(),
  role: 'user',
  content: [{ type: 'text', text }],
  source,
});

const assistantToolCallMsg = (turn, step, calls, thinkingText = '') => ({
  turn,
  step,
  stream: [],
  message: {
    id: randomUUID(),
    role: 'assistant',
    source: { kind: 'model', provider: 'deepseek', model: 'chat' },
    content: [
      ...(thinkingText ? [{ type: 'thinking', thinking: thinkingText }] : []),
      ...calls.map((c) => ({
        type: 'tool-call',
        id: c.id,
        name: c.name,
        arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args),
      })),
    ],
  },
});

const assistantTextMsg = (turn, step, text) => ({
  turn,
  step,
  stream: [],
  message: {
    id: randomUUID(),
    role: 'assistant',
    source: { kind: 'model', provider: 'deepseek', model: 'chat' },
    content: [{ type: 'text', text }],
  },
});

const toolResultMsg = (turn, step, callId, text, isError = false) => ({
  turn,
  step,
  ...(isError ? { error: { name: 'ToolArgsError', code: 'INVALID_ARGS' } } : {}),
  message: {
    id: randomUUID(),
    role: 'tool',
    toolCallId: callId,
    isError,
    source: { kind: 'tool', callId },
    content: [{ type: 'text', text }],
  },
});

function createPluginHarness() {
  const dshHome = mkdtempSync(join(tmpdir(), 'lpipe-focus-test-'));
  const prevHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dshHome;
  const mainFile = configPath();
  mkdirSync(dirname(mainFile), { recursive: true });
  const bindMain = (id) => writeFileSync(mainFile, JSON.stringify({ mainSessionId: id }));
  bindMain('main-session');

  const focusDir = join(dshHome, 'life-focus');
  let currentNow = 1_700_000_000_000;
  const preStepListeners = [];
  const registeredTools = new Map();
  const sections = [];
  const routes = [];
  const disposers = [];

  const ctx = {
    on(event, fn, opts) {
      if (event === 'agent/pre-step') preStepListeners.push({ fn, opts });
      return () => {};
    },
    inject(keys, fn) {
      if (keys.includes('pluginManager')) return;
      fn(this);
    },
    effect(fn) {
      const d = fn();
      if (typeof d === 'function') disposers.push(d);
      return d;
    },
    tools: {
      register(tool, options) {
        registeredTools.set(tool.name, { tool, options });
        return () => registeredTools.delete(tool.name);
      },
    },
    systemPrompt: {
      section(sec) {
        sections.push(sec);
        return () => {
          const i = sections.indexOf(sec);
          if (i >= 0) sections.splice(i, 1);
        };
      },
    },
    connection: {
      fetch: {
        register(route) {
          routes.push(route);
          return () => {};
        },
      },
    },
  };

  apply(ctx, { root: focusDir, now: () => currentNow });

  const runPreStep = async (agent, messages = [], { turn = 1, step = 1, signal = new AbortController().signal, nextDecision } = {}) => {
    const handler = preStepListeners[0].fn;
    return handler(
      { agent, messages, turn, step, signal },
      async () => nextDecision ?? { kind: 'enter', messages, startsRequestSeries: true },
    );
  };

  const cleanup = () => {
    for (const d of disposers.reverse()) d();
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
    rmSync(dshHome, { recursive: true, force: true });
  };

  return {
    dshHome,
    focusDir,
    bindMain,
    setNow: (ms) => { currentNow = ms; },
    getNow: () => currentNow,
    preStepListeners,
    registeredTools,
    sections,
    routes,
    runPreStep,
    cleanup,
  };
}

function seedBaseLayer(session) {
  const sys = session.append('system/message', sysMsg(), { surfaceOp: 'append' });
  const rt = session.append('user/message', userMsg('<system-reminder>runtime</system-reminder>', { kind: 'runtime-context', form: 'snapshot', sections: [] }), { surfaceOp: 'append' });
  const sk = session.append('user/message', userMsg('<available_skills></available_skills>', { kind: 'skill-catalog', form: 'catalog', entries: [] }), { surfaceOp: 'append' });
  return [sys.seq, rt.seq, sk.seq];
}

test('1. four-layer daily folding preserves base layer & prior conclusion seqs verbatim across 3 consecutive folds', async () => {
  const h = createPluginHarness();
  try {
    assert.equal(h.preStepListeners[0].opts?.prepend, true, 'pre-step must register with prepend: true');
    const session = new FakeSession('main-session');
    const agent = { id: 'main-session', session };
    const baseSeqs = seedBaseLayer(session);

    // Turn 1: User asks question -> search tool -> focus_conclude #1
    session.append('turn/start', { turn: 1 });
    session.append('step/start', { turn: 1, step: 1 });
    session.append('user/message', userMsg('Investigate wake timer and rpc routes'), { surfaceOp: 'append' });
    session.append('assistant/message', assistantToolCallMsg(1, 1, [{ id: 'c-read-1', name: 'read', args: { file_path: 'runner.mjs' } }], 'reading runner'), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 1, 'c-read-1', 'runner polls every 30s...'.repeat(40)), { surfaceOp: 'append' });
    session.append('step/end', { turn: 1, step: 1 });

    // Step 2: Model calls focus_conclude alone
    session.append('step/start', { turn: 1, step: 2 });
    const fcArgs1 = {
      conclusions: [{ key: 'wake.timer', text: 'runner.mjs polls every 30s and delivers via agent.followup.' }],
      objective: 'Inspect rpc.mjs next',
    };
    session.append('assistant/message', assistantToolCallMsg(1, 2, [{ id: 'fc-1', name: FOCUS_TOOL_NAME, args: fcArgs1 }]), { surfaceOp: 'append' });
    const toolDef = h.registeredTools.get(FOCUS_TOOL_NAME).tool;
    const out1 = await toolDef.execute(fcArgs1, { agent });
    session.append('tool/result', toolResultMsg(1, 2, 'fc-1', out1.summary), { surfaceOp: 'append' });
    session.append('step/end', { turn: 1, step: 2 });

    // Step 3 pre-step: folds into Conclusion #1 + Objective #1
    await h.runPreStep(agent, [], { turn: 1, step: 3 });

    const nodesAfterFold1 = session.surface.nodes;
    assert.deepEqual(nodesAfterFold1.slice(0, 3), baseSeqs, 'base layer seqs must stay untouched');
    assert.equal(nodesAfterFold1.length, 5, '3 base + 1 conclusion + 1 objective');
    const conc1Seq = nodesAfterFold1[3];
    const obj1Seq = nodesAfterFold1[4];
    assert.equal(session.eventAt(conc1Seq).data.source.layer, 'conclusion');
    assert.equal(session.eventAt(obj1Seq).data.source.layer, 'objective');
    assert.equal(session.eventAt(obj1Seq).data.source.origin, 'model');
    assert.match(session.eventAt(obj1Seq).data.content[0].text, /Inspect rpc\.mjs next/);

    // Step 3 -> Step 4: More exploration + focus_conclude #2
    session.append('assistant/message', assistantToolCallMsg(1, 3, [{ id: 'c-read-2', name: 'read', args: { file_path: 'rpc.mjs' } }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 3, 'c-read-2', 'rpc uses /api/dsh-lpipe-wake'), { surfaceOp: 'append' });
    const fcArgs2 = {
      conclusions: [{ key: 'wake.rpc', text: 'rpc.mjs registers POST /api/dsh-lpipe-wake.' }],
      objective: 'Check client panel',
    };
    session.append('assistant/message', assistantToolCallMsg(1, 4, [{ id: 'fc-2', name: FOCUS_TOOL_NAME, args: fcArgs2 }]), { surfaceOp: 'append' });
    const out2 = await toolDef.execute(fcArgs2, { agent });
    session.append('tool/result', toolResultMsg(1, 4, 'fc-2', out2.summary), { surfaceOp: 'append' });

    await h.runPreStep(agent, [], { turn: 1, step: 5 });
    const nodesAfterFold2 = session.surface.nodes;
    assert.deepEqual(nodesAfterFold2.slice(0, 3), baseSeqs);
    assert.equal(nodesAfterFold2[3], conc1Seq, 'Conclusion #1 seq must be 100% preserved');
    const conc2Seq = nodesAfterFold2[4];
    const obj2Seq = nodesAfterFold2[5];
    assert.equal(nodesAfterFold2.length, 6);
    assert.notEqual(obj2Seq, obj1Seq, 'old objective was replaced');

    // Fold #3 with retirement tombstone
    const fcArgs3 = {
      conclusions: [
        { key: 'wake.panel', text: 'panel.js registers into lpipe.settings.panel.' },
        { key: 'wake.timer', text: '' },
      ],
    };
    session.append('assistant/message', assistantToolCallMsg(1, 5, [{ id: 'fc-3', name: FOCUS_TOOL_NAME, args: fcArgs3 }]), { surfaceOp: 'append' });
    const out3 = await toolDef.execute(fcArgs3, { agent });
    session.append('tool/result', toolResultMsg(1, 5, 'fc-3', out3.summary), { surfaceOp: 'append' });

    await h.runPreStep(agent, [], { turn: 1, step: 6 });
    const nodesAfterFold3 = session.surface.nodes;
    assert.deepEqual(nodesAfterFold3.slice(0, 5), [...baseSeqs, conc1Seq, conc2Seq], 'Base + Conclusion #1 + Conclusion #2 seqs untouched');
    const conc3Event = session.eventAt(nodesAfterFold3[5]);
    assert.match(conc3Event.data.content[0].text, /\(retired — no longer needed\)/);
    // Since no new user message arrived in Fold #3 and objective was omitted, it carried forward Objective #2 ('Check client panel')
    const obj3Event = session.eventAt(nodesAfterFold3[6]);
    assert.equal(obj3Event.data.source.origin, 'carried');
    assert.match(obj3Event.data.content[0].text, /Check client panel/);
  } finally {
    h.cleanup();
  }
});

test('2. objective carry-forward picks the latest real user/chat/wake trigger across multi-turn unconverted spans', async () => {
  const h = createPluginHarness();
  try {
    const session = new FakeSession('main-session');
    const agent = { id: 'main-session', session };
    seedBaseLayer(session);

    // Turn 1 answered without folding
    session.append('user/message', userMsg('First old question about tone'), { surfaceOp: 'append' });
    session.append('assistant/message', assistantTextMsg(1, 1, 'Tone has 4 fields.'), { surfaceOp: 'append' });
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });

    // Turn 2: new user question + runtime notice + exploration + focus_conclude without objective
    session.append('user/message', userMsg('Second active question: refactor focus config bounds'), { surfaceOp: 'append' });
    session.append('user/message', userMsg('<system-reminder>clock tick</system-reminder>', { kind: 'lpipe-clock', form: 'notice', summary: 'clock' }), { surfaceOp: 'append' });
    session.append('assistant/message', assistantToolCallMsg(2, 1, [{ id: 'g1', name: 'grep', args: { pattern: 'DEFAULT_CONFIG' } }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(2, 1, 'g1', 'found config.mjs'), { surfaceOp: 'append' });

    const fcArgs = { conclusions: [{ key: 'cfg.bounds', text: 'compactChars default is 512K.' }] };
    session.append('assistant/message', assistantToolCallMsg(2, 2, [{ id: 'fc-a', name: FOCUS_TOOL_NAME, args: fcArgs }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(2, 2, 'fc-a', 'Recorded 1 conclusion(s)'), { surfaceOp: 'append' });

    await h.runPreStep(agent, [], { turn: 2, step: 3 });

    const objSeq = session.surface.nodes.at(-1);
    const objEvent = session.eventAt(objSeq);
    assert.equal(objEvent.data.source.layer, 'objective');
    assert.equal(objEvent.data.source.origin, 'carried');
    assert.match(objEvent.data.content[0].text, /Second active question: refactor focus config bounds/);
    assert.doesNotMatch(objEvent.data.content[0].text, /First old question/);
  } finally {
    h.cleanup();
  }
});

test('3. parallel sibling tool calls with focus_conclude are hard-rejected and never fold the surface', async () => {
  const h = createPluginHarness();
  try {
    const session = new FakeSession('main-session');
    const agent = { id: 'main-session', session };
    seedBaseLayer(session);
    session.append('user/message', userMsg('Read file and conclude at once'), { surfaceOp: 'append' });

    // Assistant emits both `read` and `focus_conclude` in the same message
    const fcArgs = { conclusions: [{ key: 'bad.parallel', text: 'should reject' }] };
    session.append(
      'assistant/message',
      assistantToolCallMsg(1, 1, [
        { id: 'call-read', name: 'read', args: { file_path: 'a.js' } },
        { id: 'call-fc', name: FOCUS_TOOL_NAME, args: fcArgs },
      ]),
      { surfaceOp: 'append' },
    );

    const toolDef = h.registeredTools.get(FOCUS_TOOL_NAME).tool;
    await assert.rejects(
      () => toolDef.execute(fcArgs, { agent }),
      (err) => err instanceof FocusToolArgsError && err.code === 'INVALID_ARGS' && /alone/.test(err.message),
    );

    // Log sibling success and focus_conclude error result
    session.append('tool/result', toolResultMsg(1, 1, 'call-read', 'file content intact'), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 1, 'call-fc', 'invalid arguments: must be called alone', true), { surfaceOp: 'append' });

    const beforeNodes = session.surface.nodes;
    await h.runPreStep(agent, [], { turn: 1, step: 2 });
    assert.deepEqual(session.surface.nodes, beforeNodes, 'surface must not fold after rejected parallel call');

    // Check diagnostic log recorded rejected-parallel
    const diagContent = readFileSync(join(h.focusDir, 'focus.jsonl'), 'utf8');
    assert.match(diagContent, /"rejected-parallel"/);
  } finally {
    h.cleanup();
  }
});

test('4. deterministic compaction deduplicates keys, purges tombstones, handles all-empty state, evicts oldest over maxConclusionChars, preserves surrounding seqs, and skips no-op idle rewrites', async () => {
  const h = createPluginHarness();
  try {
    saveConfig({
      idleMinutes: 30,
      compactChars: 50000,
      nudgeChars: 40000,
      maxConclusionChars: 4000,
    }, h.focusDir);

    const session = new FakeSession('main-session');
    const agent = { id: 'main-session', session };
    const baseSeqs = seedBaseLayer(session);
    const toolDef = h.registeredTools.get(FOCUS_TOOL_NAME).tool;

    // Fold 1
    session.append('user/message', userMsg('Task part 1'), { surfaceOp: 'append' });
    const a1 = {
      conclusions: [
        { key: 'slot.dup', text: 'old value v1' },
        { key: 'slot.retire', text: 'temporary note' },
        { key: 'slot.oldest', text: 'X'.repeat(2400) },
      ],
      objective: 'Continue work',
    };
    session.append('assistant/message', assistantToolCallMsg(1, 1, [{ id: 'fc1', name: FOCUS_TOOL_NAME, args: a1 }]), { surfaceOp: 'append' });
    await toolDef.execute(a1, { agent });
    session.append('tool/result', toolResultMsg(1, 1, 'fc1', 'ok'), { surfaceOp: 'append' });
    await h.runPreStep(agent, [], { turn: 1, step: 2 });

    // Fold 2: supersede slot.dup, retire slot.retire, add slot.newest that pushes slot.oldest over 4000 cap
    const a2 = {
      conclusions: [
        { key: 'slot.dup', text: 'updated value v2' },
        { key: 'slot.retire', text: '' },
        { key: 'slot.newest', text: 'Y'.repeat(2200) },
      ],
      objective: 'Final step',
    };
    session.append('assistant/message', assistantToolCallMsg(1, 2, [{ id: 'fc2', name: FOCUS_TOOL_NAME, args: a2 }]), { surfaceOp: 'append' });
    await toolDef.execute(a2, { agent });
    session.append('tool/result', toolResultMsg(1, 2, 'fc2', 'ok'), { surfaceOp: 'append' });
    await h.runPreStep(agent, [], { turn: 1, step: 3 });

    // Add an unconverted assistant reply and close turn 1 at t0
    session.setClock(h.getNow());
    const tailAsst = session.append('assistant/message', assistantTextMsg(1, 3, 'Done for now.'), { surfaceOp: 'append' });
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });

    const preCompactNodes = session.surface.nodes;
    // Expect: 3 base + 2 conclusions + 1 objective + 1 tailAsst = 7 nodes
    assert.equal(preCompactNodes.length, 7);
    const preservedObjectiveSeq = preCompactNodes[5];
    const preservedTailSeq = tailAsst.seq;

    // Advance clock by 31 minutes (>= idleMinutes=30) and start Turn 2
    const tIdle = h.getNow() + 31 * 60_000;
    h.setNow(tIdle);
    session.setClock(tIdle);
    session.append('turn/start', { turn: 2 });

    await h.runPreStep(agent, [userMsg('Back after break')], { turn: 2, step: 1 });

    const postCompactNodes = session.surface.nodes;
    // 2 conclusion nodes collapsed into 1; baseSeqs, objectiveSeq, and tailAsstSeq preserved verbatim!
    assert.equal(postCompactNodes.length, 6);
    assert.deepEqual(postCompactNodes.slice(0, 3), baseSeqs);
    assert.equal(postCompactNodes[4], preservedObjectiveSeq, 'prompt layer seq must stay untouched by stage B compaction');
    assert.equal(postCompactNodes[5], preservedTailSeq, 'unconverted layer seq must stay untouched by stage B compaction');

    const mergedText = session.eventAt(postCompactNodes[3]).data.content[0].text;
    assert.match(mergedText, /\[slot\.dup\]: updated value v2/);
    assert.doesNotMatch(mergedText, /old value v1/);
    assert.doesNotMatch(mergedText, /slot\.retire/, 'retired key and tombstone must be purged');
    assert.doesNotMatch(mergedText, /slot\.oldest/, 'oldest entry exceeding maxConclusionChars must be evicted');
    assert.match(mergedText, /\[slot\.newest\]: Y+/);
    assert.ok(mergedText.length <= 4000, `compacted conclusion text (${mergedText.length}) must fit maxConclusionChars`);

    // Verify no-op guard: another 40 minutes idle when already compacted to 1 clean node must NOT emit another replace
    const genBeforeNoOp = session.surface.replaceGeneration;
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } });
    const tIdle2 = tIdle + 40 * 60_000;
    h.setNow(tIdle2);
    session.setClock(tIdle2);
    session.append('turn/start', { turn: 3 });
    await h.runPreStep(agent, [userMsg('Another idle ping')], { turn: 3, step: 1 });
    assert.equal(session.surface.replaceGeneration, genBeforeNoOp, 'clean single-node conclusion layer must skip no-op replace');

    // Now retire remaining keys and trigger threshold compaction -> verify non-empty placeholder conclusion node
    const aRetireAll = {
      conclusions: [
        { key: 'slot.dup', text: '' },
        { key: 'slot.newest', text: '' },
      ],
    };
    session.append('assistant/message', assistantToolCallMsg(3, 1, [{ id: 'fc3', name: FOCUS_TOOL_NAME, args: aRetireAll }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(3, 1, 'fc3', 'ok'), { surfaceOp: 'append' });

    // Pass huge incoming message to cross compactChars (50000) right after folding
    await h.runPreStep(agent, [userMsg('Z'.repeat(52000))], { turn: 3, step: 2 });
    const emptyConcEvent = session.eventAt(session.surface.nodes[3]);
    assert.equal(emptyConcEvent.data.content[0].text, EMPTY_CONCLUSIONS_TEXT);
    assert.deepEqual(emptyConcEvent.data.source.entries, []);
  } finally {
    h.cleanup();
  }
});

test('5. unconverted nudge triggers without percentages, throttles repeats by half-step, and is shadowed upon folding', async () => {
  const h = createPluginHarness();
  try {
    saveConfig({
      idleMinutes: 60,
      compactChars: 200000,
      nudgeChars: 20000,
      maxConclusionChars: 16000,
    }, h.focusDir);

    const session = new FakeSession('main-session');
    const agent = { id: 'main-session', session };
    seedBaseLayer(session);
    session.append('user/message', userMsg('Start big search'), { surfaceOp: 'append' });
    session.append('assistant/message', assistantToolCallMsg(1, 1, [{ id: 'r1', name: 'read', args: { file_path: 'huge.txt' } }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 1, 'r1', 'A'.repeat(21000)), { surfaceOp: 'append' });

    // Step 2: unconvertedChars >= 20000 -> injects 1 nudge
    const d1 = await h.runPreStep(agent, [], { turn: 1, step: 2 });
    assert.equal(d1.messages.length, 1);
    const nudgeMsg = d1.messages[0];
    assert.equal(nudgeMsg.source.kind, FOCUS_SOURCE_KIND);
    assert.equal(nudgeMsg.source.layer, 'nudge');
    assert.doesNotMatch(nudgeMsg.content[0].text, /%/, 'nudge must never display window percentage');
    // Commit the nudge into the session surface just like ReactLoopAgent does
    const nudgeEvent = session.append('user/message', nudgeMsg, { surfaceOp: 'append' });

    // Step 3: add only 3000 chars (< max(8000, 20000/2)=10000) -> must NOT spam another nudge
    session.append('assistant/message', assistantToolCallMsg(1, 2, [{ id: 'r2', name: 'read', args: { file_path: 'small.txt' } }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 2, 'r2', 'B'.repeat(3000)), { surfaceOp: 'append' });
    const d2 = await h.runPreStep(agent, [], { turn: 1, step: 3 });
    assert.equal(d2.messages.length, 0, 'must not spam repeat nudge before half-threshold growth');

    // Step 4: add 9000 more chars (3000 + 9000 = 12000 >= 10000) -> second nudge fires
    session.append('assistant/message', assistantToolCallMsg(1, 3, [{ id: 'r3', name: 'read', args: { file_path: 'more.txt' } }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 3, 'r3', 'C'.repeat(9000)), { surfaceOp: 'append' });
    const d3 = await h.runPreStep(agent, [], { turn: 1, step: 4 });
    assert.equal(d3.messages.length, 1);
    const nudgeEvent2 = session.append('user/message', d3.messages[0], { surfaceOp: 'append' });

    // Step 5: model calls focus_conclude -> both nudges in unconverted layer are shadowed and gone from surface.nodes
    const fcArgs = { conclusions: [{ key: 'search.done', text: 'Summarized huge, small, and more files.' }] };
    session.append('assistant/message', assistantToolCallMsg(1, 4, [{ id: 'fc-clean', name: FOCUS_TOOL_NAME, args: fcArgs }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 4, 'fc-clean', 'ok'), { surfaceOp: 'append' });

    await h.runPreStep(agent, [], { turn: 1, step: 5 });
    assert.equal(session.surface.nodes.includes(nudgeEvent.seq), false, 'first nudge must be shadowed after fold');
    assert.equal(session.surface.nodes.includes(nudgeEvent2.seq), false, 'second nudge must be shadowed after fold');
  } finally {
    h.cleanup();
  }
});

test('6. active compaction lock avoidance, stale pre-seed lock handling, and strict LP main-session isolation', async () => {
  const h = createPluginHarness();
  try {
    saveConfig({ ...DEFAULT_CONFIG, nudgeChars: 16000, compactChars: 64000, maxConclusionChars: 8000 }, h.focusDir);

    const session = new FakeSession('main-session');
    const mainAgent = { id: 'main-session', session };
    const otherSession = new FakeSession('other-session');
    const otherAgent = { id: 'other-session', session: otherSession };
    const childAgent = { id: 'subagent-1', parentSession: 'main-session', session: new FakeSession('subagent-1') };

    // Tool visibility & execution gate + prompt section isolation
    const { tool, options } = h.registeredTools.get(FOCUS_TOOL_NAME);
    assert.equal(options.when({ agent: mainAgent }), true);
    assert.equal(options.when({ agent: otherAgent }), false);
    assert.equal(options.when({ agent: childAgent }), false);
    assert.throws(() => tool.execute({ conclusions: [{ key: 'k', text: 'v' }] }, { agent: otherAgent }), /not enabled/);

    const section = h.sections[0];
    assert.equal(section.name, 'dsh-lpipe-focus');
    assert.equal(section.order, 712);
    assert.equal(section.interpolate, false);
    assert.match(section.text({ scope: mainAgent }), /focus_conclude/);
    assert.equal(section.text({ scope: otherAgent }), '');
    assert.equal(section.text({ scope: childAgent }), '');

    // Non-main session does not fold or nudge
    seedBaseLayer(otherSession);
    otherSession.append('user/message', userMsg('X'.repeat(25000)), { surfaceOp: 'append' });
    const otherDecision = await h.runPreStep(otherAgent, [], { turn: 1, step: 1 });
    assert.equal(otherDecision.messages.length, 0);

    // Active compaction lock on main session skips surface rewrite
    seedBaseLayer(session);
    session.append('user/message', userMsg('Work item'), { surfaceOp: 'append' });
    const fcArgs = { conclusions: [{ key: 'k1', text: 'val1' }] };
    session.append('assistant/message', assistantToolCallMsg(1, 1, [{ id: 'fc-lock', name: FOCUS_TOOL_NAME, args: fcArgs }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 1, 'fc-lock', 'ok'), { surfaceOp: 'append' });
    session.append('compaction/start', { compactionId: 'c-1', turn: 1 });

    const lockedNodes = session.surface.nodes;
    await h.runPreStep(mainAgent, [], { turn: 1, step: 2 });
    assert.deepEqual(session.surface.nodes, lockedNodes, 'unclosed compaction/start must prevent focus surface rewrites');

    // If session/end-seed occurs after an old crash-orphaned compaction/start, it is treated as stale and folding resumes!
    session.append('session/end-seed', {});
    await h.runPreStep(mainAgent, [], { turn: 2, step: 1 });
    assert.notDeepEqual(session.surface.nodes, lockedNodes, 'stale compaction/start before session/end-seed must not block folding');

    // Rebinding main session dynamically isolates previous main session immediately
    h.bindMain('other-session');
    assert.equal(options.when({ agent: mainAgent }), false);
    assert.equal(options.when({ agent: otherAgent }), true);
    assert.equal(section.text({ scope: mainAgent }), '');
    assert.match(section.text({ scope: otherAgent }), /focus_conclude/);

    // Enabling allSessions opens focus to all top-level conversations while keeping subagents isolated
    saveConfig({ allSessions: true }, h.focusDir);
    assert.equal(options.when({ agent: mainAgent }), true, 'former main session now admitted via allSessions');
    assert.equal(options.when({ agent: otherAgent }), true);
    assert.match(section.text({ scope: mainAgent }), /focus_conclude/);
    for (const sub of [
      childAgent,
      { id: 'spawn-sub', options: { subagentDepth: 1 }, session: new FakeSession('spawn-sub') },
      { id: 'resumed-sub', session: Object.assign(new FakeSession('resumed-sub'), { header: { origin: 'subagent', delegationDepth: 1 } }) },
    ]) {
      assert.equal(options.when({ agent: sub }), false, 'subagent must stay isolated even when allSessions is true');
      assert.equal(section.text({ scope: sub }), '');
      assert.throws(() => tool.execute({ conclusions: [{ key: 'k', text: 'v' }] }, { agent: sub }), /not enabled/);
    }
    const thirdSession = new FakeSession('third-session');
    const thirdAgent = { id: 'third-session', session: thirdSession };
    seedBaseLayer(thirdSession);
    thirdSession.append('user/message', userMsg('Start non-main task'), { surfaceOp: 'append' });
    thirdSession.append('assistant/message', assistantToolCallMsg(1, 1, [{ id: 't-read', name: 'read', args: { file_path: 'big.txt' } }]), { surfaceOp: 'append' });
    thirdSession.append('tool/result', toolResultMsg(1, 1, 't-read', 'W'.repeat(20000)), { surfaceOp: 'append' });
    const thirdDecision = await h.runPreStep(thirdAgent, [], { turn: 1, step: 2 });
    assert.equal(thirdDecision.messages.length, 1, 'non-main top-level session receives focus nudge when allSessions is true');

    // Turning allSessions back off immediately restores LP main-session-only isolation
    saveConfig({ allSessions: false }, h.focusDir);
    assert.equal(options.when({ agent: thirdAgent }), false);
    assert.equal(section.text({ scope: thirdAgent }), '');

    assert.equal(existsSync(join(h.dshHome, 'life-memory')), false, 'must never touch or create life-memory');
  } finally {
    h.cleanup();
  }
});

test('validateFocusConcludeArgs enforces key/text/objective limits and deduplicates repeated keys in call order', () => {
  const res = validateFocusConcludeArgs({
    conclusions: [
      { key: '  dup.key  ', text: 'first' },
      { key: 'other.key', text: 'line1\n\tline2' },
      { key: 'dup.key', text: 'second wins' },
    ],
    objective: '  Next target  ',
  });
  assert.deepEqual(res, {
    entries: [
      { key: 'other.key', text: 'line1\n\tline2' },
      { key: 'dup.key', text: 'second wins' },
    ],
    objective: 'Next target',
  });

  for (const invalid of [
    null,
    {},
    { conclusions: [] },
    { conclusions: Array.from({ length: 33 }, (_, i) => ({ key: `k${i}`, text: 'v' })) },
    { conclusions: [{ key: '   ', text: 'v' }] },
    { conclusions: [{ key: 'bad\nkey', text: 'v' }] },
    { conclusions: [{ key: 'k'.repeat(121), text: 'v' }] },
    { conclusions: [{ key: 'k', text: 'v'.repeat(16001) }] },
    { conclusions: [{ key: 'k', text: 'bad\x00char' }] },
    { conclusions: [{ key: 'k', text: 'v', extra: 1 }] },
    { conclusions: [{ key: 'k', text: 'v' }], objective: 'o'.repeat(8001) },
    { conclusions: [{ key: 'k', text: 'v' }], unknownTop: true },
  ]) {
    assert.throws(() => validateFocusConcludeArgs(invalid), FocusToolArgsError);
  }
});
