import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTimeRanges, timeMatch, matchTimeStars } from '../src/time.mjs'
const now = Date.parse('2026-11-08T12:00:00+08:00')
const options = { now, timeZone: 'Asia/Shanghai' }
const parse = text => parseTimeRanges(text, options)
const iso = value => new Date(value).toISOString()
test('自然日/周日周界、组合时段、滚动时间与模板', () => {
 assert.equal(iso(parse('昨天').ranges[0].start), '2026-11-06T16:00:00.000Z')
 assert.equal(iso(parse('上周').ranges[0].start), '2026-10-31T16:00:00.000Z')
 assert.equal(iso(parse('上周').ranges[0].end), '2026-11-07T16:00:00.000Z')
 assert.equal(iso(parse('上周三晚上').ranges[0].start), '2026-11-04T10:00:00.000Z')
 assert.equal(parse('过去两小时').ranges[0].start, now - 7200000)
 for (const word of ['刚刚', '刚才']) {
  const range = parse(word).ranges[0]
  assert.equal(range.start, now - 12 * 3600000)
  assert.equal(range.end, now)
  assert.equal(range.response, 'broad')
  const hits = matchTimeStars({text: word, records: [{session:'a',turn:1,at:now-30*60000}], ...options})
  assert.equal([...hits.values()][0].score, 2)
 }
 assert.equal(parse('前几天').ranges[0].end, now - 2 * 86400000)
 assert.equal(parse('昨天和前天').ranges.length, 2)
 assert.equal(parse('上周到昨天').ranges.length, 1)
 assert.equal(parse('2026年2月30日').ranges.length, 0)
})
test('精细时钟补足总宽4分钟；响应方法不改变时间星种类', () => {
 const range = parse('昨天15:30:20.123').ranges[0]
 assert.equal(range.end - range.start, 240000)
 const hits = matchTimeStars({ text: '昨天', records: [{session:'a',turn:1,at:now-86400000}], ...options })
 assert.equal([...hits.values()][0].kind, 'time')
 assert.equal([...hits.values()][0].response, 'exact')
})
test('5%和20%严格有限支持、平滑中点、未来不匹配', () => {
 for (const [response, fraction] of [['exact', .05], ['broad', .2]]) {
  const r = {start: 0,end:100000,response}
  assert.equal(timeMatch(50000,r,200000),1)
  assert.ok(Math.abs(timeMatch(100000+100000*fraction/2,r,200000)-.5)<1e-10)
  assert.equal(timeMatch(100000+100000*fraction,r,200000),0)
  assert.equal(timeMatch(-100000*fraction,r,200000),0)
  assert.equal(timeMatch(50000,r,1000),0)
 }
})
test('语境：元语言/代码/否定/假设/指代，与正常否定区分', () => {
 for (const text of ['“昨天”这个词是什么意思', '时间星响应上周', '把最近设成七天', '如果昨天做了X', '那天', '上次', '`昨天`']) assert.equal(parse(text).ranges.length,0,text)
 for (const text of ['昨天没做完的事', '我不记得昨天做了什么', '你昨天说“别急”，发生了什么']) assert.equal(parse(text).ranges.length,1,text)
 const corrected = parse('不是昨天，是前天')
 assert.equal(corrected.ranges.length,1)
 assert.equal(corrected.excluded.length,1)
 const excluded = matchTimeStars({ text:'除了昨天，最近做了什么',records:[{session:'a',turn:1,at:now-86400000}],...options })
 assert.equal(excluded.size,0)
})
test('时星按片段唯一，最大亮度2，重复表达不累加；DST自然日按当地边界', () => {
 const records=[{session:'a',turn:1,at:now-86400000},{session:'b',turn:1,at:now-86400000}]
 const hits=matchTimeStars({text:'昨天和昨天',records,...options})
 assert.equal(hits.size,2)
 for(const hit of hits.values()) assert.equal(hit.score,2)
 const r=parseTimeRanges('昨天',{now:Date.parse('2026-11-02T12:00:00-05:00'),timeZone:'America/New_York'}).ranges[0]
 assert.equal(r.end-r.start,25*3600000)
})

test('年月、无效时钟、范围连接与范围内时段',()=>{
 assert.equal(parse('2025年').ranges[0].end-parse('2025年').ranges[0].start,365*86400000)
 assert.equal(iso(parse('2026年10月').ranges[0].start),'2026-09-30T16:00:00.000Z')
 assert.equal(parse('昨天25:88').ranges.length,0)
 assert.equal(parse('那天上午').ranges.length,0)
 assert.equal(parse('明天晚上').ranges.length,0)
 const range=parse('昨天到前天')
 assert.equal(range.ranges.length,0)
})
