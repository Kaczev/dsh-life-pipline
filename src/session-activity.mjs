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
 * milliseconds, so the newest one is, literally, the moment the conversation
 * last ended.
 */

export function eventsOf(session) {
  const events = typeof session?.snapshotEvents === 'function'
    ? session.snapshotEvents()
    : session?.events;
  return Array.isArray(events) ? events : [];
}

/** Newest event time in the session, or null when it has none. */
export function lastEventAt(session) {
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
