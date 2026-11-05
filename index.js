import { loadConfig } from './src/config.mjs';
import { updateConfig } from './src/config.mjs';
import { createPipelineRpcHandler, registerPipelineRpc } from './src/rpc.mjs';
import { createAwayGuard } from './src/away-guard.mjs';

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

  // Turns delivered by a notice may run without anyone at the keyboard, so a
  // blocking question would hang the session. Deny it and say why.
  try {
    ctx.on('tools/pre-execute', createAwayGuard({
      onDeny: (info) => log(`[life-pipline] ask_user_question denied on a ${info.kind} turn`),
    }));
  } catch (error) {
    log(`[life-pipline] away guard unavailable: ${error?.message ?? error}`);
  }

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
