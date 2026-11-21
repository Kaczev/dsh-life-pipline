'use strict';

/**
 * The settings block of the focus pipeline (`dsh-lpipe-focus`).
 * Contributes a single compact card to `lpipe.settings.panel` (`id: 'focus'`),
 * reading and saving scope and threshold settings through `/api/dsh-lpipe-focus`.
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-focus';
const PANEL_SLOT = 'lpipe.settings.panel';
const PANEL_ID = 'focus';
const PANEL_ORDER = 85;

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l1)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  accent: 'var(--dsw-alias-state-business-primary)',
  accentSoft: 'var(--dsw-alias-state-business-tertiary)',
  onAccent: 'var(--dsw-alias-label-on-color)',
  thumb: 'var(--dsw-alias-label-on-color)',
  success: 'var(--dsw-alias-state-success-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  faintDanger: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)',
  accentLine: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 32%, transparent)',
  accentBg: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)',
};

const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: '12px 14px 10px',
  marginBottom: 0,
};

const head = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' };
const titleWrap = { display: 'flex', alignItems: 'center', gap: 8 };
const FOCUS_STYLE_CSS = [
  '.lpipe-focus-control:not([data-invalid="true"]):focus-within{',
  `border-color:${COLORS.accent}!important;`,
  `box-shadow:0 0 0 2px color-mix(in srgb, ${COLORS.accent} 16%, transparent);}`,
  '@keyframes lpipe-focus-spin{to{transform:rotate(360deg)}}',
  '.lpipe-focus-spin{animation:lpipe-focus-spin .9s linear infinite}',
].join('');
const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: `1px solid ${COLORS.accentLine}`,
  background: COLORS.accentBg,
  color: COLORS.accent,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const desc = { margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.5, color: COLORS.muted };

const scopeRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 10px',
  marginBottom: 10,
  borderRadius: 'var(--dsw-radius-sm)',
  border: `1px solid ${COLORS.border}`,
  background: COLORS.soft,
};
const scopeTitle = { fontSize: 11, fontWeight: 650, color: COLORS.text, lineHeight: 1.4 };
const scopeHint = { marginTop: 2, fontSize: 10, color: COLORS.faint, lineHeight: 1.45 };

function switchTrackStyle(on, disabled) {
  return {
    position: 'relative',
    width: 36,
    height: 20,
    padding: 0,
    borderRadius: 999,
    border: `1px solid ${on ? COLORS.accent : COLORS.borderStrong}`,
    background: on ? COLORS.accent : COLORS.borderStrong,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    flex: 'none',
    transition: 'background 150ms, border-color 150ms, opacity 150ms',
  };
}

function switchThumbStyle(on) {
  return {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: 999,
    background: COLORS.thumb,
    transform: on ? 'translateX(16px)' : 'none',
    transition: 'transform 150ms',
  };
}

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: '9px 10px',
};

const field = { minWidth: 0 };
const fieldHead = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 };
const fieldName = { fontSize: 10.5, fontWeight: 650, color: COLORS.muted, overflowWrap: 'anywhere' };
const fieldRange = { fontSize: 9.5, color: COLORS.faint, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

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
  boxShadow: `0 0 0 2px ${COLORS.faintDanger}`,
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
const suffix = { flex: 'none', padding: '0 8px 0 2px', color: COLORS.faint, fontSize: 10.5 };

const foot = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginTop: 11,
  paddingTop: 9,
  borderTop: `1px solid ${COLORS.border}`,
  flexWrap: 'wrap',
};
const statusRow = {
  flex: '1 1 260px',
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 10.5,
  lineHeight: 1.5,
  color: COLORS.muted,
};
const actions = { display: 'flex', gap: 6, alignItems: 'center', flex: 'none' };
const dot = { flex: 'none', width: 6, height: 6, marginTop: 4, borderRadius: 999, background: COLORS.faint };

const FIELDS = Object.freeze([
  { key: 'idleMinutes', label: '闲置整理时长（默认：60）', unit: '分钟', min: 5, max: 1440, fallback: 60, compact: false, rangeHint: '5–1440' },
  { key: 'compactChars', label: '过线整理阈值（默认：512K）', unit: '字符', min: 32000, max: 4000000, fallback: 512000, compact: true, rangeHint: '32K–4M' },
  { key: 'nudgeChars', label: '未转化提醒线（默认：256K）', unit: '字符', min: 16000, max: 2000000, fallback: 256000, compact: true, rangeHint: '16K–2M（≤ 过线）' },
]);

const SCOPE_LABELS = Object.freeze({ allSessions: '所有顶层对话生效', includeSubagents: '包含子智能体' });

const DEFAULT_VALUES = Object.freeze({
  allSessions: false,
  includeSubagents: true,
  ...Object.fromEntries(FIELDS.map((item) => [item.key, item.fallback])),
});

function compactValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  if (number >= 1000000 && number % 100000 === 0) return `${number / 1000000}M`;
  if (number >= 1000 && number % 100 === 0) return `${number / 1000}K`;
  return String(number);
}

function formatFieldValue(item, value) {
  return item.compact ? compactValue(value) : String(value);
}

function parseFieldValue(item, raw) {
  const text = String(raw == null ? '' : raw).trim().replace(/,/g, '');
  if (!text) return NaN;
  if (!item.compact) {
    if (!/^\d+$/.test(text)) return NaN;
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : NaN;
  }
  const match = /^(\d+(?:\.\d+)?)\s*([km])?$/i.exec(text);
  if (!match) return NaN;
  const unit = match[2] ? match[2].toLowerCase() : '';
  const value = Number(match[1]) * (unit === 'm' ? 1000000 : unit === 'k' ? 1000 : 1);
  return Number.isSafeInteger(value) ? value : NaN;
}

function displayValues(values) {
  return Object.fromEntries(
    FIELDS.map((item) => [item.key, formatFieldValue(item, values?.[item.key] ?? item.fallback)]),
  );
}

function validateDraft(draft = {}) {
  const values = {};
  const errors = {};
  for (const item of FIELDS) {
    const raw = draft?.[item.key] == null ? '' : String(draft[item.key]).trim();
    if (raw === '') {
      errors[item.key] = `${item.label.split('（')[0]}不能为空。`;
      continue;
    }
    const parsed = parseFieldValue(item, raw);
    if (!Number.isSafeInteger(parsed)) {
      errors[item.key] = item.compact
        ? `${item.label.split('（')[0]}必须是整数，或带 K/M 的数字。`
        : `${item.label.split('（')[0]}必须是整数。`;
      continue;
    }
    if (parsed < item.min || parsed > item.max) {
      errors[item.key] = `${item.label.split('（')[0]}需在 ${formatFieldValue(item, item.min)}–${formatFieldValue(item, item.max)} 之间。`;
      continue;
    }
    values[item.key] = parsed;
  }
  if (!errors.compactChars && !errors.nudgeChars && values.nudgeChars > values.compactChars) {
    errors.nudgeChars = '未转化提醒线不能高于过线整理阈值。';
  }
  return { values, errors };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const config = {};
  for (const key of Object.keys(SCOPE_LABELS)) {
    config[key] = Object.hasOwn(raw, key) ? raw[key] : DEFAULT_VALUES[key];
    if (typeof config[key] !== 'boolean') return null;
  }
  for (const item of FIELDS) {
    const value = raw[item.key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < item.min || value > item.max) {
      return null;
    }
    config[item.key] = value;
  }
  if (config.nudgeChars > config.compactChars) return null;
  return config;
}

function configOf(reply) {
  if (!reply || reply.ok === false) return null;
  const value = reply.value;
  if (!value || typeof value !== 'object') return null;
  return normalizeConfig(value.config);
}

function payloadOf(values) {
  return Object.fromEntries(FIELDS.map((item) => [item.key, Number(values[item.key])]));
}

function draftMatchesConfig(draft, config) {
  if (!draft || !config) return false;
  return FIELDS.every((item) => parseFieldValue(item, draft[item.key]) === config[item.key]);
}

function toneColor(tone) {
  if (tone === 'warn') return COLORS.warning;
  if (tone === 'error') return COLORS.danger;
  if (tone === 'success') return COLORS.success;
  return COLORS.faint;
}

function buttonStyle(primary, disabled) {
  return {
    appearance: 'none',
    fontFamily: 'inherit',
    fontSize: 11.5,
    lineHeight: 1.45,
    padding: '4px 10px',
    borderRadius: 'var(--dsw-radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    border: `1px solid ${primary && !disabled ? COLORS.accent : COLORS.borderStrong}`,
    background: primary && !disabled ? COLORS.accent : COLORS.soft,
    color: primary && !disabled ? COLORS.onAccent : COLORS.text,
    fontWeight: primary && !disabled ? 650 : 400,
    opacity: disabled ? 0.42 : 1,
  };
}

function fieldView(item, form, errors, disabled, onChange) {
  const error = errors[item.key];
  const id = `focus-${item.key}`;
  const rangeId = `${id}-range`;
  const unitId = `${id}-unit`;
  const describedBy = error ? `${rangeId} ${unitId} focus-status-text` : `${rangeId} ${unitId}`;
  return h(
    'div',
    { key: item.key, style: field },
    h(
      'div',
      { style: fieldHead },
      h('label', { htmlFor: id, style: fieldName }, item.label),
      h('span', { id: rangeId, style: fieldRange }, item.rangeHint),
    ),
    h(
      'div',
      {
        className: 'lpipe-focus-control',
        'data-invalid': error ? 'true' : undefined,
        style: error ? invalidControl : control,
      },
      h('input', {
        id,
        type: 'text',
        inputMode: item.compact ? 'text' : 'numeric',
        autoComplete: 'off',
        spellCheck: false,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        value: form?.[item.key] == null ? '' : form[item.key],
        disabled,
        style: input,
        onChange: (event) => onChange(item.key, event.target.value),
      }),
      h('span', { id: unitId, style: suffix }, item.unit),
    ),
  );
}

function scopeSwitch(key, on, hint, busy, onToggle) {
  const hintId = `focus-${key}-hint`;
  return h('div', { style: scopeRow },
    h('div', { style: { minWidth: 0 } },
      h('div', { style: scopeTitle }, SCOPE_LABELS[key]),
      h('div', { id: hintId, style: scopeHint }, hint),
    ),
    h('button', {
      type: 'button', role: 'switch', 'aria-label': SCOPE_LABELS[key], 'aria-describedby': hintId,
      'aria-checked': on, disabled: busy, style: switchTrackStyle(on, busy), onClick: () => onToggle(key),
    }, h('span', { 'aria-hidden': 'true', style: switchThumbStyle(on) })),
  );
}

function FocusForm({
  allSessions,
  includeSubagents,
  scopeSaving,
  form,
  defaults,
  errors,
  saving,
  dirty,
  statusText,
  statusTone,
  onToggleScope,
  onChange,
  onReset,
  onRevert,
  onSave,
}) {
  const hasErrors = Object.keys(errors || {}).length > 0;
  const scopeBusy = Boolean(scopeSaving || saving);
  const canSave = dirty && !hasErrors && !scopeBusy;
  const canRevert = dirty && !saving;
  const isAtDefault = Boolean(defaults && draftMatchesConfig(form, defaults));
  const canReset = Boolean(defaults) && !isAtDefault && !saving;

  return h(
    'div',
    null,
    h('p', { style: desc }, '用等效层保留一段工作中的定义、经验或结论。上下文过线或会话闲置时，只回收后续层明确替代的旧层。'),
    scopeSwitch('allSessions', allSessions, '关闭时仅选中绑定的 LP 主会话；开启时选中所有顶层对话。', scopeBusy, onToggleScope),
    scopeSwitch('includeSubagents', includeSubagents, '仅对所选顶层对话下的子智能体生效。每个子智能体独立整理自己的上下文。', scopeBusy, onToggleScope),
    h('div', { style: grid }, FIELDS.map((item) => fieldView(item, form, errors, saving, onChange))),
    h(
      'div',
      { style: foot },
      h(
        'div',
        { style: { ...statusRow, color: toneColor(statusTone) }, role: 'status', 'aria-live': 'polite' },
        h('span', { 'aria-hidden': 'true', style: { ...dot, background: toneColor(statusTone) } }),
        h('span', { id: 'focus-status-text' }, statusText),
      ),
      h(
        'div',
        { style: actions },
        h(
          'button',
          {
            type: 'button',
            style: buttonStyle(false, !canReset),
            disabled: !canReset,
            onClick: onReset,
            title: '将草稿填入默认值，保存后生效',
          },
          '恢复默认',
        ),
        h(
          'button',
          {
            type: 'button',
            style: buttonStyle(false, !canRevert),
            disabled: !canRevert,
            onClick: onRevert,
          },
          '撤回',
        ),
        h(
          'button',
          {
            type: 'button',
            style: buttonStyle(true, !canSave),
            disabled: !canSave,
            onClick: onSave,
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
    { style: { padding: '16px 8px 14px', textAlign: 'center', color: COLORS.muted } },
    h('div', {
      className: 'lpipe-focus-spin',
      style: {
        width: 16,
        height: 16,
        margin: '0 auto 8px',
        borderRadius: 999,
        border: `2px solid ${COLORS.borderStrong}`,
        borderTopColor: COLORS.accent,
      },
    }),
    h('div', { style: { fontSize: 12.5, fontWeight: 600, color: COLORS.text } }, '正在读取聚焦管线配置…'),
  );
}

function LoadErrorView({ message, onRetry }) {
  return h(
    'div',
    { style: { padding: '8px 2px 4px' } },
    h(
      'div',
      { role: 'alert', style: { fontSize: 11, lineHeight: 1.55, color: COLORS.danger, marginBottom: 10 } },
      message || '配置文件 life-focus/config.json 无法读取或格式损坏；已保留原文件未覆盖，请修复后重试。',
    ),
    h(
      'button',
      { type: 'button', style: buttonStyle(false, false), onClick: onRetry },
      '重试读取',
    ),
  );
}

function FocusSettingsPanel({ rpcCall }) {
  // Keep state indices explicit for cross-pipeline save-button tests:
  // s[0]: committed config | null
  // s[1]: draft display strings | null
  // s[2]: loading boolean
  // s[3]: loadError string
  // s[4]: saving boolean
  // s[5]: saved feedback { tone, text } | null
  // s[6]: reloadKey number
  // s[7]: defaults config | null
  const [committed, setCommitted] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [defaults, setDefaults] = React.useState(DEFAULT_VALUES);
  const [scopeSaving, setScopeSaving] = React.useState(false);
  const alive = React.useRef(true);
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
      .then(() => rpcCall('focus.config', {}))
      .then((reply) => {
        if (!current) return;
        const config = configOf(reply);
        if (!config) {
          setLoading(false);
          setLoadError(
            reply?.ok === false
              ? (reply?.error?.message || '读取聚焦管线配置失败。')
              : '宿主返回的聚焦配置格式不正确，已按读取失败保护处理。',
          );
          return;
        }
        setCommitted(config);
        setForm(displayValues(config));
        setDefaults(normalizeConfig(reply?.value?.defaults) || DEFAULT_VALUES);
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

  const draft = form ? validateDraft(form) : { values: DEFAULT_VALUES, errors: {} };
  const dirty = Boolean(form && committed && !draftMatchesConfig(form, committed));
  const firstError = FIELDS.map((item) => draft.errors[item.key]).find(Boolean) || '';

  let statusTone = 'muted';
  let statusText = '当前与已保存配置一致，下次请求装配生效。';
  if (firstError) {
    statusTone = 'error';
    statusText = saved?.tone === 'error' ? `${saved.text} ${firstError}` : firstError;
  } else if (saving || scopeSaving) {
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
    statusText = '有未保存改动；保存后下次请求装配生效。';
  } else if (
    committed
    && defaults
    && Object.keys(SCOPE_LABELS).every((key) => committed[key] === defaults[key])
    && FIELDS.every((item) => committed[item.key] === defaults[item.key])
  ) {
    statusText = '全部为默认值，下次请求装配生效。';
  }

  const toggleScope = (key) => {
    if (!committed || saving || scopeSaving) return;
    const previous = committed[key];
    const nextScope = !previous;
    setCommitted((prev) => (prev ? { ...prev, [key]: nextScope } : prev));
    setScopeSaving(true);
    setSaved({ tone: 'muted', text: '保存中…' });
    Promise.resolve()
      .then(() => rpcCall('focus.config.save', { [key]: nextScope }))
      .then((reply) => {
        if (!alive.current) return;
        const next = configOf(reply);
        if (!next || next[key] !== nextScope) {
          setCommitted((prev) => (prev ? { ...prev, [key]: previous } : prev));
          setSaved({ tone: 'error', text: `切换失败（${SCOPE_LABELS[key]}）：${reply?.error?.message || '响应异常'}。` });
          return;
        }
        setCommitted(next);
        setSaved({
          tone: 'success',
          text: `已${next[key] ? '开启' : '关闭'}「${SCOPE_LABELS[key]}」。`,
        });
      })
      .catch((error) => {
        if (!alive.current) return;
        setCommitted((prev) => (prev ? { ...prev, [key]: previous } : prev));
        setSaved({ tone: 'error', text: `切换失败（${SCOPE_LABELS[key]}）：${String(error?.message || error)}。` });
      })
      .finally(() => {
        if (alive.current) setScopeSaving(false);
      });
  };

  const change = (key, value) => {
    generation.current += 1;
    setForm((prev) => ({ ...(prev || displayValues(committed || DEFAULT_VALUES)), [key]: value }));
    setSaved(null);
  };

  const reset = () => {
    if (!defaults || saving) return;
    generation.current += 1;
    setForm(displayValues(defaults));
    setSaved(null);
  };

  const revert = () => {
    if (!committed || saving) return;
    generation.current += 1;
    setForm(displayValues(committed));
    setSaved(null);
  };

  const save = () => {
    if (!form || saving || scopeSaving || !dirty || firstError) return;
    const gen = generation.current;
    setSaving(true);
    setSaved({ tone: 'muted', text: '保存中…' });
    Promise.resolve()
      .then(() => rpcCall('focus.config.save', payloadOf(draft.values)))
      .then((reply) => {
        if (!alive.current) return;
        if (!reply || reply.ok === false) {
          setSaved({ tone: 'error', text: `保存失败：${reply?.error?.message || '未知原因'}；草稿已保留。` });
          return;
        }
        const next = configOf(reply);
        if (!next) {
          setSaved({ tone: 'error', text: '保存返回的配置格式异常，草稿已保留；可重试。' });
          return;
        }
        setCommitted(next);
        if (generation.current === gen) {
          setForm(displayValues(next));
        }
        setSaved({ tone: 'success', text: '已保存，下次请求装配生效。' });
      })
      .catch((error) => {
        if (!alive.current) return;
        setSaved({ tone: 'error', text: `保存失败：${String(error?.message || error)}；草稿已保留。` });
      })
      .finally(() => {
        if (alive.current) setSaving(false);
      });
  };

  const allSessionsOn = Boolean(committed?.allSessions);
  const scopeSummary = `${allSessionsOn ? '所有顶层对话' : 'LP 主会话'}${committed?.includeSubagents ? '及其子智能体' : ''}`;
  const header = h(
    'div',
    { style: head },
    h(
      'div',
      { style: titleWrap },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Focus'),
      h('span', { style: badge }, '聚焦管线'),
    ),
    h(
      'span',
      { style: { marginLeft: 'auto', fontSize: 10.5, color: COLORS.faint } },
      committed ? `短期上下文 · ${scopeSummary}` : '短期上下文',
    ),
  );

  return h(
    'section',
    null,
    h('style', null, FOCUS_STYLE_CSS),
    header,
    h(
      'div',
      { style: card },
      loading
        ? LoadingView()
        : loadError
          ? LoadErrorView({ message: loadError, onRetry: () => setReloadKey((k) => k + 1) })
          : FocusForm({
            allSessions: allSessionsOn,
            includeSubagents: committed?.includeSubagents,
            scopeSaving,
            form,
            defaults,
            errors: draft.errors,
            saving,
            dirty,
            statusText,
            statusTone,
            onToggleScope: toggleScope,
            onChange: change,
            onReset: reset,
            onRevert: revert,
            onSave: save,
          }),
    ),
  );
}

const name = 'dsh-lpipe-focus-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () =>
    ctx.slots.register(
      {
        name: PANEL_SLOT,
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => '聚焦管线',
        inject: () => ({ rpcCall }),
      },
      FocusSettingsPanel,
    ),
  );
}

module.exports = {
  name,
  inject,
  apply,
  __test__: {
    FocusSettingsPanel,
    FocusForm,
    LoadingView,
    LoadErrorView,
    FIELDS,
    DEFAULT_VALUES,
    RPC_ENDPOINT,
    PANEL_SLOT,
    PANEL_ID,
    PANEL_ORDER,
    compactValue,
    formatFieldValue,
    parseFieldValue,
    displayValues,
    validateDraft,
    normalizeConfig,
    configOf,
    payloadOf,
    draftMatchesConfig,
    toneColor,
  },
};
