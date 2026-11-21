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

const INITIAL_BASE_USER_KINDS = new Set(['runtime-context', 'skill-catalog', 'agent-instructions']);

function eventAtSeq(session, events, seq) {
  if (typeof session?.eventAt === 'function') {
    const found = session.eventAt(seq);
    if (found) return found;
  }
  const direct = events[seq];
  if (direct && direct.seq === seq) return direct;
  return events.find((item) => item?.seq === seq);
}

function messageOfSurfaceEvent(event) {
  if (!event) return null;
  if (event.type === 'user/message') return event.data ?? null;
  if (
    event.type === 'system/message'
    || event.type === 'developer/message'
    || event.type === 'assistant/message'
    || event.type === 'tool/result'
  ) {
    return event.data?.message ?? null;
  }
  return null;
}

export function charsOfBlocks(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (!block) continue;
    if (typeof block === 'string') {
      total += block.length;
      continue;
    }
    if (typeof block.text === 'string') total += block.text.length;
    if (typeof block.thinking === 'string') total += block.thinking.length;
    if (block.type === 'tool-call') {
      total += String(block.name ?? '').length;
      if (typeof block.arguments === 'string') total += block.arguments.length;
      else if (block.arguments !== undefined) {
        try { total += JSON.stringify(block.arguments).length; } catch { /* ignore */ }
      }
    }
  }
  return total;
}

export function charsOfMessage(message) {
  if (!message || typeof message !== 'object') return 0;
  if (Array.isArray(message.content) || typeof message.content === 'string') {
    return charsOfBlocks(message.content);
  }
  if (typeof message.text === 'string') return message.text.length;
  return 0;
}

export function charsOfSurfaceEvent(event) {
  return charsOfMessage(messageOfSurfaceEvent(event));
}

export function textOfUserMessage(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.text === 'string') return message.text;
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

export function hasActiveCompaction(events) {
  let latestEndSeedSeq = -1;
  let unmatchedStartSeq = null;
  let known = false;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (latestEndSeedSeq === -1 && event.type === 'session/end-seed') {
      latestEndSeedSeq = typeof event.seq === 'number' ? event.seq : index;
    }
    if (!known) {
      if (event.type === 'compaction/start') {
        unmatchedStartSeq = typeof event.seq === 'number' ? event.seq : index;
        known = true;
      } else if (event.type === 'compaction/end') {
        known = true;
      }
    }
    if (known && latestEndSeedSeq !== -1) break;
  }
  if (unmatchedStartSeq === null) return false;
  return unmatchedStartSeq > latestEndSeedSeq;
}

function isInitialBaseNode(event, index) {
  if (!event) return false;
  if (index === 0 && event.type === 'system/message') return true;
  if (event.type === 'system/message' || event.type === 'developer/message') return true;
  if (event.type === 'user/message') {
    const kind = event.data?.source?.kind;
    if (INITIAL_BASE_USER_KINDS.has(kind)) return true;
  }
  return false;
}

/**
 * Compute four-layer boundaries on `surface.nodes`:
 * - `[0, baseEndExclusive)`: Layer 1 (base layer, never shadowed)
 * - `[conclusionStartIdx, conclusionEndExclusive)`: Layer 2 (conclusion layer)
 * - `objectiveIdx`: Layer 3 (prompt/objective layer, or -1 if absent)
 * - `[unconvertedStartIdx, nodes.length)`: Layer 4 (unconverted layer)
 */
export function inspectLayers(session, events = readSessionEvents(session)) {
  const nodes = Array.isArray(session?.surface?.nodes) ? [...session.surface.nodes] : [];
  const surfaceEvents = nodes.map((seq) => eventAtSeq(session, events, seq));

  let baseEndExclusive = 0;
  while (baseEndExclusive < surfaceEvents.length && isInitialBaseNode(surfaceEvents[baseEndExclusive], baseEndExclusive)) {
    baseEndExclusive += 1;
  }

  let conclusionStartIdx = baseEndExclusive;
  let conclusionEndExclusive = baseEndExclusive;
  while (conclusionEndExclusive < surfaceEvents.length) {
    const ev = surfaceEvents[conclusionEndExclusive];
    if (ev?.type === 'user/message' && ev.data?.source?.kind === FOCUS_SOURCE_KIND && ev.data?.source?.layer === 'conclusion') {
      conclusionEndExclusive += 1;
    } else {
      break;
    }
  }

  let objectiveIdx = -1;
  if (conclusionEndExclusive > conclusionStartIdx) {
    // Folded state: objective layer is an explicit layer === 'objective' node right after conclusions (if present)
    const candidate = surfaceEvents[conclusionEndExclusive];
    if (candidate?.type === 'user/message' && candidate.data?.source?.kind === FOCUS_SOURCE_KIND && candidate.data?.source?.layer === 'objective') {
      objectiveIdx = conclusionEndExclusive;
    }
  } else {
    // Unfolded state: first real trigger user message after base layer acts as initial prompt layer
    for (let idx = baseEndExclusive; idx < surfaceEvents.length; idx += 1) {
      const ev = surfaceEvents[idx];
      if (ev?.type === 'user/message' && TRIGGER_SOURCE_KINDS.has(ev.data?.source?.kind)) {
        objectiveIdx = idx;
        break;
      }
    }
  }

  const unconvertedStartIdx = objectiveIdx >= 0
    ? objectiveIdx + 1
    : conclusionEndExclusive;

  return {
    nodes,
    surfaceEvents,
    baseEndExclusive,
    conclusionStartIdx,
    conclusionEndExclusive,
    objectiveIdx,
    unconvertedStartIdx,
  };
}

/**
 * Verify that `nodes[startIdx .. endIdx]` is balanced with respect to tool-call / tool/result pairs:
 * 1. Prefix `[0 .. startIdx)` has 0 open tool calls;
 * 2. Span `[startIdx .. endIdx]` never goes negative and ends with 0 open tool calls.
 */
export function isSurfaceSpanBalanced(surfaceEvents, startIdx, endIdx) {
  if (startIdx <= 0 || startIdx > endIdx || endIdx >= surfaceEvents.length) return false;
  let openCalls = 0;
  for (let i = 0; i < surfaceEvents.length; i += 1) {
    if (i === startIdx && openCalls !== 0) return false;
    const ev = surfaceEvents[i];
    if (!ev) return false;
    if (ev.type === 'assistant/message') {
      const content = ev.data?.message?.content;
      const calls = Array.isArray(content) ? content.filter((b) => b?.type === 'tool-call').length : 0;
      openCalls += calls;
    } else if (ev.type === 'tool/result') {
      openCalls -= 1;
      if (openCalls < 0) return false;
    }
    if (i === endIdx && openCalls !== 0) return false;
  }
  return true;
}

function parseRawToolCallArgs(rawArgs) {
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) return rawArgs;
  if (typeof rawArgs === 'string') {
    try { return JSON.parse(rawArgs); } catch { return null; }
  }
  return null;
}

/**
 * Scan `surfaceEvents` after `afterIdx` for completed successful `focus_conclude` pairs `[callIdx, resultIdx]`.
 * Also falls back to `tool/call` log events for argument lookup when needed.
 */
function findPendingFocusConcludeCalls(surfaceEvents, startIdx, events) {
  const toolCallArgsById = new Map();
  for (const ev of events) {
    if (ev?.type === 'tool/call' && ev.data?.name === FOCUS_TOOL_NAME && ev.data?.callId) {
      toolCallArgsById.set(ev.data.callId, ev.data.arguments);
    }
  }

  const assistantCalls = new Map();
  const matched = [];

  for (let idx = startIdx; idx < surfaceEvents.length; idx += 1) {
    const ev = surfaceEvents[idx];
    if (!ev) continue;
    if (ev.type === 'assistant/message') {
      const blocks = Array.isArray(ev.data?.message?.content)
        ? ev.data.message.content.filter((b) => b?.type === 'tool-call')
        : [];
      // Hard rule: never fold a parallel tool-call assistant message
      if (blocks.length === 1 && blocks[0]?.name === FOCUS_TOOL_NAME) {
        const block = blocks[0];
        const callId = block.id ?? block.callId ?? block.toolCallId;
        if (callId) {
          assistantCalls.set(callId, {
            callIdx: idx,
            callSeq: ev.seq,
            rawArgs: block.arguments ?? block.input ?? toolCallArgsById.get(callId),
          });
        }
      }
    } else if (ev.type === 'tool/result') {
      const msg = ev.data?.message;
      const callId = msg?.toolCallId ?? msg?.source?.callId;
      if (!callId || msg?.isError === true || ev.data?.error !== undefined) continue;
      const callInfo = assistantCalls.get(callId);
      if (!callInfo) continue;
      const parsedObj = parseRawToolCallArgs(callInfo.rawArgs ?? toolCallArgsById.get(callId));
      if (!parsedObj) continue;
      try {
        const validated = validateFocusConcludeArgs(parsedObj);
        matched.push({
          callIdx: callInfo.callIdx,
          callSeq: callInfo.callSeq,
          resultIdx: idx,
          resultSeq: ev.seq,
          entries: validated.entries,
          objective: validated.objective,
        });
      } catch {
        // Invalid args cannot fold
      }
    }
  }

  return matched;
}

function resolveObjectiveForFold(surfaceEvents, startIdx, callIdx, explicitObjective) {
  if (typeof explicitObjective === 'string' && explicitObjective.trim().length > 0) {
    return { rawText: explicitObjective.trim(), origin: 'model' };
  }
  // Search backward in [startIdx .. callIdx) for the latest real user/chat/wake trigger message
  for (let idx = callIdx - 1; idx >= startIdx; idx -= 1) {
    const ev = surfaceEvents[idx];
    if (ev?.type !== 'user/message') continue;
    const kind = ev.data?.source?.kind;
    if (!TRIGGER_SOURCE_KINDS.has(kind)) continue;
    const text = textOfUserMessage(ev.data).trim();
    if (text) return { rawText: text, origin: 'carried' };
  }
  // Fallback: carry forward the previous layer === 'objective' node inside [startIdx .. callIdx)
  for (let idx = callIdx - 1; idx >= startIdx; idx -= 1) {
    const ev = surfaceEvents[idx];
    if (ev?.type === 'user/message' && ev.data?.source?.kind === FOCUS_SOURCE_KIND && ev.data?.source?.layer === 'objective') {
      const saved = typeof ev.data.source.rawText === 'string' && ev.data.source.rawText.trim()
        ? ev.data.source.rawText.trim()
        : textOfUserMessage(ev.data).trim();
      if (saved) return { rawText: saved, origin: 'carried' };
    }
  }
  return null;
}

export function foldPendingConclusions(session, { now = Date.now(), turn = 0, step = 0, onDiagnostic = () => {} } = {}) {
  const events = readSessionEvents(session);
  const layout = inspectLayers(session, events);
  const startIdx = layout.conclusionEndExclusive;
  if (startIdx <= 0 || startIdx >= layout.surfaceEvents.length) return null;

  const matches = findPendingFocusConcludeCalls(layout.surfaceEvents, startIdx, events);
  if (matches.length === 0) return null;

  const latest = matches[matches.length - 1];
  const endIdx = latest.resultIdx;
  const callIdx = latest.callIdx;

  if (!isSurfaceSpanBalanced(layout.surfaceEvents, startIdx, endIdx)) {
    onDiagnostic({
      event: 'fold-skipped-unbalanced',
      sessionId: session?.id ?? null,
      turn,
      step,
      startSeq: layout.nodes[startIdx],
      endSeq: layout.nodes[endIdx],
    });
    return null;
  }

  // Merge entries in order across all matched focus_conclude calls in the span
  const mergedMap = new Map();
  let chosenObjective = '';
  for (const item of matches) {
    for (const entry of item.entries) {
      if (mergedMap.has(entry.key)) mergedMap.delete(entry.key);
      mergedMap.set(entry.key, entry);
    }
    if (item.objective) chosenObjective = item.objective;
  }
  const mergedEntries = [...mergedMap.values()];
  const objectiveInfo = resolveObjectiveForFold(layout.surfaceEvents, startIdx, callIdx, chosenObjective);

  const beforeChars = layout.surfaceEvents
    .slice(startIdx, endIdx + 1)
    .reduce((sum, ev) => sum + charsOfSurfaceEvent(ev), 0);

  const conclusionMsg = buildConclusionMessage(mergedEntries, now);
  const startSeq = layout.nodes[startIdx];
  const endSeq = layout.nodes[endIdx];
  let deferredObjectiveMessage = null;
  let afterChars = charsOfMessage(conclusionMsg);

  if (startIdx < callIdx) {
    // Normal two-segment replace:
    // 1. [startSeq .. preCallSeq] -> conclusionMsg
    // 2. [callSeq .. endSeq] -> objectiveMsg (or single replace if no objective exists)
    const preCallIdx = callIdx - 1;
    const preCallSeq = layout.nodes[preCallIdx];
    const callSpanSeqs = layout.nodes.slice(callIdx, endIdx + 1);
    const beforeCallSeqs = layout.nodes.slice(startIdx, callIdx);

    if (objectiveInfo && isSurfaceSpanBalanced(layout.surfaceEvents, startIdx, preCallIdx) && isSurfaceSpanBalanced(layout.surfaceEvents, callIdx, endIdx)) {
      const objectiveMsg = buildObjectiveMessage({
        rawText: objectiveInfo.rawText,
        origin: objectiveInfo.origin,
        now,
      });
      afterChars += charsOfMessage(objectiveMsg);
      session.append('user/message', conclusionMsg, {
        surfaceOp: { op: 'replace', startSeq, endSeq: preCallSeq },
        sourceEventSeqs: beforeCallSeqs,
      });
      session.append('user/message', objectiveMsg, {
        surfaceOp: { op: 'replace', startSeq: layout.nodes[callIdx], endSeq },
        sourceEventSeqs: callSpanSeqs,
      });
    } else {
      const allShadowed = layout.nodes.slice(startIdx, endIdx + 1);
      session.append('user/message', conclusionMsg, {
        surfaceOp: { op: 'replace', startSeq, endSeq },
        sourceEventSeqs: allShadowed,
      });
      if (objectiveInfo) {
        deferredObjectiveMessage = buildObjectiveMessage({
          rawText: objectiveInfo.rawText,
          origin: objectiveInfo.origin,
          now,
          asNotice: true,
        });
        afterChars += charsOfMessage(deferredObjectiveMessage);
      }
    }
  } else {
    // Degenerate path: startIdx === callIdx
    const allShadowed = layout.nodes.slice(startIdx, endIdx + 1);
    session.append('user/message', conclusionMsg, {
      surfaceOp: { op: 'replace', startSeq, endSeq },
      sourceEventSeqs: allShadowed,
    });
    if (objectiveInfo) {
      deferredObjectiveMessage = buildObjectiveMessage({
        rawText: objectiveInfo.rawText,
        origin: objectiveInfo.origin,
        now,
        asNotice: true,
      });
      afterChars += charsOfMessage(deferredObjectiveMessage);
    }
  }

  onDiagnostic({
    event: 'folded',
    sessionId: session?.id ?? null,
    turn,
    step,
    replacedRange: { startSeq, endSeq },
    keys: mergedEntries.map((item) => item.key),
    origin: objectiveInfo?.origin ?? 'none',
    beforeChars,
    afterChars,
  });

  return {
    deferredObjectiveMessage,
    beforeChars,
    afterChars,
  };
}

/**
 * Find the timestamp of the last completed model interaction (`turn/end` or `assistant/message`),
 * deliberately ignoring the freshly opened `turn/start` or current incoming user message.
 */
export function lastModelInteractionTime(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === 'turn/end' || event.type === 'assistant/message') {
      if (typeof event.time === 'number' && Number.isFinite(event.time)) {
        return event.time;
      }
    }
  }
  return null;
}

/**
 * Deterministically merge, purge tombstones, and cap entries to `maxConclusionChars`.
 */
export function compactConclusionEntries(rawEntriesList, maxConclusionChars) {
  const ordered = new Map();
  const retiredKeys = new Set();

  for (const entries of rawEntriesList) {
    if (!Array.isArray(entries)) continue;
    for (const raw of entries) {
      const key = typeof raw?.key === 'string' ? raw.key.trim() : '';
      const text = typeof raw?.text === 'string' ? raw.text : '';
      if (!key) continue;
      if (ordered.has(key)) ordered.delete(key);
      ordered.set(key, { key, text });
    }
  }

  const active = [];
  for (const [key, entry] of ordered.entries()) {
    if (entry.text === '') {
      retiredKeys.add(key);
    } else {
      active.push(entry);
    }
  }

  if (active.length === 0) {
    return { entries: [], droppedKeys: [...retiredKeys] };
  }

  const wrapperOverhead = renderConclusionsText([{ key: 'k', text: 'v' }]).length - renderConclusionLine({ key: 'k', text: 'v' }).length;
  const keptReversed = [];
  const evictedKeys = [];
  let usedChars = wrapperOverhead;

  for (let idx = active.length - 1; idx >= 0; idx -= 1) {
    const item = active[idx];
    const lineLen = renderConclusionLine(item).length + (keptReversed.length > 0 ? 1 : 0);
    if (keptReversed.length === 0 && usedChars + lineLen > maxConclusionChars) {
      // Single newest entry exceeds cap: truncate its text to fit within maxConclusionChars
      const prefixOverhead = wrapperOverhead + `- [${item.key}]: `.length;
      const available = Math.max(1, maxConclusionChars - prefixOverhead - 1);
      const truncatedText = item.text.length > available ? `${item.text.slice(0, Math.max(1, available - 1))}…` : item.text;
      keptReversed.push({ key: item.key, text: truncatedText });
      for (let older = idx - 1; older >= 0; older -= 1) {
        evictedKeys.push(active[older].key);
      }
      break;
    }
    if (usedChars + lineLen <= maxConclusionChars) {
      keptReversed.push(item);
      usedChars += lineLen;
    } else {
      for (let older = idx; older >= 0; older -= 1) {
        evictedKeys.push(active[older].key);
      }
      break;
    }
  }

  keptReversed.reverse();
  return {
    entries: keptReversed,
    droppedKeys: [...new Set([...retiredKeys, ...evictedKeys.reverse()])],
  };
}

function entriesEquivalent(rawNodesEntries, compactedEntries) {
  if (rawNodesEntries.length !== 1) return false;
  const single = rawNodesEntries[0];
  if (!Array.isArray(single) || single.length !== compactedEntries.length) return false;
  for (let i = 0; i < single.length; i += 1) {
    if (single[i]?.key !== compactedEntries[i]?.key || single[i]?.text !== compactedEntries[i]?.text) {
      return false;
    }
  }
  return true;
}

export function compactConclusionsIfNeeded(
  session,
  config,
  { incomingMessages = [], now = Date.now(), onDiagnostic = () => {} } = {},
) {
  const events = readSessionEvents(session);
  const layout = inspectLayers(session, events);
  const conclusionCount = layout.conclusionEndExclusive - layout.conclusionStartIdx;
  if (conclusionCount <= 0) return null;

  const surfaceChars = layout.surfaceEvents.reduce((sum, ev) => sum + charsOfSurfaceEvent(ev), 0);
  const incomingChars = (Array.isArray(incomingMessages) ? incomingMessages : [])
    .reduce((sum, msg) => sum + charsOfMessage(msg), 0);
  const totalChars = surfaceChars + incomingChars;

  const lastInteractionAt = lastModelInteractionTime(events);
  const idleElapsedMs = lastInteractionAt !== null ? now - lastInteractionAt : 0;
  const idleTriggered = lastInteractionAt !== null && idleElapsedMs >= config.idleMinutes * 60_000;
  const thresholdTriggered = totalChars >= config.compactChars;

  if (!idleTriggered && !thresholdTriggered) return null;

  const conclusionEvents = layout.surfaceEvents.slice(layout.conclusionStartIdx, layout.conclusionEndExclusive);
  const rawNodesEntries = conclusionEvents.map((ev) => (Array.isArray(ev?.data?.source?.entries) ? ev.data.source.entries : []));
  const { entries: compactedEntries, droppedKeys } = compactConclusionEntries(rawNodesEntries, config.maxConclusionChars);

  // Guard: skip no-op replace when already 1 node, no duplicates, no tombstones, and under cap
  if (entriesEquivalent(rawNodesEntries, compactedEntries)) {
    return null;
  }

  const beforeChars = conclusionEvents.reduce((sum, ev) => sum + charsOfSurfaceEvent(ev), 0);
  const compactedMsg = buildConclusionMessage(compactedEntries, now);
  const afterChars = charsOfMessage(compactedMsg);
  const conclusionSeqs = layout.nodes.slice(layout.conclusionStartIdx, layout.conclusionEndExclusive);
  const firstConclusionSeq = conclusionSeqs[0];
  const lastConclusionSeq = conclusionSeqs[conclusionSeqs.length - 1];

  session.append('user/message', compactedMsg, {
    surfaceOp: { op: 'replace', startSeq: firstConclusionSeq, endSeq: lastConclusionSeq },
    sourceEventSeqs: conclusionSeqs,
  });

  const reason = thresholdTriggered ? 'threshold' : 'idle';
  onDiagnostic({
    event: 'compacted',
    sessionId: session?.id ?? null,
    reason,
    beforeNodes: conclusionCount,
    afterNodes: 1,
    beforeChars,
    afterChars,
    removedKeys: droppedKeys,
  });

  return {
    reason,
    beforeNodes: conclusionCount,
    afterNodes: 1,
    beforeChars,
    afterChars,
    removedKeys: droppedKeys,
  };
}

export function evaluateUnconvertedNudge(
  session,
  decisionMessages,
  config,
  { onDiagnostic = () => {} } = {},
) {
  const events = readSessionEvents(session);
  const layout = inspectLayers(session, events);
  const unconvertedEvents = layout.surfaceEvents.slice(layout.unconvertedStartIdx);

  const surfaceUnconvertedChars = unconvertedEvents.reduce((sum, ev) => sum + charsOfSurfaceEvent(ev), 0);
  const incomingChars = (Array.isArray(decisionMessages) ? decisionMessages : [])
    .reduce((sum, msg) => sum + charsOfMessage(msg), 0);
  const unconvertedChars = surfaceUnconvertedChars + incomingChars;

  // Check if a nudge already exists in the unconverted layer (either on surface or in decisionMessages)
  let lastNudgeIdx = -1;
  for (let i = unconvertedEvents.length - 1; i >= 0; i -= 1) {
    const ev = unconvertedEvents[i];
    if (ev?.type === 'user/message' && ev.data?.source?.kind === FOCUS_SOURCE_KIND && ev.data?.source?.layer === 'nudge') {
      lastNudgeIdx = i;
      break;
    }
  }
  const decisionHasNudge = (Array.isArray(decisionMessages) ? decisionMessages : []).some(
    (msg) => msg?.source?.kind === FOCUS_SOURCE_KIND && msg?.source?.layer === 'nudge',
  );
  if (decisionHasNudge) return null;

  if (lastNudgeIdx === -1) {
    if (unconvertedChars < config.nudgeChars) return null;
  } else {
    const charsSinceLastNudge = unconvertedEvents
      .slice(lastNudgeIdx + 1)
      .reduce((sum, ev) => sum + charsOfSurfaceEvent(ev), 0) + incomingChars;
    const repeatStep = Math.max(8000, Math.floor(config.nudgeChars / 2));
    if (charsSinceLastNudge < repeatStep) return null;
  }

  const nudgeMessage = buildNudgeMessage();
  onDiagnostic({
    event: 'nudged',
    sessionId: session?.id ?? null,
    unconvertedChars,
    nudgeChars: config.nudgeChars,
  });
  return nudgeMessage;
}

export function createPreStepHandler({
  loadConfig,
  allowed,
  now = () => Date.now(),
  onDiagnostic = () => {},
}) {
  return async (payload, next) => {
    const { agent, messages, turn, step, signal } = payload ?? {};
    if (!agent?.session || signal?.aborted || !allowed(agent)) {
      return next();
    }

    const session = agent.session;
    const initialEvents = readSessionEvents(session);
    if (hasActiveCompaction(initialEvents)) {
      return next();
    }

    let config;
    try {
      config = loadConfig();
    } catch (error) {
      onDiagnostic({
        event: 'config-error',
        sessionId: session.id ?? null,
        message: String(error?.message ?? error),
      });
      return next();
    }

    let deferredObjectiveMessage = null;
    const currentNow = now();

    // Stage A: Fold completed focus_conclude call(s) before inner pre-step listeners inspect surface
    try {
      const folded = foldPendingConclusions(session, {
        now: currentNow,
        turn,
        step,
        onDiagnostic,
      });
      if (folded?.deferredObjectiveMessage) {
        deferredObjectiveMessage = folded.deferredObjectiveMessage;
      }
    } catch (error) {
      onDiagnostic({
        event: 'fold-error',
        sessionId: session.id ?? null,
        message: String(error?.message ?? error),
      });
    }

    // Stage B: Deterministic conclusion-layer compaction on threshold or idle timeout
    try {
      compactConclusionsIfNeeded(session, config, {
        incomingMessages: messages,
        now: currentNow,
        onDiagnostic,
      });
    } catch (error) {
      onDiagnostic({
        event: 'compact-error',
        sessionId: session.id ?? null,
        message: String(error?.message ?? error),
      });
    }

    const decision = await next();
    if (!decision || decision.kind === 'reject' || signal?.aborted) {
      return decision;
    }

    let nextMessages = Array.isArray(decision.messages) ? decision.messages : [];
    let mutated = false;

    if (deferredObjectiveMessage) {
      nextMessages = [...nextMessages, deferredObjectiveMessage];
      mutated = true;
    }

    // Stage C: Unconverted layer thickness nudge
    try {
      const nudge = evaluateUnconvertedNudge(session, nextMessages, config, { onDiagnostic });
      if (nudge) {
        nextMessages = [...nextMessages, nudge];
        mutated = true;
      }
    } catch (error) {
      onDiagnostic({
        event: 'nudge-error',
        sessionId: session.id ?? null,
        message: String(error?.message ?? error),
      });
    }

    return mutated ? { ...decision, messages: nextMessages } : decision;
  };
}
