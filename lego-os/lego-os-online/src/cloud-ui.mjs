export function sessionScript(user,policy,guest){
 const safe=JSON.stringify({id:user?.id||'',manager:policy.manager,mode:policy.mode,usable:policy.usable,guest}).replace(/</g,'\\u003c');
 return `(function(){
 const account=${safe};
 window.LEGO_VIEWER_ID=account.id||'preview';
 window.LegoSite=Object.freeze({canSync:account.usable,guest:account.guest});
 const last=localStorage.getItem('mycraft-site-user');
 if(last!==account.id){['lego-agent-session','glasshouse-model-editor'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('mycraft-site-user',account.id)}
 const signIn='/signin-with-chatgpt?returnTo=%2F';
 const admin=location.pathname==='/workbench';
 if(!account.manager){
  const style=document.createElement('style');
  style.textContent='.os-top a[href^="/workbench"],.os-side [data-os="voice-config"],[data-kai-control="configure"],#mc-key-edit,#mc-add,[data-agent="config"]{display:none!important}';
  document.head.append(style);
 }
 function mount(){
  if(document.getElementById('mycraft-site-access'))return;
  const host=document.createElement('nav');
  host.id='mycraft-site-access';host.setAttribute('aria-label','试用账号');
  host.style='position:fixed;z-index:10000;bottom:12px;right:14px;display:flex;gap:8px;align-items:center;border-radius:18px;background:#fffffff0;color:#172320;padding:7px 11px;font:13px system-ui';
  const link=(label,href)=>{const a=document.createElement('a');a.textContent=label;a.href=href;a.target='_top';host.append(a)};
 if(!account.id){
  if(account.guest){const label=document.createElement('span');label.textContent='Kai 免登录试用';host.append(label)}
  link(account.guest?'登录':'登录试用',signIn);
 }
  else if(!account.usable){link('申请试用','/request-access');link('退出','/signout-with-chatgpt?returnTo=%2F')}
  else{
   if(account.manager){link(admin?'模拟空间':'工作台',admin?'/':'/workbench');link('访问管理','/access')}
   const importButton=document.createElement('button');
   importButton.type='button';importButton.textContent='导入日历';
   const file=document.createElement('input');file.type='file';file.accept='.ics,text/calendar';file.hidden=true;
   importButton.onclick=()=>file.click();
   file.onchange=async()=>{
    if(!file.files[0])return;
    importButton.disabled=true;
    try{
     const r=await fetch('/api/calendar-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ics:await file.files[0].text()})});
     const d=await r.json();if(!r.ok)throw Error(d.error);
     importButton.textContent='已导入 '+d.imported+' 项';
     importButton.title=d.repeating?'循环日程以导入文件中的首个日期为准':'';
    }catch(e){importButton.textContent=e.message}
    finally{importButton.disabled=false;file.value=''}
   };
   host.append(importButton,file);link('退出','/signout-with-chatgpt?returnTo=%2F');
  }
  document.body.append(host);
 }
 document.addEventListener('DOMContentLoaded',mount);
 })();`;
}
