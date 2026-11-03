import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wrap the panel source in the Host's client module envelope. There is no
 * bundler: the body only uses `require('react')`, which the envelope supplies,
 * so this script is the whole build.
 */
export const LOADER_ID = 'dsh-life-pipline';

export function wrapClient(body, id = LOADER_ID) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildClient() {
  const body = await readFile(resolve(root, 'src/client/panel.js'), 'utf8');
  const output = resolve(root, 'lib/client.js');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, wrapClient(body), 'utf8');
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await buildClient();
  console.log(`Wrote ${written}`);
}
