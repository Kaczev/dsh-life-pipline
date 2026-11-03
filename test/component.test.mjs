import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'life-chat-component-'));

const { apply, name } = await import('../src/components/chat/index.js');
const { saveConfig, loadConfig } = await import('../src/config.mjs');

function fakeCtx(registrations) {
  const services = {
    sessionController: { prompt: async (request) => registrations.prompts.push(request) },
    tools: { register: (tool) => registrations.tools.push(tool.name) },
    systemPrompt: { context: (entry) => registrations.promptsContext.push(entry) },
  };
  return {
    logger: { info() {}, warn() {} },
    effect: (setup) => registrations.effects.push(setup),
    inject: (names, callback) => callback(Object.fromEntries(names.map((key) => [key, services[key]]).filter(([, value]) => value))),
  };
}

test('component loads, registers four tools and the prompt guidance', () => {
  saveConfig({ mainSessionId: '', weixin: { botToken: '' }, qq: { appId: '' } });
  const registrations = { tools: [], prompts: [], promptsContext: [], effects: [] };
  apply(fakeCtx(registrations), {});
  assert.equal(name, 'dsh-life-chat');
  assert.deepEqual(registrations.tools.sort(), ['chat_history', 'chat_login', 'chat_send', 'chat_status']);
  assert.equal(registrations.promptsContext[0].name, 'dsh-life-chat');
  assert.equal(registrations.effects.length, 1);
  // No credentials: nothing connects, so installing cannot fight dsh-im for the channel.
  assert.equal(registrations.prompts.length, 0);
});

test('apply tolerates a patch-row config and writes it through', () => {
  const registrations = { tools: [], prompts: [], promptsContext: [], effects: [] };
  apply(fakeCtx(registrations), { windowSeconds: 9, ownerName: 'Kaczev' });
  const config = loadConfig();
  assert.equal(config.windowSeconds, 9);
  assert.equal(config.ownerName, 'Kaczev');
});
