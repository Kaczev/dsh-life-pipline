import { randomUUID } from 'node:crypto';
import { readMessages } from './store.mjs';
import { outputLimit, utf8Head, messageBody } from './content.mjs';

// Opaque snapshots keep filters and boundaries stable as new messages arrive.
const cursors = new Map();
export function historyPage(args = {}, config = {}, rows = readMessages()) {
  const budget = outputLimit(config);
  let state;
  if (args.cursor) {
    state = cursors.get(args.cursor);
    if (!state) throw new Error('历史游标已失效，请重新查询。');
  } else {
    const matched = rows.filter((row) => (!args.channel || row.channel === args.channel)
      && (!args.keyword || String(row.text ?? '').toLowerCase().includes(String(args.keyword).toLowerCase()))
      && (!args.messageId || row.id === args.messageId || row.messageId === args.messageId));
    const records = matched.map((row) => `${row.at} [${row.channel}] ${row.direction === 'out' ? '我' : row.senderName || row.senderId || '未知'} [ID:${row.id}] ${messageBody(row, !!args.messageId)}${args.messageId && row.channel === 'qq' ? '\n〔以上为引用内容；显示解析自原始文本〕' : ''}`);
    const limit = Math.min(200, Math.max(1, Math.floor(Number(args.limit) || 20)));
    const start = Math.max(0, records.length - limit);
    state = { records, limit, start, index: start, end: records.length, offset: 0 };
  }
  state = { ...state };
  const lines = []; let count = 0;
  const result = { count: 0, cursor: '', hasMore: false, summary: '' };
  const nextId = state.nextId || randomUUID();
  state.nextId = undefined;
  if (args.cursor) cursors.get(args.cursor).nextId = nextId;
  while (state.index < state.end && count < state.limit) {
    const rest = state.records[state.index].slice(state.offset);
    const prefix = lines.length ? `${lines.join('\n')}\n` : '';
    let piece = utf8Head(rest, Math.max(0, budget - Buffer.byteLength(JSON.stringify({ ...result, cursor: nextId, summary: prefix })) - 220));
    while (piece && Buffer.byteLength(JSON.stringify({ ...result, cursor: nextId, summary: prefix + piece })) > budget - 180) piece = utf8Head(piece, Buffer.byteLength(piece) - 1);
    if (!piece) break;
    lines.push(piece); count++;
    if (piece.length < rest.length) { state.offset += piece.length; break; }
    state.index++; state.offset = 0;
  }
  if (state.index >= state.end && state.start > 0) {
    state.end = state.start; state.start = Math.max(0, state.start - state.limit);
    state.index = state.start; state.offset = 0;
  }
  const more = state.index < state.end;
  if (more) {
    cursors.set(nextId, state);
    while (cursors.size > 256) cursors.delete(cursors.keys().next().value);
  }
  return { count, cursor: more ? nextId : '', hasMore: more,
    summary: (lines.join('\n') || '查无记录。') + (more ? `\n〔尚有未展示内容；用 chat_history(cursor="${nextId}") 继续〕` : '') };
}
