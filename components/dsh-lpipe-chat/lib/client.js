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
  padding: '10px 12px',
  marginBottom: 10,
};

const channelCard = {
  ...card,
  padding: '10px 12px',
  marginBottom: 0,
};

const head = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: 999,
  border: '1px solid rgba(7, 193, 96, 0.28)',
  background: 'rgba(7, 193, 96, 0.14)',
  color: COLORS.success,
  fontSize: 9.5,
  fontWeight: 600,
  lineHeight: 1.6,
  whiteSpace: 'nowrap',
};

// The form is one five-column strip on wide pages. Media queries live in
// scopedCss because inline styles cannot express them.
const ownerRow = { display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' };
const switchRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 28,
  marginLeft: 'auto',
  paddingBottom: 1,
  boxSizing: 'border-box',
};
const switchText = { fontSize: 11, lineHeight: 1.4, color: COLORS.muted, whiteSpace: 'nowrap' };
const divider = { height: 1, margin: '9px 0', background: COLORS.border };

const control = {
  display: 'flex',
  alignItems: 'center',
  height: 28,
  boxSizing: 'border-box',
  overflow: 'hidden',
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
};
const input = {
  width: '100%',
  minWidth: 0,
  height: 26,
  minHeight: 0,
  boxSizing: 'border-box',
  border: 0,
  outline: 0,
  background: 'transparent',
  padding: '0 8px',
  color: COLORS.text,
  fontSize: 12,
  lineHeight: 1.2,
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
};

const foot = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  marginTop: 10,
  paddingTop: 8,
  borderTop: `1px solid ${COLORS.border}`,
};
const hint = { flex: '1 1 230px', margin: 0, fontSize: 9.5, lineHeight: 1.55, color: COLORS.faint };
const hintError = { ...hint, color: COLORS.danger };

const channels = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 10,
  alignItems: 'start',
};
const actions = { display: 'flex', gap: 6, marginLeft: 'auto', flex: 'none' };

const scopedCss = [
  '.lpipe-chat-control:focus-within{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px rgba(91,130,255,.17)}',
  '.lpipe-chat-control-invalid{border-color:var(--dsw-alias-state-error-primary)}',
  '.lpipe-chat-control input[type=number]::-webkit-outer-spin-button,',
  '.lpipe-chat-control input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
  '.lpipe-chat-control input[type=number]{appearance:textfield;-moz-appearance:textfield}',
  '.lpipe-chat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}',
  '.lpipe-chat-owner{flex:0 1 208px;min-width:156px}',
  '.lpipe-chat-field{min-width:0}',
  '.lpipe-chat-label-line{display:flex;align-items:baseline;justify-content:flex-start;gap:5px;margin-bottom:3px;overflow:hidden;white-space:nowrap}',
  '.lpipe-chat-label{min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:650;line-height:1.3}',
  '.lpipe-chat-default{flex:none;color:var(--dsw-alias-label-tertiary);font-size:9.5px;letter-spacing:.01em}',
  '.lpipe-chat-unit{flex:none;padding-right:8px;color:var(--dsw-alias-label-tertiary);font-size:10px}',
  '.lpipe-chat-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
  '.lpipe-chat-card{container-type:inline-size}',
  '@container (max-width:640px){.lpipe-chat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '@container (max-width:460px){.lpipe-chat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lpipe-chat-owner{flex-basis:100%}.lpipe-chat-switch-row{margin-left:0}}',
].join('');

function switchStyle(on, disabled) {
  return {
    position: 'relative',
    flex: 'none',
    width: 34,
    height: 20,
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    padding: 0,
    border: 0,
    borderRadius: 999,
    background: on ? COLORS.accent : COLORS.borderStrong,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'background .16s ease, opacity .16s ease',
  };
}

function knobStyle(on) {
  return {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: 'white',
    boxShadow: '0 1px 2px rgba(0, 0, 0, .32)',
    transform: on ? 'translateX(14px)' : 'none',
    transition: 'transform .16s ease',
  };
}

function button(accent) {
  return {
    appearance: 'none',
    fontFamily: 'inherit',
    fontSize: 11,
    height: 26,
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    lineHeight: '24px',
    padding: '0 12px',
    borderRadius: 'var(--dsw-radius-sm)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    // A flex sibling with width:100% would otherwise squeeze the label into
    // two lines ("保" / "存").
    flex: 'none',
    border: `1px solid ${accent || COLORS.borderStrong}`,
    background: accent || 'transparent',
    color: accent ? 'white' : COLORS.text,
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

/** One compact config field: short label + default hint, framed input below. */
function Field({ id, title, label, hint: defaultValue, unit, value, setValue, type = 'text', min, max, step, disabled, placeholder, maxLength, invalid }) {
  return h('div', { className: 'lpipe-chat-field' },
    h('div', { className: 'lpipe-chat-label-line' },
      h('label', { htmlFor: id, className: 'lpipe-chat-label', title }, label ?? title),
      defaultValue ? h('span', { className: 'lpipe-chat-default' }, defaultValue) : null),
    h('div', {
      className: invalid ? 'lpipe-chat-control lpipe-chat-control-invalid' : 'lpipe-chat-control',
      style: control,
    },
      h('input', {
        id,
        type,
        placeholder,
        maxLength,
        min,
        max,
        step,
        value,
        disabled,
        title,
        style: input,
        onChange: (event) => setValue(event.target.value),
      }),
      unit ? h('span', { className: 'lpipe-chat-unit', 'aria-hidden': 'true' }, unit) : null));
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

function parseBytes(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|G|GB)?$/i);
  if (!match) return NaN;
  return Number(match[1]) * ({ B: 1, KB: 1024, MB: 1024 ** 2, G: 1024 ** 3, GB: 1024 ** 3 }[(match[2] || 'B').toUpperCase()]);
}

function draftPatch(values) {
  const [quiet, window, output, download, retention] = values;
  const q = Number(quiet), w = Number(window), o = parseBytes(output), d = parseBytes(download), r = Number(retention);
  if (!Number.isFinite(q) || q < 0.2 || q > 60 || !Number.isFinite(w) || w < 3 || w > 120 || !Number.isSafeInteger(o) || o < 1024 || !Number.isSafeInteger(d) || d < 1 || !Number.isSafeInteger(r) || r < 1 || r > 36500) return null;
  return { quietSeconds: Math.round(q * 10) / 10, windowSeconds: Math.round(w), outputBytes: o, downloadBytes: d, downloadRetentionDays: r };
}

function ChatSettingsPanel({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [quietDraft, setQuietDraft] = React.useState('1');
  const [windowDraft, setWindowDraft] = React.useState('5');
  const [outputDraft, setOutputDraft] = React.useState('48MB');
  const [downloadDraft, setDownloadDraft] = React.useState('512MB');
  const [retentionDraft, setRetentionDraft] = React.useState('7');
  const [ownerDraft, setOwnerDraft] = React.useState('');
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
    setOwnerDraft(String(config.ownerName ?? ''));
    setQuietDraft(String(config.quietSeconds));
    setWindowDraft(String(config.windowSeconds));
    setOutputDraft(config.outputBytes === 50331648 ? '48MB' : String(config.outputBytes ?? '48MB'));
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
  if (pendingPatch) pendingPatch.ownerName = ownerDraft.trim();
  const ownerValid = ownerDraft.length <= 200 && !/[\x00-\x1f\x7f\u2028\u2029]/u.test(ownerDraft);
  const invalid = {
    quiet: !(Number.isFinite(Number(quietDraft)) && Number(quietDraft) >= 0.2 && Number(quietDraft) <= 60),
    window: !(Number.isFinite(Number(windowDraft)) && Number(windowDraft) >= 3 && Number(windowDraft) <= 120),
    output: !(Number.isSafeInteger(parseBytes(outputDraft)) && parseBytes(outputDraft) >= 1024),
    download: !(Number.isSafeInteger(parseBytes(downloadDraft)) && parseBytes(downloadDraft) >= 1),
    retention: !(Number.isSafeInteger(Number(retentionDraft)) && Number(retentionDraft) >= 1 && Number(retentionDraft) <= 36500),
  };
  const anyInvalid = Object.values(invalid).some(Boolean);
  const hintText = !pendingPatch
    ? '请检查数值范围；大小支持 B、KB、MB、G，按 1024 进位。'
    : !ownerValid
      ? 'Owner 名字最多 200 字，不能包含换行或控制字符。'
      : '大小按 1024 进位 · 仅清理 downloads 直属文件 · 接收开关立即保存';
  const canSave = Boolean(ownerValid && status?.config && !busy && pendingPatch && Object.entries(pendingPatch).some(([key, value]) => value !== (status.config[key] ?? ({ ownerOnly: false, ownerName: '', outputBytes: 50331648, downloadBytes: 536870912, downloadRetentionDays: 7 })[key])));
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

  const toggleOwnerOnly = async () => {
    if (busy) return;
    setBusy(true);
    try {
      adopt(await call('chat.config.save', { ownerOnly: !status.config.ownerOnly }));
      setError('');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
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
    h('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600, color: COLORS.text } }, 'Lpipe Chat'),
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
    h('div', { className: 'lpipe-chat-card', style: card },
      h('div', { style: ownerRow },
        h('div', { className: 'lpipe-chat-owner' },
          h(Field, {
            id: 'dsh-lpipe-chat-owner',
            label: 'Owner 名字',
            title: 'Owner 名字仅作称呼，不用于身份验证',
            value: ownerDraft,
            setValue: setOwnerDraft,
            placeholder: '可留空',
            maxLength: 200,
            disabled: busy,
          })),
        h('div', { className: 'lpipe-chat-switch-row', style: switchRow },
          h('span', { style: switchText }, '只接收 Owner 的消息'),
          h('button', {
            type: 'button',
            role: 'switch',
            className: 'lpipe-chat-switch',
            'aria-label': '只接收 Owner 的消息',
            'aria-checked': status.config.ownerOnly === true,
            disabled: busy,
            onClick: toggleOwnerOnly,
            style: switchStyle(status.config.ownerOnly === true, busy),
          }, h('span', { style: knobStyle(status.config.ownerOnly === true), 'aria-hidden': 'true' })))),
      h('div', { style: divider }),
      h('div', { className: 'lpipe-chat-grid' },
        h(Field, {
          id: 'dsh-lpipe-chat-quiet',
          label: '合并间隔',
          hint: '默认 8',
          unit: '秒',
          title: '合并间隔（秒）（默认：8）',
          value: quietDraft,
          setValue: setQuietDraft,
          type: 'number',
          min: 0.2,
          max: 60,
          step: 0.1,
          disabled: busy,
          invalid: invalid.quiet,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-window',
          label: '收集窗口',
          hint: '默认 14',
          unit: '秒',
          title: '收集窗口（秒）（默认：14）',
          value: windowDraft,
          setValue: setWindowDraft,
          type: 'number',
          min: 3,
          max: 120,
          step: 1,
          disabled: busy,
          invalid: invalid.window,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-output',
          label: '通知／历史',
          hint: '默认 48MB',
          title: '通知／历史文字与图片共享上限（默认：48MB；不限制图片数量）',
          value: outputDraft,
          setValue: setOutputDraft,
          disabled: busy,
          invalid: invalid.output,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-download',
          label: '下载上限',
          hint: '默认 512MB',
          title: '文件下载上限（默认：512MB）',
          value: downloadDraft,
          setValue: setDownloadDraft,
          disabled: busy,
          invalid: invalid.download,
        }),
        h(Field, {
          id: 'dsh-lpipe-chat-retention',
          label: '保留天数',
          hint: '默认 7',
          unit: '天',
          title: '下载保留天数（天）（默认：7）',
          value: retentionDraft,
          setValue: setRetentionDraft,
          type: 'number',
          min: 1,
          max: 36500,
          step: 1,
          disabled: busy,
          invalid: invalid.retention,
        })),
      h('div', { style: foot },
        h('p', { style: anyInvalid || !ownerValid ? hintError : hint }, hintText),
        h('div', { style: actions },
          h('button', {
            type: 'button',
            style: { ...button(canSave ? COLORS.accent : null), opacity: canSave ? 1 : 0.42 },
            disabled: !canSave,
            onClick: () => save({
              ownerName: ownerDraft,
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
          }, '取消')))),

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
