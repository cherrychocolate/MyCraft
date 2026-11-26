/* A built-in browser surface. Websites keep their own origin and embedding restrictions. */
(function(root){
 const bookmarks=[
  {name:'小红书',url:'https://www.xiaohongshu.com/explore',mark:'小红书',color:'#e83b57'},
  {name:'哔哩哔哩',url:'https://www.bilibili.com/',mark:'bili',color:'#209bc7'},
  {name:'维基百科',url:'https://zh.wikipedia.org/',mark:'W',color:'#242b35'},
  {name:'必应',url:'https://www.bing.com/',mark:'b',color:'#167f8f'},
  {name:'GitHub',url:'https://github.com/',mark:'GH',color:'#292532'},
  {name:'YouTube',url:'https://www.youtube.com/',mark:'▶',color:'#e33232'}
 ];
 function normalize(value){
  let text=String(value||'').trim();if(!text)throw Error('请输入网址');
  if(!/^https?:\/\//i.test(text))text='https://'+text;
  let url;try{url=new URL(text)}catch{throw Error('网址格式无效，请输入完整的网址')}
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('只支持不含账号密码的 HTTP / HTTPS 网址');
  if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(host))throw Error('请使用公开网站域名');
  return url.href;
 }
 root.LegoBrowserURL={normalize};
 if(typeof osContent!=='function')return;
 let history=[],position=-1,voiceError='',recording=false;
 let controlsOpen=false;
 const current=()=>history[position]||'';

 function open(value){
  const url=normalize(value);
  history=history.slice(0,position+1);
  history.push(url);
  position++;
  controlsOpen=false;
  window.LegoHomeUI?.closeVoice(false);osNavigate('browser');
  return {url,opened:true,mode:'embedded-webview',limitation:'页面能否嵌入由网站决定，受限制时使用独立窗口打开'};
 }
 function setControls(view,open){
  controlsOpen=open;
  const panel=view.querySelector('.browser-controls');
  panel.hidden=!open;
  view.querySelector('iframe').inert=open;
  if(open)window.LegoGamepad?.refreshFocus(true);
  else view.focus({preventScroll:true});
 }
 function back(){
  const view=osPage==='browser'&&document.querySelector('.browser-webview');
  if(!view)return false;
  // Keep the same iframe mounted so toggling the bar preserves the page and its scroll position.
  setControls(view,!controlsOpen);
  return true;
 }
 function addressForm(url=''){
  return `<form id="browser-address-form">
   <input id="browser-address" aria-label="网址" type="text" inputmode="url" placeholder="输入网址" value="${esc(url)}" required>
   <button type="submit">前往</button>
  </form>`;
 }
 function webview(url){
  const host=new URL(url).host;
  const site=bookmarks.find(bookmark=>new URL(bookmark.url).host===host);
  return `<section class="browser-webview" aria-label="网页浏览" tabindex="-1">
   <iframe class="browser-page" src="${esc(url)}" title="${esc(site?.name||host)}" ${controlsOpen?'inert':''}
    sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>
   <nav class="browser-controls" aria-label="浏览器设置" ${controlsOpen?'':'hidden'}>
    <button type="button" data-browser="home" data-focus-default aria-label="浏览器主页">主页</button>
    <button type="button" data-browser="back" aria-label="上一网页" ${position<1?'disabled':''}>‹</button>
    <button type="button" data-browser="forward" aria-label="下一网页" ${position>=history.length-1?'disabled':''}>›</button>
    ${addressForm(url)}
    <button type="button" data-browser="reload" aria-label="刷新网页">↻</button>
    <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="在独立窗口打开" title="在独立窗口打开">↗</a>
   </nav>
  </section>`;
 }
 function render(){
  const url=current();
  if(url)return webview(url);
  return `<section class="browser-app" aria-label="浏览器">
   <header><h1>浏览器</h1><button data-browser="voice" aria-label="语音输入网址或网站名称">${recording?'停止录音':'语音'}</button></header>
   ${addressForm()}
   ${history.length?`<button type="button" class="browser-resume" data-browser="forward">继续浏览</button>`:''}
   ${voiceError?`<p class="browser-error" role="status">${esc(voiceError)}</p>`:''}
   <div class="browser-bookmarks">${bookmarks.map((bookmark,index)=>`<button data-browser-bookmark="${index}"><span style="color:${bookmark.color}!important">${bookmark.mark}</span><strong>${bookmark.name}</strong></button>`).join('')}</div>
  </section>`;
 }
 const content=osContent;osContent=function(){return osPage==='browser'?render():content()};
 window.LegoHandoffs?.entries.push({id:'browser',name:'浏览器',glyph:'link'});
 const previousRender=renderOS;renderOS=function(){
  previousRender();if(osPage!=='browser')return;
  const form=document.querySelector('#browser-address-form');
  if(!form)return;
  const input=form.querySelector('input');
  input.oninput=()=>input.setCustomValidity('');
  form.onsubmit=event=>{
   event.preventDefault();
   try{open(input.value)}
   catch(error){
    input.setCustomValidity(error.message);
    input.reportValidity();
   }
  };
 };
 const click=osClick;osClick=async function(event){
  const bookmark=event.target.closest('[data-browser-bookmark]');if(bookmark){open(bookmarks[Number(bookmark.dataset.browserBookmark)].url);return}
  const button=event.target.closest('[data-browser]');if(!button)return click(event);
  const action=button.dataset.browser;
  if(action==='home'){position=-1;controlsOpen=false;renderOS()}
  if(action==='back'&&position>0){position--;controlsOpen=false;renderOS()}
  if(action==='forward'&&position<history.length-1){position++;controlsOpen=false;renderOS()}
  if(action==='reload'){controlsOpen=false;renderOS()}
  if(action==='voice'){
   voiceError='';
   await osToggleRecord({state(state){recording=state==='listening';renderOS()},error(message){recording=false;voiceError=message;renderOS()},async done(blob){
    recording=false;try{const {text}=await PersonalAgent.recognizeSpeech(blob);if(!text?.trim())throw Error('没有识别到网站名称');LegoHomeUI.showVoice();await PersonalAgent.ask(text)}catch(e){voiceError=e.message;renderOS()}
   }});
  }
 };
 root.LegoBrowser={open,bookmarks,current,back};
})(globalThis);
