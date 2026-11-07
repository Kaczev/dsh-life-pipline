import { MAX_SENTENCES, openRange, parsePosition } from './open.mjs'

/**
 * 主动深挖的记忆工具：模型手里只有「模糊回忆」摆出来的那几句，想多读就读这里。
 *
 * 只读：不改记忆、不改星图、不写账本。两个工具的可见结果都参与已读排除。
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
        const session = exec?.agent?.session ?? exec?.session
        const sessionId = session?.id ?? ''
        const block = await compose(sessionId, query, undefined, undefined, session) ?? ''
        if (!block.trim()) return { text: '（没有想起什么：没有够格的候选片段）', summary: '主动回忆：没有候选' }
        const fragments = (block.match(/lpipe_recall_id\[[^\]]*\]/g) ?? []).length
        return { text: block, summary: `主动回忆：${fragments} 段` }
      },
    },
    {
      name: 'recall_open',
      description:
        '读取旧记忆的原句，可跨片段。仓库单独填写，起止位置用“片段ID:句子ID”；返回包含两个端点的区间及下一页坐标。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: '记忆仓库 ID，即模糊回忆 lpipe_recall_id 中第一个冒号之前的部分。' },
          from: { type: 'string', description: '起点“片段ID:句子ID”，例如 858:12（包含该句）。' },
          to: { type: 'string', description: '可选终点“片段ID:句子ID”（包含该句），可跨片段。' },
          count: { type: 'integer', minimum: 1, maximum: MAX_SENTENCES, description: '省略 to 时读取的句数，默认 6，范围 1–40。' },
        },
        required: ['repo', 'from'],
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
        const repo = args?.repo
        if (typeof repo !== 'string' || !repo.trim() || /[\s:\[\]]/.test(repo)) throw new Error('repo must be a memory repository ID')
        const from = parsePosition(args?.from)
        const to = args?.to === undefined ? null : parsePosition(args.to)
        if (!from || (args?.to !== undefined && !to)) throw new Error('from/to must look like turn:sentence with positive integer IDs')
        reader.reload?.()
        const opened = openRange({ reader, session: repo, from, to, count: args?.count ?? 6 })
        return { text: opened.text, summary: `打开 ${repo} ${opened.start}–${opened.end}` }
      },
    },
  ]
}
