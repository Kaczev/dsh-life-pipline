const video = {type:'string',description:'BV 号或 B 站视频链接。'};
const page = {type:'integer',minimum:1,maximum:10000,description:'页码，默认 1。'};
const part = {type:'integer',minimum:1,maximum:200,description:'分 P，默认 1。'};
const seconds = {type:'number',minimum:0};
export function renderResult(_args,value) {
  const {images=[],...text}=value;
  return [{type:'text',text:JSON.stringify(text)},...images.map(attachment=>({type:'image',attachment}))];
}
export function createTools({api,watch,login,status,saveQr}) {
  const tool=(name,description,properties,required,execute)=>({name,description,parameters:{type:'object',additionalProperties:false,properties,required},output:{schema:{type:'object',additionalProperties:true},render:renderResult},execute});
  return [
    tool('bili_feed','浏览 B 站真实首页推荐，返回视频和 UP 主标识。',{page,limit:{type:'integer',minimum:1,maximum:30}},[],(a,e)=>api.feed(a,e?.signal)),
    tool('bili_search','搜索 B 站视频，每页最多 20 条。',{query:{type:'string',minLength:1,maxLength:200},page},['query'],(a,e)=>api.search(a,e?.signal)),
    tool('bili_video','查看视频简介、分 P 与时长；不会下载视频。',{video},['video'],(a,e)=>api.video(a,e?.signal)),
    tool('bili_related','浏览当前视频的相关推荐。',{video},['video'],(a,e)=>api.related(a,e?.signal)),
    tool('bili_uploader','浏览 UP 主投稿，按发布时间分页。',{mid:{type:'string',pattern:'^[1-9][0-9]{0,19}$'},page},['mid'],(a,e)=>api.uploader(a,e?.signal)),
    tool('bili_comments','只读浏览热门评论或指定评论的回复。',{video,page,root:{type:'string',pattern:'^[0-9]{1,20}$',description:'省略或 "0" 浏览热门评论；查看楼中楼时填返回的评论 id。'}},['video'],(a,e)=>api.comments(a,e?.signal)),
    tool('bili_subtitles','读取所选分 P 的字幕；无字幕时明确返回，不自动调用付费转写。',{video,part,from:seconds,to:seconds},['video'],(a,e)=>api.subtitles(a,e?.signal)),
    tool('bili_watch','观看指定区间：返回按时间排列的分镜图片。生成分镜不代表整片看完。',{video,part,from:{...seconds,description:'起始秒，默认 0。'},to:{...seconds,description:'结束秒，默认起点后 180 秒，单次最多 600 秒。'}},['video'],(a,e)=>watch(a,e?.signal)),
    tool('bili_login','扫码登录 B 站。begin 返回二维码；扫码后调用 status 完成凭据保存；cancel 取消扫码。',{action:{type:'string',enum:['begin','status','cancel']}},[],async a=>saveQr(await login.action(a.action))),
    tool('bili_status','查看登录状态、视频处理依赖及临时文件保留设置。',{},[],status),
  ];
}
