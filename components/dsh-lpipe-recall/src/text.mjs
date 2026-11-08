import { splitSentences } from 'dsh-lpipe-starmap/segment'
import { textsOf } from 'dsh-lpipe-starmap/build'

const SKIP = new Set(['runtime-context', 'time-context', 'dsh-lpipe-recall', 'dsh-lpipe-assoc', 'dsh-lpipe-imagine'])

/** One policy for stored rows and live events; display omits assistant reasoning. */
export function recallTexts(row, toolName = null, { reasoning = false } = {}) {
  if (row?.kind === 'user/message' && SKIP.has(row.source?.kind)) return []
  if (row?.kind === 'tool/call' || row?.kind === 'tool/result') return textsOf(row, toolName)
  if (row?.kind !== 'user/message' && row?.kind !== 'assistant/message') return []
  return textsOf(reasoning ? row : { ...row, reasoning: '' })
}

export function recallRows(rows, options) {
  const calls = new Map()
  let lastName = null
  return rows.map(row => {
    if (row.kind === 'tool/call') {
      lastName = row.name
      if (row.callId) calls.set(row.callId, row.name)
    }
    const name = row.kind === 'tool/result' ? (calls.get(row.callId ?? row.toolCallId) ?? lastName) : null
    return { ...row, text: recallTexts(row, name, options).join('\n'), recallToolName: row.kind === 'tool/call' && row.name !== 'chat_send' }
  })
}

/** Eligible tool data is not discarded by the prose/code heuristic. */
export function recallPieces(row, prosePieces) {
  if (row.recallToolName) return row.text ? [row.text] : []
  if (row.kind === 'tool/result' || row.kind === 'tool/call') {
    return splitSentences(row.text ?? '').map(part => typeof part === 'string' ? part : part?.text).filter(text => typeof text === 'string' && text.trim())
  }
  return prosePieces(row.text ?? '')
}
