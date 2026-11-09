import { registerDependencies } from 'dsh-life-core/dependencies';
import { createComponentManager } from 'dsh-life-core/components';
import { registerPipelineRpc } from 'dsh-life-core/internal/rpc';
import { COMPONENTS, CORE } from 'dsh-life-core/dependencies';

export const name = 'dsh-life-pipline';

/** Select canonical bundle layers once; subsequent component switches remain user-owned. */
export function apply(ctx) {
  registerDependencies(ctx);
  ctx.inject(['pluginManager', 'connection'], serviceCtx => {
    const handle = createComponentManager(serviceCtx.pluginManager);
    registerPipelineRpc(serviceCtx, async (method, payload) => {
      if (!['pipeline.components', 'pipeline.components.set'].includes(method)) return {ok:false,error:{code:'pipeline/unknown-method',message:'Unknown method',details:{}}};
      return handle(method, payload);
    }, 'dsh-life-components');
  });
  ctx.inject(['pluginManager'], serviceCtx => {
    let disposed = false;
    serviceCtx.effect(() => () => { disposed = true; });
    const manager = serviceCtx.pluginManager;
    const log = typeof ctx.logger === 'function' ? ctx.logger(name) : ctx.logger;
    const activate = async () => {
      const bundles = await manager.listBundles();
      for (const target of [CORE, ...COMPONENTS]) {
        if (disposed) return;
        if (bundles.find(bundle => bundle.name === target)?.enabled) continue;
        const result = await manager.setBundleEnabled(target, true);
        if (result.application !== 'applied') throw Error(`${target}: ${result.application} ${result.error?.diagnostic ?? ''}`);
      }
    };
    activate().catch(error => log?.warn?.(`Life Pipline activation incomplete: ${error.message}`));
  });
}
