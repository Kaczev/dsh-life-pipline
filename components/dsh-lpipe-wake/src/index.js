import { registerMainTool, registerMainSection } from 'dsh-life-core/main-session';
import { appendDiagnostic } from 'dsh-life-core/diagnostics';
import { join } from 'node:path';

import { describeActivity, lastActivityAt } from 'dsh-life-core/session';

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
import { registerDependencies } from 'dsh-life-core/dependencies';

export function apply(ctx) {
  registerDependencies(ctx);
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
        registerMainTool(toolsCtx, tool);
      } catch (error) {
        log.warn(`[life-wake] could not register ${tool.name}: ${error?.message ?? error}`);
      }
    }
  });

  ctx.inject(['systemPrompt'], (promptCtx) => {
    try {
      registerMainSection(promptCtx, {
        name: 'dsh-lpipe-wake',
        order: 705,
        interpolate: false,
        text: [
          '## Lpipe Wake — Self-wake and planned wake',
          'Between turns, you are inactive. Another turn begins when a message or background event reaches you. This pipeline provides two ways to wake with the passage of time: a natural wake after a configured period of inactivity, and a planned wake at a time you choose with wake_set. Each operates only while its corresponding wake switch is enabled.',
          'You may use wake_set in any turn to choose when you want another turn, whether to return to something later or simply because you want to. This does not require a user request. For a particular time or delay, use a planned wake; natural wakes follow the idle interval and may be postponed by activity. Check the tool result to know whether your wake is scheduled and enabled.',
          'Wake notices arrive as dsh-lpipe-wake background messages.',
          '（自己醒来）means you stopped for a while and now have a turn to yourself. Nothing is required; doing nothing is valid.',
          '（主动醒来）means a moment you planned with wake_set has arrived. The notice includes the reason you left for yourself. You may follow that plan or change your mind.',
          'In a wake-notice turn, do not use ask_user_question: the user may be away, and its controls require the Harness UI.',
        ].join('\n\n'),
      });
    } catch (error) {
      log.warn(`[life-wake] system prompt guidance unavailable: ${error?.message ?? error}`);
    }
  });

  ctx.effect(() => () => {
    delivery?.dispose();
  }, 'dsh-lpipe-wake: notice delivery teardown');
}
