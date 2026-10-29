// Real QG UI with synthetic account-scoped reads/actions; no live accounts or writes.
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
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", timezoneId:"Europe/Paris" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}

const practices=['swimming','running','muscu_gym','mixed'];
async function seed(page,practice,duration=50,days=3){
 await page.goto(BASE+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(async({practice,duration,days})=>{
  const id=window.state.user.id,now=Date.now();const start=new Date(now-4*86400000).toISOString();
  const kinds={swimming:{unit:'m',val:2000},running:{unit:'km',val:8},muscu_gym:{unit:'kg',val:4000}};
  localStorage.setItem('titan_adventure_v1:'+id,JSON.stringify({owner:id,revision:1,selected_world:'aube',rewards:[],campaigns:window.TitanCodex.worlds.map(w=>({id:w.id,chapter:9,route:'rhythm',started_at:start}))}));
  window.state.history=Array.from({length:days},(_,n)=>{const sport=practice==='mixed'?Object.keys(kinds)[n%3]:practice;const date=new Date(now-(3-n)*86400000).toISOString();return {id:'multisport-'+n,sport,...kinds[sport],date,created_at:date,details:{duration,bio:{rpe:5},note:'Une trace de ma pratique'}};});
  await window.TitanAdventure.refresh({force:true});
 },{practice,duration,days});
}
test('multisport journey: swimming, running, strength and optional variety confirm all4guardians at360/1280',async()=>{
 for(const width of [360,1280])for(const practice of practices){const {page,context,errors}=await newPage(width);page.setDefaultTimeout(3000);try{
  await seed(page,practice);
  for(const world of ['aube','marees','forge','aurores']){
   await page.locator(`[data-world="${world}"]`).click();
   const c=await page.evaluate(world=>window.TitanAdventure.snapshot.campaigns.find(c=>c.id===world),world);
   assert.equal(c.evidence.days,3);assert.equal(c.evidence.effort,150);assert.equal(c.target,3);assert.equal(c.effort_target,150);
   await page.locator('[data-claim="9"]').click();
   await page.waitForFunction(world=>window.TitanAdventure.snapshot.campaigns.find(c=>c.id===world).chapter===10,world);
   await page.getByRole('dialog').getByRole('button',{name:'Continuer',exact:true}).click();
  }
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('titan_adventure_v1:'+window.state.user.id)));
  assert.equal(stored.rewards.length,4);assert.equal(new Set(stored.rewards.map(r=>r.world+':'+r.chapter)).size,4);
  assert.ok(stored.campaigns.every(c=>c.chapter===10));assert.equal(await page.locator('[data-quest-souvenir]').count(),0,'discovery never invents server quest souvenirs');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}}
});
test('multisport volume: a long single session leaves the guardian unavailable for every sole practice',async()=>{
 for(const practice of practices.filter(x=>x!=='mixed')){const{page,context,errors}=await newPage();page.setDefaultTimeout(3000);try{
  await seed(page,practice,120,1);await page.locator('[data-rpg-remaining]').waitFor();
  assert.equal(await page.locator('[data-claim="9"]').count(),0);assert.match(await page.locator('[data-rpg-remaining]').textContent(),/2 jours/);assert.match(await page.locator('[data-rpg-remaining]').textContent(),/60 min/);
  assert.equal(await page.evaluate(()=>window.TitanAdventure.snapshot.rewards.length),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}}
});
