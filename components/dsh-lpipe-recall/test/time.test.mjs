import assert from 'node:assert/strict'
import test from 'node:test'
import { matchStars } from '../../dsh-lpipe-starmap/src/match.mjs'
import { environmentFlicker } from '../src/match.mjs'
import { candidatesOf, coolTurns } from '../src/candidates.mjs'
import { rankFragments } from '../src/environment.mjs'
import { keysInSession } from '../src/index.js'
const now=Date.parse('2026-11-08T12:00:00+08:00')
const records=[1,2,3].map(turn=>({session:'archive',turn,at:now-86400000}))
const repo={turns:new Map(records.map(r=>[`archive#${r.turn}`,r])),byStar:new Map()}
test('纯时间准入、背景时星剔除且文星预算为零，时间冷却豁免不绕过原文排除',()=>{
 const ahead=matchStars({text:'昨天',stars:[],records,now,timeZone:'Asia/Shanghai'})
 const behind=new Map([...ahead,['background',{id:'background',type:'text',name:'东西',kind:'exact',score:10,at:2}]])
 const env=environmentFlicker(ahead,behind,{foregroundLength:2,backgroundLength:3})
 assert.equal(env.foregroundSum,0)
 assert.equal(env.flicker.has('background'),false)
 assert.equal([...env.background.values()].some(hit=>hit.type==='time'),false)
 const hard=coolTurns({rows:[{session:'archive',turn:3,text:'当前原文'}],coolChars:100})
 const present=new Set(['archive#1','archive#2'])
 const mt=new Set([...ahead.values()].map(hit=>hit.key))
 for(const key of present)if(!mt.has(key))hard.add(key)
 const candidates=candidatesOf({repo,flicker:env.flicker,foreground:new Set(ahead.keys()),excluded:hard,limit:Infinity})
 assert.deepEqual(candidates.map(c=>c.turn),[1,2])
 assert.equal(candidates[0].timeStrength,6)
 const reader={rows:()=>records.map(r=>({...r,kind:'user/message',text:`第${r.turn}段的真实经历。`}))}
 const out=rankFragments({candidates,query:'昨天',repo,reader,flicker:env.flicker,config:{recentDays:30,fragments:2,sentencesPerFragment:2},now})
 assert.equal(out.length,2)
 for(const c of out){assert.equal(c.unmaskedStrength,12);assert.ok(c.excerpt.lines.length>0)}
})
test('回忆结果K按可见正文字符窗口有界，原文R仍独立计算',()=>{
 const recall={seq:1,type:'user/message',data:{source:{kind:'dsh-lpipe-recall'},content:[{text:'lpipe_recall_id[archive:1]'}]}}
 const session={snapshotEvents:()=>[recall,{seq:2,type:'assistant/message',data:{message:{content:[{text:'x'.repeat(100)}]}}}],surface:{nodes:[1,2]}}
 assert.equal(keysInSession(session,100).size,0)
 assert.deepEqual([...keysInSession(session,101)],['archive#1'])
})
