// Real Records details and image renderer; synthetic histories/read receipts, no external write or share.
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
  assert.ok(ready, "local records server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A="00000000-0000-4000-8000-000000000871",B="00000000-0000-4000-8000-000000000872";
async function fixture({width=360,holdLink=false}={}){
  const result=await newPage(width),{page}=result;page.setDefaultTimeout(2500);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/js/app/records.js?*",r=>r.fulfill({contentType:"text/javascript",body:""}));await page.route("**/js/app/card.js?*",r=>r.fulfill({contentType:"text/javascript",body:""}));
  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00Z"));await page.goto(BASE+"/records");await page.waitForFunction(()=>window.TitanAdventure?.status==="ready");
  await page.evaluate(({A,B,holdLink})=>{
    window.rc={A,B,holdLink,linkCalls:[],links:[],cards:[],shares:[],files:[],shareCalls:0};
    window.rcHistory=(id)=>[5,id===A?8:12].map((val,i)=>({id:(id===A?"source-A-":"source-B-")+i,sport:"running",unit:"km",val,xp:0,date:`2026-10-${16+i}T12:00:00Z`,syncStatus:"confirmed",details:{duration:30+15*i}}));
    window.state.user.id=A;window.state.user.name="Athlète A";window.state.history=window.rcHistory(A);
    window.rcClient=()=>({rpc:async name=>{if(name!=="titan_public_card_settings")throw Error("Unexpected RPC: "+name);const owner=window.state.user.id;window.rc.linkCalls.push(owner);const data={enabled:false,slug:owner===A?"aaaaaaa1":"bbbbbbb2"};if(window.rc.holdLink)return new Promise(resolve=>window.rc.links.push(()=>resolve({data})));return {data};}});
    window.titanClient=window.rcClient();
    window.rcSwitch=(publish=true)=>{window.titanAccountTransition={active:true,epoch:window.titanAccountTransition.epoch+1};window.dispatchEvent(new Event("titan:account-changing"));window.state.user.id=B;window.state.user.name="Athlète B";window.titanAccountTransition.active=false;window.dispatchEvent(new Event("titan:account-changed"));if(publish){window.state.history=window.rcHistory(B);window.dispatchEvent(new Event("titan:history-updated"));}};
    const share=window.TitanShare.open;window.TitanShare.open=(...args)=>{window.rc.shares.push(args[0]);return share(...args);};
    const makeUrl=URL.createObjectURL;URL.createObjectURL=file=>{window.rc.files.push(file);return makeUrl(file);};
    const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);};
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{window.rc.shareCalls++;}});
  },{A,B,holdLink});
  await page.addScriptTag({path:ROOT+"/js/app/card.js"});await page.evaluate(()=>{const open=window.TitanCard.open;window.TitanCard.open=(o)=>{window.rc.cards.push(o);return open(o);};});
  await page.addScriptTag({path:ROOT+"/js/app/records.js"});await page.locator('.rc-card[data-kind="distance"]').waitFor();
  return {...result,errors,close:async()=>{await page.evaluate(()=>window.rc.links.splice(0).forEach(r=>r())).catch(()=>{});await result.context.close();}};
}
const detail=page=>page.locator('dialog[open]:has(.rc-big)');
const imageDialog=page=>page.getByRole("dialog",{name:"Image à partager",exact:true});
async function open(f){await f.page.locator('.rc-card[data-kind="distance"]').click();await detail(f.page).waitFor();return detail(f.page);}
async function closed(page,node){await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();}
async function tick(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function imageReady(page){await page.waitForFunction(()=>document.querySelector('.cd-preview img')?.src.startsWith("data:image/png"));}

test("record detail: source, image and friend sharing keep the current record",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width}),{page}=f;
    try{
      let d=await open(f);assert.equal((await d.locator('.rc-big').innerText()).trim(),"8 km");assert.match(await d.locator('a[href^="/journal?session="]').getAttribute("href"),/source-A-1/);
      await d.locator('[data-card-record]').click();await imageReady(page);assert.equal(await page.evaluate(()=>window.rc.cards[0].value),"8 km");await imageDialog(page).locator('[data-close]').click();await tick(page);
      d=detail(page);await d.locator('[data-share-record]').click();const share=page.locator('dialog[open]:has([name="title"])');await share.waitFor();assert.equal(await page.evaluate(()=>window.rc.shares[0].logId),"source-A-1");await share.locator('[data-cancel]').click();await tick(page);
      assert.equal(await d.locator('[data-share-record]').evaluate(el=>el===document.activeElement),true);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("record detail: account change removes old surface and retained actions cannot reopen private UI",async()=>{
  const f=await fixture(),{page}=f;
  try{
    const d=await open(f),node=await d.elementHandle();await page.evaluate(()=>{window.rcOldCard=document.querySelector('[data-card-record]');window.rcOldShare=document.querySelector('[data-share-record]');window.rcSwitch();});await closed(page,node);await tick(page);
    await page.evaluate(()=>{window.rcOldCard.click();window.rcOldShare.click();});await tick(page);assert.equal(await page.getByRole("dialog").count(),0);assert.deepEqual(await page.evaluate(()=>[window.rc.cards.length,window.rc.shares.length]),[0,0]);assert.match(await page.locator('.rc-card[data-kind="distance"]').innerText(),/12 km/);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record detail: records wait for history after account-changed rather than reusing old history",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await page.evaluate(()=>window.rcSwitch(false));await tick(page);assert.equal(await page.locator('#records [data-record]').count(),0);assert.equal(await detail(page).count(),0);
    await page.evaluate(()=>{window.state.history=window.rcHistory(window.rc.B);window.dispatchEvent(new Event("titan:history-updated"));});await page.locator('.rc-card[data-kind="distance"]').waitFor();assert.match(await page.locator('.rc-card[data-kind="distance"]').innerText(),/12 km/);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

for(const change of ["owner","client","epoch","transition"]){
  test(`record detail: a silent ${change} change invalidates an old share action`,async()=>{
    const f=await fixture(),{page}=f;
    try{
      const d=await open(f),node=await d.elementHandle();await page.evaluate(change=>{if(change==="owner")window.state.user.id=window.rc.B;if(change==="client")window.titanClient=window.rcClient();if(change==="epoch")window.titanAccountTransition.epoch++;if(change==="transition")window.titanAccountTransition.active=true;},change);
      await d.locator('[data-share-record]').click();await closed(page,node);assert.equal(await page.evaluate(()=>window.rc.shares.length),0);assert.equal(await page.locator('#records [data-record]').count(),0);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  });
}

test("record detail: retained actions from a normally closed detail stay inactive",async()=>{
  const f=await fixture(),{page}=f;
  try{
    const d=await open(f),node=await d.elementHandle();await page.evaluate(()=>window.rcOldCard=document.querySelector('[data-card-record]'));await d.locator('[data-close]').click();await closed(page,node);await page.evaluate(()=>window.rcOldCard.click());await tick(page);assert.equal(await page.evaluate(()=>window.rc.cards.length),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record detail: history correction updates values and preserves the chosen detail action",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width}),{page}=f;
    try{
      const d=await open(f);await d.locator('[data-share-record]').focus();await page.evaluate(()=>{window.state.history[1].val=10;window.dispatchEvent(new Event("titan:history-updated"));});await page.waitForFunction(()=>document.querySelector('dialog .rc-big')?.textContent.trim()==="10 km");
      assert.equal(await d.locator('[data-share-record]').evaluate(el=>el===document.activeElement),true);await d.locator('[data-card-record]').click();await imageReady(page);assert.equal(await page.evaluate(()=>window.rc.cards[0].value),"10 km");assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("record detail: archiving a source updates its replacement then closes an absent record",async()=>{
  const f=await fixture(),{page}=f;
  try{
    const d=await open(f);await d.locator('a[href^="/journal?session="]').focus();await page.evaluate(()=>{window.state.history[1].archived_at="2026-10-18T11:00:00Z";window.dispatchEvent(new Event("titan:history-updated"));});await page.waitForFunction(()=>document.querySelector('dialog .rc-big')?.textContent.trim()==="5 km");assert.match(await d.locator('a[href^="/journal?session="]').getAttribute("href"),/source-A-0/);assert.equal(await d.locator('a[href^="/journal?session="]').evaluate(el=>el===document.activeElement),true,"source focus follows its replacement session");
    const node=await d.elementHandle();await page.evaluate(()=>{window.state.history=[];window.dispatchEvent(new Event("titan:history-updated"));});await closed(page,node);await tick(page);assert.equal(await page.locator('#records [data-record]').count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record detail: background updates leave a newer unrelated sheet and its focus intact",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await page.evaluate(()=>{const d=window.titanShell.sheet({title:"Aide générale",body:'<button id="rc-help">Continuer</button>'});d.querySelector("button#rc-help").focus();window.state.history[1].val=10;window.dispatchEvent(new Event("titan:history-updated"));});await tick(page);
    assert.equal(await page.getByRole("dialog",{name:"Aide générale",exact:true}).count(),1);assert.equal(await page.locator('#rc-help').evaluate(el=>el===document.activeElement),true);assert.equal((await detail(page).locator('.rc-big').textContent()).trim(),"10 km");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record image: a delayed profile lookup cannot open an old account image after transition",async()=>{
  const f=await fixture({holdLink:true}),{page}=f;
  try{
    await open(f);await detail(page).locator('[data-card-record]').click();await page.waitForFunction(()=>window.rc.links.length===1);await page.evaluate(()=>{window.rcSwitch();window.rc.links.splice(0).forEach(r=>r());});await tick(page);await page.waitForTimeout(100);assert.equal(await imageDialog(page).count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record image: owner changes invalidate the cached public profile lookup",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await detail(page).locator('[data-card-record]').click();await imageReady(page);await page.evaluate(()=>window.rcSwitch());await tick(page);await page.locator('.rc-card[data-kind="distance"]').click();await detail(page).locator('[data-card-record]').click();await imageReady(page);
    assert.deepEqual(await page.evaluate(()=>window.rc.linkCalls),[A,B]);assert.equal(await page.evaluate(()=>window.rc.cards.at(-1).name),"Athlète B");assert.equal(await page.getByRole("dialog").count(),2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record image: an encoding completed after transition cannot download or share the old image",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await detail(page).locator('[data-card-record]').click();await imageReady(page);const node=await imageDialog(page).elementHandle();
    await page.evaluate(()=>{const toBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,type){window.rcReleaseBlob=()=>toBlob.call(this,cb,type);};});await imageDialog(page).locator('[data-save]').click();await page.waitForFunction(()=>typeof window.rcReleaseBlob==="function");
    await page.evaluate(()=>{window.rcSwitch();window.rcReleaseBlob();});await closed(page,node);await tick(page);assert.equal(await page.evaluate(()=>window.rc.files.length),0);assert.equal(await page.evaluate(()=>window.rc.shareCalls),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record image: correcting history retires the open image and restores its current detail action",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await detail(page).locator('[data-card-record]').click();await imageReady(page);const node=await imageDialog(page).elementHandle();
    await page.evaluate(()=>{window.state.history[1].val=10;window.dispatchEvent(new Event("titan:history-updated"));});await closed(page,node);await tick(page);
    assert.equal((await detail(page).locator('.rc-big').textContent()).trim(),"10 km");assert.equal(await detail(page).locator('[data-card-record]').evaluate(el=>el===document.activeElement),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record image: closing its source while profile lookup is pending prevents a late image",async()=>{
  const f=await fixture({holdLink:true}),{page}=f;
  try{
    const d=await open(f);await d.locator('[data-card-record]').click();await page.waitForFunction(()=>window.rc.links.length===1);const node=await d.elementHandle();await d.locator('[data-close]').click();await closed(page,node);
    await page.evaluate(()=>window.rc.links.splice(0).forEach(r=>r()));await page.waitForTimeout(80);assert.equal(await imageDialog(page).count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record detail: dismissal after a history render returns to the current record trigger",async()=>{
  const f=await fixture(),{page}=f;
  try{
    const d=await open(f);await page.evaluate(()=>{window.state.history[1].val=10;window.dispatchEvent(new Event("titan:history-updated"));});await tick(page);
    const node=await d.elementHandle();await d.locator('[data-close]').click();await closed(page,node);await tick(page);
    assert.equal(await page.locator('[data-record="distance:running"]').evaluateAll(nodes=>nodes.some(n=>n===document.activeElement)),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record detail: failed synchronization keeps old records withdrawn until fresh history arrives",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await page.evaluate(()=>{window.rcSwitch(false);window.dispatchEvent(new Event("titan:history-error"));});await tick(page);
    await page.locator('#records').getByRole("status").getByText("Synchronisation du journal interrompue. Les records seront actualisés à sa reprise.",{exact:true}).waitFor();assert.equal(await page.locator('#records [data-record]').count(),0);
    await page.evaluate(()=>{window.state.history=window.rcHistory(window.rc.B);window.dispatchEvent(new Event("titan:history-updated"));});await page.locator('.rc-card[data-kind="distance"]').waitFor();assert.match(await page.locator('.rc-card[data-kind="distance"]').innerText(),/12 km/);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("record image: an unchanged history refresh keeps the current preview open",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await open(f);await detail(page).locator('[data-card-record]').click();await imageReady(page);const node=await imageDialog(page).elementHandle();
    await page.evaluate(()=>window.dispatchEvent(new Event("titan:history-updated")));await tick(page);
    assert.equal(await node.evaluate(el=>el.isConnected&&el.open),true);assert.deepEqual(f.errors,[]);await node.dispose();
  }finally{await f.close();}
});
