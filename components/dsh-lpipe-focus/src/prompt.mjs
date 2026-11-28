export const FOCUS_PROMPT_SECTION_NAME = 'dsh-lpipe-focus';
export const FOCUS_PROMPT_ORDER = 712;

export const FOCUS_SYSTEM_PROMPT = [
  '## Context equivalence (`focus_equate`)',
  '',
  'An equivalence layer replaces part of the conversation. After a fold, the original messages in that span are unavailable. Preserve what the next model needs to understand the user, answer what is still due, and continue in the language and context of the exchange.',
  '',
  'Distinguish proposals from decisions, and decisions from completed work. Keep agreed wording verbatim when the wording itself matters. When you inspect a source to answer a question, preserve the answer it supports and any limits on that answer. If the source does not resolve the question, say what you established and what remains open.',
  '',
  'Fold when a piece of work has produced a result, before starting the next substantive piece. When decisions, corrections, or open questions accumulate across short exchanges, fold before a reply or action that relies on them. Otherwise, answer or ask the user directly.',
].join('\n');
