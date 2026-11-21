export const FOCUS_PROMPT_SECTION_NAME = 'dsh-lpipe-focus';
export const FOCUS_PROMPT_ORDER = 712;

export const FOCUS_SYSTEM_PROMPT = [
  '## Context equivalence (`focus_equate`)',
  '',
  'When a stage of work is complete, ask: if the original span were no longer visible, could I continue correctly from the proposed layer, the remaining context, and the workspace? If so, the span is ready to equate. Otherwise, keep it. A reminder is not a requirement to act. If you are ready to answer or ask a question, do that directly.',
  '',
  'Use the latest definition of a term by default. When interpreting an earlier exchange, use its meaning in that context if it is still visible. Do not infer a lost definition.',
  '',
  'Continue from the layers that remain. Preserve the difference between what was reported and what was verified. Do not repeat completed work unless something has changed or needs checking.',
].join('\n');
