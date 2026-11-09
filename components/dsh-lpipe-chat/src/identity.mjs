const clean = (value) => String(value ?? '').replace(/[\r\n\[\]\u0000-\u001f\u007f]/g, ' ');
export const ownerId = (config, channel) => String(channel === 'weixin' ? config.weixin?.ownerUserId || '' : channel === 'qq' ? config.qq?.ownerOpenId || '' : '');
export function inboundHead(row, config = {}) {
  const owner = ownerId(config, row.channel);
  const ownerMatch = Boolean(owner && row.senderId && String(row.senderId) === owner);
  const who = `${clean(row.senderName || (ownerMatch ? config.ownerName : '') || '未知昵称')} · ${clean(row.senderId || '未记录 ID')}`;
  const label = row.channelLabel || (row.channel === 'qq' ? 'QQ' : row.channel === 'weixin' ? '微信' : row.channel || '未知渠道');
  const head = row.conversationKind === 'group' ? `${label} · 群 ${clean(row.conversationId || '未记录 ID')} · ${who}` : `${label} · ${who}`;
  return { head, ownerMatch };
}
export function historyHead(row, config = {}, peers = []) {
  if (row.direction !== 'out') {
    const { head, ownerMatch } = inboundHead(row, config);
    return `${ownerMatch ? '(Owner)' : ''}[${head}]`;
  }
  const label = row.channel === 'qq' ? 'QQ' : row.channel === 'weixin' ? '微信' : clean(row.channel || '未知渠道');
  const target = row.conversationId;
  let recipient = '接收对象未记录 · 未记录 ID';
  if (target) {
    if (row.conversationKind === 'group') recipient = `群 ${clean(target)}`;
    else {
      const peer = peers.findLast(candidate => candidate.direction !== 'out' && candidate.channel === row.channel && candidate.conversationKind !== 'group' && String(candidate.senderId || '') === String(target));
      recipient = clean(row.recipientName || peer?.senderName || (String(target) === ownerId(config, row.channel) ? config.ownerName : '') || '未知昵称') + ' · ' + clean(target);
    }
  }
  return `[${label} · 我 → ${recipient}]`;
}
