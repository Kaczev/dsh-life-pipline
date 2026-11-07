import assert from 'node:assert/strict'
import test from 'node:test'
import { fragmentSentencesOf, openRange, parseRecallId, recallIdOf } from '../src/open.mjs'
import { createRecallTools } from '../src/tools.mjs'

const readerOf = (rows) => ({
  rows: (session) => rows.filter((row) => (row.session ?? 'repo') === session),
})

const row = (turn, seq, text, extra = {}) => ({
  session: 'repo',
  turn,
  seq,
  at: 1_700_000_000_000 + seq,
  kind: 'user/message',
  source: { kind: 'user' },
  text,
  ...extra,
})

test('认 id：片段级、句子级、外面包了话都行', () => {
  assert.deepEqual(parseRecallId('lpipe_recall_id[abc:12]'), { session: 'abc', turn: 12, sentence: null })
  assert.deepEqual(parseRecallId('〔3〕lpipe_recall_id[abc:12:3] 这句话'), { session: 'abc', turn: 12, sentence: 3 })
  assert.equal(parseRecallId('第 1 段｜deepseek-web-1:56'), null, '没有 lpipe_recall_id 就不认')
  assert.equal(parseRecallId(null), null)
  assert.equal(recallIdOf('abc', 12), 'lpipe_recall_id[abc:12]')
  assert.equal(recallIdOf('abc', 12, 3), 'lpipe_recall_id[abc:12:3]')
})

test('切句：一个片段里的句子从 1 编号，只认说过的话', () => {
  const reader = readerOf([
    row(5, 1, '第一句。第二句！'),
    row(5, 2, '第三句？', { kind: 'tool/result' }),
    row(6, 3, '别的轮次'),
    row(5, 4, '\n```js\nconst a = 1\n```\n', { kind: 'assistant/message', source: { kind: 'assistant' } }),
  ])
  const lines = fragmentSentencesOf(reader, 'repo', 5)
  assert.deepEqual(lines.map((line) => line.text), ['第一句。', '第二句！'])
  assert.deepEqual(lines.map((line) => line.id), [1, 2])
})

test('打开：只给 from 就读一段，首尾句带完整 id', () => {
  const reader = readerOf([row(5, 1, '一。二。三。四。五。六。七。八。')])
  const opened = openRange({ reader, session: 'repo', turn: 5, from: 2, count: 3 })
  assert.equal(opened.start, 2)
  assert.equal(opened.end, 4)
  assert.equal(opened.total, 8)
  assert.equal(opened.left, 4)
  assert.match(opened.text, /lpipe_recall_id\[repo:5\] 第 2–4 句，本片段共 8 句/)
  assert.match(opened.text, /lpipe_recall_id\[repo:5:2\] 二。/)
  assert.match(opened.text, /lpipe_recall_id\[repo:5:4\] 四。/)
  assert.match(opened.text, /〔3〕三。/)
})

test('打开：用句子 id 指定区间，超长会截断并说清楚', () => {
  // 八十句、每句一百多字，一口气读完会超过 8000 字的上限。
  const long = Array.from({ length: 80 }, () => `${'字'.repeat(250)}。`).join('')
  const reader = readerOf([row(5, 1, long)])
  const opened = openRange({ reader, session: 'repo', turn: 5, from: 1, to: 80 })
  assert.equal(opened.truncated, true)
  assert.ok(opened.end < 80, '放不下就停在那儿')
  assert.match(opened.text, /已截断/)
})

test('recall_open：拿 id 打开原文；跨片段就报错', async () => {
  const reader = readerOf([row(5, 1, '一。二。三。')])
  const tool = createRecallTools({ reader }).find((entry) => entry.name === 'recall_open')
  assert.ok(tool, 'recall_open 应该注册在工具表里')

  const value = await tool.execute({ from: 'lpipe_recall_id[repo:5:2]', count: 2 })
  assert.match(value.text, /二。/)
  assert.match(value.summary, /第 2–3 句/)

  await assert.rejects(() => tool.execute({ from: '不是 id' }), /lpipe_recall_id/)
  await assert.rejects(
    () => tool.execute({ from: 'lpipe_recall_id[repo:5:1]', to: 'lpipe_recall_id[repo:6:1]' }),
    /same fragment/,
  )
})




test('recall_fragments：把 query 当成输入源，交给同一条回忆链路', async () => {
  const seen = []
  const tools = createRecallTools({
    reader: { rows: () => [] },
    compose: (sessionId, query) => {
      seen.push({ sessionId, query })
      return '第 1 段｜lpipe_recall_id[repo:7], 11-01 09:00, 共 4 句，展示 2 句\n〔1〕嗯。'
    },
  })
  const tool = tools.find((entry) => entry.name === 'recall_fragments')
  assert.ok(tool)
  const value = await tool.execute({ query: '雪糕' }, { agent: { session: { id: 's1' } } })
  assert.deepEqual(seen, [{ sessionId: 's1', query: '雪糕' }])
  assert.match(value.text, /lpipe_recall_id\[repo:7\]/)
  assert.match(value.summary, /1 段/)

  const empty = await createRecallTools({ reader: { rows: () => [] }, compose: () => '' }).find(
    (entry) => entry.name === 'recall_fragments',
  ).execute({ query: '雪糕' })
  assert.match(empty.text, /没有想起什么/)

  await assert.rejects(() => tool.execute({ query: '   ' }), /query is empty/)
})
