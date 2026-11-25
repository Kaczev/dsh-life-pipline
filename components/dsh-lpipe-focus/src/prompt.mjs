export const FOCUS_PROMPT_SECTION_NAME = 'dsh-lpipe-focus';
export const FOCUS_PROMPT_ORDER = 712;

export const FOCUS_SYSTEM_PROMPT = [
  '## Context equivalence (`focus_equate`)',
  '',
  'An equivalence layer takes the place of part of the conversation. After a fold, the original messages in that span are unavailable. Preserve enough for the next model to understand the user, answer what is still due, and continue the work in the language and context of the exchange. Once a piece of work has produced a result, fold before starting the next substantive piece. Decisions, corrections, and open questions can also accumulate across short exchanges. If your next reply or action depends on those details, fold before using them. Otherwise, answer or ask the user directly.',
].join('\n');
