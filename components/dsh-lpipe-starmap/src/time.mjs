const MINUTE = 60000
const DAY = 86400000

/** 只拒绝完整定位短语，不拒绝「时间模板」等机制概念，也不处理数字模糊星。 */
export function isTimeLocator(name) {
  const text = String(name ?? '').normalize('NFKC').replace(/\s+/g, '')
  const number = '[零一二两三四五六七八九十百半0-9]+'
  const anchor = '(?:刚刚|刚才|不久前|前几天|最近|近期|大前天|前天|昨天|今天|明天|后天|上上周|上周|本周|这周|下周|上个月|本月|这个月|下个月|去年|今年|明年)'
  const rolling = `(?:(?:最近|过去|近)${number}个?(?:分钟|小时|天|日|周|星期|月|年)|${number}个?(?:天|周|星期|月|年)前)`
  const suffix = '(?:(?:星期|周)?[一二三四五六日天])?(?:凌晨|早上|上午|中午|下午|晚上|夜里)?(?:[零一二两三四五六七八九十0-9]+(?:点|时)(?:[零一二两三四五六七八九十0-9]+分?)?)?(?:左右|前后|大约)?'
  return new RegExp(`^(?:${anchor}|${rolling})${suffix}(?:(?:到|至|~|—)(?:${anchor}|${rolling})${suffix})?$`).test(text)
}

export const TIME_TEMPLATES = Object.freeze({
  刚刚: [0, DAY / 2], 刚才: [0, DAY / 2],
  不久前: [0, DAY], 前几天: [2 * DAY, 7 * DAY], 最近: [0, 7 * DAY], 近期: [0, 7 * DAY],
})
const numberOf = text => {
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '半') return 0.5
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (text === '十') return 10
  if (text.includes('十')) { const [a, b] = text.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0) }
  return digits[text]
}
const partsAt = (at, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(at).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]))
const utcOf = p => Date.UTC(p.year, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0, p.second ?? 0)
function localInstant(p, zone) {
  const target = utcOf(p)
  let value = target
  for (let i = 0; i < 5; i++) {
    const next = value + target - utcOf(partsAt(value, zone))
    if (next === value) return value
    value = next
  }
  return value
}
function calendar(p, changes, zone) {
  const date = new Date(Date.UTC(p.year, p.month - 1 + (changes.months ?? 0), p.day + (changes.days ?? 0)))
  return localInstant({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: changes.hour ?? 0, minute: changes.minute ?? 0, second: changes.second ?? 0 }, zone)
}
function widen(range) {
  if (range.end - range.start >= 4 * MINUTE) return range
  const middle = (range.start + range.end) / 2
  return { ...range, start: middle - 2 * MINUTE, end: middle + 2 * MINUTE }
}

/** 范性／确性响应均有平台核心；每侧严格有限支持，基础亮度最大2。 */
export function timeMatch(at, range, now) {
  if (!Number.isFinite(at) || at > now) return 0
  const width = (range.end - range.start) * (range.response === 'broad' ? 0.2 : 0.05)
  const distance = Math.max(range.start - at, at - range.end, 0)
  if (distance === 0) return 1
  if (!(width > 0) || distance >= width) return 0
  const x = distance / width
  return 1 - 3 * x * x + 2 * x * x * x
}

/** 词表识别、组合、局部语境过滤。未支持或缺少锚点的表达不猜测。自然周从周日开始。 */
export function parseTimeRanges(text, { now = Date.now(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const source = String(text ?? '').normalize('NFKC')
  const today = partsAt(now, timeZone)
  const ranges = []
  const diagnostics = []
  const occupied = []
  const add = (match, start, end, kind = 'exact') => {
    if (occupied.some(([a, b]) => match.index < b && match.index + match[0].length > a)) return
    occupied.push([match.index, match.index + match[0].length])
    ranges.push({ start, end, response: kind, at: match.index, length: match[0].length, text: match[0] })
  }
  // 样例和代码块没有历史定位语义；保留字符长度，使位置不偏移。
  const scanned = source.replace(/```[\s\S]*?```|`[^`]*`/g, s => ' '.repeat(s.length))
  const dayStart = offset => calendar(today, { days: offset }, timeZone)
  // 明确日期（日期合法性须回读校验，不能把2月30日滚成3月）。
  for (const m of scanned.matchAll(/(?:(\d{4})年|(?:(\d{4})[-/]))?(\d{1,2})(?:月|[-/])(\d{1,2})(?:日|号)?/g)) {
    const year = Number(m[1] ?? m[2] ?? today.year), month = Number(m[3]), day = Number(m[4])
    const at = localInstant({ year, month, day }, timeZone), check = partsAt(at, timeZone)
    if (check.year !== year || check.month !== month || check.day !== day) { diagnostics.push({ text: m[0], state: 'unresolved' }); continue }
    add(m, at, calendar({ year, month, day }, { days: 1 }, timeZone))
  }
  // 月／年锚点单独识别；完整日期已占有的文字不再重复建范围。
  for (const m of scanned.matchAll(/(\d{4})年(?:(\d{1,2})月)?/g)) {
    const year = Number(m[1]), month = Number(m[2] ?? 1)
    if (month < 1 || month > 12) continue
    // 无效完整日期不能退化成同月的宽范围。
    if (/^\d{1,2}(日|号)/.test(scanned.slice(m.index + m[0].length))) continue
    add(m, localInstant({ year, month, day: 1 }, timeZone), m[2]
      ? calendar({ year, month, day: 1 }, { months: 1 }, timeZone)
      : localInstant({ year: year + 1, month: 1, day: 1 }, timeZone))
  }
  const num = '[0-9零一二两三四五六七八九十半]+'
  const rolling = new RegExp(`(?:最近|过去|近)(${num})(?:个)?(分钟|小时|天|日|周|星期|个月|月|年)`, 'g')
  for (const m of scanned.matchAll(rolling)) {
    const n = numberOf(m[1]); if (!(n > 0 && n <= 3650)) continue
    const unit = m[2]
    const duration = n * ({ 分钟: MINUTE, 小时: 60 * MINUTE, 天: DAY, 日: DAY, 周: 7 * DAY, 星期: 7 * DAY }[unit] ?? 0)
    const start = duration ? now - duration : calendar(today, { months: -n * (unit === '年' ? 12 : 1), hour: today.hour, minute: today.minute, second: today.second }, timeZone)
    add(m, start, now)
  }
  for (const m of scanned.matchAll(new RegExp(`(${num})(?:个)?(天|周|星期|月|年)前`, 'g'))) {
    const n = numberOf(m[1]); if (!(n >= 0 && n <= 3650 && Number.isInteger(n))) continue
    if (m[2] === '天') add(m, dayStart(-n), dayStart(1 - n))
    else if (['周', '星期'].includes(m[2])) add(m, dayStart(-7 * n), dayStart(-7 * n + 7))
    else {
      const months = -n * (m[2] === '年' ? 12 : 1)
      add(m, calendar({ ...today, day: 1 }, { months }, timeZone), calendar({ ...today, day: 1 }, { months: months + (m[2] === '年' ? 12 : 1) }, timeZone))
    }
  }
  for (const m of scanned.matchAll(/大前天|前天|昨天|今天|上上周|上周|本周|这周|上个月|本月|这个月|去年|今年/g)) {
    const word = m[0]
    if (['大前天', '前天', '昨天', '今天'].includes(word)) {
      const d = { 大前天: -3, 前天: -2, 昨天: -1, 今天: 0 }[word]
      add(m, dayStart(d), dayStart(d + 1))
    } else if (word.includes('周')) {
      const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
      const d = -weekday - (word === '上上周' ? 14 : word === '上周' ? 7 : 0)
      add(m, dayStart(d), dayStart(d + 7))
    } else if (word.includes('月')) {
      const n = word === '上个月' ? -1 : 0
      add(m, calendar({ ...today, day: 1 }, { months: n }, timeZone), calendar({ ...today, day: 1 }, { months: n + 1 }, timeZone))
    } else {
      const year = today.year - (word === '去年' ? 1 : 0)
      add(m, localInstant({ year, month: 1, day: 1 }, timeZone), localInstant({ year: year + 1, month: 1, day: 1 }, timeZone))
    }
  }
  for (const m of scanned.matchAll(/刚刚|刚才|不久前|前几天|最近|近期/g)) {
    const [young, old] = TIME_TEMPLATES[m[0]]
    add(m, now - old, now - young, 'broad')
  }
  // 将紧邻的星期、日内时段、时钟以及“左右”合成到已有范围，避免重复亮度。
  for (const range of ranges) {
    let tail = scanned.slice(range.at + range.length)
    const weekday = /^(?:星期|周)?([一二三四五六日天])/.exec(tail)
    if (weekday && /周$/.test(range.text)) {
      const d = '日一二三四五六'.indexOf(weekday[1] === '天' ? '日' : weekday[1])
      const date = partsAt(range.start, timeZone)
      range.start = calendar(date, { days: d }, timeZone); range.end = calendar(date, { days: d + 1 }, timeZone)
      range.length += weekday[0].length; tail = tail.slice(weekday[0].length)
    }
    const period = /^(凌晨|早上|上午|中午|下午|晚上|夜里)/.exec(tail)
    const hours = { 凌晨: [0, 6], 早上: [6, 9], 上午: [6, 12], 中午: [11, 14], 下午: [12, 18], 晚上: [18, 24], 夜里: [18, 24] }
    const date = partsAt(range.start, timeZone)
    if (period) {
      const [lo, hi] = hours[period[1]]
      range.start = calendar(date, { hour: lo }, timeZone)
      range.end = hi === 24 ? calendar(date, { days: 1 }, timeZone) : calendar(date, { hour: hi }, timeZone)
      range.length += period[0].length; tail = tail.slice(period[0].length)
    }
    const clock = /^(\d{1,2}|[一二两三四五六七八九十]+)(?::|点|时)(?:(\d{1,2})分?)?(?::(\d{1,2})(?:\.(\d{1,3}))?秒?)?/.exec(tail)
    if (clock) {
      let h = numberOf(clock[1]); const min = Number(clock[2] ?? 0), sec = Number(clock[3] ?? 0)
      if (period && ['下午', '晚上', '夜里'].includes(period[1]) && h < 12) h += 12
      if (h < 24 && min < 60 && sec < 60) {
        range.start = calendar(date, { hour: h, minute: min, second: sec }, timeZone) + Number((clock[4] ?? '').padEnd(3, '0'))
        range.end = range.start + (clock[3] ? (clock[4] ? 1 : 1000) : clock[2] ? MINUTE : 60 * MINUTE)
        range.length += clock[0].length; tail = tail.slice(clock[0].length)
      } else { range.invalid = true; diagnostics.push({ text: clock[0], state: 'unresolved' }) }
    }
    if (/^(左右|前后|大约)/.test(tail)) { const modifier = /^(左右|前后|大约)/.exec(tail)[0]; range.response = 'broad'; range.length += modifier.length }
    Object.assign(range, widen(range))
    range.text = source.slice(range.at, range.at + range.length)
  }
  ranges.sort((a, b) => a.at - b.at)
  // “上周到昨天”构成一个范围；并列仍独立匹配取最大。
  for (let i = 1; i < ranges.length; i++) {
    const left = ranges[i - 1], right = ranges[i]
    if (/^\s*(到|至|—|~|～)\s*$/.test(source.slice(left.at + left.length, right.at))) {
      left.end = right.end; left.length = right.at + right.length - left.at
      left.text = source.slice(left.at, left.at + left.length)
      if (right.response === 'broad') left.response = right.response
      ranges.splice(i--, 1)
    }
  }
  const active = [], excluded = []
  for (const range of ranges) {
    const before = source.slice(Math.max(0, range.at - 18), range.at)
    const after = source.slice(range.at + range.length, range.at + range.length + 22)
    const clause = source.slice(Math.max(source.lastIndexOf('。', range.at - 1), source.lastIndexOf('\n', range.at - 1), source.lastIndexOf('；', range.at - 1)) + 1).split(/[。\n；]/)[0]
    let reason = null
    if (/(?:这个词|这个字|一词|词语|词表|时间星|时星|溢出|匹配曲线|设成|设置为|定义为|例如|譬如)/.test(clause)) reason = 'metalinguistic'
    else if (/(?:如果|假如|假设|要是)[^，。！？]*$/.test(before) && !/(实际|究竟|到底|真的).*(做|发生|说)/.test(after)) reason = 'hypothetical'
    else if (/(?:昨天说的|那天说的)\s*$/.test(before)) reason = 'unresolved-anchor'
    else if (/(?:不是|别找|不要找|不查|除了)\s*[“"「『]?\s*$/.test(before)) { reason = 'negative-selection'; excluded.push(range) }
    if (range.invalid) continue
    if (reason) diagnostics.push({ text: range.text, state: reason === 'unresolved-anchor' ? 'unresolved' : 'excluded', reason })
    else if (range.end <= range.start) diagnostics.push({ text: range.text, state: 'unresolved', reason: 'reversed-range' })
    else active.push(range)
  }
  return { ranges: active, excluded, diagnostics, now, timeZone }
}

/** 时星表是片段时间的查询时视图，不写入文星表或语星线。 */
export function matchTimeStars({ text, records, now = Date.now(), timeZone }) {
  const parsed = parseTimeRanges(text, { now, timeZone })
  const out = new Map()
  for (const record of records ?? []) {
    const at = Number(record.at)
    if (record.at == null || !Number.isFinite(at) || parsed.excluded.some(r => at >= r.start && at < r.end)) continue
    let score = 0, position = -1, kind = 'exact', recentFactor = 2
    for (const range of parsed.ranges) {
      const brightness = 2 * timeMatch(at, range, now)
      if (!(brightness > 0)) continue
      if (brightness > score) { score = brightness; kind = range.response; recentFactor = 1.75 + 0.5 * Math.max(0, Math.min(1, (at - range.start) / (range.end - range.start))) }
      position = Math.max(position, range.at)
    }
    if (!(score > 0)) continue
    const key = `${record.session}#${record.turn}`, id = `time:${key}`
    out.set(id, { id, name: new Date(at).toISOString(), kind: 'time', response: kind, recentFactor, type: 'time', score, at: position, key })
  }
  return out
}
