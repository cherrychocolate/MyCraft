"""Bounded upstream SSE decoder. Only final content, never reasoning/tool deltas, is forwarded."""
import json,urllib.request,urllib.error,socket
import connections

def request(url,payload,headers,on_text,gemini=False):
 req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','Accept':'text/event-stream',**headers})
 text=[];usage={};total=0;data=[]
 def consume(lines):
  nonlocal usage
  raw='\n'.join(lines)
  if not raw or raw=='[DONE]':return
  try:event=json.loads(raw)
  except json.JSONDecodeError:raise ValueError('模型流返回了无效数据') from None
  if event.get('error'):raise ValueError('模型流返回错误，请检查模型连接')
  if gemini:
   delta=''.join(p.get('text','') for c in event.get('candidates',[]) for p in c.get('content',{}).get('parts',[]) if not p.get('thought'));usage.update(event.get('usageMetadata',{}))
  else:
   delta=''.join(c.get('delta',{}).get('content') or '' for c in event.get('choices',[]));usage.update(event.get('usage') or {})
  if delta:text.append(delta);on_text(delta)
 try:
  with urllib.request.build_opener(connections.NoRedirect).open(req,timeout=45) as response:
   for line in response:
    total+=len(line)
    if total>2_000_000:raise ValueError('模型流响应过大')
    line=line.decode('utf8').rstrip('\r\n')
    if not line:
     consume(data);data=[]
    elif line.startswith('data:'):data.append(line[5:].lstrip())
   if data:consume(data)
 except urllib.error.HTTPError as e:
  status=e.code;e.close();raise ValueError('模型流请求失败 HTTP '+str(status)+'，请检查连接配置或额度') from None
 except (urllib.error.URLError,TimeoutError,socket.timeout):raise ValueError('模型连接或流式响应超时，请重试') from None
 return ''.join(text),usage

class AnswerPreview:
 """Decode the first top-level answer string incrementally, without exposing action JSON."""
 def __init__(self):self.buffer='';self.shown=''
 def feed(self,delta):
  self.buffer+=delta
  # The schema fixes answer as a top-level field. Parse incomplete JSON strings safely.
  import re
  match=re.search(r'"answer"\s*:\s*"',self.buffer)
  if not match:return None
  raw=self.buffer[match.end():];out=[];i=0
  while i<len(raw):
   ch=raw[i]
   if ch=='"':break
   if ch=='\\':
    if i+1>=len(raw):break
    length=6 if raw[i+1]=='u' else 2
    if i+length>len(raw):break
    try:out.append(json.loads('"'+raw[i:i+length]+'"'))
    except json.JSONDecodeError:break
    i+=length
   else:out.append(ch);i+=1
  value=''.join(out)
  if value!=self.shown:self.shown=value;return value
  return None
