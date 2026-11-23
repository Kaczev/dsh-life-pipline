import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/aggregate.mjs';

const layers = ['dsh-life-core', 'dsh-lpipe-chat', 'dsh-lpipe-home', 'dsh-lpipe-bili', 'dsh-lpipe-wake', 'dsh-lpipe-memory', 'dsh-lpipe-tone', 'dsh-lpipe-focus'];

test('published aggregate depends on core and the seven retained pipelines', () => {
  const { dependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(dependencies).filter(name => name === 'dsh-life-core' || name.startsWith('dsh-lpipe-')).sort(), [...layers].sort());
});

test('aggregate selects retained layers once, skipping standalone selections', async () => {
  const calls = [];
  const manager = {
    async listPlugins() { return []; },
    async listBundles() { return [{name:'dsh-lpipe-chat',enabled:true}]; },
    async setBundleEnabled(name, enabled) { calls.push([name,enabled]); return {application:'applied'}; },
  };
  apply({inject(keys, fn) {if(keys.length === 1 && keys[0] === 'pluginManager') fn({pluginManager:manager,effect() {},on() {}});}});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, layers.filter(name => name !== 'dsh-lpipe-chat').map(name => [name,true]));
});
