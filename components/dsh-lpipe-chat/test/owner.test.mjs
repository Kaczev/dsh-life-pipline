import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, updateConfig } from '../src/config.mjs';
import { createChatRpcHandler } from '../src/rpc.mjs';
import { apply } from '../src/index.js';

function isolated(t) {
  const before = process.env.DSH_HOME;
  const root = mkdtempSync(join(tmpdir(), 'chat-owner-中文 '));
  process.env.DSH_HOME = root;
  t.after(() => { if (before === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = before; rmSync(root, { recursive: true, force: true }); });
  mkdirSync(join(root, 'life-home'));
  writeFileSync(join(root, 'life-home', 'config.json'), JSON.stringify({ ownerName: ' Legacy ', future: 1 }));
  return root;
}
test('adopts Home name once, preserves unknown data, and never resurrects a cleared name', async t => {
  const root = isolated(t);
  assert.equal(loadConfig().ownerName, 'Legacy');
  assert.equal(JSON.parse(readFileSync(join(root, 'life-home', 'config.json'))).future, 1);
  const handle = createChatRpcHandler({ getConfig: loadConfig, update: updateConfig, channels: {} });
  assert.equal((await handle('chat.config.save', { ownerName: '' })).ok, true);
  assert.equal(loadConfig().ownerName, '');
  assert.equal((await handle('chat.config.save', { ownerName: ' New ' })).value.config.ownerName, 'New');
  for (const ownerName of ['a\nb', 'x'.repeat(201), null, 7]) assert.equal((await handle('chat.config.save', { ownerName })).ok, false);
  assert.equal(loadConfig().ownerName, 'New');
});
test('an existing Chat name wins over legacy Home name', t => {
  isolated(t); saveConfig({ ownerName: 'Chat', future: 2 });
  assert.equal(loadConfig().ownerName, 'Chat');
  assert.equal(loadConfig().future, 2);
});
test('unreadable legacy file is not marked migrated and can be retried', t => {
  const root = isolated(t), file = join(root, 'life-home', 'config.json');
  writeFileSync(file, 'broken');
  assert.equal(loadConfig().ownerNameMigratedFromHome, undefined);
  writeFileSync(file, JSON.stringify({ ownerName: 'Recovered' }));
  assert.equal(loadConfig().ownerName, 'Recovered');
});
test('chat section is main-only, follows reassignment and dynamically reads Owner name', t => {
  const root = isolated(t); mkdirSync(join(root, 'life-pipline'));
  const setMain = id => writeFileSync(join(root, 'life-pipline', 'config.json'), JSON.stringify({ mainSessionId: id }));
  let section;
  const ctx = { logger: { warn() {}, info() {} }, effect() {}, inject(keys, fn) {
    if (keys.includes('systemPrompt')) fn({ systemPrompt: { section(value) { section = value; } } });
  } };
  apply(ctx);
  const text = id => section.text({ scope: { id, parentSession: 'main' } });
  assert.equal(text('main'), ''); setMain('main');
  assert.match(text('main'), /Legacy/);
  assert.match(text('main'), /only with the verified Owner in a private destination/);
  assert.equal(text('other'), ''); assert.equal(text('child'), ''); assert.equal(section.text({}), '');
  updateConfig(c => ({ ...c, ownerName: 'Updated' })); assert.match(text('main'), /Updated/);
  setMain('other'); assert.equal(text('main'), ''); assert.match(text('other'), /You are free to chat/);
  setMain(''); assert.equal(text('other'), '');
});
