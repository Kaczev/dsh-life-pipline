/** Link the checkout's active packages so bare imports resolve to local source. */
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const modules = join(root, 'node_modules');

function linkInto(name, target) {
  const path = join(modules, name);
  const existing = lstatSync(path, { throwIfNoEntry: false });
  let backup;
  if (existing) {
    try {
      if (realpathSync(path) === realpathSync(target)) return path;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    // npm ci installs registry copies. Preserve a conflicting entry rather than
    // deleting it or silently running the checkout against an old dependency graph.
    backup = join(mkdtempSync(join(modules, '.lpipe-saved-')), name);
    renameSync(path, backup);
  }
  try {
    symlinkSync(target, path, 'junction');
  } catch (error) {
    if (backup) renameSync(backup, path);
    throw error;
  }
  return path;
}

export function linkSelf() {
  mkdirSync(modules, { recursive: true });
  const self = linkInto('dsh-life-pipline', root);
  for (const name of [CORE, ...COMPONENTS]) linkInto(name, join(root, 'components', name));
  return self;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) linkSelf();
