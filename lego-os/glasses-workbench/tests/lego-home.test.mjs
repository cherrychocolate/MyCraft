import test from 'node:test';
import assert from 'node:assert/strict';
import '../static/lego-home-engine.js';
const E=globalThis.LegoHomeEngine;
const apps=[{id:'prototype',widget:true,mode:'prototype'},{id:'feed',widget:true},{id:'weather',widget:true,template:'weather'},{id:'window',widget:false}];
test('home selects exactly one usable widget; explicit none and removed pins do not silently change',()=>{
 assert.equal(E.selectPin(apps),'weather');assert.equal(E.selectPin(apps,{homePinServiceId:'feed'}),'feed');assert.equal(E.selectPin(apps,{homePinServiceId:null}),null);assert.equal(E.selectPin(apps,{homePinServiceId:'deleted'}),null);assert.equal(E.selectPin([{id:'window',widget:false}]),null);
});
test('spatial swipes follow surface directions and edge pulls must move inward',()=>{
 assert.equal(E.gesture(100,0),'left');assert.equal(E.gesture(-100,0),'right');assert.equal(E.gesture(0,100),'up');assert.equal(E.gesture(0,-100),'down');assert.equal(E.gesture(20,20),null);assert.equal(E.gesture(0,-100,'up'),null);assert.equal(E.gesture(0,100,'up'),'up');assert.equal(E.gesture(-100,0,'right'),'right');
});
test('voice feedback follows real recording, playback, request and input states',()=>{
 assert.equal(E.phase({},true),'listening');assert.equal(E.phase({},false,true),'speaking');assert.equal(E.phase({busy:true,stage:'正在识别'}),'transcribing');assert.equal(E.phase({busy:true}),'thinking');assert.equal(E.phase({},false,false,true),'composing');assert.equal(E.phase({answer:'ok'}),'answer');assert.equal(E.phase({error:'missing key'}),'error');assert.equal(E.phase({}),'idle');
});
test('activity island never fabricates a recording or a priority notification',()=>{
 assert.equal(E.activity(false,false,[],[{title:'ordinary',priority:'normal',read:false}]),null);assert.equal(E.activity(true,false).kind,'recording');assert.equal(E.activity(false,true).kind,'speaking');assert.equal(E.activity(false,false,[{status:'running',name:'Weather'}]).label,'Weather');assert.equal(E.activity(false,false,[],[{title:'Soon',priority:'high',read:false}]).kind,'priority');assert.equal(E.activity(false,false,[],[{title:'Read',priority:'urgent',read:true}]),null);
});
