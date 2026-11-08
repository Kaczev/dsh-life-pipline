import { QrAuth, verifyAccount } from './vendor/auth.mjs';
import { parseManualCookie } from './vendor/credentials.js';
export const CREDENTIAL_KEY = 'dsh-lpipe-bili/account';
export const cookieHeader = c => c ? `SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}${c.buvid3?`; buvid3=${c.buvid3}`:''}` : '';
export function createLogin(credentials, options={}) {
  const read = async () => {const r=await credentials.readRecord(CREDENTIAL_KEY); return r?.kind==='grant'?r.payload:null;};
  const auth=new QrAuth({...options, save:async (input,{signal,check})=> {
    const value=parseManualCookie(input); const account=await verifyAccount(value,{signal,fetch:options.fetch});
    check(); await credentials.modifyRecord(CREDENTIAL_KEY,async()=>{check(); return {kind:'grant',payload:{...value,account}};}); return account;
  }});
  return {auth, read, cookie:async()=>cookieHeader(await read()), async status(){const c=await read(); return {configured:Boolean(c),account:c?.account??null,login:auth.current?auth.state(auth.current):{status:'idle'}};}, async action(action='status') {
    if(action==='begin') return auth.start();
    if(action==='cancel') return auth.cancel();
    if(action==='status') return auth.current?auth.poll(auth.current.id):this.status();
    throw Error('不支持的登录操作');
  }};
}
