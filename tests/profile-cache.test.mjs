import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
test('every profile-script entry has a fresh, coherent URL across HTML pages',()=>{
 const versions=new Set();let references=0;
 for(const file of readdirSync(root).filter(f=>f.endsWith('.html'))){
  const html=readFileSync(new URL(file,root),'utf8');
  for(const m of html.matchAll(/src=["'](?:\.\/|\/)?js\/(?:state|training-store)\.js([^"']*)["']/g)){
   const v=new URLSearchParams(m[1].replace(/^\?/, '')).get('v');
   assert.match(v??'',/^(300|301)\.profile-sync\./,`${file}: HTTP-cached legacy script URL`);versions.add(v);references++;
  }
 }
 assert(references>=20,'application entry points covered');assert.equal(versions.size,1);
});
test('a new worker reloads precache assets instead of reusing a seven-day HTTP cache',async()=>{
 let code=readFileSync(new URL('sw.js',root),'utf8');
 code=code.replace('const ASSETS_TO_CACHE = [/* PRECACHE */];','const ASSETS_TO_CACHE = ["./js/state.js?v=fixture", "./training.html"];');
 const handlers={},requests=[];let done;
 const self={location:{href:'https://titan-app.fr/sw.js'},addEventListener:(event,fn)=>handlers[event]=fn,clients:{matchAll:async()=>[]}};
 vm.runInNewContext(code,{self,URL,Request,Promise,caches:{open:async()=>({add:async request=>requests.push(request)})}});
 handlers.install({waitUntil:promise=>{done=promise;}});await done;
 assert.equal(requests.length,2);for(const request of requests){assert.equal(request.cache,'reload');assert(request.url.startsWith('https://titan-app.fr/'));}
});
