// 宿主半边：记忆落盘之后，把新的一轮交给模型抽星，再把这一轮从灰变亮。
//
// 抽星只问模型一次（哪两个概念一起出现过），落到哪一句、连多粗由我们自己算。
// 模型不可用时什么都不点亮，灰记忆就一直是灰的——不猜、不用规则兜底。
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { MemoryReader } from 'dsh-lpipe-memory/reader'
import { memoryRoot } from 'dsh-lpipe-memory/paths'

import { RULES_VERSION, buildTurn, groupTurns, textsOf } from './build.mjs'
import { canExtract, loadConfig, routeOf, saveConfig } from './config.mjs'
import { createExtractor, turnSource } from './llm.mjs'
import { starmapRoot } from './paths.mjs'
import { createQueries } from './query.mjs'
import { createStarmapRpcHandler, registerStarmapRpc } from './rpc.mjs'
import { openRepo, turnKey } from './store.mjs'
import { noteUsage, usageStats } from './usage.mjs'

export const name = 'dsh-lpipe-starmap'

export const inject = []

const TURN_END = 'turn/end'
/** 灰记忆超过这么多轮就停手：自动补做只收拾刚过去的那几轮，积压的等用户自己开。 */
export const MAX_AUTO_GREY = 3

export function apply(ctx, options = {}) {
  const root = options.root ?? starmapRoot()
  const memory = options.reader ?? new MemoryReader({ root: options.memoryRoot ?? memoryRoot() })
  const repo = openRepo({ root })
  // 星图是后台索引：写日志时也落到 stderr，宿主的日志里才找得到。
  // 日志永远不许往外抛：宿主会把插件里的异常当成致命加载失败，整个进程退出。
  const warn = (message) => {
    try {
      if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
      else console.warn(message)
    } catch {
      // 连 logger 都坏了，就别再折腾
    }
  }
  // 必须写成 ctx.logger.info()：Cordis 的 logger 是可调用对象，拆出来再调用会丢掉 this，宿主当成致命加载失败直接退出。
  const info = (message) => {
    try {
      if (typeof ctx.logger?.info === 'function') ctx.logger.info(message)
      else if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
      else console.log(message)
    } catch {
      // 同上
    }
  }

  let config = loadConfig(root)
  let llm = options.llm ?? null

  /** 三个设置项都填了、也有模型服务，才算能抽星。 */
  const ready = () => Boolean(llm) && canExtract(config)
  const routeNow = () => {
    const route = routeOf(config)
    return config.reasoningEffort ? { ...route, reasoningEffort: config.reasoningEffort } : route
  }

  /** 暂停抽星：不再领新的轮次，正在跑的那一轮跑完就收工。
   *  重点是「停下」而不是「停一会儿」——之后 turn/end 触发的自动补做也一并停住，
   *  直到用户自己再点一次「现在抽星」。 */
  const pause = () => {
    pausedByUser = true
    stopRequested = true
    const inflight = Boolean(runSignal && !runSignal.signal.aborted)
    try {
      runSignal?.abort()
    } catch {}
    // 立刻把界面状态置为「已停」：正在跑的那一轮由 worker 自己收尾，
    // 但按钮必须马上回到「现在抽星」，不能挂在「正在暂停」上。
    progressState.running = false
    progressState.stopping = false
    progressState.updatedAt = Date.now()
    info(inflight
      ? '[dsh-lpipe-starmap] 收到暂停：等模型的那一下已切断，其余的跑完这一轮就停'
      : '[dsh-lpipe-starmap] 收到暂停：手上这一轮跑完就停')
    return { paused: true, running: false, aborted: inflight }
  }

  /**
   * 把磁盘上的索引与当前的抽星规则对齐：规则或记忆格式变了，旧星星一律作废。
   * 这一步必须同步做完——异步补做会因为没配模型、灰记忆太多等原因提前返回，
   * 那样旧星表就会一直留在盘上，界面显示「全亮」。
   * 返回 true 表示这次真的清过库。
   */
  const reconcileFormat = () => {
    const format = Number.isInteger(memory.state?.version) ? memory.state.version : 1
    const builtWith = Number.isInteger(repo.state?.memoryFormat) ? repo.state.memoryFormat : null
    const builtRules = Number.isInteger(repo.state?.rules) ? repo.state.rules : null
    const hasIndex = repo.stars.size > 0 || repo.turns.size > 0

    if (!hasIndex && builtRules === null) {
      // 全新安装：只记版本，不喊「清空」。
      repo.setMemoryFormat(format)
      repo.setRules(RULES_VERSION)
      return false
    }
    if (builtWith === format && builtRules === RULES_VERSION) return false

    try {
      info(
        `[dsh-lpipe-starmap] 抽星规则 ${builtRules ?? '未知'} → ${RULES_VERSION}（记忆格式 ${builtWith ?? '未知'} → ${format}）：`
          + `作废 ${repo.stars.size} 颗旧星、${repo.turns.size} 轮旧索引，全部记忆退回灰色`,
      )
      repo.reset()
      memory.reload()
      repo.reload()
      repo.setMemoryFormat(format)
      repo.setRules(RULES_VERSION)
      return true
    } catch (error) {
      warn(`[dsh-lpipe-starmap] 清空旧索引失败：${error?.message ?? error}`)
      return false
    }
  }

  /** 抽星进度：设置页拿它显示「正在抽 N/M」。 */
  const progressState = { running: false, done: 0, total: 0, failed: 0, error: '' }
  /** 用户点了「暂停」：跑完手上这一轮就停，不会硬跑完整个库。 */
  let stopRequested = false
  /** 这一次补做的切断开关：暂停时直接撕掉在途的模型请求，不用等它吐完。 */
  let runSignal = null
  /** 暂停的兜底定时器：30 秒还没收完就不再等。 */
  let stopTimer = null
  /** 真的还有活儿没收尾（哪怕界面上的 running 已经被兜底置为 false）。 */
  let jobActive = false
  /** 用户按下过暂停：之后的自动补做一律不领活儿，只有他点「现在抽星」才解除。 */
  let pausedByUser = false
  /** 现在有几路真的还在跑：暂停之后「还剩几路」就靠它。 */
  const lanesState = { active: 0, total: 0 }
  progressState.lanes = lanesState
  progressState.stopping = false
  /** 连着失败了几轮；模型那边出问题时用它及时刹车，不把额度烧在必然失败的调用上。 */
  let failureStreak = 0
  const rejectsFile = join(root, 'rejects.jsonl')

  /** sessionId -> 记忆里这个会话最大的轮号（启动或构建时更新，设置页读它算灰） */
  const maxTurn = new Map()

  const sessions = () => {
    try {
      return memory.sessions()
    } catch (error) {
      warn(`[dsh-lpipe-starmap] 读不到记忆：${error?.message ?? error}`)
      return []
    }
  }

  const rowsOf = (sessionId) => {
    const info_ = sessions().find((entry) => entry.sessionId === sessionId)
    if (!info_) return []
    const rows = []
    for (let seq = info_.firstSeq; seq <= info_.lastSeq; seq += 1) {
      const row = memory.read(seq)
      if (row) rows.push(row)
    }
    return rows
  }

  const noteRejects = (sessionId, turn, rejects) => {
    if (!Array.isArray(rejects) || rejects.length === 0) return
    try {
      mkdirSync(root, { recursive: true })
      const at = new Date().toISOString()
      const lines = rejects.map((entry) => JSON.stringify({ at, session: sessionId, turn, ...entry })).join('\n')
      appendFileSync(rejectsFile, `${lines}\n`, 'utf8')
    } catch (error) {
      warn(`[dsh-lpipe-starmap] 丢弃记录没写进去：${error?.message ?? error}`)
    }
  }

  /** 一轮：问模型 → 落星源。模型挂了就记一笔，这一轮保持灰。 */
  const buildOne = async (sessionId, turn, extractor) => {
    if (!llm) return false
    const source = turnSource(turn, textsOf)
    if (!source.trim()) {
      buildTurn({ repo, turn, sessionId, pairs: [] })
      return true
    }
    const reply = await extractor.ask(source)
    if (reply.usage) {
      noteUsage(root, {
        at: new Date().toISOString(),
        session: sessionId,
        turn: turn.turn,
        input: reply.usage.input,
        output: reply.usage.output,
        cacheRead: reply.usage.cacheRead,
        ok: reply.ok,
        model: config.model,
      })
    }
    if (!reply.ok) {
      warn(`[dsh-lpipe-starmap] 第 ${turn.turn} 轮抽星失败：${reply.error}`)
      if (reply.aborted) return 'stopped'
      progressState.failed += 1
      progressState.error = reply.error || '模型没有回出可用结果'
      noteRejects(sessionId, turn.turn, [{ pair: null, why: 'llm-failed', error: reply.error }])
      return false
    }
    const { rejects } = buildTurn({ repo, turn, sessionId, pairs: reply.pairs })
    noteRejects(sessionId, turn.turn, rejects)
    return true
  }

  /** 把某个会话里还没亮的轮次接过来。某一轮炸了只跳过这一轮，不拖累后面的。 */
  const buildSession = async (sessionId) => {
    const rows = rowsOf(sessionId)
    if (rows.length === 0) return 0
    const turns = groupTurns(rows)
    const last = turns[turns.length - 1]
    if (last) maxTurn.set(sessionId, last.turn)
    const pending = turns.filter((turn) => !repo.turns.has(turnKey(sessionId, turn.turn)))
    progressState.total += pending.length
    let built = 0
    let cursor = 0
    // 连着失败这么多次，基本就是模型那边的问题（钥匙、模型名、额度），继续硬跑只是烧钱。
    const FAIL_STREAK_LIMIT = 5
    const worker = async (extractor) => {
      while (cursor < pending.length && failureStreak < FAIL_STREAK_LIMIT && !stopRequested) {
        const turn = pending[cursor]
        cursor += 1
        let ok = false
        let cut = false
        try {
          const outcome = await buildOne(sessionId, turn, extractor)
          cut = outcome === 'stopped'
          ok = outcome === true
          if (ok) built += 1
        } catch (error) {
          warn(`[dsh-lpipe-starmap] 第 ${turn.turn} 轮跳过：${error?.message ?? error}`)
        }
        if (cut) break
        failureStreak = ok ? 0 : failureStreak + 1
        if (failureStreak === FAIL_STREAK_LIMIT) {
          info(`[dsh-lpipe-starmap] 连着 ${FAIL_STREAK_LIMIT} 轮抽星失败，先停下：${progressState.error || '看 rejects.jsonl'}`)
        }
        progressState.done += 1
        progressState.updatedAt = Date.now()
        if (progressState.done % 25 === 0) {
          info(`[dsh-lpipe-starmap] 抽星 ${progressState.done}/${progressState.total}（${repo.stars.size} 颗星）`)
        }
      }
    }
    const width = Math.max(1, Math.min(8, config.concurrency || 3))
    // 每个并发各自一条对话：前缀互不干扰，模型侧的缓存才稳。
    const lanes = Array.from({ length: width }, () =>
      createExtractor({ llm, route: routeNow(), maxTokens: config.maxTokens, signal: runSignal?.signal ?? null }),
    )
    lanesState.total = width
    lanesState.active = width
    try {
      await Promise.all(
        lanes.map(async (extractor) => {
          try {
            await worker(extractor)
          } finally {
            // 这一路的循环退出了（跑完 / 暂停 / 刹车）：界面上的「还剩几路」随之减少。
            lanesState.active = Math.max(0, lanesState.active - 1)
          }
        }),
      )
    } finally {
      lanesState.active = 0
    }
    return built
  }

  const buildAll = async () => {
    let built = 0
    for (const session of sessions()) built += await buildSession(session.sessionId)
    return built
  }

  /** 记忆里有多少轮、星图亮了多少轮。 */
  const status = () => {
    const list = []
    let turns = 0
    let lit = 0
    let lastBuiltAt = null
    let lastTurn = null
    for (const session of sessions()) {
      let max = maxTurn.get(session.sessionId)
      if (!Number.isInteger(max)) {
        const lastRow = memory.read(session.lastSeq)
        max = Number.isInteger(lastRow?.turn) ? lastRow.turn : 0
        maxTurn.set(session.sessionId, max)
      }
      // 数「星源里真的有几轮」而不是水位上那个最大轮号：三路并发时轮号是跳着完成的，
      // 只看最大值会从 1 直接跳到 4，面板看起来就像卡住了。
      let builtTurns = 0
      for (const record of repo.turns.values()) {
        if (record.session !== session.sessionId) continue
        builtTurns += 1
      }
      turns += max
      lit += Math.min(builtTurns, max)
      list.push({ sessionId: session.sessionId, turns: max, built: Math.min(builtTurns, max), grey: Math.max(0, max - builtTurns) })
    }
    for (const record of repo.turns.values()) {
      if (lastBuiltAt === null || (record.at ?? 0) > lastBuiltAt) {
        lastBuiltAt = record.at ?? null
        lastTurn = record.turn
      }
    }
    return { turns, lit, sessions: list, lastBuiltAt, lastTurn }
  }

  const queries = createQueries({ repo, memoryStatus: status, progressState, usageStats: () => usageStats(root) })

  const run = (label, work) => {
    const fail = (error) => {
      warn(`[dsh-lpipe-starmap] ${label}失败：${error?.message ?? error}`)
      return null
    }
    try {
      const result = work()
      if (result && typeof result.then === 'function') return result.catch(fail)
      return result
    } catch (error) {
      return fail(error)
    }
  }

  /**
   * 补做一次：跟上磁盘上的星图，把剩下的灰记忆交给模型抽星。
   * `full` 是整库重来：提示词或规则改过以后，旧轮次必须重新过一遍。
   */
  const rebuild = async ({ full = false, manual = false, background = false } = {}) => {
    if (manual) pausedByUser = false
    if (pausedByUser && !manual) {
      info('[dsh-lpipe-starmap] 用户按了暂停，自动补做先不动')
      return { started: false, paused: true, built: 0, ...status() }
    }
    if (!ready()) {
      info('[dsh-lpipe-starmap] 抽星模型没配全（供应商 / 模型 / 思考强度都要填），先不动')
      return { built: 0, skipped: 'unconfigured', ...status() }
    }
    if (jobActive) return { started: false, already: true, built: 0, ...status() }
    const started = Date.now()
    if (full) repo.reset()
    memory.reload()
    repo.reload()
    jobActive = true
    progressState.running = true
    progressState.updatedAt = Date.now()
    progressState.done = 0
    progressState.total = 0
    progressState.failed = 0
    progressState.error = ''
    failureStreak = 0
    stopRequested = false
    progressState.stopping = false
    runSignal = new AbortController()
    const job = (async () => {
      try {
        const built = await buildAll()
        const result = { built, ...status(), elapsedMs: Date.now() - started }
        info(`[dsh-lpipe-starmap] 点亮 ${built} 轮，累计 ${repo.turns.size} 轮、${repo.stars.size} 颗星`)
        return result
      } finally {
        jobActive = false
        progressState.running = false
        progressState.stopping = false
        progressState.updatedAt = Date.now()
        runSignal = null
        if (stopTimer) {
          clearTimeout(stopTimer)
          stopTimer = null
        }
      }
    })()
    // 设置页要的是「点下去立刻有反应」：不等整库跑完，先回话，进度靠轮询。
    if (background) {
      job.catch((error) => warn(`[dsh-lpipe-starmap] 抽星中断：${error?.message ?? error}`))
      return { started: true, ...status() }
    }
    return job
  }

  // 启动后补做：先把灰记忆一轮一轮交给模型。
  const warmDelay = Number.isFinite(options.warmDelay) ? options.warmDelay : 4000
  let warm = null
  const warmUp = () => {
    run('启动构建', async () => {
      // 规则变化已经在 apply() 里同步处理过；这里只负责补做灰记忆。
      if (!ready()) {
        info('[dsh-lpipe-starmap] 抽星模型没配全（供应商 / 模型 / 思考强度都要填），灰记忆先留着')
        return
      }
      const before0 = status()
      const grey0 = Math.max(0, before0.turns - before0.lit)
      if (grey0 > MAX_AUTO_GREY) {
        info(`[dsh-lpipe-starmap] 灰记忆 ${grey0} 轮，超过 ${MAX_AUTO_GREY} 轮，等你手动开始`)
        return
      }
      info(`[dsh-lpipe-starmap] 开始补做，已经有 ${repo.turns.size} 轮`)
      await rebuild()
      repo.setMemoryFormat(Number.isInteger(memory.state?.version) ? memory.state.version : 1)
      repo.setRules(RULES_VERSION)
    })
  }

  const scheduleWarm = () => {
    if (!llm || options.noWarm || warm) return
    warm = setTimeout(warmUp, warmDelay)
    warm.unref?.()
  }
  // 先对齐版本，再谈补做：清库不能等异步。
  reconcileFormat()
  scheduleWarm()
  if (!llm) {
    // 模型是可选依赖：宿主的 llm 服务后到也能接上，没有就只报一句、什么都不点亮。
    ctx.inject(['llm'], (llmCtx) => {
      llm = llmCtx?.llm ?? null
      if (llm) scheduleWarm()
      else warn('[dsh-lpipe-starmap] 没有可用的模型：抽星停着，灰记忆会一直是灰的')
    })
  }

  ctx.effect(
    () => () => {
      if (warm) clearTimeout(warm)
    },
    'dsh-lpipe-starmap: stop warm-up',
  )

  /** 宿主里有哪些提供者和模型：设置页的选择框直接读这份，不让用户手打。 */
  const catalog = async () => {
    if (typeof llm?.listProviders !== 'function') return { providers: [], error: 'llm unavailable' }
    const providers = []
    for (const entry of llm.listProviders() ?? []) {
      const id = String(entry?.id ?? '')
      if (!id) continue
      let models = []
      try {
        models = typeof llm.listModels === 'function' ? (await llm.listModels(id)) ?? [] : []
      } catch (error) {
        warn(`[dsh-lpipe-starmap] 读不到 ${id} 的模型列表：${error?.message ?? error}`)
      }
      providers.push({
        id,
        name: String(entry?.name ?? id),
        models: models.map((model) => ({ id: String(model?.id ?? ''), name: String(model?.name ?? model?.id ?? '') })).filter((model) => model.id),
      })
    }
    return { providers }
  }

  /** 这个模型支持哪些思考强度：读宿主的模型元数据，读不到就如实说没有。 */
  const efforts = async (provider, model) => {
    // 宿主服务上的方法叫 resolveModelInfo；resolveModel 只存在于适配器基类里，
    // 早先按适配器的名字调用，永远拿到 undefined，于是设置页一直退回到自造的兜底表。
    const resolver = typeof llm?.resolveModelInfo === 'function'
      ? llm.resolveModelInfo.bind(llm)
      : typeof llm?.resolveModel === 'function'
        ? llm.resolveModel.bind(llm)
        : null
    if (!resolver || !provider || !model) return { efforts: [], defaultEffort: null }
    try {
      const info_ = await resolver(provider, model)
      const reasoning = info_?.reasoning
      return {
        efforts: (reasoning?.efforts ?? []).map((effort) => ({ id: String(effort?.id ?? ''), name: String(effort?.name ?? effort?.id ?? '') })).filter((effort) => effort.id),
        defaultEffort: reasoning?.defaultEffort ? String(reasoning.defaultEffort) : null,
      }
    } catch (error) {
      return { efforts: [], defaultEffort: null, error: String(error?.message ?? error) }
    }
  }

  ctx.inject(['connection'], (connectionCtx) => {
    try {
      registerStarmapRpc(
        connectionCtx,
        createStarmapRpcHandler({
          queries,
          rebuild,
          catalog,
          efforts,
          pause,
          config: {
            get: () => loadConfig(root),
            set: (patch) => {
              // effortFree 由设置页按宿主报的候选填好一起送上来：没有候选才是 true。
              config = saveConfig(root, patch)
              return config
            },
          },
        }),
      )
    } catch (error) {
      warn(`[dsh-lpipe-starmap] RPC 注册失败：${error?.message ?? error}`)
    }
  })

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      if (event?.type !== TURN_END) return
      const sessionId = session?.id ?? ''
      if (!sessionId) return
      // 记忆层也在 turn/end 落盘：等它写完再读，否则会读到上一轮的磁盘状态。
      const delay = Number.isFinite(options.turnDelay) ? options.turnDelay : 1500
      const timer = setTimeout(() => {
        // 用户按过暂停：新的轮次也不要偷偷接着抽，等他点「现在抽星」。
        if (pausedByUser) return
        run('构建这一轮', async () => {
          memory.reload()
          const snapshot = status()
          const mine = snapshot.sessions.find((entry) => entry.sessionId === sessionId)
          // 积压太久就交给用户手动开：自动补做只收拾刚过去的那几轮。
          if ((mine?.grey ?? 0) > MAX_AUTO_GREY) {
            info(`[dsh-lpipe-starmap] 灰记忆 ${mine?.grey ?? 0} 轮，超过 ${MAX_AUTO_GREY} 轮，等你手动开始`)
            return
          }
          await buildSession(sessionId)
        })
      }, delay)
      timer.unref?.()
    })
  })

  return { repo, queries, buildAll, rebuild, config: () => loadConfig(root), progressState }
}
