import { appendFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { messagesPath, ensureHome } from './paths.mjs';

/**
 * Append-only message log. Both directions, deliberately uncompressed: this is
 * the transcript the later memory pipeline reads, so nothing is rewritten here.
 */
let cache = { mtimeMs: -1, rows: [] };

export function appendMessage(record) {
  ensureHome();
  const row = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...record,
  };
  appendFileSync(messagesPath(), `${JSON.stringify(row)}\n`, 'utf8');
  cache = { mtimeMs: -1, rows: [] };
  return row;
}

export function readMessages() {
  const file = messagesPath();
  if (!existsSync(file)) return [];
  const { mtimeMs } = statSync(file);
  if (cache.mtimeMs === mtimeMs) return cache.rows;
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // A torn trailing line from a crash should not poison the whole log.
    }
  }
  cache = { mtimeMs, rows };
  return rows;
}

export function queryMessages({ channel, keyword, direction, conversationId, limit = 20 } = {}) {
  const needle = typeof keyword === 'string' && keyword.trim() ? keyword.trim().toLowerCase() : '';
  const matched = readMessages().filter((row) => {
    if (channel && row.channel !== channel) return false;
    if (direction && row.direction !== direction) return false;
    if (conversationId && row.conversationId !== conversationId) return false;
    if (needle && !String(row.text ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });
  const size = Math.min(200, Math.max(1, Number(limit) || 20));
  return matched.slice(-size);
}

export function lastContextToken(channel, conversationId) {
  for (let index = readMessages().length - 1; index >= 0; index -= 1) {
    const row = readMessages()[index];
    if (row.channel === channel && row.conversationId === conversationId && row.contextToken) {
      return row.contextToken;
    }
  }
  return '';
}
