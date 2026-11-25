import { randomUUID } from 'node:crypto';
import { FOCUS_SOURCE_KIND, buildFocusLayerMessage, buildNudgeMessage, buildObjectiveMessage, buildPressureMessage, buildTodoMessage } from './render.mjs';
import { FOCUS_TOOL_NAME, collectFocusHistory, readSessionEvents } from './tools.mjs';

function sourceOf(ev) { return ev?.type === 'user/message' ? ev.data?.source : undefined; }
function layerOf(ev) { const s = sourceOf(ev); return s?.kind === FOCUS_SOURCE_KIND ? s.layer : undefined; }
function toolCalls(ev) { const c = ev?.type === 'assistant/message' && ev.data?.message?.content; return Array.isArray(c) ? c.filter(b => b?.type === 'tool-call') : []; }
function resultId(ev) {
  const msg = ev?.data?.message;
  if (msg?.toolCallId && msg.source?.callId && msg.toolCallId !== msg.source.callId) return null;
  return msg?.toolCallId ?? msg?.source?.callId;
}
export function charsOfBlocks(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const b of content) {
    if (typeof b === 'string') total += b.length;
    if (typeof b?.text === 'string') total += b.text.length;
    if (typeof b?.thinking === 'string') total += b.thinking.length;
    if (b?.type === 'tool-call') {
      total += String(b.name ?? '').length;
      if (typeof b.arguments === 'string') total += b.arguments.length;
      else if (b.arguments !== undefined) { try { total += JSON.stringify(b.arguments).length; } catch { /* not serializable */ } }
    }
  }
  return total;
}
export function charsOfMessage(msg) { return charsOfBlocks(msg?.content ?? msg?.text); }
export function charsOfSurfaceEvent(ev) { return charsOfMessage(ev?.type === 'user/message' ? ev.data : ev?.data?.message); }
export function hasActiveCompaction(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i]?.type;
    if (t === 'compaction/start') return true;
    if (t === 'compaction/end' || t === 'session/end-seed') break;
  }
  return false;
}
export function lastModelInteractionTime(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if ((ev?.type === 'turn/end' || ev?.type === 'assistant/message') && Number.isFinite(ev.time)) return ev.time;
  }
  return null;
}
function inspectSurface(surfaceEvents) {
  const cuts = [true], unmetered = new Set(), open = new Map();
  let valid = true;
  for (const [i, ev] of surfaceEvents.entries()) {
    if (!ev) valid = false;
    if (ev?.type === 'assistant/message') {
      if (open.size) valid = false;
      const calls = toolCalls(ev), skill = calls.some(c => c.name === 'skill');
      if (skill) unmetered.add(i);
      for (const c of calls) {
        if (!c.id || !c.name || open.has(c.id)) valid = false;
        open.set(c.id, { turn: ev.data.turn, step: ev.data.step, skill });
      }
    } else if (ev?.type === 'tool/result') {
      const id = resultId(ev), call = open.get(id);
      if (!call || call.turn !== ev.data.turn || call.step !== ev.data.step) valid = false;
      if (call?.skill) unmetered.add(i);
      open.delete(id);
    }
    cuts.push(valid && !open.size);
  }
  return { cuts, unmetered };
}
export function inspectLayers(session, events = readSessionEvents(session)) {
  const nodes = [...(session.surface?.nodes ?? [])];
  const surfaceEvents = nodes.map(seq => session.eventAt?.(seq) ?? (events[seq]?.seq === seq ? events[seq] : events.find(ev => ev.seq === seq)));
  // The tag alone cannot establish a boundary: its fields and earlier references must agree with the log.
  let history;
  const lastLayerIdx = surfaceEvents.findLastIndex(ev => layerOf(ev) === 'equivalence'
    && (history ??= collectFocusHistory(events)).sources.has(ev.seq));
  return { nodes, surfaceEvents, history, lastLayerIdx, ...inspectSurface(surfaceEvents) };
}
export function isSurfaceSpanBalanced(events, start, end) {
  const { cuts } = inspectSurface(events);
  return start >= 0 && end >= start && end < events.length && cuts[start] && cuts[end + 1];
}
function replacement(nodes, start, end, msg) {
  return ['user/message', msg, { surfaceOp: { op: 'replace', startSeq: nodes[start], endSeq: nodes[end] }, sourceEventSeqs: nodes.slice(start, end + 1) }];
}
function hasIndependentToolDefinitions(session) {
  // On the native request path a surface edit starts a new declaration series.
  // Require that path and immediate schemas; a deferred tool can still need its activation message.
  if (typeof session.requestHeader !== 'function' || typeof session.toolHistory !== 'function'
    || !Number.isSafeInteger(session.surface?.contentGeneration)) return false;
  const tools = session.requestHeader()?.tools;
  const history = session.toolHistory();
  return Array.isArray(history?.tools) && Array.isArray(history.updates) && Array.isArray(tools)
    && tools.every(t => typeof t?.name === 'string' && t.name.length > 0 && typeof t.description === 'string'
      && t.parameters?.type === 'object' && t.deferLoading !== true);
}
function fixed(ev, independentTools) {
  if (ev?.type === 'system/message') return true;
  if (ev?.type !== 'developer/message') return false;
  const msg = ev.data?.message;
  const registry = msg?.source?.kind === 'tool-registry';
  const toolChange = b => b?.type === 'tool-addition' || b?.type === 'tool-removal';
  if (!registry) return msg?.content?.some(toolChange) === true;
  return !(Array.isArray(msg.content) && msg.content.length &&
    msg.content.every(b => toolChange(b) && typeof b.toolName === 'string' && b.toolName.length > 0
      && Object.keys(b).every(key => key === 'type' || key === 'toolName')) && independentTools());
}
export function foldPendingEquivalences(session, { now = Date.now(), turn = 0, step = 0, onDiagnostic = () => {} } = {}) {
  const events = readSessionEvents(session);
  if (hasActiveCompaction(events)) return null;
  const inspected = inspectLayers(session, events);
  const { nodes, surfaceEvents: evs, cuts, lastLayerIdx } = inspected;
  let independentTools;
  const isFixed = ev => fixed(ev, () => (independentTools ??= hasIndependentToolDefinitions(session)));
  let start = lastLayerIdx + 1;
  if (lastLayerIdx < 0) while (start < evs.length && isFixed(evs[start])) start++;
  const first = start;
  const matches = [];
  let history = inspected.history;
  for (let i = start; i + 1 < evs.length; i++) {
    if (isFixed(evs[i])) break; // Never leave a hole or lower the authority of an instruction.
    const calls = toolCalls(evs[i]);
    if (calls.length !== 1 || calls[0].name !== FOCUS_TOOL_NAME || !cuts[i] || !cuts[i + 2]) continue;
    if (evs[i + 1]?.type !== 'tool/result' || resultId(evs[i + 1]) !== calls[0].id) continue;
    history ??= collectFocusHistory(events);
    const checkpoint = history.checkpoints.get(nodes[i]);
    if (checkpoint) matches.push({ i, ...checkpoint });
  }
  if (!matches.length) return null;
  const inputs = [];
  for (const match of matches) {
    const { i, layer, currentTodos } = match;
    const end = i + 1;
    const messages = [buildFocusLayerMessage(layer, now)];
    if (match === matches.at(-1)) {
      if (currentTodos?.length) messages.push(buildTodoMessage(currentTodos, now));
      if (layer.next?.length) messages.push(buildObjectiveMessage({ entries: layer.next, origin: 'model', now }));
    }
    const slots = end - start + 1;
    // Append only at the true tail. Otherwise a hint could override newer instructions.
    if (messages.length > slots && end !== nodes.length - 1) return null;
    const replacements = Math.min(slots, messages.length);
    let cursor = start;
    for (const [index, message] of messages.entries()) {
      if (index < replacements) {
        const through = end - (replacements - 1 - index);
        inputs.push(replacement(nodes, cursor, through, message));
        cursor = through + 1;
      } else {
        inputs.push(['user/message', message, { surfaceOp: 'append' }]);
      }
    }
    start = end + 1;
  }
  session.append(inputs);
  const beforeChars = evs.slice(first, start).reduce((n, ev) => n + charsOfSurfaceEvent(ev), 0);
  const afterChars = inputs.reduce((n, [, msg]) => n + charsOfMessage(msg), 0);
  onDiagnostic({
    event: 'folded', sessionId: session.id, turn, step,
    keys: matches.map(m => m.layer.key), equateArgs: matches.map(m => m.args),
    replacedRange: { startSeq: nodes[first], endSeq: nodes[start - 1] }, beforeChars, afterChars,
  });
  return { beforeChars, afterChars };
}
function totalChars(evs, incoming) { return evs.reduce((n, ev) => n + charsOfSurfaceEvent(ev), 0) + incoming.reduce((n, msg) => n + charsOfMessage(msg), 0); }
export function compactEquivalencesIfNeeded(session, config, { incomingMessages = [], now = Date.now(), onDiagnostic = () => {} } = {}) {
  const events = readSessionEvents(session);
  if (hasActiveCompaction(events)) return null;
  const { nodes, surfaceEvents: evs, cuts, lastLayerIdx, history } = inspectLayers(session, events);
  if (lastLayerIdx < 0) return null;
  const last = lastModelInteractionTime(events);
  const idle = last !== null && now - last >= config.idleMinutes * 60_000;
  if (!idle && totalChars(evs, incomingMessages) < config.compactChars) return null;
  const { sources } = history;
  const inputs = [], removedKeys = [];
  for (let i = 0; i < evs.length;) {
    if (!sources.has(nodes[i]) || !cuts[i]) { i++; continue; }
    const begin = i;
    while (i < evs.length && sources.has(nodes[i]) && cuts[i + 1]) i++;
    if (i === begin) { i++; continue; }
    const covered = new Set(), drop = new Set();
    for (let j = i - 1; j >= begin; j--) {
      const s = sourceOf(evs[j]);
      if (covered.has(s.key)) drop.add(j);
      for (const k of s.supersedes) covered.add(k);
    }
    // A replace-only surface can discard consecutive dead layers by replacing them together with their next live neighbor.
    for (let j = begin; j < i;) {
      if (!drop.has(j)) { j++; continue; }
      const start = j;
      while (drop.has(j)) { removedKeys.push(sourceOf(evs[j]).key); j++; }
      inputs.push(replacement(nodes, start, j, { ...evs[j].data, id: randomUUID() }));
      j++;
    }
  }
  if (!inputs.length) return null;
  session.append(inputs);
  const result = { reason: idle ? 'idle' : 'threshold', removedKeys };
  onDiagnostic({ event: 'compacted', sessionId: session.id, ...result });
  return result;
}
export function evaluateUnconvertedNudge(session, decisionMessages, config, { onDiagnostic = () => {} } = {}) {
  const incoming = Array.isArray(decisionMessages) ? decisionMessages : [];
  const notice = s => s?.kind === FOCUS_SOURCE_KIND && (s.layer === 'nudge' || s.layer === 'pressure');
  if (incoming.some(msg => notice(msg.source))) return null;
  const { surfaceEvents: evs, unmetered, lastLayerIdx } = inspectLayers(session);
  const tail = lastLayerIdx + 1;
  const chars = totalChars(evs, incoming);
  if (chars >= config.compactChars && lastLayerIdx >= 0 && !evs.slice(tail).some(ev => layerOf(ev) === 'pressure')) {
    onDiagnostic({ event: 'pressure', sessionId: session.id, chars });
    return buildPressureMessage(chars);
  }
  let unconvertedChars = 0, atLastNudge = null;
  for (let i = tail; i < evs.length; i++) {
    if (layerOf(evs[i]) === 'nudge') atLastNudge = unconvertedChars;
    if (!unmetered.has(i) && ['assistant/message', 'tool/result'].includes(evs[i]?.type)) unconvertedChars += charsOfSurfaceEvent(evs[i]);
  }
  if (unconvertedChars < config.nudgeChars || (atLastNudge !== null && unconvertedChars - atLastNudge < Math.max(8000, Math.floor(config.nudgeChars / 2)))) return null;
  onDiagnostic({ event: 'nudged', sessionId: session.id, unconvertedChars, nudgeChars: config.nudgeChars });
  return buildNudgeMessage(unconvertedChars);
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
    try { foldPendingEquivalences(session, { now: time, turn, step, onDiagnostic }); } catch (error) { report('fold-error', error); }
    try { compactEquivalencesIfNeeded(session, config, { incomingMessages: messages, now: time, onDiagnostic }); } catch (error) { report('compact-error', error); }
    const decision = await next();
    if (!decision || decision.kind === 'reject' || signal?.aborted) return decision;
    try {
      const nudge = evaluateUnconvertedNudge(session, decision.messages, config, { onDiagnostic });
      if (nudge) return { ...decision, messages: [...decision.messages, nudge] };
    } catch (error) { report('nudge-error', error); }
    return decision;
  };
}
