import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './runtime.mjs';
import {sanitize} from '../src/security.mjs';
import {validate} from '../src/agent.mjs';

const origin='https://test.local';
async function entry(r,user) {
  const response=await r.call('/',{user});
  assert.equal(response.status,200);
  const cookie=response.headers.get('Set-Cookie');
  assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);
  return cookie.split(';',1)[0];
}
const post=(r,path,user,cookie,body)=>r.call(path,{user,cookie,body,method:'POST',origin});

test('anonymous visitors see the simulator and sample data. The workbench stays private',async t=>{
  const r=runtime();t.after(r.close);
  const landing=await r.call('/',{user:null});
  assert.equal(landing.status,200);
  assert.equal(landing.headers.get('Referrer-Policy'),'strict-origin-when-cross-origin');
  assert.match(await landing.text(),/os-shell\.js/);
  for(const path of ['/workbench','/index.html','/access','/api/export','/architecture/index.html']){
    assert.equal((await r.call(path,{user:null})).status,404,path);
  }
  const data=await r.call('/api/state',{user:null});
  assert.equal(data.status,200);
  assert.match(await data.text(),/trial-calendar/);
  const sample=await post(r,'/api/calendar',null,undefined,{calendarId:'workbench-calendar',start:'2026-11-23',end:'2026-11-29'});
  assert.equal((await sample.json()).result.length,5);
  assert.equal((await post(r,'/api/models/agent/turn',null,undefined,{text:'你好'})).status,401);
  assert.equal((await r.call('/workbench')).status,200);
  assert.equal((await r.call('/workbench',{user:'alice'})).status,404);
});

test('existing public installations receive the YouTube widget without rewriting the old release',async t=>{
  const r=runtime();t.after(r.close);
  const put=r.db.prepare('INSERT INTO documents(owner,id,kind,body,revision,updated) VALUES(?,?,?,?,?,?)');
  const owner='__preview';
  const state={id:'os-state',installed:{'trial-video':{releaseId:'trial-video-v1',enabled:true}},settings:{brightness:75}};
  const previous={id:'trial-video-v1',mode:'service',snapshot:{nodes:[]}};
  put.run(owner,'__initialized','internal','{}',1,1);
  put.run(owner,'os-state','osstate',JSON.stringify(state),7,1);
  put.run(owner,previous.id,'release',JSON.stringify(previous),1,1);
  const response=await r.call('/api/os',{user:null});
  const updated=await response.json();
  assert.equal(updated.revision,8);
  assert.equal(updated.state.settings.brightness,75);
  assert.equal(updated.state.installed['trial-video'].releaseId,'trial-video-v2');
  const youtube=updated.releases.find(release=>release.id==='trial-video-v2');
  assert.ok(youtube.snapshot.nodes.some(node=>node.atomId==='O07'));
  assert.equal(youtube.snapshot.presentation.widgets[0].id,'videos');
  assert.deepEqual(updated.releases.find(release=>release.id===previous.id).snapshot,previous.snapshot);
});

test('trial services require a matching signed simulator session and enforce the owner policy',async t=>{
  const r=runtime();t.after(r.close);
  const owner=await entry(r,'owner'),alice=await entry(r,'alice'),bob=await entry(r,'bob');
  const path='/api/models/agent/catalog';
  assert.equal((await r.call(path,{user:'alice'})).status,403);
  assert.equal((await r.call(path,{user:'alice',cookie:bob})).status,403);
  assert.equal((await r.call(path,{user:'alice',cookie:alice})).status,200);
  assert.equal((await post(r,'/api/access/mode','alice',alice,{mode:'approval'})).status,404);
  assert.equal((await post(r,'/api/access/mode','owner',owner,{mode:'approval'})).status,200);
  assert.equal((await post(r,'/api/weather',null,undefined,{lat:22.5431,lon:114.0579})).status,401);
  assert.equal((await post(r,'/api/models/youtube/search',null,undefined,{query:'test'})).status,401);
  assert.equal((await r.call(path,{user:'alice',cookie:alice})).status,403);
  assert.equal((await post(r,'/api/access/request','alice',alice,{reason:'体验'})).status,200);
  assert.equal((await post(r,'/api/access/review','owner',owner,{userId:r.prefix+'alice',status:'approved'})).status,200);
  assert.equal((await r.call(path,{user:'alice',cookie:alice})).status,200);
  assert.equal((await post(r,'/api/access/review','owner',owner,{userId:r.prefix+'alice',status:'revoked'})).status,200);
  assert.equal((await r.call(path,{user:'alice',cookie:alice})).status,403);
});

test('public weather and YouTube reach the provider without enabling private services',async t=>{
  const r=runtime();t.after(r.close);
  r.env.YOUTUBE_API_KEY='test-youtube-secret';
  t.mock.method(globalThis,'fetch',async (value,options)=>{
    const url=new URL(value);
    assert.equal(options.redirect,'manual');
    if(url.hostname==='api.open-meteo.com')return Response.json({current:{temperature_2m:22}});
    assert.equal(url.hostname,'www.googleapis.com');
    assert.equal(options.headers['X-Goog-Api-Key'],r.env.YOUTUBE_API_KEY);
    return Response.json({items:[{id:{videoId:'jNQXAC9IVRw'},snippet:{title:'Test video'}}]});
  });
  const weather=await post(r,'/api/weather',null,undefined,{lat:22.5431,lon:114.0579});
  assert.equal(weather.status,200);
  const search=await post(r,'/api/models/youtube/search',null,undefined,{query:'test'});
  assert.equal(search.status,200);
  assert.deepEqual((await search.json()).items.map(v=>v.id),['jNQXAC9IVRw']);
  assert.equal((await post(r,'/api/calendar-import',null,undefined,{})).status,401);
  assert.equal((await post(r,'/api/os-state',null,undefined,{})).status,401);
});

test('cross-origin writes fail and one visitor cannot read another calendar',async t=>{
  const r=runtime();t.after(r.close);
  const alice=await entry(r,'alice'),bob=await entry(r,'bob');
  const read={calendarId:'workbench-calendar',start:'2026-11-26',end:'2026-11-26'};
  const body={ics:'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261126T090000\nSUMMARY:Private Alice event\nEND:VEVENT\nEND:VCALENDAR'};
  const endpoint='/api/calendar-import';
  assert.equal((await r.call(endpoint,{user:'alice',cookie:alice,method:'POST',body,origin:'https://other.local'})).status,403);
  assert.equal((await post(r,endpoint,'alice',alice,body)).status,200);
  assert.match(await (await post(r,'/api/calendar','alice',alice,read)).text(),/Private Alice event/);
  assert.doesNotMatch(await (await post(r,'/api/calendar','bob',bob,read)).text(),/Private Alice event/);
  assert.doesNotMatch(await (await post(r,'/api/calendar',null,undefined,read)).text(),/Private Alice event/);
  assert.equal((await post(r,'/api/save','alice',alice,{})).status,404);
});

test('responses omit secrets and owner-only state cannot be updated by a generic save',async t=>{
  const r=runtime();t.after(r.close);
  const owner=await entry(r,'owner');
  for(const path of ['/api/state','/api/models/state','/api/models/voice/config','/api/export','/workbench','/cloud-session.js']){
    const res=await r.call(path,{cookie:owner});
    assert.equal(res.status,200,path);
    const body=await res.text();
    for(const secret of [r.env.QWEN_API_KEY,r.env.GEMINI_API_KEY,r.env.QWEN_WORKSPACE_ID,r.env.WORKBENCH_SESSION_SECRET])assert.ok(!body.includes(secret),path);
  }
  assert.deepEqual(sanitize({workspaceId:'x',credentialRef:'x',message:r.env.QWEN_API_KEY},r.env),{message:'[protected]'});
  for(const kind of ['settings','model-profile','access_requests','release','osstate'])assert.equal((await post(r,'/api/save','owner',owner,{kind,document:{id:'x'}})).status,400);
  assert.equal((await post(r,'/api/save','owner',owner,{kind:'service',document:{id:'os-state'}})).status,400);
});

test('model actions are limited to installed releases and allowed surfaces',()=>{
  const item={id:'a',releaseId:'r1',surfaces:['window'],routes:['today'],requiresConfirmation:true};
  assert.throws(()=>validate([{type:'run_service',serviceId:'other'}],[item]));
  assert.equal(validate([{type:'present_service',serviceId:'a',surface:'widget'}],[item])[0].surface,'window');
  assert.throws(()=>validate([{type:'fetch',serviceId:'a',url:'https://example.com'}],[item]));
  assert.equal(validate([{type:'run_service',serviceId:'a'}],[item])[0].requiresConfirmation,true);
});
