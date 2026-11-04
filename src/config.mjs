import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { configPath, ensureHome } from './paths.mjs';

/**
 * The common settings every dsh-lpipe- component may read.
 * Deliberately tiny: only things that are the same for the whole series.
 */
export function defaultConfig() {
  return {
    /** Session that receives batched IM messages and self-wake notices. */
    mainSessionId: '',
  };
}

function load() {
  ensureHome();
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function loadConfig() {
  const raw = load();
  const base = defaultConfig();
  return {
    ...base,
    ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}),
    mainSessionId: String(raw?.mainSessionId ?? base.mainSessionId).trim(),
  };
}

export function saveConfig(next) {
  ensureHome();
  const merged = { ...defaultConfig(), ...(next ?? {}) };
  merged.mainSessionId = String(merged.mainSessionId ?? '').trim();
  writeFileSync(configPath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  try {
    chmodSync(configPath(), 0o600);
  } catch {
    // Windows ignores POSIX modes; the directory is already user-owned.
  }
  return merged;
}

export function updateConfig(mutator) {
  const current = loadConfig();
  return saveConfig(mutator({ ...current }) ?? current);
}
