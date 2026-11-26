import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ASSETS} from '../src/frozen.mjs';
import {runtime} from './runtime.mjs';

const loadAsset=(context,path)=>vm.runInContext(Buffer.from(ASSETS[path].base64,'base64').toString('utf8'),context,{filename:path});

test('the deployed browser starts a Kai turn using the same-origin model gateway',async t=>{
  const site=runtime();t.after(site.close);
  const user='visitor';
  const landing=await site.call('/',{user});
  const cookie=landing.headers.get('Set-Cookie').split(';',1)[0];
  const location=new URL('https://test.local/');
  const requests=[];
  const context=vm.createContext({
    location,URL,URLSearchParams,AbortController,TextDecoder,setTimeout,clearTimeout,
    modelAPIBase:'/api/models/',localStorage:{getItem:()=>null},
    renderSettings(){},renderRight(){},api(){},configureVoice(){},go(){},
    async fetch(url,options={}){
      requests.push(url);
      const path=new URL(url).pathname;
      return site.call(path,{user,cookie,method:options.method,body:options.body&&JSON.parse(options.body)});
    }
  });
  context.window=context;
  loadAsset(context,'/model-center.js');
  loadAsset(context,'/agent-stream.js');
  const result=await context.AgentStream.turn({text:'帮我看看未来一周的课表'},()=>{});
  assert.equal(result.actions[0].type,'present_schedule');
  assert.ok(requests.includes('https://test.local/api/models/agent/stream'));
  assert.equal(context.ModelCenter.assetURL('/api/models/voice/audio?id=example'),'https://test.local/api/models/voice/audio?id=example');
});

test('800 × 600 shows two rows of five and reveals the next row one at a time',()=>{
  let width=800;
  const context=vm.createContext({
    osInstalled:()=>Array.from({length:20},(_,id)=>({id,release:{name:'App '+id,snapshot:{template:'calendar-test'}}})),
    GlassGraphics:{icon:()=>''},esc:s=>s,osClick(){},document:{addEventListener(){}},
    LegoDisplay:{size:()=>({width}),samples:()=>false}
  });
  context.window=context;
  loadAsset(context,'/os-app-launcher.js');
  const landscape=context.osCenter();
  assert.match(landscape,/data-columns="5" data-visible-rows="2"/);
  assert.equal((landscape.match(/class="os-app-row" inert/g)||[]).length,2);
  const offsets=[];
  const field={dataset:{columns:5,visibleRows:2},querySelectorAll:()=>rows,querySelector:()=>null,
    style:{setProperty:(name,value)=>offsets.push([name,value])}};
  const items=Array.from({length:20},(_,id)=>({id,el:{dataset:{appSlot:id},closest:()=>field,setAttribute(){}}}));
  const rows=Array.from({length:4},(_,index)=>{
    const children=items.slice(index*5,(index+1)*5).map(i=>i.el);
    return {children,inert:index>=2,firstElementChild:children[0]};
  });
  assert.equal(context.LegoAppLauncher.next(items,0,'down'),items[5].el);
  assert.equal(context.LegoAppLauncher.next(items,5,'down'),items[10].el);
  assert.deepEqual(rows.map(row=>row.inert),[true,false,false,true]);
  assert.deepEqual(offsets,[['--launcher-first-row',1]]);
  width=600;
  context.LegoAppLauncher.reset();
  assert.match(context.osCenter(),/data-columns="3" data-visible-rows="3"/);
});

test('YouTube embed identifies the simulator and preserves the full video link',()=>{
  const location=new URL('https://test.local/');
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;');
  const context=vm.createContext({URL,location,esc,safeUrl:esc,runtimeHandlers(){},osClick(){},osSaveBusiness(){},osInstance(){}});
  context.window=context;
  loadAsset(context,'/video-hub.js');
  loadAsset(context,'/content-streams.js');
  const post={id:'jNQXAC9IVRw',sourcePlatform:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'};
  const feed={items:[post],query:'test',platform:'youtube'};
  const html=context.VideoHub.render({videoConfig:{query:'test',youtubeProvider:'official'}},{
    route:'video-detail',videoPost:'youtube:'+post.id,videoFeeds:{youtube:feed}
  });
  assert.match(html,/referrerpolicy="strict-origin-when-cross-origin"/);
  const url=new URL(html.match(/<iframe[^>]* src="([^"]+)"/)[1].replaceAll('&amp;','&'));
  assert.equal(url.searchParams.get('origin'),location.origin);
  assert.equal(url.searchParams.get('widget_referrer'),location.href);
  assert.ok(html.includes('class="video-source-link"'));
});

test('Bing and YouTube bookmarks use a tab and Wikipedia retains the embedded browser',async()=>{
  const opened=[];
  const context=vm.createContext({URL,esc:s=>s,osPage:'home',osContent(){},renderOS(){},osClick(){},osNavigate(page){context.osPage=page},
    open:(...args)=>opened.push(args),LegoHandoffs:{entries:[]},document:{querySelector(){return null}},$(){return null}});
  context.window=context;
  loadAsset(context,'/os-browser.js');
  for(const index of [3,5]){
    await context.osClick({target:{closest:selector=>selector==='[data-browser-bookmark]'?{dataset:{browserBookmark:index}}:null}});
    const html=context.osContent();
    assert.match(html,/在独立标签页打开/);
    assert.doesNotMatch(html,/<iframe/);
  }
  assert.deepEqual(opened.map(([url])=>new URL(url).hostname),['www.bing.com','www.youtube.com']);
  const result=context.LegoBrowser.open('zh.wikipedia.org');
  assert.equal(result.mode,'embedded-webview');
  assert.match(context.osContent(),/<iframe/);
});
