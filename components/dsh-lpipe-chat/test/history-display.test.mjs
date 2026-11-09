import test from 'node:test';
import assert from 'node:assert/strict';
import { historyPage } from '../src/history.mjs';
const config = { ownerName: 'Kaczev', qq: { ownerOpenId: 'verified-owner' }, outputBytes: 16384 };
const row = (minute, extra = {}) => ({ id: `m${minute}`, at: new Date(2026, 10, 9, 15, minute).toISOString(), channel: 'qq', direction: 'in', senderId: 'verified-owner', conversationKind: 'dm', text: '正文', ...extra });
test('history uses notice identities and actual outgoing destination, never display-name ownership', () => {
  const rows = [row(0), row(1, { senderId: 'stranger', senderName: 'Kaczev' }), row(2, { direction: 'out', conversationId: 'verified-owner' }), row(3, { direction: 'out' }), row(4, { direction: 'out', conversationKind: 'group', conversationId: 'group-1234567890' })];
  const result = historyPage({}, config, rows).summary;
  assert.match(result, /\(Owner\)\[QQ · Kaczev\]/);
  assert.match(result, /\n\[QQ · Kaczev\]/);
  assert.match(result, /\[QQ · 我 → Kaczev\]/);
  assert.match(result, /\[QQ · 我 → 接收对象未记录\]/);
  assert.match(result, /\[QQ · 我 → 群 567890\]/);
  assert.doesNotMatch(result, /verified-owner|T07:|\.000Z/);
});
test('five-minute separators measure from displayed stamp, not previous message; pages restart dates', () => {
  const rows = [0, 2, 4, 5, 7, 10].map(minute => row(minute));
  const result = historyPage({}, config, rows).summary;
  assert.deepEqual([...result.matchAll(/〔([^〕]+)〕/g)].map(match => match[1]), ['2026-11-09 15:00', '15:05', '15:10']);
  const first = historyPage({ limit: 3 }, config, rows);
  assert.match(first.summary, /^〔2026-11-09 15:05〕/);
  assert.match(historyPage({ cursor: first.cursor }, config, []).summary, /^〔2026-11-09 15:00〕/);
});
test('day boundaries, invalid times and expanded details remain explicit', () => {
  const a = row(0, { at: new Date(2026, 10, 9, 23, 59).toISOString() });
  const b = row(1, { at: new Date(2026, 10, 10, 0, 0).toISOString() });
  assert.match(historyPage({}, config, [a, b]).summary, /〔2026-11-10 00:00〕/);
  assert.match(historyPage({}, config, [row(0, { at: 'bad' })]).summary, /时间未记录/);
  const detail = historyPage({ messageId: a.id }, config, [a]).summary;
  assert.ok(detail.includes(a.at));
  assert.match(detail, /发送方 ID：verified-owner/);
});
