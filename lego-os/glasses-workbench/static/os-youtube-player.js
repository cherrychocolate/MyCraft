/* YouTube provides the media. Lego OS owns focus, controls and playback feedback. */
(function () {
  const scripts = 'https://www.youtube.com/iframe_api';
  let apiRequest;
  let active;
  const labels = {
    play: '播放', back: '快退 10 秒', forward: '快进 10 秒',
    next: '下一条', captions: '字幕', sound: '开启声音', fill: '扩大画面'
  };
  const symbols = {play:'▶',back:'↶₁₀',forward:'↷₁₀',next:'⏭',captions:'CC',sound:'◖))',fill:'⛶'};
  function control(action, extra = '') {
    return `<button type="button" data-action="yt-${action}" aria-label="${labels[action]}" title="${labels[action]}" ${extra}><span aria-hidden="true">${symbols[action]}</span></button>`;
  }
  function render(post, nextAvailable, details) {
    return `<section class="lego-yt" data-video-id="${esc(post.id)}" data-has-next="${nextAvailable}">
      <header class="lego-yt-title"><b>${esc(post.title)}</b><small>${esc(post.author || '')}</small></header>
      <div class="lego-yt-screen"></div>
      <div class="lego-yt-transport">
        <div class="lego-yt-feedback"><span data-yt-state role="status">正在加载播放器…</span><time data-yt-time>0:00</time></div>
        <div class="lego-yt-progress" aria-hidden="true"><i></i></div>
        <nav aria-label="视频播控">
          ${control('back')}${control('play','data-focus-default')}${control('forward')}${control('next',nextAvailable?'':'disabled')}
          ${control('captions','aria-pressed="false"')}${control('sound','aria-pressed="false"')}${control('fill','aria-pressed="false"')}
        </nav>
        <div class="lego-yt-recovery" hidden>
          <a href="https://www.youtube.com/watch?v=${esc(post.id)}" target="_blank" rel="noopener noreferrer" data-focus-id="yt-original">在 YouTube 登录或播放 ↗</a>
        </div>
      </div>
      ${details}
    </section>`;
  }
  function renderList(items, query, saved, busy, official) {
    const tabs = `<nav class="glasstube-tabs" aria-label="GlassTube 导航">
      <button data-action="video-discover" aria-label="发现" aria-pressed="${!saved}"><span aria-hidden="true">▦</span>发现</button>
      <button data-action="video-search-open" aria-label="搜索视频"><span aria-hidden="true">⌕</span>搜索</button>
      <button data-action="video-library" aria-label="本地片库" aria-pressed="${saved}"><span aria-hidden="true">◆</span>片库</button>
    </nav>`;
    const topics = [['科技','Science and technology'],['设计','Product design'],['音乐','Live music']];
    const chips = !saved&&official?`<div class="glasstube-topics" aria-label="主题">${topics.map(([text,term])=>
      `<button data-action="video-topic" data-arg="${term}" aria-pressed="${query===term}">${text}</button>`).join('')}</div>`:'';
    const rows = items.map((item,index)=>`<article class="video-card"><button class="video-tile" data-action="video-detail"
      data-arg="${esc(VideoHub.key(item))}" ${index===0?'data-focus-default':''} aria-label="${esc(item.title)}">
      ${item.media?.images?.[0]?`<img class="video-thumbnail" src="${safeUrl(item.media.images[0])}" alt="" loading="lazy">`:'<span class="video-thumbnail video-no-cover" aria-hidden="true">▶</span>'}
      <span class="glasstube-copy"><strong>${esc(item.title)}</strong><span class="video-author">${esc(item.author||'')}</span></span>
    </button></article>`).join('');
    return `<section class="video-app" data-glasstube aria-busy="${busy}"><header class="glasstube-head">
      <img src="/app-icons/youtube.png" width="38" height="38" alt=""><h1>GlassTube</h1>
    </header>${tabs}${chips}<p class="glasstube-query">${saved?'本地收藏':esc(query)}</p>
    <div class="video-feed glasstube-feed">${rows||`<p>${busy?'正在查找视频…':saved?'片库还是空的':'暂无结果'}</p>`}</div>
    ${items.length?`<p class="video-end">${items.length} 条视频</p>`:''}</section>`;
  }
  function sdk() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiRequest) return apiRequest;
    apiRequest = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = scripts;
      tag.async = true;
      const timer = setInterval(() => {
        if (!window.YT?.Player) return;
        clearInterval(timer);
        clearTimeout(deadline);
        resolve(window.YT);
      }, 100);
      const fail = () => {
        clearInterval(timer);
        clearTimeout(deadline);
        tag.remove();
        reject(Error('无法连接 YouTube 播放器'));
      };
      const deadline = setTimeout(fail, 10000);
      tag.onerror = fail;
      document.head.append(tag);
    }).catch(e => { apiRequest = null; throw e; });
    return apiRequest;
  }
  function clock(seconds) {
    const t = Math.max(0, Math.floor(Number(seconds) || 0));
    return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  }
  function time(view) {
    const t = view.player?.getCurrentTime?.() || 0;
    const end = view.player?.getDuration?.() || 0;
    view.currentTime = t;
    view.root.querySelector('[data-yt-time]').textContent = end ? `${clock(t)} / ${clock(end)}` : clock(t);
    view.root.querySelector('.lego-yt-progress i').style.width = (end ? Math.min(100,t/end*100) : 0)+'%';
  }
  function message(view, state, text) {
    if (active !== view) return;
    view.state = state;
    view.root.dataset.playback = state;
    view.root.querySelector('[data-yt-state]').textContent = text;
    view.root.querySelector('.lego-yt-recovery').hidden = !['error','blocked'].includes(state);
    const toggle = view.root.querySelector('[data-action=yt-play]');
    const playing = state==='playing' || state==='buffering';
    const retry=state==='error'||state==='blocked';
    toggle.setAttribute('aria-label',retry?'重试播放':playing?'暂停':'播放');
    toggle.title=toggle.getAttribute('aria-label');
    if(toggle.classList.contains('device-focus'))window.LegoGamepad?.notify('焦点：'+toggle.title);
    toggle.firstElementChild.textContent=retry?'↻':playing?'❚❚':'▶';
    for (const action of ['back','forward','captions','sound']) {
      view.root.querySelector(`[data-action=yt-${action}]`).disabled = !view.ready || state==='error';
    }
  }
  function errorText(code) {
    if ([101,150].includes(code)) return '当前环境无法嵌入播放。可到 YouTube 登录或播放，也可切下一条。';
    if (code===100) return '这条视频已下架或设为私密。';
    return 'YouTube 暂时无法在这里播放。可重试、到原站验证登录，或切下一条。';
  }
  function deadline(view) {
    clearTimeout(view.deadline);
    view.deadline = setTimeout(() => {
      if (!['playing','paused','ended'].includes(view.state)) {
        message(view,'error','未收到开播反馈。YouTube 可能要求登录验证；可重试、到原站播放或切下一条。');
      }
    }, 12500);
  }
  function stop() {
    if (!active) return;
    const previous = active;
    active = null;
    clearTimeout(previous.deadline);
    clearInterval(previous.tick);
    previous.observer?.disconnect();
    previous.player?.destroy?.();
  }
  function start(view) {
    if (active!==view || !view.ready || !view.visible || !view.wantsPlay) return;
    view.wantsPlay = false;
    message(view,'loading','正在尝试播放…');
    deadline(view);
    view.player.playVideo();
  }
  async function connect(root, options = {}) {
    stop();
    const view = active = {root, ready:false, visible:false, wantsPlay:options.play!==false,
      muted:options.muted!==false, captions:!!options.captions, currentTime:options.start||0};
    message(view,'loading','正在加载播放器…');
    deadline(view);
    try {
      const YT = await sdk();
      if (active!==view || !root.isConnected) return;
      const frame = document.createElement('iframe');
      const params = new URLSearchParams({enablejsapi:1,origin:location.origin,playsinline:1,controls:0,start:Math.floor(view.currentTime)});
      if (view.captions) params.set('cc_load_policy','1');
      frame.src = 'https://www.youtube.com/embed/'+root.dataset.videoId+'?'+params;
      frame.title = 'YouTube 视频';
      frame.tabIndex = -1;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      root.querySelector('.lego-yt-screen').replaceChildren(frame);
      view.observer = new IntersectionObserver(([entry]) => {
        view.visible = entry.intersectionRatio >= .5;
        start(view);
      },{threshold:[.5]});
      view.observer.observe(frame);
      view.player = new YT.Player(frame,{events:{
        onReady(event) {
          if (active!==view) return;
          view.ready = true;
          if (view.muted) event.target.mute();
          else event.target.unMute();
          if (!view.wantsPlay) {clearTimeout(view.deadline); message(view,'paused','已就绪');}
          start(view);
        },
        onStateChange(event) {
          if (active!==view) return;
          const state = {0:['ended','播放完毕'],1:['playing','播放中'],2:['paused','已暂停'],3:['buffering','正在缓冲…']}[event.data];
          if (state) {
            if (event.data===3) deadline(view);
            else clearTimeout(view.deadline);
            message(view,...state);
          }
          time(view);
        },
        onError(event) {
          clearTimeout(view.deadline);
          message(view,'error',errorText(event.data));
        },
        onAutoplayBlocked() {
          clearTimeout(view.deadline);
          message(view,'blocked','浏览器拦住了自动播放。按确认再试，或在 YouTube 打开。');
        }
      }});
      view.tick = setInterval(() => { if(view.ready)time(view); },500);
      root.querySelector('[data-action=yt-captions]').setAttribute('aria-pressed',view.captions);
      updateSound(view);
    } catch(e) { clearTimeout(view.deadline); message(view,'error',e.message+'。可以重试或在 YouTube 播放。'); }
  }
  function updateSound(view) {
    const b=view.root.querySelector('[data-action=yt-sound]');
    b.setAttribute('aria-pressed',!view.muted);
    b.setAttribute('aria-label',view.muted?'开启声音':'静音');
    b.title=b.getAttribute('aria-label');
    b.firstElementChild.textContent=view.muted?'◖×':'◖))';
  }
  function exitFill() {
    const root=active?.root;
    if (!root?.hasAttribute('data-fill') || !root.isConnected) return false;
    root.removeAttribute('data-fill');
    const b=root.querySelector('[data-action=yt-fill]');
    b.setAttribute('aria-pressed',false);
    window.LegoGamepad?.focusElement(b);
    return true;
  }
  function action(button) {
    const root=button.closest('.lego-yt');
    if (active?.root!==root) return;
    const view=active, name=button.dataset.action.slice(3);
    if (name==='fill') {
      if (!exitFill()) {
        root.setAttribute('data-fill','');
        button.setAttribute('aria-pressed',true);
        window.LegoGamepad?.focusElement(button);
      }
      return;
    }
    if (name==='play'&&view.state==='error') {
      connect(root,{captions:view.captions,muted:view.muted,start:view.currentTime});
      window.LegoGamepad?.focusElement(root.querySelector('[data-action=yt-play]'));
      return;
    }
    if (!view.ready) return;
    if (name==='play') {
      if (['playing','buffering'].includes(view.state)) view.player.pauseVideo();
      else {view.wantsPlay=true;start(view);}
    } else if (name==='back' || name==='forward') {
      const end=view.player.getDuration() || Infinity;
      view.player.seekTo(Math.max(0,Math.min(end,view.player.getCurrentTime()+(name==='back'?-10:10))),true);
      time(view);
    } else if (name==='sound') {
      view.muted=!view.muted;
      if(view.muted)view.player.mute();
      else view.player.unMute();
      updateSound(view);
    } else if (name==='captions') {
      // The documented IFrame parameter forces captions on; unset follows YouTube preferences.
      const captions=!view.captions;
      connect(root,{captions,muted:view.muted,start:view.player.getCurrentTime(),play:['playing','buffering'].includes(view.state)});
      window.LegoGamepad?.notify(captions?'已请求显示 YouTube 字幕（视视频可用性）':'字幕跟随 YouTube 默认设置');
    }
  }
  const previousRender = renderOS;
  renderOS = function () {
    const before=active?.root;
    const state=active && {start:active.currentTime,muted:active.muted,captions:active.captions,play:['playing','buffering','loading'].includes(active.state)};
    const filled=before?.hasAttribute('data-fill');
    previousRender();
    const root=$('.os-display .lego-yt');
    if (!root || $('.kai-hud')) { stop(); return; }
    if (root===before) return;
    if (before?.dataset.videoId===root.dataset.videoId && filled) root.setAttribute('data-fill','');
    const details=root.querySelector('.lego-yt-details');
    const comments=root.querySelector('[data-yt-comments]');
    if (details&&comments) details.addEventListener('toggle',async () => {
      if (!details.open || comments.dataset.loaded) return;
      comments.dataset.loaded='pending';
      comments.textContent='正在加载评论…';
      try {
        const result=await connectorAPI('youtube/detail',{videoId:root.dataset.videoId});
        if (!root.isConnected) return;
        comments.innerHTML=window.ContentStreams.comments(result);
        comments.dataset.loaded='true';
        const description=details.querySelector(':scope > p');
        if (description&&result.description) description.textContent=result.description;
      } catch(error) {
        comments.textContent=error.message+'。可收起后重试。';
        delete comments.dataset.loaded;
      }
    });
    connect(root,before?.dataset.videoId===root.dataset.videoId?state:undefined);
  };
  function navigateFocus(item, candidates, direction) {
    const source=item?.closest('[data-glasstube],.lego-yt');
    if (!source) return null;
    const selectors=source.matches('.lego-yt')?
      ['.lego-yt-transport nav','.lego-yt-recovery','.lego-yt-details']:
      ['.glasstube-tabs','.glasstube-topics','.glasstube-feed','[data-action=stream-video-more]'];
    const groups=selectors.map(selector=>candidates.filter(x=>source.contains(x.el)&&x.el.closest(selector))).filter(group=>group.length);
    const current=groups.findIndex(group=>group.some(x=>x.el===item));
    if (current<0) return null;
    const row=groups[current], index=row.findIndex(x=>x.el===item);
    const step=direction==='up'||direction==='left'?-1:1;
    if(source.matches('[data-glasstube]')&&item.closest('.glasstube-feed')){
      if (direction==='left'||direction==='right') return {target:null};
      if(row[index+step])return {target:row[index+step]};
    } else if(direction==='left'||direction==='right') return {target:row[index+step]};
    const adjacent=groups[current+step], anchor=row[index];
    return {target:adjacent?.reduce((best,x)=>!best||Math.abs(x.x-anchor.x)<Math.abs(best.x-anchor.x)?x:best,null)};
  }
  function mediaCommand(command) {
    const root=active?.root;
    const button=root?.querySelector(`[data-action=yt-${{play:'play',next:'next',prev:'back'}[command]}]`);
    if (!root?.isConnected || !button) return false;
    if (button.disabled) window.LegoGamepad?.notify(command==='next'?'原列表已看完':'播放器暂不可用');
    else button.click();
    return true;
  }
  window.LegoYouTubePlayer={render,renderList,action,exitFill,mediaCommand,navigateFocus};
})();
