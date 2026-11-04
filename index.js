import { loadConfig } from './src/config.mjs';
import { updateConfig } from './src/config.mjs';
import { createPipelineRpcHandler, registerPipelineRpc } from './src/rpc.mjs';

export const name = 'dsh-life-pipline';

/**
 * The bundle's own Host half. It owns the common settings file (today just the
 * main session) and serves it to the「Lpipe 设置」page. Components read that
 * file; they never own it, and they never register this page themselves.
 */
export function apply(ctx) {
  const log = (text) => {
    try {
      const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : ctx?.logger;
      logger?.warn?.(text);
    } catch {
      // Logging must never break the bundle.
    }
  };

  let sessions = null;
  ctx.inject(['sessions'], (sessionsCtx) => {
    sessions = sessionsCtx.sessions ?? null;
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const handle = createPipelineRpcHandler({
      getConfig: loadConfig,
      update: updateConfig,
      get sessions() { return sessions; },
    });
    try {
      registerPipelineRpc(connectionCtx, handle);
    } catch (error) {
      log(`[life-pipline] settings bridge unavailable: ${error?.message ?? error}`);
    }
  });
}
