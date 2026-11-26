import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync(new URL('../static/video-hub.js',import.meta.url),'utf8');
function setup(){const ctx={window:{},runtimeHandlers:()=>({}),runtimeClick:()=>{},renderHome:()=>{},renderSettings:()=>{},publishService:()=>{},renderRuntimeInspector:()=>{},URL,esc:s=>String(s||'').replace(/</g,'&lt;'),safeUrl:s=>s,ServiceRuntime:{}};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx}
test('only official embed origins are produced, arbitrary source URLs never become players',()=>{const h=setup().window.VideoHub;assert.equal(h.embed({sourcePlatform:'youtube',url:'https://www.youtube.com/watch?v=abcdefghijk'}),'https://www.youtube-nocookie.com/embed/abcdefghijk');assert.equal(h.embed({sourcePlatform:'youtube',url:'https://evil.local/?v=abcdefghijk'}),'');assert.equal(h.embed({sourcePlatform:'bilibili',url:'https://www.bilibili.com/video/BV123abc'}),'https://player.bilibili.com/player.html?bvid=BV123abc&autoplay=0')});
test('two channels remain isolated and local saved videos have platform-scoped IDs',()=>{const h=setup().window.VideoHub,d={name:'视频中心',videoConfig:{query:'test'}},s={videoChannel:'bilibili',videoFeeds:{youtube:{items:[{id:'same',title:'YT',sourcePlatform:'youtube'}]},bilibili:{type:'content-feed',query:'test',platform:'bilibili',source:'真实来源',at:1,items:[{id:'same',title:'B站',sourcePlatform:'bilibili'}]}}};const html=h.render(d,s);assert.match(html,/B站/);assert.doesNotMatch(html,/>YT</);assert.notEqual(h.key({id:'same',sourcePlatform:'youtube'}),h.key({id:'same',sourcePlatform:'bilibili'}));assert.match(html,/data-focus-default/);assert.doesNotMatch(html,/data-video-search|刷新最新数据|VIDEO \/|个性化推荐/)});
test('Bilibili embeds reject non-Bilibili URLs even with a BV id',()=>{assert.equal(setup().window.VideoHub.embed({sourcePlatform:'bilibili',url:'https://evil.local/video/BV123abc'}),'')});
test('switching channels never starts inactive Actors and missing credentials stop before billed execution',async()=>{const c=setup();let checks=0;c.connectorLoad=async()=>{checks++;return {config:{configured:false}}};const h=c.runtimeHandlers({template:'video'},{videoChannel:'bilibili'});assert.equal((await h.C_APIFY_YOUTUBE_SEARCH({},[])).inactive,true);assert.equal(checks,0);await assert.rejects(()=>h.C_APIFY_BILIBILI_SEARCH({},[]),/尚未配置/);assert.equal(checks,1)});
test('a new search does not display results cached for a different query',()=>{const h=setup().window.VideoHub,s={videoChannel:'youtube',videoQuery:'new',videoFeeds:{youtube:{query:'old',items:[{title:'OLD'}]}}};assert.equal(h.data({videoConfig:{query:'new'}},s),undefined)});
test('official YouTube source runs without loading or billing Apify',async()=>{const c=setup();const official=fs.readFileSync(new URL('../static/youtube-official.js',import.meta.url),'utf8');c.api=()=>{};c.osContent=()=>{};let calls=[];c.connectorAPI=async(path,p)=>{calls.push([path,p]);return {type:'content-feed',platform:'youtube',query:p.query,items:[{id:'abcdefghijk'}]}};c.connectorLoad=()=>{throw Error('Apify must not be touched')};vm.runInContext(official,c);const s={};const h=c.runtimeHandlers({template:'video',videoConfig:{query:'AR'}},s);await h.C_YOUTUBE_SEARCH({config:'{"maxResults":5}'});assert.equal(calls[0][0],'youtube/search');assert.equal(s.videoFeeds.youtube.items.length,1)});
test('stream pagination survives a stale saved detail route after refreshed results change',()=>{const c=setup();c.VideoHub=c.window.VideoHub;vm.runInContext(fs.readFileSync(new URL('../static/content-streams.js',import.meta.url),'utf8'),c);const s={route:'video-detail',videoPost:'youtube:missing',videoQuery:'AR',videoFeeds:{youtube:{query:'AR',platform:'youtube',nextPageToken:'PAGE2',items:[{id:'abcdefghijk',title:'Current',sourcePlatform:'youtube',url:'https://www.youtube.com/watch?v=abcdefghijk'}]}}};assert.match(c.VideoHub.render({template:'video',videoConfig:{query:'AR'}},s),/stream-video-more/)});

test('assistant playback takes priority over a restored app query',async()=>{
  const ctx=setup();
  const instance={doc:{nodes:[{atomId:'C_YOUTUBE_SEARCH'}]},s:{}};
  ctx.osInstance=()=>instance;
  ctx.osLaunch=async()=>Object.assign(instance.s,{videoQuery:'previous',route:'today'});
  ctx.ServiceRuntime.navigate=(s,route)=>{s.route=route;};
  ctx.renderOS=()=>{};
  const item={id:'abcdefghijk',sourcePlatform:'youtube',url:'https://www.youtube.com/watch?v=abcdefghijk'};
  const hub=ctx.window.VideoHub;
  await hub.playFromAssistant('youtube',{query:'AI tools',at:1,items:[item]},item.id);
  assert.equal(instance.s.videoQuery,'AI tools');
  assert.match(hub.render(instance.doc,instance.s),/autoplay=1/);
});
