window.__ModuleLoader__.load({
  id: "dsh-life-pipline",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
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
  if (typeof ctx.slots?.inject !== 'function') return;

  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

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
  __test__: { LpipeSettingsPage, CommonBlock, PANEL_SLOT, SECTION_ID },
};

    return module.exports;
  }
});
