"""Searchable, attributable visual assets and durable one-sentence creation."""
import json,time,uuid,threading,urllib.parse,urllib.request,re,base64,copy
import connections,design_media,watchface_core,glasses_policy

def search(server,query):
 query=str(query).strip()[:160]
 if not query:raise ValueError('请输入素材关键词')
 params={'action':'query','format':'json','generator':'search','gsrsearch':query,'gsrnamespace':6,'gsrlimit':8,'prop':'imageinfo','iiprop':'url|extmetadata|mime','iiurlwidth':600}
 result=connections.request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params),headers={'User-Agent':'Glasshouse/1.0 (personal design workstation)'})
 clean=lambda v:re.sub('<[^>]*>','',str(v))[:1000]
 items=[]
 for page in result.get('query',{}).get('pages',{}).values():
  info=(page.get('imageinfo') or [{}])[0];meta=info.get('extmetadata',{})
  if info.get('mime') not in ('image/png','image/jpeg','image/webp'):continue
  items.append({'title':page['title'],'url':info.get('thumburl') or info.get('url'),'sourceUrl':info.get('descriptionurl'),'author':clean(meta.get('Artist',{}).get('value','')),'license':clean(meta.get('LicenseShortName',{}).get('value','未标注'))})
 doc=server.save({'id':'search-'+str(uuid.uuid4()),'query':query,'provider':'Wikimedia Commons','createdAt':time.time(),'items':items},'asset-search')
 return doc

def import_asset(server,p):
 record=next((d for d in server.docs() if d['id']==p.get('searchId') and d['_kind']=='asset-search'),None)
 if not record:raise ValueError('素材搜索已失效，请重新搜索')
 index=p.get('index')
 if not isinstance(index,int) or not 0<=index<len(record['items']):raise ValueError('素材序号无效')
 item=record['items'][index];url=item['url'];u=urllib.parse.urlparse(url)
 if u.scheme!='https' or u.hostname!='upload.wikimedia.org':raise ValueError('只导入已检索到的 Wikimedia 图片')
 req=urllib.request.Request(url,headers={'User-Agent':'Glasshouse/1.0 (personal design workstation)'})
 with urllib.request.build_opener(connections.NoRedirect).open(req,timeout=25) as r:
  body=r.read(4_000_001);mime=r.headers.get_content_type()
 src='data:'+mime+';base64,'+base64.b64encode(body).decode();design_media.image_part(src)
 return server.save({'id':'asset-'+str(uuid.uuid4()),'name':item['title'],'imageSrc':src,'provenance':{'type':'searched','provider':record['provider'],'sourceUrl':item['sourceUrl'],'author':item['author'],'license':item['license'],'createdAt':time.time()}},'design-asset')

def jobs(server):return {'jobs':sorted([d for d in server.docs() if d['_kind']=='creative-job'],key=lambda d:d['createdAt'],reverse=True)[:50]}
def create(server,p,choose,raw,media):
 retry=next((d for d in jobs(server)['jobs'] if d['id']==p.get('retryJobId') and d['status']=='failed'),None)
 prompt=str(retry['prompt'] if retry else p.get('prompt','')).strip()
 if not prompt or len(prompt)>4000:raise ValueError('请描述4000字以内的表盘需求')
 if any(j['status']=='running' for j in jobs(server)['jobs']):raise ValueError('已有表盘创建任务运行中，请稍后重试')
 job=server.save({'id':'creative-'+str(uuid.uuid4()),'prompt':prompt,'status':'running','stage':'搜索参考素材','createdAt':time.time(),'steps':[]},'creative-job')
 def save(**change):
  nonlocal job
  job=server.save({**job,**change},'creative-job',job['_revision'])
 def run():
  try:
   try:
    refs=search(server,p.get('query') or ('Snoopy' if re.search('史努比|snoopy',prompt,re.I) else prompt[:100]));save(searchId=refs['id'],steps=[{'name':'搜索参考素材','status':'passed','count':len(refs['items'])}])
   except Exception as e:save(steps=[{'name':'搜索参考素材','status':'failed','error':str(e)}])
   save(stage='Gemini 生成角色素材')
   asset=next((d for d in server.docs() if retry and d['id']==retry.get('assetId') and d['_kind']=='design-asset'),None)
   if not asset:asset=media({'operation':'generate','prompt':prompt+'。输出独立角色插画素材，角色完整，背景纯白或透明，不要界面文字、数字、时间或UI。用于表盘中下部。'})['asset']
   save(assetId=asset['id'],steps=job['steps']+[{'name':'生成角色素材','status':'passed','assetId':asset['id']}],stage='设计表盘布局')
   pid=str(uuid.uuid4());nodes=[{'id':'title','type':'text','text':'PERSONAL / OS','x':32,'y':32,'w':536,'h':50,'fontSize':24,'color':'#ffffff'},{'id':'clock','type':'text','binding':'face.time','text':'时间','x':32,'y':100,'w':536,'h':140,'fontSize':118,'color':'#ffffff'},{'id':'date','type':'text','binding':'face.date','text':'日期','x':32,'y':250,'w':536,'h':60,'fontSize':32,'color':'#ffffff'},{'id':'character','type':'image','text':'主题角色','x':40,'y':340,'w':520,'h':280,'imageFit':'contain','imageSrc':asset['imageSrc'],'assetId':asset['id'],'motion':{'preset':'keyframes','durationMs':3600,'trigger':'loop','frames':[{'offset':0,'y':0,'rotate':0},{'offset':.5,'y':-10,'rotate':-2},{'offset':1,'y':0,'rotate':0}]}},{'id':'board','type':'button','text':'看板','action':'dashboard','x':32,'y':674,'w':256,'h':90,'fontSize':32,'background':'#ffffff','color':'#111111','radius':24},{'id':'voice','type':'button','text':'语音助手','action':'voice','x':312,'y':674,'w':256,'h':90,'fontSize':32,'background':'#ff5100','color':'#111111','radius':24}]
   face={'schemaVersion':1,'width':600,'height':800,'pageId':pid,'background':'#000000','nodes':nodes}
   model=choose({},'design');context=copy.deepcopy(face)
   context['nodes'][3].pop('imageSrc')
   text,usage=raw(model,[{'role':'system','content':'你是彩色光波导眼镜主页设计师。背景必须#000000，文字白色；不允许大块白底或手机式满屏卡片，中心留白。角色素材仅作为前端代码组件的形象参考。根据需求微调给定场景，只返回JSON {"name":"名称","background":"#RRGGBB","changes":[{"id":"已有ID","changes":{...}}]}。仅修改文字、字号、颜色、背景、位置尺寸。必须600×800内。保持时间与日期绑定以及角色素材，不改id/type/assetId/motion/action。白色角色素材适合白色卡片背景。禁止额外图层和图片地址。'},{'role':'user','content':json.dumps({'request':prompt,'scene':context},ensure_ascii=False)}])
   text=text.strip()
   if text.startswith('```'):text=text.split('\n',1)[1].rsplit('```',1)[0]
   result=json.loads(text);face=watchface_core.patch(face,[{'op':'update',**op} for op in result.get('changes',[])])
   face['background']='#000000'
   atom=next(d for d in server.docs() if d['id']=='O17');doc=server.save({'id':str(uuid.uuid4()),'name':str(result.get('name','主题表盘'))[:100],'kind':'service','description':prompt,'nodes':[{'id':str(uuid.uuid4()),'atomId':'O17','snapshot':atom,'x':80,'y':80,'mode':'required','config':''}],'edges':[],'elements':face['nodes'],'pages':[{'id':pid,'name':'表盘','scrollHeight':800,'elements':face['nodes']}],'editingPageId':pid,'startPage':pid,'watchface':face,'designConversation':[{'role':'user','content':prompt},{'role':'assistant','content':'已搜索参考、生成主题角色并创建表盘。点击动态预览查看角色动画，可继续对话修改。'}],'creativeJobId':job['id'],'messages':[]},'service')
   doc=server.save(glasses_policy.upgrade(doc),'service',doc['_revision'])
   save(status='succeeded',stage='可以继续编辑与发布',serviceId=doc['id'],usage=usage,steps=job['steps']+[{'name':'设计与场景验证','status':'passed'}])
  except Exception as e:save(status='failed',error=str(e),stage='创建未完成')
 threading.Thread(target=run,daemon=True).start();return job

def recover(server):
 for j in jobs(server)['jobs']:
  if j['status']=='running':server.save({**j,'status':'failed','error':'进程重启，创建已中断；可保留已生成素材重试'},'creative-job',j['_revision'])
