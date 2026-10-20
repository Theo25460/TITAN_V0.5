// Real persisted Supabase SDK, forms and durable queue; HTTP authority is synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname;
const POLICY=/Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}/netlify.toml`,'utf8'))[1];
const OWNER='00000000-0000-4000-8000-000000000961', LOG='00000000-0000-4000-8000-000000000962';
let browser,server,BASE;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready);browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
for(const width of [360,1280])for(const mode of ['unavailable','lost-ack','offline']){
 const lostAck=mode==='lost-ack';
 test(`authenticated resume: ${lostAck?'committed receipt lost':mode==='offline'?'browser offline':'server unavailable'} then reload and retry at ${width}px`,async()=>{
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const now=Math.floor(Date.now()/1000),user={id:OWNER,email:'resume@example.test',aud:'authenticated',app_metadata:{},user_metadata:{}};
  const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:OWNER,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})).toString('base64url'),'synthetic-signature'].join('.');
  await context.addInitScript(session=>{if(!localStorage.getItem('titan_supabase_auth_v1'))localStorage.setItem('titan_supabase_auth_v1',JSON.stringify(session));},{access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,user});
  let outage=true,grants=0;const requests=[],serverLogs=[],errors=[];
  const receipt={log_id:LOG,xp:300,credits:30,requested_xp:300,xp_after:307,credits_after:35,level_after:1,leveled_up:0,reward_held:false};
  const profile=()=>({id:OWNER,username:'Athlète synthétique',friend_code:'TN-RESUME',xp:grants?307:7,credits:grants?35:5,level:1,state_version:1,game_state:{user:{id:OWNER,onboardedAt:'2026-10-01',onboardingComplete:true},history:[]}});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='oubmftfufwwzwpgvrcag.supabase.co'){
    const reply=body=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','content-range':`0-${Math.max(0,serverLogs.length-1)}/${serverLogs.length}`},body:JSON.stringify(body)});
    if(url.pathname==='/auth/v1/user')return reply(user);
    if(url.pathname==='/rest/v1/rpc/titan_submit_training_session'){
     const body=req.postDataJSON();requests.push({body,authorization:req.headers().authorization});
     if(!outage||lostAck){if(!serverLogs.length){grants++;serverLogs.push({id:LOG,user_id:OWNER,client_event_id:body.p_details.client_event_id,sport:body.p_sport,category:body.p_category,val:body.p_val,unit:body.p_unit,details:body.p_details,date:body.p_date,xp:300,revision:1});}}
     return outage?route.abort('internetdisconnected'):reply([receipt]);
    }
    if(url.pathname==='/rest/v1/profiles')return reply(profile());
    if(url.pathname==='/rest/v1/training_logs')return reply(serverLogs);
    if(url.pathname==='/rest/v1/rpc/titan_save_profile_state')return reply(profile());
    if(url.pathname.startsWith('/rest/v1/rpc/'))return route.fulfill({status:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'PGRST202',message:'Optional synthetic RPC unavailable'})});
    if(url.pathname.startsWith('/rest/v1/'))return reply([]);
    return route.abort('internetdisconnected');
   }
   if(url.hostname!=='127.0.0.1')return route.abort('internetdisconnected');
   const response=await route.fetch(),headers={...response.headers()};if(req.resourceType()==='document')headers['content-security-policy']=POLICY;
   return route.fulfill({response,headers});
  });
  const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))errors.push(m.text());});
  try{
   await page.goto(BASE+'/training?sport=running');
   await page.waitForFunction(owner=>window.state?.user?.id===owner&&window.titanCloudHistoryLoadedAt,OWNER);
   assert.equal(await page.locator('script[src*="supabase-2.111.0"]').count(),1);
   assert.equal(await page.evaluate(async()=>(await window.titanClient.auth.getSession()).data.session.user.id),OWNER);
   if(mode==='offline')await context.setOffline(true);
   await page.locator('[data-k="distance"]').fill('5');await page.locator('[data-k="durM"]').fill('30');await page.locator('[data-act="save"]').click();
   await page.locator('dialog.moment-sheet[open]').waitFor();await page.waitForFunction(()=>window.TitanQueue.list().length===1&&window.TitanQueue.list()[0].reason);
   const original=await page.evaluate(()=>({item:window.TitanQueue.list()[0],xp:window.state.user.xp,credits:window.state.user.credits}));
   assert.equal(original.item.ownerId,OWNER);assert.equal(original.xp,7);assert.equal(original.credits,5);
   assert.equal(original.item.payload.val,5);assert.equal(original.item.payload.details.duration,30);
   await context.setOffline(false);
   await page.goto(BASE+'/journal');await page.waitForFunction(owner=>window.state?.user?.id===owner&&window.titanCloudHistoryLoadedAt,OWNER);
   await page.locator('[data-retry]').waitFor();
   assert.equal(await page.evaluate(()=>window.TitanQueue.list().length),1);
   assert.equal(await page.evaluate(()=>window.TitanQueue.list()[0].payload.details.client_event_id),original.item.payload.details.client_event_id);
   assert.equal(await page.evaluate(()=>window.state.history.length),1,'one row across cloud/pending reconciliation');
   assert.equal(await page.locator('.jr-row[data-open]').count(),1);
   await page.reload();await page.waitForFunction(()=>window.titanCloudHistoryLoadedAt&&window.TitanQueue.list().length===1);
   assert.equal(await page.evaluate(()=>window.TitanQueue.list()[0].payload.details.client_event_id),original.item.payload.details.client_event_id);
   assert.equal(await page.locator('.jr-row[data-open]').count(),1);
   outage=false;await page.locator('[data-retry]').click();
   await page.waitForFunction(()=>window.TitanQueue.list().length===0&&window.state.history[0]?.syncStatus==='confirmed');
   assert.equal(grants,1,'synthetic authority granted this event once');
   assert.ok(requests.length>=2);assert.ok(requests.every(r=>r.authorization===`Bearer ${token}`));
   assert.ok(requests.every(r=>r.body.p_details.client_event_id===original.item.payload.details.client_event_id));
   for(const r of requests)assert.deepEqual(r.body,requests[0].body,'retry keeps the complete immutable payload');
   assert.deepEqual(await page.evaluate(()=>({xp:window.state.user.xp,credits:window.state.user.credits,count:window.state.history.length})),{xp:307,credits:35,count:1});
   await page.reload();await page.waitForFunction(()=>window.titanCloudHistoryLoadedAt&&window.state.history[0]?.id==='00000000-0000-4000-8000-000000000962');
   assert.equal(await page.evaluate(()=>window.TitanQueue.list().length),0);assert.equal(await page.evaluate(()=>window.state.history.length),1);
   const durable=await page.evaluate(owner=>window.TitanQueue.readHistory(owner),OWNER);
   assert.equal(durable.length,1);assert.equal(durable[0].id,LOG);assert.equal(durable[0].val,5);assert.equal(durable[0].details.duration,30);
   assert.equal(serverLogs.length,1);assert.equal(grants,1);assert.deepEqual(errors,[]);
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();}
 });
}
