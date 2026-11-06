import assert from 'node:assert/strict'
import test from 'node:test'

import { splitSentences } from '../src/segment.mjs'

test('中文句末与换行都算一句', () => {
  assert.deepEqual(splitSentences('第一句。第二句！第三句？'), ['第一句。', '第二句！', '第三句？'])
  assert.deepEqual(splitSentences('第一行\n第二行'), ['第一行', '第二行'])
})

test('版本号与反引号里的点不切句', () => {
  assert.deepEqual(splitSentences('现在版本是 0.2.2-rc.1。'), ['现在版本是 0.2.2-rc.1。'])
  assert.deepEqual(splitSentences('跑一遍 `node --test`。'), ['跑一遍 `node --test`。'])
  assert.deepEqual(splitSentences('见 https://example.com/a.b。'), ['见 https://example.com/a.b。'])
})

test('英文句点只在后面跟空白时算句末', () => {
  assert.deepEqual(splitSentences('one. two. three'), ['one.', 'two.', 'three'])
  assert.deepEqual(splitSentences('see e.g. this'), ['see e.g. this'])
})

test('超长段落再切一刀', () => {
  const long = `${'很长的一句话，'.repeat(60)}结束。`
  const sentences = splitSentences(long)
  assert.ok(sentences.length > 1, '超长段落应当被切开')
  for (const sentence of sentences) assert.ok(sentence.length <= 320, `单句不应过长：${sentence.length}`)
})
