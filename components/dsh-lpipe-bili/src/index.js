import { registerMainTool } from 'dsh-life-pipline/main-session';
import { join } from 'node:path';
import { BiliApi } from './api.mjs';
import { createLogin } from './login.mjs';
import { homeDirectory, retentionDays, cleanupDownloads } from './storage.mjs';
import { createWatch, prerequisites } from './watch.mjs';
import { createTools } from './tools.mjs';
import { registerRpc } from './rpc.mjs';
export const name='dsh-lpipe-bili';
export const inject=['tools','credentials','attachments','connection','configEditor'];
export function apply(ctx,config={}) {
  retentionDays(config);
  const login=createLogin(ctx.credentials),api=new BiliApi({cookie:()=>login.cookie()});
  const directory=join(homeDirectory(),'downloads'),active=new Set(),controller=new AbortController();
  const saveImages=images=>ctx.attachments.saveImages(images.map((image,i)=>({data:image.png,mediaType:'image/png',name:`bili-storyboard-${i+1}.png`})));
  const saveQr=async value=>{const {image,...rest}=value;if(!image)return rest;const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(image);if(!match)throw Error('二维码图像无效');return {...rest,images:[await ctx.attachments.saveImage({data:Buffer.from(match[1],'base64'),mediaType:'image/png',name:'bili-login.png'})]};};
  const status=async()=>{const state=await login.status();const {image,...safeLogin}=state.login;return {...state,login:safeLogin,prerequisites:await prerequisites(),downloadRetentionDays:retentionDays(config)};};
  ctx.effect(()=>registerRpc(ctx,{login,status,getRetention:()=>retentionDays(config),setRetention:async value=>{const days=retentionDays({downloadRetentionDays:value});await ctx.configEditor.edit(ctx.fiber.entry,current=>({...current,downloadRetentionDays:days}));return {downloadRetentionDays:days};}}));
  const watch=createWatch({api,login,directory,active,saveImages});
  for(const tool of createTools({api,login,status,saveQr,watch:(args,signal)=>watch(args,AbortSignal.any([controller.signal,...(signal?[signal]:[])]))}))ctx.effect(()=>registerMainTool(ctx,tool));
  ctx.effect(()=>{const cleanup=()=>cleanupDownloads(directory,retentionDays(config),active).catch(()=>{});void cleanup();const timer=setInterval(cleanup,3600000);timer.unref?.();return ()=>{clearInterval(timer);controller.abort();login.auth.dispose();};});
}
