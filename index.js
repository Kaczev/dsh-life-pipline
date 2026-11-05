import { loadConfig } from './src/config.mjs';
import { updateConfig } from './src/config.mjs';
import { createPipelineRpcHandler, registerPipelineRpc } from './src/rpc.mjs';
import { createAwayGuard, createAwayToolGuard, noteEvaluation } from './src/away-guard.mjs';

export const name = 'dsh-life-pipline';

/**
 * The bundle's own Host half. It owns the common settings file (today just the
 * main session) and serves it to the「Lpipe 设置」page. Components read that
 * file; they never own it, and they never register this page themselves.
 *
 * It also guards `ask_user_question`: a turn delivered by a WeChat/QQ batch or
 * a wake notice may run with nobody at the keyboard, and a blocking question
 * would hang that turn until the owner came back.
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

  // Every `ask_user_question` evaluation is recorded, allow or deny: the file
  // is the only way to tell "the guard ran and said yes" from "the guard never
  // ran at all".
  const record = (via) => (info) => {
    noteEvaluation({ via, ...info });
    if (info.away) log(`[life-pipline] ask_user_question denied (${info.kind}) via ${via}`);
  };

  // Scope-filtered waterfall: reachable only when this plugin's context sits on
  // the calling agent's scope chain.
  try {
    ctx.on('tools/pre-execute', createAwayGuard({ onDeny: record('pre-execute') }));
  } catch (error) {
    log(`[life-pipline] away guard (pre-execute) unavailable: ${error?.message ?? error}`);
  }

  // Monotonic guard: registered on the ToolsService layer, so every call walks
  // it regardless of which agent issued the call.
  ctx.inject(['tools'], (toolsCtx) => {
    const tools = toolsCtx.tools;
    if (typeof tools?.guard !== 'function') {
      log('[life-pipline] away guard (tools.guard) unavailable: no guard() on the service');
      return;
    }
    try {
      tools.guard(createAwayToolGuard({ onDeny: record('tools.guard') }));
    } catch (error) {
      log(`[life-pipline] away guard (tools.guard) unavailable: ${error?.message ?? error}`);
    }
  });

  noteEvaluation({ event: 'apply' });
}
