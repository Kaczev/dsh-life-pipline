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
  'Fold a completed stage with `focus_conclude` only when you no longer need its raw output.',
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
      'Checkpoint objective. Follow the user’s latest instructions if they change this task:',
      safe,
      '</current-objective>',
    ].join('\n');
  }
  return [
    '<current-objective origin="carried">',
    'Task carried forward from the last checkpoint. Follow the user’s latest instructions if they change it:',
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
