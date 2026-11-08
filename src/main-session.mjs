import { readFileSync } from 'node:fs';
import { configPath } from './paths.mjs';

/** Fail closed without creating directories or inheriting a parent's identity. */
export function mainSessionId() {
  try { return String(JSON.parse(readFileSync(configPath(), 'utf8'))?.mainSessionId ?? '').trim(); }
  catch { return ''; }
}
export function isMainSession(subject) {
  const id = typeof subject === 'string' ? subject : subject?.id;
  const main = mainSessionId();
  return Boolean(main && typeof id === 'string' && id === main);
}
export function registerMainTool(ctx, tool, allowed = isMainSession) {
  return ctx.tools.register({...tool, execute(args, exec) {
    if (!allowed(exec?.agent)) throw Error('Lpipe tools are available only in the configured main session');
    return tool.execute(args, exec);
  }}, {when: ({agent}) => allowed(agent)});
}
export function registerMainSection(ctx, section, allowed = isMainSession) {
  const text = section.text;
  return ctx.systemPrompt.section({...section, text: context => allowed(context?.scope)
    ? (typeof text === 'function' ? text(context) : text) : ''});
}
