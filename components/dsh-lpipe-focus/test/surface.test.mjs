import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { configPath } from 'dsh-life-core/internal/paths';
import { apply } from '../src/index.js';
import { DEFAULT_CONFIG, saveConfig } from '../src/config.mjs';
import { FOCUS_SOURCE_KIND } from '../src/render.mjs';
import { FOCUS_TOOL_NAME, FocusToolArgsError, validateFocusEquateArgs } from '../src/tools.mjs';

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

  const owners = new WeakMap();
  const ctx = {
    subagents: { rootOf(agent) {
      if (owners.has(agent)) return owners.get(agent);
      if (agent.session?.header?.origin === 'subagent' || agent.options?.subagentDepth) throw Error('not managed');
      return agent;
    } },
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
    owners,
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

test('parallel sibling tool calls with focus_equate are hard-rejected and never fold the surface', async () => {
  const h = createPluginHarness();
  try {
    const session = new FakeSession('main-session');
    const agent = { id: 'main-session', session };
    seedBaseLayer(session);
    session.append('user/message', userMsg('Read file and conclude at once'), { surfaceOp: 'append' });

    // Assistant emits both `read` and `focus_equate` in the same message
    const fcArgs = { key: 'bad-parallel', supersedes: [], conclusions: point('should reject') };
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

    // Log sibling success and focus_equate error result
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

test('unconverted nudge triggers without percentages, throttles repeats by half-step, and is shadowed upon folding', async () => {
  const h = createPluginHarness();
  try {
    saveConfig({
      idleMinutes: 60,
      compactChars: 200000,
      nudgeChars: 20000,
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
    assert.match(nudgeMsg.content[0].text, /Consider whether this is a good time to fold\./);
    assert.match(d3.messages[0].content[0].text, /Look for a natural stopping point to fold\./);
    const requestText = 'Unfolded context exceeds the reminder threshold. Call `focus_equate` at the next suitable opportunity. Going forward, fold at natural stopping points without waiting for a reminder.';
    for (const turn of [2, 3]) {
      const request = userMsg('Continue');
      const decision = await h.runPreStep(agent, [request], { turn, step: 1 });
      assert.equal(decision.messages.length, 2);
      assert.ok(decision.messages[1].content[0].text.includes(requestText));
    }
    const nudgeEvent2 = session.append('user/message', d3.messages[0], { surfaceOp: 'append' });

    // Step 5: model calls focus_equate -> both nudges in unconverted layer are shadowed and gone from surface.nodes
    const fcArgs = { key: 'search-done', supersedes: [], conclusions: point('Summarized huge, small, and more files.') };
    session.append('assistant/message', assistantToolCallMsg(1, 4, [{ id: 'fc-clean', name: FOCUS_TOOL_NAME, args: fcArgs }]), { surfaceOp: 'append' });
    session.append('tool/result', toolResultMsg(1, 4, 'fc-clean', 'ok'), { surfaceOp: 'append' });

    await h.runPreStep(agent, [], { turn: 1, step: 5 });
    assert.equal(session.surface.nodes.includes(nudgeEvent.seq), false, 'first nudge must be shadowed after fold');
    assert.equal(session.surface.nodes.includes(nudgeEvent2.seq), false, 'second nudge must be shadowed after fold');
  } finally {
    h.cleanup();
  }
});

test('nudge counts unfinished work across turns and replay, pacing reminders until a successful fold', async () => {
  const h = createPluginHarness();
  try {
    saveConfig({ nudgeChars: 20000 }, h.focusDir);
    let session = new FakeSession();
    const append = (type, data) => session.append(type, data, { surfaceOp: 'append' });
    const check = (turn, messages = []) => h.runPreStep({ id: session.id, session }, messages, { turn, step: 1 });
    const work = (turn, size) => append('assistant/message', assistantTextMsg(turn, 1, 'x'.repeat(size)));
    seedBaseLayer(session);
    append('user/message', userMsg('Inspect the first part'));
    work(1, 10000);
    const largeRequest = userMsg('u'.repeat(30000));
    assert.deepEqual((await check(1, [largeRequest])).messages, [largeRequest], 'incoming user bytes do not advance the reminder meter');
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    session.append('turn/start', { turn: 2 });
    append('user/message', largeRequest);
    append('assistant/message', assistantToolCallMsg(2, 1, [{ id: 'skill', name: 'skill', args: { name: 'example' } }]));
    append('tool/result', toolResultMsg(2, 1, 'skill', 's'.repeat(30000)));
    const head = session.surface.nodes[0];
    work(2, 9999);
    assert.deepEqual((await check(2)).messages, [], 'user and skill bytes neither add to nor erase work');
    work(2, 1);
    session = replaySession(session);
    const first = (await check(2)).messages;
    assert.equal(first.length, 1, 'two subthreshold turns reach the threshold together');
    assert.equal(first[0].source.layer, 'nudge');
    assert.match(first[0].content[0].text, /Unfolded context has reached the reminder threshold\./);
    assert.deepEqual((await check(2, first)).messages, first, 'do not double-inject an incoming nudge');
    append('user/message', first[0]);
    work(2, 6000);
    append('user/message', userMsg('Continue'));
    work(3, 3999);
    session = replaySession(session);
    assert.deepEqual((await check(3)).messages, [], 'replay remembers previous nudge and cross-turn growth');
    work(3, 1);
    const repeat = (await check(3)).messages;
    assert.equal(repeat.length, 1, 'repeat at exactly half a threshold of new work');
    append('user/message', repeat[0]);
    appendCheckpoint(session, 'across-turns', { key: 'both-parts', supersedes: [], conclusions: point('Both parts checked.') });
    assert.deepEqual((await check(3)).messages, [], 'successful fold starts a fresh reminder interval');
    const [conclusion] = focusEvents(session, 'equivalence');
    assert.deepEqual(session.surface.nodes, [head, conclusion.seq], 'the whole skill batch folds with earlier work, continue and both nudges');
    session = replaySession(session);
    work(4, 19999);
    assert.deepEqual((await check(4)).messages, [], 'pre-fold work and nudges stay out after resume');
    work(4, 1);
    assert.equal((await check(4)).messages[0]?.source.layer, 'nudge');
  } finally {
    h.cleanup();
  }
});

test('active compaction lock avoidance, stale pre-seed lock handling, and strict LP main-session isolation', async () => {
  const h = createPluginHarness();
  try {
    saveConfig({ ...DEFAULT_CONFIG, nudgeChars: 16000, compactChars: 64000 }, h.focusDir);

    const session = new FakeSession('main-session');
    const mainAgent = { id: 'main-session', session };
    const otherSession = new FakeSession('other-session');
    const otherAgent = { id: 'other-session', session: otherSession };
    const childSession = Object.assign(new FakeSession('subagent-1'), { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'main-session' } });
    const childAgent = { id: childSession.id, session: childSession };
    const grandchild = { id: 'grandchild', session: new FakeSession('grandchild') };
    h.owners.set(childAgent, mainAgent);
    h.owners.set(grandchild, mainAgent);

    // Tool visibility & execution gate + prompt section isolation
    const { tool, options } = h.registeredTools.get(FOCUS_TOOL_NAME);
    assert.equal(options.when({ agent: mainAgent }), true);
    assert.equal(options.when({ agent: otherAgent }), false);
    assert.equal(options.when({ agent: childAgent }), true);
    assert.equal(options.when({ agent: grandchild }), true);
    assert.match(h.sections[0].text({ scope: grandchild }), /focus_equate/);
    seedBaseLayer(grandchild.session);
    appendSurface(grandchild.session, 'user/message', userMsg('Inspect the nested task.'));
    appendSurface(grandchild.session, 'assistant/message', assistantToolCallMsg(1, 1, [{ id: 'nested-read', name: 'read', args: {} }]));
    appendSurface(grandchild.session, 'tool/result', toolResultMsg(1, 1, 'nested-read', 'x'.repeat(20000)));
    assert.equal((await h.runPreStep(grandchild)).messages[0]?.source?.layer, 'nudge');
    assert.throws(() => tool.execute({ key: 'k', supersedes: [], conclusions: point('v') }, { agent: otherAgent }), /not enabled/);

    const section = h.sections[0];
    assert.equal(section.name, 'dsh-lpipe-focus');
    assert.equal(section.order, 712);
    assert.equal(section.interpolate, false);
    assert.match(section.text({ scope: mainAgent }), /focus_equate/);
    assert.equal(section.text({ scope: otherAgent }), '');
    assert.match(section.text({ scope: childAgent }), /focus_equate/);
    assert.equal((await tool.execute({ key: 'child-check', supersedes: [], conclusions: point('OK') }, { agent: childAgent })).key, 'child-check');

    // Non-main session does not fold or nudge
    seedBaseLayer(otherSession);
    otherSession.append('user/message', userMsg('X'.repeat(25000)), { surfaceOp: 'append' });
    const otherDecision = await h.runPreStep(otherAgent, [], { turn: 1, step: 1 });
    assert.equal(otherDecision.messages.length, 0);

    // Active compaction lock on main session skips surface rewrite
    seedBaseLayer(session);
    session.append('user/message', userMsg('Work item'), { surfaceOp: 'append' });
    const fcArgs = { key: 'lock-test', supersedes: [], conclusions: point('val1') };
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
    assert.match(section.text({ scope: otherAgent }), /focus_equate/);

    assert.equal(options.when({ agent: childAgent }), false, 'child follows the rebound main session');
    // Turning subagent inheritance off leaves the all-top-level setting independent.
    saveConfig({ allSessions: true }, h.focusDir);
    assert.equal(options.when({ agent: mainAgent }), true, 'former main session now admitted via allSessions');
    assert.equal(options.when({ agent: otherAgent }), true);
    assert.match(section.text({ scope: mainAgent }), /focus_equate/);
    assert.equal(options.when({ agent: childAgent }), true);
    const unmanaged = { ...childAgent, session: childSession };
    assert.equal(options.when({ agent: unmanaged }), false, 'matching ids are not proof of ownership');
    saveConfig({ includeSubagents: false }, h.focusDir);
    assert.equal((await h.runPreStep(grandchild, [userMsg('x'.repeat(20000))])).messages.length, 1);
    for (const sub of [
      childAgent, grandchild,
      { id: 'spawn-sub', options: { subagentDepth: 1 }, session: new FakeSession('spawn-sub') },
      { id: 'resumed-sub', session: Object.assign(new FakeSession('resumed-sub'), { header: { origin: 'subagent', delegationDepth: 1 } }) },
    ]) {
      assert.equal(options.when({ agent: sub }), false, 'subagent must stay isolated even when allSessions is true');
      assert.equal(section.text({ scope: sub }), '');
      assert.throws(() => tool.execute({ key: 'k', supersedes: [], conclusions: point('v') }, { agent: sub }), /not enabled/);
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

function fixture(t, config) {
  const h = createPluginHarness();
  t.after(h.cleanup);
  if (config) saveConfig(config, h.focusDir);
  const session = new FakeSession();
  const agent = { id: session.id, session };
  const check = (incoming = []) => h.runPreStep(agent, incoming);
  const applyLayer = async args => {
    appendCheckpoint(session, args.key, args);
    return check();
  };
  return { h, session, agent, check, applyLayer };
}

const point = content => [{ content }];
const detailList = value => typeof value === 'string' ? point(value) : value;
const listFields = ['definitions', 'experience', 'conclusions', 'guidance', 'work_done', 'todos', 'next'];
const layer = (key, conclusions, extra = {}) => Object.fromEntries(Object.entries({ key, supersedes: [], conclusions, ...extra })
  .map(([field, value]) => [field, listFields.includes(field) ? detailList(value) : value]));
const appendSurface = (session, type, data) => session.append(type, data, { surfaceOp: 'append' });
const textOf = event => event.data.content.map(block => block.text).join('\n');

function assertLayer(event, { todos, next, ...expected }) {
  assert.ok(event, `expected an equivalence layer for ${expected.key}`);
  const { kind, layer: name, createdAt, ...fields } = event.data.source;
  assert.equal(kind, FOCUS_SOURCE_KIND);
  assert.equal(name, 'equivalence');
  assert.deepEqual(fields, expected, 'only durable fields belong in the layer source');
  const text = textOf(event);
  assert.ok(text.startsWith(`<equivalence key="${expected.key}">\n`) && text.endsWith('\n</equivalence>'));
  const sections = [['definitions', 'Definitions'], ['experience', 'Experience'], ['guidance', 'Guidance'], ['conclusions', 'Conclusions'], ['work_done', 'Work done']];
  const expectedLines = [`<equivalence key="${expected.key}">`];
  if (expected.supersedes.length) expectedLines.push(`Supersedes: ${expected.supersedes.join(', ')}`);
  for (const [field, label] of sections) {
    if (!expected[field]?.length) continue;
    if (expectedLines.length > 1) expectedLines.push('');
    expectedLines.push(`## ${label}`, '');
    for (const { content, known, unknown } of expected[field]) {
      expectedLines.push(`- ${content.replaceAll('\n', '\n  ')}`);
      if (known) expectedLines.push(`  - Known: ${known.replaceAll('\n', '\n    ')}`);
      if (unknown) expectedLines.push(`  - Unknown: ${unknown.replaceAll('\n', '\n    ')}`);
    }
  }
  expectedLines.push('</equivalence>');
  assert.equal(text, expectedLines.join('\n'), 'sections and their entries render in order');
  if (next) for (const entry of next) assert.ok(!text.includes(entry.content), 'next is never part of the durable equivalence layer');
}

test('complete tail folds across turns, chat, host updates, skill and parallel results; next remains a separate disposable hint', async t => {
  const { h, session, agent, check } = fixture(t);
  assert.equal(h.preStepListeners[0].opts?.prepend, true);
  const [system] = seedBaseLayer(session);
  const post = (text, source) => appendSurface(session, 'user/message', userMsg(text, source));
  post('Audit both packages. Do not edit or publish.');
  appendRead(session, 'manifest', 'Raw package metadata');
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
  session.append('turn/start', { turn: 2 });
  post('Editor: v2.4 is in staging.', { kind: 'dsh-lpipe-chat', form: 'notice', channels: ['wechat'] });
  post('Check release state', { kind: 'dsh-lpipe-wake', form: 'notice', wake: 'planned' });
  post('Workspace changed', { kind: 'runtime-context', form: 'snapshot', sections: [] });
  post('Updated catalog', { kind: 'skill-catalog', form: 'catalog', entries: [], update: true });
  post('Do not publish', { kind: 'agent-instructions', form: 'instructions', changes: [] });
  post('Skill instructions', { kind: 'skill-invocation', form: 'instructions', name: 'audit' });
  post('Sampled time', { kind: 'time-context', form: 'snapshot', sections: [] });
  const declarations = [{ name: 'audit', description: 'Check the release.', parameters: { type: 'object' } }];
  const header = session.append('request/header', { header: { tools: declarations }, reason: 'change' });
  session.requestHeader = () => header.data.header;
  session.toolHistory = () => ({ tools: declarations, updates: [] });
  appendSurface(session, 'developer/message', {
    turn: 2, step: 1, headerSeq: header.seq,
    message: { id: randomUUID(), role: 'developer', source: { kind: 'tool-registry' }, content: [
      { type: 'tool-removal', toolName: 'old-audit' }, { type: 'tool-addition', toolName: 'audit' },
    ] },
  });
  appendSurface(session, 'developer/message', { turn: 2, step: 1,
    message: { ...userMsg('Preserve the audit scope.', { kind: 'app-context' }), role: 'developer' } });
  const snapshot = post('Earlier settings', { kind: 'dsh-lpipe-memory/settings' });
  session.append('developer/message', { turn: 2, step: 1,
    message: { id: randomUUID(), role: 'developer', source: snapshot.data.source, content: [] } },
  { surfaceOp: { op: 'replace', startSeq: snapshot.seq, endSeq: snapshot.seq }, sourceEventSeqs: [snapshot.seq] });
  post('Consider a checkpoint', { kind: FOCUS_SOURCE_KIND, layer: 'nudge', form: 'notice' });
  const calls = [{ id: 'load-skill', name: 'skill', args: { name: 'audit' } }, { id: 'sibling', name: 'read', args: { file_path: 'input' } }];
  appendSurface(session, 'assistant/message', assistantToolCallMsg(2, 1, calls));
  appendSurface(session, 'tool/result', toolResultMsg(2, 1, 'sibling', 'Package input'));
  appendSurface(session, 'tool/result', toolResultMsg(2, 1, 'load-skill', 'Read-only audit instructions'));
  post('Continue');
  const a = layer('release-audit', point('The user authorized a read-only audit of both packages; no publication. The editor reports v2.4 is in staging; this is unverified.'), { work_done: 'Compared both manifests.', next: 'Inspect the signing certificates.' });
  const tool = h.registeredTools.get(FOCUS_TOOL_NAME).tool;
  appendSurface(session, 'assistant/message', assistantToolCallMsg(2, 2, [{ id: 'first', name: FOCUS_TOOL_NAME, args: a }]));
  const output = await tool.execute(a, { agent });
  appendSurface(session, 'tool/result', toolResultMsg(2, 2, 'first', output.summary));
  const consumed = session.surface.nodes.slice(1);
  const incoming = [userMsg('Start with the integration package.')];
  assert.deepEqual((await check(incoming)).messages, incoming, 'uncommitted directions keep their place');
  const [first] = focusEvents(session, 'equivalence');
  const [hint] = focusEvents(session, 'objective');
  assertLayer(first, a);
  assert.equal(hint.data.source.origin, 'model');
  assert.ok(textOf(hint).includes(a.next[0].content));
  assert.deepEqual(session.surface.nodes, [system, first.seq, hint.seq]);
  assert.deepEqual([...first.sourceEventSeqs, ...(hint.sourceEventSeqs ?? [])].filter(seq => consumed.includes(seq)).sort((a, b) => a - b), consumed, 'every original tail node is shadowed');

  const restored = replaySession(session);
  const resume = () => h.runPreStep({ id: restored.id, session: restored });
  const end = restored.seq;
  await resume();
  assert.equal(restored.seq, end, 'replaying a successful checkpoint never repeats it');
  appendSurface(restored, 'user/message', userMsg('Check licenses instead.'));
  const b = layer('package-licenses', point('Both packages declare MIT.'));
  appendCheckpoint(restored, 'second', b);
  await resume();
  const [, second] = focusEvents(restored, 'equivalence');
  assertLayer(second, b);
  assert.deepEqual(restored.surface.nodes, [system, first.seq, second.seq], 'the first layer stays verbatim; its next and the redirect fold with the work');
  assert.ok(!textOf(second).includes(a.next[0].content));
  assert.equal(focusEvents(restored, 'objective').length, 0, 'an omitted next is never inferred or carried');
});

test('todo checkpoint keeps its surface range when newer surface context follows it', async t => {
  const { h, session, check } = fixture(t);
  const head = appendSurface(session, 'system/message', sysMsg());
  const args = layer('todo-checkpoint-followed', 'Captured the ongoing review.', {
    todos: point('Review the remaining files.'), next: point('Inspect the next file.'),
  });
  appendCheckpoint(session, 'todo-followed', args);
  const followup = appendSurface(session, 'user/message', userMsg('Also verify the changelog.'));
  const before = session.surface.nodes;
  const endSeq = session.seq;
  await check();
  assert.deepEqual(session.surface.nodes, before, 'new todos and next must not replace or move newer surface context');
  assert.equal(session.seq, endSeq, 'unsafe non-tail checkpoint waits for a future fold');
  assert.equal(focusEvents(session, 'equivalence').length, 0);
  assert.equal(session.eventAt(followup.seq).data.content[0].text, 'Also verify the changelog.');
  assert.ok(session.surface.nodes.includes(head.seq));
});

test('a tail todo checkpoint emits its equivalence, current todo and next in one append batch', async t => {
  const { h, session, applyLayer } = fixture(t);
  const head = appendSurface(session, 'system/message', sysMsg());
  const args = layer('todo-tail', 'The work remains underway.', {
    todos: point('Review the remaining files.'), next: point('Inspect the next file.'),
  });
  let batch;
  const append = session.append.bind(session);
  session.append = function (type, data, opts) {
    if (Array.isArray(type)) batch = type;
    return append(type, data, opts);
  };
  await applyLayer(args);
  assert.ok(Array.isArray(batch), 'tail extras must be committed with a single native append batch');
  assert.deepEqual(batch.map(([type, , opts]) => [type, opts.surfaceOp]), [
    ['user/message', { op: 'replace', startSeq: 1, endSeq: 1 }],
    ['user/message', { op: 'replace', startSeq: 2, endSeq: 2 }],
    ['user/message', 'append'],
  ]);
  const [equivalence] = focusEvents(session, 'equivalence');
  const [todo] = focusEvents(session, 'todos');
  const [next] = focusEvents(session, 'objective');
  assertLayer(equivalence, args);
  assert.deepEqual(todo.data.source.entries, args.todos);
  assert.equal(textOf(todo), `<current-todos>\n${todo.data.source.rawText}\n</current-todos>`);
  assert.equal(next.data.source.layer, 'objective');
  assert.deepEqual(next.data.source.entries, args.next);
  assert.deepEqual(session.surface.nodes, [head.seq, equivalence.seq, todo.seq, next.seq]);
});

test('a checkpoint with no preceding ordinary work can emit next without protecting it', async t => {
  const { session, applyLayer } = fixture(t);
  const head = appendSurface(session, 'system/message', sysMsg());
  const firstArgs = layer('package-scope', 'Read-only audit.', { next: point('Read the manifest.') });
  await applyLayer(firstArgs);
  const [first] = focusEvents(session, 'equivalence');
  const [next] = focusEvents(session, 'objective');
  assertLayer(first, firstArgs);
  assert.deepEqual(session.surface.nodes, [head.seq, first.seq, next.seq]);
  assert.ok(textOf(next).includes(firstArgs.next[0].content));
  const secondArgs = layer('license', 'The manifest declares MIT.');
  await applyLayer(secondArgs);
  const [, second] = focusEvents(session, 'equivalence');
  assertLayer(second, secondArgs);
  assert.deepEqual(session.surface.nodes, [head.seq, first.seq, second.seq]);
});

test('an unsafe span is left untouched, not partially folded after the obstacle', async t => {
  for (const [name, obstacle] of [
    ['later system instructions', s => appendSurface(s, 'system/message', sysMsg('New system instructions'))],
    ['tool update without independent schemas', s => appendSurface(s, 'developer/message', { turn: 1, step: 3, message: { id: randomUUID(), role: 'developer', source: { kind: 'tool-registry' }, content: [{ type: 'tool-removal', toolName: 'audit' }] } })],
    ['missing sibling result', s => {
      appendSurface(s, 'assistant/message', assistantToolCallMsg(1, 3, [{ id: 'a', name: 'read', args: {} }, { id: 'b', name: 'skill', args: {} }]));
      appendSurface(s, 'tool/result', toolResultMsg(1, 3, 'a', 'Only one result'));
    }],
    ['result with wrong call ID', s => {
      appendSurface(s, 'assistant/message', assistantToolCallMsg(1, 3, [{ id: 'a', name: 'read', args: {} }]));
      appendSurface(s, 'tool/result', toolResultMsg(1, 3, 'other', 'Not its result'));
    }],
    ['result from a different step', s => {
      appendSurface(s, 'assistant/message', assistantToolCallMsg(1, 3, [{ id: 'a', name: 'read', args: {} }]));
      appendSurface(s, 'tool/result', toolResultMsg(1, 4, 'a', 'Unrelated step'));
    }],
    ['orphan result', s => appendSurface(s, 'tool/result', toolResultMsg(1, 3, 'unknown', 'Orphan'))],
  ]) {
    await t.test(name, async t => {
      const { session, check } = fixture(t);
      seedBaseLayer(session);
      appendRead(session, 'before', 'Must not be stranded.');
      obstacle(session);
      appendRead(session, 'after', 'Must not be replaced either.');
      appendCheckpoint(session, 'blocked', layer('blocked', 'Do not apply.'));
      const nodes = session.surface.nodes;
      const seq = session.seq;
      await check();
      assert.deepEqual(session.surface.nodes, nodes);
      assert.equal(session.seq, seq, 'no replacements, even an empty placeholder');
    });
  }
});

test('pending, failed, interrupted and invalid checkpoints never authorize a fold on replay', async t => {
  for (const mode of ['pending', 'failed', 'interrupted', 'invalid']) {
    await t.test(mode, async t => {
      const { h, session } = fixture(t);
      seedBaseLayer(session);
      appendRead(session, 'raw', 'This evidence must remain available.');
      const args = mode === 'invalid' ? { conclusions: [{ key: 'legacy', text: 'not accepted' }] } : layer('review', 'Checked the evidence.');
      const call = assistantToolCallMsg(1, 3, [{ id: 'review', name: FOCUS_TOOL_NAME, args }]);
      if (mode === 'interrupted') call.interrupted = true;
      appendSurface(session, 'assistant/message', call);
      if (mode !== 'pending') appendSurface(session, 'tool/result', toolResultMsg(1, 3, 'review', mode, mode === 'failed'));
      const restored = replaySession(session);
      const agent = { id: restored.id, session: restored };
      const end = restored.seq;
      await h.runPreStep(agent);
      assert.deepEqual(restored.surface.nodes, session.surface.nodes);
      assert.equal(restored.seq, end);
      if (mode === 'pending') {
        appendSurface(restored, 'tool/result', toolResultMsg(1, 3, 'review', 'Recorded'));
        await h.runPreStep(agent);
        assertLayer(focusEvents(restored, 'equivalence')[0], args);
      }
    });
  }
});

test('a completed checkpoint before a later committed direction and open batch preserves both', async t => {
  const { h, session } = fixture(t);
  const [head] = seedBaseLayer(session);
  appendRead(session, 'search', 'Located the manifest.');
  const args = layer('manifest-file', 'The manifest is in packages/core.', { next: point('Read its metadata.') });
  appendCheckpoint(session, 'manifest', args);
  const redirect = appendSurface(session, 'user/message', userMsg('Inspect its license first.'));
  const open = appendSurface(session, 'assistant/message', assistantToolCallMsg(2, 1, [{ id: 'later', name: 'read', args: { file_path: 'LICENSE' } }]));
  const restored = replaySession(session);
  await h.runPreStep({ id: restored.id, session: restored });
  const [conclusion] = focusEvents(restored, 'equivalence');
  const [hint] = focusEvents(restored, 'objective');
  assertLayer(conclusion, args);
  assert.deepEqual(restored.surface.nodes, [head, conclusion.seq, hint.seq, redirect.seq, open.seq]);
  assert.deepEqual(restored.eventAt(redirect.seq), redirect);
  assert.deepEqual(restored.eventAt(open.seq), open);
});

test('consecutive pending checkpoints retain both durable layers but only the latest todo and next on replay', async t => {
  const { h, session } = fixture(t);
  const [head] = seedBaseLayer(session);
  const pending = [{ content: 'Review the license.', known: 'Manifest is available.', unknown: 'License version.' }, { content: 'Report to the user.' }];
  const a = layer('package-location', 'The manifest is under packages/core.', { todos: pending, next: point('Inspect the license.') });
  const b = { key: 'license-scope', supersedes: [], guidance: point('The user requires a read-only license review.'),
    next: [{ content: 'Verify the license notice.', known: 'Read-only review.' }, { content: 'Compare it with the manifest.' }] };
  appendCheckpoint(session, 'location', a);
  appendCheckpoint(session, 'license-review', b);
  const restored = replaySession(session);
  const agent = { id: restored.id, session: restored };
  await h.runPreStep(agent);
  const [first, second] = focusEvents(restored, 'equivalence');
  assertLayer(first, a);
  assertLayer(second, b);
  const [todo] = focusEvents(restored, 'todos');
  const [next] = focusEvents(restored, 'objective');
  assert.deepEqual(todo.data.source.entries, a.todos, 'the second checkpoint omits todos');
  assert.deepEqual(next.data.source.entries, b.next);
  assert.match(todo.data.source.rawText, /Review the license\./);
  assert.match(next.data.source.rawText, /Verify the license notice\./);
  assert.deepEqual(restored.surface.nodes, [head, first.seq, second.seq, todo.seq, next.seq]);
  const replay = replaySession(restored);
  const resumed = { id: replay.id, session: replay };
  const end = replay.seq;
  await h.runPreStep(resumed);
  assert.equal(replay.seq, end, 'replay does not fold either checkpoint again');

  const clear = layer('license-reviewed', 'The license notice is verified.', { todos: [] });
  appendCheckpoint(replay, 'done', clear);
  await h.runPreStep(resumed);
  const last = focusEvents(replay, 'equivalence').at(-1);
  assertLayer(last, clear);
  assert.deepEqual(replay.surface.nodes, [head, first.seq, second.seq, last.seq], 'a clear removes both prompts');
});

function readFoldDiagnostics(h) {
  return readFileSync(join(h.focusDir, 'focus.jsonl'), 'utf8').trimEnd().split('\n')
    .map(line => JSON.parse(line)).filter(entry => entry.event === 'folded');
}

test('folded diagnostics preserve original arguments in batch order without changing the surface', async t => {
  const { h, session, check } = fixture(t);
  seedBaseLayer(session);
  const a = layer('assistant-args', '  assistant finding\n', {
    work_done: point(' read both files '), next: point(' earlier hint '),
  });
  const b = layer('trace-args', '\ntrace finding\t', { supersedes: [a.key], next: [], definitions: point(' exact term ') });
  const addTraced = (id, assistantArgs, traceArgs) => {
    const step = session.seq;
    appendSurface(session, 'assistant/message', assistantToolCallMsg(1, step, [{ id, name: FOCUS_TOOL_NAME, args: assistantArgs }]));
    session.append('tool/call', { turn: 1, step, callId: id, name: FOCUS_TOOL_NAME, arguments: traceArgs });
    appendSurface(session, 'tool/result', toolResultMsg(1, step, id, 'Recorded'));
  };
  addTraced('first', a, { ...a, conclusions: point('assistant finding') });
  addTraced('second', undefined, b);
  await check();
  await check();
  const rows = readFoldDiagnostics(h);
  assert.equal(rows.length, 1, 'a second pre-step must not duplicate the success');
  assert.deepEqual(rows[0].keys, [a.key, b.key]);
  assert.deepEqual(rows[0].equateArgs, [a, b]);
  const [first, second] = focusEvents(session, 'equivalence');
  assertLayer(first, layer(a.key, 'assistant finding', { work_done: 'read both files' }));
  assertLayer(second, layer(b.key, 'trace finding', { supersedes: [a.key], definitions: 'exact term' }));
  assert.deepEqual(focusEvents(session, 'objective'), []);
});

test('a folded diagnostic exceeding the UTF-8 rolling budget is readable as one complete row', async t => {
  const { h, session, applyLayer } = fixture(t);
  seedBaseLayer(session);
  const args = layer('oversize-audit', 'Verified.', { work_done: '\u3000'.repeat(700000) + ' done ' });
  assert.ok(Buffer.byteLength(args.work_done[0].content, 'utf8') > 2 * 1024 * 1024);
  await applyLayer(args);
  const rows = readFoldDiagnostics(h);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].equateArgs, [args]);
  assertLayer(focusEvents(session, 'equivalence')[0], layer(args.key, 'Verified.', { work_done: 'done' }));
});

test('a changed definition keeps both meanings in order until a later layer explicitly covers both', async t => {
  const { h, session, applyLayer, check } = fixture(t, { nudgeChars: 16000, compactChars: 32000 });
  const [head] = seedBaseLayer(session);
  const prompt = h.sections[0].text({ scope: { id: session.id, session } });
  assert.match(prompt, /decisions, corrections, and open questions can also accumulate across short exchanges/i);
  assert.match(prompt, /if your next reply or action depends on those details, fold before using them/i);
  const tool = h.registeredTools.get(FOCUS_TOOL_NAME).tool;
  assert.match(tool.description, /detail list/i);
  assert.match(tool.parameters.properties.definitions.description, /earlier meanings/i);
  const first = { key: 'launch-in-design', supersedes: [], definitions: point('In design, launch means the first internal demo.') };
  const second = { key: 'launch-in-ops', supersedes: [], definitions: point('In operations, launch means public availability.'), next: point('Ask which audience is in scope.') };
  await applyLayer(first);
  await applyLayer(second);
  const [a, b] = focusEvents(session, 'equivalence');
  const [hint] = focusEvents(session, 'objective');
  assertLayer(a, first);
  assertLayer(b, second);
  assert.ok(textOf(hint).includes(second.next[0].content));
  const pressure = [userMsg('x'.repeat(32000))];
  assert.equal((await check(pressure)).messages.at(-1).source.layer, 'pressure');
  assert.deepEqual(session.surface.nodes, [head, a.seq, b.seq, hint.seq]);

  const restored = replaySession(session);
  const agent = { id: restored.id, session: restored };
  const current = { key: 'launch-by-stage', supersedes: [first.key, second.key],
    definitions: [{ content: `${first.definitions[0].content}\n${second.definitions[0].content}` }], experience: point('Check the audience before scheduling a launch.'),
    conclusions: point('The operations launch is still pending.'), guidance: point('Use the team’s stage-specific terminology.'),
    work_done: point('Confirmed the design demo took place.') };
  appendCheckpoint(restored, 'both-meanings', current);
  await h.runPreStep(agent);
  assert.deepEqual(focusEvents(restored, 'equivalence').map(e => e.data.source.key), [first.key, second.key, current.key]);
  await h.runPreStep(agent, pressure);
  const [survivor] = focusEvents(restored, 'equivalence');
  assert.deepEqual(restored.surface.nodes, [head, survivor.seq]);
  assertLayer(survivor, current);
  assert.deepEqual(restored.eventAt(a.seq), a);
  assert.deepEqual(restored.eventAt(b.seq), b);
});

test('older tool receipts and conclusion sources are ordinary context, not equivalence boundaries', async t => {
  const { h, session } = fixture(t, { nudgeChars: 16000, compactChars: 32000 });
  const [head] = seedBaseLayer(session);
  appendSurface(session, 'assistant/message', assistantTextMsg(1, 1, 'a'.repeat(16000)));
  const old = { key: 'old-layer', supersedes: [], result: 'A historical conclusion.' };
  appendSurface(session, 'assistant/message', assistantToolCallMsg(1, 2, [{ id: 'old', name: 'focus_conclude', args: old }]));
  appendSurface(session, 'tool/result', toolResultMsg(1, 2, 'old', 'Recorded'));
  appendSurface(session, 'user/message', userMsg(old.result, { kind: FOCUS_SOURCE_KIND, layer: 'conclusion', ...old }));
  const restored = replaySession(session);
  const agent = { id: restored.id, session: restored };
  const original = restored.surface.nodes;
  const request = userMsg('x'.repeat(32000));
  const { messages } = await h.runPreStep(agent, [request]);
  assert.deepEqual(restored.surface.nodes, original, 'old calls do not materialize on replay');
  assert.deepEqual(messages.map(m => m.source.layer), [undefined, 'nudge'], 'old layers neither reset the meter nor trigger pressure');
  const args = { key: 'observations', supersedes: [], experience: point('Use the trace to distinguish attempts from success.') };
  appendCheckpoint(restored, 'observations', args);
  await h.runPreStep(agent);
  const [current] = focusEvents(restored, 'equivalence');
  assertLayer(current, args);
  assert.deepEqual(restored.surface.nodes, [head, current.seq], 'the old source does not mark the start of the fold');
});

test('invalid equivalence sources do not reset the work meter, trigger pressure or fence off earlier work', async t => {
  const { session, check, applyLayer } = fixture(t, { nudgeChars: 16000, compactChars: 32000 });
  const [head] = seedBaseLayer(session);
  appendSurface(session, 'assistant/message', assistantTextMsg(1, 1, 'x'.repeat(16000)));
  const source = { kind: FOCUS_SOURCE_KIND, layer: 'equivalence', key: 'mixed', supersedes: [], definitions: point('New spelling.') };
  appendSurface(session, 'user/message', userMsg('Mixed format.', { ...source, result: 'Obsolete field.' }));
  appendSurface(session, 'user/message', userMsg('Unknown reference.', { ...source, key: 'unknown', supersedes: ['missing'] }));
  const before = session.surface.nodes;
  const input = userMsg('x'.repeat(32000));
  const { messages } = await check([input]);
  assert.deepEqual(messages.map(m => m.source.layer), [undefined, 'nudge']);
  assert.deepEqual(session.surface.nodes, before);
  const args = layer('verified', 'A valid replacement.');
  await applyLayer(args);
  const [current] = focusEvents(session, 'equivalence');
  assertLayer(current, args);
  assert.deepEqual(session.surface.nodes, [head, current.seq]);
});

test('idle and pressure remove only explicitly superseded layers, preserving full active history and unrelated tail nodes', async t => {
  for (const trigger of ['idle', 'pressure']) {
    await t.test(trigger, async t => {
      const { h, session, check, applyLayer } = fixture(t, { idleMinutes: 5, compactChars: 32000, nudgeChars: 20000 });
      const [head] = seedBaseLayer(session);
      const a = layer('original-location', 'The first manifest was under src.');
      const keep = layer('original-constraints', 'Keep intact: ' + 'x'.repeat(4700) + ' END_OF_RECORD', { work_done: 'Captured the original constraints.' });
      const b = layer('temp-location', 'An intermediate manifest used tmp/.');
      const current = layer('verified-location', 'The current manifest is under pkg/.', { supersedes: [a.key, b.key], next: point('Run the audit without editing.') });
      for (const args of [a, keep, b, current]) await applyLayer(args);
      assert.deepEqual(focusEvents(session, 'equivalence').map(e => e.data.source.key), [a.key, keep.key, b.key, current.key], 'ordinary folds stack even explicitly covered layers until cleanup');
      const [hint] = focusEvents(session, 'objective');
      const tail = appendSurface(session, 'user/message', userMsg('Do not edit.'));
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
      const incoming = trigger === 'pressure' ? [userMsg('z'.repeat(33000))] : [];
      if (trigger === 'idle') h.setNow(h.getNow() + 6 * 60000);
      await check(incoming);
      const active = focusEvents(session, 'equivalence');
      assert.deepEqual(active.map(e => e.data.source.key), [keep.key, current.key]);
      assertLayer(active[0], keep);
      assertLayer(active[1], current);
      assert.deepEqual(session.surface.nodes, [head, ...active.map(e => e.seq), hint.seq, tail.seq], 'head, next and raw tail retain their original identities');
      const restored = replaySession(session);
      const gen = restored.surface.replaceGeneration;
      await h.runPreStep({ id: restored.id, session: restored }, incoming);
      assert.equal(restored.surface.replaceGeneration, gen, 'a clean stack cannot be compacted again to meet a character quota');
    });
  }
});

test('low-space notices do not evict or truncate valid layers and are deduplicated on input and replay', async t => {
  const { h, session, check, applyLayer } = fixture(t, { nudgeChars: 16000, compactChars: 32000 });
  const [head] = seedBaseLayer(session);
  const record = layer('full-result', 'a'.repeat(7000) + ' EXACT_END', { work_done: point('Verified the full record.') });
  await applyLayer(record);
  const [conclusion] = focusEvents(session, 'equivalence');
  const input = userMsg('z'.repeat(33000));
  const decision = await check([input]);
  assert.equal(decision.messages[0], input);
  const notices = decision.messages.filter(m => m.source?.kind === FOCUS_SOURCE_KIND && m.source.layer === 'pressure');
  assert.equal(notices.length, 1, 'suggest explicit consolidation rather than silently discarding data');
  assert.deepEqual((await check(decision.messages)).messages, decision.messages, 'no duplicate if one is already incoming');
  assert.deepEqual(session.surface.nodes, [head, conclusion.seq]);
  assertLayer(conclusion, record);
  appendSurface(session, 'user/message', notices[0]);
  const restored = replaySession(session);
  const before = restored.surface.nodes;
  assert.deepEqual((await h.runPreStep({ id: restored.id, session: restored }, [input])).messages, [input]);
  assert.deepEqual(restored.surface.nodes, before);
  assertLayer(focusEvents(restored, 'equivalence')[0], record);
});

test('the public tool requires a fresh key, explicit supersedes and nonblank equivalence content', t => {
  const { h } = fixture(t);
  assert.deepEqual([...h.registeredTools.keys()], ['focus_equate']);
  const parameters = h.registeredTools.get(FOCUS_TOOL_NAME).tool.parameters;
  assert.deepEqual(Object.keys(parameters.properties), ['key', 'supersedes', 'definitions', 'experience', 'conclusions', 'guidance', 'work_done', 'todos', 'next']);
  assert.deepEqual([...parameters.required].sort(), ['key', 'supersedes']);
  const valid = layer('release-audit-2', 'Located both manifests.\nOne uses MIT.', { supersedes: ['old-audit'], work_done: 'Read both manifests.', next: 'Compare their licenses.' });
  assert.deepEqual(validateFocusEquateArgs(valid), valid);
  const minimal = layer('complete', 'Checked.');
  assert.equal(validateFocusEquateArgs({ ...minimal, next: [], work_done: [] }).key, minimal.key);
  for (const bad of [null, {}, { ...minimal, key: ['a', 'b'] }, ...['', 'a.b', 'A-b', '-a', 'a-', 'a--b', 'two_words', 'a b', ' trim', 'bad\nkey'].map(key => ({ ...minimal, key })),
    { key: 'a', conclusions: 'Missing array' }, { ...minimal, supersedes: 'old-audit' }, { ...minimal, supersedes: [12] },
    { ...minimal, supersedes: ['old-audit', 'old-audit'] }, { ...minimal, supersedes: ['complete'] }, { ...minimal, supersedes: ['bad.key'] },
    { ...minimal, conclusions: '' }, { ...minimal, conclusions: '\n\t' }, { ...minimal, conclusions: 'bad\x00char' }, { ...minimal, next: 7 }, { ...minimal, work_done: false },
    { ...minimal, objective: 'obsolete' }, { conclusions: [{ key: 'k', text: '' }] }, { ...minimal, extra: true },
  ]) assert.throws(() => validateFocusEquateArgs(bad), FocusToolArgsError);
});

test('duplicate keys and unknown references cannot supersede anything, even after cleanup and replay', async t => {
  const { h, session, applyLayer } = fixture(t, { idleMinutes: 5 });
  seedBaseLayer(session);
  const first = layer('manifest-location', 'First manifest location.');
  const latest = layer('verified-manifest', 'Verified new location.', { supersedes: [first.key] });
  await applyLayer(first);
  await applyLayer(latest);
  h.setNow(h.getNow() + 6 * 60000);
  const originalAgent = { id: session.id, session };
  await h.runPreStep(originalAgent);
  assert.deepEqual(focusEvents(session, 'equivalence').map(e => e.data.source.key), [latest.key]);
  const tool = h.registeredTools.get(FOCUS_TOOL_NAME).tool;
  for (const args of [layer(latest.key, 'Implicit overwrite.'), layer(first.key, 'Reused historical key.'), layer('invented-ref', 'No such layer.', { supersedes: ['absent-layer'] })]) {
    const restored = replaySession(session);
    const agent = { id: restored.id, session: restored };
    appendSurface(restored, 'assistant/message', assistantToolCallMsg(2, 1, [{ id: 'invalid', name: FOCUS_TOOL_NAME, args }]));
    await assert.rejects(() => tool.execute(args, { agent }), FocusToolArgsError);
    // A successful-looking historical receipt still cannot bypass state validation during replay.
    appendSurface(restored, 'tool/result', toolResultMsg(2, 1, 'invalid', 'Recorded'));
    const before = restored.surface.nodes;
    await h.runPreStep(agent);
    assert.deepEqual(restored.surface.nodes, before);
    assertLayer(focusEvents(restored, 'equivalence')[0], latest);
  }
});

test('idle, pressure and host compaction leave unconverted snapshots and legacy records alone', async t => {
  for (const mode of ['idle', 'pressure', 'host-compaction']) {
    await t.test(mode, async t => {
      const { h, session, check } = fixture(t);
      seedBaseLayer(session);
      const legacy = userMsg('Older conclusion.', { kind: FOCUS_SOURCE_KIND, layer: 'conclusion', entries: [{ key: 'old.dotted', text: 'Preserve me.' }] });
      appendSurface(session, 'user/message', legacy);
      for (const version of ['old', 'new']) {
        appendSurface(session, 'user/message', userMsg(version, { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'cwd', text: version }] }));
        appendSurface(session, 'user/message', userMsg(version, { kind: 'skill-catalog', form: 'catalog', entries: [{ name: version, description: version }] }));
      }
      appendRead(session, 'raw-work', 'Do not discard the raw call or its result.');
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
      if (mode === 'idle') h.setNow(h.getNow() + 61 * 60000);
      if (mode === 'host-compaction') {
        session.append('compaction/start', { compactionId: 'native', turn: 1 });
        session.append('compaction/end', { compactionId: 'native', turn: 1 });
      }
      const before = session.surface.nodes;
      await check(mode === 'pressure' ? [userMsg('z'.repeat(DEFAULT_CONFIG.compactChars))] : []);
      assert.deepEqual(session.surface.nodes, before);
      assert.equal(session.surface.replaceGeneration, 0);
    });
  }
});
