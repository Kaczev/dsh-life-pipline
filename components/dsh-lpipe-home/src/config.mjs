import { accessSync, constants, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const homeRoot = () => join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'life-home');
export const configFile = (root = homeRoot()) => join(root, 'config.json');
export const DEFAULT_CONFIG = Object.freeze({ location: 'none', customPath: '' });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function normalize(raw) {
  if (!record(raw)) throw new TypeError('栖所配置必须是对象。');
  const config = { ...DEFAULT_CONFIG, ...raw };
  if (!['none', 'workspace', 'custom'].includes(config.location)) throw new TypeError('请选择有效的栖所位置类型。');
  for (const [key, limit] of [['customPath', 32768]]) {
    if (typeof config[key] !== 'string' || config[key].length > limit || /[\x00-\x1f\x7f\u2028\u2029]/u.test(config[key])) throw new TypeError(`${key} 必须是有效的单行文字。`);
    config[key] = config[key].trim();
  }
  return { location: config.location, customPath: config.customPath };
}
export function loadConfig(root = homeRoot()) {
  try { return normalize(JSON.parse(readFileSync(configFile(root), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { ...DEFAULT_CONFIG }; throw error; }
}
/** Directory failure is returned as state, not a reason to silently select another folder. */
export function validateHome(config, workspace = () => '') {
  const result = { state: 'disabled', valid: false, path: '', resolvedPath: '', error: '' };
  if (config.location === 'none') return result;
  try {
    const path = config.location === 'workspace' ? workspace() : config.customPath;
    if (typeof path !== 'string' || !path || !isAbsolute(path)) throw Error(config.location === 'workspace' ? '无法确定主会话的工作区目录。' : '请填写自定义绝对路径。');
    result.path = path;
    if (!statSync(path).isDirectory()) throw Error('栖所路径不是文件夹。');
    const resolved = realpathSync(path);
    accessSync(resolved, constants.R_OK | constants.W_OK | constants.X_OK);
    return { ...result, state: 'active', valid: true, resolvedPath: resolved };
  } catch (error) {
    const message = error.code === 'ENOENT' ? '栖所文件夹不存在。' : error.code === 'EACCES' || error.code === 'EPERM' ? '无法访问栖所文件夹。' : error.message;
    return { ...result, state: 'invalid', error: message };
  }
}
export function saveConfig(patch, root = homeRoot()) {
  if (!record(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !Object.hasOwn(DEFAULT_CONFIG, key))) throw new TypeError('没有有效的栖所配置字段。');
  let raw = {};
  try { raw = JSON.parse(readFileSync(configFile(root), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!record(raw)) throw new TypeError('栖所配置必须是对象。');
  const config = normalize({ ...raw, ...patch });
  mkdirSync(root, { recursive: true });
  const temporary = `${configFile(root)}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, `${JSON.stringify({ ...raw, ...config }, null, 2)}\n`, { flag: 'wx' }); renameSync(temporary, configFile(root)); }
  finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  return config;
}
