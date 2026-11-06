// 抽星花了多少 token：每次调用追加一行，统计时按时间窗口累加。
//
// 只记「我们自己发起的那次调用」，不猜宿主的计费口径；字段都用模型返回的原始数字。
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const usageFile = (root) => join(root, 'usage.jsonl')

/** 每次调用记一行：{ at, input, output, cacheRead, ok, model } */
export function noteUsage(root, entry) {
  try {
    mkdirSync(root, { recursive: true })
    appendFileSync(usageFile(root), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // 记不上账不能影响抽星
  }
}

const DAY = 24 * 60 * 60 * 1000

/**
 * `calls` / `tokens` 是历史总计，`calls7d` / `tokens7d` 是最近七天。
 * token 一律按 input + output 算，缓存的读取也算进去（它确实占了上下文）。
 */
export function usageStats(root, { now = Date.now(), days = 7 } = {}) {
  const stats = { calls: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, calls7d: 0, tokens7d: 0, days }
  const since = now - days * DAY
  let text = ''
  try {
    text = readFileSync(usageFile(root), 'utf8')
  } catch {
    return stats
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let row = null
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const input = Number(row?.input) || 0
    const output = Number(row?.output) || 0
    const cacheRead = Number(row?.cacheRead) || 0
    const at = Date.parse(row?.at ?? '')
    stats.calls += 1
    stats.input += input
    stats.output += output
    stats.cacheRead += cacheRead
    stats.tokens += input + output
    if (Number.isFinite(at) && at >= since) {
      stats.calls7d += 1
      stats.tokens7d += input + output
    }
  }
  return stats
}
