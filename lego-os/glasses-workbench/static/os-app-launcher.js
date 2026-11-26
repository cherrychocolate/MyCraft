/* The focus order is circular. Its visible window is a centered hexagonal cluster. */
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
  const pairedSlots = [[1,0],[0,-1],[1,-1]];
  const opposite = ([q,r]) => [-q,-r];
  const distance = (q,r) => Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r));

  function slots(count) {
    const side = pairedSlots.slice();
    for (let radius=2;side.length<Math.floor(count/2);radius++) {
      if (radius>2) side.push([radius,-1]);
      for (let r=0;r> -radius;r--) if (r!==-1||radius===2) side.push([radius,r]);
      for (let q=radius;q>=0;q--) side.push([q,-radius]);
      for (let r=1-radius;r<0;r++) side.push([-radius-r,r]);
    }
    return side;
  }

  function layout(count) {
    const side=slots(count);
    function cell(index, selected) {
      const offset=(index-selected+count)%count;
      if (!offset) return [0,0];
      return offset<=count/2 ? side[offset-1] : opposite(side[count-offset-1]);
    }
    const cells=Array.from({length:count},(_,i)=>cell(i,0));
    const spanX=Math.max(1,...cells.map(([q,r])=>Math.abs(q+r/2)));
    const spanY=Math.max(1,...cells.map(([,r])=>Math.abs(r)));
    const {width,height}=osDisplaySize();
    const fit=Math.min(1,(width/2-52)/(148*spanX),(height/2-76)/(128*spanY));
    return {
      diameter:Math.min(height===600 ? 152 : 160,Math.round(148*fit*1.08)),
      position(index,selected) {
        const [q,r]=cell(index,selected);
        const depth=distance(q,r);
        return {x:(q+r/2)*148*fit,y:r*128*fit,
          scale:depth===0 ? 1 : Math.max(.48,.93/(1+depth*.26)),order:Math.max(1,32-depth)};
      }
    };
  }

  function catalog() {
    const installed=osInstalled();
    const calendars=installed.filter(app=>app.release.snapshot.template==='calendar');
    const calendar=calendars.find(app=>app.release.snapshot.runtimeConfig?.calendarMode==='live') || calendars[0];
    let apps=installed.filter(app=>app.release.snapshot.template!=='calendar'||app===calendar);
    const preferred=apps.find(app=>app.id===osData.settings.quickLaunchServiceId) ||
      apps.find(app=>app.release.snapshot.template==='weather') || apps[0];
    if (preferred) {
      const [left,up,down,right,upperRight,bottomLeft,...rest]=apps.filter(app=>app!==preferred);
      apps=[preferred,right,up,upperRight,...rest,bottomLeft,down,left].filter(Boolean);
    }
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
    result.splice(Math.ceil(result.length/2),0,...examples);
    return result;
  }

  function appButton(app,index,geometry) {
    const {x,y,scale,order}=geometry.position(index,0);
    const mark=app.glyph ? GlassGraphics.icon(app.glyph,62) :
      `<img src="/app-icons/${icons[app.kind]}" alt="" decoding="async">`;
    const destination=app.systemPage?`data-page="${esc(app.systemPage)}"`:`data-launch="${esc(app.id)}"`;
    return `<button class="os-app-orb orb-${app.kind}" ${destination} data-orbit-index="${index}" aria-label="${esc(app.name)}"
      ${app.preview?'data-preview-app':''} ${index===0?'data-focus-default data-centered':''}
      style="--orbit-x:${x}px;--orbit-y:${y}px;--orbit-scale:${scale};--orbit-order:${order}">
      <span class="os-app-orb-icon">${mark}</span>
    </button>`;
  }

  function center(button,{animate=true}={}) {
    const field=button.closest('.os-app-cluster');
    const icons=field.querySelectorAll('.os-app-orb');
    const previous=field.querySelector('[data-centered]');
    const motion=animate&&previous!==button&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    field.querySelector('.os-app-selection').textContent=button.getAttribute('aria-label');
    const selected=Number(button.dataset.orbitIndex), geometry=layout(icons.length);
    for (const icon of icons) {
      const {x,y,scale,order}=geometry.position(Number(icon.dataset.orbitIndex),selected);
      const travelling=motion&&(icon===previous||icon===button);
      icon.toggleAttribute('data-orbit-travel',travelling);
      if(motion&&!travelling&&icon.style.getPropertyValue('--orbit-x')!==x+'px'){
        icon.animate([{opacity:.7},{opacity:1}],{duration:145,easing:'ease-out'});
      }
      for (const [name,value] of Object.entries({x:x+'px',y:y+'px',scale,order})) {
        icon.style.setProperty('--orbit-'+name,value);
      }
      icon.toggleAttribute('data-centered',icon===button);
    }
  }

  function next(items,id,direction) {
    const orbs=items.filter(item=>item.el.matches('.os-app-orb'));
    const current=orbs.find(item=>item.id===id);
    if (!current) return orbs[0]?.id;
    const step={left:-1,right:1,up:2,down:-2}[direction];
    const index=(Number(current.el.dataset.orbitIndex)+step+orbs.length)%orbs.length;
    const target=orbs.find(item=>Number(item.el.dataset.orbitIndex)===index);
    if (!target || target===current) return null;
    const axis=direction==='left'||direction==='right' ? 'x' : 'y';
    const sign=direction==='left'||direction==='up' ? -1 : 1;
    // At small even counts the furthest position is shared, so an empty direction is a no-op.
    const delta=parseFloat(target.el.style.getPropertyValue('--orbit-'+axis));
    return delta*sign>0 ? target.id : null;
  }

  osCenter = function () {
    const apps=catalog();
    if (!apps.length) return '<p class="os-app-launcher-empty">暂无已安装应用</p>';
    const geometry=layout(apps.length);
    return `<div class="os-app-cluster" role="group" aria-label="应用入口" style="--app-diameter:${geometry.diameter}px">
      ${apps.map((app,index)=>appButton(app,index,geometry)).join('')}
      <span class="os-app-selection" aria-hidden="true">${esc(apps[0].name)}</span>
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

  window.LegoAppLauncher={center,next};
})();
