import { isMainSession, registerMainTool, registerMainSection } from 'dsh-life-core/main-session'
import { loadConfig } from './config.mjs'

/** No anonymous scope and no inheritance; reads the owning memory config on each gate. */
export function isMemorySession(subject) {
  const id = typeof subject === 'string' ? subject : subject?.id
  return typeof id === 'string' && Boolean(id.trim()) && (loadConfig().allSessions || isMainSession(id))
}
export const registerMemoryTool = (ctx, tool) => registerMainTool(ctx, tool, isMemorySession)
export const registerMemorySection = (ctx, section) => registerMainSection(ctx, section, isMemorySession)
