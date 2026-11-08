import { isSpokenRow, pieces, fragmentSentences } from './render.mjs'

const DAY = 86400000

/** 真文与原句共用分词：汉字二元组、其他文字单词；不使用背景。 */
export function lexicalTerms(text) {
  const out = []
  for (const match of String(text ?? '').normalize('NFKC').toLowerCase().matchAll(/\p{Script=Han}+|[^\P{L}\p{Script=Han}]+|\p{N}+/gu)) {
    const token = match[0]
    if (/^\p{Script=Han}+$/u.test(token)) {
      const chars = [...token]
      if (chars.length === 1) out.push(token)
      else for (let i = 1; i < chars.length; i++) out.push(chars[i - 1] + chars[i])
    } else out.push(token)
  }
  return out
}

export function timeCoefficient(at, now, recentDays = 30) {
  if (at == null || !Number.isFinite(Number(at))) return 1
  const age = Math.max(0, now - Number(at)) / DAY
  return 1 + Math.max(0, 1 - age / recentDays) ** 4
}

/** 全库原文统计快照；同一个片段只计算一次，过滤规则与展示原句一致。 */
export function lexicalCorpus({ repo, reader }) {
  const sessions = new Map()
  const documents = new Map()
  const df = new Map()
  let totalLength = 0
  for (const record of repo.turns.values()) {
    if (!sessions.has(record.session)) {
      const turns = new Map()
      for (const row of reader.rows(record.session)) {
        if (!isSpokenRow(row)) continue
        const text = pieces(row.text).join(' ')
        turns.set(row.turn, `${turns.get(row.turn) ?? ''} ${text}`)
      }
      sessions.set(record.session, turns)
    }
    const key = `${record.session}#${record.turn}`
    if (documents.has(key)) continue
    const terms = lexicalTerms(sessions.get(record.session).get(record.turn) ?? '')
    const tf = new Map()
    for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1)
    documents.set(key, { tf, length: terms.length })
    totalLength += terms.length
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const count = documents.size
  return { documents, count, averageLength: count ? totalLength / count : 0,
    idf: (term) => Math.log(1 + (count - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5)) }
}

export function bm25(document, queryTerms, corpus) {
  if (!document?.length || !corpus.averageLength) return 0
  let score = 0
  for (const term of new Set(queryTerms)) {
    const tf = document.tf.get(term) ?? 0
    if (!tf) continue
    score += corpus.idf(term) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * document.length / corpus.averageLength))
  }
  return score
}

export function excerptSimilarity(left, right, idf) {
  const union = new Set([...left, ...right])
  let overlap = 0
  let total = 0
  for (const term of union) {
    const weight = idf(term)
    total += weight
    if (left.has(term) && right.has(term)) overlap += weight
  }
  return total > 0 ? overlap / total : 0
}

/** 固定系数只算一次；前缀贪心只确定披露名次，不计算其余名次。 */
export function selectFragments({ candidates, query, corpus, now, recentDays = 30, limit = 4, prepareExcerpt }) {
  const terms = lexicalTerms(query)
  const pool = candidates.map((candidate) => ({ ...candidate,
    lexicalScore: bm25(corpus.documents.get(candidate.key), terms, corpus),
    timeFactor: timeCoefficient(candidate.at, now, recentDays),
  }))
  const maximum = pool.reduce((value, candidate) => Math.max(value, candidate.lexicalScore), 0)
  for (const candidate of pool) {
    candidate.lexicalFactor = 1 + (maximum > 0 ? candidate.lexicalScore / maximum : 0)
    candidate.unmaskedStrength = candidate.strength * candidate.timeFactor * candidate.lexicalFactor
    candidate.maskSum = 0
  }
  const selected = []
  // 摘录仅在首次需要比较重复度时准备，并在本次选择期间冻结。
  const excerptOf = (candidate) => {
    if (!candidate.excerpt) candidate.excerpt = prepareExcerpt(candidate)
    if (!candidate.excerptTerms) candidate.excerptTerms = new Set(lexicalTerms(candidate.excerpt.lines.map((line) => line.text).join(' ')))
    return candidate.excerptTerms
  }
  for (let rank = 0; rank < limit && pool.length; rank++) {
    const previous = selected.at(-1)
    let bestIndex = -1
    let bestScore = -Infinity
    for (let index = 0; index < pool.length; index++) {
      const candidate = pool[index]
      // 无可展示原句的片段不占名额，也不参与掩盖。
      excerptOf(candidate)
      if (!candidate.excerpt.lines.length) continue
      if (previous) candidate.maskSum += excerptSimilarity(excerptOf(candidate), excerptOf(previous), corpus.idf)
      const score = candidate.unmaskedStrength / (1 + candidate.maskSum)
      const best = pool[bestIndex]
      if (score > bestScore || (score === bestScore && (!best || candidate.foreground > best.foreground ||
        (candidate.foreground === best.foreground && ((candidate.at ?? 0) > (best.at ?? 0) ||
        ((candidate.at ?? 0) === (best.at ?? 0) && candidate.key < best.key)))))) {
        bestIndex = index
        bestScore = score
      }
    }
    if (bestIndex < 0) break
    const [chosen] = pool.splice(bestIndex, 1)
    chosen.maskFactor = 1 / (1 + chosen.maskSum)
    chosen.adjustedStrength = bestScore
    delete chosen.excerptTerms
    selected.push(chosen)
    // 下一轮只需要已选摘录词项；不重新选句。
    excerptOf(chosen)
  }
  return selected
}

export function rankFragments({ candidates, query, repo, reader, flicker, config, now = Date.now(), corpus = null }) {
  const rows = new Map()
  const snapshot = { rows(session) {
    if (!rows.has(session)) rows.set(session, reader.rows(session))
    return rows.get(session)
  } }
  return selectFragments({ candidates, query, corpus: corpus ?? lexicalCorpus({ repo, reader: snapshot }), now,
    recentDays: config.recentDays, limit: config.fragments,
    prepareExcerpt: (candidate) => fragmentSentences({ reader: snapshot, candidate, flicker, limit: config.sentencesPerFragment }),
  })
}
