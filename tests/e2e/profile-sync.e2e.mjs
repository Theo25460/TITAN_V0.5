import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
const ROOT=new URL('../../',import.meta.url).pathname,OWNER='11111111-1111-4111-8111-111111111111';
let browser,server,BASE;
before(async()=>{const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});for(let i=0;i<60;i++){try{if((await fetch(BASE)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch();});
after(async()=>{await browser?.close();server?.kill();});
for(const width of [360,1280])test(`profile conflict, reload and explicit recovery at ${width}px`,async()=>{
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),user={id:OWNER,email:'profile@example.test',aud:'authenticated',app_metadata:{},user_metadata:{}},now=Math.floor(Date.now()/1000);
 const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:OWNER,role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})).toString('base64url'),'synthetic'].join('.');
 await context.addInitScript(session=>{if(!localStorage.getItem('titan_supabase_auth_v1'))localStorage.setItem('titan_supabase_auth_v1',JSON.stringify(session));},{access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:now+3600,user});
 let name='Cloud',revision=1,conflict=true;const writes=[],errors=[];
 const profile=()=>({id:OWNER,username:name,friend_code:'TN-TEST',xp:7,credits:2,level:1,state_version:revision,game_state:{user:{id:OWNER,name,onboardingComplete:true,onboardedAt:'2026-10-01',weeklyGoalSessions:3},history:[]}});
 await context.route('**/*',async route=>{const url=new URL(route.request().url()),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','content-range':'*/0'},body:JSON.stringify(body)});
  if(url.hostname==='oubmftfufwwzwpgvrcag.supabase.co'){
   if(url.pathname==='/auth/v1/user')return reply(user);
   if(url.pathname==='/rest/v1/profiles')return reply(profile());
   if(url.pathname==='/rest/v1/training_logs')return reply([]);
   if(url.pathname==='/rest/v1/rpc/titan_save_profile_state'){const request=route.request();writes.push({body:request.postDataJSON(),token:request.headers().authorization});if(conflict)return reply({code:'40001',message:'PROFILE_VERSION_CONFLICT'},409);name=request.postDataJSON().p_username;revision++;return reply(profile());}
   if(url.pathname.startsWith('/rest/v1/rpc/'))return reply({code:'PGRST202',message:'Optional test RPC missing'},404);
   if(url.pathname.startsWith('/rest/v1/'))return reply([]);
   return route.abort();
  }
  if(url.hostname!=='127.0.0.1')return route.abort();return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(BASE+'/profile');await page.waitForFunction(()=>window.titanCloudHistoryLoadedAt);
  await page.evaluate(async()=>{for(let i=0;i<100;i++)await window.saveState({forceCloud:true});});assert.equal(writes.length,0,'unchanged saves cause no RPC');
  await page.evaluate(async()=>{window.state.user.name='Pending local';await window.saveState({forceCloud:true});});assert.equal(writes.length,1);assert.equal(writes[0].token,`Bearer ${token}`);
  await page.evaluate(async()=>{for(let i=0;i<100;i++)await window.saveState({forceCloud:true});});assert.equal(writes.length,1);
  await page.locator('#titan-profile-recovery').waitFor();name='Other device';revision++;
  await page.reload();await page.waitForFunction(()=>window.titanCloudHistoryLoadedAt);assert.equal(writes.length,1,'reload never retries stale preference writes');
  assert.equal(await page.evaluate(()=>window.state.user.name),'Other device');assert(await page.evaluate(()=>window.titanGetProfileRecovery().some(r=>r.preferences.user.name==='Pending local')));
  assert(await page.locator('#titan-profile-recovery').isVisible());const box=await page.locator('#titan-profile-recovery').boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,'recovery stays within the viewport');
  conflict=false;page.on('dialog',dialog=>dialog.accept());
  await page.locator('#titan-profile-recovery details').first().locator('summary').click();
  await page.getByRole('button',{name:'Réappliquer ces préférences',exact:true}).first().click();
  await page.waitForFunction(()=>window.state.user.name==='Pending local');await page.waitForFunction(()=>window.state.meta.profileVersion===3);
  assert.equal(writes.length,2);assert.equal(writes[1].body.p_state.meta.profileVersion,2);assert.equal(await page.evaluate(()=>window.state.user.xp),7);
  await page.evaluate(async()=>{for(let i=0;i<50;i++)await window.saveState({forceCloud:true});});assert.equal(writes.length,2);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
