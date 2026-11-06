// 回归：Cordis 的 logger 是可调用对象，info/warn 内部会先执行 this() 拿子 logger。
// 把方法取出来再调用会丢 this，抛 TypeError，而宿主把插件里的异常当成致命加载失败。
// 这个测试用一个「必须保留 this」的假 logger 跑一遍冷日打包，确认不会把宿主带崩。
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { MemoryWriter } from '../src/writer.mjs'

const cordisLogger = (calls) => {
  function logger() {
    return {
      info: (message) => calls.push(message),
      warn: (message) => calls.push(message),
    }
  }
  for (const level of ['info', 'warn']) {
    logger[level] = function (...args) {
      if (typeof this !== 'function') throw new TypeError('this is not a function')
      return this()[level](...args)
    }
  }
  return logger
}

test('冷日打包写日志时保留 logger 的 this，出错也不把宿主带崩', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-logger-'))
  const yesterday = Date.now() - 36 * 60 * 60 * 1000
  const writer = new MemoryWriter({ root })
  writer.append({ sessionId: 'sess-log', eventSeq: 1, at: yesterday, turn: 1, kind: 'user/message', payload: { text: '昨天的记忆' } })
  writer.append({ sessionId: 'sess-log', eventSeq: 2, at: yesterday + 1000, turn: 1, kind: 'assistant/message', payload: { text: '记下了' } })
  writer.close()

  const calls = []
  const ctx = { logger: cordisLogger(calls), effect: () => {}, inject: () => {} }
  const { apply } = await import('../src/index.js')
  const api = apply(ctx, { root, packDelay: 0, pack: true })

  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.ok(calls.length >= 1, '打包完成应当留下一行日志')
  assert.match(calls.join('\n'), /冷日打包/)
  assert.ok(api.reader)

  rmSync(root, { recursive: true, force: true })
})
