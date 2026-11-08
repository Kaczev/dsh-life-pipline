import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../client/panel.js', import.meta.url), 'utf8');

test('the panel paints with host tokens instead of its own surface colors', () => {
  const token = (name) => new RegExp(`\\b${name}: 'var\\(--dsw-alias-[a-z0-9-]+\\)'`).test(source);
  for (const name of ['text', 'muted', 'border', 'bg', 'soft', 'hover', 'danger']) {
    assert.ok(token(name), `${name} should be a --dsw-alias token`);
  }
  // The only literal surfaces are the Bilibili brand accent and the white QR
  // quiet zone; no light settings surface may survive into dark mode.
  assert.ok(!/background: '#(?:fff|ffffff|f9fafb|e8f5ee)'/.test(source));
  assert.ok(!/color: '#(?:111827|6b7280|0f7a45)'/.test(source));
});

test('Bili contributes one block and leaves the page to the common package', () => {
  assert.match(source, /const PANEL_SLOT = 'lpipe\.settings\.panel'/);
  assert.match(source, /ctx\.slots\.inject\(PANEL_SLOT/);
  assert.match(source, /id: 'bili'/);
  assert.match(source, /order: 60/);
  assert.match(source, /label: \(\) => 'Lpipe Bili'/);
  assert.ok(!source.includes("name: 'settings.section'"), 'Bili must not host the page');
  assert.ok(!source.includes('LpipeSettingsPage'), 'the page component belongs to dsh-life-pipline');
  assert.ok(!source.includes("'plugins.bundle.config'"));
});

test('the panel never reads or renders a cookie value', () => {
  for (const forbidden of ['SESSDATA', 'bili_jct', 'document.cookie']) {
    assert.ok(!source.includes(forbidden), `${forbidden} must not reach the client`);
  }
});
