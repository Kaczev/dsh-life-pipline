import { createHash, randomUUID } from 'node:crypto';

import { renderEntries } from './model-list.mjs';

export const SETTINGS_SOURCE = 'dsh-lpipe-memory/settings';
const FORMAT = 2;

function snapshot(state, sessionId, enabled) {
  const entries = enabled ? [...state.settings.entries].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : [];
  const list = renderEntries('current-settings', entries);
  const digest = createHash('sha256').update(list).digest('hex');
  return {
    id: randomUUID(), role: 'user',
    source: { kind: SETTINGS_SOURCE, storeId: state.storeId, sessionId, format: FORMAT, digest },
    content: [{ type: 'text', text: `<system-reminder>\nThis list replaces all earlier Lpipe settings lists.\n${list}\n</system-reminder>` }],
  };
}

function matches(message, desired) {
  return message?.source?.kind === SETTINGS_SOURCE
    && ['storeId', 'sessionId', 'format', 'digest'].every(key => message.source[key] === desired.source[key])
    && message.content?.length === 1 && message.content[0]?.type === 'text'
    && message.content[0].text === desired.content[0].text;
}

function latestSnapshot(session) {
  for (const seq of [...session.surface.nodes].reverse()) {
    const event = session.eventAt(seq);
    if (event?.type === 'user/message' && event.data.source?.kind === SETTINGS_SOURCE) {
      return session.deriveEventMessage(event);
    }
  }
}

export function createSettingsHandlers({ current, allowedInState }) {
  return {
    async preStep({ agent, signal }, next) {
      const decision = await next();
      if (decision.kind === 'reject') return decision;
      const state = await current();
      signal.throwIfAborted();
      if (!state) return decision;
      const enabled = allowedInState('settings', state, agent);
      const desired = snapshot(state, agent.session.id, enabled);
      const previous = latestSnapshot(agent.session);
      const existing = decision.messages.find(message => message.source?.kind === SETTINGS_SOURCE);
      // Like the official skill catalog, keep admitted history untouched. Only
      // deduplicate or replace our own message in the pending admission batch.
      if (matches(previous, desired) || (!previous && (!enabled || state.settings.entries.length === 0))) {
        return existing === undefined ? decision : {
          ...decision, messages: decision.messages.filter(message => message.id !== existing.id),
        };
      }
      if (existing !== undefined && matches(existing, desired)) return decision;
      return {
        ...decision,
        messages: existing === undefined
          ? [...decision.messages, desired]
          : decision.messages.map(message => message.id === existing.id ? desired : message),
      };
    },
  };
}
