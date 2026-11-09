import test from 'node:test';
import assert from 'node:assert/strict';
import { createComponentManager } from '../components/dsh-life-core/src/components.mjs';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';

test('aggregate component control enables prerequisites first and disables dependents first', async () => {
 const rows = [CORE,...COMPONENTS].map(name=>({moduleName:name,entryId:name,enabled:false}));
 const calls=[];
 const manager={async listPlugins(){return rows.map(r=>({...r}));},async setPluginEnabled(id,enabled){calls.push([id,enabled]);rows.find(r=>r.entryId===id).enabled=enabled;return {application:'applied'};}};
 const handle=createComponentManager(manager);
 await handle('pipeline.components.set',{name:'dsh-lpipe-recall',enabled:true});
 assert.deepEqual(calls.map(x=>x[0]),[CORE,'dsh-lpipe-memory','dsh-lpipe-starmap','dsh-lpipe-recall']);
 calls.length=0;
 await handle('pipeline.components.set',{name:'dsh-lpipe-memory',enabled:false});
 assert.deepEqual(calls.map(x=>x[0]),['dsh-lpipe-recall','dsh-lpipe-starmap','dsh-lpipe-memory']);
 await assert.rejects(handle('pipeline.components.set',{name:'arbitrary',enabled:true}),/无效/);
});

test('component controls report non-applied results instead of displaying success', async()=>{
 const handle=createComponentManager({async listPlugins(){return [{moduleName:CORE,entryId:CORE,enabled:false}];},async setPluginEnabled(){return {application:'restart-required',target:CORE};}});
 await assert.rejects(handle('pipeline.components.set',{name:CORE,enabled:true}),/restart-required/);
});
