/**
 * 模糊星：时间与数字。
 *
 * 精确星是「名字」，要一模一样才连得上；模糊星是「感觉」，差一点点也该认得出来。
 * 所以它们不靠字符串匹配，靠数值距离：
 *   - 时间折成一天里的第几分钟（0–1439），差 2 分钟几乎是同一件事；
 *   - 数字按二进位的对数距离比，648 与 648.5 差不多，648 与 6480 差一个量级。
 */

export const MINUTES_PER_DAY = 1440

/** 二进位距离到这里就算没感觉了：相差 4 倍（2 个二进位）。 */
const NUMBER_LOG_SPAN = 2
/** 时间相差这么多分钟就完全没感觉：一小时。 */
const TIME_SPAN_MINUTES = 60

const PERIOD = { 凌晨: 0, 早上: 0, 上午: 0, 中午: 0, 下午: 12, 傍晚: 12, 晚上: 12, 夜里: 12 }
const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 「二十四」「十二」「两」→ 数值。只处理 0–24 这种口语写法。 */
export function cnNumber(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '两') return 2
  if (text === '十') return 10
  if (text.includes('十')) {
    const [head, tail] = text.split('十')
    const tens = head ? CN_DIGITS[head] : 1
    const ones = tail ? CN_DIGITS[tail] : 0
    if (tens === undefined || ones === undefined) return null
    return tens * 10 + ones
  }
  return CN_DIGITS[text] ?? null
}

const pad = (n) => String(n).padStart(2, '0')

/** 分钟数 → 「HH:MM」，模糊星的规范名字。 */
export function clockName(minutes) {
  const value = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`
}

const TIME_SPOKEN = /(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*([零一二三四五六七八九十两\d]{1,3})\s*点\s*(半|[零一二三四五六七八九十\d]{1,2}\s*分)?/g

/** 从一句话里找出所有的时间，返回 [{ name, form:'time', value }]。 */
export function timesIn(text) {
  const found = []
  const source = String(text ?? '')
  const clock = /(?:^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g
  let match
  while ((match = clock.exec(source))) {
    const value = Number(match[1]) * 60 + Number(match[2])
    found.push({ name: clockName(value), form: 'time', value, at: match.index + match[0].indexOf(match[1]) })
  }
  while ((match = TIME_SPOKEN.exec(source))) {
    const period = match[1] ? PERIOD[match[1]] ?? 0 : 0
    const hour = cnNumber(match[2])
    if (hour === null || hour > 24) continue
    let minutes = 0
    if (match[3] === '半') minutes = 30
    else if (match[3]) {
      const value = cnNumber(match[3].replace('分', '').trim())
      if (value !== null) minutes = value
    }
    const total = ((hour % 24) + period) * 60 + minutes
    found.push({ name: clockName(total), form: 'time', value: total % MINUTES_PER_DAY, at: match.index })
  }
  return found
}

const WORDISH = /[\p{L}\p{N}_]/u
const NUMBER = /-?\d+(?:\.\d+)?/g
/** 数字后面跟着这些字，说明它是数量而不是数值。 */
const MEASURE_WORDS = /[个条颗次轮字行位种张页章节套件只岁米克秒分时倍层块片组对大小]/u

/**
 * 从一句话里找出所有的「独立数字」。`图11-47`、`q_1`、`krea.py`、`12 个` 里的数字不算：
 * 它们是名字的一部分，不是数值感觉。
 */
export function numbersIn(text) {
  const source = String(text ?? '').replace(/(?:[01]?\d|2[0-3]):[0-5]\d/g, ' ')
  const found = []
  let match
  while ((match = NUMBER.exec(source))) {
    const raw = match[0]
    // 紧挨着的字母/数字/下划线说明它是名字的一部分：`图11-47`、`q_1`、`R_3`、`3r`。
    const before = source[match.index - 1]
    const after = source[match.index + raw.length]
    if (before && WORDISH.test(before)) continue
    if (after && WORDISH.test(after)) continue
    // 隔一个空格的量词也算（`12 个节点` 是数量，不是数值感觉）。
    let ahead = match.index + raw.length
    while (ahead < source.length && /\s/.test(source[ahead])) ahead += 1
    if (MEASURE_WORDS.test(source[ahead] ?? '')) continue
    const digits = raw.replace(/[^0-9]/g, '').length
    if (digits < 2 && !raw.includes('.')) continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    found.push({ name: String(value), form: 'number', value, at: match.index })
  }
  return found
}

/** 一句话里所有的模糊星。 */
export function fuzzyStarsIn(text) {
  const seen = new Map()
  for (const star of [...timesIn(text), ...numbersIn(text)]) {
    if (!seen.has(star.name)) seen.set(star.name, star)
  }
  return [...seen.values()]
}

/** 时间的感觉：同日差一分钟几乎满分，差一小时就没有感觉了。 */
export function timeScore(a, b) {
  const raw = Math.abs(a - b)
  const distance = Math.min(raw, MINUTES_PER_DAY - raw)
  return Math.max(0, 1 - distance / TIME_SPAN_MINUTES)
}

/** 数字的感觉：按二进位对数距离，相差 4 倍就归零。 */
export function numberScore(a, b) {
  if (!(a > 0) || !(b > 0)) return a === b ? 1 : 0
  const distance = Math.abs(Math.log2(a / b))
  return Math.max(0, 1 - distance / NUMBER_LOG_SPAN)
}

/** 这颗星是准确星还是模糊星。 */
export function starMeta(name) {
  const text = String(name ?? '').trim()
  if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(text)) {
    const [hour, minute] = text.split(':').map(Number)
    return { kind: 'fuzzy', form: 'time', value: hour * 60 + minute }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text) && text.replace(/[^0-9]/g, '').length >= 2) {
    return { kind: 'fuzzy', form: 'number', value: Number(text) }
  }
  return { kind: 'exact', form: null, value: null }
}

/** 两个模糊星之间的相似度；形态不同直接 0。 */
export function fuzzyScore(a, b) {
  if (!a || !b || a.form !== b.form) return 0
  if (a.form === 'time') return timeScore(a.value, b.value)
  return numberScore(a.value, b.value)
}
