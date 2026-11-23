import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';
import { wrapClient } from '../components/dsh-life-core/scripts/build-client.mjs';

export async function buildAggregateClient() {
  const source = new URL('../client/panel.js', import.meta.url);
  await writeFile(new URL('../lib/client.js', import.meta.url), wrapClient(await readFile(source, 'utf8'), 'dsh-life-pipline'));
}

await buildAggregateClient();
for (const name of [CORE, ...COMPONENTS]) {
  const script = new URL(`../components/${name}/scripts/build-client.mjs`, import.meta.url);
  if (!existsSync(script)) continue; // Host-only packages have no client to build.
  const { buildClient } = await import(script.href);
  await buildClient();
}
