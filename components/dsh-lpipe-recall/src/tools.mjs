import { imagesOfRows, loadRecallImage } from './images.mjs'
import { DEFAULT_COUNT, MAX_SENTENCES, openRange, parsePosition } from './open.mjs'

/**
 * 主动深挖的记忆工具：模型手里只有「模糊回忆」摆出来的那几句，想多读就读这里。
 *
 * 只读：不改记忆、不改星图、不写账本。文字工具的可见结果参与已读排除；看图独立按需调用。
 */
export function createRecallTools({ reader, compose = null, attachments = null }) {
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
        '读取旧记忆的原句，可跨片段。仓库单独填写，起止位置用“片段ID:句子ID”；返回包含两个端点的区间及下一页坐标；列出片段图片引用，不自动加载图片。纯图片片段从“片段ID:1”打开。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: '记忆仓库 ID，即模糊回忆 lpipe_recall_id 中第一个冒号之前的部分。' },
          from: { type: 'string', description: '起点“片段ID:句子ID”，例如 858:12（包含该句）。' },
          to: { type: ["string", "null"], description: '可选终点“片段ID:句子ID”（包含该句），可跨片段；省略、空字符串或 null 均按 count 读取。' },
          imagesOffset: { type: 'integer', minimum: 0, description: '图片清单偏移，默认 0；默认列出所读片段的全部图片引用，受总输出字数上限约束。' },
          count: { type: 'integer', minimum: 1, maximum: MAX_SENTENCES, description: '省略 to 时读取的句数，默认 20，范围 1–200；输出最多 24000 字符。' },
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
        const hasEnd = args?.to != null && !(typeof args.to === "string" && !args.to.trim())
        const to = hasEnd ? parsePosition(args.to) : null
        if (!from || (hasEnd && !to)) throw new Error('from/to must look like turn:sentence with positive integer IDs')
        reader.reload?.()
        const opened = openRange({ reader, session: repo, from, to, count: args?.count ?? DEFAULT_COUNT, imagesOffset: args?.imagesOffset ?? 0 })
        return { text: opened.text, summary: `打开 ${repo} ${opened.start}–${opened.end}` }
      },
    },
    {
      name: 'recall_image',
      description: '按需查看旧记忆中的一张图片。图片引用由 recall_open 返回；只在需要图片内容时调用。',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          repo: { type: 'string', description: '记忆仓库 ID。' },
          fragment: { type: 'integer', minimum: 1, description: '图片所属的片段 ID（轮号）。' },
          image: { type: 'string', description: 'recall_open 列出的完整图片 ID（SHA-256）。' },
        }, required: ['repo', 'fragment', 'image'],
      },
      output: {
        schema: { type: 'object', properties: { text: { type: 'string' }, attachment: { type: 'object' } }, required: ['text', 'attachment'] },
        render: (_args, value) => [{ type: 'text', text: value.text }, { type: 'image', attachment: value.attachment }],
      },
      async execute(args) {
        if (typeof args?.repo !== 'string' || !args.repo || /[\s:\[\]]/.test(args.repo)) throw new Error('repo must be a memory repository ID')
        if (!Number.isSafeInteger(args.fragment) || args.fragment < 1) throw new Error('fragment must be a positive integer')
        if (!/^[a-f0-9]{64}$/.test(args.image ?? '')) throw new Error('image must be a SHA-256 image ID')
        reader.reload?.()
        const rows = reader.rows(args.repo).filter(row => row.turn === args.fragment)
        const attachment = await loadRecallImage({ reader, attachments, rows, image: args.image })
        return { text: '〔回忆 · 图片〕仓库 ' + args.repo + '，片段 ' + args.fragment + '，图片 ' + args.image + '（历史资料）｜' + imagesOfRows(rows).find(image => image.id === args.image)?.source, attachment }
      },
    },
  ]
}
