// Adapted from dsh-bili-whale/lib/credentials.js, MIT © 2026 ALTERSSSS.
export class AuthError extends Error {}
export function parseManualCookie(input = {}) {
  const values = {sessdata:String(input.sessdata??'').trim(), bili_jct:String(input.bili_jct??'').trim(), buvid3:String(input.buvid3??'').trim()};
  if(values.sessdata.length<20 || !/^[a-f0-9]{32}$/i.test(values.bili_jct) || Object.values(values).some(v=>v.length>8192 || /[\r\n;\x00-\x1f\x7f]/.test(v))) throw new AuthError('凭据不完整或格式无效，请重新扫码。');
  return values;
}
