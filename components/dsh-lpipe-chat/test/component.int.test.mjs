import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { apply } from '../src/index.js';

/**
 * A stand-in for the Cordis context: just enough service registration to prove
 * the component wires itself up, without booting a Host.
 */
function fakeContext() {
  const state = {
    tools: [],
    prompt: [],
    promptContext: [],
    effects: [],
    routes: [],
    promptCalls: [],
    cleanups: [],
  };
  const ctx = {
    logger: () => ({ info() {}, warn() {} }),
    inject(_services, callback) {
      callback(ctx);
      return () => {};
    },
    effect(factory, label) {
      state.effects.push(label);
      state.cleanups.push(factory());
      return () => {};
    },
    skills: { register: (skill) => { state.skill = skill; return () => {}; } },
    tools: {
      register: (tool) => state.tools.push(tool),
    },
    systemPrompt: {
      section: (value) => state.prompt.push(value),
      context: (value) => state.promptContext.push(value),
    },
    sessions: {
      get: (id) => (id === 'session-x' ? { events: [{ type: 'session/title', data: { title: '主会话标题' } }] } : null),
    },
    sessionController: {
      prompt: async (request, source) => state.promptCalls.push({ request, source }),
    },
    connection: {
      fetch: {
        register: (route) => {
          state.routes.push(route);
          return () => {};
        },
      },
    },
  };
  return { ctx, state };
}

async function withHome(run) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-lpipe-chat-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    await run(home);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
}

function rpcBody(method, payload) {
  return new Request('http://127.0.0.1/api/dsh-lpipe-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'r1',
      method: 'dsh-lpipe-chat',
      payload: { method, payload },
    }),
  });
}

test('the component registers tools, the page route and the prompt guidance', async () => {
  await withHome(async () => {
    const { ctx, state } = fakeContext();
    apply(ctx, { mainSessionId: 'session-x', ownerName: 'Kaczev' });

    assert.deepEqual(state.tools.map((tool) => tool.name).sort(),
      ['chat_download', 'chat_history', 'chat_login', 'chat_send', 'chat_status']);
    assert.equal(state.routes.length, 1);
    assert.equal(state.routes[0].path, '/api/dsh-lpipe-chat');
    assert.equal(state.prompt[0].name, 'dsh-lpipe-chat');

    const status = await (await state.routes[0].fetch(rpcBody('chat.status', {}))).json();
    assert.equal(status.result.ok, true);
    assert.equal(status.result.value.config.mainSessionId, 'session-x');
    assert.equal(status.result.value.config.weixin.connected, false);

    const title = await (await state.routes[0].fetch(
      rpcBody('chat.session.title', { sessionId: 'session-x' }),
    )).json();
    assert.equal(title.result.value.title, '主会话标题');

    // No credentials in a fresh home: nothing may connect on its own.
    assert.deepEqual(state.promptCalls, []);
    for (const cleanup of state.cleanups) cleanup();
  });
});
