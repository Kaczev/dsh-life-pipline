'use strict';

/**
 * The settings block of the tone pipeline. The page itself belongs to
 * dsh-life-pipline (「Lpipe 设置」); this file only renders one block inside the
 * child slot it declares there.
 *
 * Four editable expression fields, saved by hand, and one independently saved
 * scope switch. Initial values come only from the Host. Blank fields inject
 * nothing into the system prompt.
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-tone';
const PANEL_SLOT = 'lpipe.settings.panel';
const PANEL_ID = 'tone';

// Mirrors components/dsh-lpipe-tone/src/config.mjs. The Host rejects longer text
// and other control characters; the panel checks the same rules first so the
// error appears next to the field instead of coming back from the server.
const MAX_TEXT_LENGTH = 32000;
const FORBIDDEN_CONTROLS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u;

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-secondary)',
  border: 'var(--dsw-alias-border-l1)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  accent: '#5ec9b4',
  success: 'var(--dsw-alias-state-success-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  faintDanger: 'rgba(224, 122, 122, 0.13)',
};

const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: '12px 14px 10px',
  marginBottom: 12,
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

// Two up when the pane is wide enough, stacked when it is narrow.
const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 10,
};

const field = { minWidth: 0 };
const fieldHead = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 };
const fieldName = { fontSize: 10.5, fontWeight: 650, color: COLORS.muted };
const fieldCount = { fontSize: 9, color: COLORS.faint, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

const input = {
  boxSizing: 'border-box',
  display: 'block',
  width: '100%',
  minHeight: 92,
  padding: '7px 9px',
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
  color: COLORS.text,
  fontFamily: 'inherit',
  fontSize: 12.5,
  lineHeight: 1.6,
  outline: 'none',
  resize: 'vertical',
};
const invalidInput = {
  ...input,
  border: `1px solid ${COLORS.danger}`,
  boxShadow: `0 0 0 2px ${COLORS.faintDanger}`,
};

const hint = { margin: '8px 0 0', fontSize: 10, lineHeight: 1.6, color: COLORS.faint };

const foot = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 10,
  paddingTop: 9,
  borderTop: `1px solid ${COLORS.border}`,
  flexWrap: 'wrap',
};
const statusRow = {
  flex: '1 1 300px',
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 10.5,
  lineHeight: 1.55,
  color: COLORS.muted,
};
const actions = { display: 'flex', gap: 8, flex: 'none' };
const dot = { flex: 'none', width: 6, height: 6, marginTop: 4, borderRadius: 999, background: COLORS.faint };

const FIELDS = Object.freeze([
  { key: 'diction', label: '措辞', placeholder: '填写选词与用语习惯。', description: '决定用什么词表达同一个意思，例如日常还是书面、直白还是含蓄，以及称呼、语气词和比喻的使用习惯。不改变术语含义和事实。' },
  { key: 'syntax', label: '句式', placeholder: '填写句子结构与表达形式。', description: '决定一句话怎么组织，例如长句还是短句、完整句还是口语省略，以及分句如何连接。不改变原有判断、条件和确定程度。' },
  { key: 'rhythm', label: '节奏', placeholder: '填写停顿、分句与展开方式。', description: '决定话怎么展开、在哪里停顿，例如段落疏密、停顿、重复和重点的落点。不删减信息，也不为了节奏添加内容。' },
  { key: 'expression', label: '表达的显隐', placeholder: '填写已有态度如何直接或含蓄地表达。', description: '决定已有的情绪和语气表现得多明显，例如直接说出、通过语气词或括号动作表现，还是保持克制。不凭空增加情绪，也不改变对用户的态度。' },
]);

const SCOPE_TITLE = '所有顶层对话生效';
const SCOPE_HINT_ID = 'tone-allSessions-hint';
const SCOPE_STATUS_ID = 'tone-allSessions-status';
const SCOPE_ACCENT = 'var(--dsw-alias-state-business-primary)';
const SCOPE_CSS = [
  `.lpipe-tone-scope-switch:focus-visible{outline:2px solid ${SCOPE_ACCENT};outline-offset:2px}`,
  '@media (prefers-reduced-motion:reduce){.lpipe-tone-scope-switch,.lpipe-tone-scope-switch span{transition:none!important}}',
].join('');
const scopeRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '8px 10px', marginBottom: 10, borderRadius: 'var(--dsw-radius-sm)',
  border: `1px solid ${COLORS.border}`, background: COLORS.soft,
};
const scopeTitle = { fontSize: 11, fontWeight: 650, color: COLORS.text, lineHeight: 1.4 };
const scopeHint = { marginTop: 2, fontSize: 10, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.45 };

const EMPTY_CONFIG = Object.freeze({ diction: '', syntax: '', rhythm: '', expression: '' });

function charCount(text) {
  return typeof text === 'string' ? text.length : 0;
}

function validateDraft(draft) {
  const values = {};
  const errors = {};
  for (const item of FIELDS) {
    const raw = draft?.[item.key];
    // Never trim: the saved text is the text the user typed.
    const text = typeof raw === 'string' ? raw : '';
    values[item.key] = text;
    if (text.length > MAX_TEXT_LENGTH) {
      errors[item.key] = `${item.label}最多 ${MAX_TEXT_LENGTH} 个字符（当前 ${text.length} 个）。`;
    } else if (FORBIDDEN_CONTROLS.test(text)) {
      errors[item.key] = `${item.label}不能包含换行和制表符以外的控制字符。`;
    }
  }
  return { values, errors };
}

/** A well-formed config, or null when the Host answered with something else. */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const config = {};
  for (const item of FIELDS) {
    const value = raw[item.key];
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || FORBIDDEN_CONTROLS.test(value)) return null;
    config[item.key] = value;
  }
  return config;
}

/** `{ ok, value: { config } }` → config, or null for a failed or malformed reply. */
function configOf(reply) {
  if (!reply || reply.ok === false) return null;
  const value = reply.value;
  if (!value || typeof value !== 'object') return null;
  return normalizeConfig(value.config);
}

/** Only the scope reply is allowed to update this value. */
function scopeOf(reply) {
  const value = reply?.value?.config?.allSessions;
  return reply?.ok === true && typeof value === 'boolean' ? value : null;
}

function payloadOf(values) {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, values?.[key] ?? '']));
}

function valuesEqual(left, right) {
  return FIELDS.every((item) => (left?.[item.key] ?? '') === (right?.[item.key] ?? ''));
}

function isBlank(values) {
  return FIELDS.every((item) => (values?.[item.key] ?? '') === '');
}

function toneColor(tone) {
  if (tone === 'warn') return COLORS.warning;
  if (tone === 'error') return COLORS.danger;
  if (tone === 'success') return COLORS.success;
  return COLORS.faint;
}

function button(accent) {
  return {
    appearance: 'none',
    fontFamily: 'inherit',
    fontSize: 12,
    lineHeight: 1.45,
    padding: '7px 14px',
    borderRadius: 'var(--dsw-radius-sm)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    border: `1px solid ${accent || COLORS.borderStrong}`,
    background: accent || 'transparent',
    color: accent ? '#ffffff' : COLORS.text,
  };
}

function fieldView(item, form, errors, disabled, onChange, defaults, onReset) {
  const resetDisabled = disabled || !defaults || form?.[item.key] === defaults[item.key];
  const error = errors[item.key];
  const id = `tone-${item.key}`;
  const length = charCount(form?.[item.key]);
  const over = length > MAX_TEXT_LENGTH;
  return h(
    'div',
    { key: item.key, style: field },
    h(
      'div',
      { style: fieldHead },
      h('label', { htmlFor: id, style: fieldName }, item.label),
      h('span', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
        h('span', { style: { ...fieldCount, color: over ? COLORS.danger : COLORS.faint } }, `${length} / ${MAX_TEXT_LENGTH}`),
        h('button', {
          type: 'button',
          style: { ...button(null), padding: '2px 6px', fontSize: 10, opacity: resetDisabled ? 0.42 : 1 },
          disabled: resetDisabled,
          'aria-label': `${item.label}恢复默认`,
          title: '恢复此项默认文字，仅修改草稿；保存后生效',
          onClick: () => { if (!resetDisabled) onReset(item.key); },
        }, '恢复默认'),
      ),
    ),
    h('p', { id: `${id}-description`, style: { ...hint, margin: '0 0 6px' } }, item.description),
    h('textarea', {
      id,
      rows: 4,
      spellCheck: false,
      placeholder: item.placeholder,
      value: form?.[item.key] ?? '',
      disabled,
      'aria-invalid': Boolean(error),
      'aria-describedby': `${id}-description${error ? ` ${id}-error` : ''}`,
      style: error ? invalidInput : input,
      onChange: (event) => onChange(item.key, event.target.value),
    }),
    error
      ? h('div', { id: `${id}-error`, role: 'alert', style: { margin: '4px 0 0', fontSize: 10, lineHeight: 1.5, color: COLORS.danger } }, error)
      : null,
  );
}

function ToneScope({ on, pending, error, onToggle }) {
  const trackColor = on ? SCOPE_ACCENT : COLORS.borderStrong;
  return h('div', { style: scopeRow },
    h('style', null, SCOPE_CSS),
    h('div', { style: { minWidth: 0 } },
      h('div', { style: scopeTitle }, SCOPE_TITLE),
      h('div', { id: SCOPE_HINT_ID, style: scopeHint }, '关闭时仅对绑定的 LP 主会话生效；开启时对所有顶层对话生效，不包含子智能体。切换后单独保存。'),
      h('div', {
        id: SCOPE_STATUS_ID, role: 'status', 'aria-live': 'polite', 'aria-atomic': true,
        style: { ...scopeHint, marginTop: pending || error ? 2 : 0, color: error ? COLORS.danger : scopeHint.color },
      }, pending ? '正在保存作用范围…' : error),
    ),
    h('button', {
      type: 'button', role: 'switch', className: 'lpipe-tone-scope-switch', 'aria-label': SCOPE_TITLE,
      'aria-describedby': `${SCOPE_HINT_ID} ${SCOPE_STATUS_ID}`, 'aria-checked': on, 'aria-busy': pending,
      disabled: pending, onClick: onToggle,
      style: {
        position: 'relative', width: 36, height: 20, padding: 0, borderRadius: 999,
        border: `1px solid ${trackColor}`, background: trackColor, flex: 'none',
        cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.55 : 1,
        transition: 'background 150ms, border-color 150ms, opacity 150ms',
      },
    }, h('span', { 'aria-hidden': true, style: {
      position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: 999,
      background: 'var(--dsw-alias-label-on-color)', transform: on ? 'translateX(16px)' : 'none',
      transition: 'transform 150ms',
    } })),
  );
}

function ToneForm({ form, defaults, errors, saving, dirty, canClear, statusText, statusTone, onChange, onReset, onSave, onClear, onRevert }) {
  const hasErrors = Object.keys(errors || {}).length > 0;
  const canSave = dirty && !hasErrors && !saving;
  // Clearing is a save of four empty strings, so it is unavailable while saving.
  const clearable = Boolean(canClear) && !saving;
  return h(
    'div',
    null,
    h('div', { style: grid }, FIELDS.map((item) => fieldView(item, form, errors, saving, onChange, defaults, onReset))),
    h(
      'p',
      { style: hint },
      '四项均可单独填写；留空的项不施加要求，全空时不注入。恢复默认只修改草稿，保存后生效。只改变表达，不改内容、态度和行为。',
    ),
    h(
      'div',
      { style: foot },
      h(
        'div',
        { style: { ...statusRow, color: toneColor(statusTone) }, role: 'status', 'aria-live': 'polite' },
        h('span', { style: { ...dot, background: toneColor(statusTone) } }),
        h('span', null, statusText),
      ),
      h(
        'div',
        { style: actions },
        h(
          'button',
          {
            type: 'button',
            style: {
              ...button(null),
              background: COLORS.soft,
              border: `1px solid ${COLORS.borderStrong}`,
              opacity: clearable ? 1 : 0.42,
            },
            onClick: onClear,
            disabled: !clearable,
            title: '清空四项并保存；空白时不注入任何内容',
          },
          '清空',
        ),
        h(
          'button',
          {
            type: 'button',
            style: dirty && !saving ? { ...button(null), opacity: 1 } : { ...button(null), opacity: 0.42 },
            onClick: onRevert,
            disabled: !dirty || saving,
          },
          '撤回',
        ),
        h(
          'button',
          {
            type: 'button',
            style: (() => {
              const base = button(canSave ? COLORS.accent : null);
              return canSave ? { ...base, opacity: 1 } : { ...base, opacity: 0.42 };
            })(),
            onClick: onSave,
            disabled: !canSave,
          },
          saving ? '保存中…' : '保存',
        ),
      ),
    ),
  );
}

function LoadingView() {
  return h(
    'div',
    { style: { padding: '22px 10px 18px', textAlign: 'center', color: COLORS.muted } },
    h('div', {
      style: {
        width: 18,
        height: 18,
        margin: '0 auto 10px',
        borderRadius: 999,
        border: `2px solid ${COLORS.borderStrong}`,
        borderTopColor: COLORS.accent,
      },
    }),
    h('div', { style: { fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 5 } }, '正在读取语气管线配置…'),
    h('div', { style: { fontSize: 11, lineHeight: 1.7 } }, '马上就好。'),
  );
}

function LoadErrorView({ message, onRetry }) {
  return h(
    'div',
    { style: { padding: '22px 10px 18px', textAlign: 'center', color: COLORS.muted } },
    h('div', { style: { fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 5 } }, '读取失败'),
    h('div', { style: { fontSize: 11, lineHeight: 1.7 } }, message || '宿主没有回话，也没有显示成空白配置。'),
    h('button', { type: 'button', style: { ...button(null), marginTop: 12 }, onClick: onRetry }, '重试'),
  );
}

function TonePanel({ rpcCall }) {
  const [form, setForm] = React.useState(null);
  const [committed, setCommitted] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [defaults, setDefaults] = React.useState(null);
  const [scope, setScope] = React.useState(false);
  const [scopeSaving, setScopeSaving] = React.useState(false);
  const [scopeError, setScopeError] = React.useState('');
  const scopePending = React.useRef(false);
  const alive = React.useRef(true);
  // Every edit bumps the generation; a reply from an older one must not write
  // over text the user has typed since.
  const generation = React.useRef(0);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  React.useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    setSaved(null);
    Promise.resolve()
      .then(() => rpcCall('tone.config', {}))
      .then((reply) => {
        if (!current) return;
        const config = configOf(reply);
        const nextScope = scopeOf(reply);
        if (!config || nextScope === null) {
          setLoading(false);
          setLoadError(reply?.ok === false
            ? (reply?.error?.message || '读不到语气管线配置')
            : '宿主返回的语气配置格式不对，已按读取失败处理。');
          return;
        }
        setForm(config);
        setCommitted(config);
        setScope(nextScope);
        setScopeError('');
        setDefaults(normalizeConfig(reply?.value?.defaults));
        setLoading(false);
      })
      .catch((error) => {
        if (!current) return;
        setLoading(false);
        setLoadError(String(error?.message || error));
      });
    return () => {
      current = false;
    };
  }, [rpcCall, reloadKey]);

  const draft = form ? validateDraft(form) : { values: EMPTY_CONFIG, errors: {} };
  const dirty = Boolean(form && committed && !valuesEqual(form, committed));
  const firstError = FIELDS.map((item) => draft.errors[item.key]).find(Boolean) || '';
  const hasSavedText = Boolean(committed && !isBlank(committed));
  const canClear = Boolean(form) && !saving && (hasSavedText || !isBlank(form));

  let statusTone = 'muted';
  let statusText = '保存后下一轮起生效；只改这四项。';
  if (firstError) {
    statusTone = 'error';
    statusText = `校验未通过：${firstError}`;
  } else if (saving) {
    statusTone = 'muted';
    statusText = '保存中…';
  } else if (saved?.tone === 'error') {
    statusTone = 'error';
    statusText = saved.text;
  } else if (saved?.text) {
    statusTone = saved.tone || 'muted';
    statusText = saved.text;
  } else if (dirty) {
    statusTone = 'warn';
    statusText = '改了还没保存；保存后下一轮起生效。';
  } else if (!dirty && committed && isBlank(committed)) {
    statusText = '四项都是空白，下一轮不会注入任何语气内容。';
  }

  const change = (key, value) => {
    generation.current += 1;
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(null);
  };

  const reset = (key) => {
    if (saving || !defaults || !FIELDS.some((item) => item.key === key)) return;
    change(key, defaults[key]);
  };

  const revert = () => {
    if (!committed || saving) return;
    generation.current += 1;
    setForm(committed);
    setSaved(null);
  };

  const submit = (values, empty) => {
    if (!form || saving) return;
    const gen = generation.current;
    setSaving(true);
    setSaved({ tone: 'muted', text: '保存中…' });
    Promise.resolve()
      .then(() => rpcCall('tone.config.save', payloadOf(values)))
      .then((reply) => {
        if (!alive.current) return;
        if (!reply || reply.ok === false) {
          setSaved({ tone: 'error', text: `保存失败：${reply?.error?.message || '未知原因'}；草稿还留着。` });
          return;
        }
        const next = configOf(reply);
        if (!next) {
          setSaved({ tone: 'error', text: '保存返回的配置格式不对，草稿还留着；可以重试或重新读取。' });
          return;
        }
        // The returned config is the new saved baseline in either case.
        setCommitted(next);
        // Only a reply that matches the newest edit may move the draft.
        if (generation.current === gen) setForm(next);
        setSaved({ tone: 'success', text: empty ? '已清空，下一轮起不再注入' : '已保存，下一轮起生效' });
      })
      .catch((error) => {
        if (!alive.current) return;
        setSaved({ tone: 'error', text: `保存失败：${String(error?.message || error)}；草稿还留着。` });
      })
      .finally(() => {
        if (alive.current) setSaving(false);
      });
  };

  const save = () => {
    if (!form || saving || !dirty || firstError) return;
    submit(draft.values, isBlank(draft.values));
  };

  const clear = () => {
    if (!canClear) return;
    generation.current += 1;
    setForm(EMPTY_CONFIG);
    submit(EMPTY_CONFIG, true);
  };

  const toggleScope = async () => {
    if (scopePending.current) return;
    const next = !scope;
    scopePending.current = true;
    setScopeSaving(true);
    setScopeError('');
    try {
      const reply = await rpcCall('tone.config.save', { allSessions: next });
      if (scopeOf(reply) !== next) throw new Error(reply?.error?.message || '未收到有效确认');
      if (alive.current) setScope(next);
    } catch (error) {
      if (alive.current) setScopeError(`作用范围保存失败：${String(error?.message || error)}。可重试。`);
    } finally {
      scopePending.current = false;
      if (alive.current) setScopeSaving(false);
    }
  };

  const header = h(
    'div',
    { style: head },
    h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Tone'),
    h('span', { style: badge }, '语气管线'),
  );

  if (loading) {
    return h('section', null, header, h('div', { style: card }, h(LoadingView)));
  }

  if (loadError) {
    return h(
      'section',
      null,
      header,
      h('div', { style: card }, h(LoadErrorView, { message: loadError, onRetry: () => setReloadKey((key) => key + 1) })),
    );
  }

  return h(
    'section',
    null,
    header,
    h(
      'div',
      { style: card },
      h(ToneScope, { on: scope, pending: scopeSaving, error: scopeError, onToggle: toggleScope }),
      h(ToneForm, {
        form,
        defaults,
        errors: draft.errors,
        saving,
        dirty,
        canClear,
        statusText,
        statusTone,
        onChange: change,
        onReset: reset,
        onSave: save,
        onClear: clear,
        onRevert: revert,
      }),
    ),
  );
}

const name = 'dsh-lpipe-tone-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () =>
    ctx.slots.register(
      {
        name: PANEL_SLOT,
        id: PANEL_ID,
        order: 80,
        label: () => '语气管线',
        inject: () => ({ rpcCall }),
      },
      TonePanel,
    ),
  );
}

module.exports = {
  name,
  inject,
  apply,
  __test__: {
    TonePanel,
    ToneForm,
    LoadingView,
    LoadErrorView,
    FIELDS,
    EMPTY_CONFIG,
    MAX_TEXT_LENGTH,
    FORBIDDEN_CONTROLS,
    RPC_ENDPOINT,
    PANEL_SLOT,
    PANEL_ID,
    charCount,
    validateDraft,
    normalizeConfig,
    configOf,
    payloadOf,
    valuesEqual,
    isBlank,
    toneColor,
  },
};
