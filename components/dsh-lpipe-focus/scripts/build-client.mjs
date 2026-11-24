import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Wrap the panel body in the Host's client module envelope. */
export const LOADER_ID = 'dsh-lpipe-focus';

export function wrapClient(body, id = LOADER_ID) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body.replace(/\r\n/g, '\n')}
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
  const staging = `${output}.${process.pid}.tmp`;
  await writeFile(staging, wrapClient(body), 'utf8');
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(staging, output);
      break;
    } catch (error) {
      if (attempt >= 8 || error?.code !== 'EPERM') throw error;
      await new Promise((done) => setTimeout(done, 25 * attempt));
    }
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await buildClient();
  console.log(`Wrote ${written}`);
}
