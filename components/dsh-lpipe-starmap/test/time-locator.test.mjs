import assert from 'node:assert/strict'
import test from 'node:test'
import { starWorthy, planTurn, RULES_VERSION } from '../src/build.mjs'
import { isTimeLocator } from '../src/time.mjs'
import { SYSTEM_PROMPT } from '../src/llm.mjs'

test('文字时间定位端点被拒绝，时间机制概念和数字模糊星保留', () => {
  for (const name of ['刚刚','刚才','上周','昨天','最近','近期','过去三天','上周三下午','昨天到今天']) {
    assert.equal(isTimeLocator(name), true, name)
    assert.equal(starWorthy(name), false, name)
  }
  for (const name of ['时间星','时间模板','时间范围','时区','上周报告','刚刚的实现','20:44']) assert.equal(isTimeLocator(name), false, name)
  const turn = { rows: [{ kind: 'user/message', seq: 1, text: '刚刚上周讨论时间模板和时间范围，20:44 到达，温度 648 度。' }] }
  const plan = planTurn(turn, [['刚刚','时间模板'],['上周','时间范围'],['时间模板','时间范围']])
  assert.equal(plan.pairs.length, 1)
  assert.ok(![...plan.names.values()].includes('刚刚'))
  assert.ok([...plan.names.values()].includes('20:44'))
  assert.ok([...plan.names.values()].includes('648'))
  assert.match(SYSTEM_PROMPT, /historical time locators/)
  assert.equal(RULES_VERSION, 12)
})
