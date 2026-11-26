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
