// Real session recap and nested share UI with synthetic in-memory owners/receipts; no real accounts or writes.
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
  assert.ok(ready, "local goals server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A="00000000-0000-4000-8000-000000000821", B="00000000-0000-4000-8000-000000000822";
async function fixture(width=360,paused=false,open=true) {
  const result=await newPage(width),{page}=result;
  page.setDefaultTimeout(2500);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.goto(BASE+"/journal");
  await page.waitForFunction(()=>window.TitanAdventure?.status==="ready"&&window.TitanAdventure.snapshot?.owner===window.state.user.id);
  if(paused)await page.clock.pauseAt(new Date("2026-10-18T12:01:00Z"));
  await page.evaluate(({A,B,open})=>{
    window.momentA=A;window.momentB=B;window.state.user.id=A;
    window.momentLog={id:"00000000-0000-4000-8000-000000000829",sport:"running",date:"2026-10-18T10:00:00Z",val:5,unit:"km",xp:0,syncStatus:"pending",details:{duration:30,bio:{rpe:8}}};
    window.state.history=[window.momentLog];window.momentRefreshes=0;
    window.TitanAdventure.refresh=()=>{window.momentRefreshes++;};
    window.shareOpenCalls=[];const share=window.TitanShare.open;
    window.TitanShare.open=(...args)=>{window.shareOpenCalls.push(args);return share(...args);};
    window.momentSwitch=()=>{
      window.titanAccountTransition={active:true,owner:B,epoch:window.titanAccountTransition.epoch+1};
      window.dispatchEvent(new Event("titan:account-changing"));window.state.user.id=B;window.state.history=[];
      window.titanAccountTransition.active=false;window.dispatchEvent(new Event("titan:account-changed"));
    };
    if(open)window.recap=window.TitanMoment.open(window.momentLog);
  },{A,B,open});
  if(open){await recap(page).waitFor();if(!paused)await page.clock.runFor(50);}
  return {...result,errors};
}
const recap=page=>page.locator("dialog.moment-sheet[open]");
const done=page=>recap(page).locator('[data-moment="done"]');
const share=page=>recap(page).locator('[data-moment="share"]');
const journal=page=>recap(page).getByRole("link",{name:"Voir dans le journal",exact:true});
async function focused(locator){const state=await locator.evaluate(el=>({same:document.activeElement===el,actual:document.activeElement.outerHTML.slice(0,260)}));assert.equal(state.same,true,"Focus remains on the chosen live control: "+state.actual);}
async function refresh(page,event="titan:history-updated"){
  const old=await recap(page).locator(".moment").elementHandle();
  await page.evaluate(event=>window.dispatchEvent(new Event(event)),event);
  await page.waitForFunction(el=>!el.isConnected,old);await old.dispose();
}
async function closed(page,node){await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();}

test("recap context: account transition removes private recap and a retained share action cannot reopen it",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      const node=await recap(page).elementHandle();
      await page.evaluate(()=>{window.retainedMomentShare=window.recap.querySelector('[data-moment="share"]');window.momentSwitch();});
      await closed(page,node);
      await page.evaluate(()=>{window.retainedMomentShare.click();window.dispatchEvent(new Event("titan:history-updated"));window.dispatchEvent(new Event("titan:adventure-updated"));});
      assert.equal(await page.locator(".moment-sheet").count(),0);assert.equal(await page.evaluate(()=>window.shareOpenCalls.length),0);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("recap context: a background update invalidates silent owner, client, epoch and transition changes",async()=>{
  for(const change of ["owner","client","epoch","transition"]){
    const {page,context,errors}=await fixture();
    try{
      const node=await recap(page).elementHandle();
      await page.evaluate(change=>{
        if(change==="owner"){window.state.user.id=window.momentB;window.state.history=[];}
        if(change==="client")window.titanClient={fixture:"other-client"};
        if(change==="epoch")window.titanAccountTransition.epoch++;
        if(change==="transition")window.titanAccountTransition.active=true;
        window.dispatchEvent(new Event("titan:adventure-updated"));
      },change);
      await closed(page,node);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("recap context: a retained action checks the owner even without a transition event or update",async()=>{
  const {page,context,errors}=await fixture();
  try{
    const node=await recap(page).elementHandle();
    await page.evaluate(()=>{window.state.user.id=window.momentB;window.state.history=[];});
    await share(page).click();await closed(page,node);
    assert.equal(await page.evaluate(()=>window.shareOpenCalls.length),0);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap context: an inactive or missing owner cannot open a new recap",async()=>{
  for(const change of ["missing","transition"]){
    const {page,context,errors}=await fixture(360,false,false);
    try{
      await page.evaluate(change=>{if(change==="missing")window.state.user.id=null;else window.titanAccountTransition.active=true;window.TitanMoment.open(window.momentLog);},change);
      assert.equal(await page.locator(".moment-sheet").count(),0);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("recap focus: history and adventure refreshes preserve each active action at both widths",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      for(const locator of [done(page),share(page),journal(page)])for(const event of ["titan:history-updated","titan:adventure-updated"]){
        await locator.focus();await refresh(page,event);await focused(locator);
      }
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("recap focus: server receipt updates the displayed reward once while retaining action focus",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await done(page).focus();
    await page.evaluate(()=>{window.momentLog={...window.momentLog,syncStatus:"confirmed",xp:300,details:{...window.momentLog.details,serverReward:{xp:300,requested_xp:300}}};window.state.history=[window.momentLog];});
    await refresh(page);await focused(done(page));
    assert.equal(await recap(page).locator(".moment-xp").innerText(),"+300 XP");
    assert.equal(await page.evaluate(()=>window.momentRefreshes),1);
    await refresh(page,"titan:adventure-updated");await focused(done(page));assert.equal(await page.evaluate(()=>window.momentRefreshes),1);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap: a held reward is explained instead of showing a hollow +0 XP",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>{window.momentLog={...window.momentLog,syncStatus:"confirmed",xp:0,details:{...window.momentLog.details,serverReward:{xp:0,credits:0,requested_xp:300,reward_held:true,held_xp:300,held_credits:30,release_at:new Date(Date.now()+23*3600000).toISOString()}}};window.state.history=[window.momentLog];});
    await refresh(page);
    const text=await recap(page).innerText();
    assert.match(text,/Récompense en vérification/);
    assert.match(text,/300 XP/);
    assert.match(text,/30 crédits/);
    assert.match(text,/24 h|23 h/);
    assert.doesNotMatch(await recap(page).locator(".moment-xp").innerText(),/\+0 XP/);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap focus: delayed initial focus cannot replace a user-selected journal link",async()=>{
  const {page,context,errors}=await fixture(360,true);
  try{
    await journal(page).focus();await page.clock.runFor(50);await focused(journal(page));assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap focus: normal initial focus still reaches Done when no other action was chosen",async()=>{
  const {page,context,errors}=await fixture(360,true);
  try{
    await page.clock.runFor(50);await focused(done(page));assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap focus: a nested share draft keeps focus and content during parent refreshes",async()=>{
  const {page,context,errors}=await fixture(360,true);
  try{
    await share(page).click();const child=page.getByRole("dialog",{name:"Partager un Moment",exact:true});
    const title=child.locator('[name="title"]');await title.fill("Brouillon conservé");await title.focus();
    await refresh(page);await page.clock.runFor(50);await focused(title);assert.equal(await title.inputValue(),"Brouillon conservé");
    const childNode=await child.elementHandle();await child.locator('[data-close]').click();await closed(page,childNode);
    await focused(share(page));
    assert.equal(await recap(page).count(),1);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap context: switching accounts closes both recap and its nested share draft",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await share(page).click();const child=page.getByRole("dialog",{name:"Partager un Moment",exact:true});
    await child.locator('[name="title"]').fill("Privé A");
    const parentNode=await recap(page).elementHandle(),childNode=await child.elementHandle();
    await page.evaluate(()=>window.momentSwitch());await closed(page,parentNode);await closed(page,childNode);
    assert.equal(await page.locator(".moment-sheet").count(),0);assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap context: closing unregisters refresh listeners and prevents delayed focus",async()=>{
  const {page,context,errors}=await fixture(360,true);
  try{
    const node=await recap(page).elementHandle();await done(page).click();await closed(page,node);
    await page.evaluate(()=>{window.nextDialog=window.titanShell.sheet({title:"Autre action",body:'<input aria-label="Autre saisie">'});});
    const input=page.getByRole("textbox",{name:"Autre saisie",exact:true});await input.focus();
    await page.evaluate(()=>{window.momentLog.syncStatus="confirmed";window.state.history=[window.momentLog];window.dispatchEvent(new Event("titan:history-updated"));});
    await page.clock.runFor(50);await focused(input);assert.equal(await page.evaluate(()=>window.momentRefreshes),0);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});


test("recap focus: returning from share does not take focus from a newly opened dialog",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await share(page).click();await refresh(page);
    const child=page.getByRole("dialog",{name:"Partager un Moment",exact:true}),childNode=await child.elementHandle();
    await page.evaluate(()=>{document.querySelector('dialog[aria-label="Partager un Moment"]').close();const next=window.titanShell.sheet({title:"Autre fenêtre",body:'<input aria-label="Saisie suivante">'});next.querySelector("input").focus();});
    await closed(page,childNode);await focused(page.getByRole("textbox",{name:"Saisie suivante",exact:true}));assert.deepEqual(errors,[]);
  }finally{await context.close();}
});


test("recap focus: a removed share action falls back to Done after the log becomes historical",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await share(page).focus();
    await page.evaluate(()=>{window.momentLog={...window.momentLog,date:"2026-08-01T10:00:00Z"};window.state.history=[window.momentLog];});
    await refresh(page);assert.equal(await share(page).count(),0);await focused(done(page));assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("recap context: guest recaps remain available with estimated reward and no friend-sharing action",async()=>{
  const {page,context,errors}=await fixture(360,false,false);
  try{
    await page.evaluate(()=>{window.state.user.id="guest_recap_fixture";window.recap=window.TitanMoment.open(window.momentLog);});
    await recap(page).waitFor();assert.equal(await recap(page).locator(".moment").getAttribute("data-state"),"local");
    assert.equal(await share(page).count(),0);assert.match(await recap(page).locator(".moment-xp").innerText(),/≈/);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
