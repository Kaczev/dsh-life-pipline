window.__ModuleLoader__.load({
  id: "dsh-lpipe-chat",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
'use strict';

/**
 * The settings page for the life chat component. This file is the CJS body:
 * `scripts/build-client.mjs` wraps it in the Host's module envelope, so it can
 * only require what that envelope provides (React today).
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-chat';
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
  cursor: 'pointer',
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

function ChannelCard({ name, title, accent, state, login, onBegin, onCancel, onCode, busy }) {
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
      !running && !connected
        ? h('button', { style: button(), disabled: busy, onClick: onBegin }, '扫码接入')
        : null),
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
  const [sessionDraft, setSessionDraft] = React.useState('');
  const [windowDraft, setWindowDraft] = React.useState('5');
  const [title, setTitle] = React.useState(null);
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
    setSessionDraft((current) => (current === '' ? value.config.mainSessionId : current));
    setWindowDraft((current) => (current === '5' ? String(value.config.windowSeconds) : current));
    setLogin((current) => ({
      weixin: value.channels?.weixin?.login ?? current.weixin,
      qq: value.channels?.qq?.login ?? current.qq,
    }));
    if (value.config.mainSessionId) {
      call('chat.session.title', { sessionId: value.config.mainSessionId })
        .then(setTitle)
        .catch(() => setTitle(null));
    }
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

  const titleText = title?.found
    ? (title.title || '（这个会话还没有标题）')
    : (sessionDraft.trim() ? '找不到这个会话' : '还没有绑定主会话');

  return h('div', { style: { maxWidth: 720 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Chat'),
      status.config.mainSessionId
        ? h('span', {
          style: {
            fontSize: 11, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(7, 193, 96, 0.14)', color: COLORS.success,
            border: '1px solid rgba(7, 193, 96, 0.28)',
          },
        }, '主会话')
        : null),

    h('div', { style: card },
      h('label', { style: label }, '主会话'),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('input', {
          style: input,
          value: sessionDraft,
          placeholder: 'session-…（粘贴会话 id）',
          onChange: (event) => setSessionDraft(event.target.value),
        }),
        h('button', {
          style: button(),
          disabled: busy,
          onClick: () => save({ mainSessionId: sessionDraft.trim() }),
        }, '保存')),
      h('p', { style: { margin: '8px 0 0', fontSize: 12, color: COLORS.muted } },
        '当前会话：', h('strong', { style: { color: COLORS.text } }, titleText)),
      note('微信与 QQ 的消息会攒进这个会话；它也是会话栏里带小气泡图标的那个。')),

    h('div', { style: card },
      h('label', { style: label }, '兜窗口（秒）'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('input', {
          style: { ...input, width: 100 },
          type: 'number',
          min: 3,
          max: 120,
          value: windowDraft,
          onChange: (event) => setWindowDraft(event.target.value),
        }),
        h('button', {
          style: button(),
          disabled: busy,
          onClick: () => save({ windowSeconds: Number(windowDraft) }),
        }, '保存')),
      note('第一条消息立即送达，之后这么多秒内的消息合并成一次。')),

    h(ChannelCard, {
      name: 'weixin',
      title: '微信',
      accent: COLORS.weixin,
      state: status.config.weixin,
      login: login.weixin,
      busy,
      onBegin: () => begin('weixin'),
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
      onCancel: () => cancel('qq'),
      onCode: (code) => submitCode('qq', code),
    }),

    error ? note(error, 'error') : null,
  );
}

const MARK_ATTR = 'data-dsh-lpipe-chat-mark';
// Designed session mark: one bubble split teal / periwinkle, 64px, inlined
// so the sidebar decoration costs no extra request.
const SESSION_MARK = 'data:image/png;base64,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';
/**
 * The main session's mark is an official seat: the row's leading cell
 * (`sidebar.session.row.leading`) belongs to the Host's tree, so the mark is
 * plain React content — it survives rename, rerender and reordering without
 * watching the DOM.
 */
let mainSessionId = '';
const listeners = new Set();

function setMainSessionId(next) {
  const value = String(next ?? '').trim();
  if (value === mainSessionId) return;
  mainSessionId = value;
  for (const notify of [...listeners]) notify();
}

function useMainSessionId() {
  const [value, setValue] = React.useState(mainSessionId);
  React.useEffect(() => {
    const notify = () => setValue(mainSessionId);
    listeners.add(notify);
    notify();
    return () => { listeners.delete(notify); };
  }, []);
  return value;
}

/** One row's leading cell, filled only for the session the settings page marks. */
function MainSessionMark({ sessionId }) {
  const main = useMainSessionId();
  if (!main || sessionId !== main) return null;
  return h('img', {
    [MARK_ATTR]: '1',
    src: SESSION_MARK,
    alt: '',
    draggable: false,
    style: { width: '16px', height: '16px', flex: 'none', display: 'block' },
  });
}

/** The settings page can repoint the main session at any time, so keep it fresh. */
function trackMainSession(rpcCall) {
  let disposed = false;
  let busy = false;
  const read = async () => {
    if (disposed || busy) return;
    busy = true;
    try {
      // The RPC envelope is `{ ok, value }`; the payload sits under `value`.
      const reply = await rpcCall('chat.status', {});
      const status = reply && reply.ok === false ? null : reply?.value;
      setMainSessionId(status?.config?.mainSessionId ?? '');
    } catch {
      // A closed settings page or a Host restart must not break the sidebar.
    } finally {
      busy = false;
    }
  };
  void read();
  // Headless loaders (tests, SSR) have no timers: polling is optional there.
  const timer = typeof setInterval === 'function'
    ? setInterval(() => { void read(); }, 8000)
    : undefined;
  return () => {
    disposed = true;
    if (timer !== undefined) clearInterval(timer);
    setMainSessionId('');
  };
}

const name = 'dsh-lpipe-chat-settings';
const inject = ['slots', 'connection'];

// The page itself belongs to dsh-life-pipline (the series' common package).
// This plugin only contributes its own block to the child slot it declares.
const PANEL_SLOT = 'lpipe.settings.panel';

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => trackMainSession(rpcCall), 'dsh-lpipe-chat: main session mark');
  }

  if (typeof ctx.slots?.inject === 'function') {
    ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({
      name: 'sidebar.session.row.leading',
      id: 'main-session-mark',
      order: 20,
      inject: () => ({}),
    }, MainSessionMark));
  }

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
  __test__: { markConnected, MainSessionMark, setMainSessionId, trackMainSession, PANEL_SLOT },
};

    return module.exports;
  }
});
