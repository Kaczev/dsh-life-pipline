const clean = (value) => String(value ?? '').replace(/[\r\n\[\]\u0000-\u001f\u007f]/g, ' ');
const shortId = (value) => { const text = clean(value); return text.length > 8 ? text.slice(-6) : text; };
export const ownerId = (config, channel) => String(channel === 'weixin' ? config.weixin?.ownerUserId || '' : channel === 'qq' ? config.qq?.ownerOpenId || '' : '');
export function inboundHead(row, config = {}) {
  const owner = ownerId(config, row.channel);
  const ownerMatch = Boolean(owner && row.senderId && String(row.senderId) === owner);
  const who = clean(row.senderName || (ownerMatch ? config.ownerName : '') || shortId(row.senderId) || '未知');
  const label = row.channelLabel || (row.channel === 'qq' ? 'QQ' : row.channel === 'weixin' ? '微信' : row.channel || '未知渠道');
  const head = row.conversationKind === 'group' ? `${label} · ${shortId(row.conversationId)} · ${who}` : `${label} · ${who}`;
  return { head, ownerMatch };
}
export function historyHead(row, config = {}, peers = []) {
  if (row.direction !== 'out') {
    const { head, ownerMatch } = inboundHead(row, config);
    return `${ownerMatch ? '(Owner)' : ''}[${head}]`;
  }
  const label = row.channel === 'qq' ? 'QQ' : row.channel === 'weixin' ? '微信' : clean(row.channel || '未知渠道');
  const target = row.conversationId;
  let recipient = '接收对象未记录';
  if (target) {
    if (row.conversationKind === 'group') recipient = `群 ${shortId(target)}`;
    else {
      const peer = peers.findLast(candidate => candidate.direction !== 'out' && candidate.channel === row.channel && candidate.conversationKind !== 'group' && String(candidate.senderId || '') === String(target));
      recipient = clean(row.recipientName || peer?.senderName || (String(target) === ownerId(config, row.channel) ? config.ownerName : '') || shortId(target));
    }
  }
  return `[${label} · 我 → ${recipient}]`;
}
