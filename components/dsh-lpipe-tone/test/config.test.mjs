import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, MAX_TEXT_LENGTH, configFile, loadConfig, normalize, saveConfig, toneRoot } from '../src/config.mjs';

const withRoot = callback => {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-tone-'));
  try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

test('root follows DSH_HOME with life-tone suffix and defaults are empty copies', () => {
  const previous = process.env.DSH_HOME;
  try {
    delete process.env.DSH_HOME;
    assert.equal(toneRoot(), join(homedir(), '.dsh', 'life-tone'));
    process.env.DSH_HOME = '  custom-home  ';
    assert.equal(toneRoot(), join('custom-home', 'life-tone'));
    assert.equal(configFile(), join('custom-home', 'life-tone', 'config.json'));
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
  withRoot(root => {
    assert.deepEqual(loadConfig(root), { description: '', examples: '' });
    const copy = loadConfig(root); copy.description = 'changed';
    assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
    assert.ok(Object.isFrozen(DEFAULT_CONFIG));
  });
});

test('normalize preserves original text and allows tabs, CR, LF and Unicode', () => {
  const description = '  可可爱爱\t\r\n（状态）\n  ';
  const examples = '\n用户：你好\r\n助手：嗯～ 🐳\t ';
  assert.deepEqual(normalize({ description, examples, future: true }), { description, examples });
  assert.deepEqual(normalize({}), DEFAULT_CONFIG);
  assert.deepEqual(normalize({ description: ' ' }), { description: ' ', examples: '' });
});

test('normalize validates types, each text length and every forbidden control character', () => {
  for (const raw of [null, [], false, 'text', 1]) assert.throws(() => normalize(raw), TypeError);
  for (const key of ['description', 'examples']) {
    for (const value of [null, undefined, false, 1, {}, []]) assert.throws(() => normalize({ [key]: value }), TypeError);
    assert.equal(normalize({ [key]: 'x'.repeat(MAX_TEXT_LENGTH) })[key].length, 32000);
    assert.throws(() => normalize({ [key]: 'x'.repeat(MAX_TEXT_LENGTH + 1) }), TypeError);
    for (let code = 0; code <= 0x9f; code++) {
      if ((code < 0x20 && ![9, 10, 13].includes(code)) || code >= 0x7f) {
        assert.throws(() => normalize({ [key]: `a${String.fromCharCode(code)}b` }), TypeError, `control ${code}`);
      }
    }
  }
});

test('real storage creates directories, patches known fields and preserves disk unknown fields', () => withRoot(parent => {
  const root = join(parent, 'nested', 'life-tone');
  const description = ' \t亲近\r\n自然，不复读。  ';
  const examples = '\n用户：完成了吗？\n助手：完成了。\n ';
  assert.deepEqual(saveConfig({ description }, root), { description, examples: '' });
  assert.deepEqual(loadConfig(root), { description, examples: '' });
  const disk = JSON.parse(readFileSync(configFile(root), 'utf8'));
  disk.future = { enabled: true, items: [1, 'x'] };
  writeFileSync(configFile(root), JSON.stringify(disk));
  assert.deepEqual(saveConfig({ examples }, root), { description, examples });
  assert.deepEqual(loadConfig(root), { description, examples });
  assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')).future, disk.future);
  assert.deepEqual(readdirSync(root), ['config.json']);
  assert.deepEqual(saveConfig({ description: '', examples: '' }, root), DEFAULT_CONFIG);
}));

test('invalid PATCH never changes existing file', () => withRoot(root => {
  saveConfig({ description: 'original' }, root);
  const before = readFileSync(configFile(root), 'utf8');
  const invalid = [null, [], '', 0, {}, { unknown: 'x' }, { description: 'new', unknown: true }, { description: null }, { examples: '\0' }, { examples: 'a'.repeat(MAX_TEXT_LENGTH + 1) }];
  for (const patch of invalid) {
    assert.throws(() => saveConfig(patch, root), TypeError);
    assert.equal(readFileSync(configFile(root), 'utf8'), before);
    assert.deepEqual(readdirSync(root), ['config.json']);
  }
}));

test('corrupt JSON, non-object data and invalid persisted fields are not overwritten', () => withRoot(root => {
  for (const broken of ['broken', 'null', '[]', '42', '{"description":null}', '{"description":"\\u0000"}']) {
    writeFileSync(configFile(root), broken);
    assert.throws(() => loadConfig(root));
    assert.throws(() => saveConfig({ description: 'replacement' }, root));
    assert.equal(readFileSync(configFile(root), 'utf8'), broken);
    assert.deepEqual(readdirSync(root), ['config.json']);
  }
}));

test('unreadable configuration target is not treated as missing or replaced', () => withRoot(root => {
  mkdirSync(configFile(root));
  // A directory is never interpreted as absent or replaced by configuration.
  assert.throws(() => saveConfig({ description: 'text' }, root));
  assert.deepEqual(readdirSync(root), ['config.json']);
}));
