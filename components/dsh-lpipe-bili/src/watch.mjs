import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { discoverYtdlp } from 'dsh-video-storyboard/ytdlp';
import { DEFAULT_FFMPEG, DEFAULT_FFPROBE } from 'dsh-video-storyboard/probe';
import { integer } from './api.mjs';
const privateBin=name=>join(homedir(),'.dsh','life-bili','tools',process.platform==='win32'?`${name}.exe`:name);
const ffmpeg=existsSync(privateBin('ffmpeg'))?privateBin('ffmpeg'):DEFAULT_FFMPEG;
const ffprobe=existsSync(privateBin('ffprobe'))?privateBin('ffprobe'):DEFAULT_FFPROBE;
export function run(bin,args,{signal,timeoutMs=240000}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('视频处理已取消'));return;}
    const child=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',failure;
    const stop=error=>{failure=error;if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill('SIGKILL');};
    const abort=()=>stop(Error('视频处理已取消'));
    const timer=setTimeout(()=>stop(Error('视频处理超时')),timeoutMs);
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    child.stdout.on('data',b=>{out=(out+b).slice(-65536);});child.stderr.resume();
    child.once('error',()=>{cleanup();reject(Error('视频程序无法启动，请用 bili_status 检查依赖'));});
    child.once('close',code=>{cleanup();failure?reject(failure):code===0?resolve(out):reject(Error(`视频处理失败（${code}）；请检查工具与 B 站访问状态`));});
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
export async function prerequisites() {
  const check=async(bin)=>{try{await run(bin,['-version'],{timeoutMs:10000});return true;}catch{return false;}};
  let ytdlp=false; try{await discoverYtdlp();ytdlp=true;}catch{}
  return {ffmpeg:await check(ffmpeg),ffprobe:await check(ffprobe),ytdlp};
}
export function storyboard(input,opts,{directory,signal,timeoutMs=240000}={}) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./storyboard-worker.mjs',import.meta.url),{execArgv:[],workerData:{input,...opts}, env:{...process.env,DSH_FFMPEG_PATH:ffmpeg,DSH_FFPROBE_PATH:ffprobe,DSH_VIDEO_CACHE_DIR:join(directory,'cache'),DSH_VIDEO_MEDIA_DIR:join(directory,'media')}});
    let settled=false;
    const finish=(error,value)=>{if(settled)return; settled=true; clearTimeout(timer);signal?.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(value);};
    const abort=()=>finish(Error('观看已取消')); const timer=setTimeout(()=>finish(Error('分镜处理超时')),timeoutMs);
    worker.once('message',m=>m.error?finish(Error(m.error)):finish(null,m)); worker.once('error',()=>finish(Error('分镜运行时失败'))); worker.once('exit',code=>{if(!settled)finish(Error(`分镜提前退出 ${code}`));});
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
export function createWatch({api,login,directory,active,saveImages}) {
  return async function watch(args,signal) {
    const info=await api.video(args,signal); const part=integer(args.part,1,200); const selected=info.parts.find(p=>p.part===part); if(!selected)throw Error('不存在这个分 P');
    const from=args.from??0, to=args.to??Math.min(selected.duration,from+180);
    if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>selected.duration||to-from>600) throw Error('观看区间需要有效秒数，单次最多十分钟');
    const name=`watch-${randomUUID()}`, dir=join(directory,name); active.add(name);
    const cookieFile=join(dir,'cookies.txt');
    try {
      await mkdir(dir,{recursive:true,mode:0o700});
      if(process.platform==='win32') await run('icacls.exe',[dir,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`],{signal,timeoutMs:10000});
      const c=await login.read();
      if(c) {const rows=[['SESSDATA',c.sessdata],['bili_jct',c.bili_jct],['buvid3',c.buvid3]].filter(x=>x[1]).map(([k,v])=>`.bilibili.com\tTRUE\t/\tTRUE\t0\t${k}\t${v}`); await writeFile(cookieFile,'# Netscape HTTP Cookie File\n'+rows.join('\n')+'\n',{mode:0o600,flag:'wx'});}
      const y=await discoverYtdlp();
      await run(y.bin,[...y.prefix,'--ignore-config','--no-playlist','--no-progress','--no-warnings','--socket-timeout','20','--retries','0','--max-filesize','500M','--ffmpeg-location',ffmpeg,'-f','best[height<=480]/bestvideo[height<=480]+bestaudio/best','--merge-output-format','mp4','-o',join(dir,'video.%(ext)s'),...(c?['--cookies',cookieFile]:[]),`${info.url}?p=${part}`],{signal});
      await unlink(cookieFile).catch(()=>{});
      const files=(await readdir(dir)).filter(f=>/^video\.(mp4|mkv|webm|flv)$/.test(f)); if(files.length!==1)throw Error('下载没有生成唯一可用视频');
      const media=join(dir,files[0]); if((await stat(media)).size>500*1024*1024)throw Error('视频超过本次 500 MiB 临时文件限额');
      const output=await storyboard(media,{from,to},{directory:dir,signal});
      if(signal?.aborted)throw Error('观看已取消');
      const images=await saveImages(output.images);
      return {bvid:info.bvid,title:info.title,part,from,to,status:'storyboard-delivered',note:'这是本次返回的分镜区间，不代表整片看完；字幕另用 bili_subtitles 读取。',manifest:output.manifest,images,nextFrom:to<selected.duration?to:null};
    } finally {await unlink(cookieFile).catch(()=>{});active.delete(name);}
  };
}
