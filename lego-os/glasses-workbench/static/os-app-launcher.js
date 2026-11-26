/* Stable application slots with a rolling window of visible rows. */
(function () {
  const icons = {
    weather:'weather.svg', reddit:'reddit.png', youtube:'youtube.png'
  };
  const glyphs = {calendar:'calendar',video:'play',external:'link',custom:'grid'};
  const labels = {weather:'天气',calendar:'课表',reddit:'Reddit',youtube:'YouTube'};
  const previews = [
    ['地图','pin'],['相册','image'],['时钟','clock'],
    ['音乐','play'],['备忘','book'],['录音','voice'],['待办','check'],
    ['智能家居','home'],['提醒','bell'],['快捷指令','bolt'],
    ['文件','cube'],['连接','link'],['工具','grid'],['航班','arrow'],
    ['联系人','voice'],['发现','sun'],['睡眠','moon'],['实时雨况','rain']
  ];
  const landscape = () => window.LegoDisplay?.size().width === 800;
  let firstRow = 0;

  function catalog() {
    const installed=osInstalled();
    const calendars=installed.filter(app=>app.release.snapshot.template==='calendar');
    const calendar=calendars.find(app=>app.release.snapshot.runtimeConfig?.calendarMode==='live') || calendars[0];
    const apps=installed.filter(app=>app.release.snapshot.template!=='calendar'||app===calendar);
    const real=apps.map(({id,release})=>{
      const doc=release.snapshot;
      const youtube=doc.nodes?.some(node=>node.atomId==='C_YOUTUBE_SEARCH');
      const template=youtube ? 'youtube' : doc.template;
      const kind=Object.hasOwn(icons,template)||Object.hasOwn(glyphs,template) ? template : 'custom';
      const shortName=release.name.split(' · ')[0].trim().split(/\s+/).slice(0,2).join(' ');
      return {id,kind,glyph:glyphs[kind],name:labels[kind] || (release.mode==='prototype' ? '原型' : shortName)};
    });
    for (const entry of window.LegoHandoffs?.entries || []) {
      real.push({...entry,kind:entry.id,systemPage:entry.id});
    }
    if (!window.LegoDisplay?.samples()) return real;
    const result=real.slice(0,20);
    const examples=previews.slice(0,20-result.length).map(([name,glyph],i)=>({
      id:'preview-app-'+i,name,glyph,kind:'sample-'+i%5,preview:true
    }));
    return result.concat(examples);
  }

  function appButton(app,slot,first) {
    const mark=app.glyph ? GlassGraphics.icon(app.glyph,62) :
      `<img src="/app-icons/${icons[app.kind]}" alt="" decoding="async">`;
    const destination=app.systemPage?`data-page="${esc(app.systemPage)}"`:`data-launch="${esc(app.id)}"`;
    return `<button class="os-app-orb orb-${app.kind}" ${destination} data-app-slot="${slot}"
      aria-label="${esc(app.name)}" ${app.preview?'data-preview-app':''} ${first?'data-focus-default':''}>
      <span class="os-app-orb-icon">${mark}</span><span class="os-app-label">${esc(app.name)}</span>
    </button>`;
  }

  function revealRows(field, destination) {
    const rows=[...field.querySelectorAll('.os-app-row')];
    const visible=Number(field.dataset.visibleRows);
    const start=Math.max(0,Math.min(destination,rows.length-visible));
    if(start===firstRow)return false;
    firstRow=start;
    field.style.setProperty('--launcher-first-row',firstRow);
    for(const [i,row] of rows.entries())row.inert=i<firstRow||i>=firstRow+visible;
    field.querySelector('[data-focus-default]')?.removeAttribute('data-focus-default');
    rows[firstRow].firstElementChild?.setAttribute('data-focus-default','');
    return true;
  }

  function next(items,id,direction) {
    const icon=items.find(item=>item.id===id)?.el;
    const field=icon?.closest('.os-app-cluster');
    if(!field)return null;
    const slot=Number(icon.dataset.appSlot);
    const columns=Number(field.dataset.columns);
    const row=Math.floor(slot/columns), column=slot%columns;
    const dx=direction==='left'?-1:direction==='right'?1:0;
    const dy=direction==='up'?-1:direction==='down'?1:0;
    const targetRow=field.querySelectorAll('.os-app-row')[row+dy];
    if(!targetRow||column+dx<0||column+dx>=columns)return null;
    const target=targetRow.children[column+dx]||(dy?targetRow.lastElementChild:null);
    if(target&&targetRow.inert)revealRows(field,firstRow+dy);
    return target;
  }

  osCenter = function () {
    const apps=catalog();
    if(!apps.length)return '<p class="os-app-launcher-empty">暂无已安装应用</p>';
    const wide=landscape();
    const columns=wide?5:3;
    const total=Math.ceil(apps.length/columns);
    const visible=Math.min(total,wide?2:3);
    firstRow=Math.min(firstRow,total-visible);
    const rows=Array.from({length:total},(_,row)=>
      `<div class="os-app-row" ${row<firstRow||row>=firstRow+visible?'inert':''}>
        ${apps.slice(row*columns,(row+1)*columns).map((app,index)=>appButton(app,row*columns+index,row===firstRow&&index===0)).join('')}
      </div>`).join('');
    return `<div class="os-app-cluster" role="group" aria-label="应用入口" data-columns="${columns}" data-visible-rows="${visible}"
      style="--launcher-first-row:${firstRow};--launcher-columns:${columns};--launcher-visible-rows:${visible}">
      <div class="os-app-window"><div class="os-app-track">${rows}</div></div>
    </div>`;
  };

  const click=osClick;
  osClick=function (event) {
    const preview=event.target.closest('[data-preview-app]');
    if (preview) {
      modal(esc(preview.getAttribute('aria-label')),'<p>示例入口</p>');
      return;
    }
    return click(event);
  };

  let wheelAt=0,drag=null,suppressClickUntil=0;
  document.addEventListener('wheel',event=>{
    const field=event.target.closest('.os-app-cluster');
    if(!field||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
    event.preventDefault();
    if(Date.now()-wheelAt<260)return;
    wheelAt=Date.now();
    if(revealRows(field,firstRow+Math.sign(event.deltaY)))window.LegoGamepad?.refreshFocus(true);
  },{passive:false});
  document.addEventListener('pointerdown',event=>{
    const field=event.target.closest('.os-app-cluster');
    if(field&&event.isPrimary)drag={field,x:event.clientX,y:event.clientY};
  });
  document.addEventListener('pointerup',event=>{
    if(!drag)return;
    const {field,x,y}=drag;
    drag=null;
    const dx=event.clientX-x,dy=event.clientY-y;
    if(Math.abs(dy)<28||Math.abs(dy)<Math.abs(dx))return;
    if(revealRows(field,firstRow-Math.sign(dy)))window.LegoGamepad?.refreshFocus(true);
    suppressClickUntil=Date.now()+300;
  });
  document.addEventListener('pointercancel',()=>{drag=null});
  document.addEventListener('click',event=>{
    if(event.target.closest('.os-app-cluster')&&Date.now()<suppressClickUntil){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  window.LegoAppLauncher={next,reset(){firstRow=0;}};
})();
