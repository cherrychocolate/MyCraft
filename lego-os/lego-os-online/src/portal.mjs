import {isOwner} from './security.mjs';
import {get,save,quota} from './store.mjs';

const policyOwner = '__site';
const previewOwner = '__preview';
const cookie = '__Host-mycraft-simulator';
const ttl = 6 * 3600;
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const encoder = new TextEncoder();
async function sign(secret, data) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64(await crypto.subtle.sign('HMAC',key,encoder.encode(data)));
}

export async function accessMode(env) {
  return (await get(env.DB,policyOwner,'site-access'))?.mode === 'approval' ? 'approval' : 'trial';
}
export async function setMode(env, mode) {
  if(!['trial','approval'].includes(mode)) throw Error('访问模式无效');
  const old = await get(env.DB,policyOwner,'site-access');
  await save(env.DB,policyOwner,{id:'site-access',mode},'internal',old?._revision,env);
  return {mode};
}
export async function visitor(env,user) {
  const mode = await accessMode(env);
  const manager = isOwner(user,env);
  const review = user && !manager ? await env.DB.prepare('SELECT status FROM access_requests WHERE user_id=?').bind(user.id).first() : null;
  const usable = !!user && (manager || review?.status==='approved' || mode==='trial' && review?.status!=='revoked');
  return {mode,manager,usable,review:review?.status||null,owner:usable?user.id:previewOwner};
}
export async function pageSession(env,user) {
  if(!user||!env.WORKBENCH_SESSION_SECRET) return '';
  const expires = Math.floor(Date.now()/1000)+ttl;
  const mac = await sign(env.WORKBENCH_SESSION_SECRET,user.id+':'+expires);
  return `${cookie}=${expires}.${mac}; Path=/; Max-Age=${ttl}; Secure; HttpOnly; SameSite=Strict`;
}
export async function hasPageSession(req,env,user) {
  if(!user||!env.WORKBENCH_SESSION_SECRET) return false;
  const token=(req.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);
  const [time,mac] = (token||'').split('.');
  if(!/^\d{10}$/.test(time)||!mac||Number(time)<Math.floor(Date.now()/1000)) return false;
  const expected = await sign(env.WORKBENCH_SESSION_SECRET,user.id+':'+time);
  if(mac.length!==expected.length)return false;
  let mismatch=0;
  for(let i=0;i<mac.length;i++) mismatch|=mac.charCodeAt(i)^expected.charCodeAt(i);
  return mismatch===0;
}
export async function protectTrial(env, owner, path) {
  if(path.startsWith('/api/models/agent/')||path.startsWith('/api/models/voice/')) {
    await quota(env.DB,'__trial:'+owner,45);
    await quota(env.DB,'__trial:site',800);
  }
}
