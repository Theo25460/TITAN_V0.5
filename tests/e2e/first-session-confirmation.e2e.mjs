// Real form, durable queue, HTTP receipt processing and recap under production CSP.
// Only the remote authority is synthetic; this never contacts a production account.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname;
const POLICY=/Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}/netlify.toml`,'utf8'))[1];
const OWNER='00000000-0000-4000-8000-000000000941', LOG='00000000-0000-4000-8000-000000000942';
let browser,server,BASE;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 BASE=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready);browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
for(const width of [360,1280])for(const held of [false,true]){
 test(`first real form: ${held?'held':'granted'} receipt replaces pending once at ${width}px`,async()=>{
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const requests=[],errors=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const receipt={log_id:LOG,xp:held?0:300,credits:held?0:30,requested_xp:300,
   xp_after:held?7:307,credits_after:held?5:35,level_after:1,leveled_up:0,
   reward_held:held,held_xp:held?300:0,held_credits:held?30:0,
   release_at:held?new Date(Date.now()+24*3600000).toISOString():null};
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/rest/v1/rpc/titan_submit_training_session'){
    requests.push(route.request().postDataJSON());await gate;
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([receipt])});
   }
   if(url.hostname!=='127.0.0.1')return route.abort('internetdisconnected');
   const response=await route.fetch(),headers={...response.headers()};
   if(route.request().resourceType()==='document')headers['content-security-policy']=POLICY;
   await route.fulfill({response,headers});
  });
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))errors.push(m.text());});
  try{
   await page.goto(BASE+'/training?sport=running');
   await page.waitForFunction(()=>window.TitanQueue&&window.TitanAdventure?.status==='ready');
   // Establish a synthetic authenticated context after the normal discovery bootstrap.
   // The form/logActivity/flushPendingTrainingLogs implementations remain untouched.
   await page.evaluate(owner=>{
    window.state.user.id=owner;window.state.user.xp=7;window.state.user.credits=5;window.state.user.level=1;
    window.titanClient={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test-token',user:{id:owner}}}})},
     rpc:async()=>({error:{code:'PGRST202',message:'Synthetic authority: optional RPC unavailable'}})};
   },OWNER);
   await page.locator('[data-k="distance"]').fill('5');
   await page.locator('[data-k="durM"]').fill('30');
   await page.locator('[data-act="save"]').click();
   const recap=page.locator('dialog.moment-sheet[open]');await recap.waitFor();
   await page.waitForFunction(()=>window.TitanQueue.list().length===1);
   assert.match(await recap.locator('.moment-reward').innerText(),/Confirmation du serveur en cours/);
   assert.match(await recap.locator('.moment-metrics').innerText(),/5\s*km/);
   assert.match(await recap.locator('.moment-metrics').innerText(),/30/);
   assert.deepEqual(await page.evaluate(()=>({xp:window.state.user.xp,credits:window.state.user.credits})),{xp:7,credits:5},'no provisional reward');
   release();
   await page.waitForFunction(()=>window.state.history[0]?.syncStatus==='confirmed'&&window.TitanQueue.list().length===0);
   await page.waitForFunction(()=>!document.querySelector('.moment-reward')?.textContent.includes('Confirmation du serveur en cours'));
   assert.match(await recap.locator('.moment-xp').innerText(),held?/Récompense en vérification/:/\+300 XP/);
   assert.equal(requests.length,1,'one real queue request');
   assert.equal(requests[0].p_sport,'running');assert.equal(requests[0].p_val,5);
   assert.equal(requests[0].p_details.duration,30);
   const durable=await page.evaluate(async owner=>({logs:await window.TitanQueue.readHistory(owner),xp:window.state.user.xp,credits:window.state.user.credits}),OWNER);
   assert.equal(durable.logs.length,1);assert.equal(durable.logs[0].id,LOG);
   assert.equal(durable.logs[0].details.serverReward.reward_held,held);
   assert.equal(durable.xp,receipt.xp_after);assert.equal(durable.credits,receipt.credits_after);
   if(held){
    assert.match(await recap.locator('.moment-reward').innerText(),/300 XP et 30 crédits/);
    assert.doesNotMatch(await recap.locator('.moment-xp').innerText(),/\+0 XP|\+300 XP/);
   }else assert.match(await recap.locator('.moment-reward').innerText(),/Confirmée par le serveur/);
   assert.equal(await page.locator('dialog[open]').count(),1,'one recap, no popup sequence');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(errors,[]);
  }finally{release();await context.unrouteAll({behavior:'wait'});await context.close();}
 });
}
