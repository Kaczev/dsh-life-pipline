// 抽星：一句话里有哪些概念。
//
// 前四层零猜测：反引号里的代码/路径/包名、书名号与引号里的专名、全大写缩写、驼峰、
// 英文标识符与版本号序列。第五层是词表里的中文词（由 lexicon.mjs 从原文里长出来）。
//
// 两条底线：话里的普通英文词（system / prompt / leave）不算星，只认标识符形态；
// 数字与时刻也不成星，时刻改用 clockOf() 留一个模糊的时间标签。

import { cjkRuns, matchWords } from './lexicon.mjs'

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/

const EDGE = /^[\s`'"“”‘’《》〈〉「」『』【】()（）\[\]<>.,;:!?。，、；：！？…·—–\-]+|[\s`'"“”‘’《》〈〉「」『』【】()（）\[\]<>.,;:!?。，、；：！？…·—–\-]+$/g

/** 引号里也不该出现的东西：句子标点、运算符号。 */
const QUOTE_BAD = /[。！？；、，…,;:!?=≠<>{}[\]|^~$#*`()（）"'“”‘’「」『』]/

/** 同一个名字永远同一个写法：全角转半角、去首尾标点、英文小写、路径只留最后两段。 */
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
  if (/^[A-Za-z]/.test(name)) name = name.toLowerCase()
  return name.replace(EDGE, '')
}

const isAsciiName = (name) => !CJK.test(name)

/**
 * 英文只留「标识符形态」：带分隔符或数字、驼峰、全大写缩写。
 * 话里的普通英文词（system / prompt / want）只是词，不是概念。
 */
const letterCount = (name) => name.replace(/[^A-Za-z]/g, '').length

/** a-r2-c-r3-d 这种是电路里的一条路径，不是概念。 */
function isLatticePath(name) {
  const segments = name.split(/[-_/]/).filter(Boolean)
  if (segments.length < 3) return false
  return segments.every((segment) => segment.length <= 2 && /^[a-z]?\d*$/.test(segment))
}

/** r_s、varepsilon_0、i_1r_1、us6-b-r5 这类是数学下标和路径；要留下的是 dsh-lpipe-memory 这种有实词段的标识符。 */
function hasWordSegment(name) {
  if (!/[-_/]/.test(name)) return true
  return name.split(/[-_/]/).some((segment) => /^[A-Za-z]{3,}$/.test(segment))
}

function isIdentifier(name) {
  if (/^v?\d+(?:\.\d+)*[-+][0-9a-z.\-]+$/i.test(name)) return true // 0.2.2-rc.1 这种带标签的版本号
  if (/^v?\d+(?:\.\d+)+$/i.test(name)) return false // 版本号本身不成星
  if (letterCount(name) < 2) return false // q_1、e_2、3A、0W：下标和单位不是概念
  if (isLatticePath(name)) return false // a-r2-c-r3：电路里的一条路径
  if (!hasWordSegment(name)) return false // r_s、i_1r_1、e-x：数学下标
  if (/[._/\\-]/.test(name)) return true
  if (/\d/.test(name)) return true
  if (/[a-z][A-Z]/.test(name)) return true // 驼峰
  if (/^[A-Z0-9]{2,}$/.test(name)) return true // 全大写缩写
  return false
}

/** 散落在一句话里的 token（不带引号）。 */
function isStarName(name) {
  if (!name || name.length > 64) return false
  if (!/[\p{L}\p{N}]/u.test(name)) return false
  if (/^[\d.:%+\-]+$/.test(name)) return false // 纯数字、时间、百分比
  if (isAsciiName(name)) return name.length >= 2 && isIdentifier(name)
  if (QUOTE_BAD.test(name) || /\s/.test(name)) return false
  const cjk = [...name].filter((ch) => CJK.test(ch)).length
  return cjk >= 2 && cjk <= 12
}

/** 引号、书名号、反引号里的名字：允许空格（《Lpipe 设置》），但仍然不许是整句。 */
function isQuotedName(name) {
  if (!name || name.length > 24) return false
  if (!/[\p{L}\p{N}]/u.test(name)) return false
  if (QUOTE_BAD.test(name)) return false
  if (/\.\s/.test(name) || /\s{2,}/.test(name)) return false // 「are. you. watching」不是名字
  if (isAsciiName(name)) return isIdentifier(name)
  const cjk = [...name].filter((ch) => CJK.test(ch)).length
  return cjk >= 2 && cjk <= 6
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

function codeCandidate(inner) {
  const trimmed = inner.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('-')) return null
  const first = trimmed.split(/\s+/)[0]
  if (!first || first.length > 64) return null
  return first
}

/**
 * 抽出一句话里的星（已规范化、去重、保持出现顺序）。
 * @param {string} text
 * @param {{ buckets: Map<number, Set<string>>, longest: number }} matcher
 * @param {{ extra?: string[] }} [options]
 */
export function extractStars(text, matcher, options = {}) {
  const source = String(text ?? '')
  const names = []
  const add = (raw, quoted = false) => {
    const name = normalizeName(raw)
    if (!(quoted ? isQuotedName(name) : isStarName(name))) return
    if (!names.includes(name)) names.push(name)
  }

  // 第一层：反引号里的代码、路径、包名、命令
  for (const match of source.matchAll(/`([^`\n]{1,80})`/g)) {
    const candidate = codeCandidate(match[1])
    if (candidate) add(candidate, true)
  }

  // 第三层：书名号、引号、全大写缩写、驼峰
  for (const match of source.matchAll(/《([^》]{1,40})》/g)) add(match[1], true)
  for (const match of source.matchAll(/“([^”]{1,40})”/g)) add(match[1], true)
  for (const match of source.matchAll(/「([^」]{1,40})」/g)) add(match[1], true)
  for (const match of source.matchAll(/\b[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)*\b/g)) add(match[0])
  for (const match of source.matchAll(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g)) add(match[0])

  // 第四层：英文标识符、带数字的名字、版本号
  for (const match of source.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*\b/g)) add(match[0])
  for (const match of source.matchAll(/\b\d+\.\d+(?:[.-][A-Za-z0-9]+)+\b/g)) add(match[0])

  // 第五层：词表里的中文词，最长优先
  if (matcher) {
    for (const run of cjkRuns(source)) {
      for (const word of matchWords(run, matcher)) add(word)
    }
  }

  for (const raw of options.extra ?? []) add(raw)
  return names
}
