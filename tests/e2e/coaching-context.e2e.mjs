// Real Coaching UI with synthetic sessions and intercepted REST responses; no live account or backend writes.
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
  assert.ok(ready, "local coaching server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A="00000000-0000-4000-8000-000000000841",B="00000000-0000-4000-8000-000000000842";
async function fixture({width=360,hold=[],failSnapshot=false,guest=false}={}){
  const result=await newPage(width),{page}=result;page.setDefaultTimeout(2500);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/js/app/coaching.js?*",route=>route.fulfill({contentType:"text/javascript",body:""}));
  await page.goto(BASE+"/coaching");await page.waitForFunction(()=>window.TitanAdventure?.status==="ready");
  await page.evaluate(({A,B,guest})=>{
    window.coA=A;window.coB=B;window.state.user.id=guest?"guest_coaching_fixture":A;window.coAuthOwner=A;window.coAuthHold=false;window.coAuthCalls=0;
    window.coClient=()=>({auth:{getSession:async()=>{window.coAuthCalls++;const receipt={data:{session:{user:{id:window.coAuthOwner},access_token:window.coAuthOwner===A?"fixture-A":"fixture-B"}}};if(window.coAuthHold)return new Promise(resolve=>window.coAuthRelease=()=>resolve(receipt));return receipt;}}});
    window.titanClient=window.coClient();
    window.coSwitch=(id=B)=>{window.titanAccountTransition={active:true,owner:id,epoch:window.titanAccountTransition.epoch+1};window.dispatchEvent(new Event("titan:account-changing"));window.state.user.id=id;window.coAuthOwner=id;window.titanAccountTransition.active=false;window.dispatchEvent(new Event("titan:account-changed"));};
  },{A,B,guest});
  const network={calls:[],pending:[],hold:new Set(hold),failSnapshot};
  await page.route("**/rest/v1/rpc/titan_coach_portal",async route=>{
    const req=route.request(),payload=req.postDataJSON(),label=req.headers().authorization==="Bearer fixture-B"?"B":"A",id=label==="A"?A:B;
    const action=payload.p_action;network.calls.push({action,data:payload.p_data,label,authorization:req.headers().authorization});
    const link={id:"link-"+label,athlete_id:id,coach_id:"other-"+label,coach_name:"Coach "+label,athlete_name:"Athlète "+label,since_date:"2026-10-01",accepted_at:"2026-10-01T12:00:00Z",revision:1,sport:null,share_details:false,share_notes:true};
    let body=action==="snapshot"?{capacity:3,invites:[],links:[link,{...link,id:"coached-"+label,coach_id:id,athlete_id:"other-"+label}]}:action==="sessions"?{revision:1,total:1,rows:[{id:"session-"+label,sport:"running",date:"2026-10-17T12:00:00Z",val:5,unit:"km",details:{duration:30,note:"Note privée "+label}}]}:action==="assignments"?{revision:1,total:1,rows:[{id:"task-"+label,status:"proposed",title:"Proposition "+label,sport:"running",planned_date:"2026-10-20",created_at:"2026-10-17T12:00:00Z",revision:1}]}:action==="invite"?{token:label.toLowerCase().repeat(48),expires_at:"2026-10-25T12:00:00Z"}:{id:link.id};
    let status=200;
    if(action==="snapshot"&&network.failSnapshot){status=503;body={message:"UNAVAILABLE"};}
    if(label==="A"&&network.hold.has(action))await new Promise(resolve=>network.pending.push({action,release:response=>{if(response){status=response.status;body=response.body;}resolve();}}));
    await route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)}).catch(()=>{});
  });
  await page.addScriptTag({path:ROOT+"/js/app/coaching.js"});
  async function calls(action,count=1){for(let i=0;i<120&&network.calls.filter(c=>c.action===action).length<count;i++)await new Promise(r=>setTimeout(r,20));assert.equal(network.calls.filter(c=>c.action===action).length,count);}
  async function ready(label="A"){await page.getByRole("heading",{name:"Coach "+label,exact:true}).waitFor();await page.getByText("Note privée "+label,{exact:true}).waitFor({state:"attached"});}
  if(!guest&&!failSnapshot&&!hold.some(x=>["snapshot","sessions","assignments"].includes(x)))await ready();
  else if(!guest)await calls("snapshot");
  return {...result,errors,network,calls,ready,close:async()=>{network.hold.clear();network.pending.splice(0).forEach(p=>p.release());await result.context.close();}};
}
const root=page=>page.locator("#coaching");
const mutations=network=>network.calls.filter(c=>!["snapshot","sessions","assignments"].includes(c.action));
async function settle(page){await page.evaluate(()=>new Promise(r=>setTimeout(r,40)));}
async function closed(page,node){await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();}

test("coaching context: a normal consented scope request uses the matching token and keeps the current account",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width}),{page,network}=f;
    try{
      await page.locator("[data-scope]").click();const dialog=page.getByRole("dialog"),node=await dialog.elementHandle();
      await dialog.locator('[name="share_notes"]').uncheck();await dialog.getByRole("button",{name:"Enregistrer mes choix",exact:true}).click();await closed(page,node);
      await f.calls("scope");assert.equal(mutations(network)[0].authorization,"Bearer fixture-A");
      assert.deepEqual(mutations(network)[0].data,{link_id:"link-A",revision:1,since_date:"2026-10-01",sport:null,share_details:false,share_notes:false});
      await f.ready();assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("coaching context: switching account removes old private rows and the open scope draft",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width}),{page}=f;
    try{
      await page.locator("[data-scope]").click();const node=await page.getByRole("dialog").elementHandle();
      await page.evaluate(()=>window.coSwitch());await closed(page,node);await f.ready("B");
      assert.equal((await root(page).innerText()).includes("Coach A"),false);assert.equal((await root(page).textContent()).includes("Note privée A"),false);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("coaching context: old detail success or failure cannot replace a new account's details",async()=>{
  for(const rejected of [false,true]){
    const f=await fixture({hold:["sessions"]}),{page,network}=f;
    try{
      await f.calls("sessions");await page.evaluate(()=>window.coSwitch());await f.ready("B");
      network.pending.splice(0).forEach(p=>p.release(rejected?{status:403,body:{message:"SHARING_UNAVAILABLE"}}:undefined));await settle(page);
      assert.equal((await root(page).textContent()).includes("Note privée A"),false);await f.ready("B");assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("coaching context: a late old snapshot cannot rebuild old-account content",async()=>{
  const f=await fixture({hold:["snapshot"]}),{page,network}=f;
  try{
    await page.evaluate(()=>window.coSwitch());await f.ready("B");network.pending.splice(0).forEach(p=>p.release());await settle(page);
    assert.equal((await root(page).textContent()).includes("Coach A"),false);await f.ready("B");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: a session lookup begun by an old draft cannot send after transition",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    await page.locator("[data-scope]").click();await page.evaluate(()=>window.coAuthHold=true);
    const node=await page.getByRole("dialog").elementHandle();await page.getByRole("dialog").getByRole("button",{name:"Enregistrer mes choix",exact:true}).click();
    await page.waitForFunction(()=>typeof window.coAuthRelease==="function");
    await page.evaluate(()=>{window.coSwitch();window.coAuthHold=false;window.coAuthRelease();});await closed(page,node);await f.ready("B");await settle(page);
    assert.equal(mutations(network).length,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: a retained old form cannot submit with the new account",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    await page.locator("[data-scope]").click();const node=await page.getByRole("dialog").elementHandle();
    await page.evaluate(()=>{window.retainedCoachForm=document.querySelector('dialog[open] form');window.coSwitch();});await closed(page,node);await f.ready("B");
    await page.evaluate(()=>window.retainedCoachForm.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));await settle(page);
    assert.equal(mutations(network).length,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: silent owner, client and epoch changes invalidate the old action surface",async()=>{
  for(const change of ["owner","client","epoch"]){
    const f=await fixture(),{page,network}=f;
    try{
      await page.evaluate(change=>{if(change==="owner"){window.state.user.id=window.coB;window.coAuthOwner=window.coB;}if(change==="client")window.titanClient=window.coClient();if(change==="epoch")window.titanAccountTransition.epoch++;},change);
      await page.locator("[data-scope]").click();assert.equal(await page.getByRole("dialog").count(),0);assert.equal((await root(page).textContent()).includes("Note privée A"),false);
      assert.equal(mutations(network).length,0);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("coaching context: a mismatched authenticated owner clears the old surface without sending",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    await page.locator("[data-scope]").click();const node=await page.getByRole("dialog").elementHandle();await page.evaluate(()=>window.coAuthOwner=window.coB);
    await page.getByRole("dialog").getByRole("button",{name:"Enregistrer mes choix",exact:true}).click();await closed(page,node);
    assert.equal(mutations(network).length,0);assert.equal((await root(page).textContent()).includes("Note privée A"),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: an old invitation response cannot display its private code under a new account",async()=>{
  const f=await fixture({hold:["invite"]}),{page,network}=f;
  try{
    await page.getByRole("tab",{name:"J’accompagne",exact:true}).click();await page.locator("[data-invite]").click();await f.calls("invite");
    await page.evaluate(()=>window.coSwitch());await f.ready("B");network.pending.splice(0).forEach(p=>p.release());await settle(page);
    assert.equal(await page.locator("#co-token").count(),0);assert.equal(await page.getByRole("dialog").count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: a retained revoke confirmation cannot act after account transition",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    await page.locator("[data-revoke]").click();const node=await page.getByRole("dialog").elementHandle();
    await page.evaluate(()=>{window.retainedCoachRevoke=[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==="Révoquer");window.coSwitch();});
    await closed(page,node);await f.ready("B");await page.evaluate(()=>window.retainedCoachRevoke.click());await settle(page);
    assert.equal(mutations(network).length,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: a failed snapshot can reconnect and show only the current account",async()=>{
  const f=await fixture({failSnapshot:true}),{page,network}=f;
  try{
    await page.getByText("La demande n’a pas été confirmée. Réessaie.",{exact:true}).waitFor();network.failSnapshot=false;
    await page.evaluate(()=>window.dispatchEvent(new Event("online")));await f.ready();assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: discovery remains private and makes no coaching request",async()=>{
  const f=await fixture({guest:true}),{page,network}=f;
  try{
    await page.getByRole("heading",{name:"Un suivi qui se construit à deux.",exact:true}).waitFor();
    assert.equal(network.calls.length,0);assert.equal(await root(page).getAttribute("aria-busy"),"false");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});


test("coaching context: a pending revoke result cannot clear the new account",async()=>{
  const f=await fixture({hold:["revoke"]}),{page,network}=f;
  try{
    await page.locator("[data-revoke]").click();const node=await page.getByRole("dialog").elementHandle();
    await page.getByRole("dialog").getByRole("button",{name:"Révoquer",exact:true}).click();await f.calls("revoke");
    await page.evaluate(()=>window.coSwitch());await closed(page,node);await f.ready("B");
    network.pending.splice(0).forEach(p=>p.release());await settle(page);await f.ready("B");
    assert.equal(mutations(network).length,1);assert.equal(mutations(network)[0].label,"A");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: account cleanup leaves unrelated sheets intact",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await page.locator("[data-scope]").click();
    await page.evaluate(()=>window.titanShell.sheet({title:"Aide générale",body:"Texte public"}));
    await page.evaluate(()=>window.coSwitch());await f.ready("B");
    assert.equal(await page.getByRole("dialog",{name:"Choisir ce que je partage",exact:true}).count(),0);
    assert.equal(await page.getByRole("dialog",{name:"Aide générale",exact:true}).count(),1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching context: an older draft invalidates a silently changed refreshed view",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    await page.locator("[data-scope]").click();const node=await page.getByRole("dialog").elementHandle();
    const before=network.calls.filter(c=>c.action==="snapshot").length;
    await page.evaluate(()=>window.dispatchEvent(new Event("online")));await f.calls("snapshot",before+1);await settle(page);
    await page.evaluate(()=>window.titanAccountTransition.epoch++);
    await page.getByRole("dialog").getByRole("button",{name:"Enregistrer mes choix",exact:true}).click();await closed(page,node);
    assert.equal(mutations(network).length,0);assert.equal((await root(page).textContent()).includes("Note privée A"),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
