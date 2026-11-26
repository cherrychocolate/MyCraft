import {SEED} from './frozen.mjs';
import {sanitize} from './security.mjs';
const initByDB=new WeakMap();
const seedInsert='INSERT OR IGNORE INTO documents(owner,id,kind,body,revision,updated) VALUES(?,?,?,?,?,?)';
const builtInYouTube=SEED.find(doc=>doc.id==='trial-video-v2');
const videoReleasePath='$.installed."trial-video".releaseId';

async function prepareWorkspace(db,owner){
 const now=Date.now()/1000;
 const initialized=await db.prepare('SELECT id FROM documents WHERE owner=? AND id=?').bind(owner,'__initialized').first();
 if(!initialized){
  for(let i=0;i<SEED.length;i+=60){
   await db.batch(SEED.slice(i,i+60).map(doc=>db.prepare(seedInsert)
    .bind(owner,doc.id,doc._kind,JSON.stringify(doc),doc._revision||1,now)));
  }
  await db.prepare(seedInsert).bind(owner,'__initialized','internal','{}',1,now).run();
  return;
 }
 const state=await get(db,owner,'os-state');
 if(state?.installed?.['trial-video']?.releaseId!=='trial-video-v1')return;
 await db.batch([
  db.prepare(seedInsert).bind(owner,builtInYouTube.id,'release',JSON.stringify(builtInYouTube),1,now),
  db.prepare('UPDATE documents SET body=json_set(body,?,?),revision=revision+1,updated=? WHERE owner=? AND id=? AND json_extract(body,?)=?')
   .bind(videoReleasePath,builtInYouTube.id,now,owner,'os-state',videoReleasePath,'trial-video-v1')
 ]);
}

export async function initialize(db,owner){
 let init=initByDB.get(db);
 if(!init){init=new Map();initByDB.set(db,init);}
 if(!init.has(owner)){
  init.set(owner,prepareWorkspace(db,owner).catch(error=>{init.delete(owner);throw error}));
 }
 return init.get(owner);
}
export async function docs(db,owner){return (await db.prepare("SELECT id,kind,body,revision FROM documents WHERE owner=? AND kind!='internal' ORDER BY updated DESC").bind(owner).all()).results.map(r=>({...JSON.parse(r.body),id:r.id,_kind:r.kind,_revision:r.revision}))}
export async function get(db,owner,id){const r=await db.prepare('SELECT kind,body,revision FROM documents WHERE owner=? AND id=?').bind(owner,id).first();return r?{...JSON.parse(r.body),_kind:r.kind,_revision:r.revision}:null}
export async function save(db,owner,d,kind,expected,env){if(!d||typeof d!=='object'||!d.id||String(d.id).length>160)throw Error('文档ID无效');const old=await get(db,owner,d.id);if(old&&expected!==old._revision)throw Error('内容已更新，请刷新后重试');const body={...sanitize(d,env)};delete body._kind;delete body._revision;const revision=(old?._revision||0)+1;if(old){const result=await db.prepare('UPDATE documents SET body=?,kind=?,revision=?,updated=? WHERE owner=? AND id=? AND revision=?').bind(JSON.stringify(body),kind,revision,Date.now()/1000,owner,d.id,old._revision).run();if(!result.meta.changes)throw Error('内容已在其他页面改变');await db.prepare('INSERT OR IGNORE INTO history(owner,id,kind,body,revision,updated) VALUES(?,?,?,?,?,?)').bind(owner,d.id,old._kind,JSON.stringify(old),old._revision,Date.now()/1000).run()}else await db.prepare('INSERT INTO documents(owner,id,kind,body,revision,updated) VALUES(?,?,?,?,?,?)').bind(owner,d.id,kind,JSON.stringify(body),revision,Date.now()/1000).run();return {...body,_kind:kind,_revision:revision}}
export async function log(db,owner,data,env){const d={...sanitize(data,env),id:crypto.randomUUID(),at:Date.now()/1000};await db.prepare('INSERT INTO runs(owner,id,body,created) VALUES(?,?,?,?)').bind(owner,d.id,JSON.stringify(d),d.at).run();return d}
export async function osState(db,owner){const d=await get(db,owner,'os-state');return {state:d||{id:'os-state',installed:{},userdata:{},widgets:[],notifications:[],settings:{}},revision:d?._revision||0,releases:(await docs(db,owner)).filter(d=>d._kind==='release')}}
export async function updateOS(db,owner,p,env){const old=await osState(db,owner);if(p.expected!==old.revision)throw Error('OS状态已更新，请刷新重试');const d={...p.state,id:'os-state',installed:old.state.installed,watchface:old.state.watchface};const r=await save(db,owner,d,'osstate',p.expected,env);return {state:r,revision:r._revision}}
export async function install(db,owner,p,env){const r=await get(db,owner,p.releaseId);if(r?._kind!=='release'||r.sourceId!==p.sourceId)throw Error('发布版本不存在');const state=await osState(db,owner);state.state.installed[p.sourceId]={releaseId:r.id,enabled:p.enabled!==false};const s=await save(db,owner,state.state,'osstate',state.revision,env);return {state:s,revision:s._revision}}
const supported=new Set(['O17','I07','C02','C04','F02','F03','F04','O01','O02','O03','O07','O08','O09','I02','P01','P07']);
export async function publish(db,owner,p,env){const d=await get(db,owner,p.id);if(d?._kind!=='service'||d._revision!==p.expected)throw Error('请先保存当前服务版本');const mode=p.mode||'service';if(!['prototype','service','watchface'].includes(mode))throw Error('发布类型无效');if(mode==='service'){const nodes=d.nodes.filter(n=>n.mode!=='optional');if(!nodes.length||nodes.some(n=>!supported.has(n.atomId)&&!n.atomId?.startsWith('C_APIFY_')))throw Error('存在尚无执行器的必选能力');if(!nodes.some(n=>['O03','O08'].includes(n.atomId)))throw Error('请添加独立应用窗口');const ids=new Set(nodes.map(n=>n.id)),done=new Set();while(done.size<ids.size){const ready=nodes.filter(n=>!done.has(n.id)&&!(d.edges||[]).some(e=>e.to===n.id&&ids.has(e.from)&&!done.has(e.from)));if(!ready.length)throw Error('工作流存在循环');ready.forEach(n=>done.add(n.id))}}if(mode==='prototype'&&(!d.pages?.some(x=>x.id===d.startPage)))throw Error('原型首页未设置');if(mode==='watchface'&&(!d.watchface||d.watchface.background!=='#000000'&&d.watchface.background!=='#000'))throw Error('眼镜表盘需要纯黑背景');const previous=(await docs(db,owner)).filter(x=>x._kind==='release'&&x.sourceId===d.id);let r=previous.find(x=>x.sourceRevision===d._revision&&x.mode===mode);if(!r)r=await save(db,owner,{id:crypto.randomUUID(),sourceId:d.id,name:d.name,version:Math.max(0,...previous.map(x=>x.version))+1,sourceRevision:d._revision,mode,publishedAt:Date.now()/1000,snapshot:d},'release',null,env);if(mode!=='watchface')await install(db,owner,{sourceId:d.id,releaseId:r.id},env);return {release:r,installed:mode!=='watchface',registered:true}}
export async function quota(db,owner,limit=100){const day=new Date().toISOString().slice(0,10);await db.prepare('INSERT OR IGNORE INTO usage_limits(owner,day,calls) VALUES(?,?,0)').bind(owner,day).run();const r=await db.prepare('UPDATE usage_limits SET calls=calls+1 WHERE owner=? AND day=? AND calls<?').bind(owner,day,limit).run();if(!r.meta.changes)throw Object.assign(Error('今日模型调用额度已用完，请联系所有者'),{status:429})}
