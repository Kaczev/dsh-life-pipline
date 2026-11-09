// One graph is shared by standalone bundles and the aggregate installer.
export const CORE = 'dsh-life-core';
export const COMPONENTS = Object.freeze(['dsh-lpipe-chat', 'dsh-lpipe-home', 'dsh-lpipe-bili', 'dsh-lpipe-wake', 'dsh-lpipe-memory', 'dsh-lpipe-starmap', 'dsh-lpipe-recall']);
export const DEPENDENCIES = Object.freeze(Object.fromEntries([
  [CORE, []],
  ...COMPONENTS.map(name => [name, [CORE, ...(name === 'dsh-lpipe-starmap' ? ['dsh-lpipe-memory'] : name === 'dsh-lpipe-recall' ? ['dsh-lpipe-memory', 'dsh-lpipe-starmap'] : [])]]),
]));

export function prerequisites(name, seen = new Set()) {
  for (const dependency of DEPENDENCIES[name] ?? []) {
    prerequisites(dependency, seen);
    seen.add(dependency);
  }
  return [...seen];
}

export function dependents(name) {
  return Object.keys(DEPENDENCIES).filter(candidate => prerequisites(candidate).includes(name)).reverse();
}

/** Serialized, event-driven reconciliation. Never writes profile files directly. */
export function createDependencyCoordinator(manager, { warn = () => {} } = {}) {
  let previous = new Map();
  let initialized = false;
  let tail = Promise.resolve();
  let closed = false;
  const read = async () => new Map((await manager.listPlugins()).filter(row => row.moduleName in DEPENDENCIES).map(row => [row.moduleName, row]));
  const check = result => {
    if (result.application !== 'applied') throw Error(`Dependency change ${result.target}: ${result.application}${result.error?.diagnostic ? ` — ${result.error.diagnostic}` : ''}`);
  };
  const enable = async name => {
    let rows = await read();
    if (!rows.has(name)) {
      const bundles = await manager.listBundles();
      const bundle = bundles.find(item => item.name === name);
      if (!bundle?.enabled) check(await manager.setBundleEnabled(name, true));
      rows = await read();
    }
    const row = rows.get(name);
    if (!row) throw Error(`Dependency plugin unavailable: ${name}`);
    if (!row.enabled) check(await manager.setPluginEnabled(row.entryId, true));
  };
  const reconcile = async initial => {
    if (initial && initialized) initial = false;
    const current = await read();
    const disabled = [...previous].filter(([name, row]) => row.enabled && (!current.has(name) || !current.get(name).enabled)).map(([name]) => name);
    for (const name of disabled) {
      for (const dependent of dependents(name)) {
        const row = (await read()).get(dependent);
        if (row?.enabled) check(await manager.setPluginEnabled(row.entryId, false));
      }
    }
    const afterDisable = await read();
    for (const [name, row] of afterDisable) {
      if (row.enabled && (initial || !previous.get(name)?.enabled) && !disabled.some(item => prerequisites(name).includes(item))) {
        try {
          for (const dependency of prerequisites(name)) await enable(dependency);
        } catch (error) {
          // An enabled child must not pretend to work without its prerequisite.
          const child = (await read()).get(name);
          if (child?.enabled) check(await manager.setPluginEnabled(child.entryId, false));
          warn(error.message);
        }
      }
    }
    previous = await read();
    initialized = true;
  };
  return {
    schedule(initial = false) {
      tail = tail.then(() => closed ? undefined : reconcile(initial)).catch(error => { warn(error.message); });
      return tail;
    },
    close() { closed = true; },
  };
}

// Contexts are scoped by the Host; the first live family member owns the listener.
const coordinators = new WeakMap();
export function registerDependencies(ctx) {
  ctx.inject(['pluginManager'], serviceCtx => {
    const manager = serviceCtx.pluginManager;
    if (!manager) return;
    let shared = coordinators.get(manager);
    if (!shared) {
      const log = typeof ctx.logger === 'function' ? ctx.logger('dsh-life-core') : ctx.logger;
      const coordinator = createDependencyCoordinator(manager, { warn: text => log?.warn?.(text) });
      shared = { coordinator, users: 0 };
      coordinators.set(manager, shared);
      coordinator.schedule(true);
    }
    shared.users++;
    serviceCtx.on('plugin-manager/changed', () => shared.coordinator.schedule());
    serviceCtx.effect(() => () => {
      if (--shared.users === 0) {
        shared.coordinator.close();
        coordinators.delete(manager);
      }
    });
  });
}
