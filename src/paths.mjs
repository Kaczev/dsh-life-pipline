import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Everything this component owns lives under one directory. */
export const homeDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'life-chat');
export const configPath = () => join(homeDir(), 'config.json');
export const messagesPath = () => join(homeDir(), 'messages.jsonl');
export const loginPath = () => join(homeDir(), 'login.json');

export function ensureHome() {
  const dir = homeDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
