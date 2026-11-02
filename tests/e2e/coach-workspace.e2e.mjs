// Real UI with synthetic relationships; no real users, downloads contain fixture values only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname,A='00000000-0000-4000-8000-000000000841',B='00000000-0000-4000-8000-000000000842';
const ago=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10),month=()=>ago(0).slice(0,7);
let server,browser,BASE;
before(async()=>{const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch();});
after(async()=>{await browser?.close();server?.kill();});
async function fixture({width=360,enabled=true,pages=false,partialTasks=false,exportFailure='',holdExport=false}={}){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',acceptDownloads:true});await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);const calls=[],downloads=[],errors=[];let exportReads=0,snapshotReads=0,release;
 page.on('download',d=>downloads.push(d));page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/js/app/coaching.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(BASE+'/coaching');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({A,enabled})=>{window.state.user.id=A;window.state.history=[{sport:'running',unit:'min',val:9999,date:new Date().toISOString(),details:{note:'OWN_PRIVATE'}}];window.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:'fixture'}}})}};const old=window.titanFlags.enabled;window.workspaceFlag=enabled;window.titanFlags.enabled=(k,f)=>['screens.coachworkspace','screens.coachcalendar','screens.coachexport'].includes(k)?window.workspaceFlag:old(k,f);},{A,enabled});
 const links=[['one','Émilie','running'],['two','Malo','yoga'],['three','Amélie',null]].map(([id,name,sport])=>({id,coach_id:A,athlete_id:'athlete-'+id,athlete_name:name,coach_name:'Coach',sport,since_date:ago(50),accepted_at:ago(50)+'T12:00:00Z',revision:1,share_notes:true,share_details:true}));
 await page.route('**/rest/v1/rpc/titan_coach_portal',async route=>{
  const {p_action:action,p_data:data}=route.request().postDataJSON();calls.push({action,data});
  const link=links.find(l=>l.id===data.link_id)||links[0];let body,status=200;
  if(action==='snapshot'){snapshotReads++;body={owner:A,capacity:3,invites:[],links:exportFailure==='revoked'&&snapshotReads>=3?[]:links.map(l=>exportFailure==='revision'&&snapshotReads>=3?{...l,revision:2}:l)};}
  if(action==='sessions'){
   const isExport=snapshotReads>=2; if(isExport){exportReads++;if(holdExport&&exportReads===1)await new Promise(r=>release=r);}
   const count=pages?101:2,offset=data.offset||0;
   const rows=Array.from({length:Math.min(100,count-offset)},(_,i)=>({id:link.id+'-'+(offset+i),sport:'running',date:ago(2)+'T12:00:00Z',unit:'km',val:5,details:{duration:offset+i===0?0:30,note:'SECRET_NOTE',trace:[1,2],bio:{rpe:8}}}));
   body={owner:A,link_id:link.id,revision:1,from_date:data.from_date,to_date:data.to_date,rows,total:count};
   if(isExport&&exportFailure==='network'){status=503;body={message:'UNAVAILABLE'};}
   if(isExport&&exportFailure==='foreign')body.owner=B;
   if(isExport&&exportFailure==='duplicate'&&offset)body.rows[0].id=link.id+'-0';
  }
  if(action==='assignments')body={link_id:link.id,revision:1,total:partialTasks?5:3,rows:[{id:'a',title:'Endurance',sport:'running',status:'accepted',planned_date:month()+'-03'},{id:'b',title:'Repos choisi',sport:'yoga',status:'declined',planned_date:month()+'-03'},{id:'c',title:'Réalisée',sport:'running',status:'completed',planned_date:month()+'-05'}]};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body||{})}).catch(()=>{});
 });
 await page.addScriptTag({path:ROOT+'/js/app/coaching.js'});await page.locator('[data-mode="coach"]').click();await page.getByRole('heading',{name:'Émilie',exact:true}).waitFor();await page.locator('[data-period] button').waitFor();
 return {page,context,calls,downloads,errors,release:()=>release?.()};
}
async function audit(page,selector){await page.addScriptTag({content:readFileSync(ROOT+'/node_modules/axe-core/axe.min.js','utf8')});const v=await page.evaluate(async selector=>(await axe.run(document.querySelector(selector),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations,selector);assert.deepEqual(v.map(v=>v.id),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}

test('Coach roster searches accents, filters shared sports without requests and selects the correct athlete',async()=>{
 for(const width of [360,1280]){const f=await fixture({width}),{page}=f;try{
  await page.locator('[data-co-roster]').waitFor();const before=f.calls.length;
  await page.getByLabel('Rechercher un athlète').fill('EMILIE');assert.equal(await page.locator('[data-co-roster] [data-link]').count(),1);assert.equal(f.calls.length,before);
  await page.getByLabel('Rechercher un athlète').fill('');await page.getByLabel('Sport partagé').selectOption('yoga');assert.equal(await page.locator('[data-co-roster] [data-link]').count(),2);
  await page.locator('[data-co-roster] [data-link="two"]').click();await page.getByRole('heading',{name:'Malo',exact:true}).waitFor();
  assert.equal(f.calls.filter(c=>c.action==='sessions').at(-1).data.link_id,'two');
  await audit(page,'[data-co-roster]');await page.screenshot({path:'/tmp/titan-workspace-'+width+'.png',fullPage:true});assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}}
});
test('Coach roster preserves search focus through flag refresh and clears on account change',async()=>{
 const f=await fixture(),{page}=f;try{
  const search=page.getByLabel('Rechercher un athlète');await search.fill('EM');await search.focus();const before=f.calls.length;
  await page.evaluate(()=>window.dispatchEvent(new Event('titan:flags-updated')));
  assert.equal(await search.inputValue(),'EM');assert.equal(await search.evaluate(e=>e===document.activeElement),true);assert.equal(f.calls.length,before);
  await page.evaluate(B=>{window.titanAccountTransition={active:true,epoch:(window.titanAccountTransition?.epoch||0)+1};window.dispatchEvent(new Event('titan:account-changing'));window.state.user.id=B;},B);
  assert.equal(await page.locator('[data-co-roster]').count(),0);assert.equal(await page.locator('[data-co-calendar]').count(),0);
 }finally{await f.context.close();}
});
test('Coach calendar groups proposals in UTC, filters statuses, navigates months with focus and reports partial pages',async()=>{
 const f=await fixture({partialTasks:true}),{page}=f;try{
  const cal=page.locator('[data-co-calendar]');await cal.waitFor();assert.match(await cal.innerText(),/partiel/i);assert.match(await cal.innerText(),/3.*5/);
  assert.equal(await cal.locator('[data-calendar-day]').count(),2);await page.getByLabel('Statut des propositions').selectOption('declined');assert.equal(await cal.locator('[data-calendar-task]').count(),1);assert.match(await cal.innerText(),/Déclinée/);
  const before=f.calls.length;await cal.getByRole('button',{name:'Mois suivant',exact:true}).click();assert.equal(await cal.locator('[data-calendar-task]').count(),0);assert.match(await cal.innerText(),/chargées/);assert.equal(await cal.getByRole('button',{name:'Mois suivant',exact:true}).evaluate(e=>e===document.activeElement),true);
  await cal.getByRole('button',{name:'Mois actuel',exact:true}).click();assert.equal(await cal.locator('[data-calendar-task]').count(),1);assert.equal(f.calls.length,before);await audit(page,'[data-co-calendar]');
 }finally{await f.context.close();}
});
test('CSV rechecks access before and after paginated reads and downloads allowlisted complete data',async()=>{
 const f=await fixture({pages:true}),{page}=f;try{
  const before=f.calls.length,pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter les séances partagées (CSV)',exact:true}).click();
  const download=await pending,path=await download.path(),text=readFileSync(path,'utf8');assert.match(download.suggestedFilename(),/^titan-coach-.*\.csv$/);
  assert.equal(text.trim().split('\r\n').length,102);assert.ok(!text.includes('SECRET_NOTE'));assert.ok(!text.includes('OWN_PRIVATE'));assert.ok(!text.includes('rpe'));assert.ok(text.includes(';"0";'));
  assert.deepEqual(f.calls.slice(before).map(c=>c.action),['snapshot','sessions','sessions','snapshot']);assert.deepEqual(f.calls.slice(before).filter(c=>c.action==='sessions').map(c=>c.data.offset),[0,100]);
  assert.match(await page.locator('[data-export-status]').innerText(),/101/);assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});
for(const failure of ['revoked','revision','network','foreign','duplicate'])test('CSV refuses '+failure+' without creating a downloadable file',async()=>{
 const f=await fixture({exportFailure:failure,pages:failure==='duplicate'}),{page}=f;try{
  await page.getByRole('button',{name:'Exporter les séances partagées (CSV)',exact:true}).click();await page.locator('[data-export-error]').filter({hasText:/./}).waitFor();assert.equal(f.downloads.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});
for(const transition of ['account','flag','athlete','mode','period'])test('CSV discards a pending result after '+transition+' change',async()=>{
 const f=await fixture({holdExport:true}),{page}=f;try{
  await page.getByRole('button',{name:'Exporter les séances partagées (CSV)',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-export-status]')?.textContent.includes('Lecture'));
  if(transition==='account')await page.evaluate(B=>{window.titanAccountTransition={active:true,epoch:(window.titanAccountTransition?.epoch||0)+1};window.dispatchEvent(new Event('titan:account-changing'));window.state.user.id=B;},B);
  if(transition==='flag')await page.evaluate(()=>{window.workspaceFlag=false;window.dispatchEvent(new Event('titan:flags-updated'));window.workspaceFlag=true;window.dispatchEvent(new Event('titan:flags-updated'));});
  if(transition==='athlete')await page.locator('[data-co-roster] [data-link="two"]').click();
  if(transition==='mode')await page.locator('[data-mode="athlete"]').click();
  if(transition==='period')await page.locator('[data-period] button').click();
  f.release();await page.evaluate(()=>new Promise(r=>setTimeout(r,100)));assert.equal(f.downloads.length,0);assert.deepEqual(f.errors,[]);
 }finally{f.release();await f.context.close();}
});
test('workspace additions remain off by default and absent from athlete mode',async()=>{
 const f=await fixture({enabled:false}),{page}=f;try{
  assert.equal(await page.locator('[data-co-roster]').count(),0);assert.equal(await page.locator('[data-co-calendar]').count(),0);assert.equal(await page.locator('[data-co-export]').count(),0);
  await page.evaluate(()=>{window.workspaceFlag=true;window.dispatchEvent(new Event('titan:flags-updated'));});await page.locator('[data-co-roster]').waitFor();
  await page.locator('[data-mode="athlete"]').click();assert.equal(await page.locator('[data-co-roster]').count(),0);assert.equal(await page.locator('[data-co-calendar]').count(),0);assert.equal(await page.locator('[data-co-export]').count(),0);
 }finally{await f.context.close();}
});


test('roster flag changes retain an athlete navigation path without duplicated visible menus',async()=>{
 const f=await fixture(),{page}=f;try{
  await page.locator('[data-co-roster]').waitFor();
  await page.evaluate(()=>{window.workspaceFlag=false;window.dispatchEvent(new Event('titan:flags-updated'));});
  assert.equal(await page.locator('[data-co-roster]').count(),0);await page.locator('nav[aria-label="Suivis"] [data-link="two"]').click();await page.getByRole('heading',{name:'Malo',exact:true}).waitFor();
  await page.evaluate(()=>{window.workspaceFlag=true;window.dispatchEvent(new Event('titan:flags-updated'));});
  await page.locator('[data-co-roster]').waitFor();assert.equal(await page.locator('nav[aria-label="Suivis"]').isVisible(),false);
 }finally{await f.context.close();}
});
