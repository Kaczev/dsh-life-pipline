/**
 * The components import the shared core through its package name
 * (`dsh-life-pipline/clock`), which is how it resolves once published. In a
 * plain checkout there is no `node_modules/dsh-life-pipline`, so tests would
 * fail with ERR_MODULE_NOT_FOUND: this makes the repo its own dependency.
 *
 * Idempotent, and a no-op on a machine that already has the link.
 */
import { existsSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const link = join(root, 'node_modules', 'dsh-life-pipline');

export function linkSelf() {
  mkdirSync(dirname(link), { recursive: true });
  if (existsSync(link)) return link;
  try {
    symlinkSync(root, link, 'junction');
  } catch {
    // A file may be sitting there on a broken machine; replace it once.
    rmSync(link, { recursive: true, force: true });
    symlinkSync(root, link, 'junction');
  }
  return link;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('link-self.mjs')) {
  linkSelf();
}
