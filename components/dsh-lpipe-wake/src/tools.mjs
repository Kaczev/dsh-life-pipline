import { MAX_PLANNED, normalizeState } from './engine.mjs';
import { plannedWakeSummary } from './feedback.mjs';
import { parseDuration, parseWakeTime } from './time.mjs';
export { parseDuration } from './time.mjs';

const asIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

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
      const current = now();
      const lockedUntilAt = duration !== null ? current + duration : parseWakeTime(raw, current);
      if (lockedUntilAt === null || !Number.isFinite(lockedUntilAt) || !Number.isFinite(new Date(lockedUntilAt).getTime()) || lockedUntilAt <= current) {
        return { ...schedule, summary: `看不懂这个锁的时间，或时间已经过去：${raw}。请用 "3h30m"、"07:20"、"2026-11-13 07:20" 或带时区的 ISO 时间；无时区时使用电脑本地时间。` };
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
      if (ms === null) return { ...schedule, summary: `看不懂这个时长：${input.in}。请用正时长，例如 "45m"、"3h30m"、"1h 20m" 或分钟数 "90"。` };
      at = now() + ms;
      if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) return { ...schedule, summary: '时长超出可用日期范围。请用较短的正时长，例如 "45m" 或 "3h30m"。' };
    } else if (Object.hasOwn(input, 'at')) {
      const parsed = parseWakeTime(input.at, now());
      if (parsed === null) return { ...schedule, summary: `看不懂这个时间，或时间已经过去：${input.at}。请用 "07:20"、"2026-11-13 07:20" 或带时区的 ISO 时间；无时区时使用电脑本地时间，只有时分时取下一次到达的时刻。` };
      at = parsed;
    }
    if (at === null) return { ...schedule, summary: '请给我一个时间：`in`（如 "3h30m"）或 `at`（如 "07:20"、"2026-11-13 07:20" 或 ISO 时间）。' };
    if (schedule.manual.count >= MAX_PLANNED) return { ...schedule, summary: `主动唤醒安排已达上限（${MAX_PLANNED} 个），本次没有新增。请先取消不再需要的安排。` };
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
    description: 'Use `at` or `in` to append an active (self-planned) wake-up with a reason; existing active plans are not replaced or cancelled. Active plans survive activity. Use `cancel: true` to clear them all, or `cancel: "<id>"` for one. `lock` only silences natural wakes temporarily: it does not add an active wake, change existing active plans, or touch the natural switch. `unlock: true` lifts that lock. Dates and clocks without an offset use the current computer local timezone.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        in: { type: 'string', description: 'Append a wake after a positive duration: "45m", "2h", "90s", "3h30m", "1h 20m", or bare minutes "90". Existing active plans remain.' },
        at: { type: 'string', description: 'Append a wake at a future time: H:mm or HH:mm[:ss] (next occurrence today/tomorrow), YYYY-MM-DD HH:mm[:ss] or T in computer local time, or ISO with Z/offset. Explicit past dates and invalid times are rejected; existing active plans remain.' },
        reason: { type: 'string', description: 'The note I write for that moment, e.g. "return to this thought later".' },
        cancel: { type: ['boolean', 'string'], description: 'true clears every planned wake; a string cancels that one by id.' },
        lock: { type: 'string', description: 'Silence natural wakes only until a positive duration ("3h30m"), local clock ("7:20", next occurrence today/tomorrow), local date-time ("2026-11-13 07:20"), or ISO with Z/offset. Does not add, replace, or cancel active plans. Invalid times and explicit past dates are rejected.' },
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
      const value = plan(args && typeof args === 'object' ? args : {});
      return { ...value, summary: `${value.summary}\n${plannedWakeSummary({ plannedWakes: value.manual.plannedWakes.map(item => ({ ...item, at: Date.parse(item.at) })), manualEnabled: value.manual.enabled })}` };
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
        summary: `${manualLine(schedule.manual, schedule.lastCancelled, schedule.lastWokeAt)}\n${plannedWakeSummary({ plannedWakes: schedule.manual.plannedWakes.map(item => ({ ...item, at: Date.parse(item.at) })), manualEnabled: schedule.manual.enabled })}\n${naturalLine(schedule.natural, now())}`,
      };
    },
  }];
}
