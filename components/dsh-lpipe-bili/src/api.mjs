import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function signWbi(params, images, now = Date.now()) {
  const raw = [images?.img_url, images?.sub_url].map(x => String(x ?? '').split('/').at(-1).split('.')[0]).join('');
  if (raw.length !== 64) throw Error('B 站签名密钥缺失');
  const key = MIXIN.map(i => raw[i]).join('').slice(0,32);
  const values = {...params, wts: Math.floor(now / 1000)}; delete values.w_rid;
  const query = Object.keys(values).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(values[k]).replace(/[!'()*]/g,''))}`).join('&');
  return `${query}&w_rid=${createHash('md5').update(query+key).digest('hex')}`;
}
export function videoId(input) {
  const text = String(input ?? '').trim();
  if (/^BV[0-9A-Za-z]{10}$/.test(text)) return text;
  let u; try { u = new URL(text); } catch { throw Error('请提供 BV 号或 bilibili.com/video/BV… 链接'); }
  if (!['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(u.hostname) || u.protocol !== 'https:' || u.username || u.password) throw Error('只接受 B 站视频链接');
  const id = u.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/)?.[1];
  if (!id) throw Error('链接没有有效 BV 号'); return id;
}
export function integer(value, fallback, max = 50) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw Error(`参数必须是 1–${max} 的整数`); return n;
}
export const cleanText = (x, max = 600) => String(x ?? '').replace(/<[^>]*>/g,'').slice(0,max);
export function brief(v) { return {bvid:v.bvid??null, title:cleanText(v.title), uploader:cleanText(v.owner?.name ?? v.author), mid:v.owner?.mid ?? v.mid ?? null, duration:v.duration ?? v.length ?? null, views:v.stat?.view ?? v.play ?? null, url:v.bvid?`https://www.bilibili.com/video/${v.bvid}`:null}; }
export class BiliApi {
  constructor({cookie = async () => '', fetch = globalThis.fetch, now = Date.now, gap = 350} = {}) { Object.assign(this,{cookie,fetch,now,gap}); this.tail=Promise.resolve(); this.last=0; this.blockedUntil=0; }
  request(path, params = {}, {signed=false, signal} = {}) {
    const task = this.tail.then(async () => {
      if (this.now() < this.blockedUntil) throw Error('B 站风控冷却中，请稍后再试');
      const wait = this.gap - (this.now()-this.last); if(wait>0) await delay(wait, undefined, {signal});
      this.last = this.now();
      const cookie = await this.cookie();
      const query = signed ? signWbi(params, this.images, this.now()) : new URLSearchParams(params).toString();
      const response = await this.fetch(`https://api.bilibili.com${path}?${query}`, {redirect:'error', signal:AbortSignal.any([AbortSignal.timeout(20000), ...(signal?[signal]:[])]), headers:{'user-agent':'Mozilla/5.0', referer:'https://www.bilibili.com/', ...(cookie?{cookie}:{})}});
      if ([412,429].includes(response.status)) {this.blockedUntil=this.now()+600000; throw Error('B 站限流，已停止请求十分钟');}
      if(!response.ok) throw Error(`B 站 HTTP ${response.status}`);
      const reader = response.body.getReader(); const chunks=[]; let size=0;
      try { for(;;) {const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>4*1024*1024) throw Error('B 站响应过大'); chunks.push(Buffer.from(value));} } finally {await reader.cancel().catch(()=>{});}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if([-412,-352,-799,-509,-10403].includes(body.code)) {this.blockedUntil=this.now()+600000; throw Error('B 站风控，已停止请求十分钟');}
      if(body.code!==0) throw Error(`B 站返回 ${body.code}；未自动重试`);
      return body.data;
    }); this.tail=task.catch(()=>{}); return task;
  }
  async nav(signal) {const d=await this.request('/x/web-interface/nav',{}, {signal}); this.images=d.wbi_img; return d;}
  async wbi(path, params, signal) {if(!this.images) await this.nav(signal); return this.request(path,params,{signed:true,signal});}
  async feed({page,limit}={},signal) { const d=await this.wbi('/x/web-interface/wbi/index/top/feed/rcmd',{fresh_type:3, ps:integer(limit,12,30), fresh_idx:integer(page,1,10000), fresh_idx_1h:integer(page,1,10000)},signal); return {source:'homepage-recommendations', items:(d.item??[]).filter(v=>v.bvid).slice(0,integer(limit,12,30)).map(brief), nextPage:integer(page,1,10000)+1}; }
  async search({query,page}={},signal) {if(!String(query??'').trim() || String(query).length>200) throw Error('搜索词需要 1–200 字符'); const p=integer(page,1,10000); const d=await this.wbi('/x/web-interface/wbi/search/type',{search_type:'video',keyword:query,page:p,page_size:20},signal); return {items:(d.result??[]).slice(0,20).map(brief),page:p,nextPage:p<d.numPages?p+1:null};}
  async video({video}={},signal) {const d=await this.request('/x/web-interface/view',{bvid:videoId(video)},{signal}); return {...brief(d),aid:d.aid,description:cleanText(d.desc,3000),parts:(d.pages??[]).slice(0,200).map(p=>({part:p.page,cid:p.cid,title:cleanText(p.part),duration:p.duration})),totalParts:d.videos};}
  async related({video}={},signal) {return {items:(await this.request('/x/web-interface/archive/related',{bvid:videoId(video)},{signal})).slice(0,20).map(brief)};}
  async uploader({mid,page}={},signal) {if(!/^[1-9]\d{0,19}$/.test(String(mid??''))) throw Error('需要 UP 主数字 mid'); const p=integer(page,1,10000); const d=await this.wbi('/x/space/wbi/arc/search',{mid,pn:p,ps:20,order:'pubdate'},signal); return {items:(d.list?.vlist??[]).slice(0,20).map(brief),page:p,nextPage:p*20<d.page?.count?p+1:null};}
  async subtitles({video,part,from=0,to=from+600}={},signal) {
    if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to-from>600) throw Error('字幕区间单次最多 600 秒');
    const v=await this.video({video},signal), selected=v.parts.find(p=>p.part===integer(part,1,200)); if(!selected) throw Error('不存在这个分 P');
    const d=await this.wbi('/x/player/wbi/v2',{bvid:v.bvid,cid:selected.cid},signal);
    const tracks=d.subtitle?.subtitles??[]; if(!tracks.length) return {bvid:v.bvid,part:selected.part,available:false,reason:'没有可读取字幕；未调用转写'};
    const track=tracks.find(t=>t.lan==='zh-CN')??tracks.find(t=>String(t.lan).startsWith('zh'))??tracks[0];
    const url=new URL(track.subtitle_url.startsWith('//')?'https:'+track.subtitle_url:track.subtitle_url);
    if(url.protocol!=='https:'||url.username||url.password||!(['bilibili.com','hdslb.com'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))) throw Error('字幕地址不在 B 站域名范围');
    const response=await this.fetch(url,{redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])])});
    if(!response.ok)throw Error(`字幕 HTTP ${response.status}`);
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024)throw Error('字幕响应过大');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
    const rows=JSON.parse(Buffer.concat(chunks).toString()).body??[];
    const matches=rows.filter(r=>r.to>from&&r.from<to);
    return {bvid:v.bvid,part:selected.part,available:true,language:cleanText(track.lan,50),from,to,lines:matches.slice(0,300).map(r=>({from:r.from,to:r.to,text:cleanText(r.content,500)})),truncated:matches.length>300};
  }
  async comments({video,page,root}={},signal) {const v=await this.video({video},signal); const p=integer(page,1,10000); if(root!==undefined&&!/^\d{1,20}$/.test(String(root))) throw Error('无效评论 root'); const replyRoot=root!==undefined&&/[1-9]/.test(String(root))?String(root):undefined; const d=await this.request(replyRoot?'/x/v2/reply/reply':'/x/v2/reply',{type:1,oid:v.aid,pn:p,ps:20,sort:2,...(replyRoot?{root:replyRoot}:{})},{signal}); const row=r=>({id:String(r.rpid_str??r.rpid),user:cleanText(r.member?.uname,100),text:cleanText(r.content?.message,2000),likes:r.like,replies:r.rcount}); return {items:(d.replies??[]).slice(0,20).map(r=>({...row(r),preview:(r.replies??[]).slice(0,3).map(row)})),page:p,nextPage:p*20<(d.page?.count??0)?p+1:null};}
}
