"""Server-side Qwen realtime transport. Long-lived credentials never reach clients."""
import sys,json,time,re
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'.runtime/pythondeps'))
def address(p):
 workspace=str(p.get('workspaceId','')).strip()
 if not re.fullmatch(r'[A-Za-z0-9-]{2,80}',workspace):raise ValueError('实时语音需要 Workspace ID；请在模型配置填写百炼业务空间和区域')
 region='cn-beijing' if p.get('region','cn')=='cn' else 'ap-southeast-1'
 return f'wss://{workspace}.{region}.maas.aliyuncs.com/api-ws/v1/realtime?model='+p['model']
def text(p,messages,key,on_text=None):
 from websockets.sync.client import connect
 url=address(p);chunks=[];usage={};started=time.monotonic();first=None;deadline=started+75;timing={}
 try:
  with connect(url,additional_headers={'Authorization':'Bearer '+key},open_timeout=15,max_size=2_000_000) as ws:
   timing['connectMs']=round((time.monotonic()-started)*1000)
   def event():
    remain=deadline-time.monotonic()
    if remain<=0:raise TimeoutError('实时模型响应超时')
    e=json.loads(ws.recv(timeout=min(20,remain)))
    if e.get('type')=='error':
     err=e.get('error',{});code=err.get('code') or err.get('type','unknown');raise ValueError('百炼实时接口返回 '+str(code)+' · '+str(err.get('message',''))[:200].replace(key,'[REDACTED]'))
    return e
   while event().get('type')!='session.created':pass
   timing['sessionCreatedMs']=round((time.monotonic()-started)*1000)
   ws.send(json.dumps({'type':'session.update','session':{'modalities':['text'],'turn_detection':None,'instructions':'\n'.join(m['content'] for m in messages if m['role']=='system')}}))
   while event().get('type')!='session.updated':pass
   timing['sessionUpdatedMs']=round((time.monotonic()-started)*1000)
   ws.send(json.dumps({'type':'conversation.item.create','item':{'type':'message','role':'user','content':[{'type':'input_text','text':json.dumps([m for m in messages if m['role']!='system'],ensure_ascii=False)}]}}))
   ws.send(json.dumps({'type':'response.create'}))
   timing['requestSentMs']=round((time.monotonic()-started)*1000)
   while True:
    e=event();kind=e.get('type')
    if kind=='response.text.delta':
     delta=e.get('delta','');chunks.append(delta)
     if delta and first is None:first=round((time.monotonic()-started)*1000)
     if delta and on_text:on_text(delta)
    if kind=='response.text.done' and not chunks:chunks.append(e.get('text',''))
    if kind=='response.done':
     response=e.get('response',{});usage=response.get('usage',{})
     if response.get('status') in ('failed','cancelled','incomplete'):raise ValueError('实时生成未完成：'+str(response.get('status')))
     break
 except TimeoutError:raise ValueError('百炼实时连接或响应超时；没有退回虚拟回答')
 except ValueError:raise
 except Exception as e:
  status=getattr(getattr(e,'response',None),'status_code',None)
  raise ValueError('百炼 WebSocket 连接失败'+(' HTTP '+str(status) if status else '')+'；检查业务空间、区域、模型权限和网络') from None
 result=''.join(chunks)
 if not result.strip():raise ValueError('实时连接成功但未返回文本；当前诊断未证明业务可用')
 usage['transportTiming']={**timing,'firstTextMs':first,'totalMs':round((time.monotonic()-started)*1000)}
 return result,usage
