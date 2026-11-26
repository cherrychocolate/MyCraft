/* Notification HUD and local message-reply prototype. Speech uses the OS ASR connection. */
(function () {
  const queue = [];
  let notice = null, stage = '', engaged = false, draft = '', capture = '', error = '';
  let revision = 0, sentTimer, rendered;
  const demoAudio = '/assistant/sample-reply.wav';
  const focusedMode = () => window.LegoInputV2?.mode() === 'focus';

  function enqueue(message) {
    if (osData.settings.dnd && !message.demo) return;
    if (notice) {
      if (queue.length < 12 && !queue.some(item=>item.id===message.id)) queue.push(message);
      return;
    }
    notice = message;
    stage = 'edge';
    engaged = false;
    renderOS();
  }

  function demo() {
    const message = {id:uid(),title:'李晨',message:'下午三点在楼下咖啡厅碰面，可以吗？',demo:true};
    enqueue(message);
  }

  function dismiss(redraw=true) {
    clearTimeout(sentTimer);
    revision++;
    if (capture === 'listening' || capture === 'starting') window.PersonalAgent?.cancelCapture();
    notice = queue.shift() || null;
    stage = notice ? 'edge' : '';
    engaged = false;
    draft = capture = error = '';
    if (redraw) {
      renderOS();
      LegoGamepad.refreshFocus(focusedMode());
    }
  }

  function markRead() {
    const entry = osData.notifications.find(item=>item.id===notice?.id);
    if (entry && !entry.read) {
      entry.read = true;
      persistOS();
    }
  }

  function advance(next) {
    stage = next;
    engaged = true;
    renderOS();
    LegoGamepad.refreshFocus(focusedMode());
  }

  function startReply() {
    revision++;
    draft = capture = error = '';
    advance('compose');
  }

  function submitDraft(text) {
    const value = String(text||'').trim();
    if (!notice?.demo || stage!=='compose' || !value) return;
    draft = value.slice(0,550);
    capture = error = '';
    advance('review');
  }

  function finish(reply=false) {
    if (!notice || stage==='sent') return;
    if (reply) {
      if (!notice.demo || stage!=='review' || !draft) return;
      try {
        const key='lego-local-replies';
        const outbox=JSON.parse(localStorage.getItem(key)||'[]');
        outbox.push({id:notice.id,to:notice.title,text:draft,at:Date.now()});
        localStorage.setItem(key,JSON.stringify(outbox.slice(-30)));
      } catch {
        error='发送未保存，请重试';
        renderOS();
        return;
      }
      capture = 'sent';
    } else {
      markRead();
      capture = 'read';
    }
    advance('sent');
    sentTimer=setTimeout(()=>dismiss(),1800);
  }

  async function recognize(audio, request) {
    const result=await PersonalAgent.recognizeSpeech(audio);
    if (request!==revision || stage!=='compose') return;
    if (!result.text?.trim()) throw Error('没有识别到语音，请重试');
    submitDraft(result.text);
  }

  function fail(message,request) {
    if (revision!==request) return;
    capture='';
    error=String(message||'未能识别，请重试');
    renderOS();
  }

  async function sample() {
    if (stage!=='compose' || capture==='processing') return;
    if (capture==='listening'||capture==='starting') PersonalAgent.cancelCapture();
    const request=++revision;
    capture='processing';
    error='';
    renderOS();
    try {
      const response=await fetch(demoAudio);
      if (!response.ok) throw Error('示例音频加载失败');
      await recognize(new Blob([await response.arrayBuffer()],{type:'audio/wav'}),request);
    } catch(e) { fail(e.message,request); }
  }

  function toggleMic() {
    if (stage!=='compose'||capture==='processing'||capture==='starting') return;
    if (capture==='listening') {
      void osToggleRecord();
      return;
    }
    const request=++revision;
    capture='starting';
    error='';
    renderOS();
    void osToggleRecord({
      state(next) {
        if (revision!==request) return;
        capture=next;
        renderOS();
      },
      done:audio=>recognize(audio,request),
      error:message=>fail(message,request)
    });
  }

  function focusOwned(){return Boolean(notice && (engaged || stage!=='edge'))}

  function direction(dir) {
    if (stage!=='edge'||!focusedMode()||$('.lego-voice-panel,dialog[open],.os-overlay')) return false;
    if (!engaged) {
      if (osPage!=='home'||dir!=='right') return false;
      engaged=true;
    } else if (dir==='right') {
      return true;
    } else {
      engaged=false;
    }
    renderOS();
    LegoGamepad.refreshFocus(true);
    return true;
  }

  function confirm() {
    if (!focusOwned()||!focusedMode()) return false;
    if (stage==='compose') {
      toggleMic();
      return true;
    }
    return stage==='sent';
  }

  function back() {
    if (!focusOwned()) return false;
    if (stage==='compose'||stage==='review') {
      if (capture==='starting'||capture==='listening') PersonalAgent.cancelCapture();
      revision++;
      capture=draft=error='';
      advance('read');
    } else dismiss();
    return true;
  }

  function mount(frame) {
    if (!notice) {rendered=null;return}
    const signature=notice.id+':'+stage;
    const fresh=rendered!==signature;
    rendered=signature;
    const name=esc(notice.title), text=esc(notice.message);
    let content;
    if (stage==='edge') {
      content=`<button class="message-edge-button" data-message-action="open" data-focus-default aria-label="新消息：${name}">
        ${GlassGraphics.icon('news',29)}<span><b>${name}</b><small>新消息</small></span></button>`;
    } else if (stage==='read') {
      content=`<article class="message-card" aria-label="消息内容"><header>${GlassGraphics.icon('news',31)}<strong>${name}</strong></header>
        <p>${text}</p><div class="message-actions">
          <button data-message-action="read" ${notice.demo?'':'data-focus-default'}>标为已读</button>
          ${notice.demo?'<button class="message-primary" data-message-action="reply" data-focus-default>语音回复</button>':
            '<button data-message-action="open-source">打开来源</button>'}
        </div></article>`;
    } else if (stage==='compose') {
      const status={starting:'正在连接麦克风',listening:'正在聆听',processing:'正在识别语音'}[capture]||'可以说话了';
      content=`<div class="message-compose"><span class="kai-awake kai-glass">${LegoHomeUI.avatar()}</span><div class="message-caption"><b>回复 ${name}</b><span role="status">${esc(error||status)}</span></div></div>`;
    } else if (stage==='review') {
      content=`<article class="message-card" aria-label="回复预览"><header><strong>回复 ${name}</strong></header>
        <p>${esc(draft)}</p>${error?'<small role="status">'+esc(error)+'</small>':''}<div class="message-actions">
          <button data-message-action="reply">重录</button><button class="message-primary" data-message-action="send" data-focus-default>发送</button>
        </div></article>`;
    } else {
      content=`<p class="message-receipt" role="status">${GlassGraphics.icon('check',29)}${capture==='sent'?'回复已发送 · 本地演示':'已标为已读'}</p>`;
    }
    frame.insertAdjacentHTML('beforeend',`<section class="message-hud" data-message-stage="${stage}" data-owns-focus="${focusOwned()}" ${fresh?'data-arrived':''} style="zoom:${osScale}" aria-label="${stage==='edge'?'消息提示':'消息回复'}">${content}</section>`);
  }

  const click=osClick;
  osClick=function(event) {
    const button=event.target.closest('[data-message-action]');
    if (!button) return click(event);
    const action=button.dataset.messageAction;
    if (action==='open') {
      window.LegoHomeUI?.closeVoice(false);
      advance('read');
    } else if (action==='read') finish();
    else if (action==='reply') startReply();
    else if (action==='send') finish(true);
    else if (action==='open-source') {
      const id=notice?.serviceId;
      markRead();
      dismiss(false);
      if (id && osInstalled().some(item=>item.id===id)) void osLaunch(id);
      else osNavigate('notifications');
    }
  };

  window.LegoMessages={enqueue,demo,dismiss,mount,direction,confirm,back,submitDraft,toggleMic,sample,
    composing:()=>stage==='compose',capture:()=>capture,focusOwned};
})();
