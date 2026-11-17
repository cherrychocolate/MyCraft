"""One-time, explicit release snapshot. Does not read or export any credential."""
import sys,json,hashlib,base64,mimetypes
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];LOCAL=ROOT.parent/'glasses-workbench'
sys.path.insert(0,str(LOCAL));import server
profiles=[d for d in server.docs() if d['_kind']=='model-profile'];workspace=[d.get('workspaceId','') for d in profiles if d.get('workspaceId')]
media={}
def clean(value):
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items() if k not in {'credentialRef','keySuffix','workspaceId','speechKey','chatKey','apiKey','api_key','authorization','Authorization'}}
 if isinstance(value,list):return [clean(v) for v in value]
 if isinstance(value,str):
  for w in workspace:value=value.replace(w,'[server-managed]')
  if value.startswith('data:image/') and ';base64,' in value:
   key=hashlib.sha256(value.encode()).hexdigest()[:24];media['/frozen-media/'+key]=value;return 'https://lego-os-workbench.rayneo-9255.chatgpt.site/frozen-media/'+key
 return value
allowed={'atom','service','device','idea','release','osstate','design-asset'}
seed=[clean(d) for d in server.docs() if d['_kind'] in allowed and not d.get('deleted')]
for d in seed:
 if d['id']=='os-state':
  d['notifications']=[];d['voiceAnswer']='';d['settings']['quickLaunchServiceId']=next((r['sourceId'] for r in seed if r['_kind']=='release' and r.get('snapshot',{}).get('template')=='weather'),None)
assets={}
for p in (LOCAL/'static').rglob('*'):
 if not p.is_file():continue
 rel=p.relative_to(LOCAL/'static').as_posix()
 if '/' in rel and not rel.startswith(('editor/','audio/')):continue
 if p.suffix not in ('.js','.css','.html','.wav','.svg','.png','.webp'):continue
 data=p.read_bytes()
 if p.suffix in ('.js','.css','.html'):
  text=data.decode();text=text.replace("location.hostname === '127.0.0.1' || location.hostname === 'localhost'", "false").replace("location.hostname==='127.0.0.1'||location.hostname==='localhost'",'false')
  # Defensive: cloud source must never point to a loopback gateway.
  text=text.replace('http://127.0.0.1:8766/api/models/','/api/models/')
  for w in workspace:text=text.replace(w,'[server-managed]')
  if p.suffix=='.html':text=text.replace('<body>','<body><script src="/cloud-session.js"></script>')
  data=text.encode()
 assets['/'+rel]={'type':mimetypes.guess_type(p.name)[0] or 'application/octet-stream','base64':base64.b64encode(data).decode()}
(ROOT/'src/frozen.mjs').write_text('export const SEED='+json.dumps(seed,ensure_ascii=False)+';\nexport const ASSETS='+json.dumps(assets)+';\nexport const MEDIA='+json.dumps(media)+';\n')
(ROOT/'src/catalog.mjs').write_text('export const FRAMEWORK='+json.dumps(clean(json.loads((LOCAL/'data/os-catalog.json').read_text())),ensure_ascii=False)+';\nexport const CONNECTORS='+json.dumps(clean(__import__('external_connectors').registry()),ensure_ascii=False)+';\n')
(ROOT/'release-lock.json').write_text(json.dumps({'release':'2026-11-13-online-1','localAutoDeploy':False,'manualPublishOnly':True,'sourceDigest':hashlib.sha256((ROOT/'src/frozen.mjs').read_bytes()).hexdigest(),'documentCount':len(seed),'assetCount':len(assets)},indent=2))
print('Frozen',len(seed),'documents;',len(assets),'assets; no credentials exported')
