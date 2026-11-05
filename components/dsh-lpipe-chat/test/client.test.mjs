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

test('the client bundle contributes one settings block and nothing else', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-lpipe-chat');
  assert.equal(exports.name, 'dsh-lpipe-chat-settings');
  assert.deepEqual([...exports.inject], ['slots', 'connection']);

  const registered = [];
  const effects = [];
  const ctx = {
    slots: {
      inject: (slot, factory) => factory(),
      register: (options, Component) => {
        registered.push({ options, Component });
        return () => {};
      },
    },
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    effect: (factory, name) => { effects.push(name); },
  };
  exports.apply(ctx);
  // The main-session mark belongs to dsh-life-pipline: the main session is
  // common state, and the row seat must not depend on this component.
  assert.deepEqual(registered.map(({ options }) => options.name), ['lpipe.settings.panel']);
  assert.deepEqual(effects, [], 'the block needs no background tracker of its own');

  const { options: block } = registered[0];
  assert.equal(block.id, 'chat');
  assert.equal(block.label(), 'Lpipe Chat');
  const props = block.inject();
  assert.equal(typeof props.rpcCall, 'function');
  const result = await props.rpcCall('chat.status', {});
  assert.deepEqual(result, { ok: true, value: {} });
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
