import { readdirSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const defaultDownloadsDirectory = () => join(homedir(), '.dsh', 'life-chat', 'downloads');
export function retentionDays(config) {
  const days = Number(config?.downloadRetentionDays ?? 7);
  return Number.isSafeInteger(days) && days >= 1 && days <= 36500 ? days : 7;
}
// Only immediate regular files in the exact default directory are eligible.
// Never recurse or follow a directory/file symlink (including Windows junctions).
export function cleanupDownloads(config, { directory = defaultDownloadsDirectory(), now = Date.now() } = {}) {
  const removed = [];
  let root;
  try { root = lstatSync(directory); } catch (error) { if (error.code === 'ENOENT') return removed; throw error; }
  if (!root.isDirectory() || root.isSymbolicLink()) return removed;
  const cutoff = now - retentionDays(config) * 86400000;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.mtimeMs >= cutoff) continue;
      // Recheck identity and modification time immediately before deletion.
      const current = lstatSync(path);
      if (!current.isFile() || current.isSymbolicLink() || current.ino !== info.ino || current.mtimeMs !== info.mtimeMs) continue;
      unlinkSync(path);
      removed.push(name);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return removed;
}
export function startDownloadCleanup(getConfig, log) {
  const run = () => {
    try { cleanupDownloads(getConfig()); }
    catch (error) { log.warn?.(`[life-chat] download cleanup failed: ${error.message}`); }
  };
  run();
  const timer = setInterval(run, 3600000);
  timer.unref?.();
  return () => clearInterval(timer);
}
