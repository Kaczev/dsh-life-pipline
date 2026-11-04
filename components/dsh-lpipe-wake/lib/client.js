window.__ModuleLoader__.load({
  id: "dsh-lpipe-wake",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
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

const chip = (active) => ({
  border: `1px solid ${active ? COLORS.success : COLORS.borderStrong}`,
  background: active ? 'rgba(7, 193, 96, 0.12)' : 'transparent',
  color: active ? COLORS.success : COLORS.text,
  borderRadius: 999,
  padding: '3px 12px',
  fontSize: 12,
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

const CHIPS = [
  { ms: 30 * MINUTE, text: '30 分钟' },
  { ms: HOUR, text: '1 小时' },
  { ms: 2 * HOUR, text: '2 小时' },
  { ms: 4 * HOUR, text: '4 小时' },
];

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
  const on = status.enabled !== false;
  const cardStyle = { ...card, opacity: on ? 1 : 0.55 };

  // The custom field keeps whatever the user is typing; the chip row and the
  // saved value only move it when the user asks them to.
  const draftValue = draft ?? splitInterval(intervalMs);
  const draftMs = composeInterval(draftValue.amount, draftValue.unit);
  const saveDraft = () => {
    if (draftMs === null) return;
    void run('wake.config.save', { defaultIntervalMs: draftMs }).then(() => setDraft(splitInterval(draftMs)));
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
      }, '唤醒管线'),
      h('button', {
        role: 'switch',
        'aria-checked': on,
        title: on ? '关掉：不再自行醒来' : '打开：停下后自行醒来',
        style: { ...track(on), marginLeft: 'auto' },
        disabled: busy,
        onClick: () => run('wake.config.save', { enabled: !on }),
      }, h('span', { style: knob(on) }))),

    on ? null : note('已关闭：不会自行醒来，下面只是保留的数字。'),
    mainMissing ? note('还没有设置主会话：去上面的「公共」里填一个，唤醒才会生效。', 'error') : null,

    h('div', { style: cardStyle },
      h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 } },
        h('div', null,
          h('span', { style: label }, '下次唤醒'),
          h('span', { style: value }, formatClock(status.nextWakeAt))),
        h('span', { style: { fontSize: 12, color: COLORS.muted } }, countdown(status.nextWakeAt, nowMs))),
      h('div', { style: { display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' } },
        h('div', null,
          h('span', { style: label }, '上次结束行动'),
          h('span', { style: { fontSize: 13, color: COLORS.text } }, formatClock(status.lastActivityEndedAt))))),

    h('div', { style: cardStyle },
      h('label', { style: label }, '默认唤醒间隔'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        ...CHIPS.map((item) => h('button', {
          key: item.ms,
          style: chip(item.ms === intervalMs),
          disabled: busy,
          onClick: () => {
            setDraft(splitInterval(item.ms));
            void run('wake.config.save', { defaultIntervalMs: item.ms });
          },
        }, item.text)),
        h('span', {
          style: { width: 1, height: 18, background: COLORS.border, flex: 'none', marginLeft: 2 },
        }),
        h('input', {
          type: 'number',
          inputMode: 'numeric',
          min: 1,
          max: draftValue.unit === 'hours' ? 24 : 1440,
          value: draftValue.amount,
          'aria-label': '自定义间隔数值',
          disabled: busy,
          style: numberInput,
          onChange: (event) => setDraft({ amount: event.target.value, unit: draftValue.unit }),
        }),
        h('select', {
          value: draftValue.unit,
          'aria-label': '自定义间隔单位',
          disabled: busy,
          style: selectInput,
          onChange: (event) => setDraft({ amount: draftValue.amount, unit: event.target.value }),
        },
          h('option', { value: 'minutes' }, '分钟'),
          h('option', { value: 'hours' }, '小时')),
        h('button', {
          style: chip(false),
          disabled: busy || draftMs === null || draftMs === intervalMs,
          onClick: saveDraft,
        }, draftMs === intervalMs ? '已是这个间隔' : '用这个间隔')),
      draftMs === null
        ? note('自己填的话，范围是 1 分钟到 24 小时。', 'error')
        : note('我一开口说话、开始活动，下次唤醒就清空；停下后从那一刻重新按这个间隔算。')),

    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h('button', { style: button(), disabled: busy, onClick: () => run('wake.now') }, '现在唤醒一次'),
      h('button', { style: button(), disabled: busy, onClick: () => run('wake.reset') }, '改回默认推算')),

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
    CHIPS,
    splitInterval,
    composeInterval,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
  },
};

    return module.exports;
  }
});
