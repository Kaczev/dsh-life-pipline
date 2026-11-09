import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_CHARS, fragmentSentencesOf, openRange, parsePosition, parseRecallId } from '../src/open.mjs'
import { createRecallTools } from '../src/tools.mjs'

const row = (turn, text, extra = {}) => ({ turn, text, kind: 'user/message', source: { kind: 'user' }, ...extra })
const readerOf = (rows) => ({ rows: (session) => session === 'repo' ? rows : [] })
const open = (rows, options = {}) => openRange({ reader: readerOf(rows), session: 'repo', from: { turn: 5, sentence: 1 }, ...options })

test('坐标必须是正安全整数，完整 ID 仍能解析', () => {
  assert.deepEqual(parsePosition('858:12'), { turn: 858, sentence: 12 })
  for (const value of ['0:1', '1:0', '-1:2', '1.2:3', '9007199254740992:1', 'repo:5:1', null]) assert.equal(parsePosition(value), null)
  assert.deepEqual(parseRecallId('lpipe_recall_id[repo:5:1]'), { session: 'repo', turn: 5, sentence: 1 })
})

test('与模糊回忆切句口径一致，纳入短工具结果并排除代码', () => {
  const reader = readerOf([row(5, '一。二。'), row(5, '工具', { kind: 'tool/result' }), row(5, '```js\na=1\n```'), row(6, '别的轮次。')])
  assert.deepEqual(fragmentSentencesOf(reader, 'repo', 5).map((line) => line.text), ['一。', '二。'])
})

test('跨片段区间包含端点；头部列出所有已读片段和总数', () => {
  const value = open([row(5, '一。二。三。'), row(7, '四。五。'), row(8, '六。')], { from: { turn: 5, sentence: 2 }, to: { turn: 7, sentence: 1 } })
  assert.match(value.text, /本仓库共 3 个片段/)
  assert.match(value.text, /lpipe_recall_id\[repo:5\] \| 时间未记录 \| 本片段共 3 句/)
  assert.match(value.text, /lpipe_recall_id\[repo:7\] \| 时间未记录 \| 本片段共 2 句/)
  assert.match(value.text, /〔DSH · 用户 → 我｜2〕二。/)
  assert.match(value.text, /〔DSH · 用户 → 我｜1〕四。/)
  assert.doesNotMatch(value.text, /五。/)
  assert.match(value.text, /下一页 from=7:2/)
  assert.deepEqual(value.turns, [5, 7])
})

test('片段头显示本地时间，分页不改用起始句时间，无效时间不编造', () => {
  const at = new Date(2026, 10, 9, 15, 40).getTime()
  const rows = [row(5, '一。', { at }), row(5, '二。', { at: at + 60000 }), row(6, '三。', { at: 'bad' })]
  const first = open(rows, { count: 1 })
  const next = open(rows, { from: { turn: 5, sentence: 2 }, count: 1 })
  for (const value of [first, next]) assert.match(value.text, /lpipe_recall_id\[repo:5\] \| 11-09 15:40 \| 本片段共 2 句/)
  assert.match(open(rows, { from: { turn: 6, sentence: 1 } }).text, /\| 时间未记录 \| 本片段共 1 句/)
})

test('按 count 翻页跨轮且不重复尾句；同一句区间可读', () => {
  const rows = [row(5, '一。二。'), row(6, '三。四。')]
  const value = open(rows, { count: 2 })
  assert.match(value.text, /下一页 from=6:1/)
  const next = open(rows, { from: { turn: 6, sentence: 1 }, count: 2 })
  assert.doesNotMatch(next.text, /二。|下一页/)
  assert.equal(open(rows, { to: { turn: 5, sentence: 1 } }).end, '5:1')
})

test('不存在的起止和反向区间报错，不静默夹到尾句', () => {
  const rows = [row(5, '一。二。')]
  assert.throws(() => open(rows, { from: { turn: 5, sentence: 3 } }), /missing/)
  assert.throws(() => open(rows, { to: { turn: 9, sentence: 1 } }), /missing/)
  assert.throws(() => open(rows, { from: { turn: 5, sentence: 2 }, to: { turn: 5, sentence: 1 } }), /precede/)
  for (const count of [0, 201, 1.5]) assert.throws(() => open(rows, { count }), /count/)
})

test('200 句截断明确标记，24000 字包含头部、ID 和翻页提示', () => {
  const value = open([row(5, '一。'.repeat(240))], { to: { turn: 5, sentence: 240 } })
  assert.equal(value.end, '5:200')
  assert.equal(value.truncated, true)
  assert.match(value.text, /已截断/)
  assert.match(value.text, /下一页 from=5:201/)
  const large = open([row(5, `${'字'.repeat(250)}。`.repeat(240))], { to: { turn: 5, sentence: 240 } })
  assert.ok(large.text.length <= MAX_CHARS)
  assert.equal(large.truncated, true)
  const single = open([row(5, `${'字'.repeat(250)}。`)], { maxChars: 180 })
  assert.ok(single.text.length <= 180)
  assert.match(single.text, /单句过长.*未完整返回/)
  assert.doesNotMatch(single.text, /下一页/)
})

test('recall_open 使用独立仓库和起止坐标，读取前刷新索引', async () => {
  const reader = readerOf([row(5, '一。二。'), row(6, '三。')])
  let reloaded = 0
  reader.reload = () => reloaded++
  const tool = createRecallTools({ reader }).find((entry) => entry.name === 'recall_open')
  assert.deepEqual(tool.parameters.required, ['repo', 'from'])
  const result = await tool.execute({ repo: 'repo', from: '5:2', to: '6:1' })
  assert.match(result.text, /二。/)
  assert.match(result.text, /三。/)
  assert.equal(reloaded, 1)
  await assert.rejects(() => tool.execute({ repo: 'repo', from: '错误' }), /turn:sentence/)
  await assert.rejects(() => tool.execute({ repo: '', from: '5:1' }), /repo/)
})

test('recall_fragments 传递查询与会话，支持异步组装，空查询报错', async () => {
  const session = { id: 's1' }
  const seen = []
  const tool = createRecallTools({ reader: readerOf([]), compose: async (...args) => {
    seen.push(args)
    return 'lpipe_recall_id[repo:5]'
  } }).find((entry) => entry.name === 'recall_fragments')
  assert.match((await tool.execute({ query: ' 雪糕 ' }, { agent: { session } })).text, /repo:5/)
  assert.equal(seen[0][0], 's1')
  assert.equal(seen[0][1], '雪糕')
  assert.equal(seen[0][4], session)
  await assert.rejects(() => tool.execute({ query: ' ' }), /query is empty/)
  const empty = createRecallTools({ reader: readerOf([]), compose: () => '' })[0]
  assert.match((await empty.execute({ query: '雪糕' })).text, /没有想起什么/)
})

test("默认读取20句，来源头给出连续文字的起始坐标", async () => {
 const rows = [row(5, "一。".repeat(25)), row(6, "二。三。四。")];
 assert.equal(open(rows).end, "5:20");
 const value = open(rows, { from: { turn: 5, sentence: 23 }, to: { turn: 6, sentence: 3 } });
 assert.equal((value.text.match(/lpipe_recall_id\[repo:\d+:\d+\]/g) ?? []).length, 0);
 assert.doesNotMatch(value.text, /〔5:24〕|〔6:2〕|lpipe_recall_id\[repo:5:24\]|lpipe_recall_id\[repo:6:2\]/);
 assert.match(value.text, /〔DSH · 用户 → 我｜23〕一。\n一。\n一。/);
 assert.match(value.text, /〔DSH · 用户 → 我｜1〕二。\n三。\n四。/);
 const tool = createRecallTools({ reader: readerOf(rows) }).find(t => t.name === "recall_open");
 assert.equal(tool.parameters.properties.count.maximum, 200);
 assert.match((await tool.execute({ repo: "repo", from: "5:1" })).summary, /5:1–5:20/);
});

test('空终点按count读取，非法非空终点仍拒绝', async () => {
 const tool = createRecallTools({ reader: readerOf([row(5, '一。二。三。')]) }).find(t => t.name === 'recall_open');
 assert.deepEqual(tool.parameters.properties.to.type, ['string', 'null']);
 for (const to of [undefined, null, '', '  ']) assert.match((await tool.execute({ repo: 'repo', from: '5:1', to, count: 2 })).summary, /5:1–5:2/);
 for (const to of ['oops', 0, false]) await assert.rejects(() => tool.execute({ repo: 'repo', from: '5:1', to }), /positive integer/);
});
