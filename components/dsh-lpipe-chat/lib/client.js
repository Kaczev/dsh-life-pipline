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
  padding: '12px 14px 8px',
  marginBottom: 10,
};

const channelCard = {
  ...card,
  padding: '12px 14px',
  marginBottom: 0,
};

const head = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 };
const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(7, 193, 96, 0.28)',
  background: 'rgba(7, 193, 96, 0.14)',
  color: COLORS.success,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const grid = { display: 'grid', gap: 8 };
const gridTwo = { ...grid, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' };
const gridThree = { ...gridTwo, marginTop: 8 };

const field = { minWidth: 0 };
const fieldName = {
  display: 'block',
  marginBottom: 4,
  fontSize: 10.5,
  fontWeight: 650,
  color: COLORS.muted,
  overflowWrap: 'anywhere',
};

const control = {
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
};
const input = {
  width: '100%',
  minWidth: 0,
  border: 0,
  outline: 0,
  background: 'transparent',
  padding: '6px 8px',
  color: COLORS.text,
  fontSize: 12.5,
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
};

const foot = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 8,
  paddingTop: 8,
  borderTop: `1px solid ${COLORS.border}`,
};
const footnote = { margin: '6px 0 0', fontSize: 10, lineHeight: 1.55, color: COLORS.faint };

const channels = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 10,
  alignItems: 'start',
};
const actions = { display: 'flex', gap: 6, marginLeft: 'auto', flex: 'none' };

const scopedCss = [
  '.lpipe-chat-control:focus-within{border-color:var(--dsw-alias-state-business-primary)}',
  '.lpipe-chat-control input[type=number]::-webkit-outer-spin-button,',
  '.lpipe-chat-control input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
  '.lpipe-chat-control input[type=number]{appearance:textfield;-moz-appearance:textfield}',
].join('');

function button(accent) {
  return {
    appearance: 'none',
    fontFamily: 'inherit',
    fontSize: 11.5,
    lineHeight: 1.45,
    padding: '5px 12px',
    borderRadius: 'var(--dsw-radius-sm)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    // A flex sibling with width:100% would otherwise squeeze the label into
    // two lines ("保" / "存").
    flex: 'none',
    border: `1px solid ${accent || COLORS.borderStrong}`,
    background: accent || 'transparent',
    color: accent ? '#ffffff' : COLORS.text,
  };
}

function StatusDot({ on }) {
  return h('span', {
    style: {
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 5,
      background: on ? COLORS.success : COLORS.borderStrong,
    },
  });
}

function note(text, tone) {
  return h('p', {
    style: { margin: '8px 0 0', fontSize: 10.5, lineHeight: 1.6, color: tone === 'error' ? COLORS.danger : COLORS.muted },
  }, text);
}

/** One compact config field: label above, framed input below. */
function Field({ id, title, value, setValue, type = 'text', min, max, step, disabled }) {
  return h('div', { style: field },
    h('label', { htmlFor: id, style: fieldName }, title),
    h('div', { className: 'lpipe-chat-control', style: control },
      h('input', {
        id,
        type,
        min,
        max,
        step,
        value,
        disabled,
        style: input,
        onChange: (event) => setValue(event.target.value),
      })));
}

function ChannelCard({ name, title, accent, state, login, onBegin, onConnect, onCancel, onCode, busy }) {
  const configured = Boolean(state?.configured);
  const connected = Boolean(state?.connected);
  const status = login?.state ?? 'idle';
  const [code, setCode] = React.useState('');
  const running = ['pending', 'scanned', 'needs_verification'].includes(status);

  return h('div', { style: { ...channelCard, borderTop: `2px solid ${accent}` } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 } },
      h('span', { style: { fontSize: 13, fontWeight: 600, color: COLORS.text } }, title),
      h('span', { style: { display: 'flex', alignItems: 'center', fontSize: 11, color: COLORS.muted } },
        h(StatusDot, { on: connected }),
        connected ? '已连接' : '未连接'),
      running ? null : h('div', { style: actions },
        configured
          ? h('button', { type: 'button', style: button(), disabled: busy, onClick: onConnect }, '重新连接')
          : null,
        h('button', { type: 'button', style: button(configured ? undefined : accent), disabled: busy, onClick: onBegin },
          configured ? '重新扫码' : '扫码接入'))),
    running ? h('div', { style: { marginTop: 10, textAlign: 'center' } },
      h('div', { style: { fontSize: 11, color: COLORS.muted, marginBottom: 8 } },
        status === 'pending' ? '请用手机扫码确认'
          : status === 'scanned' ? '已扫码，等待确认'
            : '需要输入手机上的配对码'),
      login?.qrDataUrl
        ? h('img', {
          src: login.qrDataUrl,
          alt: `${title}二维码`,
          width: 168,
          height: 168,
          style: { display: 'block', margin: '0 auto', borderRadius: 8, border: `1px solid ${COLORS.border}` },
        })
        : note('二维码生成中…'),
      status === 'needs_verification'
        ? h('div', { style: { display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 } },
          h('div', { style: { ...control, width: 150, flex: 'none' } },
            h('input', {
              style: input,
              value: code,
              placeholder: '配对码',
              'aria-label': '配对码',
              onChange: (event) => setCode(event.target.value),
            })),
          h('button', { type: 'button', style: button(accent), onClick: () => onCode(code) }, '提交'))
        : null,
      h('div', { style: { marginTop: 10 } },
        h('button', { type: 'button', style: button(), onClick: onCancel }, '取消')))
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

function draftPatch(values) {
  const bytes = (value) => {
    const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|G|GB)?$/i);
    if (!match) return NaN;
    return Number(match[1]) * ({ B: 1, KB: 1024, MB: 1024 ** 2, G: 1024 ** 3, GB: 1024 ** 3 }[(match[2] || 'B').toUpperCase()]);
  };
  const [quiet, window, output, download, retention] = values;
  const q = Number(quiet), w = Number(window), o = bytes(output), d = bytes(download), r = Number(retention);
  if (!Number.isFinite(q) || q < 0.2 || q > 60 || !Number.isFinite(w) || w < 3 || w > 120 || !Number.isSafeInteger(o) || o < 1024 || !Number.isSafeInteger(d) || d < 1 || !Number.isSafeInteger(r) || r < 1 || r > 36500) return null;
  return { quietSeconds: Math.round(q * 10) / 10, windowSeconds: Math.round(w), outputBytes: o, downloadBytes: d, downloadRetentionDays: r };
}

function ChatSettingsPanel({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [quietDraft, setQuietDraft] = React.useState('1');
  const [windowDraft, setWindowDraft] = React.useState('5');
  const [outputDraft, setOutputDraft] = React.useState('16KB');
  const [downloadDraft, setDownloadDraft] = React.useState('512MB');
  const [retentionDraft, setRetentionDraft] = React.useState('7');
  const hydrated = React.useRef(false);
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

  const resetDrafts = (config) => {
    setQuietDraft(String(config.quietSeconds));
    setWindowDraft(String(config.windowSeconds));
    setOutputDraft(config.outputBytes === 16384 ? '16KB' : String(config.outputBytes ?? '16KB'));
    setDownloadDraft(config.downloadBytes === 536870912 ? '512MB' : String(config.downloadBytes ?? '512MB'));
    setRetentionDraft(String(config.downloadRetentionDays ?? 7));
  };
  const adopt = React.useCallback((value) => {
    setStatus(value);
    if (!hydrated.current) {
      resetDrafts(value.config);
      hydrated.current = true;
    }
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

  const pendingPatch = draftPatch([quietDraft, windowDraft, outputDraft, downloadDraft, retentionDraft]);
  const canSave = Boolean(status?.config && !busy && pendingPatch && Object.entries(pendingPatch).some(([key, value]) => value !== (status.config[key] ?? ({ outputBytes: 16384, downloadBytes: 536870912, downloadRetentionDays: 7 })[key])));
  const save = async (patch) => {
    if (!canSave) return;
    setBusy(true);
    try {
      const value = await call('chat.config.save', patch);
      adopt(value);
      resetDrafts(value.config);
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

  const header = h('div', { style: head },
    h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Chat'),
    h('span', { style: badge }, '聊天管线'));

  if (!status) {
    return h('section', null,
      header,
      h('div', { style: card },
        h('div', {
          style: {
            padding: '20px 8px',
            textAlign: 'center',
            fontSize: 11.5,
            lineHeight: 1.7,
            color: error ? COLORS.danger : COLORS.muted,
          },
        }, error ? `聊天管线读取失败：${error}` : '正在读取聊天管线状态…')));
  }

  return h('section', null,
    h('style', null, scopedCss),
    header,
    h('div', { style: card },
      h('div', { style: gridTwo },
        h(Field, {
          id: 'dsh-lpipe-chat-quiet',
          title: '合并间隔（秒）（默认：1）',
          value: quietDraft,
          setValue: setQuietDraft,
          type: 'number',
          min: 0.2,
          max: 60,
          step: 0.1,
          disabled: busy,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-window',
          title: '收集窗口（秒）（默认：5）',
          value: windowDraft,
          setValue: setWindowDraft,
          type: 'number',
          min: 3,
          max: 120,
          step: 1,
          disabled: busy,
        })),
      h('div', { style: gridThree },
        h(Field, {
          id: 'dsh-lpipe-chat-output',
          title: '通知／历史上限（默认：16KB）',
          value: outputDraft,
          setValue: setOutputDraft,
          disabled: busy,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-download',
          title: '文件下载上限（默认：512MB）',
          value: downloadDraft,
          setValue: setDownloadDraft,
          disabled: busy,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-retention',
          title: '下载保留天数（天）（默认：7）',
          value: retentionDraft,
          setValue: setRetentionDraft,
          type: 'number',
          min: 1,
          max: 36500,
          step: 1,
          disabled: busy,
        })),
      h('div', { style: foot },
        h('button', {
          type: 'button',
          style: { ...button(canSave ? COLORS.accent : null), opacity: canSave ? 1 : 0.42 },
          disabled: !canSave,
          onClick: () => save({
            quietSeconds: Number(quietDraft),
            windowSeconds: Number(windowDraft),
            outputBytes: outputDraft,
            downloadBytes: downloadDraft,
            downloadRetentionDays: Number(retentionDraft),
          }),
        }, busy ? '保存中…' : '保存'),
        h('button', {
          type: 'button',
          style: button(),
          disabled: busy,
          onClick: () => { resetDrafts(status.config); setError(''); },
        }, '取消')),
      h('p', { style: footnote },
        '大小支持 B、KB、MB、G，按 1024 进位。默认 downloads 中的文件按最后修改时间清理，启动时及每小时检查；不清理子目录或自定义下载目录。五项一起保存。')),

    h('div', { style: channels },
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
      })),

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
  __test__: { ChatSettingsPanel, draftPatch, markConnected, PANEL_SLOT, ChannelCard },
};

    return module.exports;
  }
});
