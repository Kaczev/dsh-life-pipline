import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { buildClient } from '../scripts/build-client.mjs';

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
  return {
    definition,
    exports: definition.factory((id) => {
      if (id === 'react') return react;
      throw new Error(`unexpected require: ${id}`);
    }),
  };
}

function texts(node, out = []) {
  if (node == null || node === false || node === true) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
  if (node.props) texts(node.props.children, out);
  return out;
}

test('the client bundle contributes one settings block and nothing else', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-lpipe-bili');
  assert.equal(exports.name, 'dsh-lpipe-bili-settings');
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
  assert.deepEqual(registered.map(({ options }) => options.name), ['lpipe.settings.panel']);
  assert.deepEqual(effects, [], 'the block needs no background tracker of its own');

  const { options: block } = registered[0];
  assert.equal(block.id, 'bili');
  assert.equal(block.order, 60);
  assert.equal(block.label(), 'Lpipe Bili');
  const props = block.inject();
  assert.equal(typeof props.rpcCall, 'function');
  const result = await props.rpcCall('bili.status', {});
  assert.deepEqual(result, { ok: true, value: {} });
});

test('the retention parser accepts only integers inside the host range', async () => {
  const { exports } = await loadClient();
  const parse = exports.__test__.parseRetention;
  assert.equal(parse('7'), 7);
  assert.equal(parse(' 36500 '), 36500);
  assert.equal(parse('0'), null);
  assert.equal(parse('36501'), null);
  assert.equal(parse('1.5'), null);
  assert.equal(parse(''), null);
  assert.equal(parse('-1'), null);
});

test('login normalization accepts a QR state or a full status envelope', async () => {
  const { exports } = await loadClient();
  const normalize = exports.__test__.normalizeLogin;
  const waiting = normalize({ status: 'waiting', image: 'data:image/png;base64,AAA', id: 'q1' });
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.image, 'data:image/png;base64,AAA');
  assert.equal(waiting.account, null);

  const status = normalize({
    configured: true,
    account: { mid: '1', name: 'Kaczev' },
    login: { status: 'idle' },
  });
  assert.equal(status.status, 'idle');
  assert.equal(status.account.name, 'Kaczev');
});

test('every visible login state names itself instead of relying on the QR alone', async () => {
  const { exports } = await loadClient();
  const card = exports.__test__.LoginCard;
  const shared = { busy: false, onBegin() {}, onCancel() {} };

  const idle = texts(card({ ...shared, status: { configured: false }, login: { status: 'idle' } }));
  assert.ok(idle.includes('扫码登录'));

  const configured = texts(card({
    ...shared,
    status: { configured: true, account: { name: 'Kaczev' } },
    login: { status: 'idle', account: { name: 'Kaczev' } },
  }));
  assert.ok(configured.includes('已登录'));
  assert.ok(configured.includes('重新登录'));
  assert.ok(configured.some((text) => text.includes('账号')));

  const waiting = texts(card({ ...shared, status: {}, login: { status: 'waiting', image: 'x' } }));
  assert.ok(waiting.includes('等待扫码'));
  assert.ok(waiting.includes('请用 B 站手机客户端扫码'));

  const scanned = texts(card({ ...shared, status: {}, login: { status: 'scanned', image: 'x' } }));
  assert.ok(scanned.includes('已扫码'));
  assert.ok(scanned.includes('已扫码，请在手机上确认'));

  const success = texts(card({
    ...shared,
    status: { configured: true, account: { name: 'Kaczev' } },
    login: { status: 'success', account: { name: 'Kaczev' } },
  }));
  assert.ok(success.includes('登录成功'));
  assert.ok(success.some((text) => text.includes('凭据已保存到宿主，页面只显示账号名。')));

  const expired = texts(card({ ...shared, status: {}, login: { status: 'expired' } }));
  assert.ok(expired.includes('二维码已过期'));
  assert.ok(expired.includes('重新生成'));

  const cancelled = texts(card({ ...shared, status: {}, login: { status: 'cancelled' } }));
  assert.ok(cancelled.includes('已取消'));
  assert.ok(cancelled.includes('本次扫码没有保存任何凭据。'));

  const failed = texts(card({ ...shared, status: {}, login: { status: 'error', error: '登录已过期。' } }));
  assert.ok(failed.includes('登录失败'));
  assert.ok(failed.includes('登录已过期。'));
});

test('the client never carries credential names or cookie readers', async () => {
  const source = await readFile(new URL('../client/panel.js', import.meta.url), 'utf8');
  for (const forbidden of ['SESSDATA', 'bili_jct', 'document.cookie']) {
    assert.ok(!source.includes(forbidden), `${forbidden} must not reach the client`);
  }
});
