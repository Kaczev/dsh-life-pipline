import assert from 'node:assert/strict'
import test from 'node:test'

import { clockOf, extractStars, normalizeName } from '../src/extract.mjs'
import { matcherOf } from '../src/lexicon.mjs'

const matcher = matcherOf({ words: [{ name: '记忆管线', count: 40, df: 4 }, { name: '唤醒管线', count: 10, df: 3 }] })

test('反引号里的包名与路径', () => {
  const stars = extractStars('改了 `dsh-lpipe-memory` 和 `C:\\Users\\Kaczev\\x.mjs`。', matcher)
  assert.ok(stars.includes('dsh-lpipe-memory'))
  assert.ok(stars.includes('users\\kaczev\\x.mjs') || stars.includes('kaczev\\x.mjs'), stars.join(' / '))
})

test('版本号与英文专名', () => {
  const stars = extractStars('升级到 0.2.2-rc.1，插件是 dsh-life-pipline。', matcher)
  assert.ok(stars.includes('0.2.2-rc.1'))
  assert.ok(stars.includes('dsh-life-pipline'))
  assert.ok(!stars.includes('the'))
})

test('中文词靠词表最长匹配', () => {
  const stars = extractStars('我把记忆管线的落盘修好了。', matcher)
  assert.ok(stars.includes('记忆管线'))
})

test('书名号与引号里的名字', () => {
  const stars = extractStars('页面叫《Lpipe 设置》，按钮是「现在唤醒」。', matcher)
  assert.ok(stars.some((name) => name.includes('lpipe 设置')))
  assert.ok(stars.includes('现在唤醒'))
})

test('规范化：全角、标点、大小写、路径', () => {
  assert.equal(normalizeName('  《DSH》 '), 'dsh')
  assert.equal(normalizeName('ＤＳＨ'), 'dsh')
  assert.equal(normalizeName('components/dsh-lpipe-chat/src/tools.mjs'), 'src/tools.mjs')
})

test('话里的普通英文词不成星，只认标识符', () => {
  const stars = extractStars('Your System Prompt: I want to stay with you. Use dsh-lpipe-memory and krea.py.', matcher)
  for (const word of ['want', 'stay', 'system', 'prompt', 'your']) {
    assert.ok(!stars.includes(word), `${word} 不该成星：${stars.join(' / ')}`)
  }
  assert.ok(stars.includes('dsh-lpipe-memory'))
  assert.ok(stars.includes('krea.py'), stars.join(' / '))
})

test('单字、整句、带标点的短语都不成星', () => {
  const stars = extractStars('好。「粘人、温柔但严厉、用括号描写动作和语气」和「现在唤醒」。', matcher)
  assert.ok(!stars.includes('好'))
  assert.ok(!stars.some((name) => name.includes('、')), stars.join(' / '))
  assert.ok(stars.includes('现在唤醒'), stars.join(' / '))
})

test('时刻换成十分钟取整的模糊标签', () => {
  assert.equal(clockOf('说好 16:01 给你带雪糕'), 960)
  assert.equal(clockOf('下午四点要不要吃雪糕'), 960)
  assert.equal(clockOf('晚上 9 点半'), 1290)
  assert.equal(clockOf('十一点睡'), 660)
  assert.equal(clockOf('今天没有提到时间'), null)
})
