'use strict';

const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-recall';
const PANEL_SLOT = 'lpipe.settings.panel';
const PANEL_ID = 'recall';

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

const grid = { display: 'grid', gap: 7 };
const gridFive = { ...grid, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' };

const field = { minWidth: 0 };
const fieldHead = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 4 };
const fieldName = { fontSize: 10.5, fontWeight: 650, color: COLORS.muted, whiteSpace: 'nowrap' };
const fieldRange = { fontSize: 9, color: COLORS.faint, whiteSpace: 'nowrap' };

const control = {
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)',
  background: COLORS.soft,
};
const invalidControl = {
  ...control,
  border: `1px solid ${COLORS.danger}`,
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
  fontVariantNumeric: 'tabular-nums',
};
const suffix = { flex: 'none', padding: '0 8px 0 1px', color: COLORS.faint, fontSize: 10 };

const foot = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 11,
  paddingTop: 9,
  borderTop: `1px solid ${COLORS.border}`,
  flexWrap: 'wrap',
};
const statusRow = { flex: '1 1 300px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10.5, lineHeight: 1.55, color: COLORS.muted };
const actions = { display: 'flex', gap: 8, flex: 'none' };
const dot = { flex: 'none', width: 6, height: 6, marginTop: 4, borderRadius: 999, background: COLORS.faint };

const FIELDS = Object.freeze([
  { key: 'fragments', label: '每轮片段', unit: '段', min: 1, max: 5, fallback: 4 },
  { key: 'sentencesPerFragment', label: '每段句数', unit: '句', min: 1, max: 12, fallback: 2 },
  { key: 'inputChars', label: '真文上限', unit: '字', min: 2000, max: 32000, fallback: 32000 },
  { key: 'backgroundChars', label: '背景窗口', unit: '字', min: 8000, max: 96000, fallback: 16000 },
  { key: 'coolChars', label: '冷却窗口', unit: '字', min: 32000, max: 4000000, fallback: 2500000 },
  { key: 'recentDays', label: '近期记忆天数', unit: '天', min: 1, max: 3650, fallback: 30 },
]);

const DEFAULT_VALUES = Object.freeze(Object.fromEntries(FIELDS.map((item) => [item.key, item.fallback])));

function compactValue(value) {
  const number = Number(value);
  if (number >= 1000000 && number % 100000 === 0) return `${number / 1000000}M`;
  if (number >= 1000 && number % 100 === 0) return `${number / 1000}K`;
  return String(number);
}

function parseAmount(raw) {
  const text = String(raw == null ? '' : raw).trim().replace(/,/g, '');
  const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(text);
  if (!match) return NaN;
  const suffix = match[2] ? match[2].toLowerCase() : '';
  const value = Number(match[1]) * (suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1);
  return Number.isInteger(value) ? value : NaN;
}

function displayValues(values) {
  return Object.fromEntries(FIELDS.map((item) => [item.key, compactValue(values?.[item.key] ?? item.fallback)]));
}

function validateDraft(draft = {}) {
  const values = {};
  const errors = {};
  for (const item of FIELDS) {
    const raw = draft[item.key] == null ? '' : String(draft[item.key]).trim();
    if (raw === '') {
      errors[item.key] = `${item.label}不能为空。`;
      continue;
    }
    const value = parseAmount(raw);
    if (!Number.isFinite(value)) {
      errors[item.key] = `${item.label}必须是整数，或带 K/M 的数字。`;
      continue;
    }
    if (value < item.min || value > item.max) {
      errors[item.key] = `${item.label}需在 ${compactValue(item.min)}–${compactValue(item.max)} 之间。`;
      continue;
    }
    values[item.key] = value;
  }
  return { values, errors };
}

function normalizeValues(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const values = {};
  for (const item of FIELDS) {
    const value = Number(source[item.key]);
    values[item.key] = Number.isInteger(value) && value >= item.min && value <= item.max ? value : item.fallback;
  }
  return values;
}

function payloadOf(values) {
  return Object.fromEntries(FIELDS.map((item) => [item.key, Number(values[item.key])]));
}

function valuesEqual(left, right) {
  return FIELDS.every((item) => parseAmount(left?.[item.key]) === parseAmount(right?.[item.key]));
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
  const id = `recall-${item.key}`;
  return h(
    'div',
    { key: item.key, style: field },
    h(
      'div',
      { style: fieldHead },
      h('label', { htmlFor: id, style: fieldName }, item.label),
      h('span', { style: fieldRange }, `${compactValue(item.min)}–${compactValue(item.max)}`),
    ),
    h(
      'div',
      { style: error ? invalidControl : control },
      h('input', {
        id,
        type: 'text',
        inputMode: 'numeric',
        autoComplete: 'off',
        spellCheck: false,
        value: form[item.key] == null ? '' : form[item.key],
        disabled,
        'aria-invalid': Boolean(error),
        style: input,
        onChange: (event) => onChange(item.key, event.target.value),
      }),
      h('span', { style: suffix }, item.unit),
    ),
  );
}

function RecallForm({ form, errors, saving, dirty, statusText, statusTone, onChange, onSave, onRevert }) {
  const hasErrors = Object.keys(errors || {}).length > 0;
  const canSave = dirty && !hasErrors && !saving;
  return h(
    'div',
    null,
    h('div', { style: gridFive }, FIELDS.map((item) => fieldView(item, form, errors, saving, onChange))),
    h(
      'div',
      { style: foot },
      h(
        'div',
        {
          style: { ...statusRow, color: toneColor(statusTone) },
          role: 'status',
          'aria-live': 'polite',
        },
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
              opacity: dirty && !saving ? 1 : 0.42,
            },
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
              return canSave ? base : { ...base, opacity: 0.42 };
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
    h('div', { style: { fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 5 } }, '正在读取回忆管线配置…'),
    h('div', { style: { fontSize: 11, lineHeight: 1.7 } }, '马上就好。'),
  );
}

function LoadErrorView({ message, onRetry }) {
  return h(
    'div',
    { style: { padding: '22px 10px 18px', textAlign: 'center', color: COLORS.muted } },
    h('div', { style: { fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 5 } }, '读取失败'),
    h('div', { style: { fontSize: 11, lineHeight: 1.7 } }, message || '宿主没有回话。'),
    h(
      'button',
      { type: 'button', style: { ...button(null), marginTop: 12 }, onClick: onRetry },
      '重试',
    ),
  );
}

function RecallPanel({ rpcCall }) {
  const [form, setForm] = React.useState(null);
  const [committed, setCommitted] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    setSaved(null);
    Promise.resolve()
      .then(() => rpcCall('recall.config', {}))
      .then((reply) => {
        if (!alive) return;
        if (!reply || !reply.ok) {
          setLoading(false);
          setLoadError(reply?.error?.message || '读不到回忆管线配置');
          return;
        }
        const loaded = normalizeValues(reply.value);
        setForm(displayValues(loaded));
        setCommitted(loaded);
        setLoading(false);
      })
      .catch((error) => {
        if (!alive) return;
        setLoading(false);
        setLoadError(String(error?.message || error));
      });
    return () => {
      alive = false;
    };
  }, [rpcCall, reloadKey]);

  const draft = form ? validateDraft(form) : { values: {}, errors: {} };
  const dirty = Boolean(form && committed && !valuesEqual(form, committed));
  const firstError = FIELDS.map((item) => draft.errors[item.key]).find(Boolean) || '';
  let statusTone = 'muted';
  let statusText = '保存后下一轮起生效；只改这六项，其他配置原样保留。';
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
  }

  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(null);
  };

  const revert = () => {
    if (!committed || saving) return;
    setForm(displayValues(committed));
    setSaved(null);
  };

  const save = () => {
    if (!form || saving || !dirty || firstError) return;
    setSaving(true);
    setSaved({ tone: 'muted', text: '保存中…' });
    Promise.resolve()
      .then(() => rpcCall('recall.config.save', payloadOf(draft.values)))
      .then((reply) => {
        if (!reply || !reply.ok) {
          setSaved({ tone: 'error', text: `保存失败：${reply?.error?.message || '未知原因'}` });
          return;
        }
        const next = normalizeValues(reply.value || draft.values);
        setForm(displayValues(next));
        setCommitted(next);
        setSaved({ tone: 'success', text: '已保存，下一轮起生效' });
      })
      .catch((error) => setSaved({ tone: 'error', text: `保存失败：${String(error?.message || error)}` }))
      .finally(() => setSaving(false));
  };

  const header = h(
    'div',
    { style: head },
    h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Recall'),
    h('span', { style: badge }, '回忆管线'),
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
      h(RecallForm, {
        form,
        errors: draft.errors,
        saving,
        dirty,
        statusText,
        statusTone,
        onChange: change,
        onSave: save,
        onRevert: revert,
      }),
    ),
  );
}

const name = 'dsh-lpipe-recall-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () =>
    ctx.slots.register(
      {
        name: PANEL_SLOT,
        id: PANEL_ID,
        order: 50,
        label: () => '回忆管线',
        inject: () => ({ rpcCall }),
      },
      RecallPanel,
    ),
  );
}

module.exports = {
  name,
  inject,
  apply,
  __test__: {
    RecallPanel,
    RecallForm,
    LoadingView,
    LoadErrorView,
    FIELDS,
    DEFAULT_VALUES,
    RPC_ENDPOINT,
    PANEL_SLOT,
    PANEL_ID,
    compactValue,
    parseAmount,
    displayValues,
    validateDraft,
    normalizeValues,
    payloadOf,
    valuesEqual,
    toneColor,
  },
};
