/* Semantic input policy and bounded lifecycle labels, independent of browser UI. */
(function(root){
function route(mode,control,direction,page,overlay=false){
 if(control==='stick')return mode==='cursor'?'pointer':'media';
 if(control!=='dpad')return 'none';
 if(page==='center'&&!overlay)return 'focus';
 if(mode==='cursor')return 'media';
 return page==='home'&&!overlay?'space':'focus';
}
function nextIndex(length,index,direction,columns=1){const delta=(direction==='up'?-1:1)*Math.max(1,columns),next=index+delta;return next>=0&&next<length?next:null}
function lifecycle(active,busy,closed=false){return closed?'closed':active?'foreground':busy?'background-task':'retained'}
function ownsDirection(layout,direction,entered=false){if(entered)return 'child';if(layout==='waterfall')return direction==='up'||direction==='down'?'parent':'item';if(layout==='slides')return direction==='up'||direction==='down'?'item':'parent';return 'parent'}
root.LegoV2Engine={route,nextIndex,lifecycle,ownsDirection};
})(globalThis);
