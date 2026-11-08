import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { buildClient } from '../scripts/build-client.mjs';

/** Load the built bundle the way the Web client does, without a browser. */
async function loadClient() {
  const file = await buildClient();
  const code = await readFile(file, 'utf8');
  assert.match(code, /^window\.__ModuleLoader__\.load\(\{/, 'bundle must open the loader envelope');
  let definition = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => { definition = value; } } },
    console: { warn() {}, error() {}, log() {} },
  };
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  assert.ok(definition, 'bundle must call __ModuleLoader__.load');
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: value => ({ current: value }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  return {
    definition,
    exports: definition.factory((id) => {
      if (id === 'react') return react;
      throw new Error(`unexpected require: ${id}`);
    }),
  };
}

test('the common client half owns the shared Settings page', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-life-pipline');
  assert.equal(exports.name, 'dsh-life-pipline-settings');
  assert.deepEqual([...exports.inject], ['slots', 'connection']);

  const registered = [];
  const ctx = {
    inject: (_keys, callback) => callback({ uiWorkspace: { openSession() {} } }),
    slots: {
      inject: (slot, factory) => factory(),
      register: (options, Component) => {
        registered.push({ options, Component });
        return () => {};
      },
    },
  };
  exports.apply(ctx);

  assert.deepEqual(
    registered.map(({ options }) => options.name),
    ['sidebar.session.row.leading', 'sidebar.workspaces.session.menu.item', 'settings.section'],
    'the common half owns the row seat and the Settings page',
  );
  const { options: seat, Component: Mark } = registered[0];
  assert.equal(seat.id, 'main-session-mark');
  assert.equal(seat.order, 20);
  assert.equal(typeof Mark, 'function');

  assert.equal(registered[1].options.id, 'lp-set-main-session');
  assert.equal(registered[1].options.order, 300);
  const { options: page, Component } = registered[2];
  assert.equal(page.name, 'settings.section');
  assert.equal(page.id, 'lpipe');
  assert.equal(page.order, 60);
  assert.equal(page.label(), 'Lpipe 设置');
  assert.deepEqual(Object.keys(page.children), ['lpipe.settings.panel']);
  assert.equal(page.children['lpipe.settings.panel'].kind, 'list');
  assert.equal(page.children['lpipe.settings.panel'].scope, 'root');
  assert.equal(typeof Component, 'function');
});

test('the mark is inlined, painted only for the main session, and follows the file', async () => {
  const code = await readFile(await buildClient(), 'utf8');
  assert.match(code, /data:image\/png;base64,iVBORw0KGgo/, 'the mark must be inlined as a PNG data URL');
  assert.match(code, /'sidebar\.session\.row\.leading'/, 'the mark must seat in the row leading cell');
  assert.doesNotMatch(code, /1F4CC/, 'the emoji pin is retired');

  const { exports } = await loadClient();
  const { MainSessionMark, setMainSessionId, trackMainSession } = exports.__test__;
  setMainSessionId('');
  assert.equal(MainSessionMark({ sessionId: 'session-a' }), null, 'nothing is marked before a main session is known');
  setMainSessionId('session-a');
  assert.equal(MainSessionMark({ sessionId: 'session-b' }), null, 'other rows stay bare');
  const mark = MainSessionMark({ sessionId: 'session-a' });
  assert.equal(mark.props['data-dsh-life-pipline-mark'], '1');
  assert.match(mark.props.src, /^data:image\/png;base64,iVBORw0KGgo/);
  assert.equal(mark.props.alt, '', 'the mark is decorative');

  const calls = [];
  const stop = trackMainSession(async (method) => {
    calls.push(method);
    return { ok: true, value: { mainSessionId: 'session-live', session: null } };
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ['pipeline.status'], 'the common RPC is the only source of truth');
  assert.notEqual(MainSessionMark({ sessionId: 'session-live' }), null, 'the reported row gets the mark');
  assert.equal(MainSessionMark({ sessionId: 'session-other' }), null, 'other rows stay bare');
  stop();
  assert.equal(MainSessionMark({ sessionId: 'session-live' }), null, 'teardown clears the mark');
});

test('the page renders whatever the installed components registered', async () => {
  const { exports } = await loadClient();
  const { LpipeSettingsPage, PANEL_SLOT } = exports.__test__;
  assert.equal(PANEL_SLOT, 'lpipe.settings.panel');

  const asked = [];
  const tree = LpipeSettingsPage({
    rpcCall: async () => ({ ok: true, value: { mainSessionId: '', session: null } }),
    renderSlot: (slot, props) => {
      asked.push([slot, props]);
      return { type: 'blocks' };
    },
  });
  // The bundle runs in its own realm, so compare structurally, not by prototype.
  assert.equal(asked.length, 1);
  assert.equal(asked[0][0], 'lpipe.settings.panel');
  assert.deepEqual(Object.keys(asked[0][1]), []);
  const column = tree.children[1];
  const body = column.children[1];
  assert.equal(JSON.stringify(body.children), JSON.stringify([{ type: 'blocks' }]), 'the blocks are rendered in order');
  assert.ok(column.children[0]?.type, 'the common block sits above the component blocks');

  // A host that hands no binding still paints the page shell.
  const bare = LpipeSettingsPage({});
  assert.equal(bare.children[1].children[0], null, 'without an RPC binding the common block is skipped');
  assert.equal(bare.children[1].children[1].children[0], null, 'an unbound host renders an empty body, not a crash');
});

test('LP menu saves the clicked row and updates the mark only after success', async () => {
  const { exports } = await loadClient();
  const { chooseMainSession, MainSessionMenuItem, MainSessionMark, setMainSessionId } = exports.__test__;
  setMainSessionId('old');
  await assert.rejects(chooseMainSession(async () => ({ ok:false, error:{message:'denied'} }), 'new'), /denied/);
  assert.notEqual(MainSessionMark({sessionId:'old'}), null);
  await assert.rejects(chooseMainSession(async () => ({ok:true,value:{mainSessionId:'wrong'}}), 'new'), /不一致/);
  const calls=[];
  const rpcCall=async(method,payload)=>{calls.push([method,payload.mainSessionId]);return {ok:true,value:{mainSessionId:payload.mainSessionId}}};
  let closed=false;
  const tree=MainSessionMenuItem({sessionId:'new',rpcCall,useMenuOpenState:()=>[true, value=>{closed=!value}]});
  const button=tree.children[0];
  assert.equal(button.props.role,'menuitem');
  assert.equal(button.props.style.fontSize,'13px');
  assert.equal(button.props.style.lineHeight,'20px');
  assert.equal(button.props.style.padding,'6px 8px');
  assert.equal(button.props.style.gap,'8px');
  assert.equal(button.children[0].props.style.width,16);
  assert.equal(button.children[1].children[0],'设为 LP 主对话');
  await button.props.onClick();
  assert.deepEqual(calls,[['pipeline.config.save','new']]);
  assert.equal(closed,true);
  assert.notEqual(MainSessionMark({sessionId:'new'}),null);
  assert.equal(MainSessionMenuItem({sessionId:'new',rpcCall,useMenuOpenState:()=>[true,()=>{}]}).children[0].props.disabled,true);
});

test('a plugin without slots does not throw', async () => {
  const { exports } = await loadClient();
  assert.doesNotThrow(() => exports.apply({}));
  assert.doesNotThrow(() => exports.apply({
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
  }), 'the mark tracker works without slots');
});

test('main-session mark stays in the common bundle and never depends on chat', async () => {
  const common = await readFile(new URL('../client/panel.js', import.meta.url), 'utf8');
  const chat = await readFile(new URL('../components/dsh-lpipe-chat/client/panel.js', import.meta.url), 'utf8');
  assert.match(common, /const RPC_ENDPOINT = 'dsh-life-pipline'/);
  assert.doesNotMatch(common, /require\(['"]dsh-lpipe-chat/);
  assert.doesNotMatch(chat, /sidebar\.session\.row\.leading|function MainSessionMark|data:image\/png;base64/);
});