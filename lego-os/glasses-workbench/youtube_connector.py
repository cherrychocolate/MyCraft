"""Official YouTube public reads. Fixed upstream, Keychain secrets, bounded cache."""
import copy,html,json,re,socket,time,threading,uuid,urllib.request,urllib.parse,urllib.error
import connections
from datetime import datetime,timezone,timedelta
LOCK=threading.RLock()
ATOM={'id':'C_YOUTUBE_SEARCH','name':'YouTube · 官方视频搜索','category':'外部连接器','categoryId':'C','color':'#f04444','description':'YouTube Data API v3：公开可嵌入视频搜索，官方缩略图与播放器','input':'query, maxResults (1–10)','output':'ContentFeed','tags':['YouTube','官方 API','视频'],'status':'待授权','hardware':False,'scope':'service','selectable':True,'constraints':'需要已启用 YouTube Data API v3 的专用 API Key；消耗 Google 项目配额，不使用 Apify。账号关注/收藏需要另外的 OAuth。','example':'{"query":"AR glasses","maxResults":5}'}
def initialize(server):
 if not any(d['id']==ATOM['id'] for d in server.docs()):server.save(ATOM,'atom')
def config(server):return next((d for d in server.docs() if d['id']=='youtube-official-config'),{'id':'youtube-official-config'})
def public(server,vault):
 d=config(server)
 return {'configured':bool(d.get('credentialRef') and vault.has(d['credentialRef'])),'storage':'本机钥匙串','lastTest':d.get('lastTest'),'quotaNotice':'搜索消耗 Google 项目的每日 Search Queries 配额；本工具不购买额度。相同搜索缓存 10 分钟。'}
def save(server,vault,p):
 d=config(server);key=str(p.get('key','')).strip()
 if key:
  if not re.fullmatch(r'[A-Za-z0-9_-]{20,200}',key):raise ValueError('API Key 格式无效')
  ref='youtube-'+str(uuid.uuid4());vault.put(ref,key);d.update(credentialRef=ref,lastTest=None)
 server.save(d,'connector-config',d.get('_revision'));return public(server,vault)
def request(key,resource,params):
 url='https://www.googleapis.com/youtube/v3/'+resource+'?'+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers={'X-Goog-Api-Key':key,'Accept':'application/json'})
 try:
  with urllib.request.build_opener(connections.NoRedirect).open(req,timeout=25) as r:
   raw=r.read(2_000_001)
   if len(raw)>2_000_000:raise ValueError('YouTube 响应过大')
   return json.loads(raw)
 except urllib.error.HTTPError as e:
  status=e.code
  try:err=json.loads(e.read(16000)).get('error',{});reason=next(iter(err.get('errors',[])),{}).get('reason','')
  except Exception:reason=''
  finally:e.close()
  messages={'accessNotConfigured':'请先在密钥所属 Google 项目启用 YouTube Data API v3，等待数分钟后重试','quotaExceeded':'YouTube 项目今日配额已用尽，请明日重试或在 Google Cloud 检查配额','dailyLimitExceeded':'YouTube 项目今日配额已用尽','keyInvalid':'YouTube API Key 无效，请重新配置','ipRefererBlocked':'API Key 的来源限制拒绝此服务端请求，请检查密钥限制','commentsDisabled':'此视频已关闭评论','forbidden':'此 API Key 无权访问，请检查 API 限制及所属项目'}
  raise ValueError(messages.get(reason,f'YouTube HTTP {status}：请检查 API 启用状态、密钥限制及配额')) from None
 except (TimeoutError,socket.timeout,urllib.error.URLError):raise ValueError('YouTube 网络连接失败或超时，请检查当前网络后重试') from None
 except (json.JSONDecodeError,KeyError,TypeError):raise ValueError('YouTube 返回了无法解析的数据') from None

def search(server,vault,p):
 query=str(p.get('query','')).strip()
 if not 1<=len(query)<=200:raise ValueError('请输入 1–200 字符的搜索词')
 try:limit=int(p.get('maxResults',5))
 except (ValueError,TypeError):raise ValueError('结果数必须为 1–10')
 if not 1<=limit<=10:raise ValueError('结果数必须为 1–10')
 ranking=p.get('ranking','relevance')
 if ranking not in ('relevance','recent_popular'):raise ValueError('视频排序方式无效')
 order={}
 if ranking=='recent_popular':
  start=datetime.now(timezone.utc)-timedelta(days=7)
  order={'order':'viewCount','publishedAfter':start.strftime('%Y-%m-%dT00:00:00Z')}
 d=config(server);key=vault.get(d['credentialRef']) if d.get('credentialRef') else None
 if not key:raise ValueError('尚未配置 YouTube 官方 API Key，请打开“YouTube 官方 API”保存专用密钥')
 page=str(p.get('pageToken',''))
 if not re.fullmatch(r'[A-Za-z0-9_=-]{0,512}',page):raise ValueError('翻页参数无效')
 cache_parts=[query,limit,page,d.get('credentialRef')]
 if order:cache_parts.append(order)
 cache_id='youtube-cache-'+__import__('hashlib').sha256(json.dumps(cache_parts).encode()).hexdigest()
 # Serialize cache miss + write to prevent duplicate concurrent quota consumption.
 with LOCK:
  cached=next((x for x in server.docs() if x['id']==cache_id),None)
  if cached and time.time()-cached['feed']['at']<600 and not p.get('refresh'):return {**copy.deepcopy(cached['feed']),'cached':True}
  started=time.time()
  try:
   result=request(key,'search',{'part':'snippet','type':'video','videoEmbeddable':'true','videoSyndicated':'true','q':query,'maxResults':limit,**order,**({'pageToken':page} if page else {})})
   items=[]
   for row in result.get('items',[]):
    ident=row.get('id',{}).get('videoId','');sn=row.get('snippet',{})
    if not re.fullmatch(r'[\w-]{11}',ident):continue
    thumbs=sn.get('thumbnails',{});image=next((thumbs[k].get('url') for k in ('high','medium','default') if thumbs.get(k)),None)
    if image and not re.match(r'^https://(?:i\.ytimg\.com|i\d\.ytimg\.com)/',image):image=None
    items.append({'id':ident,'title':html.unescape(sn.get('title','')),'excerpt':html.unescape(sn.get('description','')),'url':'https://www.youtube.com/watch?v='+ident,'author':sn.get('channelTitle',''),'channelId':sn.get('channelId',''),'published':sn.get('publishedAt'),'media':{'images':[image] if image else [],'video':None},'sourcePlatform':'youtube'})
   feed={'type':'content-feed','platform':'youtube','query':query,'ranking':ranking,'pageSize':limit,'items':items,'source':'YouTube Data API v3 · 官方','at':time.time(),'cached':False,'nextPageToken':result.get('nextPageToken'),'limitations':['公开搜索结果，不代表个性化推荐；播放受网络、地区与版权限制。']}
   server.save({'id':cache_id,'feed':feed},'connector-cache',cached.get('_revision') if cached else None)
   server.log_run({'type':'youtube-api','status':'succeeded','operation':'search.list','itemCount':len(items),'durationMs':round((time.time()-started)*1000)})
   return feed
  except ValueError as e:
   server.log_run({'type':'youtube-api','status':'failed','operation':'search.list','error':str(e)})
   raise

def test(server,vault):
 d=config(server)
 try:
  # Read-only, low quota test; search is separately verified in service runtime.
  key=vault.get(d['credentialRef']) if d.get('credentialRef') else None
  if not key:raise ValueError('尚未配置 YouTube 官方 API Key')
  result=request(key,'videos',{'part':'snippet','id':'jNQXAC9IVRw','maxResults':1})
  if not result.get('items'):raise ValueError('鉴权请求完成但未返回测试视频，仍需服务搜索验证')
  t={'status':'passed','at':time.time(),'message':'官方 videos.list 鉴权与读取成功；请继续在服务内测试搜索与播放'}
 except ValueError as e:t={'status':'failed','at':time.time(),'message':str(e)}
 d['lastTest']=t;server.save(d,'connector-config',d.get('_revision'));server.log_run({'type':'youtube-api','operation':'videos.list','status':t['status'],'message':t['message']});return t


def detail(server,vault,p):
 ident=str(p.get('videoId',''))
 if not re.fullmatch(r'[\w-]{11}',ident):raise ValueError('视频 ID 无效')
 page=str(p.get('pageToken',''))
 if not re.fullmatch(r'[A-Za-z0-9_=-]{0,512}',page):raise ValueError('评论翻页参数无效')
 d=config(server);key=vault.get(d['credentialRef']) if d.get('credentialRef') else None
 if not key:raise ValueError('请先配置 YouTube 官方 API')
 cache_id='youtube-detail-'+__import__('hashlib').sha256(json.dumps([ident,page,d.get('credentialRef')]).encode()).hexdigest()
 with LOCK:
  cached=next((x for x in server.docs() if x['id']==cache_id),None)
  if cached and time.time()-cached['feed']['at']<600:return copy.deepcopy(cached['feed'])
  result={'at':time.time(),'comments':[],'nextPageToken':None}
  if not page:
   videos=request(key,'videos',{'part':'snippet','id':ident})
   if videos.get('items'):result['description']=videos['items'][0].get('snippet',{}).get('description','')
  try:
   rows=request(key,'commentThreads',{'part':'snippet','videoId':ident,'maxResults':20,'textFormat':'plainText',**({'pageToken':page} if page else {})})
   result['comments']=[{'id':r['id'],'author':r['snippet']['topLevelComment']['snippet'].get('authorDisplayName',''),'body':r['snippet']['topLevelComment']['snippet'].get('textDisplay',''),'replies':r['snippet'].get('totalReplyCount',0)} for r in rows.get('items',[])]
   result['nextPageToken']=rows.get('nextPageToken')
  except ValueError as e:result['commentError']=str(e)
  server.save({'id':cache_id,'feed':result},'connector-cache',cached.get('_revision') if cached else None)
  return result
