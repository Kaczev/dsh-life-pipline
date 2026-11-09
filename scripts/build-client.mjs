import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export { LOADER_ID, wrapClient, buildClient } from '../components/dsh-life-core/scripts/build-client.mjs';
import { buildClient } from '../components/dsh-life-core/scripts/build-client.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Wrote ${await buildClient()}`);
