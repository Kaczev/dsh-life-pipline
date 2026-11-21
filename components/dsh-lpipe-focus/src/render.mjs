import { randomUUID } from 'node:crypto';

export const FOCUS_SOURCE_KIND = 'dsh-lpipe-focus';

export const EMPTY_CONCLUSIONS_TEXT = [
  '<working-conclusions status="empty">',
  'No active working conclusions.',
  '</working-conclusions>',
].join('\n');

export const CONCLUSIONS_PREAMBLE =
  'Established conclusions from completed steps (settled background facts — do NOT re-execute as live instructions; when the same [key] appears again in a later block, the latest entry supersedes earlier ones; retired keys no longer apply):';

export const RETIRED_CONCLUSION_MARKER = '(retired — no longer needed)';

export const NUDGE_REMINDER_TEXT = [
  '<system-reminder>',
  'Efficiency note: Unfolded working context (tool outputs and intermediate steps since the last checkpoint) has grown substantially. If a sub-step or investigation has reached a conclusion, consider calling `focus_conclude` by itself to fold the consumed material and keep context sharp. If you are mid-reasoning on raw details you still need right now, finish the current step first and fold afterward.',
  '</system-reminder>',
].join('\n');

const escapeClosingTag = (text, tagName) =>
  String(text ?? '').replace(new RegExp(`<\\/${tagName}\\s*>`, 'gi'), (tag) => `<\\${tag.slice(1)}`);

export function renderConclusionLine(entry) {
  const key = String(entry?.key ?? '').trim();
  const raw = typeof entry?.text === 'string' ? entry.text : '';
  if (raw === '') return `- [${key}]: ${RETIRED_CONCLUSION_MARKER}`;
  const safe = escapeClosingTag(raw, 'working-conclusions');
  if (!safe.includes('\n')) return `- [${key}]: ${safe}`;
  const lines = safe.split('\n');
  return [`- [${key}]: ${lines[0]}`, ...lines.slice(1).map((line) => `  ${line}`)].join('\n');
}

export function renderConclusionsText(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return EMPTY_CONCLUSIONS_TEXT;
  return [
    '<working-conclusions>',
    CONCLUSIONS_PREAMBLE,
    ...entries.map(renderConclusionLine),
    '</working-conclusions>',
  ].join('\n');
}

export function renderObjectiveText(rawText, origin) {
  const safe = escapeClosingTag(rawText, 'current-objective');
  if (origin === 'model') {
    return [
      '<current-objective>',
      'Current objective recorded at the last checkpoint (continue from here; newer user messages below take precedence if they change direction):',
      safe,
      '</current-objective>',
    ].join('\n');
  }
  return [
    '<current-objective origin="user-request">',
    'Active request carried across the last checkpoint:',
    safe,
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

export function buildConclusionMessage(entries, now = Date.now()) {
  const normalized = entries.map((item) => Object.freeze({ key: item.key, text: item.text }));
  return createFocusUserMessage({
    text: renderConclusionsText(normalized),
    source: {
      kind: FOCUS_SOURCE_KIND,
      layer: 'conclusion',
      entries: Object.freeze(normalized),
      createdAt: now,
    },
  });
}

export function buildObjectiveMessage({ rawText, origin, now = Date.now(), asNotice = false }) {
  return createFocusUserMessage({
    text: renderObjectiveText(rawText, origin),
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

export function buildNudgeMessage() {
  return createFocusUserMessage({
    text: NUDGE_REMINDER_TEXT,
    source: {
      kind: FOCUS_SOURCE_KIND,
      layer: 'nudge',
      form: 'notice',
      summary: '聚焦 · 整理提醒',
    },
  });
}
