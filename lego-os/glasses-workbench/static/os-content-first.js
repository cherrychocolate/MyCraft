/* Dashboard composition starts with its content; editing is a secondary action. */
(function(){if(typeof osDashboard!=='function')return;const dashboard=osDashboard;
osDashboard=function(){const tmp=document.createElement('div');tmp.innerHTML=dashboard();const grid=tmp.querySelector('.sv-widget-grid');if(grid){const first=grid.querySelector('[data-widget],button[data-launch]');first?.setAttribute('data-focus-default','true')}
const count=osVisibleNotifications().filter(n=>!n.read).length;
return `<section class="board-content"><header class="board-head"><h1>看板</h1><div><button data-page="notifications" aria-label="通知，${count}条未读">通知${count?' · '+Math.min(count,99):''}</button><button data-board-menu aria-label="看板更多选项">⋯</button></div></header>${grid?.outerHTML||'<p>还没有固定的看板。</p>'}</section>`};
const click=osClick;osClick=async function(e){if(e.target.closest('[data-board-menu]')){modal('看板选项','<button class="video-menu-item" data-manage-widgets>调整固定的看板</button>');$('#modal').querySelector('[data-manage-widgets]').onclick=ev=>{ev.preventDefault();ev.stopPropagation();osClick(ev)};LegoGamepad.refreshFocus(true);return}return click(e)};
})();
