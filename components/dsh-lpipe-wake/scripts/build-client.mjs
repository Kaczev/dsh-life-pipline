import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The whole build: wrap the panel body in the Host's client envelope. */
export const LOADER_ID = 'dsh-lpipe-wake';

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
  const body = await readFile(resolve(root, 'client/panel.js'), 'utf8');
  const output = resolve(root, 'lib/client.js');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, wrapClient(body), 'utf8');
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await buildClient();
  console.log(`Wrote ${written}`);
}
