import { registerMainSection } from 'dsh-life-core/main-session';
import { registerDependencies } from 'dsh-life-core/dependencies';
import { loadConfig, saveConfig, toneRoot } from './config.mjs';
import { tonePrompt } from './prompt.mjs';
import { createToneRpcHandler, registerToneRpc } from './rpc.mjs';

export const name = 'dsh-lpipe-tone';

export function apply(ctx, options = {}) {
  registerDependencies(ctx);
  const root = options.root ?? toneRoot();
  // A section provider is evaluated on each assembly; no history rewriting or timers.
  ctx.inject(['systemPrompt'], promptCtx => {
    promptCtx.effect(() => registerMainSection(promptCtx, {
      name, order: 715, interpolate: false,
      text: () => tonePrompt(loadConfig(root)),
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
