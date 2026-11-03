import assert from 'node:assert/strict';
import test from 'node:test';

import { createChatRpcHandler, registerChatRpc } from '../src/rpc.mjs';

const BASE_CONFIG = {
  mainSessionId: 'session-1',
  windowSeconds: 5,
  ownerOnly: true,
  ownerName: 'Kaczev',
  weixin: { enabled: true, botToken: 'tok', ownerUserId: 'owner@wx', accountId: 'acc', baseUrl: 'https://x/' },
  qq: { enabled: true, appId: '', appSecret: '', ownerOpenId: 'open' },
};

function fixture({ login = null } = {}) {
  let config = structuredClone(BASE_CONFIG);
  const calls = [];
  const channel = {
    startLogin: async () => ({ attemptId: 'a1', qrUrl: 'https://qr', expiresAt: 1 }),
    peekLoginState: () => login,
    loginState: () => {
      calls.push('loginState');
      return login;
    },
    submitVerifyCode: (code) => code === '1234',
    cancelLogin: () => true,
    connect: async () => { calls.push('connect'); },
  };
  const handle = createChatRpcHandler({
    getConfig: () => config,
    update: (mutator) => { config = mutator(config); },
    channels: { weixin: channel, qq: channel },
    sessions: {
      get: (id) => (id === 'session-1' ? {
        events: [
          { type: 'session/title', data: { title: '旧标题' } },
          { type: 'session/title', data: { title: '新标题' } },
        ],
      } : null),
    },
  });
  return { handle, calls, config: () => config };
}

test('status never leaks channel secrets', async () => {
  const { handle } = fixture({ login: { state: 'pending', qrUrl: 'https://qr' } });
  const result = await handle('chat.status', {});
  assert.equal(result.ok, true);
  assert.equal(result.value.config.weixin.connected, true);
  assert.equal(result.value.config.weixin.botToken, undefined);
  assert.equal(result.value.config.qq.connected, false);
  assert.equal(result.value.channels.weixin.login.qrUrl, 'https://qr');
});

test('status uses the non-consuming peek', async () => {
  const { handle, calls } = fixture({ login: { state: 'connected' } });
  await handle('chat.status', {});
  assert.deepEqual(calls, []);
});

test('config.save rejects an out-of-range window and keeps the old value', async () => {
  const { handle, config } = fixture();
  const bad = await handle('chat.config.save', { windowSeconds: 1 });
  assert.equal(bad.ok, false);
  assert.equal(config().windowSeconds, 5);
  const good = await handle('chat.config.save', { windowSeconds: 9, mainSessionId: '  session-1  ' });
  assert.equal(good.ok, true);
  assert.equal(config().windowSeconds, 9);
  assert.equal(config().mainSessionId, 'session-1');
});

test('session.title reads the latest title event', async () => {
  const { handle } = fixture();
  const found = await handle('chat.session.title', { sessionId: 'session-1' });
  assert.deepEqual(found.value, { sessionId: 'session-1', title: '新标题', found: true });
  const missing = await handle('chat.session.title', { sessionId: 'nope' });
  assert.deepEqual(missing.value, { sessionId: 'nope', title: '', found: false });
});

test('login.state adopts credentials exactly once and connects', async () => {
  const login = {
    state: 'connected',
    qrUrl: 'https://qr',
    credentials: { botToken: 'new-token', accountId: 'new-acc', ownerUserId: 'me@wx', baseUrl: 'https://y/' },
  };
  const { handle, calls, config } = fixture({ login });
  const first = await handle('chat.login.state', { channel: 'weixin' });
  assert.equal(first.value.connected, true);
  assert.equal(config().weixin.botToken, 'new-token');
  assert.deepEqual(calls, ['loginState', 'connect']);
});

test('login.begin and verify code go through the channel', async () => {
  const { handle } = fixture({ login: { state: 'needs_verification' } });
  const begun = await handle('chat.login.begin', { channel: 'qq' });
  assert.equal(begun.value.qrUrl, 'https://qr');
  const ok = await handle('chat.login.code', { channel: 'qq', code: '1234' });
  assert.equal(ok.ok, true);
  const rejected = await handle('chat.login.code', { channel: 'qq', code: '0000' });
  assert.equal(rejected.ok, false);
  const bad = await handle('chat.login.begin', { channel: 'telegram' });
  assert.equal(bad.error.code, 'chat/bad-request');
});

test('unknown methods and missing channels are refused', async () => {
  const { handle } = fixture();
  const unknown = await handle('chat.nope', {});
  assert.equal(unknown.error.code, 'chat/unknown-method');
  const empty = await handle('chat.config.save', {});
  assert.equal(empty.error.code, 'chat/bad-request');
});

test('the fetch route speaks the client envelope and rejects bad bodies', async () => {
  const { handle } = fixture();
  let route;
  const ctx = { connection: { fetch: { register: (value) => { route = value; return () => {}; } } } };
  registerChatRpc(ctx, handle);
  assert.equal(route.path, '/api/dsh-life-chat');
  assert.deepEqual([...route.methods], ['POST']);

  const request = new Request('http://127.0.0.1/api/dsh-life-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'r1',
      method: 'dsh-life-chat',
      payload: { method: 'chat.status', payload: {} },
    }),
  });
  const answered = await (await route.fetch(request)).json();
  assert.equal(answered.type, 'server-response');
  assert.equal(answered.rpcId, 'r1');
  assert.equal(answered.result.ok, true);

  const wrongMethod = new Request('http://127.0.0.1/api/dsh-life-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r2', method: 'nope', payload: { method: 'chat.status', payload: {} } }),
  });
  const refused = await (await route.fetch(wrongMethod)).json();
  assert.equal(refused.result.ok, false);
  assert.equal(refused.result.error.code, 'chat/bad-request');

  const get = new Request('http://127.0.0.1/api/dsh-life-chat', { method: 'GET' });
  assert.equal((await route.fetch(get)).status, 405);
});
