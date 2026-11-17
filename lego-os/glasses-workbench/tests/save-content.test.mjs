import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../static/v2.js',import.meta.url),'utf8').split('\n')[0];
const context=vm.createContext({});vm.runInContext(source,context);
const key=value=>context.serviceContentKey(value);
test('new payload field after server metadata does not trigger endless autosave',()=>{
 const before={id:'s',nodes:[],_kind:'service',_revision:2,timetable:{start:'2026-11-09',courses:[]}};
 const saved={id:'s',nodes:[],timetable:{courses:[],start:'2026-11-09'},_kind:'service',_revision:3};
 assert.equal(key(before),key(saved));
});
test('real edits during save and array order changes stay dirty',()=>{
 assert.notEqual(key({elements:[{text:'old'}]}),key({elements:[{text:'new'}]}));
 assert.notEqual(key({elements:['a','b']}),key({elements:['b','a']}));
});
