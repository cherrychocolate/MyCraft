import {ASSETS} from './frozen.mjs';
import {FRAMEWORK} from './catalog.mjs';
import * as S from './store.mjs';
import * as M from './models.mjs';
import * as A from './agent.mjs';
import * as W from './watchfaces.mjs';
import {access} from './access.mjs';
import {sessionScript} from './cloud-ui.mjs';
import {connectors} from './connectors.mjs';
import {weather} from './weather.mjs';
import {DESIGN} from './prompts.mjs';
import {identity,isOwner,checkOrigin,json,html,gateHTML,sanitize,RELEASE} from './security.mjs';
import {visitor,pageSession,hasPageSession,protectTrial,setMode} from './portal.mjs';
import {youtube} from './youtube.mjs';
import {calendar} from './calendar.mjs';
const publicKinds=new Set(['atom','service','device','idea','release','osstate','design-asset']);
const mutableKinds=new Set(['atom','service','device','idea']);
const binary=(bytes,mime)=>new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
const bytes=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const publicServices=new Set(['/api/weather','/api/cities','/api/models/youtube/search','/api/models/youtube/detail']);
async function models(path,env,owner,p,url){if(path==='state')return M.state(env,owner);if(path==='health')return {ok:true,service:'cloud-model-gateway',version:RELEASE};if(path.startsWith('youtube/'))return youtube(env,path.slice(8),p);if(path.startsWith('agent/'))return A.route(path.slice(6),env,owner,p,url);if(path.startsWith('watchfaces/'))return W.route(path.slice(11),env,owner,p);if(path.startsWith('connectors/')){if(path==='connectors/publish')return S.publish(env.DB,owner,p,env);return connectors(path.slice(11),env,owner,p)}if(path==='voice/config')return M.voiceConfig(env,owner,p);if(['voice/asr','voice/tts'].includes(path))return M.speech(env,owner,path.split('/')[1],p);if(path==='bind'){const options=M.profiles(env);if(!['chat','design','reasoning','vision','image'].includes(p.role)||!options.some(x=>x.id===p.profileId&&x.credentialConfigured))throw Error('请选择已配置用途模型');const old=await S.get(env.DB,owner,'cloud-model-routing');return S.save(env.DB,owner,{id:'cloud-model-routing',roles:{...await M.settings(env,owner),[p.role]:p.profileId}},'internal-settings',old?._revision,env)}if(path==='save'){const profile=M.profiles(env).find(x=>x.id===p.id);if(!profile||p.key||p.workspaceId||p.model!==profile.model||p.provider!==profile.provider)throw Error('线上模型配置由所有者托管；访客可选择用途、试聊和测试连接');const {env:_,...safe}=profile;return safe}if(path==='discover')return {models:M.profiles(env).filter(x=>x.id===p.profileId).map(x=>x.model)};if(path==='chat'){const r=await M.invoke(env,owner,[{role:'system',content:'你是 Lego OS 工作台助手，中文简洁回答。'},...(p.history||[]).slice(-8).filter(m=>['user','assistant'].includes(m.role)),{role:'user',content:String(p.text||'').slice(0,6000)}],'chat',p.profileId);return {answer:r.text,provider:r.provider,model:r.model}}if(path==='design'){if(p.research)throw Error('线上尚未配置联网研究供应商，不以推演冒充检索');const r=await M.invoke(env,owner,[{role:'system',content:DESIGN},{role:'user',content:JSON.stringify(p)}],'design',p.profileId);return S.log(env.DB,owner,{type:'ai',result:M.decode(r.text),provider:r.provider,model:r.model,usage:r.usage,source:'模型推演'},env)}if(path==='os-chat')return A.turn(env,owner,p);if(path==='test'){if(!p){const j=await S.get(env.DB,owner,url.searchParams.get('id'));if(j?._kind!=='connection-test')throw Error('测试不存在');return j}const j={id:'test-'+crypto.randomUUID(),status:'running',steps:[]};try{const r=await M.invoke(env,owner,[{role:'user',content:'请简短回答连接成功，不执行工具。'}],'chat',p.profileId);Object.assign(j,{status:'passed',steps:[{name:'真实模型调用',status:'passed',detail:r.text.slice(0,200)}]})}catch(e){Object.assign(j,{status:'failed',steps:[{name:'真实模型调用',status:'failed',detail:e.message}],error:e.message})}return S.save(env.DB,owner,j,'connection-test',null,env)}if(path==='capabilities/audit'){const list=(await S.docs(env.DB,owner)).filter(d=>d._kind==='atom');return {method:'按当前云端执行器区分；硬件状态为模拟，不宣称刷机可用。',baselineCount:list.filter(d=>!d.connectorId).length,baselineCounts:{registered:list.filter(d=>!d.connectorId).length},labels:{registered:'已注册、按依赖实际验证'},externalCount:list.filter(d=>d.connectorId).length,rows:list.map(d=>({id:d.id,name:d.name,readiness:d.connectorId?(env.APIFY_API_TOKEN?'待 Actor 实测':'待 Apify 授权'):'按具体服务运行验证',note:d.constraints||d.description,help:d.hardware?'需原生设备实现与实机验证':''}))}}throw fail('未知模型接口',404)}
async function api(path,env,owner,p,url){if(path==='state')return {documents:(await S.docs(env.DB,owner)).filter(d=>publicKinds.has(d._kind)),keys:['Gemini','Qwen'].filter(x=>env[x.toUpperCase()+'_API_KEY']),providers:M.providers};if(path==='os')return S.osState(env.DB,owner);if(path==='os-framework')return FRAMEWORK;if(path==='os-state')return S.updateOS(env.DB,owner,p,env);if(path==='os-install')return S.install(env.DB,owner,p,env);if(path==='publish'){const d=await S.get(env.DB,owner,p.id);if(d?.watchface)W.validate(d.watchface);return S.publish(env.DB,owner,p,env)}if(path==='save'){if(!mutableKinds.has(p.kind))throw Error('线上不允许通过此接口修改配置或发布记录');const id=p.document?.id,old=id?await S.get(env.DB,owner,id):null;if(String(id).startsWith('__')||old&&!mutableKinds.has(old._kind)||old&&old._kind!==p.kind)throw Error('不能覆盖受保护记录');return S.save(env.DB,owner,p.document,p.kind,p.expected,env)}if(path==='delete'){const old=await S.get(env.DB,owner,p.id);if(!old||!mutableKinds.has(old._kind))throw Error('只能删除草稿记录');return S.save(env.DB,owner,{...old,deleted:true},old._kind,old._revision,env)}if(path==='runs')return (await env.DB.prepare('SELECT body FROM runs WHERE owner=? ORDER BY created DESC LIMIT 100').bind(owner).all()).results.map(r=>JSON.parse(r.body));if(path==='history')return (await env.DB.prepare('SELECT id,kind,body,revision,updated FROM history WHERE owner=? AND id=? ORDER BY revision DESC').bind(owner,url.searchParams.get('id')).all()).results;if(path==='simulation-log')return S.log(env.DB,owner,{...p,type:'simulation'},env);if(path==='export'){const tables={};for(const t of ['documents','history','runs']){const rows=(await env.DB.prepare('SELECT * FROM '+t+' WHERE owner=?').bind(owner).all()).results;tables[t]=rows.filter(r=>!r.kind||publicKinds.has(r.kind)).map(({owner,...r},i)=>t==='history'?{seq:i+1,...r}:r)}return {format:'glasshouse',version:1,exportedAt:Date.now()/1000,tables}}if(path==='import'){if(p.format!=='glasshouse'||p.version!==1||!Array.isArray(p.tables?.documents)||p.tables.documents.length>1000)throw Error('迁移格式无效');const existing=await S.docs(env.DB,owner),items=p.tables.documents.filter(r=>mutableKinds.has(r.kind)||r.kind==='design-asset').map(r=>({kind:r.kind,doc:JSON.parse(r.body)}));for(const {doc}of items){if(!doc.id||String(doc.id).startsWith('__'))throw Error('迁移包含无效记录');if(doc.watchface)W.validate(doc.watchface)}for(const {doc,kind}of items){const old=existing.find(d=>d.id===doc.id);if(old&&!mutableKinds.has(old._kind)&&old._kind!=='design-asset')continue;await S.save(env.DB,owner,doc,kind,old?._revision,env)}return {ok:true,imported:items.length,message:'已导入草稿与素材；发布版本、安装状态和凭据不会被导入包覆盖。原稿保留历史版本'}}if(path==='weather')return weather(p,url.origin);if(path==='cities'){const name=String(p.name||'').slice(0,100);if(name.trim().length<2)throw Error('请输入城市名称');return M.requestJSON('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name,count:8,language:'zh'}))}if(path==='calendar-connect'&&p.action==='status')return calendar(env,owner,'status',p);if(path==='calendar-import')return calendar(env,owner,'import',p);if(path==='calendar')return calendar(env,owner,'read',p);if(path==='calendar-connect')throw Error('在模拟器顶部导入自己的 .ics 日历');if(path==='reddit')throw Error('请使用已注册 Apify Reddit 原子连接器，并由所有者配置 Token；不以模拟帖子代替真实抓取。');if(path==='voice-config')return M.voiceConfig(env,owner,p);if(path==='ai')return models('design',env,owner,p,url);throw fail('当前线上版本没有接入此接口',404)}
const previewGET=new Set(['/api/state','/api/os','/api/os-framework','/api/models/state',
 '/api/models/health','/api/models/youtube/config','/api/models/voice/config']);
const trialGET=new Set([...previewGET,'/api/models/agent/catalog','/api/models/agent/session',
 '/api/models/agent/sessions','/api/models/agent/memories','/api/models/voice/audio']);
const trialPOST=new Set(['/api/os-state','/api/weather','/api/cities','/api/calendar','/api/calendar-connect','/api/calendar-import',
 '/api/models/agent/stream','/api/models/agent/turn','/api/models/agent/cancel','/api/models/agent/memory',
 '/api/models/voice/asr','/api/models/voice/tts','/api/models/youtube/search','/api/models/youtube/detail']);
const API_ACCESS=new Set(['/api/access/status','/api/access/request','/api/access/requests','/api/access/review']);
const forbidden=()=>fail('此链接只开放模拟空间',404);

function eventStream(task,env){
 const encode=new TextEncoder();
 const stream=new ReadableStream({
  async start(controller){
   const emit=(name,data)=>controller.enqueue(encode.encode('event: '+name+'\ndata: '+JSON.stringify(sanitize(data,env))+'\n\n'));
   emit('accepted',{});
   try{const result=await task();emit('answer',{text:result.answer});emit('result',result)}
   catch(error){emit('error',{error:String(error.message||'请求未完成')})}
   finally{controller.close()}
  }
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

export default {async fetch(req,env){
 try{
  const url=new URL(req.url),path=url.pathname,user=identity(req);
  const isPost=req.method==='POST';
  if(!['GET','HEAD','POST'].includes(req.method))throw fail('请求方式不支持',405);
  checkOrigin(req);
  let p;
  if(isPost){
   if(Number(req.headers.get('Content-Length')||0)>20000000)throw fail('请求超过20MB',413);
   const raw=await req.text();
   if(raw.length>20000000)throw fail('请求超过20MB',413);
   try{p=JSON.parse(raw)}catch{throw fail('请求不是有效 JSON')}
   if(!p||typeof p!=='object'||Array.isArray(p))throw fail('请求内容无效');
  }
  if(path==='/api/access/mode'){
   if(!isPost)throw fail('请提交表单',405);
   if(!isOwner(user,env)||!await hasPageSession(req,env,user))throw forbidden();
   return json(await setMode(env,p.mode));
  }
  if(path==='/request-access'){
   const policy=await visitor(env,user);
   return html(gateHTML(user,policy.review||'pending'));
  }
  if(path==='/access'||API_ACCESS.has(path)){
   if((path==='/api/access/request'||path==='/api/access/review')!==isPost)throw fail('请求方式不支持',405);
   if(path!=='/api/access/request'&&path!=='/api/access/status'&&!isOwner(user,env))throw forbidden();
   return await access(req,env,user,path,p);
  }
  if(path==='/'||path==='/workbench'){
   if(isPost)throw fail('页面不支持提交',405);
   if(path==='/workbench'&&!isOwner(user,env))throw forbidden();
   const asset=ASSETS[path==='/'?'/os.html':'/index.html'];
   const response=binary(bytes(asset.base64),asset.type);
   const session=await pageSession(env,user);
   if(session)response.headers.append('Set-Cookie',session);
   response.headers.set('Permissions-Policy','microphone=(self), camera=(self), geolocation=(self)');
   return response;
  }
  if(path==='/cloud-session.js'){
   const policy=await visitor(env,user);
   return new Response(sessionScript(user,policy),{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path.startsWith('/api/')){
   const policy=await visitor(env,user);
   if(!policy.manager&&!((isPost?trialPOST:trialGET).has(path)))throw forbidden();
   const session=policy.usable&&await hasPageSession(req,env,user);
   const sampleCalendar=isPost&&path==='/api/calendar'&&p.calendarId==='workbench-calendar';
   const openTrial=isPost&&policy.mode==='trial'&&policy.review!=='revoked'&&publicServices.has(path);
   const demo=(!isPost&&previewGET.has(path))||sampleCalendar||openTrial;
   if(!demo&&!session)throw fail(policy.mode==='approval'?'请先登录并取得试用批准':'请从模拟器登录后试用',user?403:401);
   const owner=session?policy.owner:'__preview';
   await S.initialize(env.DB,owner);
   if(isPost&&!policy.manager)await protectTrial(env,owner,path);
   if(isPost&&path.startsWith('/api/models/youtube/')){
    return json(sanitize(await youtube(env,path.slice('/api/models/youtube/'.length),p,{origin:url.origin,owner,manager:policy.manager&&session}),env));
   }
   if(path==='/api/models/agent/stream')return eventStream(()=>A.turn(env,owner,p),env);
   if(path==='/api/models/voice/audio'){
    const id=url.searchParams.get('id');
    if(!/^[a-f0-9-]{36}$/.test(id||''))throw fail('音频不存在',404);
    const obj=await env.BUCKET.get(`audio/${owner}/${id}`);
    if(!obj||Date.now()-Number(obj.customMetadata?.created)>1800000)throw fail('音频不存在或已过期',404);
    return binary(obj.body,obj.httpMetadata?.contentType||'audio/wav');
   }
   const data=path.startsWith('/api/models/')?await models(path.slice(12),env,owner,p,url):await api(path.slice(5),env,owner,p,url);
   return json(sanitize(data,env));
  }
  if(isPost||path.endsWith('.html')||path.startsWith('/architecture/')||path.startsWith('/qa-report/'))throw forbidden();
  if(path.startsWith('/user-media/')){
   if(!isOwner(user,env)||!await hasPageSession(req,env,user))throw forbidden();
   const id=path.slice(12);
   if(!/^asset-[a-f0-9-]{36}$/.test(id))throw fail('素材不存在',404);
   const obj=await env.BUCKET.get(`images/${user.id}/${id}`);
   if(!obj)throw fail('素材不存在',404);
   return binary(obj.body,obj.httpMetadata?.contentType||'image/png');
  }
  const asset=ASSETS[path];
  if(!asset)throw fail('页面不存在',404);
  return binary(bytes(asset.base64),asset.type);
 }catch(e){return json({error:sanitize(String(e.message||'请求未成功'),env)},e.status||400)}
}};
