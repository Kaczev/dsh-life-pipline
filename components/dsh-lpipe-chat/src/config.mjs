import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { configPath, ensureHome } from './paths.mjs';

/** Defaults. Everything here can be overridden by ~/.dsh/life-chat/config.json. */
export function defaultConfig() {
  return {
    /** Session that receives every batched IM message. Filled from the config page. */
    mainSessionId: '',
    /** Seconds to keep collecting after the first message of a burst. Range 3-120. */
    windowSeconds: 5,
    /** Only the owner is allowed through. Off = every sender reaches you. */
    ownerOnly: true,
    /** How the owner is labelled in injected batches. */
    ownerName: '',
    weixin: {
      enabled: true,
      botToken: '',
      accountId: '',
      ownerUserId: '',
      baseUrl: 'https://ilinkai.weixin.qq.com/',
    },
    qq: {
      enabled: true,
      appId: '',
      appSecret: '',
      ownerOpenId: '',
    },
  };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function merge(base, patch) {
  if (!isObject(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

export function loadConfig() {
  ensureHome();
  try {
    const raw = readFileSync(configPath(), 'utf8');
    return merge(defaultConfig(), JSON.parse(raw));
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(next) {
  ensureHome();
  const merged = merge(defaultConfig(), next);
  writeFileSync(configPath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  try {
    // Holds bot tokens: keep it owner-readable only where the platform allows.
    chmodSync(configPath(), 0o600);
  } catch {
    // Windows ignores POSIX modes; the parent directory is already user-owned.
  }
  return merged;
}

export function updateConfig(mutator) {
  const current = loadConfig();
  const next = mutator({ ...current });
  return saveConfig(next ?? current);
}

export function clampWindow(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return defaultConfig().windowSeconds;
  return Math.min(120, Math.max(3, Math.round(value)));
}
