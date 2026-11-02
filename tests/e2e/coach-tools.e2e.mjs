// Coach tools UI (V11-81) with a synthetic client: messages, check-in sharing at the athlete's choice, templates.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname,A='00000000-0000-4000-8000-000000000851';
const ago=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
let server,browser,BASE;
before(async()=>{const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch();});
after(async()=>{await browser?.close();server?.kill();});
async function fixture({mode='coach',flag=true,width=360}={}){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/js/app/coaching.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(BASE+'/coaching');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({A,mode,flag})=>{
  window.state.user.id=A;window.rpcCalls=[];
  const db={messages:[{id:'m1',body:'Bonjour depuis le coach',at:new Date().toISOString(),mine:mode==='coach',read:false},{id:'m2',body:'Reçu',at:new Date().toISOString(),mine:mode!=='coach',read:true}],checkins:[{week:new Date().toISOString().slice(0,10),scores:{fatigue:2,energy:4},note:'Ça va',shared:mode==='coach'}],templates:[{id:'t1',title:'Fractionné court',sport:'running',instructions:'8 x 1 min'}]};
  window.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:A},access_token:'fixture'}}})},rpc:async(fn,args)=>{window.rpcCalls.push({fn,args});
   if(fn==='titan_coach_messages_v1')return{data:{link:args.p_link,rows:db.messages,more:false}};
   if(fn==='titan_coach_checkins_v1')return{data:{role:mode,rows:db.checkins}};
   if(fn==='titan_coach_templates_v1')return{data:db.templates};
   if(fn==='titan_coach_message_send_v1'){db.messages.push({id:'m'+db.messages.length+1,body:args.p_body,at:new Date().toISOString(),mine:true,read:false});return{data:'x'};}
   if(fn==='titan_coach_template_save_v1'){db.templates.unshift({id:'t2',title:args.p_title,sport:args.p_sport,instructions:args.p_instructions});return{data:'t2'};}
   if(fn==='titan_coach_template_delete_v1'){db.templates=db.templates.filter(t=>t.id!==args.p_id);return{data:true};}
   if(fn==='titan_coach_checkin_v1'){db.checkins.unshift({week:new Date().toISOString().slice(0,10),scores:args.p_scores,note:args.p_note,shared:args.p_shared});return{data:{shared:args.p_shared}};}
   return{data:true};}};
  const old=window.titanFlags.enabled;window.titanFlags.enabled=(k,f)=>k==='screens.coachtools'?flag:old(k,f);
 },{A,mode,flag});
 const link={id:'one',coach_id:mode==='coach'?A:'coach-x',athlete_id:mode==='coach'?'ath-x':A,athlete_name:'Émilie',coach_name:'Coach',sport:'running',since_date:ago(50),accepted_at:ago(50)+'T12:00:00Z',revision:1,share_notes:true,share_details:true};
 await page.route('**/rest/v1/rpc/titan_coach_portal',async route=>{const {p_action:a,p_data:d}=route.request().postDataJSON();let body={};
  if(a==='snapshot')body={owner:A,capacity:3,invites:[],links:[link]};
  if(a==='sessions')body={owner:A,link_id:'one',revision:1,from_date:d.from_date,to_date:d.to_date,rows:[],total:0};
  if(a==='assignments')body={link_id:'one',revision:1,total:0,rows:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});});
 await page.addScriptTag({path:ROOT+'/js/app/coaching.js'});
 if(mode==='coach')await page.locator('[data-mode="coach"]').click();
 return {page,context,errors};
}
async function audit(page,selector){await page.addScriptTag({content:readFileSync(ROOT+'/node_modules/axe-core/axe.min.js','utf8')});const v=await page.evaluate(async s=>(await axe.run(document.querySelector(s),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations,selector);assert.deepEqual(v.map(v=>v.id+':'+v.nodes.map(n=>n.target).join('|')),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}

test('flag off: no coach tools and no tool request',async()=>{
 const f=await fixture({flag:false}),{page}=f;try{
  await page.locator('[data-co-calendar-slot]').waitFor({state:'attached'});
  assert.equal(await page.locator('[data-ct-messages]').count(),0);
  assert.equal(await page.evaluate(()=>window.rpcCalls.length),0);
 }finally{await f.context.close();}
});
test('coach: reads thread, sends a message, saves, reuses and deletes a template',async()=>{
 const f=await fixture(),{page}=f;try{
  await page.locator('[data-ct-messages]').waitFor();
  assert.match(await page.locator('.co-thread').innerText(),/Bonjour depuis le coach/);
  await page.getByLabel('Message',{exact:true}).fill('Séance de demain validée');await page.locator('[data-ct-send] button').click();
  await page.getByText('Séance de demain validée').waitFor();
  assert.ok((await page.evaluate(()=>window.rpcCalls)).some(c=>c.fn==='titan_coach_message_send_v1'&&c.args.p_body==='Séance de demain validée'));
  assert.match(await page.locator('[data-ct-checkins]').innerText(),/Fatigue 2\/5/);
  await page.getByLabel('Nom du modèle').fill('Sortie longue');await page.locator('[data-ct-tpl] button').click();
  await page.getByText('Sortie longue').waitFor();
  await page.locator('[data-ct-use="t1"]').click();
  assert.equal(await page.locator('dialog[open] input[name="title"]').inputValue(),'Fractionné court');
  await page.keyboard.press('Escape');
  await page.locator('[data-ct-del="t1"]').click();await page.waitForFunction(()=>!document.querySelector('[data-ct-use="t1"]'));
  await audit(page,'[data-co-tools-slot]');assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});
test('athlete: saves a private check-in, toggles sharing, sees no templates',async()=>{
 const f=await fixture({mode:'athlete'}),{page}=f;try{
  await page.locator('[data-ct-checkins]').waitFor();
  assert.equal(await page.locator('[data-ct-templates]').count(),0);
  await page.locator('[data-ct-checkin] select[name="sleep"]').selectOption('3');await page.locator('[data-ct-checkin] button').click();
  await page.waitForFunction(()=>window.rpcCalls.some(c=>c.fn==='titan_coach_checkin_v1'));
  const c=(await page.evaluate(()=>window.rpcCalls)).find(c=>c.fn==='titan_coach_checkin_v1');
  assert.deepEqual(c.args.p_scores,{sleep:3});assert.equal(c.args.p_shared,false);
  await page.locator('[data-ct-share]').first().check();
  await page.waitForFunction(()=>window.rpcCalls.some(c=>c.fn==='titan_coach_checkin_share_v1'&&c.args.p_shared===true));
  await audit(page,'[data-co-tools-slot]');assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();}
});
