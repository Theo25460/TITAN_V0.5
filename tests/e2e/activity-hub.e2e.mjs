import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
let server,browser,BASE;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const n=s.address().port;s.close(()=>resolve(n));});});
 BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:new URL('../..',import.meta.url).pathname,stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function fixture(url='/training'){
 const context=await browser.newContext({viewport:{width:360,height:900},serviceWorkers:'block'});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(4000);
 await page.goto(BASE+url,{waitUntil:'load'});
 await page.waitForFunction(()=>window.titanFlags && window.state?.user);
 return {page,context};
}
async function enable(page,garmin=false){await page.evaluate(g=>{window.titanFlags.enabled=(k,f=false)=>k==='screens.activityhub'||(g&&k==='screens.garmin')||f;window.dispatchEvent(new Event('titan:flags-updated'));},garmin);}
const gpx='<gpx><trk><trkseg><trkpt lat="45" lon="6"><time>2026-10-29T07:00:00Z</time></trkpt><trkpt lat="45.001" lon="6"><time>2026-10-29T07:01:00Z</time></trkpt></trkseg></trk></gpx>';
const upload=(page,text=gpx,name='sortie.gpx')=>page.locator('[data-hub-gpx]').setInputFiles({name,mimeType:'application/gpx+xml',buffer:Buffer.from(text)});

test('hub is off by default; opt-in opens free manual form in two clicks with keyboard focus',async()=>{
 const {page,context}=await fixture();try{
  await page.locator('#sport-q').waitFor();assert.equal(await page.locator('[data-activity-hub]').count(),0);
  await enable(page);await page.locator('[data-activity-hub]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('[data-act="manual"]').click();assert.equal(await page.locator('#sport-q').evaluate(e=>e===document.activeElement),true);
  await page.locator('[data-sport="running"]').first().click();await page.locator('[data-k="durM"]').fill('25');
  await page.locator('[data-act="save"]').click();await page.locator('dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>window.state.history.at(-1).unit),'min');
 }finally{await context.close();}
});

test('GPX hub uses the chosen compatible sport and keeps precise locations local',async()=>{
 const {page,context}=await fixture();try{
  await enable(page);await page.locator('[data-hub-sport]').selectOption('cycling');await upload(page);
  await page.locator('[data-gpx-preview]').waitFor();assert.equal(new URL(page.url()).searchParams.get('sport'),'cycling');
  await page.locator('[data-act="save"]').click();await page.locator('dialog[open]').waitFor();
  const log=await page.evaluate(()=>window.state.history.at(-1));assert.equal(log.sport,'cycling');assert.equal(log.details.gpxStats.verified,false);
  assert.ok(!JSON.stringify(log).includes('previewSegments'));
 }finally{await context.close();}
});

test('visiting hub and returning or reloading preserves the current manual draft',async()=>{
 const {page,context}=await fixture('/training?sport=running');try{
  await enable(page);await page.locator('[data-k="durM"]').fill('32');await page.locator('[data-k="note"]').fill('Ma séance');
  await page.locator('[data-act="hub"]').click();await page.locator('[data-activity-hub]').waitFor();
  await page.locator('[data-act="resume"]').click();assert.equal(await page.locator('[data-k="durM"]').inputValue(),'32');
  await page.locator('[data-act="hub"]').click();await page.reload({waitUntil:'load'});
  assert.equal(await page.locator('[data-k="note"]').inputValue(),'Ma séance');
 }finally{await context.close();}
});

test('unsupported or oversized files leave hub and existing draft intact',async()=>{
 const {page,context}=await fixture('/training?sport=running');try{
  await enable(page);await page.locator('[data-k="durM"]').fill('27');await page.locator('[data-act="hub"]').click();
  await upload(page,'not a GPX','sortie.fit');await page.locator('[data-hub-status]').filter({hasText:/GPX/}).waitFor();
  await page.evaluate(()=>{const e=document.querySelector('[data-hub-gpx]');Object.defineProperty(e,'files',{configurable:true,value:[{name:'big.gpx',size:16*1024*1024}]});e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('[data-hub-status]').filter({hasText:/15 Mo/}).waitFor();
  await page.locator('[data-act="resume"]').click();assert.equal(await page.locator('[data-k="durM"]').inputValue(),'27');
 }finally{await context.close();}
});

test('late flags never replace a sport search or a manual form; source UI is honest',async()=>{
 const {page,context}=await fixture();try{
  await page.locator('#sport-q').fill('tennis');await enable(page);assert.equal(await page.locator('#sport-q').inputValue(),'tennis');
  await page.locator('#sport-results [data-sport]').first().click();await enable(page);assert.equal(await page.locator('[data-act="save"]').count(),1);
  await page.locator('[data-act="hub"]').click();assert.equal(await page.locator('[data-hub-garmin]').count(),0);
  assert.match(await page.locator('[data-activity-hub]').innerText(),/Garmin.*indisponible/s);
  await enable(page,true);assert.equal(await page.locator('[data-hub-garmin]').getAttribute('href'),'/profile#sources');
 }finally{await context.close();}
});

test('Journal offers a direct free manual link and query bypasses the hub',async()=>{
 const {page,context}=await fixture('/journal');try{
  await enable(page);await page.locator('[data-journal-manual]').click();await page.locator('#sport-q').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('mode'),'manual');
 }finally{await context.close();}
});

test('hub passes a narrow-screen accessibility scan',async()=>{
 const {page,context}=await fixture();try{
  await enable(page);await page.locator('[data-activity-hub]').waitFor();
  await page.addScriptTag({content:readFileSync(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});
  const violations=await page.evaluate(async()=> (await axe.run(document.getElementById('seance'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
  assert.deepEqual(violations.map(v=>v.id),[]);
 }finally{await context.close();}
});

test('a malformed GPX never replaces a stored draft and replacement can be cancelled',async()=>{
 const {page,context}=await fixture('/training?sport=running');try{
  await enable(page);await page.locator('[data-k="durM"]').fill('41');await page.locator('[data-act="hub"]').click();
  await upload(page,'<gpx>broken');await page.locator('[data-hub-status]').filter({hasText:/./}).waitFor();
  await page.locator('[data-act="manual"]').click();await page.locator('dialog[open] [data-cancel]').click();
  await page.locator('[data-act="resume"]').click();assert.equal(await page.locator('[data-k="durM"]').inputValue(),'41');
  await page.locator('[data-act="hub"]').click();await upload(page);await page.locator('dialog[open] [data-cancel]').click();
  await page.locator('[data-act="resume"]').click();assert.equal(await page.locator('[data-k="durM"]').inputValue(),'41');
 }finally{await context.close();}
});

test('leaving the hub invalidates pending file reads',async()=>{
 const {page,context}=await fixture();try{
  await enable(page);
  await page.evaluate(()=>{const e=document.querySelector('[data-hub-gpx]');Object.defineProperty(e,'files',{configurable:true,value:[{name:'delayed.gpx',size:100,text:()=>new Promise(r=>{window.resolveHubFile=r;})}]});e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('[data-act="manual"]').click();
  await page.evaluate(async text=>{window.resolveHubFile(text);await new Promise(requestAnimationFrame);},gpx);
  assert.equal(await page.locator('#sport-q').count(),1);assert.equal(await page.locator('[data-gpx-preview]').count(),0);
 }finally{await context.close();}
});

test('flag refresh preserves chosen GPX discipline and keyboard focus',async()=>{
 const {page,context}=await fixture();try{
  await enable(page);await page.locator('[data-hub-sport]').selectOption('cycling');await page.locator('[data-hub-sport]').focus();
  await enable(page,true);
  assert.equal(await page.locator('[data-hub-sport]').inputValue(),'cycling');
  assert.equal(await page.locator('[data-hub-sport]').evaluate(e=>e===document.activeElement),true);
  await upload(page);await page.locator('[data-gpx-preview]').waitFor();assert.equal(new URL(page.url()).searchParams.get('sport'),'cycling');
 }finally{await context.close();}
});

test('an account transition removes another account draft from the hub',async()=>{
 const {page,context}=await fixture('/training?sport=running');try{
  await enable(page);await page.locator('[data-k="note"]').fill('Private draft A');await page.locator('[data-act="hub"]').click();
  await page.evaluate(()=>{
   window.titanAccountTransition={epoch:(window.titanAccountTransition?.epoch||0)+1,active:true};
   window.dispatchEvent(new Event('titan:account-changing'));
   window.state.user={...window.state.user,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
   window.titanAccountTransition.active=false;history.replaceState(null,'','/training');
   window.dispatchEvent(new Event('titan:account-changed'));window.dispatchEvent(new Event('titan:history-updated'));
  });
  await enable(page);await page.locator('[data-activity-hub]').waitFor();
  assert.equal(await page.locator('[data-act="resume"]').count(),0);
  assert.equal(await page.locator('main').innerText().then(t=>t.includes('Private draft A')),false);
 }finally{await context.close();}
});
