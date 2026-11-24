import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as memory from 'dsh-lpipe-memory';

async function host(t) {
  const home = await mkdtemp(join(tmpdir(), 'lpipe-memory-host-'));
  const disposers = [];
  t.after(async () => {
    try { for (const dispose of disposers.reverse()) await dispose(); }
    finally { await rm(home, { recursive: true, force: true }); }
  });
  const tools = new Map(), sections = new Map(), hooks = new Map();
  let route, mainId = 'main', rootsAvailable = true;
  const roots = new Map();
  const makeAgent = (id, parent, session = { id }) => {
    const agent = { id, session };
    roots.set(agent, parent ? roots.get(parent) : agent);
    return agent;
  };
  const main = makeAgent('main');
  const ctx = {
    subagents: { rootOf(agent) {
      if (!rootsAvailable || !roots.has(agent)) throw new Error('Agent is not attached');
      return roots.get(agent);
    } },
    inject(_services, callback) { callback(ctx); },
    effect(callback) { disposers.push(callback()); },
    on(name, callback) { hooks.set(name, callback); },
    tools: { register(tool, options) { tools.set(tool.name, { tool, ...options }); return () => tools.delete(tool.name); } },
    systemPrompt: { section(section) { sections.set(section.name, section); return () => sections.delete(section.name); } },
    connection: { fetch: { register(spec) { route = spec; return () => { route = undefined; }; } } },
  };
  memory.apply(ctx, { home, isMain: value => (typeof value === 'string' ? value : value?.id) === mainId });
  async function rpc(method, payload) {
    const response = await route.fetch(new Request(`http://localhost${route.path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ type: 'client-request', method: 'dsh-lpipe-memory', rpcId: 'probe', payload: { method, payload } }),
    }));
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.equal(reply.type, 'server-response');
    assert.equal(reply.rpcId, 'probe');
    assert.equal(reply.result.ok, true);
    return reply.result.value;
  }
  const state = await rpc('memory.state', null);
  assert.equal(state.ok, true);
  return { tools, sections, hooks, state: state.state, rpc, main, makeAgent,
    rebind(id) { mainId = id; }, loseRoots() { rootsAvailable = false; } };
}

const update = (id, text) => ({ action: 'update', id, text });
const remove = id => ({ action: 'remove', id });

test('Host scopes prompts and tools to live top-level agents and applies scope changes immediately', async t => {
  const { tools, sections, hooks, state, rpc, rebind, main, makeAgent, loseRoots } = await host(t);
  assert.deepEqual([...hooks.keys()], ['agent/pre-step', 'agent/request']);
  assert.equal(state.allSessions, false);
  const wishes = tools.get('memory_wish'), settings = tools.get('memory_setting');
  const wishPrompt = sections.get('dsh-lpipe-memory/wishes'), settingPrompt = sections.get('dsh-lpipe-memory/settings');
  const child = makeAgent('child', main), ordinary = makeAgent('ordinary');
  const fork = makeAgent('fork', undefined, { id: 'fork', header: { parentSession: main.session.id } });
  const detached = { ...main };
  const assertScope = (agent, expected) => {
    for (const { when } of [wishes, settings]) assert.equal(when({ agent }), expected);
    for (const section of [wishPrompt, settingPrompt]) assert.equal(Boolean(section.text({ scope: agent })), expected);
  };
  assertScope(main, true);
  for (const agent of [ordinary, fork, child, detached, main.id, undefined]) assertScope(agent, false);
  assert.match(wishPrompt.text({ scope: main }), /^## Wishes\n/);
  assert.match(settingPrompt.text({ scope: main }), /^## Settings\n/);
  for (const payload of [null, 'true', 1, { allSessions: true }]) assert.equal((await rpc('memory.setScope', payload)).code, 'invalid_input');
  const widened = await rpc('memory.setScope', true);
  assert.deepEqual(widened.state, { ...state, allSessions: true });
  for (const agent of [main, ordinary, fork]) assertScope(agent, true);
  for (const agent of [child, detached, main.id, undefined]) assertScope(agent, false);
  assert.equal((await wishes.tool.execute(update('secret', 'not saved'), { agent: child })).code, 'not_available');
  assert.equal((await settings.tool.execute(update('shared', 'Tea'), { agent: ordinary })).ok, true);
  const narrowed = await rpc('memory.setScope', false);
  assert.equal(narrowed.state.allSessions, false);
  assert.deepEqual(narrowed.state.settings.entries, [{ id: 'shared', text: 'Tea' }]);
  assertScope(ordinary, false);
  assert.equal((await settings.tool.execute(update('shared', 'not saved'), { agent: ordinary })).code, 'not_available');
  const { entries: _entries, ...config } = state.wishes;
  assert.equal((await rpc('memory.mutate', { kind: 'wishes', action: 'configure', config: { ...config, enabled: false } })).ok, true);
  assert.equal(wishes.when({ agent: main }), false);
  assert.equal(wishPrompt.text({ scope: main }), '');
  assert.equal(settings.when({ agent: main }), true);
  assert.equal((await wishes.tool.execute({}, { agent: main })).code, 'not_available');
  assert.equal((await rpc('memory.mutate', { kind: 'wishes', action: 'add', text: 'Still editable' })).ok, true);
  rebind(ordinary.id);
  assert.equal(settings.when({ agent: main }), false);
  assert.equal((await settings.tool.execute(update('old', 'not saved'), { agent: main })).code, 'not_available');
  assert.equal(settings.when({ agent: ordinary }), true);
  assert.match(settingPrompt.text({ scope: ordinary }), /^## Settings\n/);
  rebind(child.id);
  assertScope(child, false);
  rebind(main.id);
  loseRoots();
  assertScope(main, false);
  assert.equal((await rpc('memory.setScope', true)).ok, true);
  assertScope(main, false);
});

test('Tools and the panel share a store while keeping wish and setting responses distinct', async t => {
  const { tools, rpc, main } = await host(t);
  const execution = { agent: main };
  const wish = input => tools.get('memory_wish').tool.execute(input, execution);
  const setting = input => tools.get('memory_setting').tool.execute(input, execution);
  assert.deepEqual(await wish({}), { ok: true, wishes: [] });
  assert.equal((await wish({ action: 'updte' })).code, 'invalid_input');
  assert.equal((await setting({})).code, 'invalid_input');
  assert.equal((await rpc('memory.mutate', { kind: 'wishes', action: 'configure', config: { enabled: true, maxEntries: 1, maxTextLength: 5 } })).ok, true);
  assert.deepEqual(await wish(update('idea', ' idea ')), { ok: true, outcome: 'created', id: 'idea', wishes: [{ id: 'idea', text: 'idea' }] });
  const rejected = await wish(update('second', 'more'));
  assert.equal(rejected.code, 'entry_limit');
  assert.equal(rejected.limit, 1);
  assert.deepEqual(rejected.wishes, [{ id: 'idea', text: 'idea' }]);
  assert.deepEqual(await wish(update('idea', 'next')), { ok: true, outcome: 'updated', id: 'idea', wishes: [{ id: 'idea', text: 'next' }] });
  assert.deepEqual(await wish(remove('idea')), { ok: true, outcome: 'removed', id: 'idea', wishes: [] });
  const panel = await rpc('memory.mutate', { kind: 'settings', action: 'add', text: 'Tea' });
  assert.deepEqual(panel.state.settings.entries, [{ id: 'ui-1', text: 'Tea' }]);
  assert.deepEqual(await setting(update('ui-1', 'Coffee')), { ok: true, outcome: 'updated', id: 'ui-1', text: 'Coffee' });
  assert.deepEqual((await rpc('memory.state', null)).state.settings.entries, [{ id: 'ui-1', text: 'Coffee' }]);
  assert.deepEqual(await setting(remove('ui-1')), { ok: true, outcome: 'removed', id: 'ui-1' });
});

test('Settings reuse a visible snapshot, replace it on retries, and never become step input', async t => {
  const { hooks, rpc, rebind, state, makeAgent, tools } = await host(t);
  rebind('request-main');
  const events = [], nodes = [];
  const session = {
    id: 'request-main', surface: { nodes },
    eventAt: seq => events[seq - 1],
    deriveEventMessage: event => event.data,
    append(type, data, options) {
      const seq = events.push({ seq: events.length + 1, type, data });
      if (type === 'user/message' || type === 'system/message') nodes.push(seq);
      else {
        assert.equal(options.surfaceOp.op, 'replace');
        const { startSeq, endSeq } = options.surfaceOp;
        assert.equal(startSeq, endSeq);
        assert.deepEqual(options.sourceEventSeqs, [startSeq]);
        assert.deepEqual(data.message.content, []);
        const index = nodes.indexOf(startSeq);
        assert.notEqual(index, -1);
        nodes[index] = seq;
      }
      return events[seq - 1];
    },
  };
  const agent = makeAgent(session.id, undefined, session);
  const fields = { agent, turn: 1, step: 0, signal: new AbortController().signal };
  const preStep = (fields, messages = []) => hooks.get('agent/pre-step')(fields, () => ({ kind: 'enter', messages }));
  // The skill catalog and other outer waterfall hooks may copy the admission array.
  const withCatalog = async (fields, messages) => {
    const decision = await preStep(fields, messages);
    return { ...decision, messages: [...decision.messages, { source: { kind: 'skill-catalog' } }] };
  };
  const catalog = [];
  const request = async (fields, offered = true) => {
    const config = { tools: [...tools.keys()].filter(name => tools.get(name).when(fields)) };
    const actual = await hooks.get('agent/request')(fields, () => { catalog.push(config.tools); return config; });
    assert.equal(actual, config);
    assert.equal(catalog.at(-1).includes('memory_setting'), offered);
  };
  const snapshots = () => nodes.map(session.eventAt).filter(event => event.type === 'user/message' && event.data.source?.kind === 'dsh-lpipe-memory/settings');
  const add = await rpc('memory.mutate', { kind: 'settings', action: 'add', text: '<old>' });
  const [{ id }] = add.state.settings.entries;
  assert.deepEqual((await preStep(fields)).messages, []);
  const decision = await withCatalog(fields, [{ source: { kind: 'user' } }]);
  await request(fields);
  assert.deepEqual(nodes, [], 'request preparation must leave space for the first system message');
  const system = session.append('system/message', { content: [{ type: 'text', text: 'System prompt' }] });
  const input = session.append('user/message', { content: [{ type: 'text', text: 'Ordinary input' }] });
  const admitted = decision.messages.find(message => message.source.kind === 'dsh-lpipe-memory/settings');
  assert.ok(admitted, 'the final admission must contain settings even after another hook copies the array');
  assert.match(admitted.content[0].text, /\\u003cold\\u003e/);
  session.append('user/message', admitted, { surfaceOp: { op: 'append' } });
  const [original] = snapshots();
  await request(fields);
  const later = { ...fields, step: 1 };
  const following = await withCatalog(later, [{ source: { kind: 'user' } }]);
  assert.equal(following.messages.some(message => message.source.kind === 'dsh-lpipe-memory/settings'), false);
  await request(later);
  assert.deepEqual(snapshots(), [original]);

  assert.equal((await rpc('memory.mutate', { kind: 'settings', ...update(id, 'new') })).ok, true);
  await request(fields);
  assert.deepEqual(snapshots().map(event => event.data.content[0].text.split('\n')[1]), [JSON.stringify([{ id, text: 'new' }])]);
  assert.equal(session.eventAt(original.seq), original);
  const [hidden] = snapshots();
  nodes.splice(nodes.indexOf(hidden.seq), 1);
  const continuation = { ...fields, step: 2 };
  assert.deepEqual((await preStep(continuation)).messages, []);
  await request(continuation); // Only if the loop actually opens that step.
  assert.equal(snapshots().length, 1);
  assert.notEqual(snapshots()[0].seq, hidden.seq);

  assert.equal((await rpc('memory.mutate', { kind: 'settings', ...remove(id) })).ok, true);
  await request(fields);
  assert.deepEqual(snapshots().map(event => event.data.content[0].text.split('\n')[1]), ['[]']);
  const { entries: _entries, ...settingsConfig } = state.settings;
  assert.equal((await rpc('memory.mutate', { kind: 'settings', action: 'configure', config: { ...settingsConfig, enabled: false } })).ok, true);
  await request(fields, false);
  assert.deepEqual(snapshots(), []);
  assert.equal((await rpc('memory.mutate', { kind: 'settings', action: 'configure', config: settingsConfig })).ok, true);
  await request(fields);
  assert.equal(snapshots().length, 1);
  rebind('other');
  await request(fields, false);
  assert.deepEqual(snapshots(), []);
  assert.equal((await rpc('memory.setScope', true)).ok, true);
  await request(fields);
  const [widened] = snapshots();
  assert.ok(widened);
  await request(fields);
  assert.deepEqual(snapshots(), [widened]);
  assert.equal((await rpc('memory.setScope', false)).ok, true);
  await request(fields, false);
  assert.deepEqual(snapshots(), []);
  assert.ok(nodes.includes(input.seq));
});

test('Legacy archive entry points remain removed', async () => {
  for (const subpath of ['reader', 'paths', 'scope']) {
    await assert.rejects(import(`dsh-lpipe-memory/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});
