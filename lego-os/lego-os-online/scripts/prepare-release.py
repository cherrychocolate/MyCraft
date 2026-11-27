"""Freeze only public application source and a new, fictional starter workspace."""
import base64
import json
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT.parent / 'glasses-workbench'
STATIC = LOCAL / 'static'
categories = json.loads((LOCAL/'data/seed-atoms.json').read_text())
atoms = {}
for group in categories:
    for atom in group['atoms']:
        atoms[atom['id']] = {**atom, 'category':group['name'], 'categoryId':group['id'],
                            'color':group['color'], '_kind':'atom', '_revision':1}
for ident, label, category, output in [
    ('I07','导航输入','I','InteractionEvent'),
    ('O07','系统 Widget','O','Widget'),
    ('O08','独立应用窗口','O','Service view'),
    ('O09','语音助手容器','O','Assistant response'),
    ('C_YOUTUBE_SEARCH','YouTube 官方视频搜索','C','content-feed'),
]:
    atoms.setdefault(ident, {'id':ident,'name':label,'description':label,'categoryId':category,
                             'category':'执行能力','color':'#666','output':output,'_kind':'atom','_revision':1})
seed = list(atoms.values())
installed = {}

def service(template, label, graph, config, extra=None, version=1):
    ident = 'trial-'+template
    nodes = [{'id':f'{ident}-node-{i}','atomId':atom,'snapshot':atoms[atom], 'x':70+i%3*250,
              'y':60+i//3*180,'mode':'required','config':''} for i,atom in enumerate(graph)]
    edges = [{'from':nodes[src]['id'],'to':nodes[dst]['id'],'mapping':''}
             for src,dst in ([(0,1)]+[(1,n) for n in range(2,len(nodes))])]
    doc = {'id':ident,'name':label,'kind':'service','template':template,'description':label,
           'nodes':nodes,'edges':edges,'elements':[],'messages':[],'steps':[],
           'runtimeConfig':config,**(extra or {})}
    release = {'id':f'{ident}-v{version}','sourceId':ident,'name':label,'version':version,'sourceRevision':1,
               'mode':'service','publishedAt':0,'digest':ident,'snapshot':doc,'_kind':'release','_revision':1}
    seed.extend([{**doc,'_kind':'service','_revision':1},release])
    installed[ident]={'enabled':True,'releaseId':release['id']}

service('weather','深圳天气',['C04','F02','O07','O08'],{'locationName':'深圳','lat':22.5431,'lon':114.0579,'weatherMode':'live'})
service('calendar','日程课表',['C02','F02','O07','O08','O09'],
        {'calendarMode':'live','calendarId':'workbench-calendar'},
        {'timetable':{'start':'2026-01-05','courses':[],'exceptions':[],'tasks':[]}})
service('video','YouTube',['C_YOUTUBE_SEARCH','F03','O07','O08','O09'],{},
        {'videoConfig':{'query':'Tokyo Osaka travel','ranking':'relevance',
                        'youtubeProvider':'official','channels':['youtube']},
         'presentation':{'widgets':[{'id':'videos','kind':'feed','size':'medium'}]}},version=2)
seed.append({'id':'os-state','_kind':'osstate','_revision':1,'installed':installed,'userdata':{},'widgets':[],
             'notifications':[],'watchface':{},'settings':{'homePinServiceId':'trial-calendar',
              'quickLaunchServiceId':'trial-weather','homeLayout':'lower','wifi':True,'bluetooth':True,
              'inputMode':'focus','volume':65,'brightness':100}})
assets={}
for path in STATIC.rglob('*'):
    if not path.is_file(): continue
    rel=path.relative_to(STATIC).as_posix()
    if '/' in rel and rel!='assistant/sample-reply.wav' and not rel.startswith(('editor/','audio/','app-icons/','assistant/kai-atlas/')): continue
    if path.suffix not in ('.js','.css','.html','.svg','.png','.webp','.wav'): continue
    if path.suffix=='.html' and rel not in ('index.html','os.html','design-guidelines.html'): continue
    data=path.read_bytes()
    if path.suffix in ('.js','.css','.html'):
        source=data.decode()
        source=source.replace('http://127.0.0.1:8766/api/models/','/api/models/')
        source=source.replace('/os.html','/')
        if rel=='os-shell.js':
            source=source.replace('/?v=20261112-control2','/workbench')
            source=source.replace('function persistOS(){','function persistOS(){if(!window.LegoSite.canSync)return Promise.resolve();')
            source=source.replace("s:{status:'idle',route:'today',stack:[]", "s:{status:'idle',route:doc.template==='calendar'?'week':'today',stack:[]")
        if rel=='service-surfaces.js':
            source=source.replace('<h1>本周课表</h1>', '<h1>本周课表</h1><p>${esc(s.calendarSource||\'\')}</p>')
            source=source.replace("'<p>飞书只读日程</p>'", "`<p>${esc(s.calendarSource||'只读日程')}</p>`")
        if rel=='os-handoffs.js':source=re.sub(r'const entries = \[.*?\];', 'const entries = [];', source, count=1, flags=re.S)
        if rel=='model-center.js':source=source.replace('/?models=1','/workbench?models=1')
        if path.suffix=='.html':
            source=source.replace('<body>','<body><script src="/cloud-session.js"></script>')
        data=source.encode()
    assets['/'+rel]={'type':mimetypes.guess_type(path.name)[0] or 'application/octet-stream',
                     'base64':base64.b64encode(data).decode()}
(ROOT/'src/frozen.mjs').write_text('export const SEED='+json.dumps(seed,ensure_ascii=False,separators=(',',':'))+';\nexport const ASSETS='+json.dumps(assets,separators=(',',':'))+';\nexport const MEDIA={};\n')
framework=json.loads((LOCAL/'data/os-catalog.json').read_text())
(ROOT/'src/catalog.mjs').write_text('export const FRAMEWORK='+json.dumps(framework,ensure_ascii=False)+';\nexport const CONNECTORS=[];\n')
print(f'{len(seed)} public starter documents and {len(assets)} UI assets; no local workspace data was read')
