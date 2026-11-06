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
/** 抽星进行中的轮询间隔：进度条要跟着动。 */
const BUSY_POLL_MS = 1200;

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-m)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  soft: 'var(--dsw-alias-bg-layer-2)',
  accent: '#5ec9b4',
  cacheHit: 'rgba(94, 201, 180, 0.30)',
  output: '#8b93f8',
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

const head = { display: 'flex', alignItems: 'baseline', gap: 36, rowGap: 8, flexWrap: 'wrap' };
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
  minWidth: 0,
  maxWidth: '100%',
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

const field = { display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: '100%' };

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

;

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

const CHART_HEIGHT = 56;

/**
 * 最近七天的 token 柱状图：每根柱子从下往上依次是
 * 命中缓存的输入（浅青）、未命中的输入（青）、输出（蓝紫），共用一条纵轴。
 */
function nicePeak(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(n));
  const scaled = n / base;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * base;
}

/**
 * 最近七天的 token 柱状图：每根柱子从下往上依次是
 * 命中缓存的输入（浅青）、未命中的输入（青）、输出（蓝紫），共用一条纵轴。
 * 纵轴顶端按当周峰值自适应用到 1/2/5×10^n，刻度跟着变，不会永远顶着一个死数字。
 */
function usageBars(daily) {
  const rows = Array.isArray(daily) ? daily : [];
  if (!rows.length) return null;
  const totals = rows.map(
    (row) => (Number(row.input) || 0) + (Number(row.cacheRead) || 0) + (Number(row.cacheWrite) || 0) + (Number(row.output) || 0),
  );
  const peak = nicePeak(Math.max(0, ...totals));
  const empty = totals.every((total) => total === 0);
  const kinds = [
    { key: 'hit', color: COLORS.cacheHit, label: '命中输入' },
    { key: 'miss', color: COLORS.accent, label: '未命中输入' },
    { key: 'out', color: COLORS.output, label: '输出' },
  ];
  const bars = h(
    'div',
    { style: { display: 'flex', alignItems: 'flex-end', gap: 8, height: '100%', position: 'relative' } },
    rows.map((row) => {
      const hit = Number(row.cacheRead) || 0;
      // 宿主报的 inputTokens 只算未命中部分，不要再减一次命中，否则会被压成 0。
      const miss = Number(row.input) || 0;
      const out = Number(row.output) || 0;
      const total = hit + miss + out + (Number(row.cacheWrite) || 0);
      const parts = [
        { key: 'hit', value: hit, color: COLORS.cacheHit },
        { key: 'miss', value: miss, color: COLORS.accent },
        { key: 'out', value: out, color: COLORS.output },
      ].filter((part) => part.value > 0);
      return h(
        'div',
        {
          key: row.day,
          title: `${row.day} · 输入 ${formatTokens(miss + hit)}（未命中 ${formatTokens(miss)} + 命中 ${formatTokens(hit)}）· 输出 ${formatTokens(out)}`,
          style: { flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end' },
        },
        h(
          'div',
          {
            style: {
              width: '100%',
              height: `${Math.min(100, Math.round((total / peak) * 100))}%`,
              minHeight: total > 0 ? 2 : 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              borderRadius: 3,
              overflow: 'hidden',
              background: total > 0 ? 'transparent' : COLORS.soft,
            },
          },
          parts.map((part) => h('div', { key: part.key, style: { height: `${(part.value / total) * 100}%`, background: part.color } })),
        ),
      );
    }),
  );

  return h(
    'div',
    { style: { marginTop: 14 } },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 } },
      h('span', { style: { fontSize: 11, color: COLORS.faint } }, '最近 7 天抽星用的 token'),
      h(
        'span',
        { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        kinds.map((kind) =>
          h(
            'span',
            { key: kind.key, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: COLORS.muted } },
            h('span', { style: { width: 8, height: 8, borderRadius: 2, background: kind.color } }),
            kind.label,
          )),
      ),
    ),
    // 纵轴 + 绘图区 + 日期：用三层 flex 摆，不依赖 grid 的自动放置。
    h(
      'div',
      { style: { display: 'flex', alignItems: 'stretch', gap: 6 } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            width: 42,
            flex: 'none',
            height: CHART_HEIGHT,
            fontSize: 9,
            color: COLORS.faint,
            lineHeight: '9px',
            whiteSpace: 'nowrap',
          },
        },
        h('span', null, formatTokens(peak)),
        h('span', null, formatTokens(Math.round(peak / 2))),
        h('span', null, '0'),
      ),
      h(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        h(
          'div',
          { style: { position: 'relative', height: CHART_HEIGHT } },
          [0, 50, 100].map((offset) =>
            h('div', {
              key: `grid-${offset}`,
              style: {
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${offset}%`,
                height: 1,
                background: COLORS.border,
                opacity: offset === 100 ? 0.4 : 0.18,
              },
            })),
          bars,
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 8, marginTop: 5 } },
          rows.map((row) =>
            h('span', { key: row.day, style: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 9, color: COLORS.faint, whiteSpace: 'nowrap' } }, String(row.day || '').slice(5)),
          ),
        ),
      ),
    ),
    empty ? h('div', { style: { fontSize: 10, color: COLORS.faint, marginTop: 4 } }, '这七天还一次都没调用过模型') : null,
  );
}

function StarmapPanel({ rpcCall }) {
  const [state, setState] = React.useState({ loading: true, value: null, error: '' });
  const [form, setForm] = React.useState({ provider: '', model: '', reasoningEffort: '', maxTokens: 32000, concurrency: 3 });
  const [saved, setSaved] = React.useState('');
  // 已经提交给宿主的配置；草稿改了但没保存时，抽星按钮不该亮。
  const [committed, setCommitted] = React.useState({ provider: '', model: '', reasoningEffort: '', maxTokens: 32000, concurrency: 3 });
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

  // 抽星进行中时轮询要快：进度条得随时在动，而不是二十秒跳一次。
  const runningRef = React.useRef(false);
  React.useEffect(() => {
    let alive = true;
    let timer = null;
    const load = () => {
      Promise.resolve()
        .then(() => rpcCall('starmap.progress', {}))
        .then((reply) => {
          if (!alive) return;
          if (reply && reply.ok) {
            runningRef.current = Boolean(reply.value?.extract?.running);
            setState({ loading: false, value: reply.value, error: '' });
          }
          else setState({ loading: false, value: null, error: reply?.error?.message || '读不到星图' });
        })
        .catch((error) => {
          if (alive) setState({ loading: false, value: null, error: String(error?.message || error) });
        })
        .finally(() => {
          if (alive) timer = setTimeout(load, runningRef.current ? BUSY_POLL_MS : POLL_MS);
        });
    };
    load();
    Promise.resolve()
      .then(() => rpcCall('starmap.config', {}))
      .then((reply) => {
        if (!alive || !reply?.ok) return;
        const config = reply.value || {};
        const loaded = {
          provider: config.provider || '',
          model: config.model || '',
          reasoningEffort: config.reasoningEffort || '',
          maxTokens: Number(config.maxTokens) || 32000,
          concurrency: Number(config.concurrency) || 3,
        };
        setForm(loaded);
        setCommitted(loaded);
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
  const lanes = extract.lanes || { active: 0, total: 0 };
  // 供应商、模型、思考强度三个都填了才抽星；留空就是不抽。
  // 强度只在模型确实提供强度时才必须选；模型没有可选强度时留空是正常的。
  const configured = Boolean(
    committed.provider.trim() && committed.model.trim() && (committed.reasoningEffort || !(efforts?.efforts?.length)),
  );
  const dirty =
    form.provider !== committed.provider ||
    form.model !== committed.model ||
    form.reasoningEffort !== committed.reasoningEffort ||
    Number(form.maxTokens) !== Number(committed.maxTokens) ||
    Number(form.concurrency) !== Number(committed.concurrency);

  const start = () => {
    setSaved('开始抽星…');
    Promise.resolve()
      .then(() => rpcCall('starmap.rebuild', {}))
      .then((reply) => {
        load()
        setSaved(
          reply?.ok
            ? reply.value?.skipped === 'unconfigured'
              ? '三项没填全，先不动'
              : `已交给模型，点亮了 ${reply.value?.built ?? 0} 轮`
            : `没启动：${reply?.error?.message || '未知原因'}`,
        )
      })
      .catch((error) => setSaved(`没启动：${String(error?.message || error)}`));
  };

  const save = () => {
    setSaved('保存中…');
    Promise.resolve()
      .then(() => rpcCall('starmap.config.set', { ...form, effortFree: !(efforts?.efforts?.length) }))
      .then((reply) => {
        if (reply?.ok) {
          setCommitted({ ...form });
          setSaved('已保存，下一轮起生效');
        } else {
          setSaved(`保存失败：${reply?.error?.message || '未知原因'}`);
        }
      })
      .catch((error) => setSaved(`保存失败：${String(error?.message || error)}`));
  };

  // 改坏了就退回去：草稿恢复成已保存的那一份。
  const stop = () => {
    setSaved('正在暂停…');
    Promise.resolve()
      .then(() => rpcCall('starmap.pause', {}))
      .then((reply) => {
        setSaved(reply?.ok ? '已暂停：手上这一轮跑完就停' : `暂停失败：${reply?.error?.message || '未知原因'}`)
        load()
      })
      .catch((error) => setSaved(`暂停失败：${String(error?.message || error)}`));
  };

  const revert = () => {
    setForm({ ...committed });
    setSaved('');
    if (committed.provider && committed.model) loadEfforts(committed.provider, committed.model);
    else setEfforts(null);
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
          h('span', { style: mid }, String(Math.max(0, (value?.stars ?? 0) - (value?.fuzzy ?? 0)))),
          h('span', { style: { ...small, position: 'relative', top: -2 } }, '颗准确星'),
          h('span', { style: { ...small, position: 'relative', top: -2, marginLeft: 6 } }, '·'),
          h('span', { style: { ...mid, position: 'relative', top: -2, marginLeft: 6 } }, String(value?.fuzzy ?? 0)),
          h('span', { style: { ...small, position: 'relative', top: -2 } }, '颗模糊星'),
        ),
        grey > 0
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline' } },
              h('span', { style: { ...mid, color: COLORS.warning } }, String(grey)),
              h('span', { style: { ...small, position: 'relative', top: -2, color: COLORS.warning } }, '轮还是灰的'),
            )
          : null,
        // 抽星按钮贴在头部右侧：它和「亮了多少轮」是同一件事的两个面，放一起最省地方。
        h(
          'button',
          {
            style: {
              ...button(configured || busy ? COLORS.accent : null),
              marginLeft: 'auto',
              alignSelf: 'center',
              padding: '7px 16px',
              fontSize: 13,
            },
            onClick: busy ? stop : start,
            disabled: !busy && !configured,
          },
          busy ? '暂停' : '现在抽星',
        ),
      ),
      h('div', { style: track }, h('div', { style: fill(ratioOf(built, turns)) })),
      h(
        'div',
        { style: meta },
        h(
          'span',
          null,
          `${Math.round(ratioOf(built, turns) * 100)}% 的轮次已点亮${busy ? ` · ${extract.stopping ? '暂停中' : '正在抽星'}${lanes.total > 1 || extract.stopping ? `，${lanes.active} 路在跑` : ''}` : ''}`,
        ),
        h('span', null, value?.lastBuiltAt ? `上次点亮 ${clock(value.lastBuiltAt)}` : '还没点亮过'),
      ),
      // 抽星失败时把模型的原始报错露出来：只写「失败了」没法判断是钥匙、模型名还是额度。
      extract.error
        ? h('div', { style: { fontSize: 11, color: COLORS.danger, marginTop: 8, lineHeight: '17px' } }, `上次失败：${extract.error}`)
        : null,
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' } },
        h(
          'span',
          { style: { fontSize: 11, color: COLORS.faint } },
          usage.calls
            ? `调用 ${usage.calls} 次 · 7 天 ${formatTokens(usage.tokens7d)} token · 累计 ${formatTokens(usage.tokens)} token`
            : '还没调用过模型',
        ),
      ),
      usageBars(usage.daily),
      state.error ? h('div', { style: { fontSize: 11, color: COLORS.danger, marginTop: 6 } }, state.error) : null,
    ),
    h(
      'div',
      { style: card },
      h('div', { style: { ...label, marginBottom: 10 } }, '抽星模型'),
      h(
        'div',
        {
          // 第一行只放「用哪个模型」：提供者 + 模型各占一半。
          style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignItems: 'end' },
        },
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
                setSaved('');
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
                setSaved('');
              },
            },
            h('option', { value: '' }, form.provider ? '（不选）' : '先选提供者'),
            (catalog.find((entry) => entry.id === form.provider)?.models || []).map((model) =>
              h('option', { key: model.id, value: model.id }, model.name && model.name !== model.id ? `${model.name} · ${model.id}` : model.id)),
          ),
        ),
      ),
      h(
        'div',
        {
          // 第二行放「怎么跑」：强度、路数、输出上限三等分。
          style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'end', marginTop: 10 },
        },
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
              onChange: (event) => {
                setForm({ ...form, reasoningEffort: event.target.value });
                setSaved('');
              },
            },
            h('option', { value: '' }, !form.model ? '先选模型' : efforts?.efforts?.length ? '（不选）' : '（这个模型没有可选强度）'),
            (efforts?.efforts ?? []).map((item) =>
              h('option', { key: item.id, value: item.id }, item.name || item.id)),
          ),
        ),
        h(
          'div',
          { style: field },
          h('div', { style: label }, '并发路数'),
          h(
            'select',
            {
              style: input,
              value: form.concurrency,
              onChange: (event) => {
                setForm({ ...form, concurrency: Number(event.target.value) });
                setSaved('');
              },
            },
            [1, 2, 3, 4, 5, 6, 7, 8].map((count) => h('option', { key: count, value: count }, `${count} 路`)),
          ),
        ),
        h(
          'div',
          { style: field },
          h('div', { style: label }, '输出上限'),
          h('input', {
            style: input,
            type: 'number',
            min: 200,
            max: 32000,
            step: 100,
            value: form.maxTokens,
            onChange: (event) => {
              setForm({ ...form, maxTokens: event.target.value });
              setSaved('');
            },
          }),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 } },
        h(
          'button',
          {
            style: { ...button(dirty && !busy ? COLORS.accent : null), opacity: dirty && !busy ? 1 : 0.45 },
            onClick: save,
            disabled: busy || !dirty,
          },
          '保存',
        ),
        h(
          'button',
          {
            style: {
              ...button(),
              background: COLORS.soft,
              border: `1px solid ${COLORS.borderStrong}`,
              opacity: dirty ? 1 : 0.5,
            },
            onClick: revert,
            disabled: busy || !dirty,
          },
          '取消',
        ),
      ),
      h(
        'div',
        {
          style: {
            marginTop: 10,
            paddingTop: 9,
            borderTop: `1px solid ${COLORS.border}`,
            fontSize: 11,
            lineHeight: 1.6,
            color: configured ? COLORS.muted : COLORS.warning,
          },
        },
        dirty
          ? '改了还没保存，保存之后「现在抽星」才会亮；点「取消」可以退回去。'
          : saved || (configured
            ? '抽星只问模型「哪两个概念一起出现过」，连边与权重由星图自己算。'
            : '提供者和模型必须选；这个模型若提供思考强度，也一并选上。不选就是不抽星，不会替你挑模型。'),
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
  },
};


