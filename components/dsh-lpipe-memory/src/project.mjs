// 投影：把宿主的会话事件压成记忆行。白名单之外一律不写。
const KIND = {
  'user/message': 'user/message',
  'assistant/message': 'assistant/message',
  'tool/call': 'tool/call',
  'tool/result': 'tool/result',
}

export const STORED_KINDS = new Set(Object.values(KIND))

/** 把消息里的内容块拆成「给人看的文本」与「结构化块」。 */
function splitContent(content) {
  if (typeof content === 'string') return { text: content, parts: [{ type: 'text', text: content }] }
  if (!Array.isArray(content)) return { text: '', parts: [] }
  const texts = []
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text)
  }
  return { text: texts.join('\n'), parts: content }
}

function reasoningOf(parts) {
  const chunks = []
  for (const part of parts ?? []) {
    if (part?.type === 'reasoning' && typeof part.text === 'string') chunks.push(part.text)
  }
  return chunks.join('\n')
}

/** 一条事件要么投影成行，要么返回 null（不入档）。 */
export function project(event) {
  const kind = KIND[event?.type]
  if (!kind) return null
  const data = event.data ?? {}
  const turn = Number.isFinite(data.turn) ? data.turn : null
  const step = Number.isFinite(data.step) ? data.step : null

  if (kind === 'user/message') {
    const { text, parts } = splitContent(data.content)
    return { kind, turn, step, payload: { source: data.source ?? null, text, parts } }
  }

  if (kind === 'assistant/message') {
    const { text, parts } = splitContent(data.message?.content)
    return {
      kind,
      turn,
      step,
      payload: {
        text,
        reasoning: reasoningOf(parts),
        parts,
        usage: data.usage ?? null,
        interrupted: data.interrupted === true || undefined,
      },
    }
  }

  if (kind === 'tool/call') {
    return { kind, turn, step, payload: { callId: data.callId ?? null, name: data.name ?? '', arguments: data.arguments ?? '' } }
  }

  const { text, parts } = splitContent(data.message?.content)
  return {
    kind,
    turn,
    step,
    payload: {
      text,
      parts,
      isError: data.message?.isError === true || undefined,
      error: data.error ? { name: data.error.name, code: data.error.code, reason: data.error.reason ?? '' } : undefined,
    },
  }
}
