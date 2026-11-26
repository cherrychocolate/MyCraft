/* Focus owns one navigation layer. Pointer inputs share Back and scroll semantics. */
(function(){if(typeof renderOS!=='function')return;
let lastPointer={x:0,y:0},drag=null;
function display(){return $('.os-display')}
function scrollRoot(sign, point=lastPointer){
 const layer=$('.video-fullscreen-layer')||($('#modal')?.open ? $('#modal') : $('.lego-voice-panel'))||display();
 if(!layer)return null;
 let hit=document.elementFromPoint(point.x,point.y);
 if(!layer.contains(hit))hit=layer;
 for(let node=hit;node&&layer.contains(node);node=node.parentElement){
  const remaining=node.scrollHeight-node.clientHeight;
  if(remaining>2&&/auto|scroll/.test(getComputedStyle(node).overflowY)&&(sign>0?node.scrollTop<remaining-2:node.scrollTop>1))return node;
 }
 return null;
}
function scrollPage(sign,point=lastPointer,distance){
 const root=scrollRoot(sign,point);
 if(root)root.scrollBy({top:sign*(distance??Math.max(120,root.clientHeight*.7)),behavior:'auto'});
}
function exit(){const immersive=$('.video-fullscreen-layer button');if(immersive)return immersive.click();LegoGamepad.back()}
const back=LegoGamepad.back;LegoGamepad.back=function(){const close=$('.video-fullscreen-layer button');if(close)return close.click();return back()};
function nav(){const frame=$('.os-frame');if(!frame||$('#cursor-navigation'))return;frame.insertAdjacentHTML('beforeend',`<nav id="cursor-navigation" aria-label="页面控制"><button data-cursor-nav="back" aria-label="返回上一层">‹</button><button data-cursor-nav="up" aria-label="向上翻页">↑</button><button data-cursor-nav="down" aria-label="向下翻页">↓</button><button data-cursor-nav="system" aria-label="系统快捷面板">⌘</button></nav>`);$('#cursor-navigation').onclick=e=>{const a=e.target.closest('[data-cursor-nav]')?.dataset.cursorNav;if(a==='back')exit();else if(a==='up'||a==='down')scrollPage(a==='up'?-1:1);else if(a==='system')LegoInputV2.systemPanel()}}
const render=renderOS;renderOS=function(){render();nav();const active=osPage==='app'?osInstance(osActive):null;if(active?.s.refreshing){const progress=document.createElement('div');progress.className='service-refresh-progress';progress.setAttribute('role','status');progress.innerHTML='<i></i>正在更新';$('.os-frame')?.append(progress)}const d=display();if(!d)return;d.querySelectorAll('.sv-overline,.sv-feed-source,.sv-data-note').forEach(x=>x.remove());d.querySelectorAll('.lego-mini-widget small').forEach(x=>{if(/真实飞书|服务摘要/.test(x.textContent))x.remove()});d.querySelectorAll('small').forEach(x=>{if(/发布 v|静态环境|软件模拟|非 AI 摘要|原型 v/.test(x.textContent))x.remove()});};
document.addEventListener('contextmenu',e=>{if(!e.target.closest('.os-frame,#modal'))return;e.preventDefault();exit()});
let suppressClick=false;
document.addEventListener('pointerdown',e=>{
 drag=null;suppressClick=false;
 if(window.LegoInputV2?.mode()!=='cursor'||e.button!==0||e.pointerType==='touch'||!e.target.closest('.os-display,.lego-voice-panel')||e.target.closest('input,textarea,select,video,iframe'))return;
 drag={x:e.clientX,y:e.clientY,lastY:e.clientY,moved:false,pointerId:e.pointerId};
});
document.addEventListener('pointermove',e=>{
 lastPointer={x:e.clientX,y:e.clientY};
 if(!drag||drag.pointerId!==e.pointerId||!(e.buttons&1))return;
 if(!drag.moved&&Math.abs(e.clientY-drag.y)<8)return;
 const distance=drag.lastY-e.clientY;
 if(distance){
  drag.moved=true;
  scrollPage(Math.sign(distance),drag,Math.abs(distance)/(osScale||1));
  drag.lastY=e.clientY;
 }
});
document.addEventListener('pointerup',e=>{
 if(drag?.pointerId!==e.pointerId)return;
 suppressClick=drag.moved;drag=null;
 if(suppressClick)setTimeout(()=>{suppressClick=false},0);
});
document.addEventListener('click',e=>{
 if(!suppressClick||!e.target.closest('.os-display,.lego-voice-panel'))return;
 suppressClick=false;e.preventDefault();e.stopImmediatePropagation();
},true);
document.addEventListener('pointercancel',()=>{drag=null;suppressClick=false});
const notify=osNotify;
osNotify=function(title,message,serviceId){
 if(message==='服务已就绪'||message==='服务执行失败，请查看运行详情')return;
 notify(title,message,serviceId);
 window.LegoMessages?.enqueue(osData.notifications[0]);
};
window.LegoUX={scrollPage,back:exit};
})();
