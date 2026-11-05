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

function fixture({ login = null, live = { connected: true, lastError: '' }, connectResult = true, connectResults = null } = {}) {
  let config = structuredClone(BASE_CONFIG);
  const calls = [];
  // Live state, not the stored credentials: connect() flips this one.
  const liveNow = { ...live };
  const channel = {
    startLogin: async () => ({ attemptId: 'a1', qrUrl: 'https://qr', expiresAt: 1 }),
    peekLoginState: () => login,
    loginState: () => {
      calls.push('loginState');
      return login;
    },
    submitVerifyCode: (code) => code === '1234',
    cancelLogin: () => true,
    connect: async () => {
      calls.push('connect');
      const queued = connectResults && connectResults.length ? connectResults.shift() : connectResult;
      if (queued) Object.assign(liveNow, { connected: true, lastError: '' });
      return queued;
    },
    get status() { return liveNow; },
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
  assert.equal(result.value.config.weixin.configured, true);
  assert.equal(result.value.config.weixin.connected, true);
  assert.equal(result.value.config.weixin.botToken, undefined);
  assert.equal(result.value.config.qq.connected, false);
  assert.equal(result.value.channels.weixin.login.qrUrl, 'https://qr');
});

test('a revoked token reads as not connected while staying reconnectable', async () => {
  const { handle } = fixture({ live: { connected: false, lastError: 'invalid token' } });
  const result = await handle('chat.status', {});
  assert.equal(result.value.config.weixin.connected, false);
  assert.equal(result.value.config.weixin.configured, true);
  assert.equal(result.value.config.weixin.lastError, 'invalid token');
  const again = await handle('chat.connect', { channel: 'weixin' });
  assert.equal(again.ok, true);
  assert.equal(again.value.config.weixin.connected, true);
});

test('connect refuses a channel without credentials', async () => {
  const { handle } = fixture({ connectResult: false });
  const result = await handle('chat.connect', { channel: 'qq' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'chat/not-configured');
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
  assert.equal(route.path, '/api/dsh-lpipe-chat');
  assert.deepEqual([...route.methods], ['POST']);

  const request = new Request('http://127.0.0.1/api/dsh-lpipe-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'r1',
      method: 'dsh-lpipe-chat',
      payload: { method: 'chat.status', payload: {} },
    }),
  });
  const answered = await (await route.fetch(request)).json();
  assert.equal(answered.type, 'server-response');
  assert.equal(answered.rpcId, 'r1');
  assert.equal(answered.result.ok, true);

  const wrongMethod = new Request('http://127.0.0.1/api/dsh-lpipe-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r2', method: 'nope', payload: { method: 'chat.status', payload: {} } }),
  });
  const refused = await (await route.fetch(wrongMethod)).json();
  assert.equal(refused.result.ok, false);
  assert.equal(refused.result.error.code, 'chat/bad-request');

  const get = new Request('http://127.0.0.1/api/dsh-lpipe-chat', { method: 'GET' });
  assert.equal((await route.fetch(get)).status, 405);
});

test('a pending login carries a rendered QR, not just the url', async () => {
  const { handle } = fixture({ login: { state: 'pending', qrUrl: 'https://qr.example/abc' } });
  const result = await handle('chat.status', {});
  assert.match(result.value.channels.weixin.login.qrDataUrl, /^data:image\/png;base64,/);
});

test('a QQ scan stores the owner openid it was handed', async () => {
  let config = structuredClone(BASE_CONFIG);
  const qq = {
    startLogin: async () => ({ attemptId: 'q1', expiresAt: 1 }),
    peekLoginState: () => ({ state: 'pending', qrUrl: '' }),
    loginState: () => ({
      state: 'connected',
      credentials: { appId: '1020', appSecret: 'sec', ownerOpenId: 'OWNER_OPENID' },
    }),
    cancelLogin: () => true,
    connect: async () => true,
  };
  const handle = createChatRpcHandler({
    getConfig: () => config,
    update: (mutator) => { config = mutator(config); },
    channels: { qq },
    sessions: { get: () => null },
  });
  const result = await handle('chat.login.state', { channel: 'qq' });
  assert.equal(result.value.connected, true);
  assert.equal(config.qq.appId, '1020');
  assert.equal(config.qq.ownerOpenId, 'OWNER_OPENID');
});

test('a scan that cannot connect says so instead of claiming success', async () => {
  let config = structuredClone(BASE_CONFIG);
  const qq = {
    startLogin: async () => ({ attemptId: 'q1', expiresAt: 1 }),
    peekLoginState: () => ({ state: 'pending', qrUrl: '' }),
    loginState: () => ({
      state: 'connected',
      credentials: { appId: '1020', appSecret: 'sec', ownerOpenId: 'OWNER_OPENID' },
    }),
    cancelLogin: () => true,
    status: { connected: false, lastError: 'QQ 连接超时：20 秒内没有就绪，请重试或重新扫码。' },
    connect: async () => {
      throw new Error('timeout');
    },
  };
  const handle = createChatRpcHandler({
    getConfig: () => config,
    update: (mutator) => { config = mutator(config); },
    channels: { qq },
    sessions: { get: () => null },
  });
  const result = await handle('chat.login.state', { channel: 'qq' });
  assert.equal(result.value.connected, false, 'the scan alone must not read as online');
  assert.match(result.value.login.error, /连接超时/);
  assert.equal(config.qq.appId, '1020', 'the credentials are still adopted');
});

test('a WeChat scan whose handshake races connects on the retry, not a second scan', async () => {
  const { handle, calls } = fixture({
    login: {
      state: 'connected',
      credentials: { botToken: 'new', accountId: 'acc', ownerUserId: 'owner@wx', baseUrl: 'https://x/' },
    },
    connectResults: [false, true],
  });
  const result = await handle('chat.login.state', { channel: 'weixin' });
  assert.equal(result.value.connected, true);
  assert.equal(result.value.login.error, undefined);
  assert.equal(calls.filter((call) => call === 'connect').length, 2);
});

test('QQ does not retry a refused connect: a dead appid is an answer, not a hiccup', async () => {
  const { handle, calls } = fixture({
    login: {
      state: 'connected',
      credentials: { appId: '123', appSecret: 'sec', ownerOpenId: 'o' },
    },
    connectResults: [false],
  });
  const result = await handle('chat.login.state', { channel: 'qq' });
  assert.equal(result.value.connected, false);
  assert.equal(calls.filter((call) => call === 'connect').length, 1);
});
