import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';
import { linkSelf } from './link-self.mjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const patterns = ['test/*.test.mjs', ...[CORE, ...COMPONENTS].map(name => `components/${name}/test/*.test.mjs`)];
const files = globSync(patterns, { cwd }).sort();
if (!files.length) throw new Error('No tests found');
linkSelf();
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { cwd, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
