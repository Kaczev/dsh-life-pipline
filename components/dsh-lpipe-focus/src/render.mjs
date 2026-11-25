import { randomUUID } from 'node:crypto';

export const FOCUS_SOURCE_KIND = 'dsh-lpipe-focus';

function nudgeText(chars) {
  return [
    '<system-reminder>',
    `Work since the last equivalence layer: ${chars} characters. Review this span using the folding criteria in the context equivalence instructions.`,
    '</system-reminder>',
  ].join('\n');
}

const escapeClosingTag = (text, tagName) =>
  String(text ?? '').replace(new RegExp(`<\\/${tagName}\\s*>`, 'gi'), (tag) => `<\\${tag.slice(1)}`);

function renderObjectiveText(rawText) {
  return [
    '<current-objective>',
    "Next-step hint from the last equivalence layer. The user's latest instructions take precedence:",
    escapeClosingTag(rawText, 'current-objective'),
    '</current-objective>',
  ].join('\n');
}

function indentContinuation(text, spaces) {
  return text.replace(/\r\n?|\n/g, `\n${spaces}`);
}

function renderDetails(entries) {
  return entries.map(({ content, known, unknown }) => [
    `- ${indentContinuation(content, '  ')}`,
    ...(known ? [`  - Known: ${indentContinuation(known, '    ')}`] : []),
    ...(unknown ? [`  - Unknown: ${indentContinuation(unknown, '    ')}`] : []),
  ].join('\n')).join('\n');
}

export function buildTodoMessage(entries, now = Date.now()) {
  if (!entries?.length) return null;
  const text = renderDetails(entries);
  return createFocusUserMessage({
    text: `<current-todos>\n${escapeClosingTag(text, 'current-todos')}\n</current-todos>`,
    source: { kind: FOCUS_SOURCE_KIND, layer: 'todos', entries, rawText: text, createdAt: now },
  });
}

export function createFocusUserMessage({ text, source }) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({ ...source }),
  });
}

export function buildObjectiveMessage({ entries, origin, now = Date.now(), asNotice = false }) {
  if (!entries?.length) return null;
  const rawText = renderDetails(entries);
  return createFocusUserMessage({
    text: renderObjectiveText(rawText),
    source: {
      kind: FOCUS_SOURCE_KIND,
      layer: 'objective',
      origin,
      entries,
      rawText,
      createdAt: now,
      ...(asNotice ? { form: 'notice', summary: '聚焦 · 当前目标' } : {}),
    },
  });
}

const layerSections = [
  ['definitions', 'Definitions'], ['experience', 'Experience'], ['guidance', 'Guidance'],
  ['conclusions', 'Conclusions'], ['work_done', 'Work done'],
];

export function renderFocusLayerText(layer) {
  const sections = layerSections.filter(([field]) => layer[field]?.length).map(([field, label]) =>
    `## ${label}\n\n${escapeClosingTag(renderDetails(layer[field]), 'equivalence')}`);
  if (layer.supersedes.length) sections.unshift(`Supersedes: ${layer.supersedes.join(', ')}`);
  return [`<equivalence key="${layer.key}">`, sections.join('\n\n'), '</equivalence>'].join('\n');
}

export function buildFocusLayerMessage(args, now = Date.now()) {
  const layer = { key: args.key, supersedes: Object.freeze([...args.supersedes]) };
  for (const [field] of layerSections) if (args[field]) layer[field] = args[field];
  return createFocusUserMessage({
    text: renderFocusLayerText(layer),
    source: { kind: FOCUS_SOURCE_KIND, layer: 'equivalence', ...layer, createdAt: now },
  });
}

export function buildPressureMessage() {
  return createFocusUserMessage({
    text: '<system-reminder>\nThe context has reached the size threshold. When you next call focus_equate, list an earlier layer in supersedes only if the new layer preserves everything still needed from it. Otherwise leave that layer in place.\n</system-reminder>',
    source: { kind: FOCUS_SOURCE_KIND, layer: 'pressure', form: 'notice', summary: '聚焦 · 上下文空间提醒' },
  });
}

export function buildNudgeMessage(chars) {
  return createFocusUserMessage({
    text: nudgeText(chars),
    source: {
      kind: FOCUS_SOURCE_KIND,
      layer: 'nudge',
      form: 'notice',
      summary: '聚焦 · 整理提醒',
    },
  });
}
