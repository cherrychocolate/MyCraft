/* Stream only model answer text. Actions execute after the final validated result. */
(function(){
async function turn(payload,onEvent,signal){
 const response=await fetch(ModelCenter.assetURL('agent/stream'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
 if(!response.ok){
  const failure=await response.json().catch(()=>null);
  throw Error(failure?.error||'助手连接失败 HTTP '+response.status);
 }
 if(!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('助手连接没有返回流式响应');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
 function consume(block){let type='message',data=[];for(const line of block.split('\n')){if(line.startsWith('event:'))type=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart())}if(!data.length)return;const value=JSON.parse(data.join('\n'));if(type==='error')throw Error(value.error||'助手未完成');if(type==='result')result=value;onEvent(type,value)}
 try{for(;;){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+2)}if(part.done)break}if(buffer.trim())consume(buffer);if(!result)throw Error('助手连接中断，未收到完整结果');return result}finally{reader.releaseLock()}
}
window.AgentStream={turn};
})();
