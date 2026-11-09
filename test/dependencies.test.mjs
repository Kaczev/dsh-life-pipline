import test from 'node:test';
import assert from 'node:assert/strict';
import { createDependencyCoordinator, registerDependencies, prerequisites, CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';

function fixture(names = [CORE, ...COMPONENTS]) {
  const rows = new Map(names.map(name => [name, { moduleName: name, entryId: name, enabled: true }]));
  const calls = [], warnings = [];
  const manager = {
    async listPlugins() { return [...rows.values()].map(row => ({ ...row })); },
    async listBundles() { return [CORE, ...COMPONENTS].map(name => ({name, enabled: rows.has(name)})); },
    async setBundleEnabled(name, enabled) { calls.push(['bundle', name, enabled]); rows.set(name, {moduleName:name, entryId:name, enabled}); return {application:'applied', target:name}; },
    async setPluginEnabled(name, enabled) { calls.push(['plugin', name, enabled]); rows.get(name).enabled = enabled; return {application:'applied', target:name}; },
  };
  const coordinator = createDependencyCoordinator(manager, {warn: text => warnings.push(text)});
  return {rows, calls, warnings, coordinator, manager};
}

test('recall prerequisites are unique and topologically ordered', () => {
  assert.deepEqual(prerequisites('dsh-lpipe-recall'), [CORE, 'dsh-lpipe-memory', 'dsh-lpipe-starmap']);
});

test('standalone recall selects missing canonical bundles, without aggregate', async () => {
  const f = fixture(['dsh-lpipe-recall']);
  await f.coordinator.schedule(true);
  assert.deepEqual(f.calls.map(row => row[1]), [CORE, 'dsh-lpipe-memory', 'dsh-lpipe-starmap']);
  assert.deepEqual(f.warnings, []);
});

test('disabling memory cascades downstream and does not undo the user switch', async () => {
  const f = fixture(); await f.coordinator.schedule(true);
  f.rows.get('dsh-lpipe-memory').enabled = false;
  await f.coordinator.schedule();
  assert.deepEqual(f.calls, [['plugin','dsh-lpipe-recall',false], ['plugin','dsh-lpipe-starmap',false]]);
  await f.coordinator.schedule();
  assert.equal(f.rows.get('dsh-lpipe-memory').enabled, false);
  f.rows.get('dsh-lpipe-recall').enabled = true;
  await f.coordinator.schedule();
  assert.deepEqual(f.calls.slice(2), [['plugin','dsh-lpipe-memory',true], ['plugin','dsh-lpipe-starmap',true]]);
});

test('removing a prerequisite bundle cascades without silently reinstalling it', async () => {
  const f = fixture(); await f.coordinator.schedule(true);
  f.rows.delete('dsh-lpipe-memory'); await f.coordinator.schedule();
  assert.equal(f.rows.has('dsh-lpipe-memory'), false);
  assert.equal(f.rows.get('dsh-lpipe-recall').enabled, false);
});

test('disabling core switches off all dependents', async () => {
  const f = fixture(); await f.coordinator.schedule(true);
  f.rows.get(CORE).enabled = false; await f.coordinator.schedule();
  assert.equal(f.calls.length, COMPONENTS.length);
  assert.ok([...f.rows.values()].every(row => !row.enabled));
});

test('a repeated initial schedule does not resurrect explicitly disabled prerequisites', async () => {
  const f = fixture();
  await f.coordinator.schedule(true);
  f.rows.get('dsh-lpipe-memory').enabled = false;
  await f.coordinator.schedule(true);
  assert.equal(f.rows.get('dsh-lpipe-memory').enabled, false);
  assert.equal(f.rows.get('dsh-lpipe-starmap').enabled, false);
  assert.equal(f.rows.get('dsh-lpipe-recall').enabled, false);
});

test('failed prerequisite activation disables the child and reports the failure', async () => {
  const f = fixture(['dsh-lpipe-recall']);
  f.manager.setBundleEnabled = async name => ({application:'restart-required', target:name});
  await f.coordinator.schedule(true);
  assert.equal(f.rows.get('dsh-lpipe-recall').enabled, false);
  assert.match(f.warnings[0], /restart-required/);
});

test('live contexts share reconciliation and continue after one listener is disposed', async () => {
  const f = fixture();
  const listeners = new Set();
  const mount = () => {
    const cleanups = [];
    registerDependencies({ inject(_keys, fn) { fn({pluginManager:f.manager,
      on(_event, callback) { listeners.add(callback); cleanups.push(() => listeners.delete(callback)); },
      effect(fn) { cleanups.push(fn()); },
    }); } });
    return () => cleanups.reverse().forEach(fn => fn());
  };
  const first = mount(), second = mount();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  first();
  f.rows.get('dsh-lpipe-memory').enabled = false;
  await Promise.all([...listeners].map(fn => fn()));
  assert.equal(f.rows.get('dsh-lpipe-recall').enabled, false);
  assert.equal(f.rows.get('dsh-lpipe-starmap').enabled, false);
  second();
  assert.equal(listeners.size, 0);
});
