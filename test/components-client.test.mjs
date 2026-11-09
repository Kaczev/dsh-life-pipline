import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const module={exports:{}};
vm.runInNewContext(readFileSync(new URL('../client/panel.js',import.meta.url),'utf8'),{require:()=>({createElement(){}}),module});
const {createController}=module.exports.__test__;
const rows=()=>[{name:'core',enabled:false,prerequisites:[]},{name:'child',enabled:false,prerequisites:['core']}];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('switches respond before RPC and serialize rapid opposite intents',async()=>{
 let resolveFirst;const calls=[],states=[];
 const controller=createController(async(method,input)=>{
  if(method==='pipeline.components')return {ok:true,value:rows()};
  calls.push({...input});
  if(calls.length===1)await new Promise(resolve=>{resolveFirst=resolve;});
  return {ok:true,value:rows().map(row=>({...row,enabled:input.enabled}))};
 },(value,pending)=>states.push({value,pending}),()=>{});
 await controller.load();controller.toggle('child');
 assert.equal(states.at(-1).value.every(row=>row.enabled),true);
 controller.toggle('child');
 assert.equal(states.at(-1).value.find(row=>row.name==='child').enabled,false);
 assert.equal(calls.length,1);
 resolveFirst();await tick();
 assert.deepEqual(calls.map(row=>row.enabled),[true,false]);
 assert.equal(states.at(-1).pending,false);
 assert.equal(states.at(-1).value.find(row=>row.name==='child').enabled,false);
});
test('failed intent reads actual state and reports error',async()=>{
 const states=[],errors=[];
 const controller=createController(async method=>method==='pipeline.components'?{ok:true,value:rows()}:{ok:false,error:{message:'failed'}},value=>states.push(value),e=>errors.push(e));
 await controller.load();controller.toggle('child');await tick();
 assert.equal(states.at(-1).every(row=>!row.enabled),true);assert.deepEqual(errors,['failed']);
});
