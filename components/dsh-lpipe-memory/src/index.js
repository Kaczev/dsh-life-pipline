import { registerDependencies } from 'dsh-life-core/dependencies';
import { homeDir } from 'dsh-life-core/internal/paths';
import { isMainSession, registerMainSection } from 'dsh-life-core/main-session';
import { SETTING_PROMPT, WISH_PROMPT } from './prompt.mjs';
import { createMemoryService, registerMemoryRpc } from './service.mjs';
import { createSettingsHandlers } from './settings-context.mjs';
import { MEMORY_KINDS, openMemoryStore } from './store.mjs';
import { createMemoryTool } from './tools.mjs';

export const name = 'dsh-lpipe-memory';
export const inject = [];

export function apply(ctx, options = {}) {
  registerDependencies(ctx);
  const isMain = options.isMain ?? isMainSession;
  let rootOf;
  ctx.inject(['subagents'], scopeCtx => {
    scopeCtx.effect(() => {
      rootOf = agent => scopeCtx.subagents.rootOf(agent);
      return () => { rootOf = undefined; };
    });
  });
  const allowedInState = (kind, state, agent) => {
    if (!state?.[kind]?.enabled || !agent || typeof agent !== 'object') return false;
    try {
      const root = rootOf?.(agent);
      return root === agent && Boolean(root.session?.id) &&
        ((state.allSessions && state.sharedLists[kind]) || isMain(root.session.id));
    } catch {
      // Detached and stale agents are not eligible, even in all-sessions mode.
      return false;
    }
  };
  const warn = error => {
    const logger = typeof ctx.logger === 'function' ? ctx.logger(name) : ctx.logger;
    logger?.warn?.(`Memory: ${String(error)}`);
  };
  const service = createMemoryService({ opened: openMemoryStore(options.home ?? homeDir()), allowedInState, warn });
  ctx.effect(() => () => service.close());

  const settings = createSettingsHandlers({
    allowedInState,
    current: async () => {
      try { return await service.readCurrent(); }
      catch { return undefined; } // Leave history untouched if the store cannot be read.
    },
  });
  ctx.on('agent/pre-step', settings.preStep, { prepend: true });

  ctx.inject(['tools'], toolsCtx => {
    for (const kind of MEMORY_KINDS) {
      toolsCtx.effect(() => toolsCtx.tools.register(createMemoryTool(kind, service), {
        when: ({ agent }) => service.allowed(kind, agent),
      }));
    }
  });
  ctx.inject(['systemPrompt'], promptCtx => {
    for (const [kind, text] of [['wishes', WISH_PROMPT], ['settings', SETTING_PROMPT]]) {
      promptCtx.effect(() => registerMainSection(promptCtx, {
        name: `${name}/${kind}`, order: 220, interpolate: false, text,
      }, subject => service.allowed(kind, subject)));
    }
  });
  ctx.inject(['connection'], connectionCtx => {
    connectionCtx.effect(() => registerMemoryRpc(connectionCtx, service.rpc));
  });
}
