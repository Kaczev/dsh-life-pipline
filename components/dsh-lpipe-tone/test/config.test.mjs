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

test('root follows DSH_HOME; missing config returns the empty default', () => {
  const previous = process.env.DSH_HOME;
  try {
    delete process.env.DSH_HOME;
    assert.equal(toneRoot(), join(homedir(), '.dsh', 'life-tone'));
    process.env.DSH_HOME = '  custom-home  ';
    assert.equal(configFile(), join('custom-home', 'life-tone', 'config.json'));
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
  withRoot(root => {
    assert.deepEqual(loadConfig(root), { phrase: '', allSessions: false });
    loadConfig(root).phrase = 'changed';
    assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
  });
});

test('storage preserves literal text, empty text, scope and unknown fields', () => withRoot(parent => {
  const root = join(parent, 'nested');
  const phrase = ' \t自然 {{literal}}  ';
  assert.deepEqual(saveConfig({ phrase }, root), { phrase, allSessions: false });
  const disk = JSON.parse(readFileSync(configFile(root), 'utf8'));
  disk.future = { data: 1 }; writeFileSync(configFile(root), JSON.stringify(disk));
  assert.deepEqual(saveConfig({ allSessions: true }, root), { phrase, allSessions: true });
  assert.equal(loadConfig(root).phrase, phrase);
  saveConfig({ phrase: '' }, root);
  assert.deepEqual(loadConfig(root), { phrase: '', allSessions: true });
  assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')).future, disk.future);
  assert.deepEqual(readdirSync(root), ['config.json']);
}));

test('old fields are retained, not injected; explicitly disabled old tone stays off', () => withRoot(root => {
  for (const [legacy, expected] of [
    [{ diction: 'old', syntax: 'old', rhythm: '', expression: '', allSessions: true }, DEFAULT_CONFIG.phrase],
    [{ prompt: '## Tone\nYou like saying “呜……” when replying to the user.' }, ''],
    [{ description: 'old', examples: 'old' }, DEFAULT_CONFIG.phrase],
    [{ diction: ' ', syntax: '\n', rhythm: '', expression: '' }, ''],
  ]) {
    const original = JSON.stringify(legacy);
    writeFileSync(configFile(root), original);
    assert.equal(loadConfig(root).phrase, expected);
    assert.equal(readFileSync(configFile(root), 'utf8'), original);
    const config = saveConfig({ phrase: 'my new phrase' }, root);
    assert.equal(config.allSessions, legacy.allSessions ?? false);
    assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')), { ...legacy, ...config });
  }
}));

test('invalid config and invalid patches never overwrite persisted data', () => withRoot(root => {
  saveConfig({ phrase: 'original' }, root);
  const before = readFileSync(configFile(root), 'utf8');
  for (const patch of [null, [], '', {}, { diction: 'deprecated' }, { unknown: 1 }, { allSessions: 'false' }, { phrase: null }, { phrase: undefined }, { phrase: '\0' }, { phrase: 'x'.repeat(MAX_TEXT_LENGTH + 1) }]) {
    assert.throws(() => saveConfig(patch, root));
    assert.equal(readFileSync(configFile(root), 'utf8'), before);
  }
  assert.equal(normalize({ phrase: 'x'.repeat(MAX_TEXT_LENGTH) }).phrase.length, MAX_TEXT_LENGTH);
  for (let code = 0; code <= 0x9f; code++) {
    if ((code < 0x20 && code !== 9) || code >= 0x7f) assert.throws(() => normalize({ phrase: String.fromCharCode(code) }));
  }
  for (const broken of ['broken', 'null', '[]', '42', '{"allSessions":"true"}', '{"phrase":null}', '{"prompt":null}', '{"expression":null}']) {
    writeFileSync(configFile(root), broken);
    assert.throws(() => loadConfig(root));
    assert.throws(() => saveConfig({ phrase: '' }, root));
    assert.equal(readFileSync(configFile(root), 'utf8'), broken);
  }
}));

test('directory target is never treated as missing', () => withRoot(root => {
  mkdirSync(configFile(root));
  assert.throws(() => saveConfig({ phrase: '' }, root));
  assert.deepEqual(readdirSync(root), ['config.json']);
}));
