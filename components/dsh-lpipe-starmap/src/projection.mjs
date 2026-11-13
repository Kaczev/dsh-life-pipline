// Source-aware text projection. Stored originals are never rewritten.
export function chatSpans(row) {
  const text = String(row?.text ?? '')
  const spans = row?.source?.recallOrigins
  if (!Array.isArray(spans)) return [] // Legacy chat records are deliberately unsupported.
  return spans.filter(s => Number.isInteger(s.start) && Number.isInteger(s.end)
    && s.start >= 0 && s.end > s.start && s.end <= text.length)
}

export function messageBodies(row) {
  const text = String(row?.text ?? '')
  if (row?.source?.kind === 'dsh-lpipe-chat') {
    return chatSpans(row).map(s => text.slice(s.start, s.end))
  }
  if (row?.source?.kind === 'dsh-lpipe-wake') {
    if (row.source.wake === 'natural' || row.source.form === 'snapshot') return []
    if (typeof row.source.wakeReason === 'string') return row.source.wakeReason.trim() ? [row.source.wakeReason] : []
    // Older producers may append a schedule snapshot after the original reason.
    const original = text.split('\n\n[唤醒安排快照]\n', 1)[0]
    // The current wake producer puts the reason after this exact fixed wrapper.
    const match = /^（主动醒来）我给自己定的时间是 [^\n]*。\n我留给这一刻的话：([\s\S]*)$/.exec(original)
    return match?.[1]?.trim() ? [match[1]] : []
  }
  return text.trim() ? [text] : []
}

/** Preserve positions while excluding all gateway-generated text from numeric extraction. */
export function numericTextOf(row, text) {
  if (row?.kind !== 'user/message' || row.source?.kind !== 'dsh-lpipe-chat') return text
  const spans = chatSpans(row)
  let offset = 0
  const chunks = []
  for (const span of spans) {
    if (span.start < offset) continue
    chunks.push(' '.repeat(span.start - offset), text.slice(span.start, span.end))
    offset = span.end
  }
  chunks.push(' '.repeat(text.length - offset))
  return chunks.join('')
}
