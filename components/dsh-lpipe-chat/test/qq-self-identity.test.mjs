import test from 'node:test';
import assert from 'node:assert/strict';
import { QqSelfIdentity, qqAccountGuidance } from '../src/qq/self-identity.mjs';
import { QqChannel } from '../src/qq/channel.mjs';
import { messageBody } from '../src/content.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, updateConfig } from '../src/config.mjs';
import { historyPage } from '../src/history.mjs';

const self = { name: 'Kaseria', memberOpenId: 'SELF' };
test('persistent names survive restart, failed refresh and disconnect; only changed names save', async t => {
  const previous = process.env.DSH_HOME;
  const root = mkdtempSync(join(tmpdir(), 'qq-name-'));
  process.env.DSH_HOME = root;
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(root, { recursive: true, force: true }); });
  updateConfig(c => ({ ...c, qq: { ...c.qq, appId: 'app', appSecret: 'secret' } }));
  let saves = 0;
  const make = (name, fails = false) => {
    const handlers = new Map();
    const bot = { on: (k, fn) => handlers.set(k, fn), start: async () => handlers.get('ready')(), stop() {}, api: { async get() { if (fails) throw Error('offline'); return { username: name }; } } };
    return new QqChannel({ config: loadConfig, createBot: () => bot, log: {}, onInbound() {}, saveBotName: (appId, value) => {
      saves++; updateConfig(c => ({ ...c, qq: { ...c.qq, botNames: { ...c.qq.botNames, [appId]: value } } }));
    } });
  };
  const first = make('Kaseria'); await first.connect(); await new Promise(setImmediate); await first.stop();
  assert.equal(first.botName, 'Kaseria'); assert.equal(saves, 1);
  const offline = make('', true); assert.equal(offline.botName, 'Kaseria');
  await offline.connect(); await new Promise(setImmediate); await offline.stop(); assert.equal(offline.botName, 'Kaseria'); assert.equal(saves, 1);
  const same = make('Kaseria'); await same.connect(); await new Promise(setImmediate); await same.stop(); assert.equal(saves, 1);
  const renamed = make('New name'); await renamed.connect(); await new Promise(setImmediate); await renamed.stop(); assert.equal(saves, 2);
  assert.equal(make('', true).botName, 'New name');
  updateConfig(c => ({ ...c, qq: { ...c.qq, appId: 'other' } })); assert.equal(make('', true).botName, '');
  updateConfig(c => ({ ...c, qq: { ...c.qq, appId: 'app' } })); assert.equal(make('', true).botName, 'New name');
});
test('identity uses separate official name and per-group IDs, deduplicates and expires cache', async () => {
  let now = 0; const calls = [];
  const identity = new QqSelfIdentity({ api: { async get(path) {
    calls.push(path);
    return path === '/users/@me' ? { username: 'Kaseria', id: 'NOT-THE-MENTION-ID' } : { member_openid: path.includes('g2') ? 'SELF2' : 'SELF' };
  } } }, () => now);
  assert.deepEqual(await Promise.all([identity.forGroup('g1'), identity.forGroup('g1')]), [self, self]);
  assert.equal(calls.length, 2);
  assert.equal((await identity.forGroup('g2')).memberOpenId, 'SELF2'); assert.equal(calls.length, 3);
  now += 3600001; await identity.forGroup('g1'); assert.equal(calls.length, 5);
  identity.close(); assert.equal(identity.name, ''); assert.equal(await identity.forGroup('g1'), null);
});
test('failed identity is throttled and retried; late results cannot revive a closed connection', async () => {
  let now = 0, count = 0, resolve;
  const identity = new QqSelfIdentity({ api: { async get() { count++; if (now === 0) throw Error('denied'); return { username: 'Recovered', member_openid: 'SELF' }; } } }, () => now);
  assert.equal(await identity.forGroup('g'), null); await identity.forGroup('g'); assert.equal(count, 2);
  now = 60001; assert.equal((await identity.forGroup('g')).name, 'Recovered');
  const late = new QqSelfIdentity({ api: { get: () => new Promise(r => { resolve = r; }) } });
  const pending = late.loadName(); await new Promise(setImmediate); late.close(); resolve({ username: 'Too late' });
  assert.equal(await pending, '');
});
test('only QQ group own mentions change in notice/history projection; originals and other IDs survive', () => {
  const text = '<@SELF> middle <@!SELF> <@OTHER> SELF <@NOT-THE-MENTION-ID>';
  const row = { id: 'r', channel: 'qq', direction: 'in', conversationKind: 'group', conversationId: 'g', senderId: 'u', text, qqSelf: self };
  const expected = '@Kaseria middle @Kaseria <@OTHER> SELF <@NOT-THE-MENTION-ID>';
  assert.equal(messageBody(row), expected);
  assert.ok(historyPage({}, {}, [row]).summary.includes(expected));
  assert.equal(row.text, text);
  for (const changed of [{ qqSelf: null }, { channel: 'weixin' }, { conversationKind: 'dm' }]) assert.equal(messageBody({ ...row, ...changed }), text);
  assert.equal(qqAccountGuidance(''), '');
  assert.equal(qqAccountGuidance('Kaseria'), 'Your QQ bot account is named "Kaseria". In QQ group messages, mentions of this bot are displayed as @Kaseria.');
});
test('QQ channel attaches verified identity without rewriting raw text and keeps name on stop', async () => {
  const handlers = new Map(); const events = []; let finish;
  const accepted = new Promise(r => { finish = r; });
  const bot = { on: (name, fn) => handlers.set(name, fn), start: async () => handlers.get('ready')(), stop() {}, api: { async get(path) { return path === '/users/@me' ? { username: 'Kaseria' } : { member_openid: 'SELF' }; } } };
  const channel = new QqChannel({ config: () => ({ qq: { appId: 'app', appSecret: 'secret' } }), createBot: () => bot, log: {}, onInbound: e => { events.push(e); finish(); } });
  await channel.connect();
  handlers.get('message')({}, { kind: 'group', groupOpenid: 'g', senderId: 'u', content: 'Hi <@SELF>', timestamp: Date.now() });
  await accepted; assert.deepEqual(events[0].qqSelf, self); assert.equal(events[0].text, 'Hi <@SELF>'); assert.equal(channel.botName, 'Kaseria');
  await channel.stop(); assert.equal(channel.botName, 'Kaseria');
});
