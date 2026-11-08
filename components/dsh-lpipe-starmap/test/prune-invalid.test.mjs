import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pruneInvalidStars } from '../scripts/prune-invalid-stars.mjs'

test('确定性旧星清理保留模糊星、机制概念、坐标和水位，备份完整且幂等', t => {
  const root = mkdtempSync(join(tmpdir(), '过滤旧星 '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'sources', 's'), { recursive: true })
  const stars = [{ id:'old',name:'刚刚',kind:'exact' },{ id:'common',name:'上周',kind:'common' },{ id:'f',name:'20:44',kind:'fuzzy' },{ id:'valid',name:'时间模板',kind:'exact' }]
  const original = stars.map(JSON.stringify).join('\n')+'\n'
  writeFileSync(join(root,'stars.jsonl'),original)
  const file = join(root,'sources','s','day.jsonl')
  const record = {session:'s',turn:2,from:3,to:9,at:10,lines:[{seq:4,row:1,clock:1244,stars:['old','common','f','valid']}],pairs:[['old','valid'],['common','valid'],['f','valid']]}
  writeFileSync(file,JSON.stringify(record)+'\n')
  writeFileSync(join(root,'state.json'),'{"rules":12,"built":{"s":{"turn":2,"to":9}}}')
  assert.equal(pruneInvalidStars(root).removed.length,2)
  assert.equal(readFileSync(join(root,'stars.jsonl'),'utf8'),original)
  const result=pruneInvalidStars(root,{apply:true})
  assert.equal(readFileSync(join(result.backup,'stars.jsonl'),'utf8'),original)
  const after=JSON.parse(readFileSync(file,'utf8'))
  assert.deepEqual(after,{...record,lines:[{...record.lines[0],stars:['f','valid']}],pairs:[['f','valid']]})
  assert.equal(readFileSync(join(root,'state.json'),'utf8'),'{"rules":12,"built":{"s":{"turn":2,"to":9}}}')
  assert.equal(pruneInvalidStars(root).changedFiles,0)
})
