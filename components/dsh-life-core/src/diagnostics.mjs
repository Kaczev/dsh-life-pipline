import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const DIAGNOSTIC_MAX_BYTES = 2 * 1024 * 1024

/** Best-effort JSONL diagnostics only. Retain complete recent records, never split UTF-8. */
export function appendDiagnostic(file, record, maxBytes = DIAGNOSTIC_MAX_BYTES) {
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) return false
    const line = Buffer.from(JSON.stringify(record) + '\n', 'utf8')
    if (line.length > maxBytes) return false
    mkdirSync(dirname(file), { recursive: true })
    let size = 0
    try { size = statSync(file).size } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (size + line.length > maxBytes) {
      // Read only a bounded tail even if a legacy file is already very large.
      const length = Math.min(size, maxBytes - line.length)
      const tail = Buffer.alloc(length)
      const fd = openSync(file, 'r')
      try { readSync(fd, tail, 0, length, size - length) } finally { closeSync(fd) }
      const boundary = tail.indexOf(10)
      const complete = boundary < 0 ? Buffer.alloc(0) : tail.subarray(boundary + 1)
      writeFileSync(file, Buffer.concat([complete, line]))
    } else appendFileSync(file, line)
    return true
  } catch { return false } // Diagnostics must never interrupt business operations.
}
