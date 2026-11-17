/* Pure device navigation: desktop browser and gamepad use one focus policy. */
(function(root){const destinations={up:'controls',left:'quick',right:'hub',down:'center'};
function next(items,current,direction){if(!items.length)return null;const from=items.find(i=>i.id===current);if(!from)return items[0].id;const horizontal=direction==='left'||direction==='right',sign=direction==='left'||direction==='up'?-1:1;let winner=null,score=Infinity;for(const to of items){if(to.id===from.id)continue;const primary=((horizontal?to.x:to.y)-(horizontal?from.x:from.y))*sign;if(primary<=1)continue;const cross=Math.abs((horizontal?to.y:to.x)-(horizontal?from.y:from.x)),overlap=horizontal?Math.abs(to.y-from.y)<(to.h+from.h)/2:Math.abs(to.x-from.x)<(to.w+from.w)/2;const cost=primary+cross*(overlap?.25:2.5)+(overlap?0:200);if(cost<score){score=cost;winner=to.id}}return winner}
function quick(installed,selected){const ids=installed.map(s=>typeof s==='string'?s:s.id);return (Array.isArray(selected)?selected:ids.slice(0,3)).filter((id,i,a)=>ids.includes(id)&&a.indexOf(id)===i)}
function online(settings={}){return !settings.flightMode&&(settings.wifi!==false||settings.bluetooth!==false)}
root.DeviceNavigation={destinations,next,quick,online};
})(globalThis);
