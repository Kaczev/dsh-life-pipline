import { join } from 'node:path';
import { isMainSession, registerMainSection } from 'dsh-life-core/main-session';
import { registerDependencies } from 'dsh-life-core/dependencies';
import { appendDiagnostic } from 'dsh-life-core/diagnostics';
import { focusRoot, loadConfig, saveConfig } from './config.mjs';
import { createFocusRpcHandler, registerFocusRpc } from './rpc.mjs';
import { FOCUS_PROMPT_ORDER, FOCUS_PROMPT_SECTION_NAME, FOCUS_SYSTEM_PROMPT } from './prompt.mjs';
import { createFocusConcludeTool } from './tools.mjs';
import { createPreStepHandler } from './surface.mjs';

export const name = 'dsh-lpipe-focus';

export function isSubagentSubject(subject) {
  if (!subject || typeof subject !== 'object') return false;
  if (typeof subject.options?.subagentDepth === 'number' && subject.options.subagentDepth > 0) return true;
  const header = subject.session?.header;
  if (header?.origin === 'subagent') return true;
  if (typeof header?.delegationDepth === 'number' && header.delegationDepth > 0) return true;
  if (typeof subject.parentSession === 'string' && subject.parentSession.trim().length > 0) return true;
  return false;
}

export function createFocusSessionGate(root = focusRoot()) {
  return (subject) => {
    const id = typeof subject === 'string' ? subject : subject?.id;
    if (typeof id !== 'string' || !id.trim()) return false;
    if (isSubagentSubject(subject)) return false;
    if (isMainSession(id)) return true;
    try {
      return loadConfig(root).allSessions === true;
    } catch {
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
          throw new Error('focus_conclude is not enabled for this session');
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
  const allowed = options.allowed ?? createFocusSessionGate(root);
  const now = options.now ?? (() => Date.now());
  const diagnosticPath = join(root, 'focus.jsonl');

  const writeDiagnostic = (entry) => {
    try {
      appendDiagnostic(diagnosticPath, entry);
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
    const tool = createFocusConcludeTool({ onDiagnostic: writeDiagnostic });
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
