import { homedir } from 'node:os';
import { join } from 'node:path';
import { lstat, readdir, unlink, rmdir } from 'node:fs/promises';
export const homeDirectory = () => join(homedir(),'.dsh','life-bili');
export function retentionDays(config={}) { const n=Number(config.downloadRetentionDays??7); if(!Number.isInteger(n)||n<1||n>36500) throw Error('临时文件保留时间必须是 1–36500 天'); return n; }
// Only task-owned directories, never links. Active operations are excluded by the caller.
export async function cleanupDownloads(root, days, active=new Set(), now=Date.now()) {
  let removed=0;
  for(const e of await readdir(root,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT') return []; throw e;})) {
    if(!e.isDirectory()||!/^watch-[a-f0-9-]{36}$/.test(e.name)||active.has(e.name)) continue;
    const dir=join(root,e.name), st=await lstat(dir);
    if(st.isSymbolicLink()||st.mtimeMs>=now-days*86400000) continue;
    async function clear(path) {for(const f of await readdir(path,{withFileTypes:true})) {const p=join(path,f.name); const s=await lstat(p); if(s.isSymbolicLink()) throw Error('临时目录包含链接，跳过清理'); if(s.isDirectory()) await clear(p); else if(s.isFile()) {const again=await lstat(p); if(again.ino===s.ino && again.mtimeMs===s.mtimeMs) await unlink(p);} } await rmdir(path);}
    try {await clear(dir); removed++;} catch { /* leave unrecognized/racing files intact */ }
  }
  return {removed};
}
