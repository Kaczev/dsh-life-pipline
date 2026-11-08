import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineRpcHandler } from '../src/rpc.mjs';

test('empty LP session creates only in an existing workspace and binds without prompting', async () => {
  let config = {mainSessionId:'old',unknown:42}, count=0, fail=true;
  const w={id:'w',title:'Work',path:'C:/Work',status:async()=> 'ok'};
  const handle=createPipelineRpcHandler({getConfig:()=>config,update:f=>{if(fail)throw Error('disk');config=f(config);},
    workspaces:{list:()=>[w],get:id=>id==='w'?w:undefined},
    renameSession: async request=>assert.deepEqual(request,{sessionId:'new',title:'LP 主会话'}),
    createSession:async request=>{assert.deepEqual(request,{workspaceId:'w'});count++;return{sessionId:'new'};}});
  assert.equal((await handle('pipeline.workspaces')).value[0].path,'C:/Work');
  assert.equal((await handle('pipeline.session.create',{workspaceId:'missing',requestId:'request-1'})).ok,false);
  const request={workspaceId:'w',requestId:'request-1'};
  const first=await handle('pipeline.session.create',request);
  assert.equal(first.value.bound,false);assert.equal(config.mainSessionId,'old');
  fail=false;
  const replies=await Promise.all([handle('pipeline.session.create',request),handle('pipeline.session.create',request)]);
  assert.equal(count,1);assert.equal(config.mainSessionId,'new');assert.equal(config.unknown,42);
  assert.ok(replies.every(r=>r.value.bound));
  assert.equal(config.lastWorkspaceId,'w');
  assert.equal((await handle('pipeline.status')).value.lastWorkspaceId,'w');
  assert.equal((await handle('pipeline.session.create',{...request,workspaceId:'other'})).ok,false);
});

test('removed workspace clears remembered choice without changing main session', async () => {
  let config = { mainSessionId: 'main', lastWorkspaceId: 'removed', unknown: 42 };
  const handle = createPipelineRpcHandler({ getConfig: () => config,
    update: change => { config = change(config); }, workspaces: { get: () => undefined } });
  assert.equal((await handle('pipeline.status')).value.lastWorkspaceId, '');
  assert.deepEqual(config, { mainSessionId: 'main', lastWorkspaceId: '', unknown: 42 });
});

test('concurrent fresh requests share creation; unknown failures never blindly retry creation',async()=>{
  let count=0;
  const handle=createPipelineRpcHandler({getConfig:()=>({}),update:()=>{},workspaces:{get:()=>({status:async()=> 'ok'})},
    createSession:async()=>{count++;throw Error('lost response');}});
  const req={workspaceId:'w',requestId:'request-x'};
  const results=await Promise.all([handle('pipeline.session.create',req),handle('pipeline.session.create',req)]);
  assert.equal(count,1);assert.ok(results.every(r=>!r.ok));
  await handle('pipeline.session.create',req);assert.equal(count,1);
});
