import { randomUUID } from 'node:crypto';

export const FOCUS_SOURCE_KIND = 'dsh-lpipe-focus';

function nudgeText(chars) {
  return [
    '<system-reminder>',
    `Work since the last equivalence layer: ${chars} characters. What has this work established? If that result can replace the span and you are starting further substantive work, call focus_equate before proceeding. If your next action is a reply or a question, respond directly.`,
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

export function createFocusUserMessage({ text, source }) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({ ...source }),
  });
}

export function buildObjectiveMessage({ rawText, origin, now = Date.now(), asNotice = false }) {
  return createFocusUserMessage({
    text: renderObjectiveText(rawText),
    source: {
      kind: FOCUS_SOURCE_KIND,
      layer: 'objective',
      origin,
      rawText,
      createdAt: now,
      ...(asNotice ? { form: 'notice', summary: '聚焦 · 当前目标' } : {}),
    },
  });
}

const layerSections = [
  ['definitions', 'Definitions'], ['experience', 'Experience'], ['conclusions', 'Conclusions'], ['work_done', 'Work done'],
];

export function renderFocusLayerText(layer) {
  return [
    `<equivalence key="${layer.key}">`,
    ...(layer.supersedes.length ? [`Supersedes: ${layer.supersedes.join(', ')}`] : []),
    ...layerSections.filter(([field]) => layer[field]).map(([field, label]) => `${label}: ${escapeClosingTag(layer[field], 'equivalence')}`),
    '</equivalence>',
  ].join('\n');
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
