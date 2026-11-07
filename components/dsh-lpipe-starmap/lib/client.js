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
const POLL_MS = 4000;

/** 失败发生的那一秒比「失败了」三个字有用得多：带上时刻，才知道是不是刚刚那阵网络抽风。 */
const clockText = (at) => {
  const value = Number(at);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `（${pad(date.getHours())}:${pad(date.getMinutes())}）`;
};
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

// 头部两层：外层只管「数字区 + 按钮」不换行，内层数字区自己折行。
// 否则按钮会被宽出来的「N 轮还是灰的」挤到下一行，底下空一截。
const head = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' };
const headNumbers = { display: 'flex', alignItems: 'baseline', gap: 22, rowGap: 6, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 };
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
  // 点下按钮到宿主回话之间有个空档：本地先记一笔，按钮立刻变样，别让人以为没点到。
  const [pending, setPending] = React.useState('');
  // 我按过暂停、还没再点开始：状态行据此显示「已暂停」，哪怕宿主那边还在收尾。
  const [held, setHeld] = React.useState(false);
  const [openProblems, setOpenProblems] = React.useState(false);
  // 点「看看」才去读那一轮的原文，读到的按 `session#turn` 缓存。
  const [peeks, setPeeks] = React.useState({});
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
  // 轮询函数活在 effect 里，按钮回调要用它就得存一份引用：直接调 load() 会掉出作用域。
  const reloadRef = React.useRef(null);
  React.useEffect(() => {
    let alive = true;
    let timer = null;
    const load = () => {
      Promise.resolve()
        .then(() => rpcCall('starmap.progress', {}))
        .then((reply) => {
          if (!alive) return;
          if (reply && reply.ok) {
            // 宿主真的跑起来了：本地那个「刚点下」的标记可以撤了。
            if (reply.value?.extract?.running) setPending((current) => (current === 'starting' ? '' : current));
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
    reloadRef.current = load;
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
      reloadRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [rpcCall]);

  const value = state.value;
  const built = value?.built ?? 0;
  const turns = value?.turns ?? 0;
  const skipped = Number(value?.skipped) || 0;
  const problems = Array.isArray(value?.problems) ? value.problems : [];
  const grey = Math.max(0, turns - built - skipped);
  const extract = value?.extract || {};
  const usage = value?.usage || {};
  const { alive, busy, stopping, buttonLabel } = runState(pending, extract);
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
    (Number(form.maxTokens) || 0) !== (Number(committed.maxTokens) || 0) ||
    (Number(form.concurrency) || 0) !== (Number(committed.concurrency) || 0);

  // 底部只留「状态」这一行：没话说时整块不渲染，别留一条空的分隔线。
  const statusText = dirty
    ? '改了还没保存，保存之后「现在抽星」才会亮；点「取消」可以退回去。'
    : saved ||
      (configured ? '' : '提供者和模型必须选；这个模型若提供思考强度，也一并选上。不选就是不抽星，不会替你挑模型。');

  const start = () => {
    setSaved('');
    setHeld(false);
    setPending('starting');
    setTimeout(() => setPending((current) => (current === 'starting' ? '' : current)), 3000);
    Promise.resolve()
      .then(() => rpcCall('starmap.rebuild', {}))
      .then((reply) => {
        reloadRef.current?.()
        setSaved(
          reply?.ok
            ? reply.value?.already
              ? '上一轮还在收尾，等它停了再点'
              : reply.value?.skipped === 'unconfigured'
                ? '三项没填全，先不动'
              : `已交给模型，点亮了 ${reply.value?.built ?? 0} 轮`
            : `没启动：${reply?.error?.message || '未知原因'}`,
        )
      })
      .catch((error) => setSaved(`没启动：${String(error?.message || error)}`))
      .finally(() => {
        reloadRef.current?.();
        // 宿主回话很快，但进度要下一次轮询才看得到；给一个兜底，别让按钮卡在「暂时停止」。
        setTimeout(() => setPending((current) => (current === 'starting' ? '' : current)), 2500);
      });
  };

  const [saving, setSaving] = React.useState(false);

  const save = () => {
    if (saving) return;
    setSaving(true);
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
      .catch((error) => setSaved(`保存失败：${String(error?.message || error)}`))
      .finally(() => setSaving(false));
  };

  // 改坏了就退回去：草稿恢复成已保存的那一份。
  const stop = () => {
    setSaved('');
    setHeld(true);
    setPending('stopping');
    // 兜底要立刻挂上：如果等 RPC 回来再排，它不回话就永远排不上，按钮会一直停在「正在暂停」。
    setTimeout(() => setPending((current) => (current === 'stopping' ? '' : current)), 3000);
    Promise.resolve()
      .then(() => rpcCall('starmap.pause', {}))
      .then((reply) => {
        if (!reply?.ok) {
          setSaved(`暂停失败：${reply?.error?.message || '未知原因'}`);
          return;
        }
        // paused 为 false 只说明「这会儿其实没在跑」，不是失败。
        const paused = reply.value?.paused !== false;
        setSaved(paused ? '已暂停：手上这一轮跑完就停' : '已经停了：现在没有在抽星');
      })
      .catch((error) => setSaved(`暂停失败：${String(error?.message || error)}`))
      .finally(() => {
        reloadRef.current?.();
        // 宿主回话慢也不该让按钮一直停在「正在暂停」。
        setTimeout(() => setPending((current) => (current === 'stopping' ? '' : current)), 8000);
      });
  };

  // 跳过的那一轮放回队列：不立刻抽星，等下次点「现在抽星」再试。
  const peekTurn = (entry) => {
    const key = `${entry.session}#${entry.turn}`
    // 已经读出来了就收起：同一个按钮管开与关，不要再发一次请求。
    if (peeks[key] && !peeks[key].loading) {
      setPeeks((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      return
    }
    setPeeks((current) => ({ ...current, [key]: { loading: true } }))
    Promise.resolve()
      .then(() => rpcCall('starmap.peek', { session: entry.session, turn: entry.turn }))
      .then((reply) => {
        const value = reply?.ok ? reply.value : null
        setPeeks((current) => ({ ...current, [key]: value && value.ok ? value : { error: value?.error || reply?.error?.message || '读不出来' } }))
      })
      .catch((error) => setPeeks((current) => ({ ...current, [key]: { error: String(error?.message || error) } })))
  }

  const retryTurn = (entry) => {
    Promise.resolve()
      .then(() => rpcCall('starmap.retry', { session: entry.session, turn: entry.turn }))
      .then((reply) => {
        setSaved(reply?.ok ? `第 ${entry.turn} 轮放回去了，下次抽星会再试` : `放回失败：${reply?.error?.message || '未知原因'}`)
        reloadRef.current?.()
      })
      .catch((error) => setSaved(`放回失败：${String(error?.message || error)}`));
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
          { style: headNumbers },
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
          h(
            'span',
            {
              style: { ...small, position: 'relative', top: -2 },
              // 一行只放得下总数；准确星与模糊星各多少，悬停再看。
              title: `${Math.max(0, (value?.stars ?? 0) - (value?.fuzzy ?? 0))} 颗准确星，${value?.fuzzy ?? 0} 颗模糊星`,
            },
            '颗星',
          ),
        ),
        grey > 0
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline' } },
              h('span', { style: { ...mid, color: COLORS.warning } }, String(grey)),
              h('span', { style: { ...small, position: 'relative', top: -2, color: COLORS.warning } }, '轮还是灰的'),
            )
          : null,
        skipped > 0
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline' } },
              h('span', { style: { ...mid, color: COLORS.muted } }, String(skipped)),
              h('span', { style: { ...small, position: 'relative', top: -2, color: COLORS.muted } }, '轮跳过'),
            )
          : null,
        ),
        // 抽星按钮贴在头部右侧：它和「亮了多少轮」是同一件事的两个面，放一起最省地方。
        h(
          'button',
          {
            style: {
              ...button(configured || busy ? COLORS.accent : null),
              flex: '0 0 auto',
              marginLeft: 'auto',
              alignSelf: 'center',
              padding: '7px 16px',
              fontSize: 13,
              opacity: pending === 'stopping' ? 0.6 : 1,
            },
            onClick: stopping ? undefined : busy ? stop : start,
            disabled: stopping || (!busy && !configured),
          },
          buttonLabel,
        ),
      ),
      h('div', { style: track }, h('div', { style: fill(ratioOf(built, turns)) })),
      h(
        'div',
        { style: meta },
        h(
          'span',
          null,
          `${Math.round(ratioOf(built, turns) * 100)}% 的轮次已点亮${
            held
              ? alive
                ? ' · 已暂停，等手上这一轮收尾'
                : ' · 已暂停'
              : busy
                ? ` · 正在抽星${lanes.active > 0 ? `，${lanes.active} 路在跑` : ''}`
                : ''
          }`,
        ),
        h('span', null, value?.lastBuiltAt ? `上次点亮 ${clock(value.lastBuiltAt)}` : '还没点亮过'),
      ),
      // 抽星失败时把模型的原始报错露出来：只写「失败了」没法判断是钥匙、模型名还是额度。
      extract.error && !(held && !alive)
        ? h(
            'div',
            { style: { fontSize: 11, color: COLORS.danger, marginTop: 8, lineHeight: '17px' } },
            `上次失败${clockText(extract.errorAt)}：${extract.error}`,
          )
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
      // 坏掉的轮次：始终在卡片里，折叠着不占地方，但要找得到。
      h(
        'div',
        { style: { marginTop: 12, fontSize: 11, color: COLORS.muted } },
        h(
          'button',
          {
            type: 'button',
            onClick: () => setOpenProblems((current) => !current),
            style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', color: COLORS.muted, font: 'inherit', cursor: 'pointer' },
          },
          h('span', { style: { width: 10, display: 'inline-block' } }, openProblems ? '▾' : '▸'),
          problems.length ? `坏掉的轮次（${problems.length}）— 连试三次没成，已跳过` : '坏掉的轮次（0）— 目前没有',
        ),
        openProblems
          ? problems.length
            ? h(
              'div',
              { style: { marginTop: 8, display: 'grid', gap: 6 } },
              problems.map((entry) => {
                const key = `${entry.session}#${entry.turn}`
                const seen = peeks[key]
                return h(
                  'div',
                  { key, style: { display: 'grid', gap: 6 } },
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 11, lineHeight: '17px' } },
                    h('span', { style: { color: COLORS.text } }, `第 ${entry.turn} 轮`),
                    h('span', { style: { color: COLORS.faint, fontFamily: 'ui-monospace, monospace' } }, String(entry.session ?? '').slice(-8)),
                    h('span', { style: { color: COLORS.danger, flex: '1 1 auto', minWidth: 0 } }, String(entry.error ?? '').slice(0, 80)),
                    h(
                      'button',
                      { style: { ...button(null), padding: '2px 8px', fontSize: 11 }, onClick: () => peekTurn(entry) },
                      seen?.loading ? '读取中…' : seen && !seen.error ? '收起' : '看看',
                    ),
                    h(
                      'button',
                      { style: { ...button(null), padding: '2px 8px', fontSize: 11 }, onClick: () => retryTurn(entry) },
                      '放回',
                    ),
                  ),
                  seen && !seen.loading
                    ? seen.error
                      ? h('div', { style: { fontSize: 11, color: COLORS.danger } }, `读不出来：${seen.error}`)
                      : h(
                        'div',
                        { style: { display: 'grid', gap: 6 } },
                        h(
                          'div',
                          { style: { fontSize: 10.5, color: COLORS.faint, fontFamily: 'ui-monospace, monospace', lineHeight: '15px', wordBreak: 'break-all' } },
                          `记忆 seq ${seen.from}–${seen.to} · ${seen.rows} 行 · 原文 ${seen.chars} 字 · ${seen.root}`,
                        ),
                        h(
                          'div',
                          { style: { fontFamily: 'ui-monospace, monospace', fontSize: 10.5, lineHeight: '15px', color: COLORS.muted, background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 190, overflow: 'auto' } },
                          seen.head,
                          seen.tail ? `\n……（中间省略 ${Math.max(0, seen.chars - seen.head.length - seen.tail.length)} 字）……\n${seen.tail}` : '',
                        ),
                      )
                    : null,
                )
              }),
              h(
                'div',
                { style: { fontSize: 10.5, lineHeight: '16px', color: COLORS.faint, marginTop: 2 } },
                '这些轮不一定是你写错了。角色扮演、露骨或触发审查的内容，模型可能直接拒答、回一句白话、或者一个字都不给——看起来就像「八字不合」。换一个抽星模型（或者换思考强度）通常就好——换完把这几轮点一下「放回」，再点「现在抽星」。先用「看看」确认原文本身是不是正常的。',
              ),
            )
            : h('div', { style: { fontSize: 11, color: COLORS.faint } }, '每一轮都抽到了，没有坏轮。')
          : null,
      ),
    ),

    h(
      'div',
      { style: card },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 } },
        h('span', { style: label }, '抽星模型'),
        h(
          'span',
          { style: { fontSize: 11, lineHeight: 1.6, color: COLORS.muted } },
          '抽星只问模型「哪两个概念一起出现过」，连边与权重由星图自己算。',
        ),
      ),
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
                setForm({ ...form, provider: event.target.value, model: '', reasoningEffort: '' });
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
        { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' } },
        statusText
          ? h(
              'span',
              {
                style: {
                  flex: '1 1 220px',
                  minWidth: 0,
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: configured ? COLORS.muted : COLORS.warning,
                },
              },
              statusText,
            )
          : h('span', { style: { flex: '1 1 0' } }),
        h(
          'button',
          {
            style: { ...button(dirty && !busy && !saving ? COLORS.accent : null), opacity: dirty && !busy && !saving ? 1 : 0.45 },
            onClick: save,
            disabled: busy || !dirty || saving,
          },
          saving ? '保存中…' : '保存',
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

    ),
  );
}

/** 宿主 90 秒没有任何心跳（一轮都没落），就认为它已经不在跑了——
 *  宁可让人重新点一次，也不能把按钮永久锁死。 */
const STALE_MS = 90000;

/** 按钮该显示什么、能不能点。纯函数：界面与测试共用同一套判断。 */
function runState(pending, extract, now = Date.now()) {
  const fresh = extract || {};
  const stale = Boolean(fresh.running && fresh.updatedAt && now - fresh.updatedAt > STALE_MS);
  const alive = Boolean(fresh.running) && !stale;
  // 「正在暂停」只表示「我刚点了暂停、宿主还没回话」，只认本地这一笔。
  // 宿主内部的 stopping 标志不可靠（旧版本会一直挂着），不能拿它决定按钮长什么样。
  const live = stale ? '' : pending;
  const stopping = live === 'stopping';
  const busy = live !== '' || alive;
  const buttonLabel = stopping ? '正在暂停' : busy ? '暂时停止' : '现在抽星';
  return { stale, alive, busy, stopping, buttonLabel };
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
    runState,
    PANEL_ID: 'starmap',
  },
};



    return module.exports;
  }
});
