import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname,A='00000000-0000-4000-8000-000000000841',B='00000000-0000-4000-8000-000000000842';
const ago=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
let server,browser,BASE;
before(async()=>{const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch();});
after(async()=>{await browser?.close();server?.kill();});
async function fixture({width=360,partial=false,enabled=true,zero=false,short=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);const calls=[];let revoked=false;
 await page.route('**/js/app/coaching.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(BASE+'/coaching');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({A,enabled})=>{window.state.user.id=A;window.state.history=[{sport:'running',unit:'min',val:9999,date:new Date().toISOString(),details:{duration:9999,note:'Own private history'}}];window.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:'fixture'}}})}};const old=window.titanFlags.enabled;window.titanFlags.enabled=(k,f)=>k==='screens.coachanalysis'?enabled:old(k,f);},{A,enabled});
 await page.route('**/rest/v1/rpc/titan_coach_portal',async route=>{
  const {p_action:action,p_data:data}=route.request().postDataJSON();calls.push({action,data});
  const id=await page.evaluate(()=>window.state.user.id),label=id===A?'A':'B';
  const link={id:'link-'+label,coach_id:id,athlete_id:'athlete-'+label,athlete_name:'Athlète '+label,coach_name:'Coach',accepted_at:ago(15)+'T12:00:00Z',since_date:ago(15),revision:1,share_details:false,share_notes:false};
  const rows=[{id:'run-'+label,sport:'running',unit:'km',val:5,date:ago(5)+'T12:00:00Z',details:{duration:30}},{id:'yoga-'+label,sport:'yoga',unit:'min',val:20,date:ago(4)+'T12:00:00Z',details:{duration:20}},{id:'gym-'+label,sport:'muscu_gym',unit:'kg',val:100,date:ago(3)+'T12:00:00Z',details:{}}];
  if(zero){rows[0].details.duration=0;rows[1].details.duration=0;}
  const tasks=[{id:'t1-'+label,status:'completed',planned_date:ago(5),sport:'running',title:'Sortie'},{id:'t2-'+label,status:'accepted',planned_date:ago(4),sport:'yoga',title:'Mobilité'}];
  let body=action==='snapshot'?{capacity:3,invites:[],links:[link]}:action==='sessions'?{link_id:link.id,revision:1,total:partial?4:3,from_date:ago(short?5:15),to_date:ago(0),rows:partial&&data.offset?[{id:'extra-'+label,sport:'running',unit:'min',val:10,date:ago(2)+'T12:00:00Z',details:{duration:10}}]:rows}:action==='assignments'?{link_id:link.id,revision:1,total:partial?3:2,rows:partial&&data.offset?[{id:'t3-'+label,status:'completed',planned_date:ago(3),sport:'running',title:'Suite'}]:tasks}:{};
  let status=200;if(revoked&&action==='sessions'){body={message:'SHARING_UNAVAILABLE'};status=403;}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
 });
 await page.addScriptTag({path:ROOT+'/js/app/coaching.js'});await page.locator('[data-mode="coach"]').click();await page.getByRole('heading',{name:'Athlète A',exact:true}).waitFor();
 return {page,context,calls,revoke:()=>{revoked=true;}};
}

test('Coach summary uses only consented data and displays coverage, sports and honest programme adherence',async()=>{
 for(const width of [360,1280]){const {page,context,calls}=await fixture({width});try{
  await page.locator('[data-co-analysis]').waitFor();assert.match(await page.locator('[data-ca-minutes]').innerText(),/50/);
  assert.equal(await page.locator('[data-ca-sessions]').innerText(),'3');assert.match(await page.locator('[data-ca-adherence]').innerText(),/50/);
  assert.equal(await page.locator('[data-ca-sports] tbody tr').count(),3);assert.match(await page.locator('[data-co-analysis]').innerText(),/1 séance.*sans durée/);
  assert.match(await page.locator('[data-co-analysis]').innerText(),/sRPE.*indisponible/s);
  const comparison=page.locator('[data-ca-comparison]');await comparison.waitFor();assert.match(await comparison.innerText(),/7 jours complets/);
  assert.equal(await comparison.locator('[data-ca-current-sessions]').innerText(),'3');assert.equal(await comparison.locator('[data-ca-previous-sessions]').innerText(),'0');
  assert.match(await comparison.locator('[data-ca-session-delta]').innerText(),/\+3/);assert.match(await comparison.innerText(),/Durées incomplètes/);
  assert.equal(await comparison.locator('[data-ca-sport-trends] tbody tr').count(),3);
  assert.ok((await comparison.innerText()).includes(ago(14)));assert.ok((await comparison.innerText()).includes(ago(1)));
  await page.screenshot({path:'/tmp/titan-coach-comparison-'+width+'.png',fullPage:true});assert.ok(!(await page.locator('[data-co-analysis]').innerText()).includes('9999'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(calls.map(c=>c.action).sort(),['assignments','sessions','snapshot']);
  await page.addScriptTag({content:readFileSync(ROOT+'/node_modules/axe-core/axe.min.js','utf8')});const violations=await page.evaluate(async()=>(await axe.run(document.querySelector('[data-co-analysis]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);assert.deepEqual(violations.map(v=>v.id),[]);
 }finally{await context.close();}}
});

test('partial pages warn and suppress the rate until all proposal pages have been loaded',async()=>{
 const {page,context}=await fixture({partial:true});try{
  await page.locator('[data-co-analysis]').waitFor();assert.match(await page.locator('[data-co-analysis]').innerText(),/partiel/i);
  assert.doesNotMatch(await page.locator('[data-ca-adherence]').innerText(),/%/);
  assert.equal(await page.locator('[data-ca-comparison]').count(),0);assert.match(await page.locator('[data-ca-comparison-unavailable]').innerText(),/pages/);
  await page.locator('[data-more-tasks]').click();await page.waitForFunction(()=>document.querySelector('[data-ca-adherence]')?.textContent.includes('67'));
  await page.locator('[data-more-sessions]').click();await page.waitForFunction(()=>document.querySelector('[data-ca-minutes]')?.textContent.includes('1 h'));
  assert.doesNotMatch(await page.locator('[data-co-analysis]').innerText(),/bilan partiel/i);
  await page.locator('[data-ca-comparison]').waitFor();assert.equal(await page.locator('[data-ca-current-sessions]').innerText(),'4');
 }finally{await context.close();}
});

test('analysis is opt-in and coach-only; flag refresh adds no request or local cache',async()=>{
 const {page,context,calls}=await fixture({enabled:false});try{
  assert.equal(await page.locator('[data-co-analysis]').count(),0);const before=calls.length;
  await page.evaluate(()=>{const old=window.titanFlags.enabled;window.titanFlags.enabled=(k,f)=>k==='screens.coachanalysis'||old(k,f);window.dispatchEvent(new Event('titan:flags-updated'));});
  await page.locator('[data-co-analysis]').waitFor();assert.equal(calls.length,before);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('coach_analysis'))),false);
  await page.locator('[data-period] [name="from"]').fill('2026-10-20');await page.locator('[data-period] [name="from"]').focus();
  await page.evaluate(()=>{window.titanFlags.enabled=()=>false;window.dispatchEvent(new Event('titan:flags-updated'));});
  assert.equal(await page.locator('[data-co-analysis]').count(),0);assert.equal(await page.locator('[data-period] [name="from"]').inputValue(),'2026-10-20');
  assert.equal(await page.locator('[data-period] [name="from"]').evaluate(e=>e===document.activeElement),true);assert.equal(calls.length,before);
  await page.locator('[data-mode="athlete"]').click();assert.equal(await page.locator('[data-co-analysis]').count(),0);
 }finally{await context.close();}
});

test('revocation failure removes the previous private summary',async()=>{
 const {page,context,revoke}=await fixture();try{
  await page.locator('[data-co-analysis]').waitFor();revoke();await page.locator('[data-period] button').click();
  await page.waitForFunction(()=>document.querySelector('#coaching').textContent.includes('révoqué'));
  assert.equal(await page.locator('[data-co-analysis]').count(),0);
 }finally{await context.close();}
});

test('account switch removes the old shared summary before another athlete can load',async()=>{
 const {page,context}=await fixture();try{
  await page.locator('[data-co-analysis]').waitFor();
  await page.evaluate(B=>{window.titanAccountTransition={active:true,epoch:(window.titanAccountTransition?.epoch||0)+1};window.dispatchEvent(new Event('titan:account-changing'));window.state.user.id=B;},B);
  assert.equal(await page.locator('[data-co-analysis]').count(),0);assert.ok(!(await page.locator('#coaching').innerText()).includes('Athlète A'));
 }finally{await context.close();}
});


test('known zero durations remain visible as zero rather than unavailable',async()=>{
 const {page,context}=await fixture({zero:true});try{
  await page.locator('[data-co-analysis]').waitFor();assert.equal(await page.locator('[data-ca-minutes]').innerText(),'0 min');
  assert.ok((await page.locator('[data-ca-sports]').innerText()).includes('0 min'));
  assert.match(await page.locator('[data-co-analysis]').innerText(),/2 séance.*avec une durée/);
 }finally{await context.close();}
});


test('short consent never creates a zero-filled comparison for inaccessible previous days',async()=>{
 const {page,context,calls}=await fixture({short:true});try{
  await page.locator('[data-co-analysis]').waitFor();assert.equal(await page.locator('[data-ca-comparison]').count(),0);
  assert.match(await page.locator('[data-ca-comparison-unavailable]').innerText(),/14 jours/);
  assert.deepEqual(calls.map(c=>c.action).sort(),['assignments','sessions','snapshot']);
 }finally{await context.close();}
});
