import { lastActivityAt } from 'dsh-life-pipline/session';

import { createRunner, createWakeDelivery, statusReader } from './runner.mjs';
import { createWakeRpcHandler, registerWakeRpc } from './rpc.mjs';
import { createWakeTools } from './tools.mjs';

export const name = 'dsh-lpipe-wake';

function loggerFor(ctx) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : ctx?.logger;
  return {
    info: (text) => logger?.info?.(text),
    warn: (text) => logger?.warn?.(text),
  };
}

/**
 * Wake pipeline: after the main session has been idle for the default
 * interval, inject one notice into it so the agent starts a turn on its own.
 * The main session comes from the series' common settings, never from here.
 */
export function apply(ctx) {
  const log = loggerFor(ctx);

  let runner = null;
  let delivery = null;
  let sessions = null;

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessions = () => sessionsCtx.sessions;
  });

  ctx.inject(['sessionController'], (sessionCtx) => {
    const controller = sessionCtx.sessionController;
    const current = createWakeDelivery(controller);
    delivery = current;

    runner = createRunner({
      statusOf: statusReader(controller),
      // The main session's own log answers "when did the conversation last
      // end"; the sessions service is read lazily so a late mount still works.
      activityOf: (sessionId) => lastActivityAt(sessions?.(), sessionId),
      deliver: (request) => current.deliver(request),
      log,
    });
    runner.start();

    sessionCtx.effect(() => () => {
      current.dispose();
      if (delivery === current) delivery = null;
      runner?.dispose();
      runner = null;
    }, 'dsh-lpipe-wake: engine teardown');
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const handle = createWakeRpcHandler({
      runner: {
        snapshot: () => runner?.snapshot() ?? {},
        setIntervalMs: (ms) => runner?.setIntervalMs(ms),
        setEnabled: (on) => runner?.setEnabled(on),
        setNextWake: (at) => runner?.setNextWake(at),
        clearNextWake: () => runner?.clearNextWake(),
        tick: async () => { await runner?.tick(); },
      },
    });
    try {
      registerWakeRpc(connectionCtx, handle);
    } catch (error) {
      log.warn(`[life-wake] settings bridge unavailable: ${error?.message ?? error}`);
    }
  });

  ctx.inject(['tools'], (toolsCtx) => {
    const tools = createWakeTools({
      runner: {
        snapshot: () => runner?.snapshot() ?? {},
        setNextWake: (at) => runner?.setNextWake(at),
        clearNextWake: () => runner?.clearNextWake(),
      },
    });
    for (const tool of tools) {
      try {
        toolsCtx.tools.register(tool);
      } catch (error) {
        log.warn(`[life-wake] could not register ${tool.name}: ${error?.message ?? error}`);
      }
    }
  });

  ctx.inject(['systemPrompt'], (promptCtx) => {
    try {
      promptCtx.systemPrompt.context({
        name: 'dsh-lpipe-wake',
        order: 130,
        text: 'Wake notices arrive as dsh-lpipe-wake background messages starting with（自己醒来）；they mean you stopped for a while and are being given the turn on your own. Treat them as your own time: nothing is required, and doing nothing is a valid answer.',
      });
    } catch (error) {
      log.warn(`[life-wake] system prompt guidance unavailable: ${error?.message ?? error}`);
    }
  });

  ctx.effect(() => () => {
    delivery?.dispose();
  }, 'dsh-lpipe-wake: notice delivery teardown');
}
