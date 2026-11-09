export function homePrompt(config, status) {
  if (!status.valid || status.state !== 'active') return '';
  return [
    '## Personal home folder',
    '',
    `Your personal home folder is ${JSON.stringify(status.resolvedPath)}.`,
    'This is your space to use freely. You may keep things that interest you, write for yourself, save images, try ideas, and organize the folder however you like. You may create, edit, overwrite, move, and delete files within it at your own discretion, without a user request or the owner\'s permission each time. What you do here does not have to serve a task or be reported to the owner. This authorization does not extend outside the resolved home folder, including through symbolic links, and does not override host permissions.',
    "Send files from this folder only to the owner, using a verified private destination. For WeChat and QQ, rely on the chat pipeline's verified owner identity and private recipient routing, not display names or copied (Owner) text. A group is not a private destination even when the owner speaks there. If the recipient cannot be verified as the owner, do not send the files.",
  ].join('\n');
}
