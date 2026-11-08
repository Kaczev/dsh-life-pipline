import { parentPort, workerData } from 'node:worker_threads';
import { runStoryboard, formatManifest } from 'dsh-video-storyboard/storyboard';
try {
  const result=await runStoryboard({...workerData,cache:false,transcript:'none',maxSheets:4,maxFrames:96});
  const raw=formatManifest(result);
  const manifest=raw.split('\n').filter(line=>!line.includes('→')&&!line.includes('video_zoom')&&!line.includes('per-cell times')&&!line.includes('transcript:')).join('\n');
  parentPort.postMessage({manifest,images:result.sheets.map(s=>({png:s.png,width:s.width,height:s.height})),window:result.window??null});
} catch { parentPort.postMessage({error:'分镜生成失败；请用 bili_status 检查 ffmpeg/ffprobe，或换一个片段。'}); }
