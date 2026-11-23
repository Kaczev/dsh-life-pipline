import test from 'node:test';
import assert from 'node:assert/strict';
import { createComponentManager } from '../components/dsh-life-core/src/components.mjs';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';

test('aggregate component control enables prerequisites first and disables dependents first', async () => {
 const retired = ['dsh-lpipe-starmap', 'dsh-lpipe-recall'];
 const rows = [CORE,...COMPONENTS,...retired].map(name=>({moduleName:name,entryId:name,enabled:retired.includes(name)}));
 const calls=[];
 const manager={async listPlugins(){return rows.map(r=>({...r}));},async setPluginEnabled(id,enabled){calls.push([id,enabled]);rows.find(r=>r.entryId===id).enabled=enabled;return {application:'applied'};}};
 const handle=createComponentManager(manager);
 const {value} = await handle('pipeline.components');
 assert.deepEqual(value.map(row => row.name), [CORE,...COMPONENTS]);
 await handle('pipeline.components.set',{name:'dsh-lpipe-memory',enabled:true});
 assert.deepEqual(calls,[[CORE,true],['dsh-lpipe-memory',true]]);
 calls.length=0;
 await handle('pipeline.components.set',{name:CORE,enabled:false});
 assert.deepEqual(calls,[['dsh-lpipe-memory',false],[CORE,false]]);
 for (const name of [...retired, 'arbitrary']) {
   await assert.rejects(handle('pipeline.components.set',{name,enabled:false}),/无效/);
 }
 assert.ok(rows.filter(row => retired.includes(row.moduleName)).every(row => row.enabled));
});

test('component controls report non-applied results instead of displaying success', async()=>{
 const handle=createComponentManager({async listPlugins(){return [{moduleName:CORE,entryId:CORE,enabled:false}];},async setPluginEnabled(){return {application:'restart-required',target:CORE};}});
 await assert.rejects(handle('pipeline.components.set',{name:CORE,enabled:true}),/restart-required/);
});
