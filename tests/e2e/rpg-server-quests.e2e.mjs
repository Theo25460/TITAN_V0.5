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
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}

const quests={version:1,profile:{days:8,daysTarget:2,effortTarget:35,windowDays:28,frozen_at:'2026-10-01T12:00:00Z'},items:[{id:'days',value:2,target:2,complete:true},{id:'effort',value:35,target:35,complete:true},{id:'note',value:0,target:1,complete:false}]};
async function accountPage(width=360,world='aube',version=3){
 const f=await newPage(width),{page}=f;page.setDefaultTimeout(3000);
 await page.goto(BASE+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({quests,world,version})=>{
  const a=window.TitanAdventure;window.state.user.id='quest-test-account';
  a.snapshot={...a.snapshot,version,owner:'quest-test-account',plus:false,selected_world:world,quest_rewards:[],campaigns:window.TitanCodex.worlds.map(w=>({id:w.id,tier:'free',route:'rhythm',chapter:w.id===world?2:0,target:2,effort_target:0,started_at:'2026-10-01T12:00:00Z',evidence:{days:2,effort:35,source_ids:['synthetic-source']},quests:w.id===world?quests:null}))};
  a.refresh=async()=>{};dispatchEvent(new Event('titan:adventure-updated'));
 },{quests,world,version});
 if(world!=='aube')await page.locator(`[data-world="${world}"]`).click();
 return f;
}
test('server quests: frozen targets and planned souvenirs at both widths',async()=>{
 for(const width of [360,1280]){const {page,context,errors}=await accountPage(width);try{
  const panel=page.locator('[data-rpg-quests]');await panel.locator('summary').click();
  assert.match(await panel.textContent(),/figées/);assert.match(await panel.textContent(),/35/);assert.match(await panel.textContent(),/Éclat de constance/);
  assert.equal(await page.locator('[data-quest-souvenir]').count(),0);
  if(process.env.TITAN_QA_SCREENSHOTS)await page.screenshot({path:`/tmp/titan-server-quests-${width}.png`,fullPage:true,animations:'disabled'});
  const before=await panel.textContent();await page.evaluate(()=>{window.state.history=[];dispatchEvent(new Event('titan:history-updated'));});assert.equal(await panel.textContent(),before);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}}
});
test('server quests: refusal leaves no souvenir, confirmation and refresh retain one',async()=>{
 const {page,context,errors}=await accountPage();try{
  await page.evaluate(()=>{window.TitanAdventure.action=async()=>{throw Error('QUEST_INCOMPLETE');};});
  await page.locator('[data-claim="2"]').click();await page.waitForFunction(()=>document.querySelector('#av-error')?.textContent);assert.equal(await page.locator('[data-quest-souvenir]').count(),0);
  await page.evaluate(()=>{const a=window.TitanAdventure;a.action=async()=>{a.snapshot.campaigns.find(c=>c.id==='aube').chapter=3;a.snapshot.quest_rewards=[{world:'aube',chapter:2,quest_id:'days',earned_at:'2026-10-02T12:00:00Z'}];dispatchEvent(new Event('titan:adventure-updated'));};});
  await page.locator('[data-claim="2"]').click();await page.locator('[data-quest-souvenir]').waitFor();assert.match(await page.locator('[data-quest-souvenir]').textContent(),/Éclat de constance/);
  await page.evaluate(()=>dispatchEvent(new Event('titan:adventure-updated')));assert.equal(await page.locator('[data-quest-souvenir]').count(),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('server quests: personal rewards withdraw on account transition and foreign owner',async()=>{
 const {page,context,errors}=await accountPage();try{
  await page.evaluate(()=>{window.TitanAdventure.snapshot.quest_rewards=[{world:'aube',chapter:1,quest_id:'note',earned_at:'2026-10-02'}];dispatchEvent(new Event('titan:adventure-updated'));});await page.locator('[data-quest-souvenir]').waitFor();
  assert.equal(await page.evaluate(()=>{window.titanAccountTransition={active:true};dispatchEvent(new Event('titan:account-changing'));return document.querySelectorAll('[data-quest-souvenir]').length;}),0);
  await page.evaluate(()=>{window.titanAccountTransition={active:false};window.TitanAdventure.snapshot.owner='foreign';dispatchEvent(new Event('titan:adventure-updated'));});assert.equal(await page.locator('[data-quest-souvenir]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('server quests: forge is free and uses server quests, legacy server explains update',async()=>{
 const {page,context,errors}=await accountPage(360,'forge');try{
  await page.locator('[data-rpg-quests]').waitFor();assert.equal(await page.getByRole('link',{name:'Découvrir TITAN+'}).count(),0);
  await page.evaluate(()=>{const a=window.TitanAdventure;a.snapshot.version=2;a.snapshot.campaigns.find(c=>c.id==='forge').chapter=0;dispatchEvent(new Event('titan:adventure-updated'));});
  await page.getByText('Cette région n’est pas accessible pour le moment. Tes acquis sont conservés.').waitFor();
  assert.match(await page.locator('.av-panel').first().textContent(),/pas accessible pour le moment/);assert.equal(await page.locator('[data-start]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('server quests: a malformed server contract leaves the campaign usable without invented rewards',async()=>{
 const {page,context,errors}=await accountPage();try{
  await page.locator('[data-rpg-quests]').waitFor();
  await page.evaluate(()=>{window.TitanAdventure.snapshot.campaigns.find(c=>c.id==='aube').quests.items[0]=null;dispatchEvent(new Event('titan:adventure-updated'));});
  await page.waitForFunction(()=>!document.querySelector('[data-rpg-quests]'));
  assert.equal(await page.locator('[data-claim="2"]').isVisible(),true);assert.equal(await page.locator('[data-quest-souvenir]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('personal targets: current server goals agree in mission, details and guardian at both widths',async()=>{
 for(const width of [360,1280]){const {page,context,errors}=await accountPage(width,'forge',4);try{
  await page.evaluate(()=>{const c=window.TitanAdventure.snapshot.campaigns.find(c=>c.id==='forge');Object.assign(c,{chapter:9,target:2,effort_target:70,main_objective:{version:1,days:2,effort:70,frozen_at:'2026-10-01'},evidence:{days:1,effort:35,source_ids:[]}});dispatchEvent(new Event('titan:adventure-updated'));});
  await page.waitForFunction(()=>document.querySelector('.av-mission-head')?.textContent.includes('Chapitre 9 / 9'));
  assert.match(await page.locator('[data-campaign-encounter] [data-guardian-goal]').textContent(),/2 jours actifs et 70 minutes/);
  assert.match(await page.locator('[data-rpg-remaining]').textContent(),/1 jour.*35 min/);
  await page.getByRole('button',{name:'Détails du chapitre'}).click();
  assert.match(await page.getByRole('dialog').textContent(),/Mission : 2 jours actifs et 70 minutes/);
  assert.doesNotMatch(await page.getByRole('dialog').textContent(),/150 minutes/);
  await page.keyboard.press('Escape');
  if(process.env.TITAN_QA_SCREENSHOTS){await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:`/tmp/titan-personal-targets-${width}.png`,fullPage:true,animations:'disabled'});}
  assert.match(await page.locator('[data-personal-target]').textContent(),/28 jours.*figée/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}}
});
test('personal targets: future and past chapters do not invent a personal target',async()=>{
 const {page,context,errors}=await accountPage(360,'aube',4);try{
  await page.locator('.av-node[data-chapter="9"]').click();
  assert.match(await page.getByRole('dialog').textContent(),/fixée au départ/);
  assert.doesNotMatch(await page.getByRole('dialog').textContent(),/Mission : 3 jours|150 minutes/);
  await page.keyboard.press('Escape');await page.locator('.av-node[data-chapter="1"]').click();
  assert.doesNotMatch(await page.getByRole('dialog').textContent(),/Mission :/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('personal targets: grandfathered guardian keeps its fixed conditions visible',async()=>{
 const {page,context,errors}=await accountPage(360,'forge',4);try{
  await page.evaluate(()=>{Object.assign(window.TitanAdventure.snapshot.campaigns.find(c=>c.id==='forge'),{chapter:9,target:3,effort_target:150,main_objective:{version:0,days:3,effort:150}});dispatchEvent(new Event('titan:adventure-updated'));});
  assert.match(await page.locator('[data-personal-target]').textContent(),/conditions.*conservées/);
  assert.match(await page.locator('[data-campaign-encounter] [data-guardian-goal]').textContent(),/3 jours actifs et 150 minutes/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
