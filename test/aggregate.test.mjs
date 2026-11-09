import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/aggregate.mjs';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';

test('aggregate selects canonical layers once, skipping standalone selections', async () => {
  const calls = [];
  const manager = {async listBundles() {return [{name:CORE,enabled:true}, {name:'dsh-lpipe-chat',enabled:true}];}, async setBundleEnabled(name, enabled) {calls.push([name,enabled]); return {application:'applied'};}};
  apply({inject(keys, fn) {if(keys.length === 1 && keys[0] === 'pluginManager') fn({pluginManager:manager,effect() {},on() {}});}});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, COMPONENTS.filter(name => name !== 'dsh-lpipe-chat').map(name => [name,true]));
});
