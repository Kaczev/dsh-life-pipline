const React = require('react');
const h = React.createElement;
const labels = {'dsh-life-core':'生命核心','dsh-lpipe-chat':'聊天管线','dsh-lpipe-home':'栖所管线','dsh-lpipe-bili':'B 站管线','dsh-lpipe-wake':'唤醒管线','dsh-lpipe-memory':'记忆管线','dsh-lpipe-starmap':'星图管线','dsh-lpipe-recall':'回忆管线'};
function project(rows, name, enabled) {
  const target = rows.find(row => row.name === name);
  return rows.map(row => row.name === name || (enabled ? target?.prerequisites.includes(row.name) : row.prerequisites.includes(name)) ? {...row, enabled} : row);
}
function createController(rpcCall, publish, report) {
  let rows = null, queue = [], running = false, live = true;
  const call = async (method, payload = {}) => {const result = await rpcCall(method, payload); if (!result?.ok) throw Error(result?.error?.message ?? '操作失败'); return result.value;};
  const emit = () => {if(live) publish(rows, running || queue.length > 0);};
  const drain = async () => {
    if (running) return;
    running = true; emit();
    while (queue.length) {
      const action = queue.shift();
      try {
        let actual = await call('pipeline.components.set', action);
        // Only unprocessed intents may overlay this acknowledgement.
        rows = queue.reduce((state, intent) => project(state, intent.name, intent.enabled), actual);
      } catch(error) {
        if(live) report(error.message);
        try {const actual = await call('pipeline.components'); rows = queue.reduce((state, intent) => project(state, intent.name, intent.enabled), actual);} catch {}
      }
      emit();
    }
    running = false; emit();
  };
  return {
    async load() {try {rows = await call('pipeline.components'); emit();} catch(error) {if(live)report(error.message);}},
    toggle(name) {if(!rows)return; const enabled = !rows.find(row => row.name === name).enabled; rows = project(rows, name, enabled); queue.push({name, enabled}); emit(); void drain();},
    close() {live = false;},
  };
}
function Components({rpcCall}) {
  const [state,setState] = React.useState({rows:null,pending:false}), [error,setError] = React.useState('');
  const [controller] = React.useState(() => createController(rpcCall, (rows,pending) => setState({rows,pending}), setError));
  React.useEffect(() => {void controller.load();return()=>controller.close();}, [controller]);
  return h('section', {style:{padding:'12px 0',maxWidth:720}},
    h('h3',{style:{margin:'0 0 8px'}},'生命管线 · 组件'),
    h('p',{style:{color:'var(--dsw-alias-label-secondary)'}},'开启下游会补齐前置；关闭前置会关闭下游。'),
    state.rows ? state.rows.map(row=>h('div',{key:row.name,style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--dsw-alias-border-l1)'}},
      h('div',null,labels[row.name],h('small',{style:{display:'block',marginTop:3,color:'var(--dsw-alias-label-secondary)'}},row.prerequisites.length?'依赖：'+row.prerequisites.map(name=>labels[name]).join('、'):'所有管线的前置')),
      h('button',{type:'button',role:'switch','aria-label':labels[row.name],'aria-checked':row.enabled,onClick:()=>{setError('');controller.toggle(row.name);},style:{position:'relative',flex:'none',width:36,height:20,border:0,borderRadius:999,padding:0,background:row.enabled?'var(--dsw-alias-label-primary)':'var(--dsw-alias-border-l2)',cursor:'pointer',transition:'background 150ms'}},
        h('span',{'aria-hidden':true,style:{position:'absolute',top:2,left:2,width:16,height:16,borderRadius:'50%',background:'var(--dsw-alias-bg-base)',transform:row.enabled?'translateX(16px)':'translateX(0)',transition:'transform 150ms'}})))) : h('p',null,error?'组件列表不可用':'正在读取组件…'),
    h('p',{role:'status',style:{fontSize:12,color:'var(--dsw-alias-label-secondary)'}},state.pending?'正在按顺序应用，可继续切换…':''),
    error?h('p',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary)'}},error):null);
}
module.exports={name:'dsh-life-pipline-components',inject:['slots','connection'],apply(ctx){
  const rpcCall=(method,payload)=>ctx.connection.rpc.call('/api','dsh-life-components',{method,payload});
  ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:'dsh-life-pipline',inject:()=>({rpcCall})},Components));
},__test__:{Components,project,createController}};
