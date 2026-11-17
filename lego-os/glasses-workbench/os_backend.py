"""Versioned OS publication and install state. Native hardware is never implied by catalog entries."""
import json,uuid,time,hashlib
from pathlib import Path
SUPPORTED={'C_YOUTUBE_SEARCH','O17','I07','C02','C04','F02','F03','F04','O01','O02','O03','O07','O08','O09','I02','P01','P07'}
def catalog(root):return json.loads((root/'data/os-catalog.json').read_text())
def initialize(connect,root):
 data=catalog(root)
 with connect() as c:
  for kind,items in [('device',[data['framework']]),('atom',data['atoms'])]:
   for d in items:
    if not c.execute('SELECT 1 FROM documents WHERE id=?',(d['id'],)).fetchone():c.execute('INSERT INTO documents VALUES(?,?,?,?,?)',(d['id'],kind,json.dumps(d,ensure_ascii=False),1,time.time()))
def osstate(c):
 row=c.execute("SELECT * FROM documents WHERE id='os-state'").fetchone()
 return (json.loads(row['body']) if row else {'id':'os-state','installed':{},'userdata':{},'widgets':[],'notifications':[],'settings':{}}),row['revision'] if row else 0
def write_state(c,d,revision):
 old=c.execute("SELECT * FROM documents WHERE id='os-state'").fetchone()
 if old:c.execute('INSERT INTO history(id,kind,body,revision,updated) VALUES(?,?,?,?,?)',('os-state','osstate',old['body'],old['revision'],old['updated']))
 c.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?)',('os-state','osstate',json.dumps(d,ensure_ascii=False),revision+1,time.time()))
def validate(d,mode):
 if mode not in ('prototype','service','watchface'):raise ValueError('发布类型不支持')
 if d.get('kind')=='brainstorm':raise ValueError('创意草案需转为服务后才能发布')
 if d.get('watchface'):
  import watchface_core
  watchface_core.validate(d['watchface'])
  import glasses_policy
  glasses_policy.validate(d['watchface'])
  page_id=d['watchface'].get('pageId')
  if page_id:
   page=next((x for x in d.get('pages',[]) if x.get('id')==page_id),None)
   if not page or page.get('elements')!=d['watchface']['nodes']:raise ValueError('表盘场景与编辑页面不一致，请重新保存')
 if mode=='watchface':
  if not d.get('watchface'):raise ValueError('缺少表盘场景')
  return
 if mode=='prototype':
  pages=d.get('pages',[]);ids={p['id'] for p in pages}
  if not pages or d.get('startPage') not in ids:raise ValueError('请先创建页面并指定原型首页')
  if any(e.get('targetPage') and e['targetPage']!='back' and e['targetPage'] not in ids for p in pages for e in p.get('elements',[])):raise ValueError('原型包含不存在的跳转页面')
  return
 nodes=[n for n in d.get('nodes',[]) if n.get('mode')!='optional'];ids={n['id'] for n in nodes}
 if not nodes:raise ValueError('服务没有必选执行节点')
 import external_connectors
 supported=SUPPORTED|{e['id'] for e in external_connectors.registry()}
 unknown=[n.get('snapshot',{}).get('name',n['atomId']) for n in nodes if n['atomId'] not in supported]
 if unknown:raise ValueError('以下能力尚无执行器：'+'、'.join(unknown)+'。可设为备选，或发布为明确的交互原型。')
 edges=[e for e in d.get('edges',[]) if e['from'] in ids and e['to'] in ids];done=set()
 while len(done)<len(ids):
  ready={n for n in ids-done if all(e['from'] in done for e in edges if e['to']==n)}
  if not ready:raise ValueError('工作流存在循环')
  done|=ready
 if not any(n['atomId'] in {'O03','O08'} for n in nodes):raise ValueError('请添加独立应用窗口输出，才能从 OS 服务中心消费')
 cfg=d.get('runtimeConfig',{})
 if d.get('template')=='weather' and cfg.get('weatherMode')!='mock' and (cfg.get('lat') is None or cfg.get('lon') is None):raise ValueError('请先选择天气位置')
 if d.get('template')=='calendar' and cfg.get('calendarMode')=='live' and not cfg.get('calendarId'):raise ValueError('请先选择已授权的日历')
def publish(connect,p):
 with connect() as c:
  c.execute('BEGIN IMMEDIATE');row=c.execute("SELECT * FROM documents WHERE id=? AND kind='service'",(p['id'],)).fetchone()
  if not row:raise ValueError('服务不存在')
  if row['revision']!=p.get('expected'):raise ValueError('画板版本已变化，请保存并重新发布')
  doc=json.loads(row['body']);mode=p.get('mode','service');validate(doc,mode)
  digest=hashlib.sha256(json.dumps(doc,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  releases=[json.loads(r['body']) for r in c.execute("SELECT body FROM documents WHERE kind='release'")];previous=[r for r in releases if r['sourceId']==p['id']]
  same=next((r for r in previous if r['digest']==digest and r['mode']==mode),None)
  release=same or {'id':str(uuid.uuid4()),'sourceId':p['id'],'name':doc['name'],'version':max([r['version'] for r in previous],default=0)+1,'sourceRevision':row['revision'],'mode':mode,'digest':digest,'publishedAt':time.time(),'snapshot':doc}
  if not same:c.execute('INSERT INTO documents VALUES(?,?,?,?,?)',(release['id'],'release',json.dumps(release,ensure_ascii=False),1,time.time()))
  if mode!='watchface':
   state,rev=osstate(c);state['installed'][p['id']]={'releaseId':release['id'],'enabled':True};write_state(c,state,rev)
 return {'release':release,'installed':mode!='watchface','registered':True}
def state(connect):
 with connect() as c:
  data,rev=osstate(c);releases=[json.loads(r['body']) for r in c.execute("SELECT body FROM documents WHERE kind='release'")]
 return {'state':data,'revision':rev,'releases':releases}
def update(connect,p):
 with connect() as c:
  c.execute('BEGIN IMMEDIATE');data,rev=osstate(c)
  if p.get('expected')!=rev:raise ValueError('OS 状态已在其他页面更新，请刷新后重试')
  new=p['state'];new['id']='os-state'
  # Publication installation pointers are server-managed; settings and business data are editable.
  new['installed']=data['installed']
  if 'watchface' in data:new['watchface']=data['watchface']
  else:new.pop('watchface',None)
  write_state(c,new,rev)
 return {'state':new,'revision':rev+1}

def install(connect,p):
 with connect() as c:
  c.execute('BEGIN IMMEDIATE');row=c.execute("SELECT body FROM documents WHERE id=? AND kind='release'",(p['releaseId'],)).fetchone()
  if not row:raise ValueError('发布版本不存在')
  release=json.loads(row['body'])
  if release['sourceId']!=p['sourceId']:raise ValueError('发布版本与服务不匹配')
  data,rev=osstate(c);data['installed'][p['sourceId']]={'releaseId':p['releaseId'],'enabled':True};write_state(c,data,rev)
 return {'ok':True}
