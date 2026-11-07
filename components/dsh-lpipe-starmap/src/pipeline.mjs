/**
 * 管线自己说的话不算「说过的话」。
 *
 * 回忆、联想、想象注入的内容，以及它们背后的工具调用与结果，都是程序拼出来给模型看的，
 * 不是用户与助手之间的对话。把它们喂回抽星模型，等于让管线自己给自己造概念——越抽越多，
 * 最后整张星表都是管线行为留下的影子。
 */

/** 这些来源的用户消息一律不进抽星输入。 */
export const PIPELINE_SOURCES = new Set([
  'runtime-context',
  'dsh-lpipe-recall',
  'dsh-lpipe-assoc',
  'dsh-lpipe-imagine',
])

/** 管线工具的命名约定：recall_* / assoc_* / imagine_*。 */
const PIPELINE_TOOL = /^(recall_|assoc_|imagine_)/

export function isPipelineTool(name) {
  return PIPELINE_TOOL.test(String(name ?? ''))
}
