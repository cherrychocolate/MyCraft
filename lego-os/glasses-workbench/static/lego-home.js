/* System-owned home slots: one pinned summary, global assistant, spatial navigation. */
(function(){
 if(typeof osContent!=='function')return;
 const E=LegoHomeEngine,G=GlassGraphics;let voiceOpen=false,voiceDraft='',replyDraft='',typing=false,voiceStyle='kai',phase='idle',seenOutcome='',lastOutcome='',newOutcome=false,arrival=null;const attempted=new Set();let meter=null,suppressEdgeClickUntil=0,voiceScroll=0;
 const allInstalled=osInstalled;
 osInstalled=function(){return E.uniqueServices(allInstalled())};
 const installed=()=>osInstalled().map(x=>({...x,template:x.release.snapshot.template,mode:x.release.mode,widget:ServiceRuntime.surfaces(x.release.snapshot).widget}));
 function pinId(){const apps=installed(),id=osData.settings.homePinServiceId;if(id&&!apps.some(app=>app.id===id)&&allInstalled().some(app=>app.id===id&&app.release.snapshot.template==='calendar'))return apps.find(app=>app.template==='calendar')?.id||null;return E.selectPin(apps,osData.settings)}
 function clock(){return new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false})}
 function date(){return new Date().toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'})}
 function pet(){return G.element({type:'component',component:'snoopy-v1'})}
 const kaiClipMs=5000;
 function orb(style=voiceStyle){if(style==='kai')return `<span class="kai-motion-stage" aria-hidden="true">${LegoKaiMotion.markup}</span>`;return `<span class="lego-voice-avatar avatar-${style}">${style==='pet'?pet():'<i class="orb-core"></i><i class="orb-orbit"></i><i class="orb-highlight"></i>'}<span class="voice-signal"><i></i><i></i><i></i></span></span>`}
 let kaiWakeUntil=0,kaiDismissUntil=0;
 let clockSecond=-1;
 function mini(id){const i=osInstance(id);if(!i)return '';let body='';if(i.s.status==='ready'){
  if(i.doc.template==='weather'){const w=i.s.weather,c=w?.current;body=c?`<span class="mini-weather-icon">${G.weather(c.weather_code,!!c.is_day,52)}</span><strong>${esc(c.temperature_2m)}°</strong><span><b>${esc(w.location?.name||i.doc.runtimeConfig?.locationName||'天气')}</b><small>${esc(c.time?.slice(11,16)||'')} · ${esc(i.s.weatherSource?.includes('模拟')?'模拟数据':'天气预报')}</small></span>`:'<b>天气数据暂不可用</b>'}
  else if(i.doc.template==='calendar'){const rows=ServiceSurfaces.rows(i.doc,i.s).filter(r=>r.status!=='cancelled'),next=ttE.upcoming(rows,i.s.clock);const tasks=i.doc.timetable?.tasks?.filter(t=>!t.done)||[];body=`${G.icon('calendar',42)}<span><b>${esc(next?.title||tasks[0]?.title||'当前没有后续安排')}</b><small>${esc(next?next.start+' · '+(next.location||''):(tasks.length?tasks.length+' 项待办':''))}</small></span>`}
  else{const feed=Object.values(i.s.results||{}).map(r=>r.value?.data||r.value).find(v=>['reddit','content-feed'].includes(v?.type));body=`${G.icon('news',40)}<span><b>${esc(feed?.items?.[0]?.title||i.doc.name)}</b></span>`}
 }else body=`${G.icon(i.doc.template==='weather'?'sun':i.doc.template==='calendar'?'calendar':'news',42)}<span><b>${esc(i.doc.name)}</b><small>${esc(i.s.status==='failed'?'数据暂不可用':i.s.status==='running'?'正在更新…':'尚未读取数据')}</small></span>`;
 return `<button class="lego-mini-widget" data-launch="${esc(id)}" aria-label="${esc(i.doc.name)}" data-home-pin="${esc(id)}">${body}</button>`}
 function home(){
  const id=pinId(),layout=osData.settings.homeLayout||'lower';
  const widget=id?mini(id):'';
  return `<section class="lego-home glasses-scene layout-${layout}" data-home-state="active" aria-label="Lego OS 主页">
   <div class="lego-home-clock"><time data-lego-clock>${clock()}</time><span data-lego-date>${date()}</span></div>
   <div class="lego-home-tray">${widget}${presence()}</div>
  </section>`;
 }
 const oldContent=osContent;osContent=function(){if(osPage==='home'){const custom=osReleases.find(r=>r.id===osData?.watchface?.activeReleaseId)?.snapshot?.watchface;if(custom)return oldContent();return home()}return oldContent()};
 // All cards are hot areas. Light actions inside medium/large cards retain their own handlers.
 osDashboard=function(){return `<small class="sv-overline">AT A GLANCE</small><h1>看板</h1><div class="sv-widget-grid">${osInstalled().map(({id})=>{const i=osInstance(id);if(!ServiceRuntime.surfaces(i.doc).widget||i.release.mode==='prototype')return '';if(i.s.status!=='ready')return `<button class="lego-dashboard-pending" data-launch="${esc(id)}" aria-label="${esc(i.doc.name)}">${G.icon(i.doc.template==='weather'?'sun':i.doc.template==='calendar'?'calendar':'news',42)}<strong>${esc(i.doc.name)}</strong><small>${i.s.status==='running'?'正在更新…':i.s.status==='failed'?'数据暂不可用':'尚未读取数据'}</small></button>`;const tmp=document.createElement('div');tmp.innerHTML=osSurface(i,1);return `<section class="os-widget-owner" data-owner="${esc(id)}">${tmp.querySelector('.sv-widget-grid')?.innerHTML||''}</section>`}).join('')}</div>`};
 const phaseText={idle:'我在听',listening:'正在聆听',composing:'正在输入',transcribing:'正在识别',
  thinking:'正在处理',responding:'正在回答',synthesizing:'正在生成语音',speaking:'正在播报',answer:'',error:'暂时未完成'};
 function conversation(){
  const v=osVoiceState;
  return `<div class="kai-conversation" aria-label="当前对话内容">
    <div class="kai-bubble kai-user" data-turn="input" ${v.transcript&&!v.answer&&!v.error?'':'hidden'}>${esc(v.transcript)}</div>
    <article class="kai-reply" ${v.answer||v.error?'':'hidden'}>
    <div class="kai-bubble kai-assistant lego-voice-answer" data-turn="reply" role="status" ${v.answer&&!v.error?'':'hidden'}>${LegoReplyContent.render(v.answer)}</div>
    ${v.error?`<p class="kai-bubble kai-assistant" role="status">${esc(v.error)}</p>`:''}
    ${v.speechError?`<p class="kai-bubble kai-assistant" role="status">播报暂不可用。${esc(v.speechError)}</p>`:''}
    ${window.PersonalAgent?.fragment()||''}</article>
  </div>`;
 }
 function panel(){return `<section class="lego-voice-panel kai-hud" role="dialog" aria-label="Lego 个人助手">
   <div class="kai-awake kai-glass">${orb()}<span class="kai-screen-reader" data-kai-phase aria-live="polite">${esc(phaseText[phase])}</span></div>
   <div class="kai-content" data-focus-scroll="kai-answer" tabindex="0" role="region" aria-label="当前回答，可上下滚动">${conversation()}</div>
 </section>`;}
 function scrollVoice(){
  const stream=$('.kai-content');
  if(stream){stream.scrollTop=voiceScroll;stream.onscroll=()=>{voiceScroll=stream.scrollTop}}
 }
 function voiceActivity(){
  return osVoiceState.busy||osVoiceState.synthesizing?'正在处理':newOutcome?'有新回复':'';
 }
 function voiceDock() {
  const reply=window.LegoMessages?.composing();
  const busy=reply?['starting','listening','processing'].includes(LegoMessages.capture()):osVoiceState.busy;
  const activity=osPage==='home'?'':voiceActivity();
  const form=voiceOpen||reply?`<form id="lego-voice-form" data-mode="${reply?'message':'assistant'}">
    <input id="lego-voice-input" aria-label="${reply?'输入回复':'向助手提问'}" placeholder="${reply?'输入回复…':'输入给 Kai…'}"
      maxlength="2000" value="${esc(reply?replyDraft:voiceDraft)}" ${reply&&busy?'disabled':''}>
    <button ${reply&&busy?'disabled':''}>${reply?'预览':'发送'}</button></form>`:'';
  const controls=reply?`<button data-kai-control="reply-mic" ${LegoMessages.capture()==='processing'?'disabled':''}>${LegoMessages.capture()==='listening'?'停止录音':'麦克风'}</button>
    <button data-kai-control="reply-sample" ${LegoMessages.capture()==='processing'?'disabled':''}>载入示例语音</button>`:
   voiceOpen?`<button data-os="record" ${busy&&!osRecorder?'disabled':''}>${osRecorder?'停止录音':'麦克风'}</button>
    <button data-os="speak" ${!osVoiceState.answer||busy||osVoiceState.synthesizing?'disabled':''}>播报</button>
    <button data-os="stop-audio">停止</button><button data-kai-control="hide">收起</button>
    ${window.PersonalAgent?.controls()||''}<button data-os="voice-config">连接设置</button>`:
    `<button data-kai-control="wake">唤醒 Kai</button>${osPage==='home'?'':`<span class="kai-dock-status" role="status" ${activity?'':'hidden'}>${activity}</span>`}<button data-kai-control="demo-message">模拟来信</button>`;
  return `<section class="kai-dock-controls" aria-label="${reply?'模拟消息输入':'模拟助手控制'}">${form}<div class="kai-dock-actions">${controls}</div></section>`;
 }
 function hints(){const current=E.spatial(osPage);return `<nav class="lego-spaces" aria-label="四向系统空间" data-current-space="${current}">${[['up','控制中心'],['left','快捷应用'],['right','看板与通知'],['down','应用中心']].map(([dir,label])=>`<button class="lego-edge edge-${dir}" data-lego-space="${dir}" aria-label="${label}" tabindex="-1"><i></i><span>${label}</span></button>`).join('')}<div class="lego-space-track" aria-hidden="true"><i class="${current==='left'?'current':''}"></i><i class="${current==='home'?'current':''}"></i><i class="${current==='right'?'current':''}"></i></div></nav>`}
 function presence(){
  const label=voiceActivity();
  return `<button class="lego-voice-launch kai-launch kai-glass" data-lego="voice-open" aria-label="${label?'语音助手：'+label:'语音助手'}">
    <span class="kai-standby-avatar">${orb()}</span>
  </button>`;
 }
 function layer(){
  const state=voiceOpen?null:E.activity(false,false,[...osInstances.values()].map(i=>({status:i.s.refreshing?'running':i.s.status,name:i.doc.name})),osData.notifications);
  return `<div class="lego-system-layer" style="zoom:${osScale}" data-voice-phase="${phase}" data-screen-awake="${GlassHome.awake}">
   ${!voiceOpen&&osPage==='home'?hints():''}
   ${state?`<button class="lego-island island-${state.kind}" data-lego-activity="${state.page}" aria-label="${esc(state.label)}"><i></i>${esc(state.label)}</button>`:''}
   ${voiceOpen?panel():osPage==='home'&&!$('.lego-home')?presence():''}
  </div>`;
 }
 function navigateSpace(dir){if(voiceOpen)return;const page=DeviceNavigation.destinations[dir];if(page)osNavigate(page)}
 function bindGestures(){const frame=$('.os-frame');if(!frame)return;let drag=null;frame.addEventListener('pointerdown',e=>{const edge=e.target.closest('[data-lego-space]');if(!edge&&!e.target.matches('.lego-home'))return;drag={x:e.clientX,y:e.clientY,edge:edge?.dataset.legoSpace,target:e.target};drag.target.setPointerCapture?.(e.pointerId)});frame.addEventListener('pointermove',e=>{if(!drag)return;const dx=(e.clientX-drag.x)/osScale,dy=(e.clientY-drag.y)/osScale;const home=$('.lego-home');if(home)home.style.transform=`translate(${Math.max(-18,Math.min(18,dx*.12))}px,${Math.max(-18,Math.min(18,dy*.12))}px)`;frame.dataset.dragging='true'});frame.addEventListener('pointerup',e=>{if(!drag)return;const dir=E.gesture((e.clientX-drag.x)/osScale,(e.clientY-drag.y)/osScale,drag.edge);drag=null;frame.dataset.dragging='false';if($('.lego-home'))$('.lego-home').style.transform='';if(dir){suppressEdgeClickUntil=Date.now()+500;navigateSpace(dir)}});frame.addEventListener('pointercancel',()=>{drag=null;frame.dataset.dragging='false';if($('.lego-home'))$('.lego-home').style.transform=''})}
 function hydrate(){const id=pinId();if(!id||attempted.has(id))return;const i=osInstance(id);if(!i||i.s.status!=='idle')return;attempted.add(id);const cfg=i.doc.runtimeConfig||{};if((i.doc.template==='weather'&&cfg.lat!=null&&cfg.lon!=null)||(i.doc.template==='calendar'&&(cfg.calendarMode!=='live'||cfg.calendarId)))setTimeout(()=>{if(osData&&pinId()===id)osRun(id)},0)}
 function showVoice(){
  if(!voiceOpen){
   arrival=$('.kai-launch')?.getBoundingClientRect();
   kaiWakeUntil=performance.now()+kaiClipMs;
  }
  voiceOpen=true;
  newOutcome=false;
  seenOutcome=lastOutcome;
  renderOS();
 }
 function closeVoice(redraw=true){
  if(!voiceOpen)return false;
  kaiDismissUntil=performance.now()+kaiClipMs;
  voiceOpen=false;typing=false;
  if(!window.LegoMessages?.composing())window.PersonalAgent?.cancelCapture();
  if(redraw)renderOS();
  return true;
 }
 const originalNavigate=osNavigate;
 osNavigate=function(page,keepVoice=false){
  if(page==='voice'){if(!keepVoice||voiceOpen)showVoice();return;}
  if(!keepVoice)closeVoice(false);
  return originalNavigate(page);
 };
 const originalHome=osHome;
 osHome=function(){closeVoice(false);originalHome()};
 const originalRender=renderOS;
 renderOS=function(){
  const previousContent=$('.kai-content');if(previousContent)voiceScroll=previousContent.scrollTop;
  const input=$('#lego-voice-input'),focused=input&&document.activeElement===input;
  const requestedMode=input?.form?.dataset.mode;
  if(osData)voiceStyle=osData.settings.homeVoiceAvatar||'kai';
  originalRender();
  if(!osData)return;
  document.title='Lego OS · 模拟空间';
  const frame=$('.os-frame');
  if(!frame)return;
  frame.insertAdjacentHTML('beforeend',layer());
  window.LegoMessages?.mount(frame);
  frame.dataset.homePage=String(osPage==='home');
  $('.os-display')?.classList.toggle('lego-home-display',osPage==='home');
  $('.os-side')?.insertAdjacentHTML('beforeend','<button id="lego-home-settings">主页布局与语音形态</button>');
  $('#lego-home-settings').onclick=homeSettings;
  $('.os-controller-dock')?.insertAdjacentHTML('afterbegin',voiceDock());
  const form=$('#lego-voice-form'),field=$('#lego-voice-input');
  if(form&&field){
   const reply=form.dataset.mode==='message';
   field.oninput=()=>{if(reply)replyDraft=field.value;else{voiceDraft=field.value;typing=!!voiceDraft;updateFeedback()}};
   form.onsubmit=e=>{
    e.preventDefault();
    const text=field.value.trim();
    if(!text)return;
    if(reply){replyDraft='';LegoMessages.submitDraft(text)}
    else {voiceDraft='';typing=false;PersonalAgent.ask(text)}
   };
   if(focused&&requestedMode===form.dataset.mode&&!field.disabled)field.focus({preventScroll:true});
  }
  if(!window.LegoMessages?.composing())replyDraft='';
  const glass=$('.kai-hud .kai-awake');
  if(arrival&&glass&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const rect=glass.getBoundingClientRect();
   const x=(arrival.x+arrival.width/2-rect.x-rect.width/2)/osScale;
   const y=(arrival.y+arrival.height/2-rect.y-rect.height/2)/osScale;
   glass.animate([
    {transform:`translate(${x}px,${y}px) scale(${arrival.width/rect.width},${arrival.height/rect.height})`},
    {transform:'none'}
   ],{duration:320,easing:'cubic-bezier(.22,.8,.3,1)'});
  }
  arrival=null;
  scrollVoice();bindGestures();updateFeedback();window.LegoGamepad?.refreshFocus(false);hydrate();
 };
 window.LegoHomeUI={showVoice,closeVoice,scrollVoice,resetTurn(){voiceScroll=0;const content=$('.kai-content');if(content)content.scrollTop=0;},avatar:()=>orb('kai'),confirmVoice(){
  if(!voiceOpen)return false;
  void osToggleRecord();
  return true;
 }};
 const originalClick=osClick;
 osClick=async function(e){
  const host=e.target.closest('[data-kai-control]');
  if(host){
   const action=host.dataset.kaiControl;
   if(action==='wake'){if(window.LegoMessages?.focusOwned())LegoMessages.dismiss(false);showVoice()}
   else if(action==='hide')closeVoice();
   else if(action==='demo-message')LegoMessages.demo();
   else if(action==='reply-mic')LegoMessages.toggleMic();
   else if(action==='reply-sample')await LegoMessages.sample();
   return;
  }
  const control=e.target.closest('[data-lego]');
  if(control?.dataset.lego==='voice-open'){showVoice();return}
  const space=e.target.closest('[data-lego-space]');
  if(space){if(Date.now()>suppressEdgeClickUntil)navigateSpace(space.dataset.legoSpace);return}
  const activity=e.target.closest('[data-lego-activity]');
  if(activity){osNavigate(activity.dataset.legoActivity);return}
  await originalClick(e);
 };
 // Keyboard activation is equivalent to clicking an entire widget.
 document.addEventListener('keydown',e=>{const card=e.target.closest('.sv-widget[role=button]');if(card&&e.target===card&&['Enter',' '].includes(e.key)){e.preventDefault();card.click()}});
 function measure(){if(!osRecorder||!osRecordingStream){if(meter){meter.context.close().catch(()=>{});meter=null}return 0}try{if(!meter){const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(osRecordingStream).connect(analyser);meter={context,analyser,data:new Float32Array(256)}}meter.analyser.getFloatTimeDomainData(meter.data);return Math.min(1,Math.sqrt(meter.data.reduce((a,v)=>a+v*v,0)/meter.data.length)*6)}catch{return 0}}
 function updateFeedback(){
  if(!osData)return;
  const v=osVoiceState,playing=!!osAudioPlayer&&!osAudioPlayer.paused&&!osAudioPlayer.ended;
  const recording=!!osRecorder&&!window.LegoMessages?.composing();
  const now=performance.now();
  const nextPhase=E.phase(v,recording,playing,typing&&voiceOpen);
  phase=nextPhase;
  if(!v.busy&&!v.synthesizing&&(v.answer||v.error)){
   const outcome=`${v.timing?.started||''}|${v.answer}|${v.error}`;
   if(outcome!==lastOutcome){
    lastOutcome=outcome;
    if(voiceOpen){seenOutcome=outcome;newOutcome=false}
    else newOutcome=outcome!==seenOutcome;
   }
  }
  const layer=$('.lego-system-layer');
  if(layer){
   layer.dataset.voicePhase=phase;
   layer.dataset.screenAwake=String(GlassHome.awake);
   layer.dataset.moving=String(GlassHome.moving);
   layer.style.setProperty('--voice-energy',String(recording?measure():(measure(),typing?.45:.2)));
  }
  const title=$('[data-kai-phase]');
  if(title&&title.textContent!==phaseText[phase])title.textContent=phaseText[phase];
  const text=voiceActivity(),dockStatus=$('.kai-dock-status');
  if(dockStatus){
   if(dockStatus.textContent!==text)dockStatus.textContent=text;
   dockStatus.hidden=!text;
  }
  const launcher=$('.kai-launch');
  const mood=phase==='idle'&&now<kaiWakeUntil?'wake':phase;
  LegoKaiMotion.update('conversation',$('.kai-hud .kai-character'),mood);
  if(launcher){
   launcher.dataset.activity=v.busy||v.synthesizing?'working':newOutcome?'updated':'idle';
   launcher.setAttribute('aria-label',text?'语音助手：'+text:'语音助手');
  }
  const launcherMood=v.busy||v.synthesizing?phase:newOutcome?'updated':now<kaiDismissUntil?'dismiss':'idle';
  LegoKaiMotion.update('launcher',launcher?.querySelector('.kai-character'),launcherMood);
  LegoKaiMotion.update('message',$('.message-compose .kai-character'),'listening');
  const second=Math.floor(Date.now()/1000);
  const clocks=document.querySelectorAll('[data-lego-clock]');
  if(second!==clockSecond||[...clocks].some(el=>!el.dataset.clockReady)){
   clockSecond=second;
   if(clocks.length){
    const timeLabel=clock(),dateLabel=date();
    clocks.forEach(el=>{if(el.textContent!==timeLabel)el.textContent=timeLabel;el.dataset.clockReady='true'});
    document.querySelectorAll('[data-lego-date]').forEach(el=>{if(el.textContent!==dateLabel)el.textContent=dateLabel});
   }
  }
 }
 setInterval(updateFeedback,120);
 function homeSettings(){const choices=installed().filter(x=>x.widget&&x.mode!=='prototype'),id=pinId();modal('Lego OS · 主页设置',`<p>系统默认主页只保留一个固定服务摘要。其他服务通过四向空间抵达。自定义表盘保留已发布设计；此处不覆盖其图层。</p><label>固定看板<select id="lego-pin"><option value="">不固定服务</option>${choices.map(x=>`<option value="${esc(x.id)}" ${x.id===id?'selected':''}>${esc(x.release.name)}</option>`).join('')}</select></label><label>显示区域<select id="lego-layout"><option value="lower">下半屏 · 更多现实留白</option><option value="split" ${osData.settings.homeLayout==='split'?'selected':''}>上下结构</option></select></label><label>语音入口<select id="lego-avatar">${[['kai','Kai'],['orb','呼吸球'],['pet','宠物助手'],['halo','光环']].map(([v,n])=>`<option value="${v}" ${voiceStyle===v?'selected':''}>${n}</option>`).join('')}</select></label><p>录音、播报或高优先级事项仅在真实状态发生时显示。移动情境和熄屏仍由设备侧控制。</p>`,`<button id="lego-home-save" class="primary">保存设置</button>`);$('#lego-home-save').onclick=async()=>{osData.settings.homePinServiceId=$('#lego-pin').value||null;osData.settings.homeLayout=$('#lego-layout').value;osData.settings.homeVoiceAvatar=$('#lego-avatar').value;try{await persistOS();closeModal();renderOS()}catch(e){toast(e.message)}}}
})();
