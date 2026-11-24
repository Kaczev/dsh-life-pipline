window.__ModuleLoader__.load({
  id: "dsh-lpipe-tone",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
'use strict';

const React = require('react');
const h = React.createElement;
const RPC_ENDPOINT = 'dsh-lpipe-tone';
const PANEL_SLOT = 'lpipe.settings.panel';
const PANEL_ID = 'tone';

// Match the Host's UTF-16 length limit and control-character validation.
const MAX_TEXT_LENGTH = 32000;
const FORBIDDEN_CONTROLS = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/u;
function phraseError(text) {
  if (typeof text !== 'string') return '习惯用语必须是文字。';
  if (text.length > MAX_TEXT_LENGTH) return `习惯用语最多 ${MAX_TEXT_LENGTH} 个字符（当前 ${text.length} 个）。`;
  if (FORBIDDEN_CONTROLS.test(text)) return '请填写单行文字，去掉换行和其他控制字符。';
  return '';
}
function phraseOf(config) {
  return phraseError(config?.phrase) ? null : config.phrase;
}
function scopeOf(reply) {
  const value = reply?.value?.config?.allSessions;
  return reply?.ok === true && typeof value === 'boolean' ? value : null;
}

const COLORS = {
  text: 'var(--dsw-alias-label-primary)', muted: 'var(--dsw-alias-label-secondary)',
  border: 'var(--dsw-alias-border-l1)', borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)', soft: 'var(--dsw-alias-bg-layer-2)',
  accent: 'color-mix(in srgb, #9172bb 54%, var(--dsw-alias-label-primary))', fill: '#72549a', success: 'var(--dsw-alias-state-success-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)', error: 'var(--dsw-alias-state-error-primary)',
};
const card = {
  border: `1px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-lg)', background: COLORS.bg,
  padding: '12px 14px 10px', marginBottom: 0,
};
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 };
const hint = { margin: '2px 0', fontSize: 10, lineHeight: 1.45, color: COLORS.muted };
const SCOPE_TITLE = '所有顶层对话生效';
const SCOPE_HINT_ID = 'tone-allSessions-hint';
const SCOPE_STATUS_ID = 'tone-allSessions-status';
const PANEL_CSS = [
  `.lpipe-tone-panel :is(button,input):focus-visible{outline:2px solid ${COLORS.accent};outline-offset:2px}`,
  '@media (prefers-reduced-motion:reduce){.lpipe-tone-scope-switch,.lpipe-tone-scope-switch span{transition:none!important}}',
].join('');
function action(label, onClick, disabled, primary = false) {
  return h('button', { type: 'button', onClick, disabled, style: {
    fontFamily: 'inherit', fontSize: 11, lineHeight: 1.45, padding: '4px 9px', borderRadius: 'var(--dsw-radius-sm)',
    border: `1px solid ${primary ? COLORS.accent : COLORS.borderStrong}`, background: primary ? COLORS.fill : COLORS.soft,
    color: primary ? 'var(--dsw-alias-label-on-color)' : COLORS.text, opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } }, label);
}

function ToneScope({ on, pending, error, onToggle }) {
  const trackColor = on ? COLORS.fill : COLORS.borderStrong;
  return h('div', { style: { ...row, padding: '8px 10px', marginBottom: 8, borderRadius: 'var(--dsw-radius-sm)',
    border: `1px solid ${COLORS.border}`, background: COLORS.soft } },
    h('div', { style: { minWidth: 0 } },
      h('div', { style: { fontSize: 11, lineHeight: 1.4, fontWeight: 650, color: COLORS.text } }, SCOPE_TITLE),
      h('div', { id: SCOPE_HINT_ID, style: hint }, '关闭时仅用于 LP 主会话。开启后覆盖所有顶层对话，子智能体除外。'),
      h('div', { id: SCOPE_STATUS_ID, role: 'status', 'aria-live': 'polite', style: { ...hint, margin: 0, color: COLORS.error } },
        pending ? '正在保存作用范围…' : error),
    ),
    h('button', {
      type: 'button', role: 'switch', className: 'lpipe-tone-scope-switch', 'aria-label': SCOPE_TITLE,
      'aria-describedby': `${SCOPE_HINT_ID} ${SCOPE_STATUS_ID}`, 'aria-checked': on, 'aria-busy': pending,
      disabled: pending, onClick: onToggle,
      style: { position: 'relative', width: 36, height: 20, padding: 0, borderRadius: 999,
        border: `1px solid ${trackColor}`, background: trackColor, flex: 'none', cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.55 : 1, transition: 'background 150ms, border-color 150ms, opacity 150ms' },
    }, h('span', { 'aria-hidden': true, style: {
      position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: 999,
      background: 'var(--dsw-alias-label-on-color)', transform: on ? 'translateX(16px)' : 'none', transition: 'transform 150ms',
    } })),
  );
}

function ToneForm({ phrase, committed, saving, notice, onChange, onSubmit }) {
  const error = phraseError(phrase);
  const dirty = phrase !== committed;
  let status = notice;
  if (error) status = { tone: 'error', text: error };
  else if (saving) status = { tone: 'muted', text: '正在保存…' };
  else if (!status && dirty) status = { tone: 'warning', text: '有未保存的修改。' };
  else if (!status) status = { tone: 'muted', text: '留空并保存即可停用。' };
  return h('div', null,
    h('label', { htmlFor: 'tone-phrase', style: { display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 650, color: COLORS.text } }, '习惯用语'),
    h('div', { style: { ...row, flexWrap: 'wrap', gap: 6 } },
      h('input', {
        id: 'tone-phrase', type: 'text', placeholder: '呜……', spellCheck: false, value: phrase, disabled: saving,
        'aria-invalid': Boolean(error), 'aria-describedby': 'tone-phrase-status',
        onChange: (event) => onChange(event.target.value),
        style: { flex: '1 1 12em', minWidth: 0, boxSizing: 'border-box', height: 30, padding: '4px 8px',
          border: `1px solid ${error ? COLORS.error : COLORS.borderStrong}`, borderRadius: 'var(--dsw-radius-sm)',
          background: COLORS.soft, color: COLORS.text, fontFamily: 'inherit', fontSize: 12.5 },
      }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        dirty ? action('撤回', () => onChange(committed), saving) : null,
        action(saving ? '保存中…' : '保存', () => onSubmit(phrase), saving || !dirty || Boolean(error), true),
      ),
    ),
    h('div', { id: 'tone-phrase-status', role: 'status', 'aria-live': 'polite', style: { ...hint, color: COLORS[status.tone] } }, status.text),
  );
}

function TonePanel({ rpcCall }) {
  const [phrase, setPhrase] = React.useState('');
  const [committed, setCommitted] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [scope, setScope] = React.useState(false);
  const [scopeSaving, setScopeSaving] = React.useState(false);
  const [scopeError, setScopeError] = React.useState('');
  const scopePending = React.useRef(false);
  const phrasePending = React.useRef(false);
  const generation = React.useRef(0);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  React.useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    setNotice(null);
    (async () => {
      try {
        const reply = await rpcCall('tone.config', {});
        if (!current) return;
        const text = phraseOf(reply?.value?.config);
        const nextScope = scopeOf(reply);
        if (text === null || nextScope === null) throw new Error(reply?.error?.message || '宿主返回的语气配置格式不对。');
        setPhrase(text);
        setCommitted(text);
        setScope(nextScope);
        setScopeError('');
      } catch (error) {
        if (current) setLoadError(String(error?.message || error));
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [rpcCall, reloadKey]);

  const change = (text) => {
    generation.current += 1;
    setPhrase(text);
    setNotice(null);
  };
  const submit = async (text) => {
    if (phrasePending.current || phraseError(text)) return;
    phrasePending.current = true;
    if (text !== phrase) change(text);
    const revision = generation.current;
    setSaving(true);
    setNotice(null);
    try {
      const reply = await rpcCall('tone.config.save', { phrase: text });
      if (!alive.current) return;
      if (reply?.ok !== true) throw new Error(reply?.error?.message || '未收到有效确认');
      const next = phraseOf(reply.value?.config);
      if (next === null) throw new Error('保存返回的配置格式不对');
      // A phrase reply owns only the saved phrase, even if it carries a stale scope.
      setCommitted(next);
      if (generation.current === revision) {
        setPhrase(next);
        setNotice({ tone: 'success', text: next.trim() ? '已保存，下一轮起生效。' : '已停用，下一轮起生效。' });
      }
    } catch (error) {
      if (alive.current) setNotice({ tone: 'error', text: `保存失败：${String(error?.message || error)}。草稿已保留。` });
    } finally {
      phrasePending.current = false;
      if (alive.current) setSaving(false);
    }
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

  let body;
  if (loading) body = h('div', { role: 'status', style: hint }, '正在读取语气管线配置…');
  else if (loadError) body = h('div', null,
    h('p', { role: 'alert', style: { ...hint, color: COLORS.error } }, `读取失败：${loadError}`),
    action('重试', () => setReloadKey((key) => key + 1), false));
  else body = h('div', null,
    h(ToneScope, { on: scope, pending: scopeSaving, error: scopeError, onToggle: toggleScope }),
    h(ToneForm, { phrase, committed, saving, notice, onChange: change, onSubmit: submit }));
  return h('section', { className: 'lpipe-tone-panel' }, h('style', null, PANEL_CSS),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Tone'),
      h('span', { style: {
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
        border: `1px solid color-mix(in srgb, ${COLORS.accent} 32%, transparent)`,
        background: `color-mix(in srgb, ${COLORS.accent} 12%, transparent)`, color: COLORS.accent,
        fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
      } }, '语气管线')),
    h('div', { style: card }, body));
}

const name = 'dsh-lpipe-tone-settings';
const inject = ['slots', 'connection'];
function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);
  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT, id: PANEL_ID, order: 80, label: () => '语气管线', inject: () => ({ rpcCall }),
  }, TonePanel));
}
module.exports = { name, inject, apply, __test__: { TonePanel, MAX_TEXT_LENGTH, phraseError, RPC_ENDPOINT, PANEL_SLOT, PANEL_ID } };

    return module.exports;
  }
});
