import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, configFile, loadConfig, saveConfig, validateHome } from '../src/config.mjs';
import { homePrompt } from '../src/prompt.mjs';
import { apply } from '../src/index.js';
import { createHomeRpcHandler, registerHomeRpc } from '../src/rpc.mjs';
import { configPath } from '../../../src/paths.mjs';

const temp = () => mkdtempSync(join(tmpdir(), 'lpipe-home-'));
test('default is unselected; disabled does not even ask for workspace', () => {
  const root = temp();
  try { assert.deepEqual(loadConfig(root), DEFAULT_CONFIG); assert.equal(validateHome(DEFAULT_CONFIG, () => { throw Error('must not run'); }).state, 'disabled'); assert.equal(homePrompt(DEFAULT_CONFIG, validateHome(DEFAULT_CONFIG)), ''); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test('save patches preserve unknown keys, rejects bad fields and corrupt data', () => {
  const root = temp();
  try {
    writeFileSync(configFile(root), JSON.stringify({ future: 1 }));
    saveConfig({ customPath: ' path ' }, root);
    assert.equal(loadConfig(root).customPath, 'path'); assert.equal(JSON.parse(readFileSync(configFile(root))).future, 1);
    for (const patch of [{ location: 'bad' }, { customPath: 'x\ny' }, { qq: '123' }, { location: null }]) assert.throws(() => saveConfig(patch, root));
    writeFileSync(configFile(root), 'broken'); assert.throws(() => saveConfig({ location: 'none' }, root)); assert.equal(readFileSync(configFile(root), 'utf8'), 'broken');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('existing directory, workspace changes and deletion are checked afresh', () => {
  const root = temp(); const folder = join(root, 'folder'); mkdirSync(folder);
  try {
    const custom = { ...DEFAULT_CONFIG, location: 'custom', customPath: folder };
    assert.equal(validateHome(custom).valid, true);
    assert.equal(validateHome({ ...custom, customPath: configFile(root) }).state, 'invalid');
    writeFileSync(configFile(root), '{}'); assert.match(validateHome({ ...custom, customPath: configFile(root) }).error, /不是文件夹/);
    assert.equal(validateHome({ ...custom, customPath: 'relative' }).state, 'invalid');
    const workspace = { ...DEFAULT_CONFIG, location: 'workspace' }; let path = folder;
    assert.equal(validateHome(workspace, () => path).valid, true); path = join(root, 'missing'); assert.equal(validateHome(workspace, () => path).valid, false);
    rmSync(folder, { recursive: true }); assert.equal(validateHome(custom).valid, false); assert.equal(homePrompt(custom, validateHome(custom)), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('English prompt quotes data, restricts sending and grants in-folder edits', () => {
  const config = { ...DEFAULT_CONFIG, ownerName: 'A " B' }; const status = { state: 'active', valid: true, resolvedPath: 'C:\\personal' };
  const text = homePrompt(config, status);
  assert.ok(text.startsWith('## Personal home folder\n')); assert.ok(!text.includes(JSON.stringify(config.ownerName)));
  assert.match(text, /space to use freely/);
  assert.match(text, /without a user request/);
  assert.match(text, /create, edit, overwrite, move, and delete/); assert.match(text, /verified private destination/); assert.match(text, /symbolic links/); assert.match(text, /A group is not a private destination/);
  assert.ok(!homePrompt(DEFAULT_CONFIG, status).includes("owner's configured name"));
});
test('component scopes live prompt to current main, follows its cwd and stops after unset', async () => {
  const root = temp(); const previous = process.env.DSH_HOME; process.env.DSH_HOME = root;
  let section, route; const disposers = []; let cwd = root; let requested;
  mkdirSync(join(root, 'life-pipline'), { recursive: true });
  // Use the common package's own path rule rather than assuming its storage directory.
  const commonFile = configPath(); mkdirSync(join(commonFile, '..'), { recursive: true }); writeFileSync(commonFile, JSON.stringify({ mainSessionId: 'main' }));
  const ctx = { inject(_keys, callback) { callback(this); }, effect(callback) { disposers.push(callback()); },
    sessions: { get(id) { requested = id; return id === 'main' ? { id } : undefined; } }, workingDirectory: { get: () => cwd },
    systemPrompt: { section(value) { section = value; return () => {}; } }, connection: { fetch: { register(value) { route = value; return () => {}; } } } };
  try {
    apply(ctx, { root: join(root, 'settings') }); assert.equal(section.text({ scope: { id: 'main' } }), '');
    saveConfig({ location: 'workspace' }, join(root, 'settings'));
    assert.match(section.text({ scope: { id: 'main' } }), /^## Personal home folder/); assert.equal(requested, 'main');
    assert.equal(section.text({ scope: { id: 'child', parentSession: 'main' } }), '');
    assert.equal(section.text({}), '');
    writeFileSync(commonFile, JSON.stringify({ mainSessionId: 'other' }));
    assert.equal(section.text({ scope: { id: 'main' } }), '');
    assert.equal(section.text({ scope: { id: 'other' } }), ''); // no resolvable workspace for new main
    writeFileSync(commonFile, JSON.stringify({ mainSessionId: '' }));
    assert.equal(section.text({ scope: { id: 'main' } }), '');
    writeFileSync(commonFile, JSON.stringify({ mainSessionId: 'main' }));
    assert.equal(section.text({ scope: { id: 'child' } }), ''); cwd = join(root, 'missing'); assert.equal(section.text({ scope: { id: 'main' } }), '');
    cwd = root; saveConfig({ location: 'none' }, join(root, 'settings')); assert.equal(section.text({ scope: { id: 'main' } }), '');
    assert.equal(route.path, '/api/dsh-lpipe-home');
  } finally { for (const dispose of disposers.reverse()) dispose?.(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(root, { recursive: true, force: true }); }
});
test('RPC returns validation separately from save success and validates envelope', async () => {
  const root = temp(); const snapshot = () => { const config = loadConfig(root); return { config, status: validateHome(config) }; };
  const handle = createHomeRpcHandler({ snapshot, save: patch => saveConfig(patch, root), validate: draft => ({ status: validateHome(draft) }) });
  try {
    const result = await handle('home.config.save', { location: 'custom', customPath: join(root, 'absent') }); assert.equal(result.ok, true); assert.equal(result.value.status.state, 'invalid');
    assert.equal((await handle('home.config.save', { location: 'none' })).value.status.state, 'disabled'); assert.equal((await handle('bad', {})).ok, false);
    let route; registerHomeRpc({ connection: { fetch: { register(value) { route = value; } } } }, handle);
    const request = body => new Request('http://localhost/api/dsh-lpipe-home', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const reply = await (await route.fetch(request({ type: 'client-request', rpcId: '1', method: 'dsh-lpipe-home', payload: { method: 'home.config', payload: {} } }))).json(); assert.equal(reply.result.value.status.state, 'disabled'); assert.equal(reply.rpcId, '1');
    assert.equal((await (await route.fetch(request({}))).json()).result.ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
