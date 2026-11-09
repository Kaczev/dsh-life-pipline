import { registerDependencies } from './src/dependencies.mjs';
import { isMainSession } from './src/main-session.mjs';
import { loadConfig, updateConfig } from './src/config.mjs';
import { createPipelineRpcHandler, registerPipelineRpc } from './src/rpc.mjs';
import { createAwayGuard, createAwayToolGuard, noteEvaluation } from './src/away-guard.mjs';

export const name = 'dsh-life-core';

/** Common settings remain available; agent-side guards apply only to the main session. */
export function apply(ctx) {
  registerDependencies(ctx);
  const log = (text) => {
    try {
      const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : ctx?.logger;
      logger?.warn?.(text);
    } catch {}
  };
  let sessions = null;
  ctx.inject(['sessions'], (sessionsCtx) => { sessions = sessionsCtx.sessions ?? null; });
  let workspaces = null;
  let createSession = null;
  let renameSession = null;
  ctx.inject(['workspaceRegistry', 'sessionController'], serviceCtx => {
    workspaces = serviceCtx.workspaceRegistry;
    createSession = request => serviceCtx.sessionController.create(request);
    renameSession = request => serviceCtx.sessionController.rename(request);
    serviceCtx.effect(() => () => { workspaces = null; createSession = null; renameSession = null; });
  });
  ctx.inject(['connection'], (connectionCtx) => {
    const handle = createPipelineRpcHandler({ getConfig: loadConfig, update: updateConfig, get sessions() { return sessions; }, workspaces: { list: () => workspaces?.list() ?? [], get: id => workspaces?.get(id) }, createSession: request => { if (!createSession) throw Error('会话服务不可用'); return createSession(request); }, renameSession: request => { if (!renameSession) throw Error('会话服务不可用'); return renameSession(request); } });
    try { registerPipelineRpc(connectionCtx, handle); }
    catch (error) { log(`[life-pipline] settings bridge unavailable: ${error?.message ?? error}`); }
  });
  const record = (via) => (info) => {
    noteEvaluation({ via, ...info });
    if (info.away) log(`[life-pipline] ask_user_question denied (${info.kind}) via ${via}`);
  };
  try {
    const guard = createAwayGuard({ onDeny: record('pre-execute') });
    ctx.on('tools/pre-execute', (exec, next) => isMainSession(exec?.agent) ? guard(exec, next) : next());
  } catch (error) { log(`[life-pipline] away guard (pre-execute) unavailable: ${error?.message ?? error}`); }
  ctx.inject(['tools'], (toolsCtx) => {
    const tools = toolsCtx.tools;
    if (typeof tools?.guard !== 'function') {
      log('[life-pipline] away guard (tools.guard) unavailable: no guard() on the service');
      return;
    }
    try {
      const guard = createAwayToolGuard({ onDeny: record('tools.guard') });
      tools.guard((exec) => isMainSession(exec?.agent) ? guard(exec) : undefined);
    } catch (error) { log(`[life-pipline] away guard (tools.guard) unavailable: ${error?.message ?? error}`); }
  });
  noteEvaluation({ event: 'apply' });
}
