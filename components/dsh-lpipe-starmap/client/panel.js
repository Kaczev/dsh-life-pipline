'use strict';

/**
 * The settings block of the star map. The page itself belongs to
 * dsh-life-pipline (「Lpipe 设置」); this file only renders one block inside
 * the child slot it declares there.
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


function clock(ms) {
  if (!Number.isFinite(ms)) return '—';
  const date = new Date(ms);
  const day = `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ratioOf(built, turns) {
  if (!Number.isFinite(built) || !Number.isFinite(turns) || turns <= 0) return 0;
  return Math.min(1, Math.max(0, built / turns));
}

function StarmapPanel({ rpcCall }) {
  const [state, setState] = React.useState({ loading: true, value: null, error: '' });

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
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [rpcCall]);

  const value = state.value;
  const built = value?.built ?? 0;
  const turns = value?.turns ?? 0;
  const grey = value?.grey ?? 0;


  return h(
    'section',
    null,
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text } }, 'Lpipe Starmap'),
      h('span', {
        style: {
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'rgba(94, 201, 180, 0.14)', color: COLORS.accent,
          border: '1px solid rgba(94, 201, 180, 0.28)',
        },
      }, '星图管线'),
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
        h('span', { style: small, position: 'relative', top: -2 }, '颗星'),
      ),
      grey > 0
        ? h(
            'div',
            { style: { display: 'flex', alignItems: 'baseline' } },
            h('span', { style: mid, color: COLORS.warning }, String(grey)),
            h('span', { style: { ...small, position: 'relative', top: -2, color: COLORS.warning } }, '轮还是灰的'),
          )
        : null,
    ),
    h('div', { style: track }, h('div', { style: fill(ratioOf(built, turns)) })),
    h(
      'div',
      { style: meta },
      h('span', null, `词表第 ${value?.lex ?? 0} 版${turns ? ` · ${Math.round(ratioOf(built, turns) * 100)}%` : ''}`),
      h('span', null, value?.lastBuiltAt ? `上次点亮 ${clock(value.lastBuiltAt)}` : '还没点亮过'),
    ),
      state.error ? h('div', { style: { fontSize: 11, color: COLORS.danger, marginTop: 6 } }, state.error) : null,
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
    POLL_MS,
  },
};
