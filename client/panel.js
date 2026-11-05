/*
 * The common settings page of the dsh-lpipe- series.
 *
 * This client half owns two things: the `settings.section` entry named
 * 「Lpipe 设置」 and the **common block** at the top of that page (today: the
 * main session every component shares). Components register their own blocks
 * into the child slot `lpipe.settings.panel` declared below, so the Settings
 * sidebar keeps one entry no matter how many components are installed, and the
 * page itself lives in a single package instead of being copied into each one.
 *
 * A component's bundle patch mounts this package, which is why the page shows
 * up as soon as any dsh-lpipe- plugin is enabled.
 */
const React = require('react');

const h = React.createElement;

const name = 'dsh-life-pipline-settings';
const inject = ['slots', 'connection'];

const PANEL_SLOT = 'lpipe.settings.panel';
const SECTION_ID = 'lpipe';
const RPC_ENDPOINT = 'dsh-life-pipline';

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  success: 'var(--dsw-alias-state-success-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  accent: 'var(--dsw-alias-state-business-primary)',
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
  boxSizing: 'border-box',
  padding: '8px 10px',
  fontSize: 13,
  color: COLORS.text,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
  outline: 'none',
};

const button = {
  border: `1px solid ${COLORS.borderStrong}`,
  background: 'transparent',
  color: COLORS.text,
  borderRadius: 'var(--dsw-radius-sm)',
  padding: '7px 14px',
  fontSize: 13,
  lineHeight: '18px',
  cursor: 'pointer',
  // Never let a flex sibling squeeze this label into two lines.
  flex: 'none',
  whiteSpace: 'nowrap',
};

function note(text, tone) {
  return h('p', {
    style: { margin: '8px 0 0', fontSize: 12, color: tone === 'error' ? COLORS.danger : COLORS.muted },
  }, text);
}

const MARK_ATTR = 'data-dsh-life-pipline-mark';
// Designed session mark: one bubble split teal / periwinkle, 64px, inlined so
// the sidebar decoration costs no extra request. The main session is common
// state, so the common package owns this seat — components stay out of it.
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

/** The common block can repoint the main session at any time; keep it fresh. */
function trackMainSession(rpcCall) {
  let disposed = false;
  let busy = false;
  const read = async () => {
    if (disposed || busy) return;
    busy = true;
    try {
      // The RPC envelope is `{ ok, value }`; the payload sits under `value`.
      const reply = await rpcCall('pipeline.status', {});
      const status = reply && reply.ok === false ? null : reply?.value;
      setMainSessionId(status?.mainSessionId ?? '');
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

/** The part of the page every component shares. */
function CommonBlock({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const call = React.useCallback(async (method, payload) => {
    const result = await rpcCall(method, payload ?? {});
    if (!result || result.ok === false) {
      const failure = new Error(result?.error?.message ?? '请求失败');
      failure.code = result?.error?.code;
      throw failure;
    }
    return result.value;
  }, [rpcCall]);

  const adopt = React.useCallback((value) => {
    setStatus(value);
    setDraft((current) => (current === '' ? value.mainSessionId : current));
  }, []);

  const reload = React.useCallback(async () => {
    try {
      adopt(await call('pipeline.status'));
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }, [adopt, call]);

  React.useEffect(() => { void reload(); }, [reload]);

  // Returning from another tab must not leave a stale title behind.
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const save = async () => {
    setBusy(true);
    try {
      adopt(await call('pipeline.config.save', { mainSessionId: draft.trim() }));
      setError('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  const session = status?.session;
  const titleText = session?.found
    ? (session.title || '（这个会话还没有标题）')
    : (draft.trim() ? '找不到这个会话' : '还没有绑定主会话');

  return h('section', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      h('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600, color: COLORS.text } }, '公共'),
      h('span', {
        style: {
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          color: COLORS.muted, border: `1px solid ${COLORS.border}`,
        },
      }, '所有 dsh-lpipe- 组件共用')),
    h('div', { style: card },
      h('label', { style: label }, '主会话'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('input', {
          style: { ...input, width: 'auto', flex: '1 1 220px', minWidth: 0 },
          value: draft,
          placeholder: 'session-…（粘贴会话 id）',
          onChange: (event) => setDraft(event.target.value),
        }),
        h('button', { style: button, disabled: busy, onClick: save }, '保存')),
      h('p', { style: { margin: '8px 0 0', fontSize: 12, color: COLORS.muted } },
        '当前会话：', h('strong', { style: { color: COLORS.text } }, titleText)),
      note('社交管线的消息与唤醒管线的自主醒来都进这个会话。')),
    error ? note(error, 'error') : null);
}

function LpipeSettingsPage({ renderSlot, rpcCall }) {
  const body = typeof renderSlot === 'function' ? renderSlot(PANEL_SLOT, {}) : null;

  return h('div', { style: { maxWidth: 760 } },
    h('div', { style: { marginBottom: 16 } },
      h('h2', { style: { margin: 0, fontSize: 17, fontWeight: 600 } }, 'Lpipe 设置')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
      rpcCall ? h(CommonBlock, { rpcCall }) : null,
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } }, body)));
}

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => trackMainSession(rpcCall), 'dsh-life-pipline: main session mark');
  }

  if (typeof ctx.slots?.inject !== 'function') return;

  ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({
    name: 'sidebar.session.row.leading',
    id: 'main-session-mark',
    order: 20,
    inject: () => ({}),
  }, MainSessionMark));

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: 60,
    label: () => 'Lpipe 设置',
    inject: () => ({ rpcCall }),
    children: { [PANEL_SLOT]: { kind: 'list', scope: 'root' } },
  }, LpipeSettingsPage));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: { LpipeSettingsPage, CommonBlock, MainSessionMark, setMainSessionId, trackMainSession, PANEL_SLOT, SECTION_ID },
};
