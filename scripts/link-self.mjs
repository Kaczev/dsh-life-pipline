/**
 * The components import the shared core through its package name
 * (`dsh-life-pipline/clock`), which is how it resolves once published. In a
 * plain checkout there is no `node_modules/dsh-life-pipline`, so tests would
 * fail with ERR_MODULE_NOT_FOUND: this makes the repo its own dependency.
 *
 * Idempotent, and a no-op on a machine that already has the link.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const link = join(root, 'node_modules', 'dsh-life-pipline');

function linkInto(name, target) {
  const path = join(root, 'node_modules', name);
  if (existsSync(path)) return path;
  try {
    symlinkSync(target, path, 'junction');
  } catch {
    // A file may be sitting there on a broken machine; replace it once.
    rmSync(path, { recursive: true, force: true });
    symlinkSync(target, path, 'junction');
  }
  return path;
}

export function linkSelf() {
  mkdirSync(dirname(link), { recursive: true });
  const self = linkInto('dsh-life-pipline', root);
  // The components depend on each other by package name (the star map reads
  // memory through `dsh-lpipe-memory/reader`), so a plain checkout has to make
  // every component resolvable the same way a published install would.
  const components = join(root, 'components');
  if (existsSync(components)) {
    for (const entry of readdirSync(components, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(components, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      try {
        const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
        if (typeof name === 'string' && name) linkInto(name, join(components, entry.name));
      } catch {
        // 一个坏掉的 package.json 不该让整个仓库的测试跑不起来。
      }
    }
  }
  return self;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('link-self.mjs')) {
  linkSelf();
}
