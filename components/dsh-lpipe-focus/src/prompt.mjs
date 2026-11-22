export const FOCUS_PROMPT_SECTION_NAME = 'dsh-lpipe-focus';
export const FOCUS_PROMPT_ORDER = 712;

export const FOCUS_SYSTEM_PROMPT = [
  '## Context equivalence (`focus_equate`)',
  '',
  'If your next action is to answer the user or ask a question, do that directly. When the preceding work has established a result and you are about to start the next substantive piece of work, call `focus_equate` before proceeding. This applies within a turn and across turns. Do not wait for a reminder.',
  '',
  'After the fold, the original span is no longer available to you. Prepare the complete replacement before calling the tool. Read the proposed arguments against the entire span, not just its latest result. If an omission would change how you understand the user, what you would say, or what you would do, include the missing detail in this call.',
  '',
  "Preserve the user's goal, the language and context of the exchange, and the decisions and constraints that still apply. Keep enough detail to continue from the actual state of the work without repeating completed checks or reloading skills whose instructions are already known. For those skills, retain both their names and the rules that still apply.",
  '',
  'Distinguish what was requested, reported, attempted, verified, ruled out, and left unresolved. Keep the evidence and conditions needed to support those distinctions. When a judgment depends on exact wording, arguments, or a tool result, retain the relevant detail. Do not infer a cause that the evidence does not establish. Omit process that has no bearing on later understanding or action.',
  '',
  'Use the latest definition of a term unless interpreting an earlier exchange in its own context. Do not reconstruct a lost definition. Put instructions that govern only the immediate continuation in `next`, the separate reminder, rather than turning them into lasting conclusions.',
].join('\n');
