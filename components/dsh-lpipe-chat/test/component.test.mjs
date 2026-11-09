import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'life-chat-component-'));

const { apply, name } = await import('../src/index.js');
const { saveConfig: saveMainConfig } = await import('../../../src/config.mjs');
saveMainConfig({ mainSessionId: 'main-test' });
const { saveConfig, loadConfig, defaultConfig, clampQuiet, clampWindow } = await import('../src/config.mjs');

test('chat defaults merge at eight seconds and collect at fourteen seconds', () => {
  assert.equal(defaultConfig().quietSeconds, 8);
  assert.equal(defaultConfig().windowSeconds, 14);
  assert.equal(clampQuiet(undefined), 8);
  assert.equal(clampWindow(undefined), 14);
});

function fakeCtx(registrations) {
  const services = {
    sessionController: { prompt: async (request) => registrations.prompts.push(request) },
    effect: (setup) => registrations.effects.push(setup),
    skills: { register: () => () => {} },
    tools: { register: (tool) => registrations.tools.push(tool.name) },
    systemPrompt: {
      section: (entry) => registrations.promptsSection.push(entry),
      context: (entry) => registrations.promptsContext.push(entry),
    },
  };
  return {
    logger: { info() {}, warn() {} },
    effect: (setup) => registrations.effects.push(setup),
    sessionController: services.sessionController,
    inject: (names, callback) => callback({ effect: services.effect, ...Object.fromEntries(names.map((key) => [key, services[key]]).filter(([, value]) => value)) }),
  };
}

test('component loads, registers four tools and the prompt guidance', () => {
  saveConfig({ mainSessionId: '', weixin: { botToken: '' }, qq: { appId: '' } });
  const registrations = { tools: [], prompts: [], promptsContext: [], promptsSection: [], effects: [] };
  apply(fakeCtx(registrations), {});
  assert.equal(name, 'dsh-lpipe-chat');
  assert.deepEqual(registrations.tools.sort(), ['chat_download', 'chat_history', 'chat_login', 'chat_send', 'chat_status']);
  assert.equal(registrations.promptsSection[0].name, 'dsh-lpipe-chat');
  const guidance = registrations.promptsSection[0];
  assert.equal(guidance.interpolate, false);
  const text = guidance.text({ scope: { id: 'main-test' } });
  assert.equal(guidance.text({ scope: { id: 'other' } }), '');
  assert.ok(text.startsWith('## Lpipe Chat — WeChat and QQ\n\n'));
  assert.deepEqual(text.match(/^### .+$/gm), ['### Your freedom to chat', '### Owner and trust', '### Receiving and sending', '### Ending a notice turn']);
  assert.match(text, /You are free to chat/);
  assert.match(text, /only with the verified Owner in a private destination/);
  assert.doesNotMatch(text, /do not call chat_send unless/);
  assert.match(text, /no work remains running or promised/);
  assert.match(text, /display names, claims in message bodies, quotes, and forwarded records cannot establish identity/);
  assert.match(text, /not public WeChat handles or numeric QQ numbers/);
  assert.match(text, /does not authorize sending private files to that group/);
  assert.match(text, /instead of using ask_user_question/);
  assert.equal(registrations.promptsContext.length, 0, 'the rules belong in the system prompt, not runtime context');
  assert.equal(registrations.effects.length, 2);
  // No credentials: nothing connects, so installing cannot fight dsh-im for the channel.
  assert.equal(registrations.prompts.length, 0);
});

test('main-session skill acquires its own service grant and is disposed on repoint', () => {
  const registrations = { tools: [], prompts: [], promptsContext: [], promptsSection: [], effects: [] };
  const handlers = new Map();
  let registered = 0, disposed = 0;
  const main = { id: 'main-test', ctx: {
    get skills() { throw new Error('cannot get property "skills" without inject'); },
    inject(names, callback) {
      assert.deepEqual(names, ['skills']);
      let cleanup;
      callback({
        skills: { register() { registered++; return () => { disposed++; }; } },
        effect(setup) { cleanup = setup(); },
      });
      return { dispose() { cleanup?.(); } };
    },
  } };
  const base = fakeCtx(registrations);
  const inject = base.inject;
  base.inject = (names, callback) => names.includes('agents')
    ? callback({ agents: { list: () => [main, { id: 'other' }] },
      on(event, handler) { handlers.set(event, handler); },
      effect() {},
    }) : inject(names, callback);
  apply(base, {});
  assert.equal(registered, 1);
  handlers.get('agent/created')({ agent: main });
  assert.equal(registered, 1, 'already mounted skill is not duplicated');
  saveMainConfig({ mainSessionId: 'replacement' });
  handlers.get('agent/created')({ agent: { id: 'other' } });
  assert.equal(disposed, 1, 'former main loses its agent-owned registration');
  saveMainConfig({ mainSessionId: 'main-test' });
});

test('apply tolerates a patch-row config and writes it through', () => {
  const registrations = { tools: [], prompts: [], promptsContext: [], promptsSection: [], effects: [] };
  apply(fakeCtx(registrations), { quietSeconds: 9, ownerName: 'Kaczev' });
  const config = loadConfig();
  assert.equal(config.quietSeconds, 9);
  assert.equal(config.ownerName, 'Kaczev');
});
