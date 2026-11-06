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

/** 本地日期键，用来把调用按天分桶。 */
const dayKey = (at) => {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * `calls` / `tokens` 是历史总计，`calls7d` / `tokens7d` 是最近七天。
 * 计费口径：宿主的计数是**互斥**的（`inputTokens` 只算未命中的输入，命中的在
 * `cacheReadTokens`、写入缓存的在 `cacheWriteTokens`），所以总量是四项相加。
 */
export function usageStats(root, { now = Date.now(), days = 7 } = {}) {
  const buckets = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = dayKey(now - index * DAY)
    buckets.push({ day, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 })
  }
  const byDay = new Map(buckets.map((bucket) => [bucket.day, bucket]))
  const stats = { calls: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls7d: 0, tokens7d: 0, days, daily: buckets }
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
    const cacheWrite = Number(row?.cacheWrite) || 0
    const at = Date.parse(row?.at ?? '')
    stats.calls += 1
    stats.input += input
    stats.output += output
    stats.cacheRead += cacheRead
    stats.cacheWrite += cacheWrite
    stats.tokens += input + output + cacheRead + cacheWrite
    if (Number.isFinite(at) && at >= since) {
      stats.calls7d += 1
      stats.tokens7d += input + output + cacheRead + cacheWrite
      const bucket = byDay.get(dayKey(at))
      if (bucket) {
        bucket.calls += 1
        bucket.input += input
        bucket.output += output
        bucket.cacheRead += cacheRead
        bucket.cacheWrite += cacheWrite
      }
    }
  }
  return stats
}
