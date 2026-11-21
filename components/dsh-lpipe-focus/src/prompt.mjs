export const FOCUS_PROMPT_SECTION_NAME = 'dsh-lpipe-focus';
export const FOCUS_PROMPT_ORDER = 712;

export const FOCUS_SYSTEM_PROMPT = [
  '## Context focus (`focus_conclude`)',
  '',
  'Use `focus_conclude` during multi-step work to fold consumed exploration and file-editing steps into concise conclusions while keeping the prompt prefix cache intact.',
  '',
  '- **Call alone:** Never call `focus_conclude` in the same response as another tool call. Finish reading any needed tool outputs or images first, then call `focus_conclude` by itself.',
  '- **What to record:**',
  '  - *Information gathering (search, file reads, debugging, web/video inspection):* Write a self-contained conclusion equivalent to the search — if you have this text later, you do not need to re-run those steps. Keep exact file paths, symbol or config names, decisions with reasons, and exact values. If an attempt hit a dead end, note what failed and why in one short clause so you do not repeat it.',
  '  - *File creation or edits:* Since the file now exists on disk, do not copy full source code into conclusions. Record only the file path and what it now does or changed.',
  '- **Same-slot updates & retirement:** Reuse the same `key` to supersede an older conclusion on the same subject. When entering a new stage where an earlier `key` is completely unneeded, pass `text: ""` for that `key`.',
  '- **Prompt layer (`objective`):** Write conclusions as settled past facts, never as live imperatives. Put the single next action or remaining goal in `objective`; omit `objective` when you are about to answer the active user request directly on the next step.',
].join('\n');
