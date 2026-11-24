import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOADER_ID = 'dsh-lpipe-memory';

export function wrapClient(body, locales) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(LOADER_ID)},
  factory: (require) => {
    const module = { exports: {} };
    const MEMORY_LOCALES = ${JSON.stringify(locales)};
${body.replace(/\r\n/g, '\n').trimEnd()}
    return module.exports;
  }
});
`;
}

export async function readClientInputs() {
  const [body, en, zh] = await Promise.all(['client/panel.js', 'locale/en.json', 'locale/zh.json']
    .map(path => readFile(resolve(root, path), 'utf8')));
  return [body, { en: JSON.parse(en).panel, zh: JSON.parse(zh).panel }];
}

export async function buildClient() {
  const output = resolve(root, 'lib/client.js');
  const staging = `${output}.${process.pid}.tmp`;
  const source = wrapClient(...await readClientInputs());
  await mkdir(dirname(output), { recursive: true });
  await writeFile(staging, source, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(staging, output);
      return output;
    } catch (error) {
      if (attempt >= 8 || error?.code !== 'EPERM') throw error;
      await new Promise(done => setTimeout(done, 25 * attempt));
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Wrote ${await buildClient()}`);
}
