import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, MAX_TEXT_LENGTH, TEXT_KEYS, configFile, loadConfig, normalize, saveConfig, toneRoot } from '../src/config.mjs';

const keys = TEXT_KEYS;
const emptyText = Object.fromEntries(keys.map(key => [key, '']));
const empty = { ...emptyText, allSessions: false };
const withRoot = callback => {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-tone-'));
  try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

test('root follows DSH_HOME and missing config returns independent English defaults', () => {
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
    assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
    const copy = loadConfig(root); copy.diction = 'changed';
    assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
    assert.ok(Object.isFrozen(DEFAULT_CONFIG));
    assert.deepEqual(keys, ['diction', 'syntax', 'rhythm', 'expression']);
    for (const value of keys.map(key => DEFAULT_CONFIG[key])) assert.ok(value && !/[^\x00-\x7f]/u.test(value));
  });
});

test('normalize preserves text, explicit empty values, and fills only missing keys', () => {
  const diction = '  可可爱爱\t\r\n（状态）\n  ';
  assert.deepEqual(normalize({ diction, future: true }), { ...DEFAULT_CONFIG, diction });
  assert.deepEqual(normalize({}), DEFAULT_CONFIG);
  assert.deepEqual(normalize(empty), empty);
});

test('all four fields validate types, length and forbidden controls', () => {
  for (const raw of [null, [], false, 'text', 1]) assert.throws(() => normalize(raw), TypeError);
  for (const key of keys) {
    for (const value of [null, undefined, false, 1, {}, []]) assert.throws(() => normalize({ [key]: value }), TypeError);
    assert.equal(normalize({ [key]: 'x'.repeat(MAX_TEXT_LENGTH) })[key].length, 32000);
    assert.throws(() => normalize({ [key]: 'x'.repeat(MAX_TEXT_LENGTH + 1) }), TypeError);
    for (let code = 0; code <= 0x9f; code++) {
      if ((code < 0x20 && ![9, 10, 13].includes(code)) || code >= 0x7f) {
        assert.throws(() => normalize({ [key]: `a${String.fromCharCode(code)}b` }), TypeError);
      }
    }
  }
});

test('real storage patches four fields, preserves unknowns, and cleared values survive reload', () => withRoot(parent => {
  const root = join(parent, 'nested', 'life-tone');
  const diction = ' \t自然\r\n不复读。  ';
  assert.deepEqual(saveConfig({ diction }, root), { ...DEFAULT_CONFIG, diction });
  const disk = JSON.parse(readFileSync(configFile(root), 'utf8'));
  disk.future = { enabled: true }; writeFileSync(configFile(root), JSON.stringify(disk));
  for (const key of keys) {
    assert.equal(saveConfig({ [key]: `\n${key}\t ` }, root)[key], `\n${key}\t `);
  }
  assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')).future, disk.future);
  assert.deepEqual(saveConfig(emptyText, root), empty);
  assert.deepEqual(loadConfig(root), empty);
  assert.deepEqual(readdirSync(root), ['config.json']);
}));

test('legacy blank config gets defaults; nonblank legacy text requires explicit migration and is retained', () => withRoot(root => {
  writeFileSync(configFile(root), JSON.stringify({ description: '', examples: '' }));
  assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
  const legacy = { description: '原来的描述', examples: '原示例', future: 1 };
  writeFileSync(configFile(root), JSON.stringify(legacy));
  assert.throws(() => loadConfig(root), /旧语气/);
  assert.throws(() => saveConfig({ diction: 'new' }, root), /旧语气/);
  assert.throws(() => saveConfig({ allSessions: true }, root), /旧语气/);
  assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')), legacy);
  assert.deepEqual(saveConfig(emptyText, root), empty);
  assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')), { ...legacy, ...empty });
}));

test('invalid patches and malformed persisted config never overwrite data', () => withRoot(root => {
  saveConfig({ diction: 'original' }, root);
  const before = readFileSync(configFile(root), 'utf8');
  for (const patch of [null, [], '', 0, {}, { description: 'old' }, { unknown: 'x' }, { diction: null }, { syntax: '\0' }, { rhythm: 'x'.repeat(MAX_TEXT_LENGTH + 1) }]) {
    assert.throws(() => saveConfig(patch, root), TypeError);
    assert.equal(readFileSync(configFile(root), 'utf8'), before);
  }
  for (const broken of ['broken', 'null', '[]', '42', '{"allSessions":"true"}', '{"expression":null}', '{"rhythm":"\\u0000"}']) {
    writeFileSync(configFile(root), broken);
    assert.throws(() => loadConfig(root));
    assert.throws(() => saveConfig(emptyText, root));
    assert.equal(readFileSync(configFile(root), 'utf8'), broken);
  }
}));

test('directory target is never treated as missing', () => withRoot(root => {
  mkdirSync(configFile(root));
  assert.throws(() => saveConfig(emptyText, root));
  assert.deepEqual(readdirSync(root), ['config.json']);
}));

test('scope defaults off for existing text; strict scope-only patches preserve all text and unknown keys', () => withRoot(root => {
  const text = { ...emptyText, diction: '措辞\r\n ', expression: '\t显隐' };
  const original = { ...text, future: { data: 'keep' } };
  writeFileSync(configFile(root), JSON.stringify(original));
  assert.deepEqual(loadConfig(root), { ...text, allSessions: false });
  const before = readFileSync(configFile(root), 'utf8');
  for (const value of [null, undefined, 0, 1, '', 'false', {}, []]) {
    assert.throws(() => normalize({ allSessions: value }), /布尔/);
    assert.throws(() => saveConfig({ allSessions: value }, root), /布尔/);
    assert.equal(readFileSync(configFile(root), 'utf8'), before);
  }
  assert.deepEqual(saveConfig({ allSessions: true }, root), { ...text, allSessions: true });
  assert.deepEqual(JSON.parse(readFileSync(configFile(root), 'utf8')), { ...original, allSessions: true });
  assert.deepEqual(saveConfig(emptyText, root), { ...emptyText, allSessions: true });
  assert.deepEqual(loadConfig(root), { ...emptyText, allSessions: true });
  assert.deepEqual(saveConfig({ allSessions: false }, root), empty);
}));
