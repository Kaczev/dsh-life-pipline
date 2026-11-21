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
    if (Array.isArray(type)) {
      const nodes = this.surface.nodes;
      const { seq, _replaceGen, _contentGen } = this;
      try {
        return type.map(args => this.append(...args));
      } catch (error) {
        this.log.length = seq;
        this._nodes = nodes;
        this._replaceGen = _replaceGen;
        this._contentGen = _contentGen;
        throw error;
      }
    }
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
    const request = session.append('user/message', userMsg('Investigate wake timer and rpc routes'), { surfaceOp: 'append' });
    const prefix = [...baseSeqs, request.seq];
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
    assert.deepEqual(nodesAfterFold1.slice(0, -2), prefix, 'base and user request seqs must stay untouched');
    const [conc1Seq, obj1Seq] = nodesAfterFold1.slice(-2);
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
    assert.deepEqual(nodesAfterFold2.slice(0, -2), [...prefix, conc1Seq], 'base, request and first conclusion must stay untouched');
    const [conc2Seq, obj2Seq] = nodesAfterFold2.slice(-2);
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
    assert.deepEqual(nodesAfterFold3.slice(0, -2), [...prefix, conc1Seq, conc2Seq], 'protected prefix and both earlier conclusions must stay untouched');
    const conc3Event = session.eventAt(nodesAfterFold3.at(-2));
    assert.match(conc3Event.data.content[0].text, /\(retired — no longer needed\)/);
    // Since no new user message arrived in Fold #3 and objective was omitted, it carried forward Objective #2 ('Check client panel')
    const obj3Event = session.eventAt(nodesAfterFold3.at(-1));
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
    const request = session.append('user/message', userMsg('Task part 1'), { surfaceOp: 'append' });
    const prefix = [...baseSeqs, request.seq];
    appendRead(session, 'input-1', 'Raw source for the first three entries.');
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
    assert.deepEqual(preCompactNodes.slice(0, -4), prefix);
    const preservedObjectiveSeq = preCompactNodes.at(-2);
    assert.equal(session.eventAt(preservedObjectiveSeq).data.source.layer, 'objective');
    const preservedTailSeq = tailAsst.seq;

    // Advance clock by 31 minutes (>= idleMinutes=30) and start Turn 2
    const tIdle = h.getNow() + 31 * 60_000;
    h.setNow(tIdle);
    session.setClock(tIdle);
    session.append('turn/start', { turn: 2 });

    await h.runPreStep(agent, [userMsg('Back after break')], { turn: 2, step: 1 });

    const postCompactNodes = session.surface.nodes;
    // 2 conclusion nodes collapsed into 1; baseSeqs, objectiveSeq, and tailAsstSeq preserved verbatim!
    assert.deepEqual(postCompactNodes.slice(0, -3), prefix);
    assert.equal(postCompactNodes.at(-2), preservedObjectiveSeq, 'prompt layer seq must stay untouched by stage B compaction');
    assert.equal(postCompactNodes.at(-1), preservedTailSeq, 'unconverted layer seq must stay untouched by stage B compaction');

    const mergedText = session.eventAt(postCompactNodes.at(-3)).data.content[0].text;
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
    const [emptyConcEvent] = focusEvents(session, 'conclusion');
    assert.equal(focusEvents(session, 'conclusion').length, 1);
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

function appendCheckpoint(session, id, args) {
  const step = session.seq;
  session.append('assistant/message', assistantToolCallMsg(1, step, [{ id, name: FOCUS_TOOL_NAME, args }]), { surfaceOp: 'append' });
  session.append('tool/result', toolResultMsg(1, step, id, 'Recorded'), { surfaceOp: 'append' });
}

function appendRead(session, id, text) {
  const step = session.seq;
  session.append('assistant/message', assistantToolCallMsg(1, step, [{ id, name: 'read', args: { file_path: 'notes.txt' } }]), { surfaceOp: 'append' });
  session.append('tool/result', toolResultMsg(1, step, id, text), { surfaceOp: 'append' });
}

const focusEvents = (session, layer) => session.surface.nodes.map(seq => session.eventAt(seq)).filter(event =>
  event.type === 'user/message' && event.data.source?.kind === FOCUS_SOURCE_KIND && event.data.source.layer === layer);

test('ordinary folds preserve the prefix through the last protected node and consume only later work', async t => {
  const protectedUser = (text, source) => session => session.append('user/message', userMsg(text, source), { surfaceOp: 'append' });
  for (const [name, addBoundary] of [
    ['human request', protectedUser('Keep the original instructions and exclusions', { kind: 'user' })],
    ['chat request', protectedUser('Also review the linked checklist', { kind: 'dsh-lpipe-chat', form: 'notice', channels: ['wechat'] })],
    ['planned wake', protectedUser('Check the nightly results', { kind: 'dsh-lpipe-wake', form: 'notice', wake: 'planned' })],
    ['runtime snapshot', protectedUser('Workspace changed', { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'workspace', text: 'New directory' }] })],
    ['skill catalog', protectedUser('Updated skill catalog', { kind: 'skill-catalog', form: 'catalog', entries: [{ name: 'example', description: 'Example skill' }], update: true })],
    ['agent instructions', protectedUser('Observe the new directory instructions', { kind: 'agent-instructions', form: 'instructions', changes: [{ action: 'set', scope: 'project', path: 'AGENTS.md', digest: 'abc' }] })],
    ['invoked skill', protectedUser('<skill_content name="example">Use the instructions.</skill_content>', { kind: 'skill-invocation', form: 'instructions', name: 'example' })],
    ['developer message', session => session.append('developer/message', { turn: 1, step: 2, message: { ...userMsg('Developer constraints'), role: 'developer' } }, { surfaceOp: 'append' })],
    ['loaded skill in a parallel batch', session => {
      const calls = [{ id: 'skill-1', name: 'skill', args: { name: 'example' } }, { id: 'sibling', name: 'read', args: { file_path: 'notes.txt' } }];
      session.append('assistant/message', assistantToolCallMsg(1, 2, calls), { surfaceOp: 'append' });
      session.append('tool/result', toolResultMsg(1, 2, 'skill-1', '<skill_content name="example">\n<skill_instructions>Full skill instructions</skill_instructions>\n</skill_content>'), { surfaceOp: 'append' });
      session.append('tool/result', toolResultMsg(1, 2, 'sibling', 'Last result in the protected batch'), { surfaceOp: 'append' });
    }],
  ]) {
    await t.test(name, async () => {
      const h = createPluginHarness();
      try {
        const session = new FakeSession();
        const agent = { id: session.id, session };
        seedBaseLayer(session);
        session.append('user/message', userMsg('Inspect the workspace without editing it'), { surfaceOp: 'append' });
        appendRead(session, 'before', 'Work before the boundary stays at its original position');
        addBoundary(session);
        const prefix = session.surface.nodes;
        const time = session.append('user/message', userMsg('Time sampled at step 3', { kind: 'time-context', form: 'snapshot', sections: [{ name: 'time-context', text: 'Time sampled at step 3' }] }), { surfaceOp: 'append' });
        const nudge = session.append('user/message', userMsg('Consider folding', { kind: FOCUS_SOURCE_KIND, form: 'notice', layer: 'nudge' }), { surfaceOp: 'append' });
        appendRead(session, 'after', 'Only this work is consumed');
        const entries = [{ key: 'inspection', text: 'Inspected without editing.' }];
        appendCheckpoint(session, 'fc', { conclusions: entries });
        const consumed = session.surface.nodes.slice(prefix.length);
        await h.runPreStep(agent);
        assert.deepEqual(session.surface.nodes.slice(0, prefix.length), prefix, 'protected prefix must keep its original event seqs and order');
        assert.deepEqual(session.surface.nodes.filter(seq => consumed.includes(seq)), [], `suffix including time ${time.seq} and nudge ${nudge.seq} must fold`);
        assert.deepEqual(focusEvents(session, 'conclusion').map(ev => ev.data.source.entries), [entries]);
      } finally {
        h.cleanup();
      }
    });
  }
});

function replaySession(original) {
  const restored = new FakeSession(original.id);
  for (const { type, time, data, surfaceOp, sourceEventSeqs } of original.snapshotEvents()) {
    restored.setClock(time);
    restored.append(type, data, surfaceOp === undefined ? undefined : { surfaceOp, sourceEventSeqs });
  }
  restored.append('session/end-seed', {});
  assert.deepEqual(restored.surface.nodes, original.surface.nodes, 'seed replay must reconstruct the same visible events');
  return restored;
}

function objectiveText(session) {
  const objective = session.surface.nodes.map(seq => session.eventAt(seq).data).findLast(data =>
    data.source?.kind === FOCUS_SOURCE_KIND && data.content.some(block => block.text?.includes('<current-objective')));
  assert.ok(objective, 'a checkpoint must expose its objective to the model');
  return objective.content.map(block => block.text).join('\n').match(/<current-objective\b[^>]*>([\s\S]*?)<\/current-objective>/)?.[1];
}

test('fold keeps new incoming directions ahead of any stale objective; replay carries a concrete objective through continue', async () => {
  const h = createPluginHarness();
  try {
    const session = new FakeSession();
    const agent = { id: session.id, session };
    seedBaseLayer(session);
    session.append('user/message', userMsg('Audit the release configuration without editing it'), { surfaceOp: 'append' });
    appendCheckpoint(session, 'first', { conclusions: [{ key: 'release', text: 'Build verified' }], objective: 'Check the signing certificate' });
    const suffix = session.append('user/message', userMsg('Use the new staging workspace', { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'workspace', text: 'staging' }] }), { surfaceOp: 'append' });
    const nextUser = userMsg('Instead, check the package license');
    const updatedCatalog = userMsg('New skill available', { kind: 'skill-catalog', form: 'catalog', update: true, entries: [{ name: 'license', description: 'Inspect package licenses' }] });
    const incoming = [nextUser, updatedCatalog];
    const decision = await h.runPreStep(agent, incoming);
    assert.deepEqual(decision.messages, incoming, 'host messages and newer user requests must pass through without a stale appended objective');
    assert.equal(session.surface.nodes.at(-1), suffix.seq, 'already-committed messages after the checkpoint must also retain their place');
    assert.match(objectiveText(session), /Check the signing certificate/);
    for (const message of decision.messages) session.append('user/message', message, { surfaceOp: 'append' });
    appendCheckpoint(session, 'second', { conclusions: [{ key: 'license', text: 'Located package metadata' }] });
    await h.runPreStep(agent);
    assert.match(objectiveText(session), /Instead, check the package license/);

    const restored = replaySession(session);
    const resumed = { id: restored.id, session: restored };
    const logEnd = restored.seq;
    assert.deepEqual((await h.runPreStep(resumed)).messages, []);
    assert.equal(restored.seq, logEnd, 'resume must not re-submit a completed checkpoint');
    const cont = restored.append('user/message', userMsg('continue'), { surfaceOp: 'append' });
    appendRead(restored, 'read-metadata', 'License field exists');
    appendCheckpoint(restored, 'third', { conclusions: [{ key: 'field', text: 'License declared' }] });
    await h.runPreStep(resumed);
    assert.match(objectiveText(restored), /Instead, check the package license/);
    assert.ok(restored.surface.nodes.includes(cont.seq), 'continuation stays verbatim even though it is not the objective');
    assert.deepEqual(focusEvents(restored, 'conclusion').flatMap(ev => ev.data.source.entries.map(entry => entry.key)), ['release', 'license', 'field']);
  } finally {
    h.cleanup();
  }
});

test('resume wording keeps a specific objective but a new restriction takes precedence', async () => {
  const h = createPluginHarness();
  try {
    const session = new FakeSession();
    const agent = { id: session.id, session };
    seedBaseLayer(session);
    const user = text => session.append('user/message', userMsg(text), { surfaceOp: 'append' }).seq;
    const checkpoint = async (id, objective) => {
      appendCheckpoint(session, id, { conclusions: [{ key: id, text: 'Checked.' }], objective });
      await h.runPreStep(agent);
      return objectiveText(session);
    };
    const request = user('核对两个发布包的许可证');
    assert.match(await checkpoint('a', '检查整合包的许可证'), /检查整合包的许可证/);
    const resume = user('噢，我知道原因了。没事，继续原本的工作就好。');
    assert.match(await checkpoint('b', 'continue'), /检查整合包的许可证/);
    const redirect = user('继续检查许可证，不要发布。');
    assert.match(await checkpoint('c', '现在发布'), /继续检查许可证，不要发布/);
    assert.deepEqual(session.surface.nodes.filter(seq => [request, resume, redirect].includes(seq)), [request, resume, redirect]);
  } finally {
    h.cleanup();
  }
});

test('separated conclusion runs resolve updates and retirements globally without replacing protected messages', async t => {
  for (const mode of ['idle', 'threshold']) {
    await t.test(mode, async () => {
      const h = createPluginHarness();
      try {
        saveConfig({ idleMinutes: 5, nudgeChars: 24000, compactChars: 32000, maxConclusionChars: 4000 }, h.focusDir);
        const session = new FakeSession();
        const agent = { id: session.id, session };
        seedBaseLayer(session);
        const appendUser = (text, source) => session.append('user/message', userMsg(text, source), { surfaceOp: 'append' }).seq;
        const first = appendUser('Analyze packaging');
        appendRead(session, 'inputs', 'package inputs');
        appendCheckpoint(session, 'a', { conclusions: [{ key: 'kept', text: 'Only in early run' }, { key: 'updated', text: 'Obsolete' }, { key: 'retired', text: 'Remove me' }] });
        await h.runPreStep(agent);
        const early = focusEvents(session, 'conclusion')[0].seq;
        const second = appendUser('Audit the new manifest');
        const instructions = appendUser('Do not edit the manifest', { kind: 'agent-instructions', form: 'instructions', changes: [{ action: 'set', scope: 'project', path: 'AGENTS.md', digest: 'new' }] });
        appendRead(session, 'manifest', 'new manifest');
        appendCheckpoint(session, 'b', { conclusions: [{ key: 'updated', text: 'Current' }, { key: 'retired', text: '' }, { key: 'new', text: 'Only in later run' }] });
        await h.runPreStep(agent);
        assert.equal(focusEvents(session, 'conclusion')[0].seq, early, 'ordinary fold must preserve the first run');
        const tail = session.append('assistant/message', assistantTextMsg(1, 5, 'Awaiting review'), { surfaceOp: 'append' });
        const identities = [first, second, instructions, tail.seq];
        if (mode === 'idle') h.setNow(h.getNow() + 6 * 60000);
        const incoming = mode === 'threshold' ? [userMsg('Z'.repeat(33000))] : [];
        await h.runPreStep(agent, incoming);
        assert.deepEqual(session.surface.nodes.filter(seq => identities.includes(seq)), identities);
        const active = focusEvents(session, 'conclusion').flatMap(ev => ev.data.source.entries);
        assert.deepEqual(active, [{ key: 'kept', text: 'Only in early run' }, { key: 'updated', text: 'Current' }, { key: 'new', text: 'Only in later run' }]);
        assert.match(objectiveText(session), /Audit the new manifest/);
        const restored = replaySession(session);
        const logEnd = restored.seq;
        await h.runPreStep({ id: restored.id, session: restored }, incoming);
        assert.equal(restored.seq, logEnd, 'rechecking the clean state after replay must not submit another rewrite');
      } finally {
        h.cleanup();
      }
    });
  }
});

test('only idle or completed host compaction can retire superseded snapshots', async t => {
  for (const mode of ['chars', 'idle', 'open', 'failed', 'success']) {
    await t.test(mode, async () => {
      const h = createPluginHarness();
      try {
        const session = new FakeSession();
        const agent = { id: session.id, session };
        const append = (text, source) => session.append('user/message', userMsg(text, source), { surfaceOp: 'append' }).seq;
        const runtime = text => append(text, { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'cwd', text }] });
        const catalog = (name, incomplete = false) => append(name, { kind: 'skill-catalog', form: 'catalog', entries: [{ name, description: name }], incomplete });
        seedBaseLayer(session);
        const human = append('Preserve the original request', { kind: 'user' });
        const old = runtime('A');
        const current = runtime('B');
        const full = catalog('full');
        const partial = catalog('partial', true);
        session.append('assistant/message', assistantTextMsg(1, 1, 'Acknowledged'), { surfaceOp: 'append' });
        if (mode === 'idle') h.setNow(h.getNow() + 61 * 60000);
        if (['open', 'failed', 'success'].includes(mode)) {
          session.append('compaction/start', { compactionId: 'boundary', turn: 1 });
          if (mode !== 'open') session.append('compaction/end', { compactionId: 'boundary', turn: 1, ...(mode === 'failed' ? { error: { message: 'cancelled' } } : {}) });
        }
        const incoming = mode === 'chars' ? [userMsg('Z'.repeat(DEFAULT_CONFIG.compactChars))] : [];
        await h.runPreStep(agent, incoming);
        const cleaned = mode === 'idle' || mode === 'success';
        assert.equal(session.surface.nodes.includes(old), !cleaned, 'char threshold, active lock and failed compaction must not clean up old snapshots');
        for (const seq of [human, current, full, partial]) assert.ok(session.surface.nodes.includes(seq));
        if (mode === 'success') {
          const post1 = runtime('post-compaction C');
          const post2 = runtime('post-compaction D');
          const gen = session.surface.replaceGeneration;
          await h.runPreStep(agent);
          assert.equal(session.surface.replaceGeneration, gen, 'the same completed transaction cannot authorize cleanup of later records');
          for (const seq of [post1, post2]) assert.ok(session.surface.nodes.includes(seq));
        }
      } finally {
        h.cleanup();
      }
    });
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
