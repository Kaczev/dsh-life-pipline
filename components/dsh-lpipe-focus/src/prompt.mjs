export const FOCUS_PROMPT_SECTION_NAME = 'dsh-lpipe-focus';
export const FOCUS_PROMPT_ORDER = 712;

export const FOCUS_SYSTEM_PROMPT = [
  '## Context focus (`focus_conclude`)',
  '',
  'Fold a completed stage when its conclusion and the current workspace let you take the next step without replaying that stage. Keep what the work established, not a log of how you got there.',
  'After a search, keep the useful location and what it is for. After writing a test, keep the command to run it; report a pass or failure only if you ran it. Keep a constraint or failed approach when it changes the next decision.',
  'If you still need the raw output to edit, quote, or check something, use it before folding. Do not copy user instructions, host context, or skill text into conclusions. When you can already answer or need a decision from the user, respond directly.',
].join('\n');
