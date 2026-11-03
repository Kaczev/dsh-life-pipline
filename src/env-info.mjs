import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * dsh-im keeps its own account files under `~/.dsh/integrations`. Our component
 * owns a channel from the moment it has credentials, so the owner needs to know
 * when the old owner is still around: two pollers on one bot fight each other.
 */
export function dshImAccounts({ home = homedir() } = {}) {
  const root = join(home, '.dsh', 'integrations');
  const read = (file) => {
    try {
      return JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch {
      return null;
    }
  };
  const weixin = read('dsh-weixin/config.json');
  const qq = read('dsh-qq/config.json');
  const weixinAccount = Array.isArray(weixin?.accounts) ? weixin.accounts[0] : null;
  const qqAccount = Array.isArray(qq?.bots) ? qq.bots[0] : null;
  return {
    weixin: Boolean(weixinAccount?.botId),
    qq: Boolean(qqAccount?.botId),
    weixinBotId: String(weixinAccount?.botId ?? ''),
    qqBotId: String(qqAccount?.botId ?? ''),
  };
}

export function ownershipWarning(accounts, config) {
  const conflicts = [];
  if (accounts.weixin && !String(config?.weixin?.botToken ?? '').trim()) {
    conflicts.push('微信');
  }
  if (accounts.qq && !String(config?.qq?.appSecret ?? '').trim()) {
    conflicts.push('QQ');
  }
  if (conflicts.length === 0) return '';
  return `${conflicts.join('、')} 仍由 dsh-im 持有（${accounts.weixin ? accounts.weixinBotId : accounts.qqBotId}）。先停用 dsh-im 再扫码，否则两条连接会互相踢。`;
}
