'use strict';

/**
 * The settings block of the wake pipeline. The page itself belongs to
 * dsh-life-pipline (「Lpipe 设置」); this file only renders one block inside
 * the child slot it declares there.
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-wake';
const PANEL_SLOT = 'lpipe.settings.panel';
const POLL_MS = 2000;

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  success: 'var(--dsw-alias-state-success-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
};

// A two-up grid rather than flex-wrap: the pair stays side by side no matter
// what the host's stylesheet does to flex containers, and folds to one column
// only when the pane is genuinely narrow.
const row = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
  marginBottom: 12,
};
const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: 16,
  marginBottom: 12,
};

const label = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.muted,
  marginBottom: 6,
};

const value = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.text,
};

const button = (accent) => ({
  border: `1px solid ${accent || COLORS.borderStrong}`,
  background: accent || 'transparent',
  color: accent ? '#ffffff' : COLORS.text,
  borderRadius: 'var(--dsw-radius-sm)',
  padding: '7px 14px',
  fontSize: 13,
  lineHeight: '18px',
  cursor: 'pointer',
  flex: 'none',
  whiteSpace: 'nowrap',
});

const track = (on) => ({
  position: 'relative',
  width: 36,
  height: 20,
  borderRadius: 999,
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  flex: 'none',
  background: on ? COLORS.success : COLORS.borderStrong,
  transition: 'background 120ms ease',
});

const knob = (on) => ({
  position: 'absolute',
  top: 2,
  left: 2,
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: '#ffffff',
  transform: on ? 'translateX(16px)' : 'none',
  transition: 'transform 120ms ease',
});

function note(text, tone) {
  return h('p', {
    style: { margin: '8px 0 0', fontSize: 12, color: tone === 'error' ? COLORS.danger : COLORS.muted },
  }, text);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MIN_INTERVAL_MS = MINUTE;
const MAX_INTERVAL_MS = 24 * HOUR;
const SECOND = 1000;
const MIN_HEARTBEAT_MS = SECOND;
const MAX_HEARTBEAT_MS = 60 * MINUTE;

const numberInput = {
  width: 64,
  padding: '4px 8px',
  fontSize: 13,
  lineHeight: '18px',
  color: COLORS.text,
  background: COLORS.soft,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  flex: 'none',
};

const selectInput = { ...numberInput, width: 'auto', padding: '4px 6px' };

/** Milliseconds → the pair shown in the heartbeat field. */
function splitHeartbeat(ms) {
  const total = Number(ms);
  if (!Number.isFinite(total) || total <= 0) return { amount: '30', unit: 'seconds' };
  if (total % MINUTE === 0) return { amount: String(total / MINUTE), unit: 'minutes' };
  return { amount: String(Math.round(total / SECOND)), unit: 'seconds' };
}

/** The heartbeat field → milliseconds, or null when it is out of range. */
function composeHeartbeat(amount, unit) {
  const text = String(amount ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  if (count <= 0) return null;
  const ms = unit === 'minutes' ? count * MINUTE : count * SECOND;
  if (ms < MIN_HEARTBEAT_MS || ms > MAX_HEARTBEAT_MS) return null;
  return ms;
}

/** How far the current heartbeat has run, 0..1. */
function beatProgress(lastSeenAt, heartbeatMs, nowMs) {
  const at = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
  const span = Number(heartbeatMs);
  if (!Number.isFinite(at) || !Number.isFinite(span) || span <= 0) return 0;
  return Math.min(1, Math.max(0, (nowMs - at) / span));
}

/** "54 分钟前" — the same shape as the wake sentence, without the clock. */
function agoText(iso, nowMs) {
  if (!iso) return '';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.round((nowMs - at) / MINUTE));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时前` : `${hours} 小时 ${rest} 分前`;
}

/** Seconds until the next beat, never negative. */
function beatRemaining(lastSeenAt, heartbeatMs, nowMs) {
  const at = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
  const span = Number(heartbeatMs);
  if (!Number.isFinite(at) || !Number.isFinite(span) || span <= 0) return 0;
  return Math.max(0, Math.round((at + span - nowMs) / SECOND));
}

/** "上次心跳 12 秒前 · 每 30 秒" */
function beatText(lastSeenAt, heartbeatMs, nowMs) {
  const span = Number(heartbeatMs);
  const every = span >= MINUTE
    ? `${Math.round(span / MINUTE)} 分钟`
    : `${Math.round(span / SECOND)} 秒`;
  const at = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
  if (!Number.isFinite(at)) return `每 ${every}看一次`;
  const age = Math.max(0, Math.round((nowMs - at) / SECOND));
  return `上次心跳 ${age} 秒前 · 每 ${every}看一次`;
}

/** Milliseconds → the pair shown in the custom field. */
function splitInterval(ms) {
  const total = Number(ms);
  if (!Number.isFinite(total) || total <= 0) return { amount: '2', unit: 'hours' };
  if (total % HOUR === 0) return { amount: String(total / HOUR), unit: 'hours' };
  return { amount: String(Math.round(total / MINUTE)), unit: 'minutes' };
}

/** The custom field → milliseconds, or null when it is out of range. */
function composeInterval(amount, unit) {
  const text = String(amount ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  if (count <= 0) return null;
  const ms = unit === 'minutes' ? count * MINUTE : count * HOUR;
  if (ms < MIN_INTERVAL_MS || ms > MAX_INTERVAL_MS) return null;
  return ms;
}

function formatClock(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function countdown(iso, nowMs) {
  if (!iso) return '';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const diff = at - nowMs;
  if (diff <= 0) return '已到点，等下一次心跳';
  const total = Math.round(diff / 60000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} 分钟后`;
  return minutes === 0 ? `${hours} 小时后` : `${hours} 小时 ${minutes} 分后`;
}

function WakePanel({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [nowMs, setNowMs] = React.useState(Date.now());
  const [draft, setDraft] = React.useState(null);
  const [beatDraft, setBeatDraft] = React.useState(null);

  const call = React.useCallback(async (method, payload) => {
    const result = await rpcCall(method, payload ?? {});
    if (!result || result.ok === false) {
      const failure = new Error(result?.error?.message ?? '请求失败');
      failure.code = result?.error?.code;
      throw failure;
    }
    return result.value;
  }, [rpcCall]);

  const reload = React.useCallback(async () => {
    try {
      setStatus(await call('wake.status'));
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }, [call]);

  React.useEffect(() => { void reload(); }, [reload]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
      void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  // The display ticks every second; the engine keeps its own slower rhythm.
  React.useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), SECOND);
    return () => clearInterval(timer);
  }, []);

  const run = async (method, payload) => {
    setBusy(true);
    try {
      setStatus(await call(method, payload));
      setError('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return h('div', { style: { padding: 12, fontSize: 13, color: COLORS.muted } },
      error ? `唤醒管线读取失败：${error}` : '正在读取唤醒管线状态…');
  }

  const intervalMs = status.defaultIntervalMs;
  const mainMissing = !status.mainSessionId;
  const naturalOn = status.naturalEnabled !== false;
  const manualOn = status.manualEnabled !== false;
  const planned = Array.isArray(status.plannedWakes) ? status.plannedWakes : [];
  const nextPlan = planned[0] ?? null;

  const heading = (title, on, toggle) => h('div', {
    style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  },
    h('span', { style: { ...label, marginBottom: 0 } }, title),
    h('button', {
      role: 'switch',
      'aria-checked': on,
      'aria-label': `${title}开关`,
      title: on ? `关掉：${title}不再叫我` : `打开：${title}继续叫`,
      style: { ...track(on), marginLeft: 'auto' },
      disabled: busy,
      onClick: toggle,
    }, h('span', { style: knob(on) })));

  // The field holds whatever is being typed; the saved value only moves it
  // when a save actually succeeds.
  const draftValue = draft ?? splitInterval(intervalMs);
  const draftMs = composeInterval(draftValue.amount, draftValue.unit);
  const saveDraft = () => {
    if (draftMs === null) return;
    void run('wake.config.save', { defaultIntervalMs: draftMs }).then(() => setDraft(splitInterval(draftMs)));
  };

  const heartbeatMs = status.heartbeatMs;
  const beatValue = beatDraft ?? splitHeartbeat(heartbeatMs);
  const beatMs = composeHeartbeat(beatValue.amount, beatValue.unit);
  const saveBeat = () => {
    if (beatMs === null) return;
    void run('wake.config.save', { heartbeatMs: beatMs }).then(() => setBeatDraft(splitHeartbeat(beatMs)));
  };

  return h('section', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Wake'),
      h('span', {
        style: {
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'rgba(7, 193, 96, 0.14)', color: COLORS.success,
          border: '1px solid rgba(7, 193, 96, 0.28)',
        },
      }, '唤醒管线')),

    mainMissing ? note('还没有设置主会话：去上面的「公共」里填一个，唤醒才会生效。', 'error') : null,

    h('div', { style: row },
      // Natural: driven by when the conversation last ended.
      h('div', { style: { ...card, marginBottom: 0, opacity: naturalOn ? 1 : 0.55 } },
        heading('自然唤醒', naturalOn, () => run('wake.config.save', { naturalEnabled: !naturalOn })),
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
          h('span', { style: value }, formatClock(status.nextWakeAt)),
          h('span', { style: { marginLeft: 'auto', fontSize: 12, color: COLORS.muted } },
            countdown(status.nextWakeAt, nowMs))),
        h('div', { style: { marginTop: 6, fontSize: 12, color: COLORS.muted } },
          `上次结束行动 ${formatClock(status.lastActivityEndedAt)}`,
          status.lastActivityEndedAt ? ` · ${agoText(status.lastActivityEndedAt, nowMs)}` : ''),
        naturalOn ? null : note('已关闭：不会自行醒来，上面的时间是它本来会醒的时刻。')),

      // Manual: a moment I picked, untouched by my own activity.
      h('div', { style: { ...card, marginBottom: 0, opacity: manualOn ? 1 : 0.55 } },
        heading('主动唤醒', manualOn, () => run('wake.config.save', { manualEnabled: !manualOn })),
        nextPlan
          ? h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
              h('span', { style: value }, formatClock(nextPlan.at)),
              h('span', { style: { marginLeft: 'auto', fontSize: 12, color: COLORS.muted } },
                countdown(nextPlan.at, nowMs))),
            h('div', { style: { marginTop: 6, fontSize: 12, color: COLORS.text } },
              nextPlan.reason || '没有写缘由'),
            planned.length > 1
              ? h('div', { style: { marginTop: 4, fontSize: 12, color: COLORS.muted } }, `另有 ${planned.length - 1} 个安排`)
              : null)
          : h('span', { style: { fontSize: 13, color: COLORS.muted } }, '没有安排'),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } },
          h('button', {
            style: { ...button(), padding: '4px 12px' },
            disabled: busy || !manualOn,
            onClick: () => run('wake.plan', { at: Date.now(), reason: '手动点了一次' }),
          }, '现在醒来一次'),
          nextPlan
            ? h('button', {
              style: { ...button(), padding: '4px 12px' },
              disabled: busy,
              onClick: () => run('wake.cancel', { id: nextPlan.id }),
            }, planned.length > 1 ? '取消最近一个' : '取消')
            : null,
          planned.length > 1
            ? h('button', {
              style: { ...button(), padding: '4px 12px' },
              disabled: busy,
              onClick: () => run('wake.cancel', {}),
            }, '全部取消')
            : null),
        manualOn ? null : note('已关闭：到点也不会醒，安排还留着。'))),

    h('div', { style: row },
      h('div', { style: { ...card, marginBottom: 0 } },
        h('label', { style: label }, '默认唤醒间隔'),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
          h('input', {
            type: 'number',
            inputMode: 'numeric',
            min: 1,
            max: draftValue.unit === 'hours' ? 24 : 1440,
            value: draftValue.amount,
            'aria-label': '默认唤醒间隔',
            disabled: busy,
            style: numberInput,
            onChange: (event) => setDraft({ amount: event.target.value, unit: draftValue.unit }),
            onKeyDown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              saveDraft();
            },
          }),
          h('select', {
            value: draftValue.unit,
            'aria-label': '间隔单位',
            disabled: busy,
            style: selectInput,
            onChange: (event) => setDraft({ amount: draftValue.amount, unit: event.target.value }),
          },
            h('option', { value: 'minutes' }, '分钟'),
            h('option', { value: 'hours' }, '小时')),
          h('button', {
            style: { ...button(), padding: '4px 14px' },
            disabled: busy || draftMs === null || draftMs === intervalMs,
            onClick: saveDraft,
          }, '保存'),
          draftMs === null
            ? h('span', { style: { fontSize: 12, color: COLORS.danger } }, '范围 1 分钟到 24 小时')
            : null),
        note('我停下之后，过这么久再叫我。')),
      h('div', { style: { ...card, marginBottom: 0 } },
        h('label', { style: label }, '心跳间隔'),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
          h('input', {
            type: 'number',
            inputMode: 'numeric',
            min: 1,
            max: beatValue.unit === 'minutes' ? 60 : 3600,
            value: beatValue.amount,
            'aria-label': '心跳间隔',
            disabled: busy,
            style: numberInput,
            onChange: (event) => setBeatDraft({ amount: event.target.value, unit: beatValue.unit }),
            onKeyDown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              saveBeat();
            },
          }),
          h('select', {
            value: beatValue.unit,
            'aria-label': '心跳单位',
            disabled: busy,
            style: selectInput,
            onChange: (event) => setBeatDraft({ amount: beatValue.amount, unit: event.target.value }),
          },
            h('option', { value: 'seconds' }, '秒'),
            h('option', { value: 'minutes' }, '分钟')),
          h('button', {
            style: { ...button(), padding: '4px 14px' },
            disabled: busy || beatMs === null || beatMs === heartbeatMs,
            onClick: saveBeat,
          }, '保存'),
          beatMs === null
            ? h('span', { style: { fontSize: 12, color: COLORS.danger } }, '范围 1 秒到 60 分钟')
            : null),
        h('div', {
          style: {
            position: 'relative', height: 3, marginTop: 12, borderRadius: 999,
            background: COLORS.soft, overflow: 'hidden',
          },
        }, h('div', {
          style: {
            height: '100%', width: `${Math.round(beatProgress(status.lastSeenAt, heartbeatMs, nowMs) * 100)}%`,
            borderRadius: 999, background: COLORS.success,
            transition: 'width 900ms linear',
          },
        })),
        h('div', {
          style: { display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: COLORS.muted },
        },
          h('span', null, beatText(status.lastSeenAt, heartbeatMs, nowMs)),
          h('span', null, `${beatRemaining(status.lastSeenAt, heartbeatMs, nowMs)} 秒后`)))),

    error ? note(error, 'error') : null);
}

const name = 'dsh-lpipe-wake-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT,
    id: 'wake',
    order: 20,
    label: () => '唤醒管线',
    inject: () => ({ rpcCall }),
  }, WakePanel));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: {
    WakePanel,
    PANEL_SLOT,
    formatClock,
    countdown,
    splitInterval,
    composeInterval,
    splitHeartbeat,
    composeHeartbeat,
    beatProgress,
    beatText,
    beatRemaining,
    agoText,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
    MIN_HEARTBEAT_MS,
    MAX_HEARTBEAT_MS,
  },
};
