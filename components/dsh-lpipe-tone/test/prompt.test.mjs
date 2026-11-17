import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../src/config.mjs';
import { tonePrompt } from '../src/prompt.mjs';

const dimensions = [['diction', 'Diction — word choice'], ['syntax', 'Syntax — sentence structure'], ['rhythm', 'Rhythm — pacing and pauses'], ['expression', 'Expression visibility — how explicitly existing emotion and tone are expressed']];
const empty = Object.fromEntries(dimensions.map(([key]) => [key, '']));

test('all 16 field combinations omit only blank dimensions and preserve verbatim bodies', () => {
  for (let mask = 0; mask < 16; mask++) {
    const config = Object.fromEntries(dimensions.map(([key], i) => [key, mask & (1 << i) ? ` \r\n${key} 中文\t ` : ' \t\r\n']));
    const text = tonePrompt(config);
    if (!mask) { assert.equal(text, ''); continue; }
    assert.ok(text.startsWith('## Reply tone\n\n'));
    let last = -1;
    for (const [key, title] of dimensions) {
      assert.equal(text.includes(`### ${title}\n`), Boolean(config[key].trim()));
      if (config[key].trim()) {
        const position = text.indexOf(`### ${title}\n\n${config[key]}`);
        assert.ok(position > last); last = position;
      }
    }
    assert.equal(tonePrompt(config), text);
  }
  assert.equal(tonePrompt(empty), '');
});

test('default and every single dimension have English content and shared behavioral protection', () => {
  assert.ok(tonePrompt(DEFAULT_CONFIG));
  for (const [key] of dimensions) {
    const text = tonePrompt({ ...empty, [key]: 'Only this dimension.' });
    assert.match(text, /not meaning, certainty, conditions, attitude, or behavior/);
    assert.match(text, /Do not invent emotions, relationships, judgments, requests, or commitments/);
    assert.match(text, /within tool arguments, style only user-facing prose/);
    assert.match(text, /Preserve operational data, code, formulas, numbers, quotations, and wording required unchanged/);
    assert.match(text, /A blank dimension adds no requirement; do not infer it from other dimensions/);
    assert.match(text, /If a rule conflicts with these boundaries, preserve content and behavior/);
    assert.ok(!/[\u3400-\u9fff]/u.test(text));
  }
});

test('saved text renders unchanged and clearing survives disk reload without headers', () => {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-tone-prompt-'));
  try {
    const config = { ...empty, rhythm: ' \t自然展开\r\n' };
    saveConfig(config, root);
    assert.equal(tonePrompt(loadConfig(root)), tonePrompt(config));
    saveConfig(empty, root);
    assert.equal(tonePrompt(loadConfig(root)), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
