export const ENDPOINT='dsh-lpipe-bili';
export function registerRpc(ctx,{login,status,getRetention,setRetention}) {
  return ctx.connection.fetch.register({path:'/api/'+ENDPOINT,methods:['POST'],requestBody:'buffered',async fetch(request){
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return new Response('Expected JSON',{status:415});
    let m;try{m=await request.json();}catch{return new Response('Invalid JSON',{status:400});}
    const rpcId=typeof m?.rpcId==='string'?m.rpcId:'invalid';let result;
    try{
      if(m?.type!=='client-request'||m.method!==ENDPOINT||typeof m?.payload?.method!=='string')throw Error('Invalid request');
      const {method,payload={}}=m.payload;let value;
      if(method==='bili.status')value=await status();
      else if(method==='bili.login')value=await login.action(payload.action);
      else if(method==='bili.config')value={downloadRetentionDays:getRetention()};
      else if(method==='bili.config.save')value=await setRetention(payload.downloadRetentionDays);
      else throw Error('Unknown method');
      result={ok:true,value};
    }catch(error){result={ok:false,error:{code:'bili/failed',message:error.message,details:{}}};}
    return Response.json({type:'server-response',rpcId,result});
  }});
}
