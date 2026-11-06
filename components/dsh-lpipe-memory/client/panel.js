'use strict';

/**
 * 记忆管线的设置块：只显示「原文有多大、最近几轮怎么长」。
 * 页面本身归 dsh-life-pipline（「Lpipe 设置」），这里只往子槽里放一块。
 */
const React = require('react');

const h = React.createElement;

const RPC_ENDPOINT = 'dsh-lpipe-memory';
const PANEL_SLOT = 'lpipe.settings.panel';
const POLL_MS = 20000;
const TURNS = 30;

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l)',
  borderStrong: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-layer-1)',
  accent: '#5ec9b4',
  disk: '#8b93f8',
};

const card = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--dsw-radius-lg)',
  background: COLORS.bg,
  padding: 16,
};

/** 15.0 MB / 812 KB：只保留两位有效位，别让小波动看起来像大变化。 */
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

function formatClock(at) {
  if (!Number.isFinite(at)) return '—';
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 把每条轮的值折成 0–100 的折线；原文与落盘共用一条纵轴，纵横都自适应。 */
function plotOf(turns) {
  const up = turns.map((turn) => Number(turn.total) || 0);
  if (up.length === 0) return null;
  const rawDisk = turns.map((turn) => Number(turn.diskTotal));
  const disk = rawDisk.every((value) => Number.isFinite(value) && value > 0) ? rawDisk : null;
  const all = disk ? [...up, ...disk] : up;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = Math.max((max - min) * 0.18, Math.max(max, 1) * 0.004);
  const low = min - pad;
  const high = max + pad;
  const span = high - low || 1;
  const line = (values) => values.map((value, index) => {
    const x = values.length === 1 ? 100 : (index / (values.length - 1)) * 100;
    const y = 100 - ((value - low) / span) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const upLine = line(up);
  const diskLine = disk ? line(disk) : null;
  return {
    line: upLine,
    disk: diskLine,
    // 面积只铺在原文这条线下面，从上到下淡出；落盘线落在它里面，两者的距离就是省下的。
    area: `0,100 ${upLine} 100,100`,
    high,
    low,
    mid: (high + low) / 2,
  };
}

function MemoryPanel({ rpcCall }) {
  const [stats, setStats] = React.useState(null);
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

  const reload = React.useCallback(async () => {
    try {
      setStats(await call('memory.stats', { turns: TURNS }));
      setError('');
    } catch (failure) {
      setError(String(failure?.message ?? failure));
    }
  }, [call]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const turns = stats?.turns ?? [];
  const plot = plotOf(turns);
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return h('section', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Memory'),
      h('span', {
        style: {
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'rgba(94, 201, 180, 0.14)', color: COLORS.accent,
          border: '1px solid rgba(94, 201, 180, 0.28)',
        },
      }, '记忆管线'),
      h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 10, color: COLORS.faint } },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
          h('i', { style: { width: 7, height: 2, borderRadius: 1, background: COLORS.accent } }), '原文'),
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
          h('i', { style: { width: 7, height: 2, borderRadius: 1, background: COLORS.disk } }), '落盘'))),

    error
      ? h('div', { style: { marginBottom: 12, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' } },
        `读取记忆大小失败：${error}`)
      : null,

    h('div', { style: card },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 22, fontWeight: 600, color: COLORS.text } },
          formatBytes(stats?.total ?? 0)),
        h('span', { style: { fontSize: 12, color: COLORS.muted } }, '原文'),
        h('span', { style: { marginLeft: 'auto', fontSize: 11, color: COLORS.faint } },
          `${Math.min(turns.length, TURNS)} 轮 · ${stats?.rows ?? 0} 行`)),

      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 5, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 12, color: COLORS.disk } }, `落盘 ${formatBytes(stats?.disk ?? 0)}`),
        lastTurn
          ? h('span', { style: { fontSize: 11, color: COLORS.faint } },
            `最近一轮 +${formatBytes(lastTurn.added)} 原文 · +${formatBytes(lastTurn.diskAdded)} 落盘`)
          : null),

      plot
        ? h('div', { style: { display: 'flex', gap: 8, marginTop: 12 } },
          h('div', {
            style: {
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              width: 62, padding: '2px 0 1px', fontSize: 10, color: COLORS.faint, textAlign: 'right',
            },
          },
            h('span', null, formatBytes(plot.high)),
            h('span', null, formatBytes(plot.mid)),
            h('span', null, formatBytes(plot.low))),
          h('svg', {
            viewBox: '0 0 100 100',
            preserveAspectRatio: 'none',
            style: { flex: 1, height: 86, display: 'block' },
            'aria-label': '记忆大小曲线',
          },
            h('line', {
              x1: 0, y1: 33, x2: 100, y2: 33,
              stroke: 'currentColor', strokeOpacity: 0.12, strokeDasharray: '3 4',
              vectorEffect: 'non-scaling-stroke',
            }),
            h('line', {
              x1: 0, y1: 66, x2: 100, y2: 66,
              stroke: 'currentColor', strokeOpacity: 0.12, strokeDasharray: '3 4',
              vectorEffect: 'non-scaling-stroke',
            }),
            h('defs', null,
              h('linearGradient', { id: 'memUp', x1: 0, y1: 0, x2: 0, y2: 1 },
                h('stop', { offset: '0%', stopColor: COLORS.accent, stopOpacity: 0.22 }),
                h('stop', { offset: '100%', stopColor: COLORS.accent, stopOpacity: 0 }))),
            h('polygon', { points: plot.area, fill: 'url(#memUp)' }),
            h('polyline', {
              points: plot.line, fill: 'none', stroke: COLORS.accent, strokeWidth: 1.6,
              strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke',
            }),
            plot.disk
              ? h('polyline', {
                points: plot.disk, fill: 'none', stroke: COLORS.disk, strokeWidth: 1.4,
                strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke',
              })
              : null))
        : h('div', { style: { marginTop: 12, fontSize: 12, color: COLORS.muted } }, '还没有落盘的轮次。'),

      turns.length > 1
        ? h('div', {
          style: {
            display: 'flex', justifyContent: 'space-between', margin: '4px 0 0 70px',
            fontSize: 10, color: COLORS.faint,
          },
        },
          h('span', null, formatClock(turns[0].at)),
          h('span', null, formatClock(turns[turns.length - 1].at)))
        : null,

      h('div', { style: { marginTop: 8, fontSize: 11, color: COLORS.faint } },
        '两条线共用一条纵轴：青色是原文（未压缩），蓝紫色是真实落盘，中间那段距离就是 zstd 省下的。')));
}

const name = 'dsh-lpipe-memory-settings';
const inject = ['slots', 'connection'];

function apply(ctx) {
  const rpcCall = (method, payload, signal) =>
    ctx.connection.rpc.call('/api', RPC_ENDPOINT, { method, payload: payload ?? {} }, signal);

  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT,
    id: 'memory',
    order: 30,
    label: () => '记忆管线',
    inject: () => ({ rpcCall }),
  }, MemoryPanel));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: { MemoryPanel, PANEL_SLOT, formatBytes, formatClock, plotOf, TURNS },
};
