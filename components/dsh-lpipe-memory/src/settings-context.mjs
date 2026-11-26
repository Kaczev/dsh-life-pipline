import { createHash, randomUUID } from 'node:crypto';

import { renderEntries } from './model-list.mjs';

export const SETTINGS_SOURCE = 'dsh-lpipe-memory/settings';
const FORMAT = 2;

function snapshot(state, sessionId) {
  const entries = [...state.settings.entries].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
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

function visibleSnapshots(session) {
  return [...session.surface.nodes].flatMap(seq => {
    const event = session.eventAt(seq);
    return event?.type === 'user/message' && event.data.source?.kind === SETTINGS_SOURCE ? [event] : [];
  });
}

function reconcile(session, position, desired, pending) {
  const owned = visibleSnapshots(session);
  const retained = !pending && desired && owned.findLast(event => matches(session.deriveEventMessage(event), desired));
  for (const event of owned) {
    if (event === retained) continue;
    // A one-node replacement only shadows our own snapshot. An empty developer
    // node takes its surface position but derives to no message on the wire.
    session.append('developer/message', {
      ...position,
      message: { id: randomUUID(), role: 'developer', source: { kind: SETTINGS_SOURCE }, content: [] },
    }, { surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq }, sourceEventSeqs: [event.seq] });
  }
  if (desired && !pending && !retained && session.surface.nodes.length > 0) {
    // Do not put a user message ahead of the runtime's first system message.
    session.append('user/message', desired, { surfaceOp: 'append' });
  }
}

export function createSettingsHandlers({ current, allowedInState }) {
  const pendingSnapshots = new WeakMap();
  const readSnapshot = async (agent, signal) => {
    const state = await current();
    signal.throwIfAborted();
    return allowedInState('settings', state, agent) ? snapshot(state, agent.session.id) : undefined;
  };
  return {
    async preStep({ agent, turn, step, signal }, next) {
      pendingSnapshots.delete(agent);
      const decision = await next();
      // An empty admission may end the turn. Settings must not open a step.
      if (decision.kind !== 'enter' || decision.messages.length === 0) return decision;
      const desired = await readSnapshot(agent, signal);
      if (!desired || visibleSnapshots(agent.session).some(event => matches(agent.session.deriveEventMessage(event), desired))) {
        return decision;
      }
      // Return the snapshot now: outer waterfall hooks may copy the array
      // before the runtime admits it after the system head.
      pendingSnapshots.set(agent, { turn, step, signal });
      return { ...decision, messages: [...decision.messages, desired] };
    },
    async request({ agent, turn, step, signal }, next) {
      const config = await next();
      const pending = pendingSnapshots.get(agent);
      pendingSnapshots.delete(agent);
      const admitted = pending?.turn === turn && pending.step === step && pending.signal === signal;
      // First-attempt admission is already fixed by pre-step. On retries and
      // steps without a pending snapshot, reconcile against the live state.
      const desired = admitted ? undefined : await readSnapshot(agent, signal);
      signal.throwIfAborted();
      reconcile(agent.session, { turn, step }, desired, admitted);
      return config;
    },
  };
}
