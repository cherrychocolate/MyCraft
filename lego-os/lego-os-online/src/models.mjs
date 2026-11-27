import * as S from './store.mjs';
export const QWEN='model-957b320a-5b20-45e9-a877-17368e311c15', GEMINI='model-4f4d561e-3889-471c-b1c5-eef7e4f20a7c', IMAGE='model-ebbf5ddf-b015-4f7a-a021-6fdb9e9583bb';
export const providers={Qwen:'https://dashscope.aliyuncs.com/compatible-mode/v1',Gemini:'https://generativelanguage.googleapis.com/v1beta',DeepSeek:'https://api.deepseek.com'};
export function profiles(env){return [{id:QWEN,name:'百炼 · 个人助手',provider:'Qwen',model:'qwen3.8-omni-flash-realtime',baseUrl:providers.Qwen,env:'QWEN_API_KEY'},{id:GEMINI,name:'Gemini · 设计与视觉',provider:'Gemini',model:'gemini-4-carbon',baseUrl:providers.Gemini,env:'GEMINI_API_KEY'},{id:IMAGE,name:'Gemini · 图片生成',provider:'Gemini',model:'gemini-3.1-flash-image',baseUrl:providers.Gemini,env:'GEMINI_IMAGE_API_KEY'},{id:'model-legacy-deepseek',name:'DeepSeek · 可选',provider:'DeepSeek',model:'deepseek-v4-pro',baseUrl:providers.DeepSeek,env:'DEEPSEEK_API_KEY'}].map(p=>({...p,enabled:true,_revision:1,credentialConfigured:!!env[p.env],credentialLabel:'站点所有者托管 · 服务端保密',storage:'server',region:'cn',thinking:'auto'}))}
export async function settings(env,owner){const r=await S.get(env.DB,owner,'cloud-model-routing');return {chat:QWEN,design:GEMINI,vision:GEMINI,image:IMAGE,...r?.roles}}
export async function state(env,owner){const roles=await settings(env,owner);return {profiles:profiles(env).map(({env,...p})=>p),routing:roles,roles:{chat:'OS 对话',design:'设计',reasoning:'深度推演',vision:'视觉审查',image:'图片生成'},providers,calls:(await env.DB.prepare('SELECT body FROM runs WHERE owner=? ORDER BY created DESC LIMIT 40').bind(owner).all()).results.map(x=>JSON.parse(x.body)),credentialPolicy:'server-managed'}}
export async function requestJSON(url,body,headers={}){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(85000)});if(!r.ok)throw Error('远端返回 HTTP '+r.status+'；请检查模型权限、配额和区域');return r.json()}
export function decode(text){try{return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/,'').replace(/```\s*$/,''))}catch{throw Error('模型没有返回有效 JSON；未应用任何修改或动作')}}
async function realtime(env,p,messages){if(!env.QWEN_WORKSPACE_ID||!env.QWEN_API_KEY)throw Error('站点百炼实时凭据尚未配置');const workspace=env.QWEN_WORKSPACE_ID;if(!/^[a-zA-Z0-9-]{2,80}$/.test(workspace))throw Error('服务端业务空间配置无效');const res=await fetch('https://'+workspace+'.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model='+encodeURIComponent(p.model),{headers:{Upgrade:'websocket',Authorization:'Bearer '+env.QWEN_API_KEY},redirect:'manual'});const ws=res.webSocket;if(!ws)throw Error('百炼实时连接失败 HTTP '+res.status);ws.accept();return new Promise((resolve,reject)=>{let text='',settled=false;const finish=(e,v)=>{if(settled)return;settled=true;clearTimeout(timer);try{ws.close(1000,'done')}catch{}e?reject(e):resolve(v)};const timer=setTimeout(()=>finish(Error('实时模型响应超时；未使用预设回答')),80000);ws.addEventListener('message',e=>{try{const d=JSON.parse(e.data),type=d.type;if(type==='error')throw Error('百炼实时接口返回 '+(d.error?.code||d.error?.type||'error'));if(type==='session.created')ws.send(JSON.stringify({type:'session.update',session:{modalities:['text'],turn_detection:null,instructions:'遵守下列对话的system约束，只输出本轮回答。\n'+JSON.stringify(messages)}}));if(type==='session.updated'){ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:JSON.stringify(messages)}]}}));ws.send(JSON.stringify({type:'response.create'}))}if(type==='response.text.delta')text+=d.delta||'';if(type==='response.text.done'&&!text)text=d.text||'';if(type==='response.done'){if(d.response?.status==='failed'||!text.trim())throw Error('实时模型未返回有效文本');finish(null,{text,usage:d.response?.usage})}}catch(e){finish(e)}});ws.addEventListener('error',()=>finish(Error('实时模型连接中断')));ws.addEventListener('close',()=>{if(!settled)finish(Error('实时模型提前关闭连接'))})})}
export async function invoke(env,owner,messages,role='chat',profileId){const guest=S.isGuestWorkspace(owner);if(!guest)await S.quota(env.DB,owner);const roles=await settings(env,owner),p=profiles(env).find(p=>p.id===(profileId||roles[role]));if(!p?.credentialConfigured)throw Error('该模型没有配置服务端凭据；请联系站点所有者');const at=Date.now();try{let r;if(p.provider==='Gemini'){const raw=await requestJSON(p.baseUrl+'/models/'+encodeURIComponent(p.model)+':generateContent',{systemInstruction:{parts:[{text:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')}]},contents:messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{responseMimeType:'application/json'}},{'x-goog-api-key':env[p.env]});r={text:(raw.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(''),usage:raw.usageMetadata}}else if(p.provider==='Qwen')r=await realtime(env,p,messages);else{const raw=await requestJSON(p.baseUrl+'/chat/completions',{model:p.model,messages,stream:false},{Authorization:'Bearer '+env[p.env]});r={text:raw.choices?.[0]?.message?.content||'',usage:raw.usage}}if(!guest)await S.log(env.DB,owner,{type:'model-call',profileId:p.id,provider:p.provider,model:p.model,status:'succeeded',durationMs:Date.now()-at,usage:r.usage},env);return {...r,profileId:p.id,model:p.model,provider:p.provider}}catch(e){if(!guest)await S.log(env.DB,owner,{type:'model-call',profileId:p.id,model:p.model,status:'failed',error:e.message,durationMs:Date.now()-at},env);throw e}}
export async function voiceConfig(env,owner,p){let old=await S.get(env.DB,owner,'cloud-voice-config'),d=old||{id:'cloud-voice-config',region:'cn',asrModel:'qwen3-asr-flash',ttsModel:'qwen3-tts-flash',voice:'Cherry',autoSpeak:true,speechProfileId:QWEN};if(p){if(p.workspaceId||p.chatKey||p.speechKey)throw Error('线上凭据仅由站点所有者在服务端管理');if(p.expected!==(old?._revision||0))throw Error('语音配置已改变，请重新打开');d=await S.save(env.DB,owner,{...d,autoSpeak:!!p.autoSpeak,speechProfileId:QWEN},'internal-settings',old?._revision,env)}return {...d,revision:d._revision||0,workspaceConfigured:!!env.QWEN_WORKSPACE_ID,speechKeyConfigured:!!env.QWEN_API_KEY,profiles:profiles(env).filter(p=>p.provider==='Qwen').map(({id,name,model,credentialConfigured,credentialLabel})=>({id,name,model,credentialConfigured,credentialLabel}))}}
function audioDataURL(audio) {
 const chunks=[];
 for(let i=0;i<audio.length;i+=32768)chunks.push(String.fromCharCode(...audio.subarray(i,i+32768)));
 return 'data:audio/wav;base64,'+btoa(chunks.join(''));
}

function completeWave(chunks,byteCount){
 const audio=new Uint8Array(byteCount);
 let offset=0;
 for(const chunk of chunks){
  for(let i=0;i<chunk.length;i++)audio[offset+i]=chunk.charCodeAt(i);
  offset+=chunk.length;
 }
 const view=new DataView(audio.buffer);
 if(byteCount<44||view.getUint32(0)!==0x52494646||view.getUint32(8)!==0x57415645)throw Error('语音服务返回的音频格式无效');
 for(let i=12;i+8<=byteCount;){
  if(view.getUint32(i)===0x64617461){
   view.setUint32(4,byteCount-8,true);
   view.setUint32(i+4,byteCount-i-8,true);
   return audio;
  }
  const size=view.getUint32(i+4,true);
  i+=8+size+(size%2);
 }
 throw Error('语音服务未返回可播放的 WAV 数据');
}

async function guestSpeech(endpoint,payload,headers){
 const response=await fetch(endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/json','X-DashScope-SSE':'enable'},
  body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(55000)});
 if(!response.ok)throw Error('语音合成服务返回 HTTP '+response.status);
 if(!response.headers.get('Content-Type')?.includes('text/event-stream'))throw Error('语音服务未返回预期的音频流');
 const chunks=[];
 let byteCount=0;
 for(const line of (await response.text()).split('\n')){
  if(!line.startsWith('data:'))continue;
  const event=JSON.parse(line.slice(5));
  if(event.code)throw Error('语音合成服务未完成请求');
  const encoded=event.output?.audio?.data;
  if(!encoded)continue;
  const chunk=atob(encoded);
  byteCount+=chunk.length;
  if(byteCount>6000000)throw Error('合成音频过大');
  chunks.push(chunk);
 }
 return audioDataURL(completeWave(chunks,byteCount));
}

export async function speech(env,owner,kind,p){
 const guest=S.isGuestWorkspace(owner);
 if(!guest)await S.quota(env.DB,owner);
 if(!env.QWEN_API_KEY)throw Error('尚未配置服务端语音凭据');
 const cfg=await voiceConfig(env,owner);
 const base=env.QWEN_WORKSPACE_ID?'https://'+env.QWEN_WORKSPACE_ID+'.cn-beijing.maas.aliyuncs.com':'https://dashscope.aliyuncs.com';
 const headers={Authorization:'Bearer '+env.QWEN_API_KEY};
 if(kind==='asr'){
  const audio=p.audio;
  if(typeof audio!=='string'||!audio.startsWith('data:audio/wav;base64,')||audio.length>(guest?2700000:14000000)){
   throw Error(guest?'访客录音过长，请缩短录音后重试':'请提供10MB以内 WAV 音频');
  }
  const raw=atob(audio.split(',')[1]);
  if(raw.slice(0,4)!=='RIFF'||raw.slice(8,12)!=='WAVE')throw Error('录音不是有效 WAV');
  const r=await requestJSON(base+'/compatible-mode/v1/chat/completions',{
   model:cfg.asrModel,messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:audio}}]}],
   stream:false,asr_options:{enable_itn:true}
  },headers);
  const text=r.choices?.[0]?.message?.content;
  if(!text?.trim())throw Error('未识别出文字，请重试');
  return {text,model:cfg.asrModel,source:'真实 Qwen ASR'};
 }
 const text=String(p.text||'').trim(),limit=guest?500:5000;
 if(!text||text.length>limit)throw Error('播报须为 1 到 '+limit+' 字');
 const endpoint=base+'/api/v1/services/aigc/multimodal-generation/generation';
 const payload=part=>({model:cfg.ttsModel,input:{text:part,voice:cfg.voice,language_type:'Auto'}});
 const details={model:cfg.ttsModel,source:'真实 Qwen TTS',characters:text.length};
 if(guest)return {url:await guestSpeech(endpoint,payload(text),headers),...details};
 const urls=[];
 for(let offset=0;offset<text.length;offset+=500){
  const r=await requestJSON(endpoint,payload(text.slice(offset,offset+500)),headers);
  const audioURL=new URL(r.output?.audio?.url||'https://invalid.local');
  if(!audioURL.hostname.endsWith('.aliyuncs.com')||audioURL.username||audioURL.password)throw Error('语音提供商未返回可信音频地址');
  audioURL.protocol='https:';
  const response=await fetch(audioURL,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('合成音频读取失败');
  const bytes=await response.arrayBuffer(),mime=response.headers.get('Content-Type')||'audio/wav';
  if(bytes.byteLength>12000000)throw Error('合成音频过大');
  const id=crypto.randomUUID();
  await env.BUCKET.put(`audio/${owner}/${id}`,bytes,{httpMetadata:{contentType:mime},customMetadata:{created:String(Date.now())}});
  urls.push('/api/models/voice/audio?id='+id);
 }
 return {url:urls[0],urls,...details};
}
