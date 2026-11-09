import { splitSentences } from 'dsh-lpipe-starmap/segment'
import { textsOf } from 'dsh-lpipe-starmap/build'
import { messageBodies } from 'dsh-lpipe-starmap/projection'
import { eligibleMessage, displaySegments } from './provenance.mjs'

const SKIP = new Set(['runtime-context', 'time-context', 'dsh-lpipe-recall', 'dsh-lpipe-assoc', 'dsh-lpipe-imagine'])

/** One policy for stored rows and live events; display omits assistant reasoning. */
export function recallTexts(row, toolName = null, { reasoning = false } = {}) {
  if (row?.kind === 'user/message' && SKIP.has(row.source?.kind)) return []
  if (row?.kind === 'user/message') return messageBodies(row)
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

/** Display-only whitelist; response windows retain their existing projection. */
export function displayRows(rows) {
  const results = new Map(rows.filter(row => row.kind === 'tool/result' && row.callId).map(row => [row.callId, row.delivery]))
  return recallRows(rows).map((row, index) => {
    // Structured display offsets refer to the archived text, not matching text.
    const projected = { ...row, text: row.kind === 'user/message' ? rows[index].text ?? row.text : row.text, recallDelivery: results.get(row.callId) }
    return { ...projected, segments: displaySegments(projected), imageEligible: eligibleMessage(row) }
  })
}
export function displayPieces(row, prosePieces) {
  return (row.segments ?? []).flatMap(segment => recallPieces({ ...row, text: segment.text }, prosePieces)
    .map(text => ({ text, source: segment.source, segment: segment.segment })))
}
