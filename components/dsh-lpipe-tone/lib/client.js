window.__ModuleLoader__.load({
  id: "dsh-lpipe-tone",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
'use strict';

/**
 * The settings block of the tone pipeline. The page itself belongs to
 * dsh-life-pipline (「Lpipe 设置」); this file only renders one block inside the
 * child slot it declares there.
 *
 * Two optional plain-text fields, saved by hand. Nothing is pre-filled: an
 * empty block is the normal first state, because both fields start blank and
 * blank fields inject nothing into the system prompt.
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
  { key: 'description', label: '语气描述', placeholder: '例如：用括号表示状态、经常撒娇、可可爱爱。' },
  { key: 'examples', label: '对话示例', placeholder: '把满意的对话整段粘进来；没有示例也可以只写描述。' },
]);

const EMPTY_CONFIG = Object.freeze({ description: '', examples: '' });

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

function payloadOf(values) {
  return { description: values?.description ?? '', examples: values?.examples ?? '' };
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

function fieldView(item, form, errors, disabled, onChange) {
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
      h('span', { style: { ...fieldCount, color: over ? COLORS.danger : COLORS.faint } }, `${length} / ${MAX_TEXT_LENGTH}`),
    ),
    h('textarea', {
      id,
      rows: 4,
      spellCheck: false,
      placeholder: item.placeholder,
      value: form?.[item.key] ?? '',
      disabled,
      'aria-invalid': Boolean(error),
      'aria-describedby': error ? `${id}-error` : undefined,
      style: error ? invalidInput : input,
      onChange: (event) => onChange(item.key, event.target.value),
    }),
    error
      ? h('div', { id: `${id}-error`, role: 'alert', style: { margin: '4px 0 0', fontSize: 10, lineHeight: 1.5, color: COLORS.danger } }, error)
      : null,
  );
}

function ToneForm({ form, errors, saving, dirty, canClear, statusText, statusTone, onChange, onSave, onClear, onRevert }) {
  const hasErrors = Object.keys(errors || {}).length > 0;
  const canSave = dirty && !hasErrors && !saving;
  // Clearing is a save of two empty strings, so it is unavailable while saving.
  const clearable = Boolean(canClear) && !saving;
  return h(
    'div',
    null,
    h('div', { style: grid }, FIELDS.map((item) => fieldView(item, form, errors, saving, onChange))),
    h(
      'p',
      { style: hint },
      '两项都空白时不注入任何内容；描述只改变表达风格，不改变事实和工具结果，示例也不会变成当前事件或有效承诺。',
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
            title: '清空两项并保存；空白时不注入任何内容',
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
        if (!config) {
          setLoading(false);
          setLoadError(reply?.ok === false
            ? (reply?.error?.message || '读不到语气管线配置')
            : '宿主返回的语气配置格式不对，已按读取失败处理。');
          return;
        }
        setForm(config);
        setCommitted(config);
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
  let statusText = '保存后下一轮起生效；只改这两项。';
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
    statusText = '两项都是空白，下一轮不会注入任何语气内容。';
  }

  const change = (key, value) => {
    generation.current += 1;
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(null);
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
      h(ToneForm, {
        form,
        errors: draft.errors,
        saving,
        dirty,
        canClear,
        statusText,
        statusTone,
        onChange: change,
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

    return module.exports;
  }
});
