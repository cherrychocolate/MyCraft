import * as S from './store.mjs';
import {invoke,decode} from './models.mjs';
import {AGENT} from './prompts.mjs';
const pages=['home','center','dashboard','hub','quick','controls','notifications','tasks','settings','voice'],routes={calendar:['today','week','tasks','detail','custom'],weather:['today','detail'],reddit:['today','reddit-detail','saved'],external:['today','reddit-detail','saved']};
export async function catalog(env,owner){const {state,releases}=await S.osState(env.DB,owner);return Object.entries(state.installed||{}).flatMap(([id,install])=>{const r=releases.find(r=>r.id===install.releaseId);if(!r||!install.enabled||r.mode==='watchface')return [];const d=r.snapshot,atoms=d.nodes.map(n=>n.atomId),surfaces=[];if(atoms.some(x=>['O08','O03'].includes(x))||r.mode==='prototype')surfaces.push('window');if(atoms.some(x=>['O07','O03'].includes(x)))surfaces.push('widget');return [{id,releaseId:r.id,name:r.name,description:d.description||'',template:d.template,mode:r.mode,version:r.version,surfaces,capabilities:d.nodes.map(n=>({name:n.snapshot?.name,description:n.snapshot?.description})).slice(0,12),routes:[...(routes[d.template]||['today']),...(d.pages||[]).map(x=>'page:'+x.id)],officialYouTube:atoms.includes('C_YOUTUBE_SEARCH'),requiresConfirmation:atoms.some(x=>x.startsWith('C_APIFY_'))}]})}
const bookmarks={'小红书':'https://www.xiaohongshu.com/explore','哔哩哔哩':'https://www.bilibili.com/','维基百科':'https://zh.wikipedia.org/','必应':'https://www.bing.com/','GitHub':'https://github.com/','YouTube':'https://www.youtube.com/'};
function browserURL(input){
 const url=new URL(input);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.')||
    /^[\d.]+$/.test(url.hostname)||/\.(?:local|localhost)$/.test(url.hostname))throw Error('请输入公开网站地址');
 return url.href;
}
export function validate(actions,items){
 if(!Array.isArray(actions)||actions.length>4)throw Error('助手动作超过执行上限');
 return actions.map(a=>{
  if(!a||typeof a!=='object')throw Error('助手动作无效');
  const id=crypto.randomUUID();
  if(a.type==='navigate'&&pages.includes(a.page))return {type:a.type,page:a.page,id};
  if(a.type==='open_browser')return {type:a.type,url:browserURL(a.url),id};
  if(a.type==='present_board')return {type:a.type,id};
  const item=items.find(x=>x.id===a.serviceId);
  if(!item)throw Error('助手请求了未安装服务，未执行');
  const b={type:a.type,serviceId:item.id,releaseId:item.releaseId,id};
  if(['run_service','open_service'].includes(a.type))b.requiresConfirmation=item.requiresConfirmation;
  else if(a.type==='present_schedule'&&item.template==='calendar'){
   if(['today','week','upcoming','tasks'].includes(a.view))b.view=a.view;
   if(/^20\d{2}-\d{2}-\d{2}$/.test(a.date||''))b.date=a.date;
   if(Number.isInteger(a.days)&&a.days>=1&&a.days<=7)b.days=a.days;
  }else if(a.type==='present_service'&&item.surfaces.length){
   b.surface=item.surfaces.includes(a.surface)?a.surface:item.surfaces[0];
   if(item.template==='weather'){
    b.view=['current','daily','hourly'].includes(a.view)?a.view:'current';
    b.days=Number.isInteger(a.days)?Math.min(7,Math.max(1,a.days)):7;
    b.offset=Number.isInteger(a.offset)?Math.min(6,Math.max(0,a.offset)):0;
   }
  }else if(a.type==='search_videos'&&item.officialYouTube&&typeof a.query==='string'&&a.query.trim()&&a.query.length<=200){
   b.query=a.query.trim();b.ranking=a.ranking==='recent_popular'?'recent_popular':'relevance';
  }else if(a.type==='service_action'&&a.action==='route'&&item.routes.includes(a.value)){
   b.action='route';b.value=a.value;
  }else throw Error('助手动作或页面不受支持，未执行');
  return b;
 });
}
function simplePlan(text,items,context){
 if(/分析|为什么|规划|比较|如何|怎么/.test(text))return null;
 const calendar=items.find(x=>x.template==='calendar'),weather=items.find(x=>x.template==='weather'),video=items.find(x=>x.officialYouTube);
 const wantedCalendar=/课表|日程|下节课|下一节/.test(text)||
  context?.activeService?.id===calendar?.id&&/明天|今天|一周|下周/.test(text)&&!/天气|视频/.test(text);
 if(wantedCalendar&&calendar&&!/天气|视频/.test(text))return {answer:'正在读取所问日期的课表。',actions:[{type:'present_schedule',serviceId:calendar.id}]};
 if(weather&&/天气|降雨|下雨|气温/.test(text)&&!/课表|日程|视频/.test(text)){
  const offset=/后天/.test(text)?2:/明天|明日/.test(text)?1:0;
  const count=text.match(/([一二两三四五六七1-7])天/)?.[1];
  const days=offset?1:count?Number(count)||'一二三四五六七'.indexOf(count.replace('两','二'))+1:7;
  const view=/小时|逐时/.test(text)?'hourly':offset||/未来|几天|本周|周末/.test(text)?'daily':'current';
  return {answer:'正在读取深圳天气。',actions:[{type:'run_service',serviceId:weather.id},{type:'present_service',serviceId:weather.id,view,days,offset}]};
 }
 if(video&&/视频|YouTube/i.test(text)&&/搜|找|看|推荐|热门/.test(text)&&!/打开.{0,6}(?:网站|网页)/.test(text)){
  const query=text.replace(/YouTube|请|帮我|给我|我想|推荐|搜索|看|找|几条|一些|的视频|视频|[。？！，]/gi,' ').trim();
  return {answer:'正在搜索 YouTube。',actions:[{type:'search_videos',serviceId:video.id,query:query||'travel',ranking:/最近|热门|最新/.test(text)?'recent_popular':'relevance'}]};
 }
 if(/打开|访问|进入|浏览器|前往/.test(text)){
  const match=text.match(/https?:\/\/[^\s<>,，。]+/)?.[0];
  const site=Object.keys(bookmarks).find(key=>text.toLowerCase().includes(key.toLowerCase()));
  if(match||site)return {answer:'正在打开网页。',actions:[{type:'open_browser',url:match||bookmarks[site]}]};
 }
 return null;
}
function simpleReceipt(pending,receipts){
 const planned=pending.filter(a=>['present_schedule','present_service','search_videos','open_browser'].includes(a.type));
 if(!planned.length||!receipts.length)return null;
 const last=receipts.find(r=>r.id===planned.at(-1).id);
 if(!last)return null;
 const failure=receipts.find(r=>r.status!=='succeeded');
 if(failure)return {answer:'没有完成读取。'+String(failure.error||'').slice(0,180),actions:[]};
 if(planned.at(-1).type==='present_schedule'){
  const count=last.result?.data?.items?.length;
  const source=last.result?.data?.source==='体验课表 · 示例'?'体验课表中':'';
  return {answer:count?`${source}这段时间共有 ${count} 项安排。`:`${source}这段时间没有安排。`,actions:[]};
 }
 if(planned.at(-1).type==='search_videos')return {answer:`找到 ${last.result?.count||0} 条公开结果。`,actions:[]};
 if(planned.at(-1).type==='open_browser')return {answer:last.result?.mode==='external-link'?'浏览器已显示在独立标签页打开的入口。':'浏览器已打开。',actions:[]};
 return {answer:'已把对应时段的实际预报放在下面。',actions:[]};
}
export async function turn(env,owner,p){
 const text=String(p.text||'').trim();
 const guest=S.isGuestWorkspace(owner),limit=guest?1200:6000;
 if(!text||text.length>limit)throw Error('请输入 1 到 '+limit+' 字');
 let s=p.sessionId?await S.get(env.DB,owner,p.sessionId):null;
 if(p.sessionId&&s?._kind!=='agent-session')throw Error('会话不存在，请开启新对话');
 s||={id:'agent-'+crypto.randomUUID(),title:text.slice(0,60),history:[],turn:0,pending:[],receipts:[]};
 const receipts=p.toolResults||[];
 if(!Array.isArray(receipts)||receipts.length!==s.pending.length||new Set(receipts.map(x=>x.id)).size!==receipts.length||
    receipts.some(x=>!s.pending.some(a=>a.id===x.id)||!['succeeded','failed','blocked','cancelled'].includes(x.status)))throw Error('工具回执与本轮计划不匹配');
 const items=await catalog(env,guest?'__preview':owner);
 let response={provider:'Lego OS',model:'服务路由',profileId:null};
 let result=s.pendingSimple?simpleReceipt(s.pending,receipts):!receipts.length?simplePlan(text,items,p.context):null;
 const usingSimple=!!result;
 if(!result){
  const context={catalog:items,toolResults:receipts,runtime:p.context||{}};
  if(JSON.stringify(context).length>70000)throw Error('服务上下文过大');
  const rules=AGENT+'\n语音回复可以直接使用：present_schedule 查看课表；search_videos 搜索公开视频；open_browser 接收已知网站地址；present_service 仅展示与问题相关的真实数据。'+(guest?'\n访客试用回答简洁，正文最多 300 字。':'');
  response=await invoke(env,owner,[{role:'system',content:rules},...s.history.slice(-8),{role:'user',content:JSON.stringify({question:text,context})}]);
  result=decode(response.text);
 }
 if(typeof result.answer!=='string')throw Error('助手没有返回回答正文');
 if(guest)result.answer=result.answer.slice(0,600);
 const actions=validate(result.actions||[],items);
 s={...s,turn:s.turn+1,pending:actions,pendingSimple:usingSimple&&actions.length>0,updatedAt:Date.now()/1000,
    history:[...s.history,{role:'user',content:text},{role:'assistant',content:JSON.stringify({answer:result.answer})}].slice(-12),
    receipts:[...s.receipts,...receipts.map(({result,...r})=>({...r,source:'device-reported'}))].slice(-40)};
 await S.save(env.DB,owner,s,'agent-session',s._revision,env);
 return {sessionId:s.id,answer:result.answer,actions,turn:s.turn,provider:response.provider,model:response.model,profileId:response.profileId};
}
export async function route(path,env,owner,p,url){const list=await S.docs(env.DB,owner);if(path==='catalog')return {services:await catalog(env,owner)};if(path==='turn')return turn(env,owner,p);if(path==='sessions')return {sessions:list.filter(x=>x._kind==='agent-session').map(({id,title,turn,updatedAt})=>({id,title,turn,updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,30)};if(path==='memories')return {memories:list.filter(x=>x._kind==='agent-memory').map(({id,text,deleted,_revision})=>({id,text,deleted:!!deleted,revision:_revision}))};if(path==='memory'){const old=p.id?list.find(d=>d.id===p.id&&d._kind==='agent-memory'):null;if(p.id&&!old)throw Error('记忆不存在');if(!p.text?.trim()||p.text.length>500)throw Error('记忆须为1至500字');if(!old&&list.filter(x=>x._kind==='agent-memory').length>=50)throw Error('记忆数量已达上限');const d=await S.save(env.DB,owner,{id:p.id||'agent-memory-'+crypto.randomUUID(),text:p.text.trim(),deleted:!!p.deleted},'agent-memory',p.expected,env);return {id:d.id,revision:d._revision}}if(path==='cancel'){const d=list.find(x=>x.id===p.sessionId&&x._kind==='agent-session');if(d)await S.save(env.DB,owner,{...d,pending:[]},d._kind,d._revision,env);return {cancelled:true}}if(path==='session'){const d=list.find(x=>x.id===url.searchParams.get('id')&&x._kind==='agent-session');if(!d)throw Error('会话不存在');const history=d.history.map(m=>m.role==='assistant'?{...m,content:decode(m.content).answer}:m);return {id:d.id,history,answer:history.filter(m=>m.role==='assistant').at(-1)?.content||'',title:d.title,receipts:d.receipts}}throw Error('未知助手接口')}
