import { MAX_SENTENCES, openRange, parseRecallId } from './open.mjs'

/**
 * 主动深挖的记忆工具：模型手里只有「模糊回忆」摆出来的那几句，想多读就读这里。
 *
 * 只读：不改记忆、不改星图、不写账本。被翻过的片段靠「返回正文里带着 id」
 * 自动算作已经在上下文里（下一次被动回忆会跳过它），不需要额外的记账。
 */
export function createRecallTools({ reader, compose = null }) {
  return [
    {
      name: 'recall_fragments',
      description:
        '主动做一次模糊回忆：把 query 当作这一轮的「输入源」去点亮星星，返回几段旧记忆的模糊摘要（每段带 lpipe_recall_id，可用 recall_open 读原文）。用于「我隐约记得有过这件事，让我想一想」。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
            description: '要回忆的内容，用你自己的话写。它就相当于这一轮你说的话，越具体越容易点亮对的星。',
          },
        },
        required: ['query'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['text', 'summary'],
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args, exec) {
        const query = String(args?.query ?? '').trim()
        if (!query) throw new Error('query is empty')
        if (typeof compose !== 'function') throw new Error('recall is not wired up')
        const sessionId = exec?.agent?.session?.id ?? exec?.session?.id ?? ''
        const block = compose(sessionId, query) ?? ''
        if (!block.trim()) return { text: '（没有想起什么：没有够格的候选片段）', summary: '主动回忆：没有候选' }
        const fragments = (block.match(/lpipe_recall_id\[[^\]]*\]/g) ?? []).length
        return { text: block, summary: `主动回忆：${fragments} 段` }
      },
    },
    {
      name: 'recall_open',
      description:
        'Open a fragment of memory and read its original sentences. Pass the id printed on a recalled block (lpipe_recall_id[repo:turn]) or on one of its sentences (lpipe_recall_id[repo:turn:sentence]); give `to` as a second id to read a range. The first and last sentences of the reply carry their full ids — copy the last one as `from` to read further.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', description: 'Starting id, e.g. lpipe_recall_id[deepseek-web-abc:858:12]. A bare fragment id starts at its first sentence.' },
          to: { type: 'string', description: 'Optional ending id (same shape). Inclusive.' },
          count: { type: 'integer', minimum: 1, maximum: MAX_SENTENCES, description: 'How many sentences to read when `to` is omitted. Default 6.' },
        },
        required: ['from'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['text', 'summary'],
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args) {
        const from = parseRecallId(args?.from)
        if (!from) {
          throw new Error('from must look like lpipe_recall_id[repo:turn] or lpipe_recall_id[repo:turn:sentence]')
        }
        const to = args?.to ? parseRecallId(args.to) : null
        if (args?.to && !to) throw new Error('to must look like lpipe_recall_id[repo:turn] or lpipe_recall_id[repo:turn:sentence]')
        if (to && (to.session !== from.session || to.turn !== from.turn)) {
          throw new Error('from and to must point into the same fragment')
        }
        const opened = openRange({
          reader,
          session: from.session,
          turn: from.turn,
          from: from.sentence ?? 1,
          to: to?.sentence ?? null,
          count: args?.count,
        })
        if (!opened) throw new Error('that fragment has no readable sentences')
        return {
          text: opened.text,
          summary: `打开 ${from.session}:${from.turn} 第 ${opened.start}–${opened.end} 句（共 ${opened.total} 句）`,
        }
      },
    },
  ]
}
