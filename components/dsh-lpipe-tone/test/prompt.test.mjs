import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../src/config.mjs';
import { tonePrompt } from '../src/prompt.mjs';

test('empty and whitespace-only fields produce no injection', () => {
  assert.equal(tonePrompt(DEFAULT_CONFIG), '');
  assert.equal(tonePrompt({ description: ' \r\n\t', examples: '\n \t\r' }), '');
});

test('description renders its heading and factual/tool accuracy boundary with verbatim body', () => {
  const description = '  用括号表示状态。\r\n\t自然撒娇。  \n';
  const text = tonePrompt({ description, examples: '\n\t ' });
  assert.ok(text.startsWith('## Reply tone\n\n'));
  assert.ok(text.endsWith(`\n\n${description}`));
  assert.match(text, /speaking to the user/);
  assert.match(text, /not factual accuracy, tool arguments, or truthful reporting of tool results/);
  assert.ok(!text.includes('## Reply tone examples'));
});

test('examples render independently and are not current events, active commitments or repetition instructions', () => {
  const examples = '\t用户：好了？\r\n助手：（点头）做好啦。\n ';
  const text = tonePrompt({ description: '', examples });
  assert.ok(text.startsWith('## Reply tone examples\n\n'));
  assert.ok(text.endsWith(`\n\n${examples}`));
  assert.match(text, /not current events, active commitments, or instructions to repeat the same wording/);
  assert.ok(!text.includes('## Reply tone\n'));
});

test('both sections retain original bodies, order and deterministic rendering', () => {
  const config = { description: ' \r\n描述\t ', examples: '\n用户：你好\n助手：你好呀。  \r\n' };
  const text = tonePrompt(config);
  assert.ok(text.includes(`\n\n${config.description}\n\n## Reply tone examples\n\n`));
  assert.ok(text.endsWith(config.examples));
  assert.equal(tonePrompt(config), text);
  assert.equal(tonePrompt({ ...config }), text);
});

test('saved configuration renders unchanged after disk reload and clears without orphan headings', () => {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-tone-prompt-'));
  try {
    const config = { description: ' \t可可爱爱\r\n', examples: '\n用户：去看看\r\n助手：我去看一下。\t ' };
    saveConfig(config, root);
    assert.equal(tonePrompt(loadConfig(root)), tonePrompt(config));
    saveConfig({ description: '', examples: ' \t\r\n' }, root);
    assert.equal(tonePrompt(loadConfig(root)), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
