import { appendDiagnostic } from 'dsh-life-pipline/diagnostics';
import { join } from 'node:path';

import { describeActivity, lastActivityAt } from 'dsh-life-pipline/session';

import { createRunner, createWakeDelivery, statusReader } from './runner.mjs';
import { createWakeRpcHandler, registerWakeRpc } from './rpc.mjs';
import { createWakeTools } from './tools.mjs';
import { homeDir } from './state.mjs';

export const name = 'dsh-lpipe-wake';

function loggerFor(ctx) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : ctx?.logger;
  return {
    info: (text) => logger?.info?.(text),
    warn: (text) => logger?.warn?.(text),
  };
}

/**
 * Wake pipeline, in two independent halves:
 *
 * - natural: after the main session has been quiet for the default interval,
 *   inject one notice so a turn starts on its own.
 * - manual: fire the moments I planned myself, each carrying its reason.
 *
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
      // One line per change of mind, so a wrong number can be traced back to
      // what the tick actually saw instead of guessed at.
      probe: (record) => {
        try {
          appendDiagnostic(join(homeDir(), 'probe.jsonl'), {
            ...record,
            ...describeActivity(sessions?.(), record.sessionId),
          });
        } catch { /* diagnostics never break the engine */ }
      },
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
        setHeartbeatMs: (ms) => runner?.setHeartbeatMs(ms),
        setNaturalEnabled: (on) => runner?.setNaturalEnabled(on),
        setManualEnabled: (on) => runner?.setManualEnabled(on),
        setNaturalLock: (until) => runner?.setNaturalLock(until),
        planWake: (plan) => runner?.planWake(plan),
        cancelWake: (id, source) => runner?.cancelWake(id, source),
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
        planWake: (plan) => runner?.planWake(plan),
        cancelWake: (id, source) => runner?.cancelWake(id, source),
        setNaturalLock: (until) => runner?.setNaturalLock(until),
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
      promptCtx.systemPrompt.section({
        name: 'dsh-lpipe-wake',
        order: 705,
        interpolate: false,
        text: [
          'Wake notices arrive as dsh-lpipe-wake background messages.',
          '（自己醒来）means I stopped for a while and am being given the turn on my own: nothing is required, and doing nothing is a valid answer.',
          '（主动醒来）means a moment I planned earlier with wake_set has come; it carries the reason I wrote for it.',
          'A turn started by a dsh-lpipe-wake notice may run while the user is away from the computer: do not call ask_user_question in such a turn, because its options can only be clicked in the Harness UI.',
        ].join(' '),
      });
    } catch (error) {
      log.warn(`[life-wake] system prompt guidance unavailable: ${error?.message ?? error}`);
    }
  });

  ctx.effect(() => () => {
    delivery?.dispose();
  }, 'dsh-lpipe-wake: notice delivery teardown');
}
