// 帧：写盘与读回都按 8 KB 一帧压缩，每帧独立可解。
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'

export const FRAME_BYTES = 8 * 1024

export function compressFrame(text) {
  return zstdCompressSync(Buffer.from(text, 'utf8'))
}

export function decompressFrame(bytes) {
  return zstdDecompressSync(bytes).toString('utf8')
}
