window.__ModuleLoader__.load({
  id: "dsh-lpipe-starmap",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
'use strict';

/**
 * The settings block of the star map. The page itself belongs to
 * dsh-life-pipline (「Lpipe 设置」); this file only renders one block inside
 * the child slot it declares there.
 *
 * 抽星交给模型：这里选提供者、模型名、思考强度。留空就用当前会话的模型。
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-starmap';
const PANEL_SLOT = 'lpipe.settings.panel';
const POLL_MS = 20000;

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-m)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  accent: '#5ec9b4',
  warning: 'var(--dsw-alias-state-warning-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
};

const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: '14px 16px 12px',
  marginBottom: 12,
};

const head = { display: 'flex', alignItems: 'baseline', gap: 36, flexWrap: 'wrap' };
const big = { fontSize: 21, fontWeight: 600, color: COLORS.text, lineHeight: 1.2 };
const unit = { fontSize: 11, fontWeight: 600, color: COLORS.text, marginLeft: 3 };
const mid = { fontSize: 15, fontWeight: 600, color: COLORS.text };
const small = { fontSize: 11, fontWeight: 600, color: COLORS.text, marginLeft: 3 };

const track = {
  position: 'relative',
  height: 6,
  borderRadius: 3,
  background: COLORS.soft,
  overflow: 'hidden',
  margin: '12px 0 8px',
};

const fill = (ratio) => ({
  position: 'absolute',
  inset: '0 auto 0 0',
  width: `${Math.round(ratio * 100)}%`,
  borderRadius: 3,
  background: `linear-gradient(90deg, ${COLORS.accent} 0%, ${COLORS.accent} 100%)`,
});

const meta = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 11, color: COLORS.muted };

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

const label = { fontSize: 11, fontWeight: 600, color: COLORS.muted, marginBottom: 6 };

const field = { display: 'flex', flexDirection: 'column', minWidth: 0 };

const button = (accent) => ({
  border: `1px solid ${accent || COLORS.borderStrong}`,
  background: accent || 'transparent',
  color: accent ? '#ffffff' : COLORS.text,
  borderRadius: 'var(--dsw-radius-sm)',
  padding: '7px 14px',
  fontSize: 13,
  lineHeight: '18px',
  cursor: 'pointer',
  flex: 'none',
  whiteSpace: 'nowrap',
});

/** 模型没声明思考强度时的兜底表；即便如此也必须显式选，不留默认。 */
const EFFORTS = [
  { value: 'none', label: '不思考' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

function clock(ms) {
  if (!Number.isFinite(ms)) return '—';
  const date = new Date(ms);
  const day = `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 用量显示：小数目原样，上了万就折成 K / M。 */
function formatTokens(value) {
  const n = Number(value) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function ratioOf(built, turns) {
  if (!Number.isFinite(built) || !Number.isFinite(turns) || turns <= 0) return 0;
  return Math.min(1, Math.max(0, built / turns));
}

function StarmapPanel({ rpcCall }) {
  const [state, setState] = React.useState({ loading: true, value: null, error: '' });
  const [form, setForm] = React.useState({ provider: '', model: '', reasoningEffort: '' });
  const [saved, setSaved] = React.useState('');
  // 宿主里真实存在的提供者与模型：选择框只列这些，不让手打。
  const [catalog, setCatalog] = React.useState([]);
  const [efforts, setEfforts] = React.useState(null);

  const loadEfforts = (provider, model) => {
    if (!provider || !model) {
      setEfforts(null);
      return;
    }
    Promise.resolve()
      .then(() => rpcCall('starmap.efforts', { provider, model }))
      .then((reply) => {
        if (reply?.ok) setEfforts(reply.value || { efforts: [], defaultEffort: null });
      })
      .catch(() => setEfforts(null));
  };

  React.useEffect(() => {
    let alive = true;
    let timer = null;
    const load = () => {
      Promise.resolve()
        .then(() => rpcCall('starmap.progress', {}))
        .then((reply) => {
          if (!alive) return;
          if (reply && reply.ok) setState({ loading: false, value: reply.value, error: '' });
          else setState({ loading: false, value: null, error: reply?.error?.message || '读不到星图' });
        })
        .catch((error) => {
          if (alive) setState({ loading: false, value: null, error: String(error?.message || error) });
        })
        .finally(() => {
          if (alive) timer = setTimeout(load, POLL_MS);
        });
    };
    load();
    Promise.resolve()
      .then(() => rpcCall('starmap.config', {}))
      .then((reply) => {
        if (!alive || !reply?.ok) return;
        const config = reply.value || {};
        setForm({
          provider: config.provider || '',
          model: config.model || '',
          reasoningEffort: config.reasoningEffort || '',
        });
        loadEfforts(config.provider || '', config.model || '');
      })
      .catch(() => {});
    Promise.resolve()
      .then(() => rpcCall('starmap.catalog', {}))
      .then((reply) => {
        if (alive && reply?.ok) setCatalog(reply.value?.providers || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [rpcCall]);

  const value = state.value;
  const built = value?.built ?? 0;
  const turns = value?.turns ?? 0;
  const grey = value?.grey ?? 0;
  const extract = value?.extract || {};
  const usage = value?.usage || {};
  const busy = Boolean(extract.running);
  // 供应商、模型、思考强度三个都填了才抽星；留空就是不抽。
  const configured = Boolean(form.provider.trim() && form.model.trim() && form.reasoningEffort);

  const start = () => {
    setSaved('开始抽星…');
    Promise.resolve()
      .then(() => rpcCall('starmap.rebuild', {}))
      .then((reply) =>
        setSaved(
          reply?.ok
            ? reply.value?.skipped === 'unconfigured'
              ? '三项没填全，先不动'
              : `已交给模型，点亮了 ${reply.value?.built ?? 0} 轮`
            : `没启动：${reply?.error?.message || '未知原因'}`,
        ),
      )
      .catch((error) => setSaved(`没启动：${String(error?.message || error)}`));
  };

  const save = () => {
    setSaved('保存中…');
    Promise.resolve()
      .then(() => rpcCall('starmap.config.set', form))
      .then((reply) => setSaved(reply?.ok ? '已保存，下一轮起生效' : `保存失败：${reply?.error?.message || '未知原因'}`))
      .catch((error) => setSaved(`保存失败：${String(error?.message || error)}`));
  };

  return h(
    'section',
    null,
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Starmap'),
      h(
        'span',
        {
          style: {
            fontSize: 11, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(94, 201, 180, 0.14)', color: COLORS.accent,
            border: '1px solid rgba(94, 201, 180, 0.28)',
          },
        },
        '星图管线',
      ),
    ),
    h(
      'div',
      { style: card },
      h(
        'div',
        { style: head },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline' } },
          h('span', { style: big }, String(built)),
          h('span', { style: unit, position: 'relative', top: -3 }, `轮已亮 / ${turns}`),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline' } },
          h('span', { style: mid }, String(value?.stars ?? 0)),
          h('span', { style: { ...small, position: 'relative', top: -2 } }, '颗星'),
        ),
        grey > 0
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline' } },
              h('span', { style: { ...mid, color: COLORS.warning } }, String(grey)),
              h('span', { style: { ...small, position: 'relative', top: -2, color: COLORS.warning } }, '轮还是灰的'),
            )
          : null,
      ),
      h('div', { style: track }, h('div', { style: fill(ratioOf(built, turns)) })),
      h(
        'div',
        { style: meta },
        h(
          'span',
          null,
          busy
            ? `模型正在抽星 ${extract.done ?? 0}/${extract.total ?? 0}`
            : `${Math.round(ratioOf(built, turns) * 100)}% 的轮次已点亮`,
        ),
        h('span', null, value?.lastBuiltAt ? `上次点亮 ${clock(value.lastBuiltAt)}` : '还没点亮过'),
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' } },
        h(
          'span',
          { style: { fontSize: 11, color: COLORS.faint } },
          usage.calls
            ? `调用 ${usage.calls} 次 · 7 天 ${formatTokens(usage.tokens7d)} token · 累计 ${formatTokens(usage.tokens)} token`
            : '还没调用过模型',
        ),
        h(
          'button',
          { style: button(configured && !busy ? COLORS.accent : null), onClick: start, disabled: busy || !configured },
          busy ? '正在抽星' : '现在抽星',
        ),
      ),
      state.error ? h('div', { style: { fontSize: 11, color: COLORS.danger, marginTop: 6 } }, state.error) : null,
    ),
    h(
      'div',
      { style: card },
      h('div', { style: { ...label, marginBottom: 10 } }, '抽星模型'),
      h(
        'div',
        { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 10, alignItems: 'end' } },
        h(
          'div',
          { style: field },
          h('div', { style: label }, '提供者'),
          h(
            'select',
            {
              style: input,
              value: form.provider,
              onChange: (event) => {
                setForm({ provider: event.target.value, model: '', reasoningEffort: '' });
                setEfforts(null);
              },
            },
            h('option', { value: '' }, '（不选）'),
            catalog.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name && entry.name !== entry.id ? `${entry.name} · ${entry.id}` : entry.id)),
          ),
        ),
        h(
          'div',
          { style: field },
          h('div', { style: label }, '模型'),
          h(
            'select',
            {
              style: { ...input, opacity: form.provider ? 1 : 0.55 },
              value: form.model,
              disabled: !form.provider,
              onChange: (event) => {
                const model = event.target.value;
                setForm({ ...form, model, reasoningEffort: '' });
                loadEfforts(form.provider, model);
              },
            },
            h('option', { value: '' }, form.provider ? '（不选）' : '先选提供者'),
            (catalog.find((entry) => entry.id === form.provider)?.models || []).map((model) =>
              h('option', { key: model.id, value: model.id }, model.name && model.name !== model.id ? `${model.name} · ${model.id}` : model.id)),
          ),
        ),
        h(
          'div',
          { style: field },
          h('div', { style: label }, '思考强度'),
          h(
            'select',
            {
              style: { ...input, opacity: form.model ? 1 : 0.55 },
              value: form.reasoningEffort,
              disabled: !form.model,
              onChange: (event) => setForm({ ...form, reasoningEffort: event.target.value }),
            },
            h('option', { value: '' }, form.model ? '（不选）' : '先选模型'),
            (efforts?.efforts?.length ? efforts.efforts : EFFORTS).map((item) =>
              h('option', { key: item.id ?? item.value, value: item.id ?? item.value }, item.name ?? item.label)),
          ),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 } },
        h('button', { style: button(COLORS.accent), onClick: save, disabled: busy }, '保存'),
        h(
          'span',
          { style: { fontSize: 11, color: configured ? COLORS.muted : COLORS.warning } },
          saved || (configured
            ? '抽星只问模型「哪两个概念一起出现过」，连边与权重由星图自己算。'
            : '三元组必须都选。不选就是不抽星，不会替你挑模型，也不会产生费用。'),
        ),
      ),
    ),
  );
}

const name = 'dsh-lpipe-starmap-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT,
    id: 'starmap',
    order: 40,
    label: () => '星图管线',
    inject: () => ({ rpcCall }),
  }, StarmapPanel));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: {
    StarmapPanel,
    PANEL_SLOT,
    clock,
    ratioOf,
    formatTokens,
    POLL_MS,
    EFFORTS,
  },
};

    return module.exports;
  }
});
