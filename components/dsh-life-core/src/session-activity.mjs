/**
 * "When did the conversation last move?" asked of the session itself.
 *
 * The wake engine used to answer this by polling `agent.status` every 30s and
 * remembering the last time it happened to see `idle`. That answer is only as
 * good as our own uptime: a Host restart erased the memory of everything the
 * owner did while the previous process was not running, and a four-hour-old
 * number was presented as "已经过了 3 小时 57 分" minutes after a real reply.
 *
 * The session log already knows. Every event carries `time` in epoch
 * milliseconds, so the newest *conversational* one is, literally, the moment
 * the conversation last ended.
 *
 * Not every event counts. The Host also appends bookkeeping to the same log —
 * `session/end-seed` when a session is (re)seeded on startup, `session/title`,
 * `workspace/changes`, `request/header`, `agent/inbox/spliced`, job records.
 * Taking the newest event of *any* kind made a restart look like activity: the
 * 14:40 `session/end-seed` of a restart pushed "上次结束行动" past my real 14:37
 * reply. So only the events that mean somebody did something count.
 */

/** Events that mean the conversation moved; everything else is bookkeeping. */
const ACTIVITY_TYPES = new Set([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'user/message',
  'assistant/message',
  'tool/call',
  'tool/result',
]);

export function isActivityEvent(event) {
  return ACTIVITY_TYPES.has(String(event?.type ?? ''));
}

export function eventsOf(session) {
  if (typeof session?.snapshotEvents === 'function') {
    const events = session.snapshotEvents();
    if (Array.isArray(events) && events.length > 0) return events;
  }
  if (Array.isArray(session?.events) && session.events.length > 0) return session.events;
  if (typeof session?.ownEvents === 'function') {
    const own = session.ownEvents();
    if (Array.isArray(own) && own.length > 0) return own;
  }
  return [];
}

/** What the last tick actually saw, so a wrong number can be diagnosed. */
export function describeActivity(sessions, sessionId) {
  const id = String(sessionId ?? '').trim();
  const report = {
    service: typeof sessions?.get === 'function',
    found: false,
    events: 0,
    lastAt: null,
    lastAnyAt: null,
    error: null,
  };
  if (!report.service || !id) return report;
  try {
    const session = sessions.get(id);
    report.found = Boolean(session);
    if (!session) return report;
    const events = eventsOf(session);
    report.events = events.length;
    report.lastAt = lastEventAt(session);
    report.lastAnyAt = lastAnyEventAt(session);
    return report;
  } catch (error) {
    report.error = String(error?.message ?? error);
    return report;
  }
}

/** Newest conversational event time in the session, or null when it has none. */
export function lastEventAt(session) {
  let newest = null;
  for (const event of eventsOf(session)) {
    if (!isActivityEvent(event)) continue;
    const time = Number(event?.time);
    if (!Number.isFinite(time)) continue;
    if (newest === null || time > newest) newest = time;
  }
  return newest;
}

/** Every event's newest time, bookkeeping included: diagnostics only. */
export function lastAnyEventAt(session) {
  let newest = null;
  for (const event of eventsOf(session)) {
    const time = Number(event?.time);
    if (!Number.isFinite(time)) continue;
    if (newest === null || time > newest) newest = time;
  }
  return newest;
}

/** Never throw: an unknown session simply has no activity to report. */
export function lastActivityAt(sessions, sessionId) {
  const id = String(sessionId ?? '').trim();
  if (!id || typeof sessions?.get !== 'function') return null;
  let session;
  try {
    session = sessions.get(id);
  } catch {
    return null;
  }
  if (!session) return null;
  try {
    return lastEventAt(session);
  } catch {
    return null;
  }
}
