import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { readClientInputs, wrapClient } from '../scripts/build-client.mjs';
import { registerMemoryRpc } from '../src/service.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const code = await read('../lib/client.js');
const manifest = JSON.parse(await read('../package.json'));
const section = (overrides = {}) => ({ enabled: true, maxEntries: 2, maxTextLength: 10, entries: [], ...overrides });

function loadClient(react = { createElement: () => assert.fail('Registration must not render the panel') }) {
  const records = [];
  vm.runInNewContext(code, { AbortController, window: { __ModuleLoader__: { load: entry => records.push(entry) } } }, { filename: 'lib/client.js' });
  assert.equal(records.length, 1);
  const [entry] = records;
  const exported = entry.factory(name => {
    assert.equal(name, 'react');
    return react;
  });
  return { id: entry.id, exported };
}

function registerClient(connection, react) {
  const { exported } = loadClient(react);
  let registration, dictionary, panel;
  assert.deepEqual(Array.from(exported.inject), ['slots', 'connection', 'locale']);
  exported.apply({
    connection,
    effect: callback => callback(),
    locale: {
      register(namespace, messages) {
        assert.equal(namespace, 'lpipe.memory.settings');
        dictionary = messages;
        return () => {};
      },
      bind(namespace) {
        assert.equal(namespace, 'lpipe.memory.settings');
        return key => dictionary.en[key];
      },
      getSnapshot() { return 'en'; },
      subscribe() { return () => {}; },
    },
    slots: {
      inject(slotName, callback) { assert.equal(slotName, 'lpipe.settings.panel'); return callback(); },
      register(options, component) {
        assert.equal(registration, undefined);
        assert.equal(component.name, 'MemoryPanel');
        registration = options;
        panel = component;
      },
    },
  });
  return { registration, dictionary, panel };
}

const clone = value => structuredClone(value);
const api = loadClient().exported.__test__;

// Drive the real bundled component and RPC transport without a browser or a DOM dependency.
function mountMemoryPanel() {
  let cursor, effects, tree;
  const hooks = [], requests = [];
  function effect(run, deps) {
    const slot = cursor++;
    const previous = hooks[slot];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    effects.push(() => {
      previous?.cleanup?.();
      hooks[slot] = { deps, cleanup: run() };
    });
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Fragment: Symbol('Fragment'),
    useEffect: effect,
    useLayoutEffect: effect,
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useId: () => 'memory-test',
    useState(initial) {
      const slot = cursor++;
      hooks[slot] ??= { current: initial };
      const cell = hooks[slot];
      return [cell.current, next => { cell.current = typeof next === 'function' ? next(cell.current) : next; }];
    },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
  };
  const { panel, registration, dictionary } = registerClient({ rpc: { call(_base, _method, payload) {
    return new Promise((resolve, reject) => requests.push({ payload: clone(payload), resolve, reject }));
  } } }, react);
  const props = registration.inject();
  function render() {
    cursor = 0;
    effects = [];
    tree = panel(props);
    function attach(node) {
      if (Array.isArray(node)) return node.forEach(attach);
      if (!node?.children) return;
      const ref = node.props.ref;
      const element = { focus() {}, showModal() { this.open = true; }, close() { this.open = false; }, isConnected: true };
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current ??= element;
      node.children.forEach(attach);
    }
    attach(tree);
    effects.forEach(run => run());
  }
  function find(predicate, root = tree) {
    const matches = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node?.children) return;
      if (predicate(node)) matches.push(node);
      node.children.forEach(visit);
    }
    visit(root);
    assert.equal(matches.length, 1);
    return matches[0];
  }
  const scope = () => find(node => node.props.id === 'memory-test-scope');
  const scopeSwitch = () => find(node => node.props.role === 'switch', scope());
  const option = (kind, name) => find(node => node.type === 'input' && node.props.name === name,
    find(node => node.props.id === `memory-test-${kind}-pane`));
  const button = key => find(node => node.type === 'button' && node.children[0] === dictionary.en[key]);
  const change = (node, currentTarget) => { node.props.onChange({ currentTarget }); render(); };
  const click = node => { node.props.onClick({ currentTarget: { isConnected: true, focus() {} } }); render(); };
  const submit = node => { node.props.onSubmit({ preventDefault() {} }); render(); };
  async function respond(method, payload, reply) {
    const request = requests.shift();
    assert.ok(request, `expected ${method} request`);
    assert.deepEqual(request.payload, { method, payload });
    if (reply instanceof Error) request.reject(reply);
    else request.resolve({ ok: true, value: reply });
    await new Promise(resolve => setImmediate(resolve));
    render();
  }
  render();
  return { requests, dictionary: dictionary.en, scope, scopeSwitch, option, button, change, click, submit, find, respond };
}

const snapshot = (allSessions, wishes = {}, settings = {}, sharedLists = { wishes: true, settings: true }) => ({
  ok: true, state: { allSessions, sharedLists: { recollections: false, ...sharedLists }, wishes: section(wishes), settings: section(settings), recollections: { enabled: true, maxScenes: 12, maxEntries: 8, maxDescriptionLength: 64, maxTextLength: 160, scenes: [] } },
});

test('Recollection panel manages scene and entry lifecycle with explicit names and four safe limits', async () => {
  const ui = mountMemoryPanel(), snap = snapshot(true), group = snap.state.recollections;
  await ui.respond('memory.state', null, snap);
  ui.click(ui.button('recollections'));
  assert.deepEqual(['maxScenes','maxEntries','maxDescriptionLength','maxTextLength'].map(k => ui.option('recollections', k).props.value), [12,8,64,160]);
  const pane = () => ui.find(n => n.props.id === 'memory-test-recollections-pane');
  const dialog = () => ui.find(n => n.type === 'dialog');
  const submit = () => ui.submit(ui.find(n => n.type === 'form', dialog()));
  const set = (type, value) => ui.change(ui.find(n => n.type === type, dialog()), { value });
  const reply = (action, rest) => ui.respond('memory.mutate', { kind: 'recollections', action, ...rest }, snap);
  ui.click(ui.button('addScene'));
  set('input', 'first-scene'); set('textarea', 'A scene.'); submit();
  const row = { scene: 'first-scene', description: 'A scene.', entries: [] };
  group.scenes.push(row);
  await reply('createScene', { scene: row.scene, description: row.description });
  ui.click(ui.button('editScene')); set('textarea', 'New description.'); submit();
  row.description = 'New description.';
  await reply('updateScene', { scene: row.scene, description: row.description });
  ui.change(ui.option('recollections','maxDescriptionLength'), { valueAsNumber: 3 });
  assert.equal(ui.option('recollections','maxDescriptionLength').props['aria-invalid'], true);
  ui.change(ui.option('recollections','maxDescriptionLength'), { valueAsNumber: 24 });
  ui.submit(ui.find(n => n.type === 'form', pane()));
  group.maxDescriptionLength = 24;
  await reply('configure', { config: { enabled:true, maxScenes:12, maxEntries:8, maxTextLength:160, maxDescriptionLength:24 } });
  ui.click(ui.button('addRecollection')); set('input','Bad_1'); set('textarea','detail'); submit();
  assert.equal(ui.requests.length,0);
  set('input','first-detail'); submit();
  row.entries.push({ id:'first-detail', text:'detail' });
  const target = { scene: row.scene, id:'first-detail' };
  await reply('addEntry', { ...target,text:'detail' });
  assert.equal(ui.button('removeScene').props.disabled, true);
  const list = () => ui.find(n => n.type === 'ul',pane());
  ui.click(ui.find(n => n.type === 'button' && n.children[0] === ui.dictionary.edit,list()));
  set('textarea','revised'); submit(); row.entries[0].text = 'revised';
  await reply('updateEntry',{ ...target,text:'revised' });
  ui.click(ui.find(n => n.type === 'button' && n.children[0] === ui.dictionary.removeSettingAction,list()));
  submit(); row.entries.pop(); await reply('removeEntry',target);
  ui.click(ui.button('removeScene')); submit(); group.scenes.pop(); await reply('removeScene',{ scene:row.scene });
  assert.equal(ui.find(n => n.children[0] === ui.dictionary.emptyScenes,pane()).type,'p');
});

test('Recollection browser writes only explicit scoped edits and recovers drafts after uncertain saves', async () => {
  const ui = mountMemoryPanel();
  const snap = snapshot(true);
  snap.state.recollections.scenes = ['first', 'second'].map(scene => ({ scene, description: scene, entries: [] }));
  await ui.respond('memory.state', null, snap);
  ui.change(ui.option('wishes', 'maxEntries'), { valueAsNumber: 5 });
  ui.click(ui.button('recollections'));
  assert.equal(ui.option('recollections', 'enabled').props.checked, true);
  assert.equal(ui.find(n => n.props['aria-labelledby'] === 'memory-test-recollections-scope-label').props.checked, false);
  ui.change(ui.find(n => n.type === 'select'), { value: 'second' });
  assert.equal(ui.requests.length, 0);
  const dialog = () => ui.find(n => n.type === 'dialog');
  const form = () => ui.find(n => n.type === 'form', dialog());
  const input = () => ui.find(n => n.props.type === 'text', dialog());
  const body = () => ui.find(n => n.type === 'textarea', dialog());
  ui.click(ui.button('addRecollection'));
  ui.change(input(), { value: 'first-visit' });
  ui.change(body(), { value: 'A specific visit.' });
  ui.submit(form());
  const payload = { kind: 'recollections', action: 'addEntry', scene: 'second', id: 'first-visit', text: 'A specific visit.' };
  await ui.respond('memory.mutate', payload, new Error('lost reply'));
  ui.click(ui.button('reloadMemory'));
  await ui.respond('memory.state', null, snap);
  assert.equal(input().props.value, payload.id);
  assert.equal(body().props.value, payload.text);
  assert.equal(ui.option('wishes', 'maxEntries').props.value, 5);
  assert.equal(ui.requests.length, 0);
  ui.submit(form());
  await ui.respond('memory.mutate', payload, { ok: false, code: 'commit_uncertain' });
  ui.click(ui.button('reloadMemory'));
  snap.state.recollections.scenes[1].entries.push({ id: payload.id, text: payload.text });
  await ui.respond('memory.state', null, snap);
  assert.equal(dialog().children[0], null);
  assert.equal(ui.button('removeScene').props.disabled, true);
  assert.equal(ui.requests.length, 0);
});

test('Memory scope switch waits for the Host and rebases drafts in both tabs on success', async () => {
  const ui = mountMemoryPanel();
  await ui.respond('memory.state', null, snapshot(false));
  const initial = ui.scopeSwitch();
  assert.equal(initial.props.checked, false);
  assert.equal(ui.find(node => node.props.id === initial.props['aria-labelledby']).children[0], ui.dictionary.allSessions);
  assert.equal(ui.find(node => node.props.id === initial.props['aria-describedby']).children[0], ui.dictionary.scopeHint);

  ui.change(ui.option('wishes', 'maxEntries'), { valueAsNumber: 4 });
  ui.click(ui.button('settings'));
  ui.change(ui.option('settings', 'maxTextLength'), { valueAsNumber: 12 });
  assert.equal(ui.requests.length, 0, 'option drafts have not been sent to the Host');
  ui.change(ui.scopeSwitch(), { checked: true });
  assert.equal(ui.scopeSwitch().props.checked, false, 'the checked state remains authoritative');
  assert.equal(ui.scopeSwitch().props.disabled, true);
  assert.equal(ui.scope().props['aria-busy'], true);
  assert.equal(ui.option('settings', 'maxTextLength').props.disabled, true);
  assert.equal(ui.find(node => node.props.role === 'status', ui.scope()).children[0], ui.dictionary.saving);
  ui.change(initial, { checked: true });
  assert.equal(ui.requests.length, 1, 'a stale handler cannot send a second write');

  await ui.respond('memory.setScope', true, snapshot(true, { maxTextLength: 15 }, { maxEntries: 3 }));
  assert.equal(ui.scopeSwitch().props.checked, true);
  assert.equal(ui.scopeSwitch().props.disabled, false);
  assert.equal(ui.scope().props['aria-busy'], false);
  assert.equal(ui.find(node => node.props.role === 'status', ui.scope()).children[0], null, 'a successful toggle leaves no status message');
  assert.equal(ui.option('wishes', 'maxEntries').props.value, 4);
  assert.equal(ui.option('wishes', 'maxTextLength').props.value, 15);
  assert.equal(ui.option('settings', 'maxTextLength').props.value, 12);
  assert.equal(ui.option('settings', 'maxEntries').props.value, 3);
  assert.equal(ui.requests.length, 0);
});

test('Each tab presents its enable switch before its list sharing switch', async () => {
  const ui = mountMemoryPanel();
  await ui.respond('memory.state', null, snapshot(true));
  for (const kind of ['wishes', 'settings']) {
    ui.click(ui.button(kind));
    const pane = ui.find(node => node.props.id === `memory-test-${kind}-pane`);
    assert.equal(pane.props.hidden, false);
    const order = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node?.children) return;
      if (node.props.role === 'switch') order.push(node.props.name ?? node.props['aria-labelledby']);
      node.children.forEach(visit);
    }
    visit(pane);
    assert.deepEqual(order, ['enabled', `memory-test-${kind}-scope-label`]);
  }
});

test('Each tab shares its own list immediately and retains its choice while the master is off', async () => {
  const ui = mountMemoryPanel();
  const row = kind => ui.find(node => node.props.id === `memory-test-${kind}-scope`);
  const toggle = kind => ui.find(node => node.props.role === 'switch', row(kind));
  const flags = { wishes: false, settings: true };
  await ui.respond('memory.state', null, snapshot(false, {}, {}, flags));
  for (const kind of ['wishes', 'settings']) {
    assert.equal(toggle(kind).props.disabled, true);
    assert.equal(toggle(kind).props.checked, flags[kind]);
    assert.equal(ui.find(node => node.props.id === toggle(kind).props['aria-labelledby']).children[0], ui.dictionary[`${kind}Scope`]);
    ui.change(toggle(kind), { checked: !flags[kind] });
  }
  assert.equal(ui.requests.length, 0);
  ui.change(ui.scopeSwitch(), { checked: true });
  await ui.respond('memory.setScope', true, snapshot(true, {}, {}, flags));
  ui.change(ui.option('wishes', 'maxEntries'), { valueAsNumber: 4 });
  ui.click(ui.button('settings'));
  ui.change(ui.option('settings', 'enabled'), { checked: false });
  ui.change(toggle('settings'), { checked: false });
  assert.equal(toggle('settings').props.checked, true);
  assert.equal(row('settings').props['aria-busy'], true);
  assert.equal(ui.scopeSwitch().props.disabled, true);
  const neither = { wishes: false, settings: false };
  await ui.respond('memory.setScope', { kind: 'settings', enabled: false }, snapshot(true, {}, {}, neither));
  assert.equal(toggle('settings').props.checked, false);
  assert.equal(toggle('wishes').props.checked, false);
  assert.equal(ui.option('settings', 'enabled').props.checked, false);
  assert.equal(ui.option('wishes', 'maxEntries').props.value, 4);
  ui.click(ui.button('wishes'));
  ui.change(toggle('wishes'), { checked: true });
  await ui.respond('memory.setScope', { kind: 'wishes', enabled: true }, snapshot(true, {}, {}, neither));
  assert.equal(toggle('wishes').props.disabled, true, 'an unconfirmed list write locks further writes');
  ui.click(ui.button('reloadMemory'));
  const wishesOnly = { wishes: true, settings: false };
  await ui.respond('memory.state', null, snapshot(true, {}, {}, wishesOnly));
  assert.equal(ui.option('wishes', 'maxEntries').props.value, 4);
  assert.equal(ui.option('settings', 'enabled').props.checked, false);
  ui.change(ui.scopeSwitch(), { checked: false });
  await ui.respond('memory.setScope', false, snapshot(false, {}, {}, wishesOnly));
  assert.equal(toggle('wishes').props.checked, true);
  assert.equal(toggle('settings').props.checked, false);
  assert.equal(toggle('wishes').props.disabled, true);
  assert.equal(toggle('settings').props.disabled, true);
  assert.equal(ui.requests.length, 0);
});

test('Memory scope recovery keeps both drafts through a failed reread and refreshes the baseline', async () => {
  const ui = mountMemoryPanel();
  await ui.respond('memory.state', null, snapshot(false));
  ui.change(ui.option('wishes', 'maxEntries'), { valueAsNumber: 4 });
  ui.click(ui.button('settings'));
  ui.change(ui.option('settings', 'enabled'), { checked: false });
  ui.change(ui.scopeSwitch(), { checked: true });
  await ui.respond('memory.setScope', true, new Error('response lost'));
  assert.equal(ui.scopeSwitch().props.checked, false);
  assert.equal(ui.scopeSwitch().props.disabled, true);
  assert.equal(ui.find(node => node.props.role === 'alert').children[0], ui.dictionary.saveFailed);
  ui.click(ui.button('reloadMemory'));
  await ui.respond('memory.state', null, new Error('still disconnected'));
  assert.equal(ui.find(node => node.props.role === 'alert').children[0], ui.dictionary.loadFailed);
  ui.click(ui.button('retry'));
  await ui.respond('memory.state', null, snapshot(true, { maxEntries: 4, maxTextLength: 20 }, { maxEntries: 3 }));
  assert.equal(ui.scopeSwitch().props.checked, true);
  assert.equal(ui.scopeSwitch().props.disabled, false);
  assert.equal(ui.option('wishes', 'maxEntries').props.value, 4);
  assert.equal(ui.option('wishes', 'maxTextLength').props.value, 20);
  assert.equal(ui.option('settings', 'enabled').props.checked, false);
  assert.equal(ui.option('settings', 'maxEntries').props.value, 3);
  const submit = kind => ui.find(node => node.props.type === 'submit', ui.find(node => node.props.id === `memory-test-${kind}-pane`));
  assert.equal(submit('wishes').props.disabled, true, 'an edit matching the refreshed Host baseline is no longer dirty');
  assert.equal(submit('settings').props.disabled, false, 'the other unsaved edit remains dirty');
  assert.equal(ui.requests.length, 0, 'the uncertain write was never replayed');
});

test('memory Client bundle and manifest expose the managed settings panel', async () => {
  assert.equal(code.replace(/\r\n/g, '\n'), wrapClient(...await readClientInputs()));
  assert.equal(loadClient().id, manifest.name);
  assert.equal(manifest.exports['./client'], './lib/client.js');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale',
  ]);
  const { registration, dictionary } = registerClient({});
  assert.equal(registration.name, 'lpipe.settings.panel');
  assert.equal(registration.id, 'memory');
  assert.equal(registration.label(), 'Memory Pipeline');
  assert.equal(dictionary.zh.title, '记忆管线');
  assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.zh).sort());
});

test('registered panel calls the real Host RPC route and preserves domain failures', async () => {
  let route, transportError;
  const serverCalls = [], clientCalls = [];
  const initial = snapshot(false);
  const invalid = { ok: false, code: 'not_found', message: 'No memory entry has that ID.', field: 'id' };
  registerMemoryRpc({ connection: { fetch: { register: value => { route = value; } } } }, async (method, payload) => {
    serverCalls.push({ method, payload });
    return method === 'memory.state' ? initial : method === 'memory.setScope'
      ? { ok: true, state: { ...initial.state, allSessions: payload } } : invalid;
  });
  const { registration } = registerClient({ rpc: { async call(base, rpcMethod, payload, signal) {
    clientCalls.push({ payload: clone(payload), signal });
    if (transportError) return { ok: false, error: { message: 'Disconnected' } };
    const url = new URL(`${base}/${rpcMethod}`, 'http://localhost');
    assert.equal(url.pathname, route.path);
    const response = await route.fetch(new Request(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: rpcMethod, payload }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.rpcId, 'test');
    assert.equal(body.type, 'server-response');
    return body.result;
  } } });
  const { rpcCall } = registration.inject();
  const { signal } = new AbortController();
  assert.deepEqual(await rpcCall('memory.state', null, signal), initial);
  assert.equal((await rpcCall('memory.setScope', true, signal)).state.allSessions, true);
  const entry = { kind: 'settings', action: 'remove', id: 'gone' };
  assert.deepEqual(await rpcCall('memory.mutate', entry, signal), invalid);
  assert.deepEqual(serverCalls, [{ method: 'memory.state', payload: null }, { method: 'memory.setScope', payload: true }, { method: 'memory.mutate', payload: entry }]);
  assert.deepEqual(clientCalls.map(call => call.payload), serverCalls);
  assert.ok(clientCalls.every(call => call.signal === signal));
  transportError = true;
  await assert.rejects(rpcCall('memory.mutate', entry, signal), /transport rejected/);
  assert.equal(serverCalls.length, 3, 'the failed write is not replayed');
});

test('Client normalizes text and permits editing and removing while full or disabled', () => {
  const record = { id: 'ui-1', text: '🦊' };
  const full = section({ enabled: false, maxEntries: 1, maxTextLength: 4, entries: [record] });
  assert.equal(api.lengthOf('  🦊\r\n说  '), 3);
  assert.equal(api.entryRequest('wishes', 'add', full, null, '🦊').key, 'addLimit');
  assert.equal(api.entryRequest('wishes', 'update', full, record.id, '🥝🌙🐈🍀🦊').key, 'textLimit');
  assert.equal(api.entryRequest('wishes', 'update', full, record.id, ' \r\n ').key, 'requiredText');
  assert.deepEqual(clone(api.entryRequest('wishes', 'update', full, record.id, '  🦊\r\n说  ')), {
    kind: 'wishes', action: 'update', id: record.id, text: '🦊\n说',
  });
  assert.deepEqual(clone(api.entryRequest('wishes', 'remove', full, record.id)), { kind: 'wishes', action: 'remove', id: record.id });
  assert.deepEqual(clone(api.entryRequest('settings', 'add', section(), null, ' 🦊 ')), { kind: 'settings', action: 'add', text: '🦊' });
});

test('Client limits configuration to the chosen type and refuses invalid or destructive limits', () => {
  const existing = section({ entries: [{ id: 's-one', text: 'abc' }, { id: 's-two', text: 'abcde' }] });
  const draft = { enabled: false, maxEntries: 2, maxTextLength: 5 };
  assert.equal(api.configureRequest('settings', existing, { ...draft, maxEntries: 33 }).key, 'entriesRange');
  assert.equal(api.configureRequest('settings', existing, { ...draft, maxTextLength: NaN }).key, 'textRange');
  assert.equal(api.configureRequest('settings', existing, { ...draft, maxEntries: 1 }).key, 'existingEntries');
  assert.equal(api.configureRequest('settings', existing, { ...draft, maxTextLength: 4 }).key, 'existingText');
  assert.deepEqual(clone(api.configureRequest('settings', existing, draft)), { kind: 'settings', action: 'configure', config: draft });
});

test('Client accepts authoritative snapshots only, and marks uncertain commits for reload', () => {
  const settings = section();
  const { state } = snapshot(false);
  for (const sharedLists of [undefined, {}, { wishes: true }, { wishes: 'false', settings: true }]) {
    assert.equal(api.stateOf({ ok: true, state: { ...state, sharedLists } }), null);
  }
  assert.equal(api.stateOf({ ok: true, state }), state);
  assert.equal(api.stateOf({ ok: true, state: { ...state, allSessions: 'true' } }), null);
  assert.equal(api.stateOf({ ok: false, state }), null);
  assert.equal(api.stateOf({ ok: true, state: { wishes: settings, settings } }), null);
  assert.equal(api.stateOf({ ok: true, state: { ...state, wishes: section({ maxEntries: 0 }) } }), null);
  const entry = { id: 'ui-1', text: ' 🦊 ' };
  assert.equal(api.stateOf({ ok: true, state: { ...state, wishes: section({ entries: [entry, entry] }) } }), null);
  assert.equal(api.mutationProblem({ ok: false, code: 'commit_uncertain', message: 'Maybe committed' }).uncertain, true);
  assert.deepEqual(clone(api.mutationProblem({ ok: false, code: 'text_limit', message: 'Too long', field: 'text' })), {
    uncertain: false, issue: { message: 'Too long', field: 'text' },
  });
});
