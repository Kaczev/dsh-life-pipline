import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { apply } from '../src/index.js';
import { DEFAULT_CONFIG, saveConfig, configFile } from '../src/config.mjs';
import { createToneRpcHandler, registerToneRpc } from '../src/rpc.mjs';
import { configPath } from 'dsh-life-core/internal/paths';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-tone-host-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  const mainFile = configPath(); mkdirSync(dirname(mainFile), { recursive: true });
  const bind = id => writeFileSync(mainFile, JSON.stringify({ mainSessionId: id }));
  bind('main');
  const settings = join(root, 'settings');
  const sections = new Set(), routes = new Set(), disposers = [];
  const ctx = {
    inject(keys, callback) { if (keys.includes('pluginManager')) return; callback(this); },
    effect(callback) { disposers.push(callback()); },
    systemPrompt: { section(section) { sections.add(section); return () => sections.delete(section); } },
    connection: { fetch: { register(route) { routes.add(route); return () => routes.delete(route); } } },
  };
  const close = () => {
    for (const dispose of disposers.reverse()) dispose?.();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  };
  return { root, settings, mainFile, bind, sections, routes, ctx, close };
}

const request = (body, options = {}) => new Request('http://localhost/api/dsh-lpipe-tone', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...options,
});
const envelope = (method, payload = {}) => ({ type: 'client-request', rpcId: 'tone-1', method: 'dsh-lpipe-tone', payload: { method, payload } });

test('prompt follows live main binding and saves, stays literal/stable, and disposes', async () => {
  const f = fixture();
  try {
    apply(f.ctx, { root: f.settings });
    const section = [...f.sections][0], route = [...f.routes][0];
    assert.equal(section.name, 'dsh-lpipe-tone'); assert.equal(section.interpolate, false);
    const main = () => section.text({ scope: { id: 'main' } });
    assert.match(main(), /Reply tone/);
    const patch = { diction: ' 用括号表示状态 {{name}}\n不要每句话叫名字。 ', syntax: '用户：忙吗？\n助手：（抬头）在呢。' };
    const result = await (await route.fetch(request(envelope('tone.config.save', patch)))).json();
    assert.deepEqual(result.result, { ok: true, value: { config: { ...DEFAULT_CONFIG, ...patch } } });
    assert.match(main(), /## Reply tone/); assert.ok(main().includes(patch.diction));
    assert.equal(main(), main());
    for (const scope of [undefined, {}, { id: 'child', parentSession: 'main' }, { id: 'other' }]) assert.equal(section.text({ scope }), '');
    f.bind('other'); assert.equal(main(), ''); assert.match(section.text({ scope: { id: 'other' } }), /Reply tone/);
    f.bind(''); assert.equal(section.text({ scope: { id: 'other' } }), '');
    f.bind('main');
    await route.fetch(request(envelope('tone.config.save', { diction: '', syntax: '', rhythm: '', expression: '' })));
    assert.equal(main(), '');
    saveConfig({ diction: '新语气' }, f.settings);
    assert.match(main(), /新语气/);
    writeFileSync(configFile(f.settings), 'broken');
    assert.throws(main); // Configuration failures are not silently presented as an empty saved preference.
    const failed = await (await route.fetch(request(envelope('tone.config')))).json();
    assert.equal(failed.result.ok, false);
    assert.equal(readFileSync(configFile(f.settings), 'utf8'), 'broken');
  } finally { f.close(); }
  assert.equal(f.sections.size, 0); assert.equal(f.routes.size, 0);
});

test('RPC validates envelopes, HTTP input and save failures without touching config', async () => {
  const f = fixture();
  try {
    apply(f.ctx, { root: f.settings }); const route = [...f.routes][0];
    const call = async body => (await (await route.fetch(request(body))).json());
    const read = (await call(envelope('tone.config'))).result.value;
    assert.deepEqual(read.config, DEFAULT_CONFIG);
    assert.deepEqual(read.defaults, DEFAULT_CONFIG);
    assert.equal((await call(envelope('unknown'))).result.error.code, 'tone/unknown-method');
    for (const payload of [null, [], {}, { diction: 42 }, { unknown: 'x' }]) assert.equal((await call(envelope('tone.config.save', payload))).result.ok, false);
    for (const body of [null, [], {}, { ...envelope('tone.config'), method: 'wrong' }, { ...envelope('tone.config'), payload: { method: 'tone.config' } }]) {
      const reply = await call(body); assert.equal(reply.result.error.code, 'tone/bad-request');
    }
    assert.equal((await route.fetch(new Request('http://localhost/api/dsh-lpipe-tone'))).status, 405);
    assert.equal((await route.fetch(request({}, { headers: { 'content-type': 'text/plain' } }))).status, 415);
    assert.equal((await route.fetch(request({}, { body: '{' }))).status, 400);
    const utf = await call(envelope('tone.config.save', { diction: '撒娇，但认真做事。' }));
    assert.equal(utf.rpcId, 'tone-1'); assert.equal(utf.type, 'server-response');
  } finally { f.close(); }
});

test('read and write errors are explicit failures', async () => {
  const handle = createToneRpcHandler({ load() { throw Error('read failed'); }, save() { throw Error('write failed'); } });
  assert.match((await handle('tone.config', {})).error.message, /read failed/);
  assert.match((await handle('tone.config.save', {})).error.message, /write failed/);
  let route; const disposer = () => {};
  assert.equal(registerToneRpc({ connection: { fetch: { register(value) { route = value; return disposer; } } } }, handle), disposer);
  assert.equal(route.path, '/api/dsh-lpipe-tone'); assert.deepEqual(route.methods, ['POST']);
});
