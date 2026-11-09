/**
 * Resolve a Session's display title from its event log, so the settings page
 * can show「当前会话：…」without asking the Web client.
 */
export function eventsOf(session) {
  const events = typeof session?.snapshotEvents === 'function'
    ? session.snapshotEvents()
    : session?.events;
  return Array.isArray(events) ? events : [];
}

export function titleOfSession(session) {
  const events = eventsOf(session);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'session/title') continue;
    const title = event.data?.title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return '';
}

/** Never throw: a bad id is shown as「未知会话」on purpose. */
export function readSessionTitle(sessions, sessionId) {
  const id = String(sessionId ?? '').trim();
  if (!id) return { sessionId: '', title: '', found: false };
  if (typeof sessions?.get !== 'function') return { sessionId: id, title: '', found: false };
  let session;
  try {
    session = sessions.get(id);
  } catch {
    return { sessionId: id, title: '', found: false };
  }
  if (!session) return { sessionId: id, title: '', found: false };
  return { sessionId: id, title: titleOfSession(session), found: true };
}
