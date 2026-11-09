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
    useRef: (initial) => ({ current: initial }),
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
  assert.equal(definition.id, 'dsh-lpipe-home');
  assert.equal(exports.name, 'dsh-lpipe-home-settings');
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
  assert.equal(block.id, 'home');
  assert.equal(block.order, 70);
  assert.equal(block.label(), 'Lpipe Home');
  const props = block.inject();
  assert.equal(typeof props.rpcCall, 'function');
  const result = await props.rpcCall('home.config', {});
  assert.deepEqual(result, { ok: true, value: {} });
});

test('the block talks to the home endpoint with the documented envelope', async () => {
  const { exports } = await loadClient();
  const calls = [];
  const ctx = {
    slots: { inject: (slot, factory) => factory(), register: (options) => () => {} },
    connection: {
      rpc: {
        call: async (...args) => { calls.push(args); return { ok: true, value: {} }; },
      },
    },
  };
  let props = null;
  ctx.slots.register = (options) => { props = options.inject(); return () => {}; };
  exports.apply(ctx);
  await props.rpcCall('home.config.save', { location: 'none', customPath: '', ownerName: '' }, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api');
  assert.equal(calls[0][1], 'dsh-lpipe-home');
  assert.deepEqual(structuredClone(calls[0][2]), {
    method: 'home.config.save',
    payload: { location: 'none', customPath: '', ownerName: '' },
  });
});

test('the status line separates disabled, active and invalid', async () => {
  const { exports } = await loadClient();
  const view = exports.__test__.statusView;

  const off = view({ state: 'disabled', valid: false, path: '', resolvedPath: '', error: '' });
  assert.equal(off.tone, 'off');
  assert.equal(off.path, '');
  assert.ok(off.text.includes('停用'));
  assert.equal(view(undefined).tone, 'off', 'no status yet is not an error');

  const ok = view({ state: 'active', valid: true, path: 'D:\\栖所', resolvedPath: 'D:\\栖所' });
  assert.equal(ok.tone, 'ok');
  assert.equal(ok.path, 'D:\\栖所');
  assert.ok(ok.text.includes('生效'));

  const bad = view({ state: 'invalid', valid: false, path: 'D:\\没有', resolvedPath: '', error: '栖所文件夹不存在。' });
  assert.equal(bad.tone, 'bad');
  assert.equal(bad.text, '栖所文件夹不存在。');
  assert.equal(bad.path, 'D:\\没有');

  const quiet = view({ state: 'invalid', valid: false, path: '', resolvedPath: '', error: '' });
  assert.equal(quiet.tone, 'bad');
  assert.ok(quiet.text.length > 0, 'an invalid state still says something');
});

test('a null config is a read failure, not the empty default', async () => {
  const { exports } = await loadClient();
  const readable = exports.__test__.hasReadableConfig;
  assert.equal(readable(null), false);
  assert.equal(readable(undefined), false);
  assert.equal(readable({ config: null, status: { state: 'invalid' } }), false);
  assert.equal(readable({ config: { location: 'none', customPath: '', ownerName: '' }, status: {} }), true);
});

test('the draft falls back to an unconfigured home without inventing a folder', async () => {
  const { exports } = await loadClient();
  const { draftOf, patchOf } = exports.__test__;

  assert.deepEqual(structuredClone(draftOf(null)), { location: 'none', customPath: '' });
  assert.deepEqual(structuredClone(draftOf({ location: 'nowhere', ownerName: 7, customPath: null })), {
    location: 'none',
    customPath: '',
  });
  assert.deepEqual(structuredClone(draftOf({ location: 'custom', ownerName: ' Kaczev ', customPath: 'D:\\栖所' })), {
    location: 'custom',
    customPath: 'D:\\栖所',
  });

  assert.deepEqual(structuredClone(patchOf({ ownerName: ' Kaczev ', location: 'custom', customPath: ' D:\\栖所 ' })), {
    location: 'custom',
    customPath: 'D:\\栖所',
  });
  assert.deepEqual(structuredClone(patchOf({ ownerName: '', location: 'workspace', customPath: 'D:\\旧路径' })), {
    location: 'workspace',
    customPath: 'D:\\旧路径',
  });
  assert.deepEqual(structuredClone(patchOf({})), { location: 'none', customPath: '' });
});

test('the three locations are always visible and marked pressed', async () => {
  const { exports } = await loadClient();
  const { SegmentedControl } = exports.__test__;
  const node = SegmentedControl({ value: 'workspace', disabled: false, onChange() {} });
  const buttons = node.props.children;
  assert.equal(buttons.length, 3);
  assert.deepEqual(texts(node), ['未选择', '工作区', '自定义']);
  assert.deepEqual(structuredClone(buttons.map((button) => button.props['aria-pressed'])), [false, true, false]);
});

test('the selected segment is a tinted pill, never a border or outline', async () => {
  const source = await readFile(new URL('../client/panel.js', import.meta.url), 'utf8');
  // The host defines border-l1/l2 only. A var that does not exist makes the whole
  // declaration invalid, and border-color falls back to currentColor: the selected
  // item then draws a white ring that reads as a second selection.
  assert.ok(!source.includes('var(--dsw-alias-border-l)'), 'border-l does not exist in the host theme');
  assert.ok(source.includes('var(--dsw-alias-border-l1)'));
  assert.ok(!/segButtonOn[\s\S]*?borderColor/.test(source), 'selection must not rely on a border');
  assert.ok(source.includes('border:0!important'), 'segment buttons must drop any host border');
  assert.ok(source.includes('rgba(94, 201, 180, 0.16)'), 'the selected pill keeps the series accent');
});

test('the client carries no owner credentials or hardcoded light surface', async () => {
  const source = await readFile(new URL('../client/panel.js', import.meta.url), 'utf8');
  for (const forbidden of ['weixin', 'qq', 'SESSDATA', 'document.cookie']) {
    assert.ok(!source.includes(forbidden), `${forbidden} must not reach the client`);
  }
  for (const token of ['text:', 'muted:', 'border:', 'bg:', 'soft:', 'hover:', 'danger:']) {
    assert.ok(source.includes(token), `theme token ${token} must stay a host alias`);
  }
  for (const literal of ["background: '#fff", "background: '#ffffff", "color: '#111827"]) {
    assert.ok(!source.includes(literal), `${literal} would paint over the dark theme`);
  }
});
