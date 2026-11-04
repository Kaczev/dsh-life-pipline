import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/client/panel.js', import.meta.url), 'utf8');

test('the panel paints with host tokens instead of its own surface colors', () => {
  const token = (name) => new RegExp(`\\b${name}: 'var\\(--dsw-alias-[a-z0-9-]+\\)'`).test(source);
  for (const name of ['text', 'muted', 'border', 'bg', 'soft', 'hover', 'danger']) {
    assert.ok(token(name), `${name} should be a --dsw-alias token`);
  }
  // No opaque light surface may survive: those are the ones that break dark mode.
  assert.ok(!/background: '#(?:fff|ffffff|f9fafb|e8f5ee)'/.test(source));
  assert.ok(!/color: '#(?:111827|6b7280|0f7a45)'/.test(source));
});

test('the panel lives on the plugin page, keyed by the bundle name', () => {
  assert.match(source, /name: 'plugins\.bundle\.config'/);
  assert.match(source, /key: 'dsh-life-pipline'/);
  assert.ok(!source.includes("'settings.section'"));
});
