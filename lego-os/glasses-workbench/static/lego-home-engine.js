/* Pure rules shared by rendering, gestures and tests. */
(function(root){
 function selectPin(installed,settings={}){const choices=installed.filter(x=>x.widget&&x.mode!=='prototype');if(Object.hasOwn(settings,'homePinServiceId'))return choices.find(x=>x.id===settings.homePinServiceId)?.id||null;return choices.find(x=>x.template==='weather')?.id||choices.find(x=>x.template==='calendar')?.id||choices[0]?.id||null}
 function phase(v={},recording=false,playing=false,typing=false){if(recording)return 'listening';if(v.error)return 'error';if(playing)return 'speaking';if(v.synthesizing)return 'synthesizing';if(v.busy&&v.stage==='正在回答')return 'responding';if(v.busy)return /ASR|识别|转换/.test(v.stage||'')?'transcribing':'thinking';if(typing)return 'composing';if(v.answer)return 'answer';return 'idle'}
 function gesture(dx,dy,edge){if(Math.hypot(dx,dy)<48)return null;if(edge)return ({up:dy>36,left:dx>36,right:dx< -36,down:dy< -36})[edge]?edge:null;return Math.abs(dx)>Math.abs(dy)?(dx<0?'right':'left'):(dy>0?'up':'down')}
 function spatial(page){return ({controls:'up',quick:'left',hub:'right',dashboard:'right',notifications:'right',center:'down',app:'down'})[page]||'home'}
 function activity(recording,playing,instances=[],notifications=[]){if(recording)return {kind:'recording',label:'录音中',page:'voice'};if(playing)return {kind:'speaking',label:'正在播报',page:'voice'};const run=instances.find(x=>x.status==='running');if(run)return {kind:'working',label:run.name,page:'tasks'};const notice=notifications.find(x=>!x.read&&['high','urgent'].includes(x.priority));return notice?{kind:'priority',label:notice.title,page:'notifications'}:null}
 root.LegoHomeEngine={selectPin,phase,gesture,spatial,activity};
})(globalThis);
