/* Shared agent services. The same device runtime drives apps and conversation surfaces. */
(function(){
 const call=(path,p)=>ModelCenter.call(path,p),baseAPI=api;
 api=async function(path,p){if(path==='voice-config')return call('voice/config',p);if(path==='speech-asr'||path==='speech-tts'){const r=await call('voice/'+path.slice(7),p);for(const field of ['url','urls'])if(r[field])r[field]=Array.isArray(r[field])?r[field].map(u=>u.startsWith('/api/models/')?ModelCenter.assetURL(u):u):r[field].startsWith('/api/models/')?ModelCenter.assetURL(r[field]):r[field];return r;}return baseAPI(path,p)};
 configureVoice=async function(){modal('个人助手 · 模型与语音','<p>正在读取已保存的连接…</p>');try{const [cfg,models]=await Promise.all([call('voice/config'),ModelCenter.load()]);if(!$('#modal').open)return;const usable=models.profiles.filter(p=>p.enabled&&!/image/.test(p.model));modal('个人助手 · 模型与语音',`<p>对话、语音识别、播报分别验证。语音可以引用已保存的百炼凭据，留空不会删除 Key。</p><form id="agent-config"><label>对话与技能决策<select name="chatProfile">${usable.map(p=>`<option value="${esc(p.id)}" ${models.routing.chat===p.id?'selected':''}>${esc(p.name)} · ${esc(p.model)}</option>`).join('')}</select></label><label>语音凭据<select name="speechProfileId"><option value="">使用原语音会话凭据</option>${cfg.profiles.map(p=>`<option value="${esc(p.id)}" ${cfg.speechProfileId===p.id?'selected':''}>${esc(p.name)} · ${p.credentialConfigured?'已记住凭据':'缺少凭据'}</option>`).join('')}</select></label><p class="agent-key-status">${cfg.speechKeyConfigured?'语音凭据已配置':'语音凭据待选择'} · 不向页面返回完整 Key</p><label>区域<select name="region"><option value="cn" ${cfg.region==='cn'?'selected':''}>中国内地</option><option value="intl" ${cfg.region==='intl'?'selected':''}>国际</option></select></label><label>Workspace ID<input name="workspaceId" value="${esc(cfg.workspaceId||'')}"></label><label>识别模型<input name="asrModel" value="${esc(cfg.asrModel||'qwen3-asr-flash')}" required></label><label>播报模型<input name="ttsModel" value="${esc(cfg.ttsModel||'qwen3-tts-flash')}" required></label><label>音色<input name="voice" value="${esc(cfg.voice||'Cherry')}" required></label><label><input name="autoSpeak" type="checkbox" ${cfg.autoSpeak?'checked':''}>自动播报回答</label><button type="button" id="agent-preset">使用 Qwen 兼容语音参数</button><button type="submit" class="primary">保存助手配置</button><button type="button" id="agent-test-chat">测试对话与技能结构</button><button type="button" id="agent-test-speech">测试播报 → 识别闭环</button><div id="agent-config-result" role="status"></div></form><a href="/?models=1" target="_blank">管理模型与密钥</a>`);
 let revision=cfg.revision;const form=$('#agent-config'),out=$('#agent-config-result');const save=async()=>{const p=Object.fromEntries(new FormData(form));p.autoSpeak=form.elements.autoSpeak.checked;await call('bind',{role:'chat',profileId:p.chatProfile});const next=await call('voice/config',{...p,expected:revision});revision=next.revision;if(typeof osVoiceConfig!=='undefined')osVoiceConfig=next;return next};
 form.onsubmit=async e=>{e.preventDefault();try{await save();out.textContent='配置已记住。请分别测试对话和语音；保存不等于调用成功。'}catch(e){out.textContent=e.message}};
 $('#agent-preset').onclick=()=>{form.elements.asrModel.value='qwen3-asr-flash';form.elements.ttsModel.value='qwen3-tts-flash';form.elements.voice.value='Cherry';out.textContent='已填入 Qwen-ASR / Qwen-TTS HTTP 协议参数，尚未保存。'};
 async function test(kind,fn){form.querySelectorAll('button').forEach(b=>b.disabled=true);out.textContent='正在真实测试 '+kind+'…';try{await save();await fn()}catch(e){out.textContent='未通过：'+e.message}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false)}}
 $('#agent-test-chat').onclick=()=>test('对话',async()=>{const r=await call('agent/turn',{text:'连接诊断，请只回答连接成功，不执行工具。'});out.textContent=`真实对话成功 · ${r.provider} / ${r.model}：${r.answer} · 工具结构已校验`});
 $('#agent-test-speech').onclick=()=>test('语音闭环',async()=>{out.textContent='1/3 正在合成真实测试音频…';const t=await api('speech-tts',{text:'你好，乐高系统，语音连接测试成功。'});const response=await fetch(t.url);if(!response.ok)throw Error('合成音频读取失败');const blob=await response.blob();out.textContent='2/3 音频已生成，正在送入真实识别…';const audio=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).replace(/^data:[^;]*;/,'data:audio/wav;'));r.onerror=reject;r.readAsDataURL(blob)});const a=await api('speech-asr',{audio});out.innerHTML=`<p>3/3 真实 TTS → ASR 成功</p><p>${esc(t.model)} → ${esc(a.model)}</p><p>实际识别：${esc(a.text)}</p><audio controls src="${esc(t.url)}"></audio><small>使用合成的诊断语句，不代表麦克风录音已验收。</small>`});
 }catch(e){modal('助手连接不可用',`<p>${esc(e.message)}</p>`)}};
 if(typeof osAskModel!=='function')return;
 let sessionId=localStorage.getItem('lego-agent-session')||'',token=0,shown=null,trace=[],catalog=[],controller=null,notice='';
 const runtime=()=>({page:osPage,localDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
  handoffTrip:shown?.page==='travel'?window.LegoHandoffs.trip():undefined,
  services:osInstalled().map(({id,release})=>({id,releaseId:release.id,name:release.name,status:osInstance(id)?.s.status})),
  activeService:(()=>{const id=shown?.id||osActive,i=id?osInstance(id):null;return i?{id,releaseId:i.release.id,name:i.doc.name,...facts(i)}:null})(),
  visibleUI:$('.agent-service-body')?.innerText?.slice(0,5000)||'',results:trace.slice(-4).map(x=>({tool:x.type,status:x.status,error:x.error})),
  surface:shown?{id:shown.id,page:shown.page,surface:shown.surface,videoQuery:shown.video?.query}:null});
 function facts(i){if(!i)return null;const output=Object.values(i.s.results||{}).filter(r=>r.ok).map(r=>r.value?.data||r.value);let data=output.find(v=>['calendar','weather','reddit','content-feed'].includes(v?.type))||null;if(data&&['reddit','content-feed'].includes(data.type))data={...data,items:(data.items||[]).slice(0,8).map(x=>({id:x.id,title:x.title,excerpt:String(x.excerpt||'').slice(0,300)}))};return {updatedAt:i.s.updatedAt||null,cached:!!i.s.fromCache,refreshError:i.s.lastRefreshError||'',route:i.s.route,status:i.s.status,error:i.s.error||'',data,tasks:i.doc.timetable?.tasks?.slice(0,12)||[]}}
 function friendlyError(e){return /handshake|urlopen|_ssl/.test(String(e))?'上游连接超时，未获取到真实数据':String(e)}
 function videoList(feed){
  return `<section class="agent-video-list" aria-label="YouTube 推荐视频"><header><img src="/app-icons/youtube.png" alt="" width="34" height="34"><strong>${feed.ranking==='recent_popular'?'近 7 天热门':'YouTube 视频'}</strong></header>
   ${feed.items.map((item,index)=>`<button data-agent-video="${esc(item.id)}" ${index===0?'data-focus-default':''} aria-label="开始观看 ${esc(item.title)}">
    ${item.media?.images?.[0]?`<img src="${safeUrl(item.media.images[0])}" alt="" loading="lazy">`:GlassGraphics.icon('play',38)}
    <span><strong>${esc(item.title)}</strong><small>${esc(item.author)}</small></span></button>`).join('')||'<p>这次没有匹配的视频。</p>'}</section>`;
 }
 async function watchVideo(videoId){
  if(!shown?.video)return;
  const {id,video}=shown;
  try{
   LegoHomeUI.closeVoice(false);
   await VideoHub.playFromAssistant(id,video,videoId);
  }catch(e){notice=e.message;LegoHomeUI.showVoice();}
 }
 function renderSurface(){if(!shown)return '';
  if(shown.video)return videoList(shown.video);
  if(shown.page){
   const entry=window.LegoHandoffs?.entry(shown.page);
   if(!entry)return '';
   return `<section class="agent-handoff">${window.LegoHandoffs.render(entry,true)}</section>`;
  }
  const i=osInstance(shown.id);if(!i)return '';const source=i.s.calendarSource||i.s.weatherSource||'';let html=i.release.mode==='prototype'?PrototypeRuntime.render(i.doc,i.proto):i.s.status==='ready'?osSurface(i,shown.surface==='widget'?1:2):`<p>${esc(friendlyError(i.s.error)||i.s.status==='running'&&'正在读取真实数据…'||'尚未读取数据')}</p>`;return `<section class="agent-service" data-agent-owner="${esc(shown.id)}"><header><b>${esc(i.doc.name)}</b><button data-agent="fullscreen">全屏</button><button data-agent="hide-surface" aria-label="收起服务界面">×</button></header><div class="agent-service-body sv-screen" data-owner="${esc(shown.id)}">${html}</div></section>`}
 function fragment(){return `${notice?'<p class="agent-notice" role="status">'+esc(notice)+'</p>':''}<div class="agent-tools">${trace.filter(t=>!['present_entry','search_videos'].includes(t.type)||t.status!=='succeeded').slice(-4).map(t=>`<small class="agent-tool-${t.status}">${esc(({run_service:'读取服务',present_service:'展示界面',service_action:'切换视图',open_service:'打开应用',navigate:'系统导航',present_entry:'准备操作',search_videos:'搜索视频'})[t.type]||t.type)} · ${esc(t.status==='running'?'执行中':t.status==='succeeded'?'已完成':t.status==='blocked'?'需要确认':t.status==='cancelled'?'已取消':'未成功')}${t.error?' · '+esc(friendlyError(t.error)):''}</small>`).join('')}</div>${renderSurface()} `}
 function controls(){return `${osVoiceState.audio?'<button data-agent="play" type="button">播放回答</button>':''}<div class="agent-session-controls"><button data-agent="sessions">会话与技能</button><button data-agent="new">新对话</button>${osVoiceState.busy||osVoiceState.synthesizing?'<button data-agent="cancel">取消任务</button>':''}</div>`}
 async function syncRegistry(){await osSaving;const fresh=await api('os');osData=fresh.state;osRevision=fresh.revision;osReleases=fresh.releases}
 async function execute(a,runToken){const i=a.serviceId?osInstance(a.serviceId):null;if(a.serviceId&&(!i||i.release.id!==a.releaseId))throw Error('服务版本已更新，请重新请求');if(a.requiresConfirmation){const agreed=await new Promise(resolve=>{modal('服务调用需要确认',`<p>${esc(i.doc.name)} 使用外部付费连接器，是否执行？</p>`,'<button id="agent-allow">本次执行</button><button id="agent-deny">取消</button>');$('#modal').addEventListener('close',()=>resolve(false),{once:true});$('#agent-allow').onclick=()=>{closeModal();resolve(true)};$('#agent-deny').onclick=()=>{closeModal();resolve(false)};$('#modal .dialoghead button').onclick=()=>{closeModal();resolve(false)}});if(!agreed)return {status:'cancelled',error:'用户取消，未执行'}}if(runToken!==token)return {status:'cancelled',error:'任务已取消'};
 if(a.type==='run_service'){await osRun(a.serviceId);if(i.s.lastRefreshError)throw Error('刷新失败，保留缓存：'+i.s.lastRefreshError);if(i.s.status!=='ready')throw Error(i.s.error||'服务没有就绪');return {status:'succeeded',result:facts(i)}}
 if(a.type==='present_service'){shown={id:a.serviceId,surface:a.surface};renderOS();return {status:i.s.status==='failed'?'failed':'succeeded',result:{surface:a.surface,...facts(i)},error:i.s.error||''}}
 if(a.type==='open_service'){await osLaunch(a.serviceId);return {status:i.s.status==='ready'?'succeeded':'failed',result:facts(i),error:i.s.error}}
 if(a.type==='present_entry'){
  if(!window.LegoHandoffs?.entry(a.page))throw Error('当前设备没有该入口');
  if(a.page==='travel')window.LegoHandoffs.updateTrip(a.fields);
  shown={page:a.page};renderOS();
  return {status:'succeeded',result:{page:a.page,entryPresented:true,trip:a.page==='travel'?window.LegoHandoffs.trip():undefined,bookingStatus:'尚未预订'}};
 }
 if(a.type==='search_videos'){
  if(!i?.doc.nodes?.some(n=>n.atomId==='C_YOUTUBE_SEARCH'))throw Error('没有可用的 YouTube 官方服务');
  if(!DeviceNavigation.online(osData.settings))throw Error('设备当前离线');
  const video=await connectorAPI('youtube/search',{query:a.query,ranking:a.ranking,maxResults:8});
  if(runToken!==token)return {status:'cancelled',error:'已取消'};
  shown={id:a.serviceId,video};renderOS();
  return {status:'succeeded',result:{ranking:video.ranking,count:video.items.length,items:video.items.map(item=>item.title)}};
 }
 if(a.type==='navigate'){osNavigate(a.page,true);return {status:'succeeded',result:{page:osPage}}}
 if(a.type==='service_action'){ServiceRuntime.navigate(i.s,a.value);shown={id:a.serviceId,surface:'window'};renderOS();return {status:'succeeded',result:{route:i.s.route,...facts(i)}}}throw Error('未实现的设备工具')}
 async function ask(text,{keepBackground=false}={}){if(osVoiceState.busy)return;
 const watch=text.trim().match(/^(?:开始观看|开始播放|播放|观看)(?:第?([1-8一二三四五六七八])(?:条|个)?)?[。！!]?$/);
 if(watch&&shown?.video?.items.length){
  const index=watch[1]?Number(watch[1])||'一二三四五六七八'.indexOf(watch[1])+1:1;
  const video=shown.video.items[index-1];
  if(video)return watchVideo(video.id);
 }
const v=osVoiceState,runToken=++token;if(osRecorder)osRecorder.stop();notice='';v.busy=true;v.error='';v.answer='';v.audio=null;v.audioParts=[];v.transcript=text;v.synthesizing=false;v.timing={started:performance.now()};v.stage='正在理解请求';trace=[];osAudioPlayer?.pause();if(keepBackground)renderOS();else LegoHomeUI.showVoice();requestAnimationFrame(()=>{if(runToken===token){v.timing.feedbackMs=Math.round(performance.now()-v.timing.started);$('.lego-voice-panel')?.setAttribute('data-feedback-ms',v.timing.feedbackMs)}});controller?.abort();controller=new AbortController();let results=[];try{for(let round=0;round<4;round++){if(runToken!==token)return;v.stage=round?'正在根据真实执行结果回答':'正在理解请求与选择技能';renderOS();const request={text,sessionId:sessionId||undefined,context:runtime(),toolResults:results};const r=await AgentStream.turn(request,(kind,data)=>{if(runToken!==token)return;if(kind==='accepted'){v.timing.ackMs=Math.round(performance.now()-v.timing.started);$('.lego-voice-panel')?.setAttribute('data-ack-ms',v.timing.ackMs)}if(kind==='answer'){if(v.timing.firstTextMs==null)v.timing.firstTextMs=Math.round(performance.now()-v.timing.started);v.answer=data.text;v.stage='正在回答';const answer=$('.lego-voice-answer');if(answer){const input=$('.kai-bubble[data-turn=input]');if(input)input.hidden=true;answer.hidden=false;answer.textContent=data.text;LegoHomeUI.scrollVoice()}}},controller.signal);if(runToken!==token)return;sessionId=r.sessionId;localStorage.setItem('lego-agent-session',sessionId);v.answer=r.answer;v.agentModel=r.provider+' / '+r.model;v.stage='已回答';renderOS();if(!r.actions.length)break;if(round===3)throw Error('本轮工具次数达到上限，已停止继续执行');results=[];await syncRegistry();for(const a of r.actions){const t={...a,status:'running'};trace.push(t);v.stage='正在执行技能';renderOS();let receipt;try{receipt=await execute(a,runToken)}catch(e){receipt={status:'failed',error:e.message}}if(runToken!==token)return;Object.assign(t,receipt);results.push({id:a.id,...receipt});renderOS()}}
 if(runToken!==token)return;v.history.push({role:'user',content:text},{role:'assistant',content:v.answer});v.history=v.history.slice(-12);if(!osVoiceConfig)osVoiceConfig=await api('voice-config');v.busy=false;v.timing.answerMs=Math.round(performance.now()-v.timing.started);if(osVoiceConfig.autoSpeak&&osVoiceConfig.speechKeyConfigured){v.synthesizing=true;v.stage='正在生成语音';renderOS();await osSpeak(false);if(runToken===token)v.synthesizing=false}else if(osVoiceConfig.autoSpeak)v.stage+=' · 未配置播报';
 }catch(e){if(runToken===token){v.error=e.message;v.stage='执行未完成';if(sessionId)await call('agent/cancel',{sessionId}).catch(()=>{})}}finally{if(runToken===token){v.busy=false;v.synthesizing=false;renderOS()}}};
 // The message dictation lane is independent of a model request running in the background.
 let recordingEpoch=0;
 async function recognizeSpeech(blob){
  const audio=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=reject;
   reader.readAsDataURL(blob);
  });
  return api('speech-asr',{audio});
 }
 function cancelCapture(){
  recordingEpoch++;
  if(osRecorder){
   osRecorder.onstop=null;
   if(osRecorder.state!=='inactive')osRecorder.stop();
  }
  osRecordingStream?.getTracks().forEach(track=>track.stop());
  osRecorder=null;
  osRecordingStream=null;
  clearTimeout(osRecordTimer);
 }
 osTranscribe=async function(blob,captureToken){
  const requestToken=captureToken??++token,v=osVoiceState;
  if(requestToken!==token)return;
  v.busy=true;v.error='';v.stage='正在调用 Qwen ASR';
  renderOS();
  try{
   const result=await recognizeSpeech(blob);
   if(requestToken!==token)return;
   v.busy=false;
   if(!result.text?.trim())throw Error('没有识别到语音，请重试');
   await ask(result.text,{keepBackground:true});
  }catch(e){
   if(requestToken===token){v.busy=false;v.error=e.message;v.stage='语音识别失败';renderOS()}
  }
 };
 osToggleRecord=async function(hooks){
  if(osRecorder){if(osRecorder.state!=='inactive')osRecorder.stop();return}
  if(osVoiceState.busy&&!hooks)return;
  const capture=++recordingEpoch;
  const request=hooks ? null : ++token;
  const valid=()=>recordingEpoch===capture&&(hooks||request===token);
  const fail=message=>{
   if(!valid())return;
   if(hooks)hooks.error(message);
   else {osVoiceState.busy=false;osVoiceState.error=message;renderOS()}
  };
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
   fail('此设备未提供麦克风录音接口');return;
  }
  let stream;
  try{
   osAudioPlayer?.pause();
   stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!valid()){stream.getTracks().forEach(track=>track.stop());return}
   osRecordingStream=stream;
   const recorder=new MediaRecorder(stream),chunks=[];
   osRecorder=recorder;
   recorder.ondataavailable=e=>chunks.push(e.data);
   recorder.onstop=async()=>{
    clearTimeout(osRecordTimer);
    stream.getTracks().forEach(track=>track.stop());
    if(osRecorder===recorder){osRecorder=null;osRecordingStream=null}
    if(!valid())return;
    if(hooks)hooks.state('processing');
    else {osVoiceState.busy=true;osVoiceState.stage='正在转换录音';renderOS()}
    try{
     const wav=await wavFromRecording(new Blob(chunks,{type:recorder.mimeType}));
     if(valid())await (hooks ? hooks.done(wav) : osTranscribe(wav,request));
    }catch(e){fail('录音处理失败：'+e.message)}
   };
   recorder.start();
   osRecordTimer=setTimeout(()=>{if(osRecorder===recorder&&recorder.state!=='inactive')recorder.stop()},60000);
   if(hooks)hooks.state('listening');
   else {osVoiceState.stage='录音中';osVoiceState.error='';LegoHomeUI.showVoice()}
  }catch(e){
   stream?.getTracks().forEach(track=>track.stop());
   if(valid()){osRecorder=null;osRecordingStream=null;fail('麦克风不可用：'+e.message)}
  }
 };
 const oldClick=osClick;osClick=async function(e){const video=e.target.closest('[data-agent-video]');if(video){if(!osVoiceState.busy)await watchVideo(video.dataset.agentVideo);return}if(e.target.closest('[data-os=stop-audio]')&&osVoiceState.synthesizing){token++;vCancel();return}const b=e.target.closest('[data-agent]');if(b){const kind=b.dataset.agent;if(kind==='play'){try{await osAudioPlayer?.play()}catch(e){toast('音频未能播放：'+e.message)}return}if(kind==='cancel'){token++;vCancel();return}if(kind==='hide-surface'){shown=null;renderOS();return}if(kind==='fullscreen'&&shown){const id=shown.id;LegoHomeUI.closeVoice(false);await osLaunch(id);return}if(kind==='new'){token++;vCancel();sessionId='';localStorage.removeItem('lego-agent-session');shown=null;trace=[];osVoiceState.answer='';osVoiceState.transcript='';osVoiceState.history=[];notice='新对话已开始；个人记忆按启用状态保留。';renderOS();return}if(kind==='sessions'){await sessions();return}}
 const proto=e.target.closest('[data-proto]'),owner=e.target.closest('[data-agent-owner]');if(proto&&owner){const i=osInstance(owner.dataset.agentOwner);PrototypeRuntime.activate(i.doc,i.proto,proto.dataset.proto);renderOS();return}await oldClick(e)};
 function vCancel(){controller?.abort();osVoiceState.synthesizing=false;notice='已取消后续执行。已开始的模型请求仍可能产生用量。';cancelCapture();if(sessionId)call('agent/cancel',{sessionId}).catch(()=>{});osAudioPlayer?.pause();osVoiceState.busy=false;osVoiceState.stage='已取消';osVoiceState.error='';for(const t of trace)if(t.status==='running')t.status='cancelled';renderOS()}
 async function sessions(){try{const [list,tools,memory]=await Promise.all([call('agent/sessions'),call('agent/catalog'),call('agent/memories')]);catalog=tools.services;modal('会话与已安装技能',`<button id="agent-audio-e2e">完整语音链路自检</button><p id="agent-audio-proof"></p><h3>当前可调用服务 · ${catalog.length}</h3>${catalog.map(s=>`<p>${esc(s.name)} · v${s.version}<small> ${esc(s.surfaces.join(' / '))} · ${esc(s.routes.join(' / '))}</small></p>`).join('')}<h3>个人记忆</h3><p>只有你明确保存的内容会跨会话使用。停用可恢复。</p><input id="agent-memory-new" aria-label="新的个人记忆" placeholder="例如：天气默认看深圳"><button id="agent-memory-add">保存个人记忆</button>${memory.memories.map(m=>`<div><input data-memory-text="${esc(m.id)}" aria-label="编辑个人记忆" value="${esc(m.text)}"><button data-memory-save="${esc(m.id)}">保存修改</button><button data-memory-toggle="${esc(m.id)}">${m.deleted?'恢复':'停用'}</button></div>`).join('')}<h3>本地会话</h3><p>只带入当前会话最近消息；重新读取实时数据。新对话隔离上下文。</p>${list.sessions.map(s=>`<button data-agent-resume="${esc(s.id)}">${esc(s.title)} · ${s.turn} 轮</button>`).join('')||'<p>尚无会话</p>'}`);$('#agent-memory-add').onclick=async()=>{try{await call('agent/memory',{text:$('#agent-memory-new').value});await sessions()}catch(e){toast(e.message)}};$$('[data-memory-save],[data-memory-toggle]').forEach(b=>b.onclick=async()=>{try{const id=b.dataset.memorySave||b.dataset.memoryToggle,m=memory.memories.find(x=>x.id===id),text=$('[data-memory-text="'+id+'"]').value;await call('agent/memory',{id,text,expected:m.revision,deleted:b.dataset.memoryToggle?!m.deleted:m.deleted});await sessions()}catch(e){toast(e.message)}});$('#agent-audio-e2e').onclick=async()=>{const b=$('#agent-audio-e2e'),out=$('#agent-audio-proof');b.disabled=true;out.textContent='正在生成诊断语音并送入真实 ASR…';try{const r=await api('speech-tts',{text:'请读取我的日程，并在对话中展示周课表。'}),response=await fetch(r.url);if(!response.ok)throw Error('测试音频不可读');const blob=await response.blob(),audio=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).replace(/^data:[^;]*;/,'data:audio/wav;'));reader.readAsDataURL(blob)}),a=await api('speech-asr',{audio});closeModal();await osAskModel(a.text)}catch(e){out.textContent=e.message;b.disabled=false}};$$('[data-agent-resume]').forEach(b=>b.onclick=async()=>{const r=await call('agent/session?id='+encodeURIComponent(b.dataset.agentResume));sessionId=r.id;localStorage.setItem('lego-agent-session',sessionId);shown=null;trace=[];osVoiceState.history=r.history;osVoiceState.answer=r.answer;osVoiceState.transcript=r.title;closeModal();renderOS()})}catch(e){toast(e.message)}}
 osAskModel=ask;
 window.PersonalAgent={ask,fragment,videoVisible:()=>!!shown?.video?.items.length,controls,recognizeSpeech,cancelCapture,generation:()=>token};
})();
