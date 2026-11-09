import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Common settings owned by the bundle itself, not by any single component. */
export const homeDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'life-pipline');
export const configPath = () => join(homeDir(), 'config.json');

export function ensureHome() {
  const dir = homeDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
