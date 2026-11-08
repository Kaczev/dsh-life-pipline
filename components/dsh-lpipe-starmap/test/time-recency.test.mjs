import test from 'node:test'
import assert from 'node:assert/strict'
import { matchTimeStars } from '../src/time.mjs'
test('时间范围近期系数1.75到2.25，基础亮度及边缘衰减不变', () => {
 const now=Date.parse('2026-11-08T12:00:00+08:00'), start=now-12*3600000
 const records=[start,start+6*3600000,now,start-3600000].map((at,i)=>({session:'s',turn:i+1,at}))
 const hits=matchTimeStars({text:'刚刚做了什么',records,now,timeZone:'Asia/Shanghai'})
 assert.equal(hits.get('time:s#1').recentFactor,1.75)
 assert.equal(hits.get('time:s#2').recentFactor,2)
 assert.equal(hits.get('time:s#3').recentFactor,2.25)
 assert.equal(hits.get('time:s#2').score,2)
 assert.ok(hits.get('time:s#4').score<2)
 assert.equal(hits.get('time:s#4').recentFactor,1.75)
})
