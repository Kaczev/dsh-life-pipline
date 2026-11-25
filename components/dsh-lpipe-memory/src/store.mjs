import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const MEMORY_VERSION = 2;
export const MEMORY_KINDS = Object.freeze(['wishes', 'settings']);
export const MEMORY_DEFAULTS = Object.freeze({
  wishes: Object.freeze({ enabled: true, maxEntries: 8, maxTextLength: 120 }),
  settings: Object.freeze({ enabled: true, maxEntries: 12, maxTextLength: 160 }),
});
export const MEMORY_ID_PATTERN = '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\\s\\S])';
const idPattern = new RegExp(MEMORY_ID_PATTERN, 'u');
const uiIdPattern = /^ui-([1-9][0-9]*)(?![\s\S])/;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?![\s\S])/i;
const configKeys = ['enabled', 'maxEntries', 'maxTextLength'];
const legacyStateKeys = ['version', 'storeId', 'nextUiId', ...MEMORY_KINDS];
const legacyScopeKeys = [...legacyStateKeys, 'allSessions'];
const stateKeys = [...legacyScopeKeys, 'sharedLists'];
const defaultSharedLists = () => ({ wishes: false, settings: true });
const maxEntries = 32;
const maxTextLength = 500;

export class MemoryError extends Error {
  constructor(code, message, { field, limit, cause } = {}) {
    super(message, { cause });
    this.name = 'MemoryError';
    this.code = code;
    if (field !== undefined) this.field = field;
    if (limit !== undefined) this.limit = limit;
  }
}

const invalid = (message, field) => new MemoryError('invalid_input', message, { field });
const corrupt = (message, cause) => new MemoryError('store_corrupt', message, { cause });
const ioError = (message, cause) => new MemoryError('store_io', message, { cause });
const record = (value) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => record(value) && Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const inRange = (value, max) => Number.isSafeInteger(value) && value >= 1 && value <= max;
const validId = (id) => typeof id === 'string' && id.length <= 32 && idPattern.test(id);
const validKind = (kind) => MEMORY_KINDS.includes(kind);
const length = (text) => Array.from(text).length;
const normalize = (text) => text.replace(/\r\n?/g, '\n').trim();

function validateConfig(config, keys = configKeys) {
  if (!exact(config, keys)) throw invalid('Expected enabled, maxEntries, and maxTextLength.', 'config');
  if (typeof config.enabled !== 'boolean') throw invalid('Enabled must be true or false.', 'enabled');
  if (!inRange(config.maxEntries, maxEntries)) throw invalid(`Maximum entries must be an integer from 1 to ${maxEntries}.`, 'maxEntries');
  if (!inRange(config.maxTextLength, maxTextLength)) throw invalid(`Maximum text length must be an integer from 1 to ${maxTextLength}.`, 'maxTextLength');
}

export function createMemoryState(storeId = randomUUID()) {
  return validateMemoryState({
    version: MEMORY_VERSION,
    storeId,
    nextUiId: 1,
    allSessions: false,
    sharedLists: defaultSharedLists(),
    ...Object.fromEntries(MEMORY_KINDS.map((kind) => [kind, { ...MEMORY_DEFAULTS[kind], entries: [] }])),
  });
}

export function validateMemoryState(state) {
  if (!record(state) || !Object.hasOwn(state, 'version') || !Number.isSafeInteger(state.version) || state.version < 1) {
    throw corrupt('Memory state has no valid version.');
  }
  if (state.version !== MEMORY_VERSION) throw new MemoryError('store_version', 'Memory state uses an unsupported version.');
  if (!exact(state, stateKeys) || typeof state.allSessions !== 'boolean' || typeof state.storeId !== 'string' || !uuidPattern.test(state.storeId) ||
      !inRange(state.nextUiId, Number.MAX_SAFE_INTEGER)) throw corrupt('Memory state has invalid store metadata.');
  if (!exact(state.sharedLists, MEMORY_KINDS) || MEMORY_KINDS.some(kind => typeof state.sharedLists[kind] !== 'boolean')) {
    throw corrupt('Memory state has invalid shared-list preferences.');
  }
  const uiIds = new Set();
  for (const kind of MEMORY_KINDS) {
    const group = state[kind];
    try { validateConfig(group, [...configKeys, 'entries']); }
    catch (cause) { throw corrupt(`Memory state has invalid ${kind} configuration.`, cause); }
    if (!Array.isArray(group.entries) || group.entries.length > group.maxEntries) throw corrupt(`Memory state has invalid ${kind} entries.`);
    const ids = new Set();
    for (const entry of group.entries) {
      if (!exact(entry, ['id', 'text']) || !validId(entry.id) || ids.has(entry.id) || typeof entry.text !== 'string' ||
          !entry.text || normalize(entry.text) !== entry.text || length(entry.text) > group.maxTextLength) {
        throw corrupt(`Memory state has an invalid or duplicate ${kind} entry.`);
      }
      ids.add(entry.id);
      if (entry.id.startsWith('ui-')) {
        const n = Number(uiIdPattern.exec(entry.id)?.[1]);
        if (!inRange(n, state.nextUiId - 1) || uiIds.has(n)) throw corrupt('Memory state has an invalid or reused UI entry ID.');
        uiIds.add(n);
      }
    }
  }
  return state;
}

export function validateToolInput(kind, input) {
  if (!validKind(kind)) throw invalid('Unknown memory kind.', 'kind');
  if (kind === 'wishes' && exact(input, [])) return input;
  if (!record(input)) throw invalid('Expected a memory tool input object.');
  if (input.action === 'update' && exact(input, ['action', 'id', 'text'])) {
    if (typeof input.text !== 'string' || !input.text || length(input.text) > maxTextLength) {
      throw invalid(`Text must contain 1 to ${maxTextLength} Unicode code points.`, 'text');
    }
  } else if (input.action !== 'remove' || !exact(input, ['action', 'id'])) {
    throw invalid('Expected exact update or remove parameters.', 'action');
  }
  if (!validId(input.id)) throw invalid('Use a kebab-case ID of 1 to 32 characters.', 'id');
  return input;
}

export function validateScopeInput(input) {
  if (typeof input === 'boolean') return input;
  if (!exact(input, ['kind', 'enabled']) || !validKind(input.kind) || typeof input.enabled !== 'boolean') {
    throw invalid('Expected a scope boolean or a list kind and boolean enabled flag.');
  }
  return input;
}

export function validateUiInput(input) {
  if (!record(input)) throw invalid('Expected a memory settings input object.');
  if (!validKind(input.kind)) throw invalid('Unknown memory kind.', 'kind');
  if (input.action === 'configure' && exact(input, ['kind', 'action', 'config'])) {
    validateConfig(input.config);
    return input;
  }
  if (input.action === 'add' && exact(input, ['kind', 'action', 'text'])) {
    if (typeof input.text !== 'string') throw invalid('Expected text.', 'text');
    return input;
  }
  if (input.action === 'update' && exact(input, ['kind', 'action', 'id', 'text'])) {
    if (typeof input.text !== 'string') throw invalid('Expected text.', 'text');
  } else if (input.action !== 'remove' || !exact(input, ['kind', 'action', 'id'])) {
    throw invalid('Expected exact configure, add, update, or remove parameters.', 'action');
  }
  if (!validId(input.id)) throw invalid('Use a kebab-case ID of 1 to 32 characters.', 'id');
  return input;
}

function checkedText(group, raw) {
  const text = normalize(raw);
  if (!text) throw new MemoryError('empty_text', 'Enter non-blank text.', { field: 'text' });
  if (length(text) > group.maxTextLength) throw new MemoryError('text_limit', `Text can contain at most ${group.maxTextLength} Unicode code points.`, { limit: group.maxTextLength, field: 'text' });
  return text;
}

function requireRoom(group) {
  if (group.entries.length >= group.maxEntries) {
    throw new MemoryError('entry_limit', `This list can contain at most ${group.maxEntries} entries.`, { limit: group.maxEntries });
  }
}

function changeEntry(group, input, upsert) {
  const { action, id } = input;
  const index = group.entries.findIndex((entry) => entry.id === id);
  if (index === -1 && (action === 'remove' || !upsert)) throw new MemoryError('not_found', 'No memory entry has that ID.', { field: 'id' });
  if (action === 'remove') {
    group.entries.splice(index, 1);
    return { outcome: 'removed', id };
  }
  if (index === -1 && id.startsWith('ui-')) throw new MemoryError('reserved_id', 'The ui- prefix is reserved for IDs created on the settings page.', { field: 'id' });
  const text = checkedText(group, input.text);
  if (index === -1) {
    requireRoom(group);
    group.entries.push({ id, text });
    return { outcome: 'created', id, text };
  }
  group.entries[index] = { id, text };
  return { outcome: 'updated', id, text };
}

// These functions only change the caller's draft. Host checks session/enablement
// and handles wish reads, which must not open a write transaction.
export function applyToolMutation(state, kind, input) {
  validateToolInput(kind, input);
  if (!Object.hasOwn(input, 'action')) throw invalid('A read is not a memory mutation.', 'action');
  return changeEntry(state[kind], input, true);
}

export function applyUiMutation(state, input) {
  validateUiInput(input);
  const group = state[input.kind];
  if (input.action === 'configure') {
    const { config } = input;
    if (group.entries.length > config.maxEntries) {
      throw new MemoryError('entry_limit', 'Remove entries before lowering the entry limit.', { limit: config.maxEntries, field: 'maxEntries' });
    }
    if (group.entries.some(({ text }) => length(text) > config.maxTextLength)) {
      throw new MemoryError('text_limit', 'Shorten or remove entries before lowering the text limit.', { limit: config.maxTextLength, field: 'maxTextLength' });
    }
    Object.assign(group, config);
    return { outcome: 'configured' };
  }
  if (input.action === 'add') {
    const text = checkedText(group, input.text);
    requireRoom(group);
    if (state.nextUiId >= Number.MAX_SAFE_INTEGER) throw new MemoryError('id_exhausted', 'No more UI IDs are available.');
    const id = `ui-${state.nextUiId}`;
    group.entries.push({ id, text });
    state.nextUiId += 1;
    return { outcome: 'created', id, text };
  }
  return changeEntry(group, input, false);
}

const hostTag = createHash('sha256').update(hostname()).digest('hex').slice(0, 32);
const ownerPattern = /^owner-([0-9a-f]{32})-([1-9][0-9]{0,9})-([0-9a-f-]{36})(?![\s\S])/;
const conflicts = new Set(['EEXIST', 'ENOTEMPTY', 'EACCES', 'EPERM', 'EBUSY']);
const missing = async (call) => {
  try { return await call(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
};
const locked = () => new MemoryError('store_locked', 'Another host owns this memory store, or lock ownership cannot be verified.');

function ownerIsDead(match) {
  // Cooperating processes must use a local filesystem and share a PID namespace.
  // PID reuse, another hostname, or an inconclusive probe is never safe to steal.
  if (!match || match[1] !== hostTag || !uuidPattern.test(match[3])) return false;
  const pid = Number(match[2]);
  if (pid > 0x7fffffff) return false;
  try { process.kill(pid, 0); }
  catch (error) { return error.code === 'ESRCH'; }
  return false;
}

async function removeEmptyLock(path) {
  try { await missing(() => rmdir(path)); }
  catch (error) {
    // Another contender may have installed its own non-empty lock meanwhile.
    if (conflicts.has(error.code)) {
      const entries = await missing(() => readdir(path));
      if (!entries || entries.length) return;
    }
    throw error;
  }
}

async function acquireLock(dir) {
  const lock = join(dir, 'state.lock');
  const owner = `owner-${hostTag}-${process.pid}-${randomUUID()}`;
  const candidate = join(dir, `lock-${owner}`);
  await mkdir(candidate, { mode: 0o700 });
  try {
    await mkdir(join(candidate, owner), { mode: 0o700 });
    for (let attempt = 0; attempt < 16; attempt++) {
      try {
        // Both paths are in one directory. The source is non-empty before this
        // atomic operation; rename cannot replace another non-empty directory.
        await rename(candidate, lock);
        return async () => {
          await missing(() => rmdir(join(lock, owner)));
          await removeEmptyLock(lock);
        };
      } catch (error) {
        if (!conflicts.has(error.code)) throw error;
        const info = await missing(() => lstat(lock));
        if (!info) {
          if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
          continue;
        }
        if (!info.isDirectory()) throw locked();
        const entries = await missing(() => readdir(lock));
        if (!entries) continue;
        if (entries.length > 1) throw locked();
        if (entries.length === 1) {
          const [oldOwner] = entries;
          if (!ownerIsDead(ownerPattern.exec(oldOwner))) throw locked();
          // Unlink only this generation's marker. A late recovery must never
          // remove a successor's marker, even if the old PID was reused.
          await missing(() => rmdir(join(lock, oldOwner)));
        }
        await removeEmptyLock(lock);
      }
    }
    throw locked();
  } finally {
    // After winning the rename, this unique candidate path no longer exists.
    await missing(() => rmdir(join(candidate, owner)));
    await missing(() => rmdir(candidate));
  }
}

async function discardDeadCandidates(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('lock-')) continue;
    const owner = entry.name.slice('lock-'.length);
    if (!ownerIsDead(ownerPattern.exec(owner))) continue;
    const candidate = join(dir, entry.name);
    // Preparation never writes user data. Only remove the exact marker and
    // its empty directory; unknown files are left alone.
    try {
      await missing(() => rmdir(join(candidate, owner)));
      await removeEmptyLock(candidate);
    } catch (error) {
      if (!conflicts.has(error.code) && error.code !== 'ENOTDIR') throw error;
    }
  }
}

async function syncDirectory(dir) {
  let handle;
  try {
    handle = await open(dir, 'r');
    await handle.sync();
  } catch (error) {
    // Windows does not expose portable directory fsync via Node's fs API.
    const unsupported = ['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR'];
    if (process.platform === 'win32') unsupported.push('EPERM', 'EACCES', 'EBADF');
    if (!unsupported.includes(error.code)) throw error;
  } finally { await handle?.close(); }
}

async function stateFileInfo(file) {
  const info = await missing(() => lstat(file));
  if (info && !info.isFile()) throw corrupt('A memory state path is not a regular file.');
  return info;
}

async function loadState(file) {
  const handle = await open(file, 'r');
  let state;
  try {
    const bytes = await handle.readFile();
    try { state = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
    catch (cause) { throw corrupt('Memory state is not valid UTF-8 JSON.', cause); }
  } finally { await handle.close(); }
  // Upgrade only the two known v1 shapes. The next changed transaction persists v2.
  if (state?.version === 1) {
    if (exact(state, legacyStateKeys)) state.allSessions = false;
    else if (!exact(state, legacyScopeKeys) || typeof state.allSessions !== 'boolean') {
      throw corrupt('Memory state has invalid v1 store metadata.');
    }
    state.version = MEMORY_VERSION;
    state.sharedLists = defaultSharedLists();
    if (state.allSessions) state.sharedLists.wishes = true;
  }
  return validateMemoryState(state);
}

async function replaceState(dir, file, temp, source) {
  const handle = await open(temp, 'wx', 0o600);
  let renamed = false;
  try {
    try {
      await handle.writeFile(source, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temp, file);
    renamed = true;
    await syncDirectory(dir);
  } catch (cause) {
    if (renamed) throw new MemoryError('commit_uncertain', 'Memory state was replaced but directory sync failed; reopen the store before proceeding.', { cause });
    try { await missing(() => unlink(temp)); }
    catch (error) { throw ioError('Memory commit failed and its temporary file could not be removed; reopen the store.', new AggregateError([cause, error])); }
    throw ioError('Could not commit memory state.', cause);
  }
}

const encode = (state) => `${JSON.stringify(state, null, 2)}\n`;

export async function openMemoryStore(homeDir) {
  let release;
  try {
    const home = resolve(homeDir);
    await mkdir(home, { recursive: true, mode: 0o700 });
    const memoryDir = join(await realpath(home), 'memory');
    try { await mkdir(memoryDir, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!(await lstat(memoryDir)).isDirectory()) throw corrupt('The memory path is not a regular directory.');
    const dir = await realpath(memoryDir);
    release = await acquireLock(dir);
    await discardDeadCandidates(dir);
    // Also make the name of the memory directory persistent if it was just made.
    await syncDirectory(dirname(dir));
    const file = join(dir, 'state.json');
    const temp = join(dir, 'state.json.tmp');
    const initTemp = join(dir, 'state.json.init.tmp');
    let current;
    if (await stateFileInfo(file)) {
      // The canonical file is the only commit point. Validate it before any
      // cleanup, and never promote a temporary file in place of a corrupt one.
      current = await loadState(file);
      if (await stateFileInfo(temp)) await unlink(temp);
      if (await stateFileInfo(initTemp)) await unlink(initTemp);
    } else {
      if (await stateFileInfo(temp)) throw corrupt('A transaction temporary file exists but the committed memory state is missing.');
      // The initial temporary file cannot contain a previously acknowledged
      // update. If there is no committed state yet, discard it and initialize.
      if (await stateFileInfo(initTemp)) await unlink(initTemp);
      current = createMemoryState();
      await replaceState(dir, file, initTemp, encode(current));
    }

    let queue = Promise.resolve();
    let closing;
    let fault;
    const checkOpen = () => {
      if (closing) throw new MemoryError('store_closed', 'The memory store is closed.');
      if (fault) throw fault;
    };
    return {
      read() {
        checkOpen();
        return structuredClone(current);
      },
      transact(mutator) {
        try { checkOpen(); }
        catch (error) { return Promise.reject(error); }
        const task = queue.then(async () => {
          if (fault) throw fault;
          const draft = structuredClone(current);
          const result = await mutator(draft);
          validateMemoryState(draft);
          if (draft.storeId !== current.storeId || draft.nextUiId < current.nextUiId) throw corrupt('A transaction cannot change the store ID or roll back its UI ID counter.');
          for (const kind of MEMORY_KINDS) {
            const previousIds = new Set(current[kind].entries.map(({ id }) => id));
            if (draft[kind].entries.some(({ id }) => id.startsWith('ui-') && !previousIds.has(id) && Number(id.slice(3)) < current.nextUiId)) {
              throw corrupt('A transaction cannot reuse a previously issued UI ID.');
            }
          }
          const source = encode(draft);
          if (source !== encode(current)) {
            try { await replaceState(dir, file, temp, source); }
            catch (cause) {
              fault = cause instanceof MemoryError ? cause : ioError('Could not write memory state; reopen the store.', cause);
              throw fault;
            }
            // Keep no mutable references to the caller's draft or result.
            current = JSON.parse(source);
          }
          return result;
        });
        queue = task.catch(() => {});
        return task;
      },
      close() {
        return closing ??= queue.then(release).catch((cause) => { throw ioError('Could not release the memory store lock.', cause); });
      },
    };
  } catch (cause) {
    if (release) {
      try { await release(); }
      catch (error) { throw ioError('Could not open memory state or release its lock.', new AggregateError([cause, error])); }
    }
    throw cause instanceof MemoryError ? cause : ioError('Could not open memory state.', cause);
  }
}
