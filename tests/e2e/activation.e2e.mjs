// Real public/start/save/signup paths; local guest data only and all external traffic blocked.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname;
const POLICY=/Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}/netlify.toml`,'utf8'))[1];
let server,browser,BASE;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(BASE+'/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready);browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function fixture(width){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  if(new URL(route.request().url()).hostname!=='127.0.0.1')return route.abort('internetdisconnected');
  const response=await route.fetch(),headers={...response.headers()};
  if(route.request().resourceType()==='document')headers['content-security-policy']=POLICY;
  await route.fulfill({response,headers});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))errors.push(m.text());});page.setDefaultTimeout(4000);
 return {context,page,errors};
}
for(const width of [360,1280]){
 test(`activation: free offer separates immediate use from prepared additions at ${width}px`,async()=>{
  const {context,page,errors}=await fixture(width);
  try{
   await page.goto(BASE+'/');
   const offers=page.locator('#offres');
   assert.doesNotMatch(await offers.textContent(),/ouvre plus de monde/);
   await offers.locator('[data-availability="now"]').waitFor();
   assert.match(await offers.locator('[data-availability="now"]').textContent(),/journal|Journal/);
   assert.match(await offers.locator('[data-availability="planned"]').textContent(),/préparation/);
   assert.match(await offers.textContent(),/routines/);
   if(process.env.TITAN_QA_SCREENSHOTS){await offers.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/titan-activation-offer-${width}.png`});}
   assert.equal(await offers.getByRole('link',{name:'Commencer gratuitement',exact:true}).getAttribute('href'),'/onboarding');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   assert.deepEqual(errors,[]);
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();}
 });
 test(`activation: onboarding offers optional adventure before a session without promising a badge at ${width}px`,async()=>{
  const {context,page,errors}=await fixture(width);
  try{
   await page.goto(BASE+'/onboarding');
   for(let i=0;i<3;i++)await page.locator('[data-next]').click();
   assert.doesNotMatch(await page.locator('#onboarding h1').textContent(),/débloque.*balise/);
   assert.match(await page.locator('#onboarding').textContent(),/avant ta prochaine séance/);
   const adventure=page.locator('[data-finish][href="/adventure"]');await adventure.waitFor();
   if(process.env.TITAN_QA_SCREENSHOTS)await page.screenshot({path:`/tmp/titan-activation-onboarding-${width}.png`,fullPage:true});
   const history=await page.evaluate(()=>window.state.history.length);
   await adventure.click();await page.waitForURL('**/adventure');
   await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
   assert.equal(await page.evaluate(()=>window.TitanAdventure.snapshot.campaigns.some(c=>c.chapter>0)),false,'no campaign starts without explicit choice');
   assert.equal(await page.evaluate(()=>window.state.history.length),history,'no activity or retroactive reward invented');
   await page.goto(BASE+'/aujourdhui');
   await page.getByRole('link',{name:/Commencer l’aventure/}).waitFor();
   assert.equal(await page.locator('.qg-hero .asc-btn-primary').getAttribute('href'),'/training','first QG action is recording');
   assert.equal(await page.locator('.qg-ascent a[href="/profile"]').isVisible(),true,'progression remains a secondary path');
   assert.match(await page.getByRole('link',{name:/Commencer l’aventure/}).textContent(),/avant ta prochaine séance/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   assert.deepEqual(errors,[]);
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();}
 });
 test(`activation: guest recap links directly to signup and keeps the saved session at ${width}px`,async()=>{
  const {context,page,errors}=await fixture(width);
  try{
   await page.goto(BASE+'/training?sport=running');
   await page.waitForFunction(()=>window.TitanAdventure?.status==='ready'&&window.TitanQueue);
   await page.locator('[data-k="distance"]').fill('5');
   await page.locator('[data-k="durM"]').fill('30');
   await page.locator('[data-act="save"]').click();
   await page.locator('dialog.moment-sheet[open]').waitFor();
   const saved=await page.evaluate(()=>({id:window.state.history[0].id,owner:window.state.user.id,count:window.state.history.length}));
   const dialog=page.locator('dialog.moment-sheet[open]');
   const signup=dialog.getByRole('link',{name:'Créer un compte et garder ma séance',exact:true});await signup.waitFor();
   assert.equal(await signup.getAttribute('href'),'/login?mode=signup');
   assert.match(await dialog.textContent(),/cet appareil/);
   if(process.env.TITAN_QA_SCREENSHOTS)await page.screenshot({path:`/tmp/titan-activation-moment-${width}.png`,fullPage:true});
   await signup.click();await page.waitForURL('**/login?mode=signup');
   await page.locator('[name="name"]').waitFor();
   assert.equal(await page.locator('[name="name"]').isVisible(),true,'real signup form selected');
   await page.goto(BASE+'/journal');await page.waitForFunction(id=>window.state?.history?.some(l=>l.id===id),saved.id);
   assert.equal(await page.evaluate(()=>window.state.history.length),saved.count,'signup navigation never erases the guest activity');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   assert.deepEqual(errors,[]);
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();}
 });
}

for (const width of [360, 390, 1280]) {
 test(`activation: onboarding navigation never covers the sport selection status at ${width}px`, async () => {
  const {context, page} = await fixture(width);
  try {
   await page.setViewportSize({width, height:844});
   await page.goto(BASE+'/onboarding?again=1');
   const status=page.getByText('Aucun sport choisi pour l’instant.', {exact:true});
   await status.waitFor();
   const note=await status.boundingBox(), next=await page.locator('[data-next]').boundingBox();
   assert.ok(note && next);
   assert.ok(next.y >= note.y + note.height, 'navigation must follow the full status text');
   await page.locator('[data-next]').click();
   await page.getByRole('heading', {name:/Combien de jours actifs/i}).waitFor();
  } finally {await context.unrouteAll({behavior:'wait'});await context.close();}
 });
}
