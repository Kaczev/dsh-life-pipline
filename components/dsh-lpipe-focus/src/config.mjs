import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const focusRoot = () => join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'life-focus');
export const configFile = (root = focusRoot()) => join(root, 'config.json');

export const FIELD_BOUNDS = Object.freeze({
  idleMinutes: Object.freeze({ min: 5, max: 1440, default: 60, label: '闲置整理时长' }),
  compactChars: Object.freeze({ min: 32000, max: 4000000, default: 512000, label: '过线整理阈值' }),
  nudgeChars: Object.freeze({ min: 16000, max: 2000000, default: 256000, label: '未转化提醒线' }),
  maxConclusionChars: Object.freeze({ min: 4000, max: 512000, default: 64000, label: '结论层上限' }),
});

export const DEFAULT_CONFIG = Object.freeze({
  allSessions: false,
  ...Object.fromEntries(Object.entries(FIELD_BOUNDS).map(([key, spec]) => [key, spec.default])),
});

const KNOWN_KEYS = new Set(['allSessions', ...Object.keys(FIELD_BOUNDS)]);

export class FocusConfigError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FocusConfigError';
    this.code = code;
    this.details = details;
  }
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalize(raw, errorCode = 'focus/invalid-config') {
  if (!isRecord(raw)) {
    throw new FocusConfigError(errorCode, '聚焦配置必须是对象。');
  }
  const config = { ...DEFAULT_CONFIG };
  if (Object.hasOwn(raw, 'allSessions')) {
    if (typeof raw.allSessions !== 'boolean') {
      throw new FocusConfigError(errorCode, '所有对话生效（allSessions）必须是布尔值。', { field: 'allSessions' });
    }
    config.allSessions = raw.allSessions;
  }
  for (const [key, spec] of Object.entries(FIELD_BOUNDS)) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < spec.min || value > spec.max) {
      throw new FocusConfigError(
        errorCode,
        `${spec.label}（${key}）必须是 ${spec.min}–${spec.max} 之间的整数。`,
        { field: key, min: spec.min, max: spec.max },
      );
    }
    config[key] = value;
  }
  if (config.nudgeChars > config.compactChars) {
    throw new FocusConfigError(
      errorCode,
      '未转化提醒线（nudgeChars）不能高于过线整理阈值（compactChars）。',
      { field: 'nudgeChars' },
    );
  }
  if (config.maxConclusionChars >= config.compactChars) {
    throw new FocusConfigError(
      errorCode,
      '结论层上限（maxConclusionChars）必须小于过线整理阈值（compactChars）。',
      { field: 'maxConclusionChars' },
    );
  }
  return config;
}

function readRawDiskConfig(root) {
  const path = configFile(root);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new FocusConfigError('focus/corrupt-config', `无法读取聚焦配置文件 ${path}：${error?.message ?? error}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new FocusConfigError(
      'focus/corrupt-config',
      `聚焦配置文件 ${path} JSON 格式损坏；已保留原文件未覆盖，请修复后重试（${error?.message ?? error}）。`,
    );
  }
  if (!isRecord(parsed)) {
    throw new FocusConfigError(
      'focus/corrupt-config',
      `聚焦配置文件 ${path} 顶层必须是 JSON 对象；已保留原文件未覆盖。`,
    );
  }
  return parsed;
}

export function loadConfig(root = focusRoot()) {
  const raw = readRawDiskConfig(root);
  if (raw === null) return { ...DEFAULT_CONFIG };
  return normalize(raw, 'focus/corrupt-config');
}

export function saveConfig(patch, root = focusRoot()) {
  if (!isRecord(patch)) {
    throw new FocusConfigError('focus/bad-request', '没有有效的聚焦配置字段。');
  }
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some((key) => !KNOWN_KEYS.has(key))) {
    throw new FocusConfigError('focus/bad-request', '没有有效的聚焦配置字段。');
  }
  for (const key of keys) {
    if (key === 'allSessions') {
      if (typeof patch.allSessions !== 'boolean') {
        throw new FocusConfigError('focus/bad-request', '所有对话生效（allSessions）必须是布尔值。', { field: 'allSessions' });
      }
      continue;
    }
    const spec = FIELD_BOUNDS[key];
    const value = patch[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < spec.min || value > spec.max) {
      throw new FocusConfigError(
        'focus/bad-request',
        `${spec.label}（${key}）必须是 ${spec.min}–${spec.max} 之间的整数。`,
        { field: key, min: spec.min, max: spec.max },
      );
    }
  }
  // Never overwrite malformed persisted configuration, even when patch would overwrite bad fields.
  const existing = readRawDiskConfig(root);
  const current = existing === null ? { ...DEFAULT_CONFIG } : normalize(existing, 'focus/corrupt-config');
  const next = normalize({ ...current, ...patch }, 'focus/bad-request');

  mkdirSync(root, { recursive: true });
  const target = configFile(root);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const merged = existing === null ? { ...next } : { ...existing, ...next };
    writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return next;
}
