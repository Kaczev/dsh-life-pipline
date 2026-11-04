import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const homeDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'life-wake');
export const statePath = () => join(homeDir(), 'state.json');
export const commonConfigPath = () => join(
  process.env.DSH_HOME || join(homedir(), '.dsh'),
  'life-pipline',
  'config.json',
);

export function ensureHome() {
  const dir = homeDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The main session belongs to the common package; read it, never write it. */
export function readMainSessionId() {
  try {
    const raw = JSON.parse(readFileSync(commonConfigPath(), 'utf8'));
    return String(raw?.mainSessionId ?? '').trim();
  } catch {
    return '';
  }
}

export function loadState() {
  try {
    const raw = JSON.parse(readFileSync(statePath(), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function saveState(state) {
  ensureHome();
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  try {
    chmodSync(statePath(), 0o600);
  } catch {
    // Windows ignores POSIX modes.
  }
  return state;
}
