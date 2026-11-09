import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineRpcHandler } from '../src/rpc.mjs';

test('empty LP session creates only in an existing workspace and binds without prompting', async () => {
  let config = {mainSessionId:'old',unknown:42}, count=0, fail=true, createdId;
  const w={id:'w',title:'Work',path:'C:/Work',status:async()=> 'ok'};
  const handle=createPipelineRpcHandler({getConfig:()=>config,update:f=>{if(fail)throw Error('disk');config=f(config);},
    workspaces:{list:()=>[w],get:id=>id==='w'?w:undefined},
    renameSession: async request=>assert.deepEqual(request,{sessionId:createdId,title:'LP 主会话'}),
    createSession:async request=>{assert.equal(request.workspaceId,'w');assert.match(request.sessionId,/^session-[\da-f-]{36}$/);createdId=request.sessionId;count++;return{sessionId:createdId};}});
  assert.equal((await handle('pipeline.workspaces')).value[0].path,'C:/Work');
  assert.equal((await handle('pipeline.session.create',{workspaceId:'missing',requestId:'request-1'})).ok,false);
  const request={workspaceId:'w',requestId:'request-1'};
  const first=await handle('pipeline.session.create',request);
  assert.equal(first.value.bound,false);assert.equal(config.mainSessionId,'old');
  fail=false;
  const replies=await Promise.all([handle('pipeline.session.create',request),handle('pipeline.session.create',request)]);
  assert.equal(count,1);assert.equal(config.mainSessionId,createdId);assert.equal(config.unknown,42);
  assert.ok(replies.every(r=>r.value.bound));
  assert.equal(config.lastWorkspaceId,'w');
  assert.equal((await handle('pipeline.status')).value.lastWorkspaceId,'w');
  assert.equal((await handle('pipeline.session.create',{...request,workspaceId:'other'})).ok,false);
});

test('only explicit LP creation names its owned session; ordinary sessions remain untouched', async () => {
  let config = { mainSessionId: 'ordinary' };
  const titles = new Map([['ordinary', 'Ordinary conversation']]);
  const created = [];
  const renamed = [];
  const createSession = async request => {
    const sessionId = request.sessionId ?? 'ordinary-new';
    created.push(sessionId);
    titles.set(sessionId, null);
    return { sessionId };
  };
  const handle = createPipelineRpcHandler({ getConfig: () => config,
    update: f => { config = f(config); },
    workspaces: { list: () => [], get: () => ({ status: async () => 'ok' }) },
    createSession, renameSession: async ({ sessionId, title }) => { renamed.push(sessionId); titles.set(sessionId, title); } });
  for (const method of ['pipeline.status', 'pipeline.workspaces', 'pipeline.session.title']) await handle(method, { sessionId: 'ordinary' });
  await handle('pipeline.config.save', { mainSessionId: 'ordinary' });
  await createSession({ workspaceId: 'w' }); // DSH's normal new-conversation path.
  assert.deepEqual(renamed, []);
  assert.equal(titles.get('ordinary-new'), null);
  const reply = await handle('pipeline.session.create', { workspaceId: 'w', requestId: 'explicit-button' });
  assert.equal(reply.value.bound, true);
  assert.deepEqual(renamed, [reply.value.sessionId]);
  assert.notEqual(reply.value.sessionId, 'ordinary-new');
  assert.equal(titles.get(reply.value.sessionId), 'LP 主会话');
  assert.equal(titles.get('ordinary'), 'Ordinary conversation');
  assert.equal(titles.get('ordinary-new'), null);
  assert.equal(created.length, 2);
});

test('unexpected creation identity never renames or binds an ordinary session', async () => {
  let writes = 0, renames = 0;
  const handle = createPipelineRpcHandler({ getConfig: () => ({ mainSessionId: 'old' }),
    update: () => { writes++; }, workspaces: { get: () => ({ status: async () => 'ok' }) },
    createSession: async () => ({ sessionId: 'ordinary' }), renameSession: async () => { renames++; } });
  const request = { workspaceId: 'w', requestId: 'wrong-identity' };
  for (let i = 0; i < 2; i++) assert.equal((await handle('pipeline.session.create', request)).error.code, 'pipeline/session-mismatch');
  assert.equal(writes, 0);
  assert.equal(renames, 0);
});

test('workspace selection saves immediately without changing main session and rejects missing IDs atomically', async () => {
  let config = { mainSessionId: 'main', unknown: 42 };
  const handle = createPipelineRpcHandler({ getConfig: () => config,
    update: change => { config = change(config); }, workspaces: { get: id => id === 'w' ? {} : undefined } });
  assert.equal((await handle('pipeline.config.save', { lastWorkspaceId: 'w' })).value.lastWorkspaceId, 'w');
  assert.deepEqual(config, { mainSessionId: 'main', unknown: 42, lastWorkspaceId: 'w' });
  for (const lastWorkspaceId of ['missing', null, 7]) {
    assert.equal((await handle('pipeline.config.save', { mainSessionId: 'other', lastWorkspaceId })).ok, false);
    assert.equal(config.mainSessionId, 'main'); assert.equal(config.lastWorkspaceId, 'w');
  }
  const reopened = createPipelineRpcHandler({ getConfig: () => config, update: change => { config = change(config); }, workspaces: { get: () => ({}) } });
  assert.equal((await reopened('pipeline.status')).value.lastWorkspaceId, 'w');
  assert.equal((await handle('pipeline.config.save', { lastWorkspaceId: '' })).value.lastWorkspaceId, '');
  assert.equal(config.mainSessionId, 'main');
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
