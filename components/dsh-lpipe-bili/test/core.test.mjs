import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BiliApi,videoId,signWbi} from '../src/api.mjs';
import {retentionDays,cleanupDownloads} from '../src/storage.mjs';
import {createTools,renderResult} from '../src/tools.mjs';
import {createLogin} from '../src/login.mjs';
import {registerRpc} from '../src/rpc.mjs';
import {run} from '../src/watch.mjs';
test('cancelled child is closed before rejecting',async()=>{const controller=new AbortController();const promise=run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});controller.abort();await assert.rejects(promise,/取消/);});
test('subtitle track cannot redirect credentials to another domain',async()=>{const api=new BiliApi({gap:0});api.video=async()=>({bvid:'BV1xx411c7mD',parts:[{part:1,cid:1}]});api.wbi=async()=>({subtitle:{subtitles:[{lan:'zh-CN',subtitle_url:'https://evil.com/subtitle'}]}});await assert.rejects(api.subtitles({video:'BV1xx411c7mD'}),/域名/);});
const response=d=>new Response(JSON.stringify({code:0,data:d}));
test('uploader handles length and missing fields as lossless JSON',async()=>{
  const api=new BiliApi({gap:0});
  const requests=[];
  api.wbi=async(path,params)=>{requests.push({path,params});return {list:{vlist:[{bvid:'BV1xx411c7mD',title:'投稿',author:'UP',mid:123,length:'12:20'},{title:'缺失字段'}]},page:{count:41}};};
  const result=await api.uploader({mid:'123',page:2});
  assert.deepEqual(result,JSON.parse(JSON.stringify(result)));
  assert.equal(result.items[0].duration,'12:20');
  assert.deepEqual(result.items[1],{bvid:null,title:'缺失字段',uploader:'',mid:null,duration:null,views:null,url:null});
  assert.equal(result.page,2);assert.equal(result.nextPage,3);
  assert.deepEqual(requests,[{path:'/x/space/wbi/arc/search',params:{mid:'123',pn:2,ps:20,order:'pubdate'}}]);
  assert.equal((await api.uploader({mid:'123',page:3})).nextPage,null);
});
test('comments treat absent and zero roots as top-level, preserving reply IDs',async()=>{
  const api=new BiliApi({gap:0}),requests=[];
  api.video=async()=>({aid:123});
  api.request=async(path,params)=>{requests.push({path,params});return {replies:[],page:{count:21}};};
  for(const root of [undefined,'0',0,'000']) {
    assert.deepEqual(await api.comments({video:'BV1xx411c7mD',root}),{items:[],page:1,nextPage:2});
    assert.deepEqual(requests.at(-1),{path:'/x/v2/reply',params:{type:1,oid:123,pn:1,ps:20,sort:2}});
  }
  const root='12345678901234567890';
  assert.equal((await api.comments({video:'BV1xx411c7mD',root,page:2})).nextPage,null);
  assert.deepEqual(requests.at(-1),{path:'/x/v2/reply/reply',params:{type:1,oid:123,pn:2,ps:20,sort:2,root}});
  for(const root of ['',null,'-1','abc','1'.repeat(21)]) await assert.rejects(api.comments({video:'BV1xx411c7mD',root}),/无效评论 root/);
  assert.equal(requests.length,5);
});
test('video links reject off-site and credential URLs',()=>{assert.equal(videoId('BV1xx411c7mD'),'BV1xx411c7mD');for(const url of ['https://evil.com/video/BV1xx411c7mD','https://a@www.bilibili.com/video/BV1xx411c7mD','file:///tmp/x'])assert.throws(()=>videoId(url));});
test('WBI signature deterministic and filters special characters',()=>{const images={img_url:'https://x/'+ 'a'.repeat(32)+'.png',sub_url:'https://x/'+'b'.repeat(32)+'.png'};assert.match(signWbi({x:"a!'"},images,1000),/^wts=1&x=a&w_rid=[a-f0-9]{32}$/);});
test('feed is the recommendation endpoint, never a keyword search',async()=>{const urls=[];const api=new BiliApi({gap:0,fetch:async u=>{urls.push(String(u));return String(u).includes('/nav')?response({wbi_img:{img_url:'https://x/'+'a'.repeat(32)+'.png',sub_url:'https://x/'+'b'.repeat(32)+'.png'}}):response({item:[{bvid:'BV1xx411c7mD',title:'<em>hello</em>'}]});}});assert.equal((await api.feed()).items[0].title,'hello');assert(urls[1].includes('/index/top/feed/rcmd'));});
test('risk response blocks later requests without retries',async()=>{let calls=0;const api=new BiliApi({gap:0,fetch:async()=>{calls++;return new Response('',{status:412});}});await assert.rejects(api.video({video:'BV1xx411c7mD'}),/限流/);await assert.rejects(api.video({video:'BV1xx411c7mD'}),/冷却/);assert.equal(calls,1);});
test('retention only removes expired owned inactive directories',async()=>{assert.equal(retentionDays(),7);assert.throws(()=>retentionDays({downloadRetentionDays:0}));const root=await mkdtemp(join(tmpdir(),'bili-中文 '));try{const old='watch-'+'a'.repeat(36),active='watch-'+'b'.repeat(36);for(const n of [old,active,'user']){await mkdir(join(root,n));await writeFile(join(root,n,'x'),'x');await utimes(join(root,n),new Date(0),new Date(0));}assert.equal((await cleanupDownloads(root,7,new Set([active]))).removed,1);await assert.rejects(access(join(root,old)));await access(join(root,active));await access(join(root,'user'));}finally{await rm(root,{recursive:true,force:true});}});
test('tool output has real image parts, not embedded base64',()=>{assert.deepEqual(renderResult({}, {a:1,images:[{attachmentId:'x'}]}),[{type:'text',text:'{"a":1}'},{type:'image',attachment:{attachmentId:'x'}}]);const tools=createTools({});assert.equal(tools.length,10);assert(tools.every(t=>t.parameters.additionalProperties===false));assert(!tools.some(t=>/send|coin|like/.test(t.name)));});
test('QR challenge public state hides key and cancellation prevents saves',async()=>{let saved=0;const credentials={readRecord:async()=>null,modifyRecord:async()=>{saved++;}};const login=createLogin(credentials,{fetch:async()=>response({url:'https://passport.bilibili.com/qr/test',qrcode_key:'secret-key'}),render:async()=> 'image'});const v=await login.action('begin');assert.equal(v.image,'image');assert(!JSON.stringify(v).includes('secret-key'));await login.action('cancel');assert.equal((await login.action('status')).status,'cancelled');assert.equal(saved,0);login.auth.dispose();});
test('RPC uses host registry and only exposes supported operations',async()=>{let registration;registerRpc({connection:{fetch:{register:r=>{registration=r;return ()=>{};}}}},{status:async()=>({configured:false})});const request=new Request('http://localhost/api/dsh-lpipe-bili',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'1',method:'dsh-lpipe-bili',payload:{method:'bili.status',payload:{}}})});assert.equal((await (await registration.fetch(request)).json()).result.value.configured,false);});
