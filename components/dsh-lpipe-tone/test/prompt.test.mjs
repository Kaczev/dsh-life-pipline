import test from 'node:test';
import assert from 'node:assert/strict';
import { tonePrompt } from '../src/prompt.mjs';

test('wrap the saved phrase once; omit the entire section when blank', () => {
  assert.equal(tonePrompt({ phrase: '　呜……  ' }), '## Tone\nYou like saying “呜……” when replying to the user.');
  assert.equal(tonePrompt({ phrase: '{{literal}}' }), '## Tone\nYou like saying “{{literal}}” when replying to the user.');
  for (const phrase of ['', ' \t　']) assert.equal(tonePrompt({ phrase }), '');
});
