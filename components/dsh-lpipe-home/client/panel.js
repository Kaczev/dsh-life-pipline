'use strict';

/**
 * The home ("栖所") settings block. The page itself belongs to
 * dsh-life-pipline (「Lpipe 设置」); this file only contributes one block to
 * the child slot it declares there.
 *
 * The backend owns every rule: the block only reads `home.config`, validates
 * the draft through `home.validate`, and persists with `home.config.save`.
 * A successful save is not a working pipeline — the returned `status` decides
 * whether the block is red and whether the prompt is injected.
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-home';
const PANEL_SLOT = 'lpipe.settings.panel';
const VALIDATE_MS = 400;
const SAVED_MS = 1800;

const LOCATION_LABEL = '栖所位置';
const PATH_LABEL = '自定义绝对路径';
const DISABLED_TEXT = '未选择栖所，管线停用，不注入提示词';
const ACTIVE_TEXT = '生效中';
const INVALID_FALLBACK = '栖所目录不可用';
const LOAD_FAILED = '栖所配置无法读取，请检查配置文件。';
const SAVE_INEFFECTIVE = '已保存，但栖所尚未生效：目录校验没有通过，提示词不会注入。';
const FOOTNOTE = '未选择时停用；选了位置但目录不存在、不是文件夹或无法读写时停止注入并标红。不自动创建目录，也不改变工作目录。工作区模式跟随主会话的工作目录。';

const LOCATIONS = [
  ['none', '未选择'],
  ['workspace', '工作区'],
  ['custom', '自定义'],
];

// Host design tokens flip with the light/dark theme. The one literal color is
// the series accent, shared with the other Lpipe blocks.
const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l1)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  accent: '#5ec9b4',
  danger: 'var(--dsw-alias-state-error-primary)',
};

const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: '12px 14px 8px',
  marginBottom: 10,
};

const head = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 };
const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(94, 201, 180, 0.32)',
  background: 'rgba(94, 201, 180, 0.14)',
  color: COLORS.accent,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 };
const field = { minWidth: 0 };
const label = {
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
const controlInvalid = {
  borderColor: COLORS.danger,
  boxShadow: '0 0 0 2px rgba(224, 122, 122, 0.13)',
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
};
const inputMono = { ...input, fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace', fontSize: 11.5 };

const seg = {
  display: 'flex',
  gap: 2,
  padding: 2,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
};
// Selection is a tinted pill and nothing else: no border, no outline, no shadow.
// The host draws borders and focus rings on buttons, and any one of those on an
// unselected item reads as "also selected", which is what looked like multi-select.
const segButton = {
  appearance: 'none',
  fontFamily: 'inherit',
  flex: '1 1 0',
  minWidth: 0,
  margin: 0,
  padding: '3px 8px',
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: COLORS.muted,
  fontSize: 10.5,
  lineHeight: 1.6,
  fontWeight: 400,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  outline: 'none',
  boxShadow: 'none',
};
const segButtonOn = {
  ...segButton,
  background: 'rgba(94, 201, 180, 0.16)',
  color: COLORS.text,
  fontWeight: 650,
};

const pathRow = { marginTop: 8 };
const statusRow = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 10.5, color: COLORS.muted, minWidth: 0 };
const dot = { width: 6, height: 6, borderRadius: 999, flex: 'none' };
const statusPath = {
  fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  fontSize: 10,
  color: COLORS.faint,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const noteStyle = { margin: '8px 0 0', fontSize: 10.5, lineHeight: 1.6, color: COLORS.muted };
const foot = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 8,
  paddingTop: 8,
  borderTop: `1px solid ${COLORS.border}`,
};
const savedText = { fontSize: 10, color: COLORS.faint };
const actions = { display: 'flex', gap: 6, marginLeft: 'auto', flex: 'none' };
const footnote = { margin: '6px 0 0', fontSize: 10, lineHeight: 1.55, color: COLORS.faint };

const scopedCss = [
  '.lpipe-home-control:focus-within{border-color:var(--dsw-alias-border-l2)}',
  '.lpipe-home-control input::placeholder{color:var(--dsw-alias-label-tertiary)}',
  // 宿主的按钮样式会带边框和焦点环，落在分段控件上就像三项同时被选中。
  // 这里把边框、描边、阴影全部清零，选中态只靠 [data-on] 的底色和字重。
  '.lpipe-home-seg button{appearance:none!important;background:transparent!important;border:0!important;',
  'outline:0!important;box-shadow:none!important;color:var(--dsw-alias-label-secondary)!important;',
  'font-weight:400!important;min-height:0!important;height:auto!important;width:auto!important;margin:0!important}',
  '.lpipe-home-seg button[data-on="true"]{background:rgba(94,201,180,.16)!important;',
  'color:var(--dsw-alias-label-primary)!important;font-weight:650!important}',
  '.lpipe-home-seg button:focus,.lpipe-home-seg button:focus-visible{outline:0!important;box-shadow:none!important}',
  '.lpipe-home-seg button:focus-visible{text-decoration:underline!important;text-decoration-thickness:1px!important;',
  'text-underline-offset:3px!important}',
].join('');

function button(quiet) {
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
    border: `1px solid ${COLORS.borderStrong}`,
    background: quiet ? COLORS.soft : 'transparent',
    color: COLORS.text,
  };
}

/** A null config means "could not read" — it is not the empty default. */
function hasReadableConfig(value) {
  return Boolean(value) && value.config !== null && value.config !== undefined;
}

/** Map the backend status onto the one line under the fields. */
function statusView(status) {
  if (!status || status.state === 'disabled') {
    return { tone: 'off', text: DISABLED_TEXT, path: '' };
  }
  if (status.state === 'active') {
    return { tone: 'ok', text: ACTIVE_TEXT, path: status.resolvedPath || status.path || '' };
  }
  return { tone: 'bad', text: status.error || INVALID_FALLBACK, path: status.path || '' };
}

/** The editable form of a config object. */
function draftOf(config) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    location: ['none', 'workspace', 'custom'].includes(source.location) ? source.location : 'none',
    customPath: typeof source.customPath === 'string' ? source.customPath : '',
  };
}

/** The payload for save/validate: trimmed; the typed path survives a mode switch. */
function patchOf(draft) {
  const customPath = String(draft?.customPath ?? '').trim();
  const location = ['none', 'workspace', 'custom'].includes(draft?.location) ? draft.location : 'none';
  return { location, customPath };
}

function SegmentedControl({ value, disabled, onChange }) {
  return h('div', { className: 'lpipe-home-seg', style: seg, role: 'group', 'aria-label': LOCATION_LABEL },
    LOCATIONS.map(([key, text]) => h('button', {
      key,
      type: 'button',
      className: 'lpipe-home-seg__item',
      'data-on': value === key ? 'true' : 'false',
      style: value === key ? segButtonOn : segButton,
      'aria-pressed': value === key,
      disabled,
      onClick: () => onChange(key),
    }, text)));
}

function StatusRow({ status }) {
  const view = statusView(status);
  const color = view.tone === 'bad' ? COLORS.danger : COLORS.muted;
  const dotColor = view.tone === 'bad' ? COLORS.danger : view.tone === 'ok' ? COLORS.accent : COLORS.borderStrong;
  return h('div', { style: { ...statusRow, color } },
    h('span', { style: { ...dot, background: dotColor } }),
    h('span', null, view.text),
    view.path ? h('span', { style: { ...statusPath, color: view.tone === 'bad' ? COLORS.danger : COLORS.faint } }, view.path) : null);
}

function LoadFailed({ error, onRetry }) {
  return h('div', { style: card },
    h('div', { style: { padding: '16px 8px', textAlign: 'center', fontSize: 11.5, lineHeight: 1.7, color: COLORS.danger } },
      error || LOAD_FAILED,
      h('div', { style: { marginTop: 8 } },
        h('button', { type: 'button', style: button(), onClick: onRetry }, '重试'))));
}

function HomeSettingsPanel({ rpcCall }) {
  const [snapshot, setSnapshot] = React.useState(null);
  const [draft, setDraft] = React.useState(() => draftOf(null));
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saved, setSaved] = React.useState(false);
  const hydrated = React.useRef(false);

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

  const adopt = React.useCallback((value, { keepDraft } = {}) => {
    setSnapshot(value);
    setStatus(value?.status ?? null);
    if (!keepDraft) {
      setDraft(draftOf(value?.config));
      hydrated.current = true;
    }
  }, []);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setBusy(true);
    try {
      const value = await call('home.config');
      // A null config means the file could not be read: never dress that up
      // as the empty default.
      if (!hasReadableConfig(value)) {
        setSnapshot(value ?? null);
        setStatus(value?.status ?? null);
        setError(value?.status?.error || LOAD_FAILED);
        hydrated.current = false;
        return;
      }
      adopt(value);
      setError('');
    } catch (cause) {
      setSnapshot(null);
      setStatus(null);
      setError(cause.message || LOAD_FAILED);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [adopt, call]);

  React.useEffect(() => { void reload(); }, [reload]);

  // Validate the editable draft on a short delay, so a half-typed path is not
  // reported as a failure on every keystroke.
  const draftKey = `${draft.location}\u0000${draft.customPath}`;
  const adoptedKey = React.useRef('');
  React.useEffect(() => {
    if (!hasReadableConfig(snapshot) || !hydrated.current) return undefined;
    if (adoptedKey.current === draftKey && status) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const value = await call('home.validate', patchOf(draft));
        if (cancelled) return;
        adoptedKey.current = draftKey;
        if (value?.status) setStatus(value.status);
      } catch {
        // Keep the last known status: the save error carries the real reason.
      }
    }, VALIDATE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [call, draft, draftKey, snapshot, status]);

  React.useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), SAVED_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const update = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError('');
    setSaved(false);
  };

  const canSave = Boolean(hasReadableConfig(snapshot) && !busy && JSON.stringify(patchOf(draft)) !== JSON.stringify(patchOf(draftOf(snapshot.config))));
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const value = await call('home.config.save', patchOf(draft));
      adopt(value);
      adoptedKey.current = '';
      setError('');
      setSaved(true);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(draftOf(snapshot?.config));
    setStatus(snapshot?.status ?? null);
    adoptedKey.current = '';
    setError('');
    setSaved(false);
  };

  const header = h('div', { style: head },
    h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Home'),
    h('span', { style: badge }, '栖所管线'));

  if (!hasReadableConfig(snapshot)) {
    if (loading && !error) {
      return h('section', null, header,
        h('div', { style: card },
          h('div', { style: { padding: '16px 8px', textAlign: 'center', fontSize: 11.5, color: COLORS.muted } },
            '正在读取栖所配置…')));
    }
    return h('section', null, header,
      h(LoadFailed, { error: error || snapshot?.status?.error || LOAD_FAILED, onRetry: () => { void reload(); } }));
  }

  const view = statusView(status);
  const showPath = draft.location === 'custom';

  return h('section', null,
    h('style', null, scopedCss),
    header,
    h('div', { style: card },
      h('div', { style: grid },
        h('div', { style: field },
          h('span', { style: label }, LOCATION_LABEL),
          h(SegmentedControl, {
            value: draft.location,
            disabled: busy,
            onChange: (location) => update({ location }),
          }))),

      showPath
        ? h('div', { style: pathRow },
          h('label', { htmlFor: 'dsh-lpipe-home-path', style: label }, PATH_LABEL),
          h('div', {
            className: 'lpipe-home-control',
            style: view.tone === 'bad' && draft.location === 'custom' ? { ...control, ...controlInvalid } : control,
          },
          h('input', {
            id: 'dsh-lpipe-home-path',
            type: 'text',
            value: draft.customPath,
            placeholder: '例如 D:\\栖所',
            disabled: busy,
            style: inputMono,
            onChange: (event) => update({ customPath: event.target.value }),
          })))
        : null,

      h(StatusRow, { status }),

      saved && view.tone === 'bad'
        ? h('p', { style: { ...noteStyle, color: COLORS.danger } }, SAVE_INEFFECTIVE)
        : null,
      error ? h('p', { style: { ...noteStyle, color: COLORS.danger } }, error) : null,

      h('div', { style: foot },
        h('span', { style: savedText }, saved ? '已保存' : ''),
        h('div', { style: actions },
          h('button', { type: 'button', style: { ...button(true), background: canSave ? COLORS.accent : COLORS.soft, border: `1px solid ${canSave ? COLORS.accent : COLORS.borderStrong}`, color: canSave ? '#ffffff' : COLORS.text, opacity: canSave ? 1 : 0.42 }, disabled: !canSave, onClick: save },
            busy ? '保存中…' : '保存'),
          h('button', { type: 'button', style: button(), disabled: busy, onClick: cancel }, '取消'))),
      h('p', { style: footnote }, FOOTNOTE)),
  );
}

const name = 'dsh-lpipe-home-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT,
    id: 'home',
    order: 70,
    label: () => 'Lpipe Home',
    inject: () => ({ rpcCall }),
  }, HomeSettingsPanel));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: { HomeSettingsPanel, statusView, draftOf, patchOf, hasReadableConfig, SegmentedControl, StatusRow, PANEL_SLOT, RPC_ENDPOINT },
};
