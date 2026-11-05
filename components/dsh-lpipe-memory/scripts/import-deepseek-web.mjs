// 把 DeepSeek 网页版导出的对话（history_messages 的原始 JSON）投影成记忆行。
//
// 用法：
//   node components/dsh-lpipe-memory/scripts/import-deepseek-web.mjs \
//     --backup "C:/Users/Kaczev/Desktop/鲸鱼记忆备份/备份/2026-11-05_212359" [--dry-run]
//
// 网页消息里能拿到的东西只有这些片段：REQUEST（用户说话）、RESPONSE（回复）、
// THINK（思考）、FILE（附件元数据）、SEARCH / TOOL_SEARCH / TOOL_OPEN（联网检索）、
// TIP（界面小字，不是对话，丢掉）。
// 附件当年只导出了文件名，字节不在备份里，所以只能留名字并标注没有字节。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { MemoryReader } from '../src/reader.mjs'
import { MemoryWriter } from '../src/writer.mjs'

function parseArgs(argv) {
  const args = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--dry-run') args.dryRun = true
    else if (token === '--backup') args.backup = argv[++i]
    else if (token === '--file') args.file = argv[++i]
    else if (token === '--session') args.session = argv[++i]
    else if (token === '--title') args.title = argv[++i]
    else if (token === '--root') args.root = argv[++i]
    else if (token === '--limit') args.limit = Number(argv[++i])
    else throw new Error(`看不懂这个参数：${token}`)
  }
  if (!args.file && !args.backup) throw new Error('要么给 --backup（备份目录），要么给 --file（015.json）')
  return args
}

/** 一个消息的全部片段按类型归堆。 */
function fragmentsOf(message) {
  const list = Array.isArray(message?.fragments) ? message.fragments : []
  const by = { REQUEST: [], RESPONSE: [], THINK: [], FILE: [], SEARCH: [], TOOL_SEARCH: [], TOOL_OPEN: [] }
  for (const fragment of list) {
    if (by[fragment?.type]) by[fragment.type].push(fragment)
  }
  return by
}

function textOf(fragments) {
  return fragments
    .map((fragment) =>
      typeof fragment?.content === 'string'
        ? fragment.content
        : JSON.stringify(fragment?.content ?? fragment ?? null),
    )
    .join('\n')
    .trim()
}

/** FILE 片段里只有文件元数据（名字、id、状态），字节没进备份。 */
function filesOf(fragments) {
  const out = []
  for (const fragment of fragments) {
    const files = Array.isArray(fragment?.files) ? fragment.files : []
    for (const file of files) {
      if (!file || typeof file !== 'object') continue
      out.push({
        type: 'file',
        name: file.file_name ?? file.name ?? file.id,
        fileId: file.id ?? null,
        status: file.status ?? null,
        mediaError: '备份里只有文件名，字节没有导出',
      })
    }
  }
  return out
}

function queriesOf(fragment) {
  return Array.isArray(fragment?.queries) ? fragment.queries.map((item) => item?.query).filter(Boolean) : []
}

function resultsOf(fragment) {
  return Array.isArray(fragment?.results)
    ? fragment.results.map((item) => ({
        url: item?.url ?? null,
        title: item?.title ?? null,
        snippet: typeof item?.snippet === 'string' ? item.snippet.slice(0, 500) : null,
      }))
    : []
}

/** 联网检索与开页面也是工具消息，照我们的两种 kind 记。 */
function toolRowsOf(by) {
  const rows = []
  for (const fragment of by.TOOL_SEARCH) {
    const queries = queriesOf(fragment)
    rows.push({
      kind: 'tool/call',
      payload: { callId: fragment?.id ?? null, name: 'web_search', arguments: JSON.stringify(queries) },
    })
    rows.push({
      kind: 'tool/result',
      payload: {
        callId: fragment?.id ?? null,
        name: 'web_search',
        text: typeof fragment?.content === 'string' ? fragment.content : '',
        parts: [{ type: 'search', queries, results: resultsOf(fragment) }],
        isError: false,
      },
    })
  }
  for (const fragment of by.TOOL_OPEN) {
    const result = fragment?.result && typeof fragment.result === 'object' ? fragment.result : {}
    rows.push({
      kind: 'tool/result',
      payload: {
        callId: fragment?.id ?? null,
        name: 'open_page',
        text: [result.title, result.url].filter(Boolean).join('\n'),
        parts: [{ type: 'open_page', url: result.url ?? null, title: result.title ?? null }],
        isError: false,
      },
    })
  }
  for (const fragment of by.SEARCH) {
    rows.push({
      kind: 'tool/result',
      payload: {
        callId: fragment?.id ?? null,
        name: 'web_search',
        text: typeof fragment?.content === 'string' ? fragment.content : '',
        parts: [{ type: 'search', queries: queriesOf(fragment), results: resultsOf(fragment) }],
        isError: false,
      },
    })
  }
  return rows
}

/** 一条网页消息 → 我们记忆里的若干行（kind + payload）。 */
export function projectWebMessage(message) {
  const by = fragmentsOf(message)
  const files = filesOf(by.FILE)
  const common = { messageId: message?.message_id ?? null, model: message?.model ?? null }
  if (String(message?.role).toUpperCase() === 'USER') {
    const text = textOf(by.REQUEST)
    if (!text && files.length === 0) return []
    const parts = [{ type: 'text', text }]
    for (const file of files) parts.push(file)
    return [
      {
        kind: 'user/message',
        payload: {
          source: { kind: 'import', origin: 'deepseek-web', messageId: common.messageId },
          text,
          parts,
        },
      },
    ]
  }
  const text = textOf(by.RESPONSE)
  const reasoning = textOf(by.THINK)
  if (!text && !reasoning) return []
  const parts = []
  if (text) parts.push({ type: 'text', text })
  for (const fragment of by.THINK) {
    if (typeof fragment?.content === 'string' && fragment.content.trim()) {
      parts.push({ type: 'reasoning', text: fragment.content.trim() })
    }
  }
  for (const file of files) parts.push(file)
  return [
    {
      kind: 'assistant/message',
      payload: {
        ...common,
        text,
        reasoning,
        parts,
        status: message?.status ?? null,
        interrupted: message?.incomplete_message === true || message?.status === 'INCOMPLETE',
      },
    },
    ...toolRowsOf(by),
  ]
}

export function importBackup({ file, session, title, root, limit, dryRun = false, log = console.log }) {
  const payload = JSON.parse(readFileSync(file, 'utf8'))
  const biz = payload?.data?.biz_data ?? {}
  const chat = biz.chat_session ?? {}
  const messages = Array.isArray(biz.chat_messages) ? biz.chat_messages : []
  const sessionId = session ?? `deepseek-web-${chat.id ?? 'unknown'}`
  const writer = dryRun ? null : new MemoryWriter(root ? { root } : {})

  let rows = 0
  let skipped = 0
  let turn = 0
  const sliced = Number.isFinite(limit) && limit > 0 ? messages.slice(0, limit) : messages
  for (let index = 0; index < sliced.length; index += 1) {
    const message = sliced[index]
    const projected = projectWebMessage(message)
    if (projected.length === 0) {
      skipped += 1
      continue
    }
    if (projected.some((row) => row.kind === 'user/message')) turn += 1
    const at = Number(message?.inserted_at) * 1000
    const base = Number.isFinite(message?.message_id) ? message.message_id : index
    for (let part = 0; part < projected.length; part += 1) {
      const row = projected[part]
      if (!writer) {
        rows += 1
        continue
      }
      const written = writer.append({
        sessionId,
        eventSeq: base * 1000 + part,
        at,
        kind: row.kind,
        turn,
        step: 0,
        payload: row.payload,
      })
      if (written) rows += 1
      else skipped += 1
    }
  }

  if (writer) {
    writer.setTitle(sessionId, title ?? chat.title ?? '')
    writer.close()
  }
  log(`会话：${sessionId}（${title ?? chat.title ?? '无标题'}）`)
  log(`消息 ${messages.length} 条，写入 ${rows} 行，跳过 ${skipped}${dryRun ? '（dry run）' : ''}`)
  return { sessionId, rows, skipped, total: messages.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  const file = args.file ?? join(args.backup, '原始数据', '015.json')
  const result = importBackup({ ...args, file: resolve(file) })
  if (!args.dryRun) {
    const reader = new MemoryReader(args.root ? { root: args.root } : {})
    const problems = reader.verify({})
    const summary = reader.sessions().find((item) => item.sessionId === result.sessionId)
    console.log(`校验：${problems.length === 0 ? '哈希链完整' : problems.slice(0, 5).join('；')}`)
    console.log(`会话 ${summary?.rows ?? 0} 行，seq ${summary?.firstSeq} → ${summary?.lastSeq}`)
  }
}
