window.__ModuleLoader__.load({
  id: "dsh-life-pipline",
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

const RPC_ENDPOINT = 'dsh-life-chat';
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

  React.useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const value = await call('chat.login.state', { channel: active });
        if (cancelled) return;
        setLogin((current) => ({ ...current, [active]: value.login }));
        if (['connected', 'failed', 'expired', 'cancelled'].includes(value.login?.state)) {
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
  }, [active, call, reload]);

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
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, '社交管线'),
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
      note('微信与 QQ 的消息会攒进这个会话；它也是你在会话栏里看到 📌 标记的那个。')),

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

    note('主人：', status.config.ownerName || '未设置', ' · 兜窗口秒数', String(status.config.windowSeconds)),
    error ? note(error, 'error') : null,
  );
}

const PIN_ATTR = 'data-dsh-life-chat-pin';
const ROW = '[role="treeitem"][aria-selected]';

function titleNodeOf(row) {
  if (!row?.matches?.(ROW)) return null;
  if (row.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return null;
  const children = [...row.children];
  const isDiv = row.tagName === 'DIV' && children.some((child) => child.tagName === 'SPAN');
  if (!isDiv) return null;
  const title = children.find((child) => child.tagName === 'SPAN'
    && [...child.classList].some((token) => token.split(/[_-]/u).includes('title')));
  // Only a plain text node: never cover a rename input or highlighted markup.
  return title && title.childNodes.length === 1 && title.firstChild.nodeType === 3 ? title : null;
}

/**
 * Mark the main session in the sidebar. The Host owns the session list, so this
 * is a small, reversible DOM decoration: no React internals, no data writes.
 */
function installSessionPin(rpcCall) {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return () => {};
  let title = '';
  let disposed = false;
  const painted = new Set();

  const clear = (titleNode) => {
    const pin = titleNode.querySelector?.(`[${PIN_ATTR}]`);
    if (pin) pin.remove();
    painted.delete(titleNode);
  };

  const sync = () => {
    if (disposed) return;
    for (const node of painted) if (!node.isConnected) painted.delete(node);
    for (const row of document.querySelectorAll(ROW)) {
      const titleNode = titleNodeOf(row);
      if (!titleNode) continue;
      const text = String(titleNode.textContent ?? '').trim();
      if (title && text === title) {
        if (painted.has(titleNode)) continue;
        const pin = document.createElement('span');
        pin.setAttribute(PIN_ATTR, '1');
        pin.textContent = '\u{1F4CC}';
        pin.style.marginLeft = '6px';
        pin.style.fontSize = '11px';
        titleNode.appendChild(pin);
        painted.add(titleNode);
      } else if (painted.has(titleNode)) {
        clear(titleNode);
      }
    }
  };

  let refreshing = false;
  const refreshTitle = async () => {
    if (disposed || refreshing) return;
    refreshing = true;
    try {
      const status = await rpcCall('chat.status', {});
      const id = status?.config?.mainSessionId ?? '';
      const next = id ? (await rpcCall('chat.session.title', { sessionId: id }))?.title ?? '' : '';
      if (next !== title) {
        title = String(next ?? '').trim();
        for (const node of painted) clear(node);
        sync();
      }
    } catch {
      // A closed settings page or a Host restart must not break the sidebar.
    } finally {
      refreshing = false;
    }
  };

  void refreshTitle();
  const timer = setInterval(() => { void refreshTitle(); }, 8000);
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    disposed = true;
    clearInterval(timer);
    observer.disconnect();
    for (const node of painted) clear(node);
  };
}

const name = 'dsh-life-chat-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => installSessionPin(rpcCall), 'dsh-life-chat: main session pin');
  }

  // The plugin page owns this panel: `plugins.bundle.config` is a keyed slot
  // whose key is the bundle's package name.
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'dsh-life-pipline',
    inject: () => ({ rpcCall }),
  }, ChatSettingsPanel));
}

module.exports = { name, inject, apply };

    return module.exports;
  }
});
