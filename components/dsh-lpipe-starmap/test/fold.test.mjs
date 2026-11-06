import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findInSentences, foldText } from '../src/llm.mjs'

// 这些来自 2026-11-07 的第二批 rejects：原文里其实有，只是被排版记号挡住了。
// 与字词无关的差别（LaTeX 命令、反引号、零宽字符、中括号）必须一律抹平再比。

test('原文写 \\(f_{\\max}\\)，名字给 f_max：算同一个名字', () => {
  const sentences = [{ text: '和 \\(f_{\\max}\\) 决定了你软件视觉边界。'.replace(/\\\\/g, '\\') }]
  // 上面构造出 f_{\max}；模型那头常常没有反斜杠。
  assert.deepEqual(findInSentences(sentences, 'f_max'), [0])
})

test('原文用反引号包着 D，名字是「D 的压制逻辑」：算同一个名字', () => {
  const sentences = [{ text: '加上 `f(R) = R^(1/3)` 和 `D` 的压制逻辑。' }]
  assert.deepEqual(findInSentences(sentences, 'D 的压制逻辑'), [0])
})

test('名字里混进零宽空格也要能找到', () => {
  const sentences = [{ text: '用的就是 f_base 这个参数。' }]
  assert.deepEqual(findInSentences(sentences, 'f_\u200bbase'), [0])
})

test('\\text{V} 与 V 是同一个东西', () => {
  const sentences = [{ text: '当 0.7\\text{V} 时导通。' }]
  assert.deepEqual(findInSentences(sentences, '0.7V'), [0])
})

test('凭空概括出来的描述性名词仍然找不到', () => {
  const sentences = [{ text: '余额为 0 的时候 D=1，软件的心跳会变慢。' }]
  assert.deepEqual(findInSentences(sentences, '余额显示软件'), [])
})

test('折写只抹排版记号，不抹内容', () => {
  assert.equal(foldText('“摊薄”效应'), '摊薄效应')
  assert.equal(foldText('\\(+x\\) 轴'), 'x轴')
  assert.equal(foldText('外部的场强'), '外部场强')
  assert.notEqual(foldText('电场线'), foldText('磁场线'))
})
