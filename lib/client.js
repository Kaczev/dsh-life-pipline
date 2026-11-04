window.__ModuleLoader__.load({
  id: "dsh-life-pipline",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
/*
 * The common settings page of the dsh-lpipe- series.
 *
 * This client half owns exactly one thing: the `settings.section` entry named
 * 「Lpipe 设置」and the child slot `lpipe.settings.panel` inside it. Every
 * component registers its own block into that child slot, so the Settings
 * sidebar keeps one entry no matter how many components are installed, and the
 * page itself lives in a single package instead of being copied into each one.
 *
 * A component's bundle patch mounts this package, which is why the page shows
 * up as soon as any dsh-lpipe- plugin is enabled.
 */
const h = require('react').createElement;

const name = 'dsh-life-pipline-settings';
const inject = ['slots'];

const PANEL_SLOT = 'lpipe.settings.panel';
const SECTION_ID = 'lpipe';

function LpipeSettingsPage({ renderSlot }) {
  const body = typeof renderSlot === 'function' ? renderSlot(PANEL_SLOT, {}) : null;

  return h('div', { style: { maxWidth: 760 } },
    h('div', { style: { marginBottom: 16 } },
      h('h2', { style: { margin: 0, fontSize: 17, fontWeight: 600 } }, 'Lpipe 设置'),
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } }, body));
}

function apply(ctx) {
  if (typeof ctx.slots?.inject !== 'function') return;

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: 60,
    label: () => 'Lpipe 设置',
    inject: () => ({}),
    children: { [PANEL_SLOT]: { kind: 'list', scope: 'root' } },
  }, LpipeSettingsPage));
}

module.exports = {
  name,
  inject,
  apply,
  __test__: { LpipeSettingsPage, PANEL_SLOT, SECTION_ID },
};

    return module.exports;
  }
});
