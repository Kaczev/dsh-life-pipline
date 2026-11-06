import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findInSentences, foldText } from '../src/llm.mjs'

// 这四条来自 2026-11-07 的 rejects.jsonl：原文里明明有，却被判「找不到」。
// 差别都不在字词，而在排版记号上——LaTeX、引号、空格、一个「的」。

test('原文写 \\(+x\\) 轴，名字给 x轴：算同一个名字', () => {
  const sentences = [{ text: '右边的电场方向沿 \\(+x\\) 轴向右；左边沿 \\(-x\\) 轴向左。' }]
  assert.deepEqual(findInSentences(sentences, 'x轴'), [0])
})

test('原文给词加了引号，名字没加：算同一个名字', () => {
  const sentences = [{ text: '因为电场线不扩散，没有“摊薄”效应，所以场强与距离无关。' }]
  assert.deepEqual(findInSentences(sentences, '摊薄效应'), [0])
})

test('原文多了结构助词「的」，名字没有：算同一个名字', () => {
  const sentences = [{ text: '那外部的场强怎么求？我们换个高斯面。' }]
  assert.deepEqual(findInSentences(sentences, '外部场强'), [0])
})

test('写法完全对得上的名字不会被这次放宽弄坏', () => {
  const sentences = [{ text: '两边把 \\(S\\) 消掉，就得到了内部场强。' }, { text: '这里没有那个词。' }]
  assert.deepEqual(findInSentences(sentences, '内部场强'), [0])
  assert.deepEqual(findInSentences(sentences, '记忆管线'), [])
})

test('折写只抹排版记号，不抹内容', () => {
  assert.equal(foldText('“摊薄”效应'), '摊薄效应')
  assert.equal(foldText('\\(+x\\) 轴'), 'x轴')
  assert.equal(foldText('外部的场强'), '外部场强')
  assert.notEqual(foldText('电场线'), foldText('磁场线'))
})
