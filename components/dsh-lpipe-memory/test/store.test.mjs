import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  applyToolMutation, applyUiMutation, createMemoryState, MemoryError, openMemoryStore,
  validateMemoryState, validateToolInput, validateUiInput,
} from '../src/store.mjs';

const storeId = '8862812f-5a93-4948-b1ee-ef5417c2fe89';
const update = (id, text) => ({ action: 'update', id, text });
const remove = (id) => ({ action: 'remove', id });
const add = (kind, text) => ({ kind, action: 'add', text });
const config = (kind, enabled, maxEntries, maxTextLength) => ({
  kind, action: 'configure', config: { enabled, maxEntries, maxTextLength },
});
const isError = (code, info = {}) => ({ name: 'MemoryError', code, ...info });

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-memory-store-'));
  const dir = join(home, 'memory');
  const stores = [];
  t.after(async () => {
    await Promise.all(stores.map((store) => store.close()));
    await rm(home, { recursive: true, force: true });
  });
  return {
    home, dir, file: join(dir, 'state.json'), temp: join(dir, 'state.json.tmp'),
    initTemp: join(dir, 'state.json.init.tmp'), lock: join(dir, 'state.lock'),
    async open() { const store = await openMemoryStore(home); stores.push(store); return store; },
  };
}

const storeUrl = new URL('../src/store.mjs', import.meta.url).href;
function childHost(home, body) {
  return spawn(process.execPath, ['--input-type=module', '--eval', `
    import {openMemoryStore, applyUiMutation} from ${JSON.stringify(storeUrl)};
    import {writeFile} from 'node:fs/promises';
    import {join} from 'node:path';
    const home = process.argv[1];
    try { ${body} }
    catch (error) {
      if (error.code === 'store_locked') { process.send({locked: true}); process.disconnect(); }
      else throw error;
    }
  `, home], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
}

function nextMessage(child) {
  return new Promise((resolve, reject) => {
    const clear = () => { child.off('message', message); child.off('exit', exited); child.off('error', failed); };
    const message = (payload) => { clear(); resolve(payload); };
    const exited = (code, signal) => { clear(); reject(new Error(`Child exited before producing a result: ${code}/${signal}`)); };
    const failed = (error) => { clear(); reject(error); };
    child.once('message', message); child.once('exit', exited); child.once('error', failed);
  });
}

test('tool and UI shapes are exact; only the wish tool accepts a read', () => {
  const empty = {};
  assert.equal(validateToolInput('wishes', empty), empty);
  assert.throws(() => validateToolInput('settings', empty), isError('invalid_input'));
  assert.throws(() => applyToolMutation(createMemoryState(), 'wishes', empty), isError('invalid_input'));
  for (const invalid of [null, [], { id: 'foo' }, update('A', 'x'), update('a\n', 'x'), update('a--b', 'x'),
    update('a'.repeat(33), 'x'), update('a', ''), update('a', '😀'.repeat(501)), { ...remove('foo'), text: 'x' },
    { action: 'updat', id: 'foo', text: 'x' }, JSON.parse('{"__proto__":1}')]) {
    assert.throws(() => validateToolInput('wishes', invalid), isError('invalid_input'));
  }
  const max = update('a'.repeat(32), '😀'.repeat(500));
  assert.equal(validateToolInput('settings', max), max);
  const valid = config('wishes', false, 32, 500);
  assert.equal(validateUiInput(valid), valid);
  for (const invalid of [config('bad', false, 32, 500), config('wishes', 'false', 32, 500),
    config('wishes', true, 1.5, 500), config('wishes', true, 0, 500), config('wishes', true, 33, 500),
    config('wishes', true, 1, 501), { ...add('wishes', 'x'), id: 'a' }]) {
    assert.throws(() => validateUiInput(invalid), isError('invalid_input'));
  }
});

test('pure mutations enforce per-kind limits, normalize Unicode text and preserve entry IDs', () => {
  const state = createMemoryState(storeId);
  assert.deepEqual(state, {
    version: 1, storeId, nextUiId: 1, allSessions: false,
    wishes: { enabled: true, maxEntries: 8, maxTextLength: 120, entries: [] },
    settings: { enabled: true, maxEntries: 12, maxTextLength: 160, entries: [] },
  });
  assert.deepEqual(applyUiMutation(state, config('wishes', false, 1, 3)), { outcome: 'configured' });
  assert.deepEqual(applyUiMutation(state, add('wishes', ' 😺\r\n字 ')), { outcome: 'created', id: 'ui-1', text: '😺\n字' });
  const before = structuredClone(state);
  assert.throws(() => applyToolMutation(state, 'wishes', update('new', 'x')), isError('entry_limit', { limit: 1 }));
  assert.throws(() => applyToolMutation(state, 'wishes', update('ui-1', 'abcd')), isError('text_limit', { field: 'text', limit: 3 }));
  assert.throws(() => applyToolMutation(state, 'wishes', update('ui-1', ' \r\n ')), isError('empty_text'));
  assert.throws(() => applyUiMutation(state, config('wishes', true, 1, 2)), isError('text_limit', { field: 'maxTextLength', limit: 2 }));
  assert.throws(() => applyUiMutation(state, { kind: 'wishes', ...update('unknown', 'x') }), isError('not_found'));
  assert.throws(() => applyUiMutation(state, { kind: 'wishes', ...remove('unknown') }), isError('not_found'));
  assert.throws(() => applyToolMutation(state, 'wishes', update('ui-2', 'x')), isError('reserved_id'));
  assert.throws(() => applyToolMutation(state, 'wishes', remove('unknown')), isError('not_found'));
  assert.deepEqual(state, before);
  assert.deepEqual(applyToolMutation(state, 'wishes', update('ui-1', '🧪')), { outcome: 'updated', id: 'ui-1', text: '🧪' });
  assert.deepEqual(applyToolMutation(state, 'settings', update('my-id', ' x\ry ')), { outcome: 'created', id: 'my-id', text: 'x\ny' });
  assert.deepEqual(applyToolMutation(state, 'settings', update('my-id', 'x')), { outcome: 'updated', id: 'my-id', text: 'x' });
  assert.deepEqual(applyToolMutation(state, 'wishes', remove('ui-1')), { outcome: 'removed', id: 'ui-1' });
  assert.equal(applyUiMutation(state, add('settings', 'x')).id, 'ui-2');
  assert.throws(() => applyUiMutation(state, config('settings', true, 1, 20)), isError('entry_limit', { field: 'maxEntries', limit: 1 }));
  assert.equal(validateMemoryState(state), state);
});

test('legacy v1 state defaults to main-only and persists an explicit scope independently of entries', async t => {
  const f = await fixture(t);
  await mkdir(f.dir);
  const legacy = createMemoryState(storeId);
  applyUiMutation(legacy, add('settings', 'existing'));
  delete legacy.allSessions;
  await writeFile(f.file, JSON.stringify(legacy));
  const store = await f.open();
  assert.deepEqual(store.read(), { ...legacy, allSessions: false });
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), legacy);
  await store.transact(draft => { draft.allSessions = true; });
  await store.close();
  const reopened = await f.open();
  assert.deepEqual(reopened.read(), { ...legacy, allSessions: true });
  await reopened.close();
  await writeFile(f.file, JSON.stringify({ ...legacy, allSessions: 'false' }));
  await assert.rejects(f.open(), isError('store_corrupt'));
});

test('queued writes read their predecessor; rejected drafts and snapshots cannot change state', async (t) => {
  const f = await fixture(t);
  const archive = join(f.home, 'archive');
  await mkdir(archive); await writeFile(join(archive, 'manifest.json'), 'old archive');
  const store = await f.open();
  const storeId = store.read().storeId;
  const seedSnapshot = store.read(); seedSnapshot.wishes.entries.push({ id: 'fake', text: 'x' });
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const calls = [];
  const first = store.transact(async (draft) => {
    calls.push(draft.nextUiId);
    started.resolve(); await gate.promise;
    const result = applyUiMutation(draft, add('wishes', 'first'));
    return { result, draft };
  });
  const rejected = store.transact((draft) => {
    calls.push(draft.nextUiId);
    applyUiMutation(draft, add('settings', 'not committed'));
    throw new MemoryError('rejected', 'rejected');
  });
  const rejection = assert.rejects(rejected, isError('rejected'));
  const third = store.transact((draft) => {
    calls.push(draft.nextUiId);
    return applyUiMutation(draft, add('settings', 'second'));
  });
  await started.promise;
  try { assert.equal(store.read().nextUiId, 1); assert.deepEqual(store.read().wishes.entries, []); }
  finally { gate.resolve(); }
  const { result, draft } = await first;
  assert.equal(result.id, 'ui-1'); draft.wishes.entries[0].text = 'external';
  await rejection;
  assert.equal((await third).id, 'ui-2');
  assert.deepEqual(calls, [1, 2, 2]);
  assert.deepEqual(store.read().wishes.entries, [{ id: 'ui-1', text: 'first' }]);
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), store.read());
  await store.transact((draft) => applyUiMutation(draft, { kind: 'wishes', ...remove('ui-1') }));
  await assert.rejects(store.transact((draft) => { draft.wishes.entries.push({ id: 'ui-1', text: 'reuse' }); }), isError('store_corrupt'));
  await assert.rejects(store.transact((draft) => { draft.nextUiId -= 1; }), isError('store_corrupt'));
  await store.close();
  assert.throws(() => store.read(), isError('store_closed'));
  await assert.rejects(store.transact(() => {}), isError('store_closed'));
  const reopened = await f.open();
  assert.equal(reopened.read().storeId, storeId);
  assert.deepEqual(reopened.read().wishes.entries, []);
  assert.equal((await reopened.transact((draft) => applyUiMutation(draft, add('wishes', 'third')))).id, 'ui-3');
  assert.equal(await readFile(join(archive, 'manifest.json'), 'utf8'), 'old archive');
});

test('close seals the queue but drains already admitted writes before releasing the lock', async (t) => {
  const f = await fixture(t), store = await f.open();
  const gate = Promise.withResolvers();
  const task = store.transact(async (draft) => { await gate.promise; return applyUiMutation(draft, add('wishes', 'queued')); });
  const closing = store.close();
  assert.equal(store.close(), closing);
  try {
    await assert.rejects(store.transact(() => {}), isError('store_closed'));
    await assert.rejects(f.open(), isError('store_locked'));
  } finally { gate.resolve(); }
  assert.equal((await task).id, 'ui-1');
  await closing;
  const reopened = await f.open();
  assert.equal(reopened.read().wishes.entries[0].text, 'queued');
});

test('recovery discards only uncommitted temporary files and fails closed when canonical state is missing or corrupt', async (t) => {
  const f = await fixture(t);
  await mkdir(f.dir);
  await writeFile(f.initTemp, 'incomplete initialization');
  const store = await f.open();
  await store.transact((draft) => applyUiMutation(draft, add('wishes', 'committed')));
  await store.close();
  await writeFile(f.temp, JSON.stringify(createMemoryState(storeId)));
  const reopened = await f.open();
  assert.equal(reopened.read().wishes.entries[0].text, 'committed');
  assert.deepEqual((await readdir(f.dir)).sort(), ['state.json', 'state.lock']);
  await reopened.close();
  const valid = JSON.stringify(createMemoryState(storeId));
  for (const [invalid, code] of [[Buffer.from([0xff]), 'store_corrupt'], ['{', 'store_corrupt'],
    [JSON.stringify({ ...createMemoryState(storeId), version: 2 }), 'store_version'],
    [JSON.stringify({ ...createMemoryState(storeId), nextUiId: 0 }), 'store_corrupt']]) {
    await writeFile(f.file, invalid); await writeFile(f.temp, valid);
    await assert.rejects(f.open(), isError(code));
    assert.deepEqual(await readFile(f.file), Buffer.from(invalid));
    assert.equal(await readFile(f.temp, 'utf8'), valid);
    assert.deepEqual((await readdir(f.dir)).sort(), ['state.json', 'state.json.tmp']);
  }
  await unlink(f.file);
  await assert.rejects(f.open(), isError('store_corrupt'));
  assert.equal(await readFile(f.temp, 'utf8'), valid);
  await writeFile(f.file, valid);
  assert.equal((await f.open()).read().storeId, storeId);
});

test('a transaction I/O fault preserves the canonical state and poisons the handle until reopen', async (t) => {
  const f = await fixture(t), store = await f.open();
  const before = await readFile(f.file, 'utf8');
  await mkdir(f.temp);
  await assert.rejects(store.transact((draft) => applyUiMutation(draft, add('settings', 'not committed'))), isError('store_io'));
  assert.throws(() => store.read(), isError('store_io'));
  await assert.rejects(store.transact(() => {}), isError('store_io'));
  assert.equal(await readFile(f.file, 'utf8'), before);
  await store.close();
  await assert.rejects(f.open(), isError('store_corrupt'));
  await rmdir(f.temp);
  assert.deepEqual((await f.open()).read(), JSON.parse(before));
});

test('cross-process lock excludes a live owner; concurrent stale-lock recovery allows exactly one writer', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t);
  const host = childHost(f.home, `
    const store = await openMemoryStore(home);
    await store.transact(draft => applyUiMutation(draft, {kind:'wishes',action:'add',text:'committed before crash'}));
    await writeFile(join(home, 'memory', 'state.json.tmp'), '{incomplete');
    process.send({held: true}); process.on('message', () => {});
  `);
  const hostExit = once(host, 'exit');
  let deadOwner;
  try {
    assert.deepEqual(await nextMessage(host), { held: true });
    [deadOwner] = await readdir(f.lock);
    // A separate runtime must not steal the lock even though the temp exists.
    const probe = childHost(f.home, `await openMemoryStore(home); throw new Error('Unexpectedly acquired a live lock');`);
    const probeExit = once(probe, 'exit');
    assert.deepEqual(await nextMessage(probe), { locked: true });
    assert.equal((await probeExit)[0], 0);
  } finally {
    host.kill('SIGKILL'); await hostExit;
  }
  await mkdir(join(f.dir, `lock-${deadOwner}`, deadOwner), { recursive: true });
  const raceBody = `
    const store = await openMemoryStore(home);
    const previous = store.read().wishes.entries;
    const result = await store.transact(draft => applyUiMutation(draft, {kind:'settings',action:'add',text:'after recovery'}));
    process.on('message', async () => { await store.close(); process.disconnect(); });
    process.send({previous, result});
  `;
  const racers = Array.from({ length: 5 }, () => childHost(f.home, raceBody));
  const exits = racers.map((child) => once(child, 'exit'));
  try {
    const results = await Promise.all(racers.map(nextMessage));
    assert.equal(results.filter((result) => result.locked).length, 4);
    const winner = results.findIndex((result) => !result.locked);
    assert.deepEqual(results[winner], {
      previous: [{ id: 'ui-1', text: 'committed before crash' }],
      result: { outcome: 'created', id: 'ui-2', text: 'after recovery' },
    });
    racers[winner].send('close');
    assert.deepEqual((await Promise.all(exits)).map(([code]) => code), [0, 0, 0, 0, 0]);
  } finally {
    for (const child of racers) if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
    await Promise.allSettled(exits);
  }
  const final = await f.open();
  assert.equal(final.read().nextUiId, 3);
  assert.deepEqual((await readdir(f.dir)).sort(), ['state.json', 'state.lock']);
});

test('unverifiable owners are left in place and empty interrupted locks can be acquired', async (t) => {
  const f = await fixture(t);
  await mkdir(f.lock, { recursive: true }); await mkdir(join(f.lock, 'unknown-owner'));
  await assert.rejects(f.open(), isError('store_locked'));
  assert.deepEqual(await readdir(f.lock), ['unknown-owner']);
  await rm(join(f.lock, 'unknown-owner'), { recursive: true });
  assert.equal((await f.open()).read().version, 1);
});
