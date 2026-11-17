"""Watchface contract and transactional scene patches, independent of UI/model vendors."""
import copy, math, re
VERSION=1
TYPES={'text','card','button','rectangle','icon','image','chart','component'}
BINDINGS={'','face.time','face.date','face.weather','face.battery','pin.text','pin.weather','pin.nextEvent','pin.feed'}
EDITABLE={'text','x','y','w','h','fontSize','color','background','radius','binding','icon','imageSrc','imageFit','motion','action','sourceServiceId'}
def validate(face):
 if not isinstance(face,dict) or face.get('schemaVersion')!=VERSION:raise ValueError('不支持的表盘格式')
 if face.get('width')!=600 or face.get('height')!=800:raise ValueError('表盘显示区域必须为600×800')
 nodes=face.get('nodes');ids=set()
 if not isinstance(nodes,list) or not 1<=len(nodes)<=120:raise ValueError('表盘需要1至120个图层')
 for n in nodes:
  if not isinstance(n,dict) or not isinstance(n.get('id'),str) or not n['id'] or n['id'] in ids:raise ValueError('图层ID缺失或重复')
  ids.add(n['id'])
  if n.get('type') not in TYPES:raise ValueError('不支持的图层类型')
  for k in ('x','y','w','h'):
   if isinstance(n.get(k),bool) or not isinstance(n.get(k),(int,float)) or not math.isfinite(n[k]):raise ValueError('图层坐标必须为有限数值')
  if n['w']<=0 or n['h']<=0 or n['x']<0 or n['y']<0 or n['x']+n['w']>600 or n['y']+n['h']>800:raise ValueError('图层超出显示区域')
  if n.get('type')=='component' and n.get('component') not in ('snoopy-v1',):raise ValueError('代码组件不在已注册白名单中')
  if n.get('sourceServiceId') and not isinstance(n['sourceServiceId'],str):raise ValueError('Pin服务标识格式不合法')
  if n.get('binding','') not in BINDINGS:raise ValueError('数据绑定不受支持')
  if n.get('action','none') not in ('none','voice','center','dashboard','settings','service'):raise ValueError('点击动作不受支持')
  for key in ('fontSize','radius'):
   if key in n and (isinstance(n[key],bool) or not isinstance(n[key],(int,float)) or not math.isfinite(n[key]) or not 0<=n[key]<=600):raise ValueError('字号或圆角不合法')
  for key in ('color','background'):
   if key in n and not re.fullmatch(r'#[0-9a-fA-F]{3,8}|transparent|white|black',str(n[key])):raise ValueError('颜色请使用十六进制值')
  if n.get('imageSrc') and not re.match(r'^https://[^\s]+$|^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$',str(n['imageSrc'])):raise ValueError('图片格式不受支持')
  motion=n.get('motion',{})
  if not isinstance(motion,dict) or motion.get('preset','none') not in ('none','float','pulse','rotate','keyframes'):raise ValueError('动画不受支持')
  duration=motion.get('durationMs',2000)
  if isinstance(duration,bool) or not isinstance(duration,(int,float)) or not math.isfinite(duration) or not 300<=duration<=10000:raise ValueError('动画周期必须在300至10000毫秒')
  if motion.get('preset')=='keyframes':
   frames=motion.get('frames')
   if not isinstance(frames,list) or not 2<=len(frames)<=12:raise ValueError('关键帧需要2至12帧')
   previous=-1
   for f in frames:
    if not isinstance(f,dict) or set(f)-{'offset','x','y','rotate','scale','opacity'}:raise ValueError('关键帧属性不受支持')
    for k,v in f.items():
     low,high={'offset':(0,1),'x':(-120,120),'y':(-120,120),'rotate':(-180,180),'scale':(.5,1.5),'opacity':(0,1)}[k]
     if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not low<=v<=high:raise ValueError('关键帧超出动画预算')
    if 'offset' not in f or f['offset']<previous:raise ValueError('关键帧时间须按顺序排列')
    previous=f['offset']
   if frames[0]['offset']!=0 or frames[-1]['offset']!=1:raise ValueError('关键帧必须覆盖完整周期')
   if motion.get('trigger','loop') not in ('loop','tap'):raise ValueError('动画触发不受支持')
 if face.get('profile')=='glasses-v1':
  import glasses_policy
  glasses_policy.validate(face)
 return face

def patch(face,operations):
 """Apply the whole proposal or none; locked layers and stable IDs are preserved."""
 validate(face)
 if not isinstance(operations,list) or len(operations)>100:raise ValueError('修改操作过多或格式错误')
 result=copy.deepcopy(face)
 for op in operations:
  if not isinstance(op,dict):raise ValueError('修改操作格式错误')
  node=next((n for n in result['nodes'] if n['id']==op.get('id')),None)
  kind=op.get('op')
  if kind=='add':
   candidate=op.get('node')
   if not isinstance(candidate,dict):raise ValueError('新增图层缺少内容')
   result['nodes'].append(copy.deepcopy(candidate))
  elif kind in ('update','remove'):
   if not node:raise ValueError('目标图层已不存在')
   if node.get('locked'):raise ValueError('锁定图层不能被AI修改')
   if kind=='remove':result['nodes'].remove(node)
   else:
    changes=op.get('changes')
    if not isinstance(changes,dict) or set(changes)-EDITABLE:raise ValueError('修改包含不允许的属性')
    node.update(copy.deepcopy(changes))
  else:raise ValueError('未知修改操作')
 return validate(result)

def apply_release(connect,release_id,expected):
 """Selection pins an immutable release; publishing a draft never selects it."""
 import json,os_backend
 with connect() as c:
  c.execute('BEGIN IMMEDIATE');state,revision=os_backend.osstate(c)
  if expected!=revision:raise ValueError('OS状态已更新，请刷新后重试')
  if release_id:
   row=c.execute("SELECT body FROM documents WHERE id=? AND kind='release'",(release_id,)).fetchone()
   if not row:raise ValueError('发布版本不存在')
   release=json.loads(row['body']);face=validate(release.get('snapshot',{}).get('watchface'))
   import glasses_policy
   glasses_policy.validate(face)
  previous=state.get('watchface',{}).get('activeReleaseId')
  history=state.get('watchface',{}).get('history',[])
  state['watchface']={'activeReleaseId':release_id,'history':([previous]+history)[:20] if previous!=release_id else history}
  os_backend.write_state(c,state,revision)
 return {'state':state,'revision':revision+1}
