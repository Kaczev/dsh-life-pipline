import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { dshImAccounts, ownershipWarning } from '../src/env-info.mjs';

async function withHome(files, run) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-life-env-'));
  const root = join(home, '.dsh', 'integrations');
  await mkdir(root, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    const target = join(root, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value), 'utf8');
  }
  try {
    await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test('a missing install reports no accounts and no warning', async () => {
  await withHome({}, (home) => {
    const accounts = dshImAccounts({ home });
    assert.deepEqual(accounts, { weixin: false, qq: false, weixinBotId: '', qqBotId: '' });
    assert.equal(ownershipWarning(accounts, {}), '');
  });
});

test('dsh-im accounts trigger a warning only while our side has no credentials', async () => {
  await withHome({
    'dsh-weixin/config.json': { version: 1, accounts: [{ botId: 'wx_1', accountId: 'a' }] },
    'dsh-qq/config.json': { version: 1, bots: [{ botId: 'qq_1', appId: '1' }] },
  }, (home) => {
    const accounts = dshImAccounts({ home });
    assert.equal(accounts.weixin, true);
    assert.equal(accounts.weixinBotId, 'wx_1');
    const warning = ownershipWarning(accounts, { weixin: { botToken: '' }, qq: { appSecret: '' } });
    assert.match(warning, /微信、QQ/);
    assert.match(warning, /wx_1/);
    const adopted = ownershipWarning(accounts, { weixin: { botToken: 'tok' }, qq: { appSecret: 'sec' } });
    assert.equal(adopted, '');
  });
});
