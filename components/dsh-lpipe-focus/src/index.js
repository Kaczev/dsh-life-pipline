import { join } from 'node:path';
import { isMainSession, registerMainSection } from 'dsh-life-core/main-session';
import { registerDependencies } from 'dsh-life-core/dependencies';
import { appendDiagnostic, DIAGNOSTIC_MAX_BYTES } from 'dsh-life-core/diagnostics';
import { focusRoot, loadConfig, saveConfig } from './config.mjs';
import { createFocusRpcHandler, registerFocusRpc } from './rpc.mjs';
import { FOCUS_PROMPT_ORDER, FOCUS_PROMPT_SECTION_NAME, FOCUS_SYSTEM_PROMPT } from './prompt.mjs';
import { createFocusEquateTool } from './tools.mjs';
import { createPreStepHandler } from './surface.mjs';

export const name = 'dsh-lpipe-focus';

export function createFocusSessionGate(root, rootOf) {
  return (agent) => {
    if (!agent || typeof agent !== 'object') return false;
    try {
      const owner = rootOf(agent);
      if (!owner?.session?.id) return false;
      const config = loadConfig(root);
      return (owner === agent || config.includeSubagents) && (config.allSessions || isMainSession(owner.session.id));
    } catch {
      // The host rejects stale agents and sessions outside its managed tree.
      return false;
    }
  };
}

export function registerFocusTool(ctx, tool, allowed) {
  return ctx.tools.register(
    {
      ...tool,
      execute(args, exec) {
        if (!allowed(exec?.agent)) {
          throw new Error(`${tool.name} is not enabled for this session`);
        }
        return tool.execute(args, exec);
      },
    },
    { when: ({ agent }) => allowed(agent) },
  );
}

export function apply(ctx, options = {}) {
  registerDependencies(ctx);
  const root = options.root ?? focusRoot();
  let rootOf;
  ctx.inject(['subagents'], (scopeCtx) => {
    scopeCtx.effect(() => {
      rootOf = agent => scopeCtx.subagents.rootOf(agent);
      return () => { rootOf = undefined; };
    });
  });
  const allowed = options.allowed ?? createFocusSessionGate(root, agent => rootOf?.(agent));
  const now = options.now ?? (() => Date.now());
  const diagnosticPath = join(root, 'focus.jsonl');

  const writeDiagnostic = (entry) => {
    try {
      // A valid fold can exceed the normal rolling budget. Fit its whole UTF-8 line.
      const maxBytes = entry.event === 'folded'
        ? Math.max(DIAGNOSTIC_MAX_BYTES, Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1)
        : undefined;
      appendDiagnostic(diagnosticPath, entry, maxBytes);
    } catch {
      /* never disrupt the main conversation on diagnostic write errors */
    }
  };

  writeDiagnostic({ event: 'loaded', root });

  const preStep = createPreStepHandler({
    loadConfig: () => loadConfig(root),
    allowed,
    now,
    onDiagnostic: writeDiagnostic,
  });

  if (typeof ctx.on === 'function') {
    ctx.on('agent/pre-step', preStep, { prepend: true });
  }

  ctx.inject(['tools'], (toolsCtx) => {
    const tool = createFocusEquateTool({ onDiagnostic: writeDiagnostic });
    toolsCtx.effect(() => registerFocusTool(toolsCtx, tool, allowed));
  });

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.effect(() => registerMainSection(promptCtx, {
      name: FOCUS_PROMPT_SECTION_NAME,
      order: FOCUS_PROMPT_ORDER,
      interpolate: false,
      text: FOCUS_SYSTEM_PROMPT,
    }, allowed));
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const handle = createFocusRpcHandler({
      load: () => loadConfig(root),
      save: (patch) => saveConfig(patch, root),
    });
    connectionCtx.effect(() => registerFocusRpc(connectionCtx, handle));
  });
}
