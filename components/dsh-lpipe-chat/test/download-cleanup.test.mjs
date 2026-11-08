import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupDownloads, retentionDays } from '../src/download-cleanup.mjs';
import { defaultConfig } from '../src/config.mjs';
import { createChatRpcHandler } from '../src/rpc.mjs';

test('download retention only deletes expired immediate regular files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chat-retention-'));
  const now = Date.now();
  for (const [name, age] of [['old.txt', 8], ['boundary.txt', 7], ['new.txt', 1]]) {
    const path = join(directory, name);
    writeFileSync(path, name);
    const time = new Date(now - age * 86400000);
    utimesSync(path, time, time);
  }
  mkdirSync(join(directory, 'nested'));
  writeFileSync(join(directory, 'nested', 'keep.txt'), 'keep');
  const result = cleanupDownloads({}, { directory, now });
  assert.deepEqual(result, ['old.txt']);
  assert.ok(existsSync(join(directory, 'boundary.txt')));
  assert.ok(existsSync(join(directory, 'new.txt')));
  assert.ok(existsSync(join(directory, 'nested', 'keep.txt')));
  assert.deepEqual(cleanupDownloads({ downloadRetentionDays: 30 }, { directory, now }), []);
  assert.deepEqual(cleanupDownloads({}, { directory: join(directory, 'missing'), now }), []);
  assert.equal(retentionDays({ downloadRetentionDays: -1 }), 7);
  assert.equal(defaultConfig().downloadRetentionDays, 7);
});
test('retention setting validates atomically and preserves other config', async () => {
  let config = { quietSeconds: 1, windowSeconds: 5, downloadRetentionDays: 7, unrelated: true };
  const rpc = createChatRpcHandler({ getConfig: () => config, update: fn => { config = fn(config); }, channels: {} });
  for (const value of [0, -1, 1.5, 'bad', 36501]) {
    assert.equal((await rpc('chat.config.save', { downloadRetentionDays: value, quietSeconds: 2 })).ok, false);
    assert.equal(config.quietSeconds, 1);
  }
  const result = await rpc('chat.config.save', { downloadRetentionDays: 14 });
  assert.equal(result.ok, true);
  assert.equal(result.value.config.downloadRetentionDays, 14);
  assert.equal(config.unrelated, true);
});
