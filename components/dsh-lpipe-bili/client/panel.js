'use strict';

/**
 * The Bilibili settings block. The page itself belongs to dsh-life-pipline
 * («Lpipe 设置»); this file only contributes one block to the child slot it
 * declares there. The video pipeline is host-side and is not duplicated here.
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-bili';
const PANEL_SLOT = 'lpipe.settings.panel';
const LOGIN_POLL_MS = 2000;
const RETENTION_LABEL = '下载保留天数（天）（默认：7）';
const RETENTION_DEFAULT = 7;
const RETENTION_MIN = 1;
const RETENTION_MAX = 36500;

// Host design tokens flip with the light/dark theme. The only literal colors
// are the Bilibili brand blue and the white quiet zone behind the QR image.
const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  accent: '#00a1d6',
  success: 'var(--dsw-alias-state-success-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
};

const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: '12px 14px 8px',
  marginBottom: 10,
};

const loginCard = {
  ...card,
  padding: '12px 14px',
  borderTop: `2px solid ${COLORS.accent}`,
};

const head = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' };
const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(0, 161, 214, 0.32)',
  background: 'rgba(0, 161, 214, 0.14)',
  color: COLORS.accent,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const row = { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' };
const field = { flex: '1 1 240px', minWidth: 0 };
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
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
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
const actions = { display: 'flex', gap: 6, marginLeft: 'auto', flex: 'none' };

const footnote = { margin: '6px 0 0', fontSize: 10, lineHeight: 1.55, color: COLORS.faint };
const errorNote = { margin: '6px 0 0', fontSize: 10, lineHeight: 1.55, color: COLORS.danger };

const loginHead = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 24, flexWrap: 'wrap' };
const loginTitle = { fontSize: 13, fontWeight: 600, color: COLORS.text };
const statusLine = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.muted };
const statusDot = { width: 6, height: 6, borderRadius: 999, flex: 'none' };
const headAction = { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 };
const loginBody = { marginTop: 8 };
const hint = { margin: '4px 0 0', fontSize: 10.5, lineHeight: 1.6, color: COLORS.faint };
const accountText = { fontSize: 11.5, color: COLORS.text };
const scanCopy = { minWidth: 0 };
const scanTitle = { fontSize: 11.5, fontWeight: 600, color: COLORS.text };
const scanHint = { margin: '4px 0 0', fontSize: 10.5, lineHeight: 1.6, color: COLORS.faint };
const scanActions = { marginTop: 9, display: 'flex', gap: 6 };
const qrWrap = {
  position: 'relative',
  width: 168,
  height: 168,
  padding: 6,
  boxSizing: 'border-box',
  background: 'white',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 9,
  justifySelf: 'end',
  flex: 'none',
};
const qrImage = { display: 'block', width: 156, height: 156 };
const qrOverlay = { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const qrPill = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  background: COLORS.bg,
  border: `1px solid ${COLORS.borderStrong}`,
  color: COLORS.text,
  fontSize: 10.5,
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
};
const terminal = { display: 'flex', alignItems: 'flex-start', gap: 10 };
const mark = {
  width: 26,
  height: 26,
  borderRadius: 999,
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 700,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.soft,
  color: COLORS.muted,
};
const terminalCopy = { minWidth: 0, flex: 1 };
const terminalTitle = { fontSize: 11.5, fontWeight: 600, color: COLORS.text };
const terminalText = { margin: '4px 0 0', fontSize: 10.5, lineHeight: 1.6, color: COLORS.faint };
const terminalActions = { marginTop: 8, display: 'flex', gap: 6 };

const scopedCss = `
.lpipe-bili-field{max-width:360px}
.lpipe-bili-control:focus-within{border-color:#00a1d6;box-shadow:0 0 0 2px rgba(0,161,214,.16)}
.lpipe-bili-control input:disabled{color:var(--dsw-alias-label-tertiary);-webkit-text-fill-color:var(--dsw-alias-label-tertiary);opacity:.75}
.lpipe-bili-control input[type=number]::-webkit-outer-spin-button,
.lpipe-bili-control input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.lpipe-bili-control input[type=number]{appearance:textfield;-moz-appearance:textfield}
.lpipe-bili-scan{display:grid;grid-template-columns:minmax(0,1fr) 168px;gap:14px;align-items:center}
.lpipe-bili-dot-busy{animation:lpipe-bili-pulse 1.6s ease-in-out infinite}
.lpipe-bili-spin{width:9px;height:9px;border-radius:999px;border:1.5px solid ${COLORS.borderStrong};border-top-color:${COLORS.accent};animation:lpipe-bili-spin .9s linear infinite;display:inline-block}
.lpipe-bili-skeleton{width:120px;height:4px;margin:9px auto 0;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-border-l2),var(--dsw-alias-bg-layer-2));background-size:200% 100%;animation:lpipe-bili-slide 1.2s linear infinite}
@keyframes lpipe-bili-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes lpipe-bili-spin{to{transform:rotate(360deg)}}
@keyframes lpipe-bili-slide{from{background-position:200% 0}to{background-position:-200% 0}}
@media (max-width:520px){
  .lpipe-bili-scan{grid-template-columns:1fr}
  .lpipe-bili-field{max-width:520px}
  .lpipe-bili-actions{margin-left:0}
  .lpipe-bili-qr{justify-self:start}
}
`;

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
    flex: 'none',
    border: `1px solid ${accent || COLORS.borderStrong}`,
    background: accent || 'transparent',
    color: accent ? '#ffffff' : COLORS.text,
  };
}

function softButton() {
  return { ...button(), background: COLORS.soft };
}

/** Bilibili's login QR may be a state or a full status envelope. */
function normalizeLogin(value, fallback) {
  const source = value && typeof value === 'object' && value.login && typeof value.login === 'object'
    ? value.login
    : value;
  const status = typeof source?.status === 'string' ? source.status : 'idle';
  return {
    id: typeof source?.id === 'string' ? source.id : '',
    status,
    image: typeof source?.image === 'string' ? source.image : '',
    expiresAt: source?.expiresAt ?? null,
    account: source?.account ?? fallback?.account ?? value?.account ?? null,
    error: typeof source?.error === 'string' ? source.error : '',
  };
}

/** The only editable setting. Returns null for anything but an integer in range. */
function parseRetention(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const days = Number(text);
  if (!Number.isInteger(days) || days < RETENTION_MIN || days > RETENTION_MAX) return null;
  return days;
}

function isScanning(login) {
  return login?.status === 'waiting' || login?.status === 'scanned';
}

function statusFor(login, configured) {
  if (login?.status === 'waiting') return { text: '等待扫码', tone: 'busy' };
  if (login?.status === 'scanned') return { text: '已扫码', tone: 'busy' };
  if (login?.status === 'success') return { text: '已登录', tone: 'on' };
  if (login?.status === 'expired') return { text: '已过期', tone: 'bad' };
  if (login?.status === 'cancelled') return { text: '已取消', tone: 'off' };
  if (login?.status === 'error') return { text: '登录失败', tone: 'bad' };
  return configured ? { text: '已登录', tone: 'on' } : { text: '未登录', tone: 'off' };
}

function dotColor(tone) {
  if (tone === 'on') return COLORS.success;
  if (tone === 'bad') return COLORS.danger;
  if (tone === 'busy') return COLORS.accent;
  return COLORS.borderStrong;
}

function LoginCard({ status, login, busy, onBegin, onCancel }) {
  const configured = Boolean(status?.configured) || login?.status === 'success';
  const account = login?.account?.name || status?.account?.name || '';
  const current = statusFor(login, configured);
  const scanning = isScanning(login);
  const action = (configured || login?.status === 'success')
    ? { label: '重新登录', primary: false }
    : { label: '扫码登录', primary: true };

  const headerAction = (login?.status === 'idle' || login?.status === 'success')
    ? h('button', {
      type: 'button',
      style: {
        ...(action.primary ? button(COLORS.accent) : button()),
        opacity: busy ? 0.55 : 1,
      },
      disabled: busy,
      onClick: onBegin,
    }, action.label)
    : null;

  let body = null;
  if (login?.status === 'waiting' || login?.status === 'scanned') {
    const scanned = login.status === 'scanned';
    body = h('div', { className: 'lpipe-bili-scan' },
      h('div', { style: scanCopy },
        h('div', { style: scanTitle }, scanned ? '已扫码，请在手机上确认' : '请用 B 站手机客户端扫码'),
        h('p', { style: scanHint }, scanned
          ? '不要关闭此页；确认后会自动完成登录并保存凭据。'
          : '二维码 3 分钟内有效；扫码后请在手机上确认。'),
        h('div', { style: scanActions },
          h('button', { type: 'button', style: button(), disabled: busy, onClick: onCancel }, '取消'))),
      h('div', { className: 'lpipe-bili-qr', style: qrWrap },
        login.image
          ? h('img', {
            src: login.image,
            alt: 'B 站登录二维码',
            width: 156,
            height: 156,
            draggable: false,
            style: { ...qrImage, opacity: scanned ? 0.32 : 1 },
          })
          : h('div', {
            style: {
              ...qrImage,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.muted,
              fontSize: 10.5,
              background: COLORS.soft,
              borderRadius: 4,
            },
          }, '二维码加载中…'),
        scanned
          ? h('div', { style: qrOverlay },
            h('span', { style: qrPill },
              h('span', { className: 'lpipe-bili-spin' }),
              '已扫码'))
          : null));
  } else if (login?.status === 'success') {
    body = h('div', { style: terminal },
      h('span', { style: { ...mark, color: COLORS.success, borderColor: COLORS.success } }, '✓'),
      h('div', { style: terminalCopy },
        h('div', { style: terminalTitle }, '登录成功'),
        h('p', { style: terminalText },
          account ? `账号：${account}。凭据已保存到宿主，页面只显示账号名。` : '凭据已保存到宿主，页面只显示账号名。')));
  } else if (login?.status === 'expired') {
    body = h('div', { style: terminal },
      h('span', { style: { ...mark, color: COLORS.warning, borderColor: COLORS.warning } }, '!'),
      h('div', { style: terminalCopy },
        h('div', { style: terminalTitle }, '二维码已过期'),
        h('p', { style: terminalText }, '请重新生成二维码，再用 B 站手机客户端扫码。'),
        h('div', { style: terminalActions },
          h('button', { type: 'button', style: button(COLORS.accent), disabled: busy, onClick: onBegin }, '重新生成'))));
  } else if (login?.status === 'cancelled') {
    body = h('div', { style: terminal },
      h('span', { style: mark }, '×'),
      h('div', { style: terminalCopy },
        h('div', { style: terminalTitle }, '已取消'),
        h('p', { style: terminalText }, '本次扫码没有保存任何凭据。'),
        h('div', { style: terminalActions },
          h('button', { type: 'button', style: button(COLORS.accent), disabled: busy, onClick: onBegin }, '重新扫码'))));
  } else if (login?.status === 'error') {
    body = h('div', { style: terminal },
      h('span', { style: { ...mark, color: COLORS.danger, borderColor: COLORS.danger } }, '!'),
      h('div', { style: terminalCopy },
        h('div', { style: terminalTitle }, '登录失败'),
        h('p', { style: terminalText }, login.error || '二维码生成失败，请重试。'),
        h('div', { style: terminalActions },
          h('button', { type: 'button', style: button(COLORS.accent), disabled: busy, onClick: onBegin }, '重试'))));
  } else {
    body = h('div', null,
      configured
        ? h('div', { style: accountText }, '账号：', h('b', null, account || '已登录'))
        : null,
      h('p', { style: hint }, configured
        ? '登录凭据保存在宿主，页面只显示账号名。'
        : '扫码后登录凭据保存在宿主，页面只显示账号名。'));
  }

  return h('section', { style: loginCard, 'data-phase': login?.status ?? 'idle' },
    h('div', { style: loginHead },
      h('span', { style: loginTitle }, 'B 站'),
      h('span', { style: statusLine, 'aria-live': 'polite' },
        h('span', {
          className: current.tone === 'busy' ? 'lpipe-bili-dot-busy' : undefined,
          style: { ...statusDot, background: dotColor(current.tone) },
        }),
        current.text),
      h('div', { style: headAction }, headerAction)),
    h('div', { style: loginBody }, body));
}

function LoadingCard({ error, onRetry }) {
  return h('section', { style: { ...card, padding: '22px 10px 18px', textAlign: 'center' } },
    h('div', { style: { fontSize: 11.5, lineHeight: 1.7, color: error ? COLORS.danger : COLORS.muted } },
      error ? `B 站管线读取失败：${error}` : '正在读取 B 站管线状态…'),
    error
      ? h('div', { style: { marginTop: 10 } },
        h('button', { type: 'button', style: button(), onClick: onRetry }, '重试'))
      : h('div', { className: 'lpipe-bili-skeleton' }));
}

function BiliSettingsPanel({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [loadError, setLoadError] = React.useState('');
  const [login, setLogin] = React.useState(null);
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [retentionDraft, setRetentionDraft] = React.useState('7');
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

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
    setLoadError('');
    try {
      const value = await call('bili.status');
      const next = normalizeLogin(value.login, value);
      setStatus(value);
      setRetentionDraft(String(value.downloadRetentionDays ?? RETENTION_DEFAULT));
      // A credential saved before this mount is a normal connected state, not
      // a fresh success: only a poll that just finished may claim success.
      setLogin(next.status === 'success' ? { ...next, status: 'idle' } : next);
      setSaveError('');
    } catch (cause) {
      setLoadError(cause?.message || String(cause));
    }
  }, [call]);

  React.useEffect(() => { void reload(); }, [reload]);

  // Poll only while a QR is live. The backend saves the credential inside the
  // poll response; a displayed QR alone is never treated as logged in.
  React.useEffect(() => {
    if (!isScanning(login)) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      try {
        const value = await call('bili.login', { action: 'status' });
        if (cancelled) return;
        const next = normalizeLogin(value, login);
        if (next.status === 'success') {
          setLogin(next);
          setStatus((previous) => previous
            ? { ...previous, configured: true, account: next.account ?? previous.account ?? null }
            : previous);
          return;
        }
        setLogin((previous) => ({ ...next, image: next.image || previous?.image || '' }));
      } catch (cause) {
        if (!cancelled) setLogin({ status: 'error', error: cause?.message || String(cause) });
      }
    };
    void tick();
    timer = setInterval(tick, LOGIN_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [login?.status, login?.id, call]);

  const begin = async () => {
    if (loginBusy) return;
    setLoginBusy(true);
    try {
      const value = await call('bili.login', { action: 'begin' });
      setLogin(normalizeLogin(value, status));
    } catch (cause) {
      setLogin({ status: 'error', error: cause?.message || String(cause) });
    } finally {
      setLoginBusy(false);
    }
  };

  const cancel = async () => {
    if (loginBusy) return;
    setLoginBusy(true);
    try {
      const value = await call('bili.login', { action: 'cancel' });
      setLogin(normalizeLogin(value, status));
    } catch (cause) {
      setLogin({ status: 'error', error: cause?.message || String(cause) });
    } finally {
      setLoginBusy(false);
    }
  };

  const retention = parseRetention(retentionDraft);
  const canSave = Boolean(status && !saving && retention !== null && retention !== Number(status.downloadRetentionDays ?? RETENTION_DEFAULT));
  const save = async () => {
    if (!canSave) return;
    const days = parseRetention(retentionDraft);
    if (days === null) {
      setSaveError('请输入 1–36500 之间的整数。');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const value = await call('bili.config.save', { downloadRetentionDays: days });
      const saved = Number(value?.downloadRetentionDays ?? days);
      setStatus((previous) => (previous ? { ...previous, downloadRetentionDays: saved } : previous));
      setRetentionDraft(String(saved));
    } catch (cause) {
      setSaveError(cause?.message || String(cause));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setRetentionDraft(String(status?.downloadRetentionDays ?? RETENTION_DEFAULT));
    setSaveError('');
  };

  return h('section', null,
    h('style', null, scopedCss),
    h('div', { style: head },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Bili'),
      h('span', { style: badge }, '视频管线')),

    !status
      ? h(LoadingCard, { error: loadError, onRetry: reload })
      : h('div', null,
        h('section', { style: card },
          h('div', { className: 'lpipe-bili-row', style: row },
            h('div', { className: 'lpipe-bili-field', style: field },
              h('label', { htmlFor: 'dsh-lpipe-bili-retention', style: fieldName }, RETENTION_LABEL),
              h('div', { className: 'lpipe-bili-control', style: control },
                h('input', {
                  id: 'dsh-lpipe-bili-retention',
                  type: 'number',
                  inputMode: 'numeric',
                  min: RETENTION_MIN,
                  max: RETENTION_MAX,
                  step: 1,
                  value: retentionDraft,
                  disabled: saving,
                  style: input,
                  onChange: (event) => {
                    setRetentionDraft(event.target.value);
                    setSaveError('');
                  },
                  onKeyDown: (event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    if (!saving) void save();
                  },
                }))),
            h('div', { className: 'lpipe-bili-actions', style: actions },
              h('button', {
                type: 'button',
                style: { ...button(canSave ? COLORS.accent : null), opacity: canSave ? 1 : 0.42 },
                disabled: !canSave,
                onClick: () => { void save(); },
              }, saving ? '保存中…' : '保存'),
              h('button', {
                type: 'button',
                style: button(),
                disabled: saving,
                onClick: cancelEdit,
              }, '取消'))),
          saveError ? h('p', { style: errorNote }, `保存失败：${saveError}`) : null,
          h('p', { style: footnote },
            '只清理已结束且超过保留天数的任务目录，进行中的任务不清理；每小时检查一次。')),

        h(LoginCard, {
          status,
          login,
          busy: loginBusy,
          onBegin: begin,
          onCancel: cancel,
        })),
  );
}

const name = 'dsh-lpipe-bili-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT,
    id: 'bili',
    order: 60,
    label: () => 'Lpipe Bili',
    inject: () => ({ rpcCall }),
  }, BiliSettingsPanel));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: { BiliSettingsPanel,
    PANEL_SLOT,
    LoginCard,
    normalizeLogin,
    parseRetention,
    statusFor,
    RETENTION_LABEL,
  },
};
