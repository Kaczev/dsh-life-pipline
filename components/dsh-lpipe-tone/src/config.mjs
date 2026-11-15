import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const toneRoot = () => join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'life-tone');
export const configFile = (root = toneRoot()) => join(root, 'config.json');
export const DEFAULT_CONFIG = Object.freeze({ description: '', examples: '' });
export const MAX_TEXT_LENGTH = 32000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbiddenControls = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u;

export function normalize(raw) {
  if (!record(raw)) throw new TypeError('语气配置必须是对象。');
  const config = { ...DEFAULT_CONFIG, ...raw };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (typeof config[key] !== 'string' || config[key].length > MAX_TEXT_LENGTH || forbiddenControls.test(config[key])) {
      throw new TypeError(`${key} 必须是最多 ${MAX_TEXT_LENGTH} 字符的文字，且不能包含制表符、回车和换行以外的控制字符。`);
    }
  }
  return { description: config.description, examples: config.examples };
}

export function loadConfig(root = toneRoot()) {
  try { return normalize(JSON.parse(readFileSync(configFile(root), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { ...DEFAULT_CONFIG }; throw error; }
}

export function saveConfig(patch, root = toneRoot()) {
  if (!record(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !Object.hasOwn(DEFAULT_CONFIG, key))) {
    throw new TypeError('没有有效的语气配置字段。');
  }
  let raw = {};
  try { raw = JSON.parse(readFileSync(configFile(root), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Never replace malformed persisted configuration, even if this patch would repair a field.
  normalize(raw);
  const config = normalize({ ...raw, ...patch });
  mkdirSync(root, { recursive: true });
  const temporary = `${configFile(root)}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ ...raw, ...config }, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, configFile(root));
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return config;
}
