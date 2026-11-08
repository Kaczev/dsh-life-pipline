import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the real panels over hook rerenders, rather than checking CSS strings.
async function panel(path, name) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const states = [], refs = [], effects = [];
  let cursor = 0, refCursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({type, props: props ?? {}, children}),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refCursor++; return refs[i] ??= {current: initial}; },
    useEffect(fn) { effects.push(fn); },
    useCallback: fn => fn,
  };
  const module = {exports: {}};
  vm.runInNewContext(source, {require: () => react, module, console, setTimeout, clearTimeout, setInterval, clearInterval});
  const Component = module.exports.__test__[name];
  return {states, effects, render() {cursor = refCursor = 0; return Component({rpcCall: async () => ({ok:true,value:{}})});}};
}
function saves(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'button' && node.children.some(value => value === '保存' || value === '保存中…')) return [node];
  return (node.children ?? []).flat(Infinity).flatMap(saves);
}
for (const spec of [
  {path:'client/panel.js', name:'CommonBlock', baseline(s){s[3]={mainSessionId:'session-a'};s[4]='session-a';}, edit(s){s[4]='session-b';}, revert(s){s[4]='session-a';}},
  {path:'components/dsh-lpipe-chat/client/panel.js', name:'ChatSettingsPanel', baseline(s){s[0]={config:{quietSeconds:1,windowSeconds:5,outputBytes:16384,downloadBytes:536870912,downloadRetentionDays:7},channels:{}};}, edit(s){s[7]='8';}, revert(s){s[7]='7';}, invalid(s){s[7]='0';}},
  {path:'components/dsh-lpipe-bili/client/panel.js', name:'BiliSettingsPanel', baseline(s){s[0]={downloadRetentionDays:7};}, edit(s){s[4]='8';}, revert(s){s[4]='7';}, invalid(s){s[4]='0';}},
  {path:'components/dsh-lpipe-home/client/panel.js', name:'HomeSettingsPanel', baseline(s){s[0]={config:{ownerName:'',location:'none',customPath:''}};s[5]=false;}, edit(s){s[1]={...s[1],ownerName:'Alice'};}, revert(s){s[1]={...s[1],ownerName:''};}},
]) {
  test(`${spec.name}: unchanged, edited, reverted and committed save states`, async () => {
    const p = await panel(spec.path,spec.name);
    p.render(); spec.baseline(p.states);
    let button = saves(p.render())[0]; assert.ok(button); assert.equal(button.props.disabled,true); assert.equal(button.props.style.opacity,0.42);
    spec.edit(p.states); button=saves(p.render())[0]; assert.equal(button.props.disabled,false); assert.equal(button.props.style.opacity,1);
    const busyIndex = ({CommonBlock:5, ChatSettingsPanel:2, BiliSettingsPanel:5, HomeSettingsPanel:4})[spec.name];
    p.states[busyIndex]=true;
    assert.equal(saves(p.render())[0].props.disabled,true);
    p.states[busyIndex]=false;
    spec.revert(p.states); assert.equal(saves(p.render())[0].props.disabled,true);
    if(spec.name==='ChatSettingsPanel') {
      p.states[5]='16384'; p.states[6]='512 MB';
      assert.equal(saves(p.render())[0].props.disabled,true, 'equivalent byte notation is not a change');
    }
    if(spec.invalid){spec.invalid(p.states); assert.equal(saves(p.render())[0].props.disabled,true);}
    spec.baseline(p.states); spec.edit(p.states);
    // Advance stored config to the edited value, as a successful save response does.
    if(spec.name==='CommonBlock') p.states[3]={mainSessionId:'session-b'};
    if(spec.name==='ChatSettingsPanel') p.states[0].config.downloadRetentionDays=8;
    if(spec.name==='BiliSettingsPanel') p.states[0].downloadRetentionDays=8;
    if(spec.name==='HomeSettingsPanel') p.states[0].config.ownerName='Alice';
    assert.equal(saves(p.render())[0].props.disabled,true);
  });
}
