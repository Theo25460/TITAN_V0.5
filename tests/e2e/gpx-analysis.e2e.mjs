import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname;
let server,browser,BASE;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const n=s.address().port;s.close(()=>resolve(n));});});
 BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function fixture(){
 const context=await browser.newContext({viewport:{width:360,height:900},serviceWorkers:'block'});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);
 await page.goto(BASE+'/training?sport=running',{waitUntil:'load'});
 await page.evaluate(()=>{const before=window.titanFlags.enabled;window.titanFlags.enabled=(key,fallback)=>key==='screens.gpxterrain'||before(key,fallback);});
 return {page,context};
}
const time=s=>new Date(Date.UTC(2026,9,29,7,0,s)).toISOString();
function file(timed=true,altitude=true){let b='<gpx><trk><trkseg>';for(let i=0;i<=20;i++)b+=`<trkpt lat="${45+i*.001}" lon="6">${altitude?`<ele>${1000+i*5}</ele>`:''}${timed?`<time>${time(i*30)}</time>`:''}</trkpt>`;return b+'</trkseg></trk></gpx>';}
const upload=(page,text)=>page.locator('[data-gpx]').setInputFiles({name:'sortie.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(text)});

test('timed GPX shows local route, elevation profile and kilometre splits then saves only non-location summary',async()=>{
 const {page,context}=await fixture();
 try{
  await upload(page,file());await page.locator('[data-gpx-preview]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'GPX preview fits a 360px phone');
  assert.equal(await page.locator('[data-gpx-route] polyline').count(),1);
  assert.ok(await page.locator('[data-gpx-profile] polyline').count()>0);
  assert.equal(await page.locator('[data-gpx-splits] tbody tr').count(),3);
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('titan_seance_draft_v3:')));
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('titan_seance_draft_v3:')).some(k=>localStorage.getItem(k).includes('previewSegments'))),false,'precise preview is not stored in the draft');
  await page.locator('[data-act="save"]').click();await page.locator('dialog[open]').waitFor();
  const log=await page.evaluate(()=>window.state.history.at(-1));
  assert.equal(log.details.gpxStats.analysisVersion,'gpx-v2');
  assert.equal(log.details.gpxStats.source,'gpx_import');
  assert.ok(log.details.gpxStats.profile.length>0);
  assert.ok(!log.details.gpxPath && !log.details.gpxStats.previewSegments,'precise location is not saved');
  assert.equal(log.details.gpxStats.verified,false);
  await page.goto(BASE+'/journal',{waitUntil:'load'});
  await page.locator(`[data-open="${log.id}"]`).click();
  assert.ok(await page.locator('dialog[open] [data-gpx-profile] polyline').count()>0,'profile survives reload and Journal readback');
  assert.equal(await page.locator('dialog[open] [data-gpx-route]').count(),0);
 }finally{await context.close();}
});

test('route without timestamps cannot be saved as an activity; explicit manual return remains available',async()=>{
 const {page,context}=await fixture();
 try{
  await upload(page,file(false,false));await page.locator('[data-gpx-preview]').waitFor();
  assert.match(await page.locator('[data-gpx-preview]').innerText(),/Itinéraire sans horodatage/);
  await page.locator('[data-k="durM"]').fill('30');
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.evaluate(()=>window.state.history.length),0);
  await page.locator('[data-act="clear-gpx"]').click();
  await page.locator('[data-k="distance"]').fill('4');await page.locator('[data-k="durM"]').fill('30');
  await page.locator('[data-act="save"]').click();await page.locator('dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>window.state.history.length),1);
 }finally{await context.close();}
});

test('reimporting a route clears the previous GPX time and altitude without inventing zero',async()=>{
 const {page,context}=await fixture();
 try{
  await upload(page,file());await page.locator('[data-gpx-preview]').waitFor();
  assert.equal(await page.locator('[data-k="durM"]').inputValue(),'10');
  await upload(page,file(false,false));
  await page.getByText('Itinéraire sans horodatage',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-k="durM"]').inputValue(),'');
  assert.equal(await page.locator('[data-gpx-profile]').count(),0);
  assert.match(await page.locator('[data-gpx-preview]').innerText(),/Altitude non disponible/);
 }finally{await context.close();}
});

test('an old GPX draft always offers an explicit usable return to manual entry',async()=>{
 const {page,context}=await fixture();
 try{
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('titan_seance_draft_v3:')));
  await page.evaluate(()=>{
   const k=Object.keys(localStorage).find(k=>k.startsWith('titan_seance_draft_v3:'));
   const d=JSON.parse(localStorage.getItem(k));
   d.gpx={distanceKm:5,movingMinutes:25,ascent:100,points:50};d.distance='5';d.durM='25';
   localStorage.setItem(k,JSON.stringify(d));
  });
  await page.reload({waitUntil:'load'});
  await page.locator('[data-act="clear-gpx"]').click();
  assert.equal(await page.locator('[data-gpx-preview]').count(),0);
  await page.locator('[data-k="distance"]').fill('5');await page.locator('[data-k="durM"]').fill('25');
  await page.locator('[data-act="save"]').click();await page.locator('dialog[open]').waitFor();
 }finally{await context.close();}
});

test('a GPX read from an earlier account epoch cannot change the current form',async()=>{
 const {page,context}=await fixture();
 try{
  await page.locator('[data-k="distance"]').fill('3');
  await page.evaluate(()=>{
   const input=document.querySelector('[data-gpx]');
   Object.defineProperty(input,'files',{configurable:true,value:[{size:100,text:()=>new Promise(resolve=>{window.releaseOldGpx=resolve;})}]});
   input.dispatchEvent(new Event('change',{bubbles:true}));
   window.titanAccountTransition={...(window.titanAccountTransition||{}),epoch:(window.titanAccountTransition?.epoch||0)+1,active:false};
  });
  await page.evaluate(async text=>{window.releaseOldGpx(text);await new Promise(requestAnimationFrame);},file());
  assert.equal(await page.locator('[data-k="distance"]').inputValue(),'3');
  assert.equal(await page.locator('[data-gpx-preview]').count(),0);
 }finally{await context.close();}
});

test('terrain preview switches accessible speed and slope colours and persists only bounded summaries',async()=>{
 const {page,context}=await fixture();try{
  const xml=file().replace('</trkseg>',`<trkpt lat="45.02" lon="6"><ele>1100</ele><time>${time(660)}</time></trkpt></trkseg>`);
  await upload(page,xml);await page.locator('[data-gpx-color="speed"]').waitFor();
  assert.ok(await page.locator('[data-gpx-route] .gpx-color-line').count()>0);
  await page.locator('[data-gpx-color="grade"]').click();
  assert.equal(await page.locator('[data-gpx-color="grade"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-gpx-color="grade"]').evaluate(e=>e===document.activeElement),true);
  assert.match(await page.locator('[data-gpx-legend]').innerText(),/8/);
  assert.match(await page.locator('[data-gpx-climb]').innerText(),/100/);
  assert.match(await page.locator('[data-gpx-pauses]').innerText(),/1 arrêt/);
  await page.addScriptTag({content:readFileSync(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});
  const violations=await page.evaluate(async()=> (await axe.run(document.querySelector('.gpx-preview'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
  assert.deepEqual(violations.map(v=>v.id),[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('titan_seance_draft_v3:')));
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('titan_seance_draft_v3:')))));
  assert.ok(!draft.gpx.previewSegments&&!draft.gpx.previewMetrics);
  await page.locator('[data-act="save"]').click();await page.locator('dialog[open]').waitFor();
  const log=await page.evaluate(()=>window.state.history.at(-1));assert.equal(log.details.gpxStats.terrainVersion,'gpx-terrain-v1');
  assert.equal(log.details.gpxStats.primaryClimb.gainMeters,100);assert.equal(log.details.gpxStats.pauses.count,1);
  assert.ok(!log.details.gpxStats.previewMetrics&&!log.details.gpxStats.previewSegments);
  await page.goto(BASE+'/journal',{waitUntil:'load'});
  await page.evaluate(()=>{const before=window.titanFlags.enabled;window.titanFlags.enabled=(key,fallback)=>key==='screens.gpxterrain'||before(key,fallback);window.dispatchEvent(new Event('titan:flags-updated'));});
  await page.locator(`[data-open="${log.id}"]`).click();
  assert.match(await page.locator('dialog[open] [data-gpx-climb]').innerText(),/100/);
  assert.equal(await page.locator('dialog[open] [data-gpx-route]').count(),0);
 }finally{await context.close();}
});

test('missing timestamps disable speed colouring while a planned route can show only its terrain',async()=>{
 const {page,context}=await fixture();try{
  await upload(page,file(false,true));await page.locator('[data-gpx-color="speed"]').waitFor();
  assert.equal(await page.locator('[data-gpx-color="speed"]').isDisabled(),true);
  assert.equal(await page.locator('[data-gpx-color="grade"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('[data-gpx-pauses]').innerText(),/non disponibles/);
  await upload(page,file(false,false));await page.locator('[data-gpx-color="grade"]').waitFor();
  assert.equal(await page.locator('[data-gpx-color="grade"]').isDisabled(),true);
  assert.equal(await page.locator('[data-gpx-route] .gpx-color-line').count(),0);
 }finally{await context.close();}
});

test('terrain summary storage drops injected coordinates, excess rows and invalid numeric values',async()=>{
 const {page,context}=await fixture();try{
  const stored=await page.evaluate(async()=>{
   const stats={analysisVersion:'gpx-v2',terrainVersion:'gpx-terrain-v1',kind:'recorded',verified:true,
    previewSegments:[[[45,6],[45.01,6]]],previewMetrics:[[{lat:45}]],
    primaryClimb:{startKm:0,endKm:1,distanceKm:1,gainMeters:100,averageGradePercent:10,lat:45,lon:6},
    pauses:{count:80,totalSeconds:2400,unobservedSeconds:0,lat:45,items:Array.from({length:80},()=>({distanceKm:0.5,seconds:30,lat:45,lon:6}))}};
   const l=await window.logActivity('running',{val1:5,val2:30,gpxStats:stats},{quiet:true});
   const invalid=await window.logActivity('running',{val1:5,val2:30,gpxStats:{...stats,primaryClimb:{...stats.primaryClimb,gainMeters:NaN},pauses:{...stats.pauses,totalSeconds:-1}}},{quiet:true});
   return {stats:l.details.gpxStats,invalid:invalid.details.gpxStats};
  });
  assert.equal(stored.stats.verified,false);assert.equal(stored.stats.pauses.items.length,50);
  assert.ok(!stored.stats.previewSegments&&!stored.stats.previewMetrics);
  assert.deepEqual(Object.keys(stored.stats.primaryClimb).sort(),['averageGradePercent','distanceKm','endKm','gainMeters','startKm']);
  assert.deepEqual(Object.keys(stored.stats.pauses.items[0]).sort(),['distanceKm','seconds']);
  assert.equal(stored.invalid.primaryClimb,null);assert.equal(stored.invalid.pauses,null);
 }finally{await context.close();}
});

test('terrain rollout is disabled by default without removing the original GPX preview',async()=>{
 const {page,context}=await fixture();try{
  await page.evaluate(()=>{window.titanFlags.enabled=()=>false;});
  await upload(page,file());await page.locator('[data-gpx-preview]').waitFor();
  assert.equal(await page.locator('[data-gpx-color]').count(),0);assert.equal(await page.locator('[data-gpx-climb]').count(),0);
  assert.equal(await page.locator('[data-gpx-route] polyline').count(),1);
  assert.equal(await page.locator('[data-gpx-profile]').count(),1);
 }finally{await context.close();}
});
