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
  const react = { createElement: (type, props, ...children) => ({ type, props, children }) };
  return {
    definition,
    exports: definition.factory((id) => {
      if (id === 'react') return react;
      throw new Error(`unexpected require: ${id}`);
    }),
  };
}

test('the common client half owns the shared Settings page', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-life-pipline');
  assert.equal(exports.name, 'dsh-life-pipline-settings');
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
  };
  exports.apply(ctx);

  assert.equal(registered.length, 1, 'the page is the only Settings entry the series adds');
  const { options: page, Component } = registered[0];
  assert.equal(page.name, 'settings.section');
  assert.equal(page.id, 'lpipe');
  assert.equal(page.order, 60);
  assert.equal(page.label(), 'Lpipe 设置');
  assert.deepEqual(Object.keys(page.children), ['lpipe.settings.panel']);
  assert.equal(page.children['lpipe.settings.panel'].kind, 'list');
  assert.equal(page.children['lpipe.settings.panel'].scope, 'root');
  assert.equal(typeof Component, 'function');
});

test('the page renders whatever the installed components registered', async () => {
  const { exports } = await loadClient();
  const { LpipeSettingsPage, PANEL_SLOT } = exports.__test__;
  assert.equal(PANEL_SLOT, 'lpipe.settings.panel');

  const asked = [];
  const tree = LpipeSettingsPage({
    rpcCall: async () => ({ ok: true, value: { mainSessionId: '', session: null } }),
    renderSlot: (slot, props) => {
      asked.push([slot, props]);
      return { type: 'blocks' };
    },
  });
  // The bundle runs in its own realm, so compare structurally, not by prototype.
  assert.equal(asked.length, 1);
  assert.equal(asked[0][0], 'lpipe.settings.panel');
  assert.deepEqual(Object.keys(asked[0][1]), []);
  const column = tree.children[1];
  const body = column.children[1];
  assert.equal(JSON.stringify(body.children), JSON.stringify([{ type: 'blocks' }]), 'the blocks are rendered in order');
  assert.ok(column.children[0]?.type, 'the common block sits above the component blocks');

  // A host that hands no binding still paints the page shell.
  const bare = LpipeSettingsPage({});
  assert.equal(bare.children[1].children[0], null, 'without an RPC binding the common block is skipped');
  assert.equal(bare.children[1].children[1].children[0], null, 'an unbound host renders an empty body, not a crash');
});

test('a plugin without slots does not throw', async () => {
  const { exports } = await loadClient();
  assert.doesNotThrow(() => exports.apply({}));
});
