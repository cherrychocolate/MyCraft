"""Apify registry and bounded asynchronous Actor execution. No token enters a draft."""
import json,time,uuid,threading,re,urllib.parse,copy,hashlib
from pathlib import Path
import connections
ROOT=Path(__file__).resolve().parent
BASE='https://api.apify.com/v2'
LOCK=threading.RLock()
def registry():
 actors={a['actor']:a for a in json.loads((ROOT/'data/apify-actors.json').read_text())}
 entries=[]
 def add(platform,actor,operation,title,defaults,fields):
  a=actors[actor];schema=a.get('inputSchema') or {};properties=schema.get('properties',{})
  defaults=copy.deepcopy(defaults)
  for field in schema.get('required',[]):
   if field not in defaults and 'default' in properties.get(field,{}):defaults[field]=properties[field]['default']
  entries.append({'id':'C_APIFY_'+platform.upper()+'_'+operation.upper().replace('-','_'),'provider':'Apify','platform':platform,'operation':operation,'name':title,'actor':actor,'actorId':a['actorId'],'inputSchema':schema,'fields':{k:properties[k] for k in fields if k in properties},'defaults':defaults,'source':'https://apify.com/'+actor+'/input-schema','verifiedAt':a['readAt']})
 add('reddit','trudax/reddit-scraper','posts','Reddit · 帖子读取',{'startUrls':[{'url':'https://www.reddit.com/r/technology/'}],'skipComments':True,'maxItems':5,'maxPostCount':5,'includeMediaLinks':True},['startUrls','searches','sort','maxItems','maxPostCount'])
 add('reddit','trudax/reddit-scraper','search','Reddit · 关键词搜索',{'searches':['AR glasses'],'searchPosts':True,'skipComments':True,'maxItems':5,'maxPostCount':5},['searches','searchCommunityName','sort','maxItems'])
 add('reddit','trudax/reddit-scraper','comments','Reddit · 评论读取',{'startUrls':[],'skipComments':False,'maxComments':5,'maxItems':5},['startUrls','maxComments','sort'])
 for op,name,default,fields in [('search','YouTube · 视频搜索',{'searchQueries':['AR glasses'],'maxResults':5},['searchQueries','maxResults','sortingOrder']),('videos','YouTube · 视频详情',{'startUrls':[],'maxResults':5},['startUrls','maxResults']),('transcript','YouTube · 字幕读取',{'startUrls':[],'maxResults':1,'transcriptionAndSubtitle':'ALWAYS_SUBTITLES'},['startUrls','transcriptionAndSubtitle','subtitlesLanguage'])]:add('youtube','streamers/youtube-scraper',op,name,default,fields)
 for op,name in [('posts','帖子'),('details','资料'),('comments','评论')]:add('instagram','apify/instagram-scraper',op,'Instagram · '+name,{'directUrls':[],'resultsType':op,'resultsLimit':5},['directUrls','resultsLimit','onlyPostsNewerThan'])
 for platform,actor,operations in [('bilibili','atomus/bilibili-scraper',[('search','视频搜索',['keywords']),('video-detail','视频详情',['videoUrls']),('comments','评论',['videoUrls']),('danmaku','弹幕',['videoUrls']),('transcript','字幕',['videoUrls']),('profile','UP主资料',['userUrls']),('user-videos','UP主视频',['userUrls']),('trend','热门趋势',['trendType'])]),('xiaohongshu','atomus/xiaohongshu-scraper',[('search','笔记搜索',['keywords']),('note-detail','笔记详情',['noteUrls']),('profile','作者资料',['userUrls']),('comments','评论',['noteUrls']),('products','商品搜索',['keywords']),('trending','热门趋势',[]),('influencer','达人资料',['userUrls'])])]:
  for op,name,fields in operations:
   defaults={'searchType':op,'maxItems':5}
   if fields:defaults[fields[0]]=['AR眼镜'] if fields[0]=='keywords' else ('videos' if fields[0]=='trendType' else [])
   add(platform,actor,op,('Bilibili' if platform=='bilibili' else '小红书')+' · '+name,defaults,fields+['maxItems'])
 return entries

def initialize(server):
 for entry in registry():
  if not any(d['id']==entry['id'] for d in server.docs()):server.save({'id':entry['id'],'name':entry['name'],'category':'外部连接器','categoryId':'C','color':'#4c80ed','description':'Apify '+entry['actor']+' · '+entry['operation'],'input':'ActorInput（官方Schema）','output':'ContentFeed + ActorRunReceipt','tags':['Apify',entry['platform'],'外部连接器'],'status':'待授权','hardware':False,'scope':'service','selectable':True,'connectorId':entry['id'],'constraints':'执行器已接入；需要 Apify Token、Actor 使用权限与可用余额。未获得真实数据回执前不算验收通过。','example':json.dumps(entry['defaults'],ensure_ascii=False)},'atom')

def config(server):return next((d for d in server.docs() if d['id']=='connector-apify-config'),{'id':'connector-apify-config'})
def public_config(server,vault):
 d=config(server);return {'configured':bool(d.get('credentialRef') and vault.has(d['credentialRef'])),'suffix':d.get('suffix',''),'storage':'本机钥匙串','lastTest':d.get('lastTest')}
def save_config(server,vault,p):
 value=str(p.get('key','')).strip();d=config(server)
 if value:
  if not 8<=len(value)<=4096 or any(c.isspace() for c in value):raise ValueError('Token 格式无效')
  ref='apify-'+str(uuid.uuid4());vault.put(ref,value);d.update(credentialRef=ref,suffix=value[-4:])
 server.save(d,'connector-config',d.get('_revision'));return public_config(server,vault)
def key(server,vault):
 d=config(server);value=vault.get(d.get('credentialRef','')) if d.get('credentialRef') else None
 if not value:raise ValueError('尚未配置 Apify Token，请在外部连接器中心填写')
 return value

def test_config(server,vault):
 d=config(server)
 try:
  result=connections.request(BASE+'/users/me',headers={'Authorization':'Bearer '+key(server,vault)});test={'status':'passed','at':time.time(),'message':'Token 鉴权成功；Actor 权限、余额和输入须另行运行验证'}
 except Exception as e:test={'status':'failed','at':time.time(),'message':str(e)}
 d['lastTest']=test;server.save(d,'connector-config',d.get('_revision'));return test

def validate(entry,input):
 if not isinstance(input,dict) or len(json.dumps(input))>50000:raise ValueError('Actor 输入必须是50KB以内的JSON对象')
 schema=entry['inputSchema'];props=schema.get('properties',{})
 unknown=set(input)-set(props)
 if unknown:raise ValueError('Actor 不接受字段：'+','.join(sorted(unknown)))
 for k in schema.get('required',[]):
  if k not in input:raise ValueError('缺少必填参数：'+k)
 for k,v in input.items():
  prop=props[k];typ=prop.get('type');valid={'array':isinstance(v,list),'object':isinstance(v,dict),'string':isinstance(v,str),'boolean':isinstance(v,bool),'integer':isinstance(v,int) and not isinstance(v,bool),'number':isinstance(v,(int,float)) and not isinstance(v,bool)}
  if typ in valid and not valid[typ]:raise ValueError(k+' 类型不正确')
  if prop.get('enum') and v not in prop['enum']:raise ValueError(k+' 不是有效选项')
 if entry['platform'] in ('bilibili','xiaohongshu') and input.get('searchType')!=entry['operation']:raise ValueError('所选操作与 searchType 不一致')
 required={'search':['keywords'],'video-detail':['videoUrls'],'note-detail':['noteUrls'],'comments':['videoUrls' if entry['platform']=='bilibili' else 'noteUrls'],'danmaku':['videoUrls'],'transcript':['videoUrls'],'profile':['userUrls'],'user-videos':['userUrls'],'influencer':['userUrls']}
 if entry['platform'] in ('bilibili','xiaohongshu'):
  for k in required.get(entry['operation'],[]):
   if not input.get(k):raise ValueError('请填写 '+k)
 if entry['platform']=='reddit' and not input.get('searches' if entry['operation']=='search' else 'startUrls'):raise ValueError('请填写搜索词或Reddit链接')
 if entry['platform']=='youtube' and not input.get('searchQueries' if entry['operation']=='search' else 'startUrls'):raise ValueError('请填写YouTube搜索词或视频链接')
 if entry['platform']=='instagram' and not input.get('directUrls'):raise ValueError('请填写Instagram链接')
 return input

def safe_url(v):
 if not isinstance(v,str):return None
 try:u=urllib.parse.urlparse(v)
 except ValueError:return None
 return v if u.scheme=='https' and u.hostname and not u.username and not u.password else None

def normalize(rows,entry):
 items=[]
 for i,row in enumerate(rows[:50]):
  if not isinstance(row,dict):continue
  title=row.get('title') or row.get('caption') or row.get('text') or row.get('desc') or row.get('name') or '内容 '+str(i+1)
  images=[]
  for value in [row.get('thumbnailUrl'),row.get('thumbnail'),row.get('displayUrl'),row.get('imageUrl'),row.get('cover'),*(row.get('images',[]) if isinstance(row.get('images'),list) else [])]:
   if isinstance(value,dict):value=value.get('url')
   url=safe_url(value)
   if url and url not in images:images.append(url)
  items.append({'id':str(row.get('id') or row.get('videoId') or row.get('shortCode') or i),'title':str(title)[:1000],'excerpt':str(row.get('body') or row.get('description') or row.get('text') or row.get('caption') or '')[:4000],'url':safe_url(row.get('url') or row.get('postUrl') or row.get('videoUrl')),'author':str(row.get('author') or row.get('ownerUsername') or row.get('channelName') or ''),'published':row.get('createdAt') or row.get('timestamp') or row.get('publishedAt'),'score':row.get('score') or row.get('likesCount') or row.get('viewCount'),'comments':row.get('numberOfComments') or row.get('commentsCount'),'subreddit':row.get('communityName') or entry['platform'],'media':{'images':images[:8],'video':safe_url(row.get('videoUrl')) if str(row.get('videoUrl','')).split('?')[0].endswith(('.mp4','.webm')) else None},'sourcePlatform':entry['platform']})
 return items

def jobs(server):return sorted([d for d in server.docs() if d['_kind']=='connector-run'],key=lambda d:d['createdAt'],reverse=True)[:100]
def start(server,vault,p):
 entry=next((e for e in registry() if e['id']==p.get('connectorId')),None)
 if not entry:raise ValueError('外部连接器不存在')
 data=validate(entry,p.get('input',{}));token=key(server,vault)
 digest=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
 if p.get('reuse'):
  cached=next((j for j in jobs(server) if j['connectorId']==entry['id'] and j.get('inputHash')==digest and j['status']=='succeeded' and j.get('serviceId')==p.get('serviceId') and time.time()-j.get('finishedAt',0)<120),None)
  if cached:return {**cached,'reused':True}
 # Starting a billed Actor is explicit; no automatic credential test starts one.
 if p.get('execute') is not True:raise ValueError('请点击实际运行 Actor；鉴权测试不会启动付费抓取')
 budget=p.get('maxChargeUsd',.05)
 if isinstance(budget,bool) or not isinstance(budget,(int,float)) or not .01<=budget<=1:raise ValueError('单次费用上限须为0.01至1美元')
 with LOCK:
  running=[j for j in jobs(server) if j['status']=='running']
  same=next((j for j in running if j['connectorId']==entry['id'] and j.get('serviceId')==p.get('serviceId')),None)
  if same:return same
  if len(running)>=2:raise ValueError('已有两个连接器任务运行中，请等待完成')
  job=server.save({'id':'connector-run-'+str(uuid.uuid4()),'connectorId':entry['id'],'serviceId':p.get('serviceId'),'actor':entry['actor'],'inputHash':digest,'createdAt':time.time(),'status':'running','stage':'启动 Actor','maxChargeUsd':budget},'connector-run')
 def save(**kw):
  nonlocal job
  job=server.save({**job,**kw},'connector-run',job['_revision'])
 def run():
  try:
   result=connections.request(BASE+'/actors/'+entry['actorId']+'/runs?'+urllib.parse.urlencode({'timeout':120,'maxTotalChargeUsd':budget}),data,{'Authorization':'Bearer '+token});remote=result['data'];runid=remote['id'];save(remoteRunId=runid,stage='抓取执行中',remoteStatus=remote['status'])
   for _ in range(70):
    remote=connections.request(BASE+'/actor-runs/'+runid,headers={'Authorization':'Bearer '+token})['data']
    if remote['status'] in ('SUCCEEDED','FAILED','TIMED-OUT','ABORTED'):break
    time.sleep(2)
   if remote['status']!='SUCCEEDED':raise ValueError('Actor 未成功完成：'+remote['status']+'；可用运行ID在 Apify 查看详情，不会自动重启收费任务')
   dataset=remote.get('defaultDatasetId')
   if not dataset:raise ValueError('Actor 成功但没有 Dataset')
   save(stage='读取 Dataset',datasetId=dataset)
   rows=connections.request(BASE+'/datasets/'+dataset+'/items?format=json&clean=true&limit=50',headers={'Authorization':'Bearer '+token})
   if not isinstance(rows,list):raise ValueError('Dataset 响应不是内容数组')
   items=normalize(rows,entry)
   if not items:raise ValueError('Actor 没有返回可消费内容，请检查输入和运行日志')
   feed={'type':'content-feed','items':items,'source':'Apify · '+entry['name'],'at':time.time(),'limitations':'字段取决于 Actor；缺失值保持空，不补造票数或媒体。','connectorId':entry['id'],'platform':entry['platform'],'runId':runid}
   save(status='succeeded',stage='数据已就绪',result=feed,itemCount=len(items),usageTotalUsd=remote.get('usageTotalUsd'),finishedAt=time.time())
  except Exception as e:save(status='failed',stage='执行未完成',error=str(e),finishedAt=time.time())
 threading.Thread(target=run,daemon=True).start();return job

def recover(server):
 for job in jobs(server):
  if job['status']=='running':server.save({**job,'status':'interrupted','error':'本地进程重启；如已有 remoteRunId，请先到 Apify 核对，避免重复启动收费任务'},'connector-run',job['_revision'])
