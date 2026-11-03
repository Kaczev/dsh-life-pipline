import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'life-chat-gw-'));

const { saveConfig, loadConfig } = await import('../src/config.mjs');
const { InboundGateway } = await import('../src/gateway.mjs');

const quiet = { info() {}, warn() {} };
const message = (text, extra = {}) => ({
  channel: 'weixin',
  channelLabel: '微信',
  conversationKind: 'dm',
  conversationId: 'owner-wx',
  senderId: 'owner-wx',
  senderName: '',
  text,
  at: new Date().toISOString(),
  messageId: Math.random().toString(36).slice(2),
  ...extra,
});

test('first message goes in immediately, the rest of the burst arrives as one batch', async () => {
  saveConfig({
    mainSessionId: 'session-main',
    windowSeconds: 3,
    ownerName: 'Kaczev',
    weixin: { ownerUserId: 'owner-wx' },
    qq: { ownerOpenId: 'owner-qq' },
  });
  const prompts = [];
  const gateway = new InboundGateway({
    getConfig: loadConfig,
    log: quiet,
    prompt: async (request) => prompts.push(request),
  });

  gateway.accept(message('在吗'));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].content[0].text, '[微信 · Kaczev] 在吗');
  assert.equal(prompts[0].mode, 'queue');
  assert.ok(prompts[0].requestId);

  gateway.accept(message('我下班了'));
  gateway.accept(message('买了菜', { channel: 'qq', channelLabel: 'QQ', senderId: 'owner-qq', conversationId: 'owner-qq' }));
  await new Promise((resolve) => setTimeout(resolve, 3200));

  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].content[0].text, '[微信 · Kaczev] 我下班了\n[QQ · Kaczev] 买了菜');
  gateway.dispose();
});

test('nothing is injected while the main session is unset, and the batch survives', async () => {
  saveConfig({ mainSessionId: '', windowSeconds: 3 });
  const prompts = [];
  const gateway = new InboundGateway({ getConfig: loadConfig, log: quiet, prompt: async (r) => prompts.push(r) });
  gateway.accept(message('有人吗'));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(prompts.length, 0);
  assert.equal(gateway.pending, 1);
  gateway.dispose();
});
