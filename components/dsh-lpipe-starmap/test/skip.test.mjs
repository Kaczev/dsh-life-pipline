import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createQueries } from '../src/query.mjs'
import { createStarmapRpcHandler } from '../src/rpc.mjs'

const repo = {
  stars: new Map(),
  byName: new Map(),
  turns: new Map(),
};

const skippedEntry = {
  at: '2026-11-07T00:00:00.000Z',
  session: 'session-a',
  turn: 557,
  error: '模型一个字都没回',
  attempts: 3,
};

test('进度里的灰轮扣掉跳过的轮，并把坏轮列出来', () => {
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 100, lit: 90, skipped: 3, sessions: [], lastBuiltAt: null, lastTurn: null }),
    progressState: null,
    usageStats: () => ({ calls: 0, tokens: 0, tokens7d: 0, daily: [] }),
    problems: () => [skippedEntry],
  });
  const value = queries.progress();
  assert.equal(value.skipped, 3);
  assert.equal(value.grey, 7);
  assert.equal(value.problems.length, 1);
  assert.equal(value.problems[0].turn, 557);
});

test('starmap.retry 把跳过的轮放回队列', async () => {
  const calls = [];
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 1, lit: 0, skipped: 1, sessions: [] }),
    progressState: null,
    usageStats: () => ({ calls: 0, tokens: 0, tokens7d: 0, daily: [] }),
    retrySkipped: (sessionId, turn) => {
      calls.push([sessionId, turn]);
      return true;
    },
  });
  const handle = createStarmapRpcHandler({ queries });
  const reply = await handle('starmap.retry', { session: 'session-a', turn: 557 });
  assert.equal(reply.ok, true);
  assert.deepEqual(calls, [['session-a', 557]]);
});

test('没接上 retry 时如实说不支持，而不是假装成功', async () => {
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 0, lit: 0, skipped: 0, sessions: [] }),
    progressState: null,
    usageStats: () => ({ calls: 0, tokens: 0, tokens7d: 0, daily: [] }),
  });
  const handle = createStarmapRpcHandler({ queries });
  const reply = await handle('starmap.retry', { session: 'session-a', turn: 1 });
  assert.equal(reply.ok, false);
  assert.equal(reply.error.code, 'starmap/unavailable');
});

test('starmap.peek 读那一轮原文的首尾', async () => {
  const seen = [];
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 1, lit: 0, skipped: 1, sessions: [] }),
    progressState: null,
    usageStats: () => ({ calls: 0, tokens: 0, tokens7d: 0, daily: [] }),
    peek: (sessionId, turn) => {
      seen.push([sessionId, turn]);
      return { ok: true, chars: 1136, rows: 3, from: 10, to: 12, head: '开头', tail: '结尾' };
    },
  });
  const handle = createStarmapRpcHandler({ queries });
  const reply = await handle('starmap.peek', { session: 'session-a', turn: 557 });
  assert.equal(reply.ok, true);
  assert.equal(reply.value.chars, 1136);
  assert.equal(reply.value.head, '开头');
  assert.deepEqual(seen, [['session-a', 557]]);
});

test('没接上 peek 时如实说读不出来，而不是编一段原文', async () => {
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 0, lit: 0, skipped: 0, sessions: [] }),
    progressState: null,
    usageStats: () => ({ calls: 0, tokens: 0, tokens7d: 0, daily: [] }),
  });
  const handle = createStarmapRpcHandler({ queries });
  const reply = await handle('starmap.peek', { session: 'session-a', turn: 1 });
  assert.equal(reply.value.ok, false);
  assert.equal(reply.value.error, 'starmap/unavailable');
});
