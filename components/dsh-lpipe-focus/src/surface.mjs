import {
  FOCUS_SOURCE_KIND,
  buildConclusionMessage,
  buildNudgeMessage,
  buildObjectiveMessage,
  renderConclusionLine,
  renderConclusionsText,
} from './render.mjs';
import {
  FOCUS_TOOL_NAME,
  readSessionEvents,
  validateFocusConcludeArgs,
} from './tools.mjs';

export const TRIGGER_SOURCE_KINDS = new Set(['user', 'dsh-lpipe-chat', 'dsh-lpipe-wake']);
const HOST_KINDS = new Set(['runtime-context', 'skill-catalog', 'agent-instructions', 'skill-invocation', 'compact-checkpoint']);
const CONTINUE_CLAUSE = /^(?:(?:please\s+)?(?:continue|resume|go on|keep going)(?:\s+(?:please|(?:with\s+)?(?:the\s+)?(?:original\s+|previous\s+|current\s+)?(?:task|work)))?|(?:请)?(?:继续|接着)(?:执行|进行|做)?(?:原本的?|之前的?|原来的?|当前的?)?(?:工作|任务)?(?:就好|即可|吧)?)$/iu;
const ACK_CLAUSE = /^(?:哦|噢|嗯|好(?:的)?|没事(?:了)?|没关系|(?:我)?(?:明白|知道)(?:原因)?了|ok(?:ay)?|thanks|got it|no worries)$/iu;

function isContinuation(text) {
  const clauses = text.trim().split(/[,.!?，。！？；;…\n]+/u).map(s => s.trim()).filter(Boolean);
  return clauses.some(s => CONTINUE_CLAUSE.test(s)) && clauses.every(s => CONTINUE_CLAUSE.test(s) || ACK_CLAUSE.test(s));
}

function eventAtSeq(session, events, seq) {
  return session?.eventAt?.(seq) ?? (events[seq]?.seq === seq ? events[seq] : events.find(ev => ev?.seq === seq));
}

function messageOfSurfaceEvent(ev) {
  return ev?.type === 'user/message' ? ev.data : ev?.data?.message;
}

export function charsOfBlocks(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (typeof block === 'string') total += block.length;
    if (typeof block?.text === 'string') total += block.text.length;
    if (typeof block?.thinking === 'string') total += block.thinking.length;
    if (block?.type === 'tool-call') {
      total += String(block.name ?? '').length;
      if (typeof block.arguments === 'string') total += block.arguments.length;
      else if (block.arguments !== undefined) {
        try { total += JSON.stringify(block.arguments).length; } catch { /* ignore non-JSON input */ }
      }
    }
  }
  return total;
}

export function charsOfMessage(message) {
  return charsOfBlocks(message?.content ?? message?.text);
}

export function charsOfSurfaceEvent(event) {
  return charsOfMessage(messageOfSurfaceEvent(event));
}

export function textOfUserMessage(message) {
  if (typeof message?.text === 'string') return message.text;
  if (typeof message?.content === 'string') return message.content;
  if (!Array.isArray(message?.content)) return '';
  return message.content.filter(b => b?.type === 'text').map(b => b.text).join('\n');
}

export function hasActiveCompaction(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.type === 'compaction/start') return true;
    if (events[i]?.type === 'compaction/end' || events[i]?.type === 'session/end-seed') break;
  }
  return false;
}

function sourceOf(ev) {
  return ev?.type === 'user/message' ? ev.data?.source : undefined;
}

function layerOf(ev) {
  const source = sourceOf(ev);
  return source?.kind === FOCUS_SOURCE_KIND ? source.layer : undefined;
}

function isTrigger(source) {
  return TRIGGER_SOURCE_KINDS.has(source?.kind) && !(source.kind === 'dsh-lpipe-wake' && source.form === 'snapshot');
}

function toolCalls(ev) {
  const blocks = ev?.type === 'assistant/message' ? ev.data?.message?.content : null;
  return Array.isArray(blocks) ? blocks.filter(b => b?.type === 'tool-call') : [];
}

function resultId(ev) {
  const msg = ev?.data?.message;
  if (msg?.toolCallId && msg.source?.callId && msg.toolCallId !== msg.source.callId) return null;
  return msg?.toolCallId ?? msg?.source?.callId;
}

// A cut is valid only outside a complete, identified batch. An unfinished suffix
// doesn't invalidate a completed checkpoint before it. Never infer pairs by count.
function inspectSurface(surfaceEvents) {
  const cuts = [true];
  const barriers = [];
  const pending = new Map();
  let valid = true;
  let lastConclusionIdx = -1;
  let unconvertedStartIdx = 0;
  for (const [i, ev] of surfaceEvents.entries()) {
    const source = sourceOf(ev);
    const layer = layerOf(ev);
    const calls = toolCalls(ev);
    let barrier = ev?.type === 'system/message' || ev?.type === 'developer/message'
      || isTrigger(source) || HOST_KINDS.has(source?.kind) || layer === 'conclusion';
    if (!ev) valid = false;
    if (ev?.type === 'assistant/message') {
      if (pending.size) valid = false;
      const skill = calls.some(b => b.name === 'skill');
      barrier ||= skill;
      for (const call of calls) {
        if (!call.id || !call.name || pending.has(call.id)) valid = false;
        pending.set(call.id, { ev, skill });
      }
    } else if (ev?.type === 'tool/result') {
      const id = resultId(ev);
      const pair = pending.get(id);
      if (!pair || pair.ev.data.turn !== ev.data.turn || pair.ev.data.step !== ev.data.step) valid = false;
      barrier ||= pair?.skill === true;
      pending.delete(id);
    }
    if (barrier) barriers.push(i);
    if (layer === 'conclusion') lastConclusionIdx = i;
    if (barrier || layer === 'objective') unconvertedStartIdx = i + 1;
    cuts.push(valid && pending.size === 0);
  }
  return { cuts, barriers, lastConclusionIdx, unconvertedStartIdx };
}

export function inspectLayers(session, events = readSessionEvents(session)) {
  const nodes = [...(session?.surface?.nodes ?? [])];
  const surfaceEvents = nodes.map(seq => eventAtSeq(session, events, seq));
  return { nodes, surfaceEvents, ...inspectSurface(surfaceEvents) };
}

export function isSurfaceSpanBalanced(surfaceEvents, startIdx, endIdx) {
  if (startIdx < 0 || startIdx > endIdx || endIdx >= surfaceEvents.length) return false;
  const { cuts } = inspectSurface(surfaceEvents);
  return cuts[startIdx] && cuts[endIdx + 1];
}

function parseArgs(rawArgs) {
  try { return validateFocusConcludeArgs(typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs); }
  catch { return null; }
}

function pendingCheckpoints(layout, events) {
  const { surfaceEvents, cuts, lastConclusionIdx } = layout;
  const matches = [];
  for (let i = lastConclusionIdx + 1; i + 1 < surfaceEvents.length; i++) {
    const ev = surfaceEvents[i];
    const calls = toolCalls(ev);
    if (calls.length !== 1 || calls[0].name !== FOCUS_TOOL_NAME || ev.data.interrupted || !cuts[i]) continue;
    const result = surfaceEvents[i + 1];
    const [call] = calls;
    if (result?.type !== 'tool/result' || !cuts[i + 2] || resultId(result) !== call.id
      || result.data.message?.isError || result.data.error !== undefined) continue;
    // A durable tool/call is trace, not a surface node. Only use a matching
    // execution from this exact step when an old assistant omitted arguments.
    const raw = call.arguments ?? call.input ?? events.find(e => e.type === 'tool/call'
      && e.seq > ev.seq && e.seq < result.seq && e.data?.turn === ev.data.turn && e.data.step === ev.data.step
      && e.data.name === FOCUS_TOOL_NAME && e.data.callId === call.id)?.data.arguments;
    const parsed = parseArgs(raw);
    if (parsed) matches.push({ ...parsed, callIdx: i, resultIdx: i + 1 });
  }
  return matches;
}

function storedObjective(ev) {
  const source = sourceOf(ev);
  const value = layerOf(ev) === 'objective' ? source : layerOf(ev) === 'conclusion' ? source.objective : null;
  if (typeof value?.rawText === 'string' && value.rawText.trim()) {
    return { rawText: value.rawText.trim(), origin: value.origin === 'model' ? 'model' : 'carried' };
  }
  return null;
}

function resolveObjective(surfaceEvents, callIdx, explicit) {
  let active = null;
  let redirected = false;
  let seenTask = false;
  for (let i = 0; i < callIdx; i++) {
    const ev = surfaceEvents[i];
    const saved = storedObjective(ev);
    if (saved) {
      active = { ...saved, origin: 'carried' };
      seenTask = true;
      redirected = false;
    } else if (isTrigger(sourceOf(ev))) {
      const text = textOfUserMessage(ev.data).trim();
      const attachment = ev.data?.content?.some?.(b => b?.type === 'image' || b?.type === 'file');
      if (!attachment && (!text || isContinuation(text))) continue;
      active = { rawText: text || 'Refer to the most recent user attachment.', origin: 'carried' };
      redirected = seenTask;
      seenTask = true;
    }
  }
  return explicit && !redirected ? { rawText: explicit, origin: 'model' } : active;
}

function conclusionMessage(entries, now, objective) {
  const msg = buildConclusionMessage(entries, now);
  if (!objective) return msg;
  const obj = buildObjectiveMessage({ ...objective, now });
  return { ...msg, content: [...msg.content, ...obj.content], source: { ...msg.source, objective } };
}

function replaceInput(nodes, start, end, message) {
  return ['user/message', message, {
    surfaceOp: { op: 'replace', startSeq: nodes[start], endSeq: nodes[end] },
    sourceEventSeqs: nodes.slice(start, end + 1),
  }];
}

export function foldPendingConclusions(session, { now = Date.now(), turn = 0, step = 0, onDiagnostic = () => {} } = {}) {
  const events = readSessionEvents(session);
  if (hasActiveCompaction(events)) return null;
  const layout = inspectLayers(session, events);
  const { nodes, surfaceEvents, cuts, barriers } = layout;
  const matches = pendingCheckpoints(layout, events);
  const latest = matches.at(-1);
  if (!latest) return null;
  const { callIdx, resultIdx } = latest;
  let start = (barriers.findLast(i => i <= resultIdx) ?? -1) + 1;
  // A user or host message could itself have landed inside an unrelated batch.
  // Keep the entire batch instead of beginning at one of its results.
  while (start < callIdx && !cuts[start]) start++;
  if (start > callIdx || !cuts[start] || !cuts[resultIdx + 1]) return null;

  const merged = new Map();
  let explicit = '';
  for (const item of matches) {
    if (item.callIdx < start) continue;
    for (const entry of item.entries) {
      merged.delete(entry.key);
      merged.set(entry.key, entry);
    }
    if (item.objective && !isContinuation(item.objective)) explicit = item.objective;
  }
  const entries = [...merged.values()];
  const objective = resolveObjective(surfaceEvents, callIdx, explicit);
  const inputs = start < callIdx && objective ? [
    replaceInput(nodes, start, callIdx - 1, conclusionMessage(entries, now)),
    replaceInput(nodes, callIdx, resultIdx, buildObjectiveMessage({ ...objective, now })),
  ] : [replaceInput(nodes, start, resultIdx, conclusionMessage(entries, now, objective))];
  session.append(inputs);
  const beforeChars = surfaceEvents.slice(start, resultIdx + 1).reduce((n, ev) => n + charsOfSurfaceEvent(ev), 0);
  const afterChars = inputs.reduce((n, [, msg]) => n + charsOfMessage(msg), 0);
  onDiagnostic({ event: 'folded', sessionId: session.id, turn, step,
    replacedRange: { startSeq: nodes[start], endSeq: nodes[resultIdx] }, keys: [...merged.keys()],
    origin: objective?.origin ?? 'none', beforeChars, afterChars });
  return { beforeChars, afterChars };
}

export function lastModelInteractionTime(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if ((ev?.type === 'turn/end' || ev?.type === 'assistant/message') && Number.isFinite(ev.time)) return ev.time;
  }
  return null;
}

export function compactConclusionEntries(rawEntriesList, maxConclusionChars) {
  const ordered = new Map();
  for (const entries of rawEntriesList) {
    for (const entry of entries) {
      ordered.delete(entry.key);
      ordered.set(entry.key, entry);
    }
  }
  const kept = [];
  const droppedKeys = [];
  const overhead = renderConclusionsText([{ key: 'k', text: 'v' }]).length - renderConclusionLine({ key: 'k', text: 'v' }).length;
  let available = maxConclusionChars - overhead;
  let full = false;
  for (const entry of [...ordered.values()].reverse()) {
    if (!entry.text || full) { droppedKeys.push(entry.key); continue; }
    const cost = renderConclusionLine(entry).length + (kept.length ? 1 : 0);
    if (cost <= available) { kept.push(entry); available -= cost; continue; }
    full = true;
    if (kept.length) { droppedKeys.push(entry.key); continue; }
    // Price the rendered prefix, including multiline indentation and escaped tags.
    let low = 0, high = entry.text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (renderConclusionLine({ ...entry, text: entry.text.slice(0, mid) + '…' }).length <= available) low = mid;
      else high = mid - 1;
    }
    kept.push({ key: entry.key, text: entry.text.slice(0, low) + '…' });
  }
  return { entries: kept.reverse(), droppedKeys: droppedKeys.reverse() };
}

function usableConclusion(ev) {
  const entries = sourceOf(ev)?.entries;
  return layerOf(ev) === 'conclusion' && Array.isArray(entries)
    && entries.every(e => typeof e?.key === 'string' && e.key.trim() && typeof e.text === 'string');
}

function latestCompactionEnd(events) {
  let open;
  let end = -1;
  for (const ev of events) {
    if (ev.type === 'compaction/start') open = ev.data?.compactionId;
    if (ev.type === 'session/end-seed') open = undefined;
    if (ev.type === 'compaction/end') {
      if (open && ev.data?.compactionId === open && ev.data.error === undefined) end = ev.seq;
      open = undefined;
    }
  }
  return end;
}

function snapshotKind(ev) {
  const s = sourceOf(ev);
  if (s?.kind === 'runtime-context' && s.form === 'snapshot' && Array.isArray(s.sections)
    && s.sections.every(x => typeof x?.name === 'string' && typeof x.text === 'string')) return s.kind;
  if (s?.kind === 'skill-catalog' && s.form === 'catalog' && Array.isArray(s.entries)
    && s.entries.every(x => typeof x?.name === 'string' && typeof x.description === 'string')) return s.kind;
  return null;
}

export function compactConclusionsIfNeeded(session, config, { incomingMessages = [], now = Date.now(), onDiagnostic = () => {} } = {}) {
  const events = readSessionEvents(session);
  if (hasActiveCompaction(events)) return null;
  const { nodes, surfaceEvents, cuts } = inspectLayers(session, events);
  const lastTime = lastModelInteractionTime(events);
  const idle = lastTime !== null && now - lastTime >= config.idleMinutes * 60_000;
  const threshold = surfaceEvents.reduce((n, ev) => n + charsOfSurfaceEvent(ev), 0)
    + incomingMessages.reduce((n, msg) => n + charsOfMessage(msg), 0) >= config.compactChars;
  const hostEnd = latestCompactionEnd(events);
  if (!idle && !threshold && hostEnd < 0) return null;

  // One old successful host compaction must never authorize cleanup of future
  // work. Only nodes already present at its end participate in that pass.
  const largeCutoff = idle ? Infinity : hostEnd;
  const conclusionCutoff = threshold ? Infinity : largeCutoff;
  const stale = new Set();
  const staleEmbeddedObjectives = new Set();
  const seenSnapshots = new Set();
  let newerObjective = false;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i] > largeCutoff) continue;
    const ev = surfaceEvents[i];
    const kind = snapshotKind(ev);
    if (kind) {
      if (seenSnapshots.has(kind)) stale.add(i);
      // Incomplete discovery is not affirmative evidence of a complete replacement.
      if (sourceOf(ev).incomplete !== true) seenSnapshots.add(kind);
    }
    if (storedObjective(ev)) {
      if (newerObjective) {
        if (layerOf(ev) === 'objective') stale.add(i);
        else staleEmbeddedObjectives.add(i);
      }
      newerObjective = true;
    }
  }

  const conclusionIndices = [];
  for (let i = 0; i < nodes.length; i++) {
    if (layerOf(surfaceEvents[i]) !== 'conclusion') continue;
    // Never purge a retirement or evict an older version without seeing all
    // records that participate in last-write-wins, including legacy records.
    if (!usableConclusion(surfaceEvents[i]) || !cuts[i] || !cuts[i + 1]) return null;
    if (nodes[i] > conclusionCutoff) continue;
    conclusionIndices.push(i);
  }
  const raw = conclusionIndices.map(i => sourceOf(surfaceEvents[i]).entries);
  const { entries, droppedKeys } = compactConclusionEntries(raw, config.maxConclusionChars);
  const lastOwner = new Map();
  for (const i of conclusionIndices) for (const e of sourceOf(surfaceEvents[i]).entries) lastOwner.set(e.key, i);
  const retained = new Map();
  for (const entry of entries) {
    const i = lastOwner.get(entry.key);
    if (!retained.has(i)) retained.set(i, []);
    retained.get(i).push(entry);
  }

  const eligible = new Set([...conclusionIndices, ...stale]);
  const inputs = [];
  let beforeNodes = 0, beforeChars = 0;
  for (let i = 0; i < nodes.length;) {
    if (!eligible.has(i) || !cuts[i] || !cuts[i + 1]) { i++; continue; }
    const start = i;
    const group = [];
    let hasConclusion = false, objective = null;
    do {
      const ev = surfaceEvents[i];
      if (usableConclusion(ev)) {
        hasConclusion = true;
        if (!staleEmbeddedObjectives.has(i)) objective = storedObjective(ev) ?? objective;
        for (const entry of retained.get(i) ?? []) group.push(entry);
      }
      i++;
    } while (i < nodes.length && eligible.has(i) && cuts[i] && cuts[i + 1]);
    if (i === start + 1 && hasConclusion && !staleEmbeddedObjectives.has(start)) {
      const old = sourceOf(surfaceEvents[start]).entries;
      if (old.length === group.length && old.every((e, k) => e.key === group[k].key && e.text === group[k].text)) continue;
    }
    const message = hasConclusion ? conclusionMessage(group, now, objective) : {
      ...buildConclusionMessage([], now),
      content: [{ type: 'text', text: '[Superseded context omitted.]' }],
      source: { kind: FOCUS_SOURCE_KIND, layer: 'superseded' },
    };
    inputs.push(replaceInput(nodes, start, i - 1, message));
    beforeNodes += i - start;
    for (let j = start; j < i; j++) beforeChars += charsOfSurfaceEvent(surfaceEvents[j]);
  }
  if (!inputs.length) return null;
  session.append(inputs);
  const result = { reason: idle ? 'idle' : threshold ? 'threshold' : 'host-compaction', beforeNodes, afterNodes: inputs.length,
    beforeChars, afterChars: inputs.reduce((n, [, msg]) => n + charsOfMessage(msg), 0), removedKeys: droppedKeys };
  onDiagnostic({ event: 'compacted', sessionId: session.id, ...result });
  return result;
}

export function evaluateUnconvertedNudge(session, decisionMessages, config, { onDiagnostic = () => {} } = {}) {
  const { surfaceEvents, unconvertedStartIdx } = inspectLayers(session);
  const work = surfaceEvents.slice(unconvertedStartIdx);
  const incoming = Array.isArray(decisionMessages) ? decisionMessages : [];
  if (incoming.some(msg => msg?.source?.kind === FOCUS_SOURCE_KIND && msg.source.layer === 'nudge')) return null;
  const incomingChars = incoming.reduce((n, msg) => n + charsOfMessage(msg), 0);
  const lastNudge = work.findLastIndex(ev => layerOf(ev) === 'nudge');
  const unconvertedChars = work.reduce((n, ev) => n + charsOfSurfaceEvent(ev), incomingChars);
  if (lastNudge < 0 ? unconvertedChars < config.nudgeChars :
    work.slice(lastNudge + 1).reduce((n, ev) => n + charsOfSurfaceEvent(ev), incomingChars) < Math.max(8000, Math.floor(config.nudgeChars / 2))) return null;
  onDiagnostic({ event: 'nudged', sessionId: session.id, unconvertedChars, nudgeChars: config.nudgeChars });
  return buildNudgeMessage();
}

export function createPreStepHandler({ loadConfig, allowed, now = () => Date.now(), onDiagnostic = () => {} }) {
  return async (payload, next) => {
    const { agent, messages, turn, step, signal } = payload ?? {};
    if (!agent?.session || signal?.aborted || !allowed(agent)) return next();
    const { session } = agent;
    if (hasActiveCompaction(readSessionEvents(session))) return next();
    const report = (event, error) => onDiagnostic({ event, sessionId: session.id, message: String(error?.message ?? error) });
    let config;
    try { config = loadConfig(); } catch (error) { report('config-error', error); return next(); }
    const time = now();
    try { foldPendingConclusions(session, { now: time, turn, step, onDiagnostic }); }
    catch (error) { report('fold-error', error); }
    try { compactConclusionsIfNeeded(session, config, { incomingMessages: messages, now: time, onDiagnostic }); }
    catch (error) { report('compact-error', error); }
    const decision = await next();
    if (!decision || decision.kind === 'reject' || signal?.aborted) return decision;
    try {
      const nudge = evaluateUnconvertedNudge(session, decision.messages, config, { onDiagnostic });
      if (nudge) return { ...decision, messages: [...decision.messages, nudge] };
    } catch (error) { report('nudge-error', error); }
    return decision;
  };
}
