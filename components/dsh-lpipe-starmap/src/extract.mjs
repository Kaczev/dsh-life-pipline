// 名字的写法，和「这句话提到了几点」。
//
// 抽星本身已经交给模型了（见 llm.mjs）：这里只剩两件确定性的事——
// 同一个名字永远同一个写法、时刻折成模糊的十分钟。

const EDGE = /^[\s`'"“”‘’《》〈〉「」『』【】()（）\[\]<>.,;:!?。，、；：！？…·—–\-]+|[\s`'"“”‘’《》〈〉「」『』【】()（）\[\]<>.,;:!?。，、；：！？…·—–\-]+$/g

/** 显示名：全角转半角、去首尾标点、空白归一、路径只留最后两段。 */
export function normalizeName(raw) {
  let name = String(raw ?? '').normalize('NFKC')
  name = name.replace(EDGE, '')
  name = name.replace(/\s+/g, ' ').trim()
  if (name.includes('/') && !name.includes(' ')) {
    const segments = name.split('/').filter(Boolean)
    if (segments.length > 2) name = segments.slice(-2).join('/')
  }
  if (name.includes('\\') && !name.includes(' ')) {
    const segments = name.split('\\').filter(Boolean)
    if (segments.length > 2) name = segments.slice(-2).join('\\')
  }
  return name.replace(EDGE, '')
}

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/** 「十二」「二十四」「半」这类中文数字，够算时刻就行。 */
function cnNumber(raw) {
  const text = String(raw ?? '')
  if (!text) return null
  if (/^\d+$/.test(text)) return Number(text)
  const chars = [...text]
  const tens = chars.indexOf('十')
  if (tens === -1) return chars.length === 1 ? (CN_DIGIT[chars[0]] ?? null) : null
  const head = tens === 0 ? 1 : (CN_DIGIT[chars[0]] ?? null)
  const tail = tens === chars.length - 1 ? 0 : (CN_DIGIT[chars[chars.length - 1]] ?? null)
  if (head === null || tail === null) return null
  return head * 10 + tail
}

const PERIOD = { 凌晨: 0, 早上: 0, 上午: 0, 中午: 12, 下午: 12, 傍晚: 18, 晚上: 18, 夜里: 18 }

const round10 = (minutes) => (Math.round(minutes / 10) * 10) % 1440

/**
 * 一句话里提到的时刻，换算成「一天里的第几分钟」，按十分钟取整。
 * 数字是模糊的：16:01 记成 16:00，将来在 16 点前后都能被想起。
 */
export function clockOf(text) {
  const source = String(text ?? '')
  const plain = source.match(/\b(\d{1,2}):(\d{2})\b/)
  if (plain) {
    const hour = Number(plain[1])
    const minute = Number(plain[2])
    if (hour <= 23 && minute <= 59) return round10(hour * 60 + minute)
  }
  const cn = source.match(
    /(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*点\s*(半|[0-9]{1,2}分|[零〇一二两三四五六七八九十]{1,3}分)?/,
  )
  if (!cn) return null
  const word = cn[1] ?? ''
  let hour = cnNumber(cn[2])
  if (hour === null || hour > 24) return null
  const rest = cn[3] ?? ''
  let minute = 0
  if (rest === '半') minute = 30
  else if (rest) minute = cnNumber(rest.replace('分', '')) ?? 0
  if (word === '中午' && hour < 6) hour += 12
  else if ((PERIOD[word] ?? -1) >= 12 && hour < 12) hour += 12
  else if (PERIOD[word] !== undefined && PERIOD[word] < 12 && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  return round10(hour * 60 + minute)
}
