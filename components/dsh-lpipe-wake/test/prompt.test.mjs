import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.js';
import { saveConfig } from '../../../src/config.mjs';

test('wake guidance has a level-two heading and follows only the current main session', t => {
  const before = process.env.DSH_HOME;
  const root = mkdtempSync(join(tmpdir(), 'wake-prompt-'));
  process.env.DSH_HOME = root;
  t.after(() => {
    if (before === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = before;
    rmSync(root, { recursive: true, force: true });
  });
  let section;
  apply({ logger: { warn() {}, info() {} }, effect() {}, inject(keys, fn) {
    if (keys.includes('systemPrompt')) fn({ systemPrompt: { section(value) { section = value; } } });
  } });
  const text = id => section.text({ scope: { id, parentSession: 'main' } });
  assert.equal(text('main'), '');
  saveConfig({ mainSessionId: 'main' });
  assert.ok(text('main').startsWith('## Lpipe Wake — Self-wake and planned wake\n\n'));
  assert.match(text('main'), /You may use wake_set in any turn/);
  assert.match(text('main'), /This does not require a user request/);
  assert.match(text('main'), /You may follow that plan or change your mind/);
  assert.doesNotMatch(text('main'), /Bilibili|home folder|Owner/);
  assert.match(text('main'), /doing nothing is valid/);
  assert.match(text('main'), /do not use ask_user_question/);
  assert.equal(text('ordinary'), '');
  assert.equal(text('child'), '');
  assert.equal(section.text({}), '');
  saveConfig({ mainSessionId: 'next' });
  assert.equal(text('main'), '');
  assert.match(text('next'), /^## Lpipe Wake/);
  saveConfig({ mainSessionId: '' });
  assert.equal(text('next'), '');
});
