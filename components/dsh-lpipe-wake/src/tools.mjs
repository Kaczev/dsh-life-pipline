import { normalizeState } from './engine.mjs';

const asIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** `45m`, `2h`, `90s`, or a bare number of minutes. */
export function parseDuration(text) {
  const value = String(text ?? '').trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? 'm';
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  const ms = Math.round(amount * scale);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Local wall-clock text for the summaries I read back. */
function clockText(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readSchedule(runner, now) {
  const state = normalizeState(runner.snapshot(), now());
  const next = state.plannedWakes[0] ?? null;
  return {
    now: asIso(now()),
    natural: {
      enabled: state.naturalEnabled !== false,
      nextWakeAt: asIso(state.nextWakeAt),
      lockUntil: asIso(state.naturalLockUntil),
      intervalMs: state.defaultIntervalMs,
      lastActivityEndedAt: asIso(state.lastActivityEndedAt),
    },
    manual: {
      enabled: state.manualEnabled !== false,
      next: next ? { at: asIso(next.at), reason: next.reason } : null,
      count: state.plannedWakes.length,
      plannedWakes: state.plannedWakes.map((plan) => ({ id: plan.id, at: asIso(plan.at), reason: plan.reason })),
    },
    lastWokeAt: asIso(state.lastWokeAt),
    lastWokeKind: state.lastWokeKind,
    lastWokeReason: state.lastWokeReason,
    lastCancelled: state.lastCancelled
      ? {
        at: asIso(state.lastCancelled.at),
        cancelledAt: asIso(state.lastCancelled.cancelledAt),
        reason: state.lastCancelled.reason,
        source: state.lastCancelled.source,
      }
      : null,
  };
}

function lockedUntil(natural, now) {
  if (!natural.lockUntil) return null;
  const at = Date.parse(natural.lockUntil);
  if (!Number.isFinite(at) || at <= now) return null;
  return at;
}

function naturalLine(natural, now = Date.now()) {
  if (!natural.nextWakeAt) return '自然唤醒：还没有起算（主会话里还没有事件）。';
  const when = clockText(Date.parse(natural.nextWakeAt));
  const at = lockedUntil(natural, now);
  const marks = [];
  if (natural.enabled === false) marks.push('开关关着，这个点不会叫');
  if (at !== null) marks.push(`${clockText(at)} 之前锁着，到点自动恢复`);
  const tail = marks.length > 0 ? `（${marks.join('；')}。）` : '';
  return `自然唤醒：${when}，即上次结束行动 + ${Math.round(natural.intervalMs / 60000)} 分钟。${tail}`;
}

/** `30 分钟后`, `2 小时后` — how far a planned moment is from now. */
function gapText(at, now) {
  const minutes = Math.round((at - now) / 60_000);
  if (minutes <= 0) return '就在此刻';
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时后` : `${hours} 小时 ${rest} 分钟后`;
}

/** Reasons I type often end in a full stop; never stack two. */
function trimStop(text) {
  return String(text ?? '').trim().replace(/[。．.！!？?，,；;、\s]+$/u, '');
}

/** A missing plan explains itself when somebody cancelled one recently. */
function cancelledNote(lastCancelled, lastWokeAt) {
  if (!lastCancelled) return '';
  const cancelledAt = Date.parse(lastCancelled.cancelledAt);
  const wokeAt = lastWokeAt ? Date.parse(lastWokeAt) : NaN;
  if (!Number.isFinite(cancelledAt)) return '';
  if (Number.isFinite(wokeAt) && wokeAt >= cancelledAt) return '';
  const who = lastCancelled.source === 'tool' ? '我' : '你';
  return `原定 ${clockText(Date.parse(lastCancelled.at))} 的那个在 ${clockText(cancelledAt)} 被${who}取消了。`;
}

function manualLine(manual, lastCancelled, lastWokeAt) {
  if (!manual.next) {
    const note = cancelledNote(lastCancelled, lastWokeAt);
    return note ? `主动唤醒：没有安排（${note}）` : '主动唤醒：没有安排。';
  }
  const when = clockText(Date.parse(manual.next.at));
  const reason = trimStop(manual.next.reason);
  const why = reason ? `缘由：${reason}。` : '没有写缘由。';
  const more = manual.count > 1 ? `另有 ${manual.count - 1} 个，` : '';
  const tail = manual.enabled ? '' : '（开关关着，这个点不会叫。）';
  return `主动唤醒：${when}，${more}${why}${tail}`;
}

/**
 * Two tools, matching the two kinds of wake:
 *
 * - `wake_set` plans a wake I chose myself, with the note I want to read then.
 * - `wake_check` answers "when will I next wake, and why" for both kinds.
 */
export function createWakeTools({ runner, now = () => Date.now() }) {
  const plan = (input) => {
    const schedule = readSchedule(runner, now);
    if (Object.hasOwn(input, 'cancel')) {
      const id = typeof input.cancel === 'string' ? input.cancel : null;
      runner.cancelWake(id, 'tool');
      const after = readSchedule(runner, now);
      return {
        ...after,
        summary: id ? '那个主动唤醒已经取消。' : '主动唤醒全部清空。',
      };
    }
    if (input.unlock === true) {
      runner.setNaturalLock(null);
      return { ...readSchedule(runner, now), summary: '自然唤醒的锁解开了：到点就会叫。' };
    }
    if (Object.hasOwn(input, 'lock')) {
      const raw = String(input.lock ?? '').trim();
      const duration = parseDuration(raw);
      const lockedUntilAt = duration !== null ? now() + duration : Date.parse(raw);
      if (!Number.isFinite(lockedUntilAt) || lockedUntilAt <= now()) {
        return { ...schedule, summary: `看不懂这个锁的时间：${raw}` };
      }
      runner.setNaturalLock(lockedUntilAt);
      const tail = schedule.natural.enabled === false ? '自然唤醒开关本来就关着，锁是多余的。' : '';
      return {
        ...readSchedule(runner, now),
        summary: `自然唤醒锁到 ${clockText(lockedUntilAt)}（${gapText(lockedUntilAt, now())}），这段时间不会自己醒来。${tail}`,
      };
    }
    let at = null;
    if (Object.hasOwn(input, 'in')) {
      const ms = parseDuration(input.in);
      if (ms === null) return { ...schedule, summary: `看不懂这个时长：${input.in}` };
      at = now() + ms;
    } else if (Object.hasOwn(input, 'at')) {
      const parsed = Date.parse(String(input.at));
      if (!Number.isFinite(parsed)) return { ...schedule, summary: `看不懂这个时间：${input.at}` };
      at = parsed;
    }
    if (at === null) return { ...schedule, summary: '请给我一个时间：`in`（如 "2h"）或 `at`（ISO 时间）。' };
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 200) : '';
    runner.planWake({ at, reason });
    const after = readSchedule(runner, now);
    return {
      ...after,
      summary: `主动唤醒定在 ${clockText(at)}（${gapText(at, now())}）。${after.manual.count > 1 ? `现在一共 ${after.manual.count} 个安排。` : ''}${after.manual.enabled ? '' : '主动唤醒开关关着：这条排进去也不会触发。'}`,
    };
  };

  return [{
    name: 'wake_set',
    description: 'Set an active (self-planned) wake-up: a moment I picked plus the reason I want to read when it fires. It ignores my activity — unlike the natural wake, which is cleared whenever I start working. Use `cancel: true` to clear them all, or `cancel: "<id>"` for one. `lock` silences the natural wake until a moment (e.g. "3h" or an ISO time) without touching its switch; `unlock: true` lifts it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        in: { type: 'string', description: 'Wake after this long, e.g. "45m", "2h", "90s".' },
        at: { type: 'string', description: 'Wake at this instant (ISO 8601 with offset).' },
        reason: { type: 'string', description: 'The note I write for that moment, e.g. "remind him to take his medicine".' },
        cancel: { type: ['boolean', 'string'], description: 'true clears every planned wake; a string cancels that one by id.' },
        lock: { type: 'string', description: 'Do not wake me naturally until then: a duration like "3h" or an ISO time.' },
        unlock: { type: 'boolean', description: 'true lifts the natural wake lock.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args) {
      return plan(args && typeof args === 'object' ? args : {});
    },
  }, {
    name: 'wake_check',
    description: 'Read the schedule: the next active wake (time and reason) and the next natural wake.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute() {
      const schedule = readSchedule(runner, now);
      return {
        ...schedule,
        summary: `${manualLine(schedule.manual, schedule.lastCancelled, schedule.lastWokeAt)}\n${naturalLine(schedule.natural, now())}`,
      };
    },
  }];
}
