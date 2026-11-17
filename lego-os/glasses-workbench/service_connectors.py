"""Read-only service adapters. Credentials and auth device codes never enter project exports."""
import json,re,time,html,subprocess,shutil,threading,copy,hashlib,urllib.request,urllib.parse,urllib.error,xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser
CLI=shutil.which('lark-cli') or str(Path.home()/'.local/bin/lark-cli')
AUTH={}
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'GlasshouseWorkbench/0.4 personal-readonly'})
 with urllib.request.urlopen(req,timeout=25) as r:
  raw=r.read(3_000_001)
  if len(raw)>3_000_000:raise ValueError('响应过大，请缩小读取范围')
  return raw

MEDIA_HOSTS={'i.redd.it','preview.redd.it','external-preview.redd.it','i.imgur.com','v.redd.it','a.thumbs.redditmedia.com','b.thumbs.redditmedia.com'}
def media_url(value):
 if not isinstance(value,str):return None
 try:
  u=urllib.parse.urlparse(html.unescape(value));port=u.port
 except ValueError:return None
 if u.scheme!='https' or not u.hostname or u.username or u.password or (port and port!=443):return None
 if u.hostname not in MEDIA_HOSTS:return None
 return html.unescape(value)
class FeedMedia(HTMLParser):
 def __init__(self):super().__init__();self.images=[];self.video=None;self.video_page=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);src=media_url(a.get('src',''))
  if tag=='img' and src and src not in self.images:self.images.append(src)
  if tag in ('video','source') and src and urllib.parse.urlparse(src).path.lower().endswith(('.mp4','.webm')):self.video=src
  if tag=='a':
   link=media_url(a.get('href',''))
   if link and urllib.parse.urlparse(link).hostname=='v.redd.it':self.video_page=link
 def media(self):return {'images':self.images[:8],'video':self.video,'videoPage':self.video_page}
def reddit_json(data,sub):
 results=[]
 for row in data.get('data',{}).get('children',[]):
  d=row.get('data',{});images=[]
  for image in d.get('preview',{}).get('images',[]):
   url=media_url(image.get('source',{}).get('url',''))
   if url:images.append(url)
  for image in (d.get('media_metadata') or {}).values():
   url=media_url(image.get('s',{}).get('u',''))
   if url and url not in images:images.append(url)
  direct=media_url(d.get('url',''))
  if direct and urllib.parse.urlparse(direct).path.lower().endswith(('.jpg','.jpeg','.png','.gif','.webp')) and direct not in images:images.insert(0,direct)
  video=media_url((d.get('secure_media') or d.get('media') or {}).get('reddit_video',{}).get('fallback_url',''))
  # Native Reddit fallback streams may be video-only; do not promise a soundtrack.
  results.append({'id':d.get('name') or d.get('id'),'title':d.get('title',''),'url':'https://www.reddit.com'+d.get('permalink',''),'author':d.get('author',''),'published':d.get('created_utc'),'excerpt':d.get('selftext',''),'subreddit':d.get('subreddit',sub),'score':d.get('score'),'comments':d.get('num_comments'),'linkedUrl':d.get('url') if not d.get('is_self') else None,'media':{'images':[] if d.get('over_18') else images[:8],'video':None if d.get('over_18') else video,'videoPage':direct if d.get('is_video') else None,'sensitive':bool(d.get('over_18')),'videoAudio':'数据源视频流可能不包含音轨；完整播放请查看原帖' if video else ''}})
 return results
def _reddit(p,secrets=None):
 sub=str(p.get('subreddit','technology')).strip().removeprefix('r/')
 if not re.fullmatch(r'[A-Za-z0-9_]{2,30}',sub):raise ValueError('社区名只能包含字母、数字和下划线')
 sort=p.get('sort','hot')
 if sort not in ('hot','new','top'):raise ValueError('不支持的排序')
 source=p.get('redditSource','auto');token=(secrets or {}).get('Reddit')
 if source not in ('auto','oauth','rss'):raise ValueError('不支持的 Reddit 数据源')
 if source=='oauth' or (source=='auto' and token):
  if not token:raise ValueError('请在 Reddit 数据源中配置 OAuth Access Token')
  url=f'https://oauth.reddit.com/r/{sub}/{sort}?limit=25'
  request=urllib.request.Request(url,headers={'User-Agent':'web:GlasshouseWorkbench:0.5 (personal read-only)','Authorization':'Bearer '+token})
  with urllib.request.urlopen(request,timeout=25) as response:
   raw=response.read(3_000_001)
   if len(raw)>3_000_000:raise ValueError('帖子响应过大')
  items=reddit_json(json.loads(raw),sub);label='Reddit 认证 API · '+sort;limitations='媒体与票数来自认证 API；视频流是否包含音轨取决于数据源。'
 else:
  url=f'https://www.reddit.com/r/{sub}/{sort}.rss?limit=25'
  tree=ET.fromstring(fetch(url));ns={'a':'http://www.w3.org/2005/Atom'};items=[]
  for entry in tree.findall('a:entry',ns):
   link=entry.find('a:link',ns);content=entry.findtext('a:content','',ns);parser=FeedMedia();parser.feed(content)
   text=html.unescape(re.sub('<[^>]+>',' ',content));text=re.sub(r'\s+',' ',text).strip()
   items.append({'id':entry.findtext('a:id','',ns),'title':entry.findtext('a:title','',ns),'url':link.get('href','') if link is not None else '', 'author':entry.findtext('a:author/a:name','',ns),'published':entry.findtext('a:published','',ns),'excerpt':text[:1200],'subreddit':sub,'score':None,'comments':None,'media':parser.media()})
  label='Reddit 官方 RSS · '+sort;limitations='RSS 不提供完整评论、可靠票数和完整视频流。官方已公告 2026-11-13 停止 RSS，建议配置认证 API。'
 if not items:raise ValueError('该社区未返回可读取帖子；检查社区名或稍后重试')
 return {'type':'reddit','items':items,'source':label,'url':url,'at':time.time(),'limitations':limitations,'mediaCount':sum(bool(i.get('media',{}).get('images') or i.get('media',{}).get('video')) for i in items)}

REDDIT_CACHE={}
REDDIT_LOCK=threading.Lock()
def reddit(p,secrets=None):
 # One short read cache shared by OS and previews, to avoid duplicate upstream requests.
 identity=hashlib.sha256(str((secrets or {}).get('Reddit','')).encode()).hexdigest()[:16]
 key=(str(p.get('subreddit','technology')),str(p.get('sort','hot')),str(p.get('redditSource','auto')),identity)
 with REDDIT_LOCK:
  cached=REDDIT_CACHE.get(key);now=time.time()
  if cached and now-cached['at']<120:
   result=copy.deepcopy(cached);result['cached']=True;return result
  try:result=_reddit(p,secrets)
  except (urllib.error.HTTPError,urllib.error.URLError) as error:
   if cached and now-cached['at']<86400:
    result=copy.deepcopy(cached);result.update({'cached':True,'stale':True,'cacheReason':str(error)});return result
   if isinstance(error,urllib.error.HTTPError) and error.code==429:raise ValueError('Reddit 暂时限制读取（429）。请稍后重试，或在工作台配置认证 API；当前未展示伪造帖子。') from error
   raise
  REDDIT_CACHE[key]=copy.deepcopy(result)
  if len(REDDIT_CACHE)>40:REDDIT_CACHE.pop(next(iter(REDDIT_CACHE)))
  return result

def cities(p):
 name=str(p.get('name','')).strip()
 if len(name)<2:raise ValueError('请输入城市名称')
 return json.loads(fetch('https://geocoding-api.open-meteo.com/v1/search?'+urllib.parse.urlencode({'name':name,'count':8,'language':'zh'})))
def weather(p):
 if p.get('lat') is None or p.get('lon') is None:raise ValueError('尚未选择位置，请定位或搜索城市')
 lat=float(p['lat']);lon=float(p['lon'])
 if not -90<=lat<=90 or not -180<=lon<=180:raise ValueError('经纬度超出范围')
 args={'latitude':lat,'longitude':lon,'current':'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day','hourly':'temperature_2m,precipitation_probability,relative_humidity_2m,weather_code,is_day','daily':'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max','timezone':'auto','forecast_days':7}
 return {'type':'weather','source':'Open-Meteo 实时查询 · 数值天气模型','result':json.loads(fetch('https://api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(args))),'at':time.time(),'location':{'name':p.get('locationName') or '浏览器定位','lat':lat,'lon':lon}}
def cli(args,timeout=30):
 r=subprocess.run([CLI,*args],capture_output=True,text=True,timeout=timeout)
 try:d=json.loads(r.stdout if r.returncode==0 else r.stderr)
 except Exception:raise ValueError('飞书 CLI 响应无效，请检查本机安装与登录')
 if r.returncode or d.get('ok') is False:
  e=d.get('error',{});return {'ok':False,'error':{'message':e.get('message','飞书读取失败'),'missing_scopes':e.get('missing_scopes',[]),'hint':e.get('hint','')}}
 return d
def calendar(p):
 action=p.get('action','status')
 if action=='status':
  d=cli(['auth','status','--json','--verify']);u=d.get('identities',{}).get('user',{})
  return {'loggedIn':u.get('verified',False),'tokenStatus':u.get('tokenStatus'),'calendarScope':'calendar:calendar:read' in u.get('scope','').split(),'identity':'user'}
 if action=='list':return cli(['calendar','calendars','list','--as','user','--page-all','--page-limit','10','--format','json'])
 if action=='start':
  d=cli(['auth','login','--scope','calendar:calendar:read calendar:calendar.event:read','--no-wait','--json']);data=d.get('data',d);url=data.get('verification_url') or data.get('verification_uri_complete');code=data.get('device_code')
  if not url or not code:raise ValueError('授权地址未返回，请检查飞书应用权限设置')
  import uuid
  ident=str(uuid.uuid4());AUTH[ident]={'code':code,'at':time.time()};qr=Path('static/auth-qr');qr.mkdir(exist_ok=True)
  r=subprocess.run([CLI,'auth','qrcode',url,'--output',str(qr/(ident+'.png'))],capture_output=True,text=True,timeout=15)
  if r.returncode:raise ValueError('生成授权二维码失败')
  return {'id':ident,'url':url,'qr':'/auth-qr/'+ident+'.png'}
 if action=='finish':
  a=AUTH.get(p.get('id'))
  if not a or time.time()-a['at']>600:raise ValueError('授权已过期，请重新发起')
  d=cli(['auth','login','--device-code',a['code'],'--json'],timeout=35)
  if d.get('ok') is not False:AUTH.pop(p.get('id'),None)
  return {'ok':d.get('ok') is not False,'error':d.get('error')}
 raise ValueError('未知日历操作')


# Full public post reads and cursor pagination; fixed host and validated IDs only.
def reddit_read(p,secrets=None):
 sub=str(p.get('subreddit','technology')).removeprefix('r/').strip()
 if not re.fullmatch(r'[A-Za-z0-9_]{2,30}',sub):raise ValueError('社区名无效')
 ident=str(p.get('postId','')).removeprefix('t3_')
 after=str(p.get('after',''))
 if ident and not re.fullmatch(r'[a-zA-Z0-9]{3,16}',ident):raise ValueError('帖子 ID 无效')
 if after and not re.fullmatch(r't3_[a-zA-Z0-9]{3,16}',after):raise ValueError('翻页参数无效')
 sort=p.get('sort','hot')
 if sort not in ('hot','new','top'):raise ValueError('排序无效')
 token=(secrets or {}).get('Reddit');base='https://oauth.reddit.com' if token else 'https://www.reddit.com'
 children=p.get('children') or []
 if not isinstance(children,list) or len(children)>20 or any(not isinstance(x,str) or not re.fullmatch(r'[A-Za-z0-9]{3,16}',x) for x in children):raise ValueError('评论翻页参数无效')
 if children and not ident:raise ValueError('缺少帖子 ID')
 path='/api/morechildren' if children else f'/r/{sub}/comments/{ident}' if ident else f'/r/{sub}/{sort}'
 params={'api_type':'json','link_id':'t3_'+ident,'children':','.join(children),'raw_json':1} if children else {'limit':25,'raw_json':1,**({'after':after} if after else {})}
 url=base+path+('' if token else '.json')+'?'+urllib.parse.urlencode(params)
 headers={'User-Agent':'web:LegoOS:1.0 (personal read-only)'}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.build_opener(__import__('connections').NoRedirect).open(urllib.request.Request(url,headers=headers),timeout=25) as r:
   raw=r.read(3_000_001)
   if len(raw)>3_000_000:raise ValueError('内容过大，请稍后重试')
  data=json.loads(raw)
 except (urllib.error.HTTPError,urllib.error.URLError,json.JSONDecodeError) as e:
  if isinstance(e,urllib.error.HTTPError):e.close()
  raise ValueError('Reddit 暂时无法读取正文或下一页；需要可用的 Reddit API 授权或稍后重试。已保留现有内容。') from None
 if ident:
  post=None if children else next(iter(reddit_json(data[0],sub)),None);comments=[];remaining=[]
  def walk(rows,depth=0):
   for row in rows:
    d=row.get('data',{})
    if row.get('kind')=='more':remaining.extend(d.get('children',[]));continue
    if row.get('kind')!='t1':continue
    comments.append({'id':d.get('name'),'author':d.get('author',''),'body':d.get('body',''),'depth':depth,'score':d.get('score')})
    replies=d.get('replies')
    if depth<2 and isinstance(replies,dict):walk(replies.get('data',{}).get('children',[]),depth+1)
  walk(data.get('json',{}).get('data',{}).get('things',[]) if children else data[1].get('data',{}).get('children',[]))
  return {'post':post,'comments':comments,'nextChildren':remaining,'at':time.time()}
 return {'type':'reddit','items':reddit_json(data,sub),'after':data.get('data',{}).get('after'),'source':'Reddit','at':time.time()}
