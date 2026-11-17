"""Project glass-home policy v1; numeric layout budgets are provisional, not human-factors certification."""
PROFILE='glasses-v1'
BINDINGS={'pin.text','pin.nextEvent','pin.weather','pin.feed'}
def validate(face):
 if str(face.get('background','#000000')).lower() not in ('#000','#000000'):raise ValueError('眼镜主页背景必须为纯黑 #000000；旧表盘请先升级为眼镜主页')
 if face.get('profile')!=PROFILE:return
 pins=[n for n in face['nodes'] if n.get('binding') in BINDINGS]
 if len(pins)>2:raise ValueError('眼镜主页最多固定2条信息，更多内容请放入看板')
 if sum(n.get('role')=='shortcut' for n in face['nodes'])>2:raise ValueError('眼镜主页最多2个快捷入口，复杂控制请放入控制中心')
 for n in face['nodes']:
  if n.get('background','transparent').lower() not in ('transparent','#000','#000000'):raise ValueError('眼镜主页不使用大块彩色或白色底板，请使用无底色文字与线性图形')
  if n.get('type')=='component' and (n['w']>180 or n['h']>180):raise ValueError('常驻角色尺寸最多180×180（暂定预算）')
 return face

def report(face):
 warnings=[];area=sum(n['w']*n['h'] for n in face.get('nodes',[]))/(600*800)
 if area>.30:warnings.append('图层包围盒面积合计超过显示区30%；这是本项目预警，不是已验证的视野遮挡阈值')
 if any(n.get('role') not in ('pin','shortcut') and n['x']<568 and n['x']+n['w']>32 and n['y']<600 and n['y']+n['h']>280 for n in face.get('nodes',[])):warnings.append('中心留白区存在常驻内容，请确认是否确有必要')
 return {'profile':face.get('profile'),'boxAreaRatio':round(area,3),'warnings':warnings,'calibration':'已确认对角30°、双目、默认正前方；600×800逻辑画布，估算H18.27°/V24.20°，每眼分辨率/重叠/角偏移/实际PPD及亮度待校准'}

def upgrade(doc):
 """Explicit draft migration. Generated bitmap becomes a reference; runtime uses code components."""
 import copy
 d=copy.deepcopy(doc);old=d.get('watchface',{});pid=old.get('pageId') or d.get('startPage');snoopy='史努比' in d.get('name','') or 'snoopy' in (d.get('description','')+d.get('name','')).lower()
 ref=next((n.get('assetId') for n in old.get('nodes',[]) if n.get('assetId')),None)
 nodes=[{'id':'clock','type':'text','role':'clock','binding':'face.time','text':'时间','x':40,'y':64,'w':280,'h':90,'fontSize':68,'color':'#ffffff'},{'id':'date','type':'text','role':'date','binding':'face.date','text':'日期','x':40,'y':164,'w':400,'h':48,'fontSize':32,'color':'#d8d8d8'}]
 if snoopy:nodes.append({'id':'character','type':'component','component':'snoopy-v1','role':'character','text':'史努比 · 点亮招手 / 随时段变化','x':424,'y':64,'w':136,'h':144,'referenceAssetId':ref,'color':'#ffffff','motion':{'preset':'none'}})
 else:nodes.append({'id':'symbol','type':'icon','role':'character','icon':'sun','x':452,'y':80,'w':80,'h':80,'color':'#ff5100'})
 nodes += [{'id':'board','type':'button','role':'shortcut','text':'看板 →','action':'dashboard','x':40,'y':724,'w':240,'h':48,'fontSize':32,'color':'#ffffff','background':'transparent'},{'id':'voice','type':'button','role':'shortcut','text':'助手 →','action':'voice','x':320,'y':724,'w':240,'h':48,'fontSize':32,'color':'#ffffff','background':'transparent'}]
 face={'schemaVersion':1,'width':600,'height':800,'profile':PROFILE,'pageId':pid,'background':'#000000','nodes':nodes,'designRules':{'maxPins':2,'maxShortcuts':2,'centerReserve':[32,280,536,320],'ambientAfterSeconds':15,'motion':'wake-and-tap-only','movementMode':'manual-simulation'}}
 validate(face);d['watchface']=face
 for page in d.get('pages',[]):
  if page['id']==pid:page['elements']=nodes
 d['editingPageId']=pid;d['elements']=nodes;return d
