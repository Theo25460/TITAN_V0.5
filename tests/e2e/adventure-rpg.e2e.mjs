import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
let browser,server,base;
const ROOT=new URL('../..',import.meta.url).pathname;
before(async()=>{
 const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
 base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(base+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function fixture({active=true,slow=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:850},serviceWorkers:'block'});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({active,slow})=>{
  const owner='00000000-0000-4000-8000-000000000123';window.state.user.id=owner;
  window.titanClient.auth.getSession=async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}});
  window.rpgCalls=[];window.rpgSlow=slow;
  const s={version:1,owner,world:'aube',active,chapter:9,target:15,days:9,effort:270,rewards:[],familyTitles:[],milestones:[]};
  s.milestones=window.TitanAdventureRpg.path('aube').map(n=>({...n,earned:false,ready:n.ordinal===1,effortTarget:n.ordinal*15,daysTarget:Math.ceil(n.ordinal/2)}));
  window.rpgData=s;
  window.titanClient.rpc=(name,args)=>({setHeader:async(header,token)=>{
   window.rpgHeaders=window.rpgHeaders||[];window.rpgHeaders.push([header,token]);
   window.rpgCalls.push([name,args]);
   if(window.rpgSlow){await new Promise(resolve=>window.releaseRpg=resolve);}
   if(args.p_action==='start')s.active=true;
   if(args.p_action==='claim'){
    s.rewards.push({ordinal:args.p_ordinal,choice:args.p_choice,earnedAt:new Date().toISOString()});
    s.milestones.forEach(n=>{n.earned=s.rewards.some(r=>r.ordinal===n.ordinal);n.ready=n.ordinal===args.p_ordinal+1;});
   }
   return {data:JSON.parse(JSON.stringify(s)),error:null};
  }});
  window.TitanRpgPanel.reset();const host=document.createElement('section');host.dataset.rpgHost='';host.id='rpg-test';document.body.replaceChildren(host);
  window.TitanRpgPanel.mount(host,'aube');
 },{active,slow});
 return {context,page,errors};
}
test('18 real milestones, narrative choice, confirmed bestiary and narrow layout',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.locator('.av-rpg-path li').first().waitFor();assert.equal(await page.locator('.av-rpg-path li').count(),18);
  await page.locator('[data-rpg-action="claim"]').click();
  await page.locator('[data-rpg-choice="1"]').click();
  assert.match(await page.locator('#rpg-test').innerText(),/Tu prends le temps d’écouter/);
  await page.locator('[data-rpg-action="claim"]').click();
  assert.match(await page.locator('summary').first().innerText(),/Bestiaire · 1\/6/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.evaluate(()=>window.rpgCalls.filter(([name,args])=>args.p_action==='claim').length),3);
  assert.equal(await page.evaluate(()=>window.rpgHeaders.every(([key,token])=>key==='Authorization'&&token==='Bearer token-00000000-0000-4000-8000-000000000123')),true);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('opt-in is explicit and double-click never sends two start writes',async()=>{
 const {context,page,errors}=await fixture({active:false});try{
  const button=page.locator('[data-rpg-action="start"]');await button.waitFor();
  assert.equal(await page.evaluate(()=>window.rpgCalls.filter(([,a])=>a.p_action).length),0);
  await button.dblclick();await page.locator('.av-rpg-path li').first().waitFor();
  assert.equal(await page.evaluate(()=>window.rpgCalls.filter(([,a])=>a.p_action==='start').length),1);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('account switch clears visible data and drops an in-flight foreign snapshot',async()=>{
 const {context,page,errors}=await fixture({slow:true});try{
  await page.waitForFunction(()=>typeof window.releaseRpg==='function');
  await page.evaluate(()=>{window.state.user.id='00000000-0000-4000-8000-000000000456';dispatchEvent(new Event('titan:account-changing'));window.releaseRpg();});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.av-rpg-path li').count(),0);
  assert(!/Renard|lucioles/.test(await page.locator('#rpg-test').innerText()));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
