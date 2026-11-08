import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../skills/lpipe-chat-media/SKILL.md', import.meta.url));
export function registerChatSkill(ctx) {
  const source = readFileSync(path, 'utf8');
  const description = source.match(/^description: (.+)$/m)?.[1];
  if (!description) throw new Error('Chat skill description is missing');
  return ctx.skills.register({
    name: 'lpipe-chat-media', description, source: 'runtime', provider: 'dsh-lpipe-chat',
    path, resourceBase: { kind: 'directory', path: fileURLToPath(new URL('../skills/lpipe-chat-media/', import.meta.url)) },
    invocation: { modelInvocable: true, userInvocable: true },
    content: source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''),
  });
}
