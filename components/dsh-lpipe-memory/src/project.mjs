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

/**
 * 只留搬不走的结构块：文本与思考已经单独存在 `text` / `reasoning` 里，
 * 再存一份就是纯重复（历史上一度让 42% 的体积变成副本）。
 * 图片、文件、工具结构化结果没有别的落点，必须留着。
 */
export function carriedParts(parts) {
  if (!Array.isArray(parts)) return []
  return parts.filter((part) => part && part.type !== 'text' && part.type !== 'reasoning')
}

function payloadWith(parts, extra) {
  const carried = carriedParts(parts)
  return carried.length > 0 ? { ...extra, parts: carried } : extra
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
    return { kind, turn, step, payload: payloadWith(parts, { source: data.source ?? null, text }) }
  }

  if (kind === 'assistant/message') {
    const { text, parts } = splitContent(data.message?.content)
    return {
      kind,
      turn,
      step,
      payload: payloadWith(parts, {
        text,
        reasoning: reasoningOf(parts),
        usage: data.usage ?? null,
        interrupted: data.interrupted === true || undefined,
      }),
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
    payload: payloadWith(parts, {
      text,
      isError: data.message?.isError === true || undefined,
      error: data.error ? { name: data.error.name, code: data.error.code, reason: data.error.reason ?? '' } : undefined,
    }),
  }
}
