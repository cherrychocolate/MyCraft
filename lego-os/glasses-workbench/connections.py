"""Observable, bounded read-only connection diagnostics. Never persist credentials."""
import re,copy, json, os, socket, ssl, subprocess, shutil, threading, time, uuid
import urllib.request, urllib.error, urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo
JOBS={}; LOCK=threading.RLock()
class DiagnosticError(Exception):
 def __init__(self,code,message,hint,status=None):super().__init__(message);self.code=code;self.hint=hint;self.status=status
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):return None

def request(url,payload=None,headers=None,*,timeout=25,max_bytes=2_000_000):
 req=urllib.request.Request(url,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json','User-Agent':'Glasshouse-Diagnostics/2',**(headers or {})})
 try:
  with urllib.request.build_opener(NoRedirect).open(req,timeout=timeout) as r:
   raw=r.read(max_bytes+1)
   if len(raw)>max_bytes:raise DiagnosticError('response_size','响应过大','测试接口应返回较小的JSON响应')
   try:return json.loads(raw)
   except Exception:raise DiagnosticError('invalid_json','服务可达，但响应不是有效 JSON','检查接口路径，确认不是登录页或代理错误页')
 except urllib.error.HTTPError as e:
  status=e.code;details={}
  try:details=json.loads(e.read(16000))
  except Exception:pass
  finally:e.close()
  err=details.get('error',details) if isinstance(details,dict) else {}
  upstream=str(err.get('code','')) if isinstance(err,dict) else ''
  upstream=upstream if re.fullmatch(r'[A-Za-z0-9_.-]{1,100}',upstream) else '' 
  hints={400:('invalid_request','请求参数不被接受','检查模型ID与接口格式'),401:('authentication','密钥无效或已过期','重新配置该供应商的有效密钥'),402:('billing','余额或计费状态异常','检查供应商账户余额和计费状态'),403:('permission','服务拒绝访问','检查权限、模型授权与地域限制'),404:('not_found','接口或模型不存在','核对模型ID及服务地址'),429:('rate_limit','请求受限','检查额度，稍后重试')}
  code,msg,hint=hints.get(status,('remote_error',f'远端 HTTP {status}','检查服务状态；重定向不会被自动跟随'))
  raise DiagnosticError(code,msg+(' · '+upstream if upstream else ''),hint,status)
 except (TimeoutError,socket.timeout):raise DiagnosticError('timeout',f'请求超时（{timeout}秒）','检查网络或代理，稍后重试')
 except urllib.error.URLError as e:
  if isinstance(e.reason,ssl.SSLCertVerificationError):raise DiagnosticError('tls','TLS证书校验失败','检查系统时间与可信证书；不会关闭证书验证')
  raise DiagnosticError('network','无法建立网络连接','检查DNS、网络、代理或目标服务状态')

def snapshot(ident):
 with LOCK:
  if ident not in JOBS:raise ValueError('测试记录已过期，请重新测试')
  return copy.deepcopy(JOBS[ident])
def start(p,secrets,providers,record):
 kind=p.get('kind');allowed=['model','calendar','weather','search','webhook']
 if kind not in allowed:raise ValueError('未知连接类型')
 ident=str(uuid.uuid4());now=time.time()
 with LOCK:
  if sum(x['status']=='running' for x in JOBS.values())>=6:raise ValueError('测试任务较多，请等待正在运行的测试结束')
  for k in list(JOBS):
   if now-JOBS[k]['startedAt']>3600:del JOBS[k]
  JOBS[ident]={'id':ident,'kind':kind,'provider':p.get('provider'),'model':p.get('model'),'status':'running','startedAt':now,'steps':[],'scope':'仅本次配置与测试时刻有效'}
 threading.Thread(target=run,args=(ident,dict(p),dict(secrets),dict(providers),record),daemon=True).start()
 return {'id':ident}
def run(ident,p,secrets,providers,record):
 started=time.monotonic();active=None
 def step(name,fn):
  nonlocal active
  active={'name':name,'status':'running','startedAt':time.time()}
  with LOCK:JOBS[ident]['steps'].append(active)
  t=time.monotonic();value=fn()
  with LOCK:active.update(status='passed',durationMs=round((time.monotonic()-t)*1000))
  return value
 def require(value,message):
  if not value:raise DiagnosticError('configuration',message,'补全配置后重新测试；保存配置不代表连接成功')
  return value
 try:
  kind=p['kind'];summary=''
  if kind=='model':
   provider=p.get('provider');base=step('检查供应商与模型配置',lambda:require(providers.get(provider),'请选择支持的供应商'))
   model=step('检查模型 ID',lambda:require(str(p.get('model','')).strip(),'缺少模型 ID'))
   key=step('检查凭据是否存在',lambda:require(secrets.get(provider) or os.environ.get(provider.upper()+'_API_KEY'),'尚未设置 API Key'))
   if provider=='Gemini':
    result=step('发送最小生成请求（验证鉴权与模型调用）',lambda:request(base+'/models/'+urllib.parse.quote(model,safe='')+':generateContent',{'contents':[{'parts':[{'text':'Reply with OK only.'}]}],'generationConfig':{'maxOutputTokens':64}},{'x-goog-api-key':key}))
    text=''.join(x.get('text','') for c in result.get('candidates',[]) for x in c.get('content',{}).get('parts',[]))
   else:
    result=step('发送最小生成请求（验证鉴权与模型调用）',lambda:request(base+'/chat/completions',{'model':model,'messages':[{'role':'user','content':'Reply with OK only.'}],'max_tokens':128},{'Authorization':'Bearer '+key}))
    text=''.join(c.get('message',{}).get('content') or '' for c in result.get('choices',[]))
   step('校验模型返回正文',lambda:require(text.strip(),'模型未返回可用正文，可能需要增加输出预算或更换模型'))
   summary='真实生成请求成功；鉴权、模型访问与正文响应通过。此测试可能产生少量调用费用。'
  elif kind=='weather':
   lat=float(p.get('lat',31.23));lon=float(p.get('lon',121.47))
   step('检查天气查询坐标',lambda:require(-90<=lat<=90 and -180<=lon<=180,'经纬度超出范围'))
   result=step('请求 Open-Meteo 天气 API',lambda:request('https://api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode({'latitude':lat,'longitude':lon,'current':'temperature_2m,relative_humidity_2m','timezone':'Asia/Shanghai'})))
   step('检查温度字段与数据时间',lambda:require(isinstance(result.get('current',{}).get('temperature_2m'),(int,float)) and result['current'].get('time'),'缺少天气数据字段'))
   summary=f"天气查询成功 · {result['current']['temperature_2m']}°C · 数据时间 {result['current']['time']}。这是主动查询 API，不是接收型 Webhook。"
  elif kind=='calendar':
   cli=step('检查本机飞书 CLI',lambda:require(shutil.which('lark-cli'),'未安装 lark-cli'))
   cal=step('检查测试日历 ID',lambda:require(str(p.get('calendarId','')).strip(),'请填写测试日历 ID；或明确填写 primary 读取主日历'))
   today=datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
   def calendar():
    r=subprocess.run([cli,'calendar','+agenda','--as','user','--calendar-id',cal,'--start',today+'T00:00:00+08:00','--end',today+'T23:59:59+08:00','--format','json'],capture_output=True,text=True,timeout=30)
    try:data=json.loads(r.stdout if r.returncode==0 else r.stderr)
    except Exception:raise DiagnosticError('cli_response','CLI 未返回有效 JSON','在本机检查 lark-cli 登录状态和应用配置')
    if r.returncode!=0 or data.get('ok') is not True:
     error=data.get('error',{});code=error.get('subtype') or error.get('type') or 'calendar_access'
     raise DiagnosticError(str(code),'飞书鉴权或日历访问未通过','检查用户登录、日历ID及日历读取权限；日历为空本身不代表失败')
    return data
   result=step('验证用户鉴权及指定日历读取权限',calendar)
   step('检查 CLI 成功信封',lambda:require('data' in result,'返回值缺少 data'))
   summary='指定日历读取成功。当天无日程也属于正常连接；诊断记录不保存日程正文。'
  elif kind=='search':
   key=step('检查 Tavily 凭据',lambda:require(secrets.get('Tavily') or os.environ.get('TAVILY_API_KEY'),'缺少 Tavily Key'))
   result=step('发送最小检索请求',lambda:request('https://api.tavily.com/search',{'query':'display glasses','max_results':1},{'Authorization':'Bearer '+key}))
   step('校验检索结果结构',lambda:require(isinstance(result.get('results'),list),'返回值缺少 results 数组'))
   summary='联网检索 API 可用；实际检索可能产生供应商费用。'
  else:
   url=str(p.get('url',''));u=urllib.parse.urlparse(url)
   step('检查 HTTPS 地址',lambda:require(u.scheme=='https' and u.hostname and not u.username and not u.password,'请输入无内嵌用户名密码的 HTTPS 地址'))
   # Only read-only public endpoints; no redirect or arbitrary POST payload.
   import ipaddress
   def public():
    addrs=socket.getaddrinfo(u.hostname,u.port or 443)
    require(all(ipaddress.ip_address(a[4][0]).is_global for a in addrs),'不支持本地或私有网络端点')
   step('校验公开网络地址',public)
   step('GET 读取探测（不发送业务事件）',lambda:request(url))
   summary='GET 与 JSON 返回通过。此结果不证明 POST Webhook 业务已执行，也不证明外部可回调本地。'
  with LOCK:JOBS[ident].update(status='passed',summary=summary)
 except Exception as e:
  if isinstance(e,subprocess.TimeoutExpired):e=DiagnosticError('timeout','飞书 CLI 查询超时','检查本机登录与网络后重试')
  if not isinstance(e,DiagnosticError):e=DiagnosticError('validation','连接测试未完成','检查输入参数或响应结构后重试')
  with LOCK:
   if active and active['status']=='running':active.update(status='failed',durationMs=round((time.time()-active['startedAt'])*1000))
   JOBS[ident].update(status='failed',error={'code':e.code,'message':str(e),'hint':e.hint,'httpStatus':e.status})
 finally:
  with LOCK:JOBS[ident].update(durationMs=round((time.monotonic()-started)*1000),finishedAt=time.time())
  try:record({'type':'connection-test','result':snapshot(ident),'source':'真实连接诊断'})
  except Exception:pass
