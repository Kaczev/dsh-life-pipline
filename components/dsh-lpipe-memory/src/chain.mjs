// 哈希链：每一行的 hash 由上一行的 hash 与本行正文算出，跨文件、跨天相连。
import { createHash } from 'node:crypto'

export const GENESIS = 'sha256:genesis'

/** 正文：一行除了 `prev` 与 `hash` 之外的全部字段，按插入顺序序列化。 */
export function bodyOf(row) {
  const { prev: _prev, hash: _hash, ...rest } = row
  return JSON.stringify(rest)
}

export function hashOf(prev, body) {
  return 'sha256:' + createHash('sha256').update(`${prev}\n${body}`).digest('hex')
}

/** 给一行接上链：写入前调用，`prev` 是上一行的 hash。 */
export function seal(row, prev) {
  const body = bodyOf(row)
  return { ...row, prev, hash: hashOf(prev, body) }
}

/** 校验一行：返回 null 表示完好，否则返回人话说的原因。 */
export function checkRow(row, prev) {
  if (typeof row?.hash !== 'string' || typeof row?.prev !== 'string') return '缺少 prev/hash'
  if (row.prev !== prev) return `prev 对不上：期望 ${prev}，实际 ${row.prev}`
  const want = hashOf(row.prev, bodyOf(row))
  return want === row.hash ? null : 'hash 与正文不符'
}
