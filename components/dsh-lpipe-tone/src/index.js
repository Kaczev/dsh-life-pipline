import { isMainSession } from 'dsh-life-core/main-session';
import { registerDependencies } from 'dsh-life-core/dependencies';
import { loadConfig, saveConfig, toneRoot } from './config.mjs';
import { tonePrompt } from './prompt.mjs';
import { createToneRpcHandler, registerToneRpc } from './rpc.mjs';

export const name = 'dsh-lpipe-tone';

export function apply(ctx, options = {}) {
  registerDependencies(ctx);
  const root = options.root ?? toneRoot();
  let rootOf;
  ctx.inject(['subagents'], scopeCtx => {
    scopeCtx.effect(() => {
      rootOf = agent => scopeCtx.subagents.rootOf(agent);
      return () => { rootOf = undefined; };
    });
  });
  // Assembled on each step; read settings live and never rewrite history.
  ctx.inject(['systemPrompt'], promptCtx => {
    promptCtx.effect(() => promptCtx.systemPrompt.section({
      name, order: 715, interpolate: false,
      text: context => {
        const scope = context?.scope;
        if (!scope) return '';
        const main = isMainSession(scope);
        let config;
        try { config = loadConfig(root); }
        catch (error) {
          if (main) throw error;
          return '';
        }
        if (config.allSessions) {
          // Object identity is checked by the live registry, not inferred from an ID or tag.
          try { if (typeof scope !== 'object' || rootOf?.(scope) !== scope) return ''; }
          catch { return ''; }
        } else if (!main) return '';
        return tonePrompt(config);
      },
    }));
  });
  ctx.inject(['connection'], connectionCtx => {
    const handle = createToneRpcHandler({
      load: () => loadConfig(root),
      save: patch => saveConfig(patch, root),
    });
    connectionCtx.effect(() => registerToneRpc(connectionCtx, handle));
  });
}
