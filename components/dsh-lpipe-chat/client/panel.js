'use strict';

/**
 * The settings page for the life chat component. This file is the CJS body:
 * `scripts/build-client.mjs` wraps it in the Host's module envelope, so it can
 * only require what that envelope provides (React today).
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-chat';
const STATUS_POLL_MS = 5000;
const POLL_MS = 2000;

// Host design tokens: they flip with the light/dark theme, so the panel never
// paints its own white surface onto a dark page.
const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  accent: 'var(--dsw-alias-state-business-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  weixin: '#07c160',
  qq: '#12b7f5',
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

const input = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  fontSize: 13,
  color: COLORS.text,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
  outline: 'none',
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
  // A flex sibling with width:100% would otherwise squeeze the label into
  // two lines ("保" / "存").
  flex: 'none',
  whiteSpace: 'nowrap',
});

function StatusDot({ on }) {
  return h('span', {
    style: {
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
      background: on ? COLORS.success : COLORS.borderStrong,
    },
  });
}

function note(text, tone) {
  return h('p', {
    style: { margin: '8px 0 0', fontSize: 12, color: tone === 'error' ? COLORS.danger : COLORS.muted },
  }, text);
}

function ChannelCard({ name, title, accent, state, login, onBegin, onConnect, onCancel, onCode, busy }) {
  const configured = Boolean(state?.configured);
  const connected = Boolean(state?.connected);
  const status = login?.state ?? 'idle';
  const [code, setCode] = React.useState('');
  const running = ['pending', 'scanned', 'needs_verification'].includes(status);

  return h('div', { style: { ...card, borderTop: `3px solid ${accent}` } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { fontSize: 15, fontWeight: 600, color: COLORS.text } }, title),
        h('span', { style: { display: 'flex', alignItems: 'center', fontSize: 12, color: COLORS.muted } },
          h(StatusDot, { on: connected }),
          connected ? '已连接' : '未连接')),
      running ? null : h('div', { style: { display: 'flex', gap: 8 } },
        configured
          ? h('button', { style: button(), disabled: busy, onClick: onConnect }, '重新连接')
          : null,
        h('button', { style: button(configured ? undefined : accent), disabled: busy, onClick: onBegin },
          configured ? '重新扫码' : '扫码接入'))),
    running ? h('div', { style: { marginTop: 12 } },
      h('div', { style: { fontSize: 12, color: COLORS.muted, marginBottom: 8 } },
        status === 'pending' ? '请用手机扫码确认'
          : status === 'scanned' ? '已扫码，等待确认'
            : '需要输入手机上的配对码'),
      login?.qrDataUrl
        ? h('img', {
          src: login.qrDataUrl,
          alt: `${title}二维码`,
          width: 200,
          height: 200,
          style: { display: 'block', borderRadius: 8, border: `1px solid ${COLORS.border}` },
        })
        : note('二维码生成中…'),
      status === 'needs_verification'
        ? h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
          h('input', {
            style: { ...input, width: 160 },
            value: code,
            placeholder: '配对码',
            onChange: (event) => setCode(event.target.value),
          }),
          h('button', { style: button(accent), onClick: () => onCode(code) }, '提交'))
        : null,
      h('button', { style: { ...button(), marginTop: 10 }, onClick: onCancel }, '取消'))
      : null,
    login?.error ? note(login.error, 'error') : null,
    !connected && !running && state?.lastError
      ? note(`上次连接失败：${state.lastError}`, 'error')
      : null,
  );
}

/** Flip one channel to connected without waiting for the next full status read. */
function markConnected(status, channel) {
  if (!status || !status.config || !status.config[channel]) return status;
  return {
    ...status,
    config: {
      ...status.config,
      [channel]: { ...status.config[channel], connected: true },
    },
  };
}

function ChatSettingsPanel({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [quietDraft, setQuietDraft] = React.useState('1');
  const [login, setLogin] = React.useState({});

  const call = React.useCallback(async (method, payload) => {
    const result = await rpcCall(method, payload ?? {});
    if (!result || result.ok === false) {
      const message = result?.error?.message ?? '请求失败';
      const failure = new Error(message);
      failure.code = result?.error?.code;
      throw failure;
    }
    return result.value;
  }, [rpcCall]);

  const adopt = React.useCallback((value) => {
    setStatus(value);
    setQuietDraft((current) => (current === '1' ? String(value.config.quietSeconds) : current));
    setLogin((current) => ({
      weixin: value.channels?.weixin?.login ?? current.weixin,
      qq: value.channels?.qq?.login ?? current.qq,
    }));
  }, [call]);

  const reload = React.useCallback(async () => {
    try {
      adopt(await call('chat.status'));
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }, [adopt, call]);

  React.useEffect(() => { void reload(); }, [reload]);

  const active = Object.entries(login ?? {}).find(([, value]) =>
    ['pending', 'scanned', 'needs_verification'].includes(value?.state))?.[0];

  // A finished login does not mean a live channel: connect() starts right
  // after the credentials land, so the first status read can still say "not
  // connected". Re-read on a short schedule instead of freezing that value.
  const settleTimers = React.useRef([]);
  const clearSettle = React.useCallback(() => {
    for (const id of settleTimers.current) clearTimeout(id);
    settleTimers.current = [];
  }, []);
  React.useEffect(() => clearSettle, [clearSettle]);

  const settle = React.useCallback((channel) => {
    setStatus((current) => markConnected(current, channel));
    clearSettle();
    for (const delay of [0, 600, 1500, 3000]) {
      settleTimers.current.push(setTimeout(() => { void reload(); }, delay));
    }
  }, [clearSettle, reload]);

  React.useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const value = await call('chat.login.state', { channel: active });
        if (cancelled) return;
        setLogin((current) => ({ ...current, [active]: value.login }));
        if (value.connected === true) settle(active);
        else if (['connected', 'failed', 'expired', 'cancelled'].includes(value.login?.state)) {
          await reload();
        }
      } catch (cause) {
        if (!cancelled) setError(cause.message);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, call, reload, settle]);

  // The channels can die while this page is open, so re-read on a timer.
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  // Coming back from another tab should not leave a stale card behind.
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const save = async (patch) => {
    setBusy(true);
    try {
      adopt(await call('chat.config.save', patch));
      setError('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  // Rebuilding the channel from the stored credentials. When the server side
  // revoked them this comes back "not connected" and the card keeps offering
  // a fresh scan, which is the only way forward.
  const reconnect = async (channel) => {
    setBusy(true);
    try {
      adopt(await call('chat.connect', { channel }));
    } catch {
      // The card carries the reason: `chat.connect` records it on the channel,
      // so a refresh is enough and the same sentence is not printed twice.
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const begin = async (channel) => {
    setBusy(true);
    try {
      const value = await call('chat.login.begin', { channel });
      // QQ reports its QR a beat later, so the snapshot may be empty here.
      const loginValue = value.login ?? { state: 'pending' };
      const qrDataUrl = value.login?.qrDataUrl || value.qrDataUrl || '';
      setLogin((current) => ({
        ...current,
        [channel]: qrDataUrl ? { ...loginValue, qrDataUrl } : loginValue,
      }));
      setError('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (channel) => {
    try {
      const value = await call('chat.login.cancel', { channel });
      setLogin((current) => ({ ...current, [channel]: value.login ?? { state: 'idle' } }));
    } catch (cause) {
      setError(cause.message);
    }
  };

  const submitCode = async (channel, code) => {
    try {
      const value = await call('chat.login.code', { channel, code });
      setLogin((current) => ({ ...current, [channel]: value.login }));
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  };

  if (!status) {
    return h('div', { style: { padding: 24, fontSize: 13, color: COLORS.muted } },
      error ? `社交管线读取失败：${error}` : '正在读取社交管线状态…');
  }

  return h('div', { style: { maxWidth: 720 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Chat'),
      h('span', {
        style: {
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'rgba(7, 193, 96, 0.14)', color: COLORS.success,
          border: '1px solid rgba(7, 193, 96, 0.28)',
        },
      }, '社交管线')),

    h('div', { style: card },
      h('label', { style: label }, '静默间隔（秒）'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('input', {
          style: { ...input, width: 100 },
          type: 'number',
          min: 0.2,
          max: 60,
          step: 0.1,
          value: quietDraft,
          onChange: (event) => setQuietDraft(event.target.value),
        }),
        h('button', {
          style: button(),
          disabled: busy,
          onClick: () => save({ quietSeconds: Number(quietDraft) }),
        }, '保存')),
      note('收到消息先等这么久；这期间又来了新的，就重新计时，直到安静下来再一起交给我。')),

    h(ChannelCard, {
      name: 'weixin',
      title: '微信',
      accent: COLORS.weixin,
      state: status.config.weixin,
      login: login.weixin,
      busy,
      onBegin: () => begin('weixin'),
      onConnect: () => reconnect('weixin'),
      onCancel: () => cancel('weixin'),
      onCode: (code) => submitCode('weixin', code),
    }),

    h(ChannelCard, {
      name: 'qq',
      title: 'QQ',
      accent: COLORS.qq,
      state: status.config.qq,
      login: login.qq,
      busy,
      onBegin: () => begin('qq'),
      onConnect: () => reconnect('qq'),
      onCancel: () => cancel('qq'),
      onCode: (code) => submitCode('qq', code),
    }),

    error ? note(error, 'error') : null,
  );
}

const name = 'dsh-lpipe-chat-settings';
const inject = ['slots', 'connection'];

// The page itself belongs to dsh-life-pipline (the series' common package).
// This plugin only contributes its own block to the child slot it declares.
const PANEL_SLOT = 'lpipe.settings.panel';

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  // The main-session mark and the page belong to dsh-life-pipline: the main
  // session is common state, so this component only contributes its own block.
  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT,
    id: 'chat',
    order: 10,
    label: () => 'Lpipe Chat',
    inject: () => ({ rpcCall }),
  }, ChatSettingsPanel));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: { markConnected, PANEL_SLOT, ChannelCard },
};
