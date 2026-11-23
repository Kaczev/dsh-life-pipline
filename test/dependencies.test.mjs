import test from 'node:test';
import assert from 'node:assert/strict';
import { createDependencyCoordinator, registerDependencies, prerequisites, CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';

const retired = ['dsh-lpipe-starmap', 'dsh-lpipe-recall'];

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

test('memory and focus depend only on core', () => {
  assert.deepEqual(prerequisites('dsh-lpipe-memory'), [CORE]);
  assert.deepEqual(prerequisites('dsh-lpipe-focus'), [CORE]);
});

test('standalone memory selects only its missing core bundle', async () => {
  const f = fixture(['dsh-lpipe-memory']);
  await f.coordinator.schedule(true);
  assert.deepEqual(f.calls, [['bundle', CORE, true]]);
  assert.deepEqual(f.warnings, []);
});

test('standalone starmap and recall do not activate aggregate prerequisites', async () => {
  const f = fixture(retired);
  await f.coordinator.schedule(true);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.warnings, []);
});

test('disabling memory leaves other pipelines alone', async () => {
  const f = fixture([CORE, ...COMPONENTS, ...retired]); await f.coordinator.schedule(true);
  f.rows.get('dsh-lpipe-memory').enabled = false;
  await f.coordinator.schedule();
  assert.deepEqual(f.calls, []);
});

test('removing core cascades without silently reinstalling it', async () => {
  const f = fixture(); await f.coordinator.schedule(true);
  f.rows.delete(CORE); await f.coordinator.schedule();
  assert.equal(f.rows.has(CORE), false);
  assert.ok(COMPONENTS.every(name => !f.rows.get(name).enabled));
});

test('disabling core switches off only the retained dependents', async () => {
  const f = fixture([CORE, ...COMPONENTS, ...retired]); await f.coordinator.schedule(true);
  f.rows.get(CORE).enabled = false; await f.coordinator.schedule();
  assert.equal(f.calls.length, COMPONENTS.length);
  assert.ok(COMPONENTS.every(name => !f.rows.get(name).enabled));
  assert.ok(retired.every(name => f.rows.get(name).enabled));
});

test('a repeated initial schedule does not resurrect explicitly disabled prerequisites', async () => {
  const f = fixture();
  await f.coordinator.schedule(true);
  f.rows.get(CORE).enabled = false;
  await f.coordinator.schedule(true);
  assert.equal(f.rows.get(CORE).enabled, false);
  assert.equal(f.rows.get('dsh-lpipe-memory').enabled, false);
  assert.equal(f.rows.get('dsh-lpipe-focus').enabled, false);
});

test('failed prerequisite activation disables the child and reports the failure', async () => {
  const f = fixture(['dsh-lpipe-memory']);
  f.manager.setBundleEnabled = async name => ({application:'restart-required', target:name});
  await f.coordinator.schedule(true);
  assert.equal(f.rows.get('dsh-lpipe-memory').enabled, false);
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
  f.rows.get(CORE).enabled = false;
  await Promise.all([...listeners].map(fn => fn()));
  assert.equal(f.rows.get('dsh-lpipe-memory').enabled, false);
  assert.equal(f.rows.get('dsh-lpipe-focus').enabled, false);
  second();
  assert.equal(listeners.size, 0);
});
