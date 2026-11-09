import { CORE, COMPONENTS, prerequisites, dependents } from './dependencies.mjs';

export function createComponentManager(manager) {
  const names = [CORE, ...COMPONENTS];
  const list = async () => {
    const rows = await manager.listPlugins();
    return names.map(name => ({ name, enabled: rows.some(row => row.moduleName === name && row.enabled), available: rows.some(row => row.moduleName === name), prerequisites: prerequisites(name) }));
  };
  const check = result => { if (result.application !== 'applied') throw Error(`${result.target}: ${result.application}`); };
  let tail = Promise.resolve();
  const handle = async (method, input = {}) => {
    if (method === 'pipeline.components.set') {
      if (!names.includes(input.name) || typeof input.enabled !== 'boolean') throw Error('无效的组件或开关值');
      const targets = input.enabled ? [...prerequisites(input.name), input.name] : [...dependents(input.name), input.name];
      for (const name of targets) {
        let row = (await manager.listPlugins()).find(row => row.moduleName === name);
        if (!row && input.enabled) { check(await manager.setBundleEnabled(name, true)); row = (await manager.listPlugins()).find(row => row.moduleName === name); }
        if (!row && input.enabled) throw Error(`组件不可用：${name}`);
        if (row && row.enabled !== input.enabled) check(await manager.setPluginEnabled(row.entryId, input.enabled));
      }
    }
    return { ok: true, value: await list() };
  };
  return (method, input) => {
    const result = tail.then(() => handle(method, input));
    tail = result.catch(() => {});
    return result;
  };
}
