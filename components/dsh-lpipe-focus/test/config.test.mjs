import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_CONFIG,
  FIELD_BOUNDS,
  FocusConfigError,
  configFile,
  focusRoot,
  loadConfig,
  normalize,
  saveConfig,
} from '../src/config.mjs';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'lpipe-focus-config-'));
}

test('focusRoot follows DSH_HOME and missing file returns doubled character defaults without creating directories', () => {
  const dir = makeTempDir();
  const prev = process.env.DSH_HOME;
  try {
    process.env.DSH_HOME = dir;
    const root = focusRoot();
    assert.equal(root, join(dir, 'life-focus'));
    const cfg = loadConfig(root);
    assert.deepEqual(cfg, {
      allSessions: false,
      includeSubagents: true,
      idleMinutes: 60,
      compactChars: 512000,
      nudgeChars: 256000,
    });
    assert.equal(existsSync(root), false, 'missing config must not create empty directory');
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('normalize validates integer bounds and cross-field constraints', () => {
  assert.deepEqual(normalize({}), DEFAULT_CONFIG);
  assert.deepEqual(
    normalize({ allSessions: true, idleMinutes: 5, compactChars: 32000, nudgeChars: 32000 }),
    { allSessions: true, includeSubagents: true, idleMinutes: 5, compactChars: 32000, nudgeChars: 32000 },
  );

  // Out of bounds or non-integer
  for (const bad of [
    null,
    [],
    'str',
    { allSessions: 'true' },
    { allSessions: 1 },
    { idleMinutes: 4 },
    { idleMinutes: 1441 },
    { idleMinutes: 60.5 },
    { compactChars: 31999 },
    { compactChars: 4000001 },
    { nudgeChars: 15999 },
    { nudgeChars: 2000001 },
    { includeSubagents: 'false' },
    { includeSubagents: null },
    { compactChars: 100000, nudgeChars: 100001 },
  ]) {
    assert.throws(() => normalize(bad), FocusConfigError);
  }

  assert.equal(FIELD_BOUNDS.compactChars.default, 512000);
  assert.equal(FIELD_BOUNDS.nudgeChars.default, 256000);
});

test('corrupt or out-of-range disk config throws structured error and is never overwritten', () => {
  const root = makeTempDir();
  try {
    const file = configFile(root);
    writeFileSync(file, '{ broken json ');
    assert.throws(
      () => loadConfig(root),
      (err) => err instanceof FocusConfigError && err.code === 'focus/corrupt-config',
    );
    assert.throws(
      () => saveConfig({ idleMinutes: 45 }, root),
      (err) => err instanceof FocusConfigError && err.code === 'focus/corrupt-config',
    );
    assert.equal(readFileSync(file, 'utf8'), '{ broken json ', 'corrupt file must remain untouched');

    writeFileSync(file, JSON.stringify({ compactChars: 100000, nudgeChars: 200000 }));
    assert.throws(
      () => loadConfig(root),
      (err) => err instanceof FocusConfigError && err.code === 'focus/corrupt-config',
    );

    const dirTarget = join(root, 'dir-as-config');
    mkdirSync(dirTarget, { recursive: true });
    mkdirSync(configFile(dirTarget), { recursive: true });
    assert.throws(() => loadConfig(dirTarget), FocusConfigError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saveConfig supports partial updates, validates cross-field relations against saved config, and preserves unknown keys', () => {
  const root = makeTempDir();
  try {
    const file = configFile(root);
    writeFileSync(file, JSON.stringify({ idleMinutes: 90, customExtension: { keep: true } }, null, 2));

    const saved = saveConfig({ compactChars: 600000, nudgeChars: 200000 }, root);
    assert.deepEqual(saved, {
      allSessions: false,
      includeSubagents: true,
      idleMinutes: 90,
      compactChars: 600000,
      nudgeChars: 200000,
    });

    const toggled = saveConfig({ allSessions: true }, root);
    assert.equal(toggled.allSessions, true);
    assert.equal(toggled.compactChars, 600000);
    assert.equal(toggled.includeSubagents, true);
    assert.deepEqual(saveConfig({ includeSubagents: false }, root), { ...toggled, includeSubagents: false });
    assert.deepEqual(saveConfig({ idleMinutes: 40 }, root), { ...toggled, includeSubagents: false, idleMinutes: 40 });

    const rawOnDisk = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(rawOnDisk.customExtension, { keep: true });
    assert.equal(rawOnDisk.compactChars, 600000);

    // Lowering compactChars below existing saved nudgeChars (200000) must fail without modifying disk
    assert.throws(
      () => saveConfig({ compactChars: 150000 }, root),
      (err) => err instanceof FocusConfigError && err.code === 'focus/bad-request',
    );
    assert.equal(loadConfig(root).compactChars, 600000);

    // Reject unknown or empty patch fields
    for (const badPatch of [null, [], {}, { unknownKey: 1 }, { idleMinutes: '60' }, { allSessions: 'false' }, { includeSubagents: 1 }]) {
      assert.throws(() => saveConfig(badPatch, root), FocusConfigError);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
