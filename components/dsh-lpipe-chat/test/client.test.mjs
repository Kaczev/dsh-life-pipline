import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { buildClient } from '../scripts/build-client.mjs';

/** Load the built bundle the way the Web client does, without a browser. */
async function loadClient() {
  const file = await buildClient();
  const code = await readFile(file, 'utf8');
  assert.match(code, /^window\.__ModuleLoader__\.load\(\{/, 'bundle must open the loader envelope');
  let definition = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => { definition = value; } } },
    console: { warn() {}, error() {}, log() {} },
  };
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  assert.ok(definition, 'bundle must call __ModuleLoader__.load');
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children: children.length > 1 ? children : children[0] },
    }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  return { definition, exports: definition.factory((id) => {
    if (id === 'react') return react;
    throw new Error(`unexpected require: ${id}`);
  }) };
}

test('the client bundle registers the sidebar mark and one settings block', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-lpipe-chat');
  assert.equal(exports.name, 'dsh-lpipe-chat-settings');
  assert.deepEqual([...exports.inject], ['slots', 'connection']);

  const registered = [];
  const ctx = {
    slots: {
      inject: (slot, factory) => factory(),
      register: (options, Component) => {
        registered.push({ options, Component });
        return () => {};
      },
    },
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    effect: (factory, name) => {
      effects.push(name);
      cleanups.push(factory());
    },
  };
  const effects = [];
  const cleanups = [];
  exports.apply(ctx);
  assert.deepEqual(registered.map(({ options }) => options.name), [
    'sidebar.session.row.leading',
    'lpipe.settings.panel',
  ]);

  const [{ options: seat }] = registered;
  assert.equal(seat.id, 'main-session-mark');
  assert.equal(typeof registered[0].Component, 'function');

  // Chat contributes one block to that page.
  const { options: block } = registered[1];
  assert.equal(block.id, 'chat');
  assert.equal(block.label(), 'Lpipe Chat');
  const props = block.inject();
  assert.equal(typeof props.rpcCall, 'function');
  const result = await props.rpcCall('chat.status', {});
  assert.deepEqual(result, { ok: true, value: {} });

  // The mark tracks the main session without a DOM and cleans up silently.
  assert.deepEqual(effects, ['dsh-lpipe-chat: main session mark']);
  for (const stop of cleanups) assert.equal(typeof stop, 'function');
  for (const stop of cleanups) stop();
});

test('the mark paints only the main session and is inlined', async () => {
  const code = await readFile(await buildClient(), 'utf8');
  assert.match(code, /data:image\/png;base64,iVBORw0KGgo/, 'the mark must be inlined as a PNG data URL');
  assert.match(code, /'sidebar\.session\.row\.leading'/, 'the mark must seat in the row leading cell');
  assert.doesNotMatch(code, /1F4CC/, 'the emoji pin is retired');

  const { exports } = await loadClient();
  const { MainSessionMark, setMainSessionId } = exports.__test__;
  setMainSessionId('');
  assert.equal(MainSessionMark({ sessionId: 'session-a' }), null, 'nothing is marked before a main session is known');
  setMainSessionId('session-a');
  assert.equal(MainSessionMark({ sessionId: 'session-b' }), null, 'other rows stay bare');
  const mark = MainSessionMark({ sessionId: 'session-a' });
  assert.equal(mark.props['data-dsh-lpipe-chat-mark'], '1');
  assert.match(mark.props.src, /^data:image\/png;base64,iVBORw0KGgo/);
  assert.equal(mark.props.alt, '', 'the mark is decorative');
  setMainSessionId('');
});

test('the tracker reads the main session out of the RPC envelope', async () => {
  const { exports } = await loadClient();
  const { MainSessionMark, trackMainSession } = exports.__test__;
  const calls = [];
  const stop = trackMainSession(async (method) => {
    calls.push(method);
    return { ok: true, value: { config: { mainSessionId: 'session-live' } } };
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ['chat.status']);
  assert.notEqual(MainSessionMark({ sessionId: 'session-live' }), null, 'the reported row gets the mark');
  assert.equal(MainSessionMark({ sessionId: 'session-other' }), null, 'other rows stay bare');
  stop();
  assert.equal(MainSessionMark({ sessionId: 'session-live' }), null, 'teardown clears the mark');
});

test('a finished login flips the card before the channel is fully up', async () => {
  const { exports } = await loadClient();
  const markConnected = exports.__test__.markConnected;
  const before = {
    config: {
      mainSessionId: 'session-x',
      weixin: { connected: false, enabled: true },
      qq: { connected: false, enabled: true },
    },
  };
  const after = markConnected(before, 'qq');
  assert.equal(after.config.qq.connected, true);
  assert.equal(after.config.weixin.connected, false, 'other channels stay untouched');
  assert.equal(before.config.qq.connected, false, 'the input is not mutated');
  assert.equal(after.config.mainSessionId, 'session-x');
  assert.equal(markConnected(null, 'qq'), null);
});

function texts(node, out = []) {
  if (node == null || node === false || node === true) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
  if (node.props) texts(node.props.children, out);
  return out;
}

test('a stored credential offers reconnect, never a dead end', async () => {
  const { exports } = await loadClient();
  const card = exports.__test__.ChannelCard;
  const shared = { name: 'weixin', title: '微信', accent: '#07c160', busy: false };

  const revoked = card({
    ...shared,
    state: { configured: true, connected: false, lastError: 'invalid token' },
    login: { state: 'idle' },
  });
  const labels = texts(revoked);
  assert.ok(labels.includes('重新连接'), 'a stored credential must offer reconnect');
  assert.ok(labels.includes('重新扫码'), 'a revoked credential must still be replaceable');
  assert.ok(labels.some((text) => text.includes('上次连接失败')), 'the failure stays visible');

  const live = card({ ...shared, state: { configured: true, connected: true }, login: { state: 'idle' } });
  const liveLabels = texts(live);
  assert.ok(liveLabels.includes('已连接'));
  assert.ok(liveLabels.includes('重新连接'), 'reconnect stays reachable while connected');

  const empty = card({ ...shared, state: { configured: false, connected: false }, login: { state: 'idle' } });
  const emptyLabels = texts(empty);
  assert.ok(emptyLabels.includes('扫码接入'));
  assert.ok(!emptyLabels.includes('重新连接'), 'nothing to reconnect without credentials');
});
