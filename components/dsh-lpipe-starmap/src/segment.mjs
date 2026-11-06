// 分句：同样的输入永远切出同样的句子。
//
// 句末：。！？…；与换行；英文 . ! ? 只有后面跟空白或到结尾时才算。
// 反引号、代码块、URL、版本号内部不切——否则 `0.2.2-rc.1` 会被切成三句。
// 一句超过 300 字再按；、，切一刀，免得一句话抽出几十颗星连成毛线团。

const CJK_BREAK = new Set(['。', '！', '？', '；', '…', '\n', '\r'])
const LONG_SENTENCE = 300

/** 反引号与代码块的结尾位置；不是给就返回 -1。 */
function skipSpan(text, i) {
  if (text.startsWith('```', i)) {
    const end = text.indexOf('```', i + 3)
    return end === -1 ? text.length : end + 3
  }
  if (text[i] === '`') {
    const end = text.indexOf('`', i + 1)
    return end === -1 ? text.length : end + 1
  }
  if (text.startsWith('http://', i) || text.startsWith('https://', i)) {
    let j = i
    while (j < text.length && !/[\s）)】\]，。；]/.test(text[j])) j += 1
    return j
  }
  return -1
}

/** 英文句点：后面必须是空白或结尾，且不能是 e.g. / U.S. 这种缩写。 */
function isAsciiEnd(text, i) {
  const next = text[i + 1]
  if (next !== undefined && !/\s/.test(next)) return false
  const prev = text[i - 1]
  if (prev && /[A-Za-z]/.test(prev)) {
    let start = i - 1
    while (start > 0 && /[A-Za-z]/.test(text[start - 1])) start -= 1
    const token = text.slice(start, i)
    const before = text[start - 1]
    // e.g. / U.S. / i.e.：缩写里的点不是句末。
    if (token.length <= 2 && (before === undefined || /\s/.test(before) || before === '.')) return false
  }
  return true
}

/** 把一段文字切成句子。 */
export function splitSentences(input) {
  const text = String(input ?? '')
  const out = []
  let buffer = ''
  const push = () => {
    const trimmed = buffer.trim()
    if (trimmed) out.push(trimmed)
    buffer = ''
  }

  let i = 0
  while (i < text.length) {
    const span = skipSpan(text, i)
    if (span > i) {
      buffer += text.slice(i, span)
      i = span
      continue
    }
    const ch = text[i]
    if (CJK_BREAK.has(ch)) {
      buffer += ch
      push()
      i += 1
      // 「……」这种连写只算一次结束。
      while (text[i] === ch && ch === '…') i += 1
      continue
    }
    if ((ch === '.' || ch === '!' || ch === '?') && isAsciiEnd(text, i)) {
      buffer += ch
      push()
      i += 1
      while (i < text.length && /\s/.test(text[i])) i += 1
      continue
    }
    buffer += ch
    i += 1
  }
  push()

  const result = []
  for (const sentence of out) {
    if (sentence.length <= LONG_SENTENCE) {
      result.push(sentence)
      continue
    }
    let rest = sentence
    while (rest.length > LONG_SENTENCE) {
      const cut = rest.slice(0, LONG_SENTENCE).search(/[；、，][^；、，]*$/)
      const at = cut > LONG_SENTENCE / 2 ? cut + 1 : LONG_SENTENCE
      result.push(rest.slice(0, at).trim())
      rest = rest.slice(at)
    }
    if (rest.trim()) result.push(rest.trim())
  }
  return result
}
