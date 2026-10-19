// Public athlete recovery on its real screen with a synthetic read-only RPC.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local athlete server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}

async function athletePage({width=360, mode='ok', online=true, slug='abcd123456'}={}) {
  const f=await newPage(width),{page}=f;
  await page.route('**/js/app/athlete.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(BASE+'/u/'+slug,{waitUntil:'load'});
  await page.evaluate(({mode,online})=>{
    window.athleteOnline=online; Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>window.athleteOnline});
    window.athleteMode=mode;window.athleteCalls=[];window.athleteReleases=[];
    window.athleteCard=slug=>({name:'Athlète '+slug,avatar:'scout',sports:[],titles:[]});
    window.titanClient={rpc:(name,p)=>{
      if(name!=='titan_public_card')throw Error('unexpected athlete RPC');
      window.athleteCalls.push(p);
      const result=()=>window.athleteMode==='error'?{error:{message:'Network failed'}}:window.athleteMode==='missing'?{error:{code:'PGRST202'}}:window.athleteMode==='none'?{data:null}:{data:window.athleteCard(p.p_slug)};
      if(window.athleteMode==='held')return new Promise(resolve=>window.athleteReleases.push(()=>resolve({data:window.athleteCard(p.p_slug)})));
      if(window.athleteMode==='throw')throw Error('Network failed');
      return Promise.resolve(result());
    }};
  },{mode,online});
  await page.addScriptTag({path:ROOT+'/js/app/athlete.js'});
  return f;
}
const ready=page=>page.waitForFunction(()=>document.querySelector('#athlete').getAttribute('aria-busy')==='false');
const focusId=page=>page.evaluate(()=>document.activeElement?.id);
async function reconnect(page){await page.evaluate(()=>{window.athleteOnline=true;window.dispatchEvent(new Event('online'));});}

test('athlete recovery: network error offers an explicit retry and keyboard success',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await athletePage({width,mode:'error'});
  try{
   await ready(page);assert.equal(await page.locator('#athlete-retry').count(),1);
   await page.evaluate(()=>{window.athleteMode='ok';});
   await page.locator('#athlete-retry').focus();await page.keyboard.press('Enter');await ready(page);
   assert.match(await page.locator('#athlete h1').textContent(),/Athlète abcd123456/);
   assert.equal(await page.locator('#athlete h1').evaluate(el=>el===document.activeElement),true);
   assert.equal(await page.evaluate(()=>window.athleteCalls.length),2);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
test('athlete recovery: offline entry waits for reconnection and reads once',async()=>{
 const {page,context,errors}=await athletePage({online:false});
 try{
  await ready(page);assert.equal(await page.evaluate(()=>window.athleteCalls.length),0);
  assert.match(await page.locator('#athlete').textContent(),/Pas de réseau/);
  await reconnect(page);await ready(page);assert.match(await page.locator('#athlete h1').textContent(),/Athlète/);
  await reconnect(page);assert.equal(await page.evaluate(()=>window.athleteCalls.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: hanging RPC has a bounded timeout and ignores a late response',async()=>{
 const {page,context,errors}=await newPage();
 try{
  // Configure the deadline before loading the actual module; the RPC deliberately ignores abort.
  await page.route('**/js/app/athlete.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(BASE+'/u/abcd123456');
  await page.evaluate(()=>{const native=window.setTimeout;window.setTimeout=(cb,delay,...args)=>native(cb,delay===12000?0:delay,...args);window.titanClient={rpc:()=>new Promise(resolve=>window.lateAthlete=()=>resolve({data:{name:'OLD',sports:[]}}))};});
  await page.addScriptTag({path:ROOT+'/js/app/athlete.js'});await ready(page);
  assert.equal(await page.locator('#athlete-retry').count(),1);assert.match(await page.locator('#athlete-status').textContent(),/12 secondes/);
  await page.evaluate(()=>window.lateAthlete());assert.doesNotMatch(await page.locator('#athlete').textContent(),/OLD/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const mode of ['none','missing'])test(`athlete recovery: ${mode} keeps the unavailable state without retry`,async()=>{
 const {page,context,errors}=await athletePage({mode});try{
  await ready(page);assert.equal(await page.locator('#athlete-retry').count(),0);
  assert.match(await page.locator('#athlete').textContent(),mode==='missing'?/arrivent bientôt/:/pas disponible/);
  await reconnect(page);assert.equal(await page.evaluate(()=>window.athleteCalls.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: malformed link sends no request',async()=>{
 const {page,context,errors}=await athletePage({slug:'invalid'});try{
  await ready(page);assert.equal(await page.evaluate(()=>window.athleteCalls.length),0);
  assert.equal(await page.locator('#athlete-retry').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: repeated clicks and online events keep one pending read',async()=>{
 const {page,context,errors}=await athletePage({mode:'error'});try{
  await ready(page);assert.equal(await page.locator('#athlete-retry').count(),1);
  await page.evaluate(()=>{window.athleteMode='held';const b=document.querySelector('#athlete-retry');b.click();b.click();window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));});
  assert.equal(await page.evaluate(()=>window.athleteCalls.length),2);
  assert.equal(await page.locator('#athlete-retry').isDisabled(),true);
  assert.equal(await page.locator('#athlete-status').evaluate(el=>Boolean(el.closest('[aria-busy="true"]'))),false);
  await page.evaluate(()=>window.athleteReleases[0]());await ready(page);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: offline cancels a pending read and reconnect ignores its late result',async()=>{
 const {page,context,errors}=await athletePage({mode:'held'});try{
  await page.evaluate(()=>{window.athleteOnline=false;window.dispatchEvent(new Event('offline'));});await ready(page);
  assert.match(await page.locator('#athlete').textContent(),/Pas de réseau/);
  await page.evaluate(()=>{window.athleteMode='ok';});await reconnect(page);await ready(page);
  assert.equal(await page.evaluate(()=>window.athleteCalls.length),2);
  await page.evaluate(()=>{window.athleteCard=()=>({name:'OLD',sports:[]});window.athleteReleases[0]();});
  assert.doesNotMatch(await page.locator('#athlete').textContent(),/OLD/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: changed public link ignores old content and renders the current slug',async()=>{
 const {page,context,errors}=await athletePage({mode:'held'});try{
  await page.evaluate(()=>{window.athleteMode='ok';history.pushState(null,'','/u/zzzz123456');window.dispatchEvent(new PopStateEvent('popstate'));});await ready(page);
  assert.match(await page.locator('#athlete h1').textContent(),/zzzz123456/);
  await page.evaluate(()=>window.athleteReleases[0]());assert.doesNotMatch(await page.locator('#athlete h1').textContent(),/abcd123456/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const kind of ['outside','dialog'])test(`athlete recovery: completion preserves newer ${kind} focus`,async()=>{
 const {page,context,errors}=await athletePage({mode:'error'});try{
  await ready(page);assert.equal(await page.locator('#athlete-retry').count(),1);
  await page.evaluate(()=>{window.athleteMode='held';});await page.locator('#athlete-retry').click();
  await page.evaluate(kind=>{const el=document.createElement(kind==='dialog'?'dialog':'button');el.id='other-focus';el.textContent='Autre';document.body.append(el);if(kind==='dialog'){el.tabIndex=-1;el.showModal();}el.focus();},kind);
  await page.evaluate(()=>window.athleteReleases[0]());await ready(page);
  assert.equal(await focusId(page),'other-focus');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: initial success keeps outside focus and shared content escapes markup',async()=>{
 const {page,context,errors}=await athletePage({mode:'held'});try{
  await page.locator('.asc-brand').focus();await page.evaluate(()=>{window.athleteCard=()=>({name:'<img src=x onerror=alert(1)>',sports:[],titles:[]});window.athleteReleases[0]();});await ready(page);
  assert.equal(await page.locator('.asc-brand').evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('#athlete h1 img').count(),0);assert.match(await page.locator('#athlete h1').textContent(),/<img/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: a thrown transport error is retryable without automatic looping',async()=>{
 const {page,context,errors}=await athletePage({mode:'throw'});try{
  await ready(page);assert.equal(await page.locator('#athlete-retry').count(),1);assert.equal(await page.evaluate(()=>window.athleteCalls.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('athlete recovery: retry while still offline keeps its keyboard target and sends no request',async()=>{
 const {page,context,errors}=await athletePage({online:false});try{
  await ready(page);await page.locator('#athlete-retry').focus();await page.keyboard.press('Enter');
  assert.equal(await focusId(page),'athlete-retry');assert.equal(await page.evaluate(()=>window.athleteCalls.length),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: published sports totals and distinctions keep their original rendering',async()=>{
 const {page,context,errors}=await athletePage({mode:'held'});try{
  await page.evaluate(()=>{window.athleteCard=()=>({name:'Athlète test',avatar:'ranger',level:4,member_since:'2025-01',totals:{sessions:12,minutes:720,weeks:5},sports:[{sport:'running',minutes:720,weeks:5,sessions:12}],titles:[{title:'Titre public',expedition:'Zone publique'}],insignia:2});window.athleteReleases[0]();});await ready(page);
  assert.match(await page.locator('#athlete').textContent(),/Sports et maîtrise/);assert.match(await page.locator('#athlete').textContent(),/Titre public/);
  assert.equal(await page.locator('.ap-totals dd').first().textContent(),'12');assert.equal(await page.locator('.pf-avatar img').getAttribute('src'),'/assets/renaissance/ranger-s.webp');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('athlete recovery: retry before client readiness keeps its target without a second request',async()=>{
 const {page,context,errors}=await athletePage({mode:'error'});try{
  await ready(page);await page.evaluate(()=>{window.titanClient=null;});await page.locator('#athlete-retry').focus();await page.keyboard.press('Enter');
  assert.equal(await focusId(page),'athlete-retry');assert.equal(await page.evaluate(()=>window.athleteCalls.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
