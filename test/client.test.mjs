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
  const react = { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {}, useCallback: (fn) => fn };
  return { definition, exports: definition.factory((id) => {
    if (id === 'react') return react;
    throw new Error(`unexpected require: ${id}`);
  }) };
}

test('the client bundle exposes a settings plugin and registers one section', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-life-pipline');
  assert.equal(exports.name, 'dsh-life-chat-settings');
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
  assert.equal(registered.length, 1);
  const [{ options, Component }] = registered;
  assert.equal(options.name, 'plugins.bundle.config');
  assert.equal(options.key, 'dsh-life-pipline');
  assert.equal(typeof Component, 'function');
  const props = options.inject();
  assert.equal(typeof props.rpcCall, 'function');
  const result = await props.rpcCall('chat.status', {});
  assert.deepEqual(result, { ok: true, value: {} });

  // The sidebar pin installs without a DOM (headless) and cleans up silently.
  assert.deepEqual(effects, ['dsh-life-chat: main session pin']);
  for (const stop of cleanups) assert.equal(typeof stop, 'function');
  for (const stop of cleanups) stop();
});
