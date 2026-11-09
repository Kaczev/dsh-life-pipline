// Refresh the pinned source snapshot; never fetch from the network.
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Usage: node scripts/vendor-storyboard.mjs <upstream-checkout>');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (pkg.name !== 'dsh-video-storyboard' || pkg.version !== '0.7.1') throw Error('Expected dsh-video-storyboard@0.7.1');
const commit = git('rev-parse', 'HEAD');
if (commit !== git('rev-parse', 'v0.7.1^{commit}') || git('status', '--porcelain')) throw Error('Expected clean v0.7.1 checkout');
const target = fileURLToPath(new URL('../src/vendor/storyboard/', import.meta.url));
try { await access(target); throw Error('Snapshot already exists; review and remove it explicitly before refreshing'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const files = new Map();
async function visit(path) {
  if (files.has(path)) return;
  const bytes = await readFile(join(source, path));
  files.set(path, bytes);
  if (!path.endsWith('.js')) return;
  const text = bytes.toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([a-zA-Z0-9_@./:-]+)['"]/g)) {
    const spec = match[1];
    if (spec.startsWith('node:')) continue;
    if (!spec.startsWith('./') && !spec.startsWith('../')) throw Error(`External import: ${path}: ${spec}`);
    const child = relative(source, resolve(source, dirname(path), spec)).replaceAll('\\', '/');
    if (!child.startsWith('src/storyboard/')) throw Error(`Unexpected source dependency: ${child}`);
    await visit(child);
  }
}
for (const entry of ['pipeline.js', 'ytdlp.js', 'probe.js']) await visit(`src/storyboard/${entry}`);
// ocr.js resolves this sidecar relative to its own directory, even though Bili disables transcription.
for (const path of ['src/ocr_bridge.py', 'LICENSE', 'NOTICE', 'CREDITS.md']) files.set(path, await readFile(join(source, path)));
const hashes = {};
for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  const dest = path.startsWith('src/storyboard/') ? `lib/${path.slice('src/storyboard/'.length)}` : path === 'src/ocr_bridge.py' ? 'ocr_bridge.py' : path;
  await mkdir(dirname(join(target, dest)), { recursive: true });
  await writeFile(join(target, dest), bytes, { flag: 'wx' });
  hashes[dest] = createHash('sha256').update(bytes).digest('hex');
}
await writeFile(join(target, 'upstream.json'), JSON.stringify({ name: pkg.name, version: pkg.version, repository: 'https://github.com/SAOS-3624/dsh-video-storyboard', commit, entries: ['lib/pipeline.js', 'lib/ytdlp.js', 'lib/probe.js'], files: hashes }, null, 2) + '\n', { flag: 'wx' });
console.log(`Vendored ${files.size} unchanged files from ${commit}`);
