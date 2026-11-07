import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 一次把「整合包 + 每个组件包」的客户端都打一遍。
 *
 * 以前只有整合包自己的 build-client 会跑，改了组件的 panel.js 之后忘了单独跑，
 * 浏览器里看到的就还是旧面板——这个脚本就是为了让那种事不再发生。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  join(root, 'scripts', 'build-client.mjs'),
  ...(await readdir(join(root, 'components'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'components', entry.name, 'scripts', 'build-client.mjs')),
];

for (const file of targets) {
  // 只有宿主半边、还没有设置页的包（比如刚起步的回忆管线）没有这个脚本，跳过就好。
  if (!existsSync(file)) continue;
  const module = await import(pathToFileURL(file).href);
  const buildClient = module.buildClient;
  if (typeof buildClient !== 'function') {
    console.error(`skip ${file}：没有导出 buildClient`);
    continue;
  }
  await buildClient();
}
