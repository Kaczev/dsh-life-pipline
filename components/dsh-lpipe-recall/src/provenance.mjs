// Display-only provenance. Matching/abstract star extraction keep their existing policy.
const clean = value => String(value ?? '').replace(/[\r\n〔〕\u0000-\u001f]/g, ' ').slice(0, 300)
const channel = value => value === 'weixin' ? '微信' : value === 'qq' ? 'QQ' : '渠道未记录'
export function eligibleMessage(row) {
  if (row?.kind === 'assistant/message') return true
  if (row?.kind !== 'user/message') return false
  const source = row.source
  // Old human rows had no source. Unknown explicit sources are never human input.
  return !source?.kind || source.kind === 'user' || source.kind === 'dsh-lpipe-chat'
    || (source.kind === 'dsh-lpipe-wake' && source.wake === 'planned')
}
export function sourceLabel(row, origin = null) {
  if (row.kind === 'assistant/message') return 'DSH · 我 → 用户'
  if (row.kind === 'tool/call') {
    let args = {}
    try { args = typeof row.arguments === 'string' ? JSON.parse(row.arguments) : row.arguments ?? {} } catch {}
    const delivery = row.recallDelivery
    const target = delivery?.targetId || args.targetId
    const group = (delivery?.scope ?? args.scope) === 'group'
    return `${channel(delivery?.channel ?? args.channel)} · 我 → ${target ? `${group ? '群 ' : ''}${clean(target)}` : '接收对象未记录'}（${delivery?.sent === true ? '发送成功' : delivery?.sent === false ? '发送未完成' : '发送状态未记录'}）`
  }
  if (row.source?.kind === 'dsh-lpipe-wake') return '唤醒管线 · 主动唤醒 → 我'
  if (row.source?.kind === 'dsh-lpipe-chat') {
    const who = origin?.senderName || origin?.senderId || '发送者未记录'
    const room = origin?.conversationKind === 'group' ? `群 ${clean(origin.conversationId || '未记录')}` : origin?.conversationKind === 'dm' ? '私聊' : '会话未记录'
    return `${channel(origin?.channel)} · ${clean(who)}${origin?.senderId && origin?.senderName ? ` (${clean(origin.senderId)})` : ''} → 我 · ${room}`
  }
  return 'DSH · 用户 → 我'
}

/** Structured offsets refer only to text actually injected, not omitted batch text. */
export function displaySegments(row) {
  if (row.kind === 'tool/call') return row.name === 'chat_send' ? [{ text: row.text, source: sourceLabel(row), segment: 0 }] : []
  if (!eligibleMessage(row)) return []
  if (row.source?.kind !== 'dsh-lpipe-chat') return [{ text: row.text, source: sourceLabel(row), segment: 0 }]
  const spans = row.source?.recallOrigins
  if (Array.isArray(spans)) return spans.filter(s => Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end >= s.start && s.end <= (row.text ?? '').length)
    .map((s, i) => ({ text: row.text.slice(s.start, s.end), source: sourceLabel(row, s), segment: i }))
  // Legacy headers: deliberately only parse the historic gateway's line prefix.
  const out = []; let current = { text: '', source: sourceLabel(row), segment: 0 }
  for (const line of String(row.text ?? '').split('\n')) {
    const hit = /^(?:\(Owner\))?\[(微信|QQ) · ([^\]]+)\] (.*)$/.exec(line)
    if (hit) {
      if (current.text) out.push(current)
      const fields = hit[2].split(' · ')
      current = { text: hit[3], source: sourceLabel(row, { channel: hit[1] === 'QQ' ? 'qq' : 'weixin', senderName: fields.at(-1), conversationKind: fields.length > 1 ? 'group' : 'dm', conversationId: fields.length > 1 ? fields.slice(0, -1).join(' · ') : undefined }), segment: out.length }
    } else current.text += (current.text ? '\n' : '') + line
  }
  if (current.text) out.push(current)
  return out
}
