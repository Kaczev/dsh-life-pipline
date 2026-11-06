// 路径规则：一条会话一个目录，目录里按天分卷。
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 记忆根目录。DSH_HOME 与宿主一致，没设就退回 ~/.dsh。 */
export function memoryRoot(env = process.env) {
  const base = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() ? env.DSH_HOME.trim() : join(homedir(), '.dsh')
  return join(base, 'life-memory')
}

export function sessionsDir(root) {
  return join(root, 'sessions')
}

export function sessionDir(root, sessionId) {
  return join(sessionsDir(root), sessionId)
}

export function daysDir(root, sessionId) {
  return join(sessionDir(root, sessionId), 'days')
}

export function dayFile(root, sessionId, day) {
  return join(daysDir(root, sessionId), `${day}.jsonl.zst`)
}

export function idxFile(root, sessionId, day) {
  return join(daysDir(root, sessionId), `${day}.idx`)
}

export function framesFile(root, sessionId, day) {
  return join(daysDir(root, sessionId), `${day}.frames`)
}

export function metaFile(root, sessionId) {
  return join(sessionDir(root, sessionId), 'meta.json')
}

export function stateFile(root) {
  return join(root, 'state.json')
}

export function mediaPackFile(root, sessionId, day) {
  return join(daysDir(root, sessionId), `${day}.media.zst`)
}

export function mediaIdxFile(root, sessionId, day) {
  return join(daysDir(root, sessionId), `${day}.media.idx`)
}

/** media 全局共享、内容寻址：同一份字节在两个会话里只存一次。 */
export function mediaFile(root, sha256, ext = 'bin') {
  return join(root, 'media', sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${ext}`)
}
