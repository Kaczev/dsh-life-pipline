import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { configPath, ensureHome } from './paths.mjs';

/**
 * The main session belongs to the series' common package (dsh-life-pipline).
 * This component only reads it, so chat and wake always agree on the target.
 */
export const commonConfigPath = () => join(
  process.env.DSH_HOME || join(homedir(), '.dsh'),
  'life-pipline',
  'config.json',
);

function readCommon() {
  try {
    const raw = JSON.parse(readFileSync(commonConfigPath(), 'utf8'));
    return String(raw?.mainSessionId ?? '').trim();
  } catch {
    return '';
  }
}

function writeCommon(mainSessionId) {
  try {
    mkdirSync(dirname(commonConfigPath()), { recursive: true });
    writeFileSync(commonConfigPath(), `${JSON.stringify({ mainSessionId }, null, 2)}
`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

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
  let merged = defaultConfig();
  try {
    merged = merge(defaultConfig(), JSON.parse(readFileSync(configPath(), 'utf8')));
  } catch {
    merged = defaultConfig();
  }
  // The common package owns this value now. Adopt a legacy local value once,
  // so an existing install does not lose its main session on upgrade.
  const common = readCommon();
  if (common) {
    merged.mainSessionId = common;
  } else if (merged.mainSessionId) {
    writeCommon(merged.mainSessionId);
  }
  return merged;
}

export function saveConfig(next) {
  ensureHome();
  const merged = merge(defaultConfig(), next);
  // The shared value is stored once, in the common package's file. Whatever
  // still hands it to us (a patch row, an old page) lands there too.
  const shared = String(merged.mainSessionId ?? '').trim();
  if (shared) writeCommon(shared);
  merged.mainSessionId = '';
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
