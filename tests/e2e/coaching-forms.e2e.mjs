// Actual Coaching forms; synthetic sessions and intercepted REST only, no live backend writes.
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
  const network={calls:[],pending:[],hold:new Set(hold),abort:new Set(),failSnapshot};
  await page.route("**/rest/v1/rpc/titan_coach_portal",async route=>{
    const req=route.request(),payload=req.postDataJSON(),label=req.headers().authorization==="Bearer fixture-B"?"B":"A",id=label==="A"?A:B;
    const action=payload.p_action;network.calls.push({action,data:payload.p_data,label,authorization:req.headers().authorization});
    if(network.abort.has(action)){await route.abort("failed");return;}
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

async function scope(f){await f.page.locator("[data-scope]").click();return f.page.getByRole("dialog");}
async function send(dialog){await dialog.locator('button[type="submit"]').click();}
async function release(f,response){const pending=f.network.pending.splice(0);assert.equal(pending.length,1);pending[0].release(response);}

test("coaching forms: pending scope is announced and its fields and exits are disabled",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width,hold:["scope"]}),{page}=f;
    try{
      const dialog=await scope(f);await send(dialog);await f.calls("scope");
      assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"true");await dialog.getByRole("status").getByText("Envoi en cours…",{exact:true}).waitFor();
      assert.equal(await dialog.locator('input[name="share_notes"]').isDisabled(),true);
      assert.equal(await dialog.locator('input[name="since_date"]').isDisabled(),true);
      assert.equal(await dialog.locator('select[name="sport"]').isDisabled(),true);
      assert.equal(await dialog.locator('[data-close]').isDisabled(),true);assert.equal(await dialog.locator('[data-cancel]').isDisabled(),true);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("coaching forms: repeated submit events cannot send another request while pending",async()=>{
  const f=await fixture({hold:["scope"]}),{page,network}=f;
  try{
    const dialog=await scope(f),node=await dialog.elementHandle();
    await dialog.locator("form").evaluate(form=>{form.requestSubmit();form.requestSubmit();form.requestSubmit();});
    await f.calls("scope");await settle(page);assert.equal(mutations(network).length,1);
    await release(f);await closed(page,node);await f.ready();assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

for(const exit of ["escape","cancel","close","backdrop"]){
  test(`coaching forms: ${exit} cannot dismiss a pending request`,async()=>{
    const f=await fixture({hold:["scope"]}),{page}=f;
    try{
      const dialog=await scope(f);await send(dialog);await f.calls("scope");
      if(exit==="escape")await page.keyboard.press("Escape");
      else if(exit==="backdrop")await dialog.dispatchEvent("click");
      else await dialog.locator(exit==="cancel"?'[data-cancel]':'[data-close]').dispatchEvent("click");
      await settle(page);assert.equal(await dialog.count(),1);assert.equal(await dialog.evaluate(d=>d.open),true);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  });
}

test("coaching forms: busy lock starts before the asynchronous session lookup returns",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    const dialog=await scope(f);await page.evaluate(()=>window.coAuthHold=true);await send(dialog);
    await page.waitForFunction(()=>typeof window.coAuthRelease==="function");
    assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"true");assert.equal(mutations(network).length,0);
    await page.keyboard.press("Escape");assert.equal(await dialog.evaluate(d=>d.open),true);
    await page.evaluate(()=>{window.coAuthHold=false;window.coAuthRelease();});await f.calls("scope");
  }finally{await page.evaluate(()=>{window.coAuthHold=false;window.coAuthRelease?.();}).catch(()=>{});await f.close();}
});

test("coaching forms: a rejected request keeps the draft and restores focus and controls",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width,hold:["scope"]}),{page}=f;
    try{
      const dialog=await scope(f);await dialog.locator('[name="share_notes"]').uncheck();await dialog.locator('[name="since_date"]').fill("2026-10-05");
      await send(dialog);await f.calls("scope");await release(f,{status:503,body:{message:"UNAVAILABLE"}});
      await dialog.getByRole("alert").getByText("La demande n’a pas été confirmée. Réessaie.",{exact:true}).waitFor();
      assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"false");assert.equal(await dialog.locator('[name="share_notes"]').isChecked(),false);
      assert.equal(await dialog.locator('[name="since_date"]').inputValue(),"2026-10-05");
      assert.equal(await dialog.locator('button[type="submit"]').evaluate(b=>b===document.activeElement),true);
      for(const selector of ['[data-close]','[data-cancel]','input','select','button[type="submit"]'])assert.equal(await dialog.locator(selector).first().isDisabled(),false);
      assert.equal(await dialog.getByRole("status").textContent(),"");assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("coaching forms: explicit retry clears the previous error and sends the preserved consent once",async()=>{
  const f=await fixture({hold:["scope"]}),{page,network}=f;
  try{
    const dialog=await scope(f),node=await dialog.elementHandle();await dialog.locator('[name="share_notes"]').uncheck();await send(dialog);await f.calls("scope");
    await release(f,{status:503,body:{message:"UNAVAILABLE"}});await dialog.getByRole("alert").getByText("La demande n’a pas été confirmée. Réessaie.",{exact:true}).waitFor();
    await send(dialog);await f.calls("scope",2);assert.equal(await dialog.locator('[role="alert"]').textContent(),"");assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"true");
    assert.equal(mutations(network).length,2);assert.deepEqual(mutations(network)[1].data,mutations(network)[0].data);
    await release(f);await closed(page,node);await f.ready();assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: preview completion opens a fresh consent form without implicitly accepting",async()=>{
  const f=await fixture({hold:["preview"]}),{page,network}=f;
  try{
    await page.locator('[data-join]').click();let dialog=page.getByRole("dialog");const node=await dialog.elementHandle();
    await dialog.locator('[name="token"]').fill("a".repeat(48));await send(dialog);await f.calls("preview");assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"true");
    await release(f);await closed(page,node);dialog=page.getByRole("dialog",{name:"Partager avec ce coach",exact:true});await dialog.waitFor();
    assert.equal(await dialog.locator('[name="consent"]').isChecked(),false);assert.equal(await dialog.locator('[name="consent"]').isDisabled(),false);
    assert.equal(network.calls.filter(c=>c.action==="accept").length,0);assert.equal(await dialog.locator('button[type="submit"]').isDisabled(),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: proposal text survives a rejection and becomes editable again",async()=>{
  const f=await fixture({hold:["assign"]}),{page}=f;
  try{
    await page.getByRole("tab",{name:"J’accompagne",exact:true}).click();await page.locator('[data-propose]').click();const dialog=page.getByRole("dialog");
    await dialog.locator('[name="title"]').fill("Séance de reprise");await dialog.locator('[name="instructions"]').fill("Courir doucement 20 min.");await send(dialog);await f.calls("assign");
    assert.equal(await dialog.locator('textarea').isDisabled(),true);await release(f,{status:503,body:{message:"UNAVAILABLE"}});
    await dialog.getByRole("alert").getByText("La demande n’a pas été confirmée. Réessaie.",{exact:true}).waitFor();
    assert.equal(await dialog.locator('[name="instructions"]').inputValue(),"Courir doucement 20 min.");assert.equal(await dialog.locator('textarea').isDisabled(),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: account transition still closes a busy draft and ignores its rejection",async()=>{
  const f=await fixture({hold:["scope"]}),{page,network}=f;
  try{
    const dialog=await scope(f),node=await dialog.elementHandle();await send(dialog);await f.calls("scope");
    await page.evaluate(()=>window.coSwitch());await closed(page,node);await f.ready("B");
    await release(f,{status:503,body:{message:"UNAVAILABLE"}});await settle(page);await f.ready("B");assert.equal(await page.getByRole("dialog").count(),0);assert.equal(mutations(network).length,1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: an idle draft can be cancelled without a request",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    const dialog=await scope(f),node=await dialog.elementHandle();await dialog.locator('[data-cancel]').click();await closed(page,node);
    assert.equal(mutations(network).length,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});


test("coaching forms: accepted invitation retains the explicit consent captured before locking",async()=>{
  const f=await fixture({hold:["accept"]}),{page,network}=f;
  try{
    await page.locator('[data-join]').click();let dialog=page.getByRole("dialog");await dialog.locator('[name="token"]').fill("a".repeat(48));await send(dialog);
    dialog=page.getByRole("dialog",{name:"Partager avec ce coach",exact:true});await dialog.waitFor();const node=await dialog.elementHandle();
    await dialog.locator('[name="consent"]').check();await dialog.locator('[name="share_notes"]').check();await send(dialog);await f.calls("accept");
    assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"true");const call=network.calls.find(c=>c.action==="accept");
    assert.equal(call.data.consent,true);assert.equal(call.data.share_notes,true);assert.equal(call.data.share_details,false);assert.equal(call.data.token,"a".repeat(48));assert.equal(call.authorization,"Bearer fixture-A");
    await release(f);await closed(page,node);await f.ready();assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: a transport failure restores the draft for one explicit retry",async()=>{
  const f=await fixture(),{page,network}=f;
  try{
    network.abort.add("scope");const dialog=await scope(f),node=await dialog.elementHandle();await dialog.locator('[name="since_date"]').fill("2026-10-06");await send(dialog);await f.calls("scope");
    await dialog.getByRole("alert").getByText("La demande n’a pas été confirmée. Réessaie.",{exact:true}).waitFor();
    assert.equal(await dialog.locator("form").getAttribute("aria-busy"),"false");assert.equal(await dialog.locator('[name="since_date"]').inputValue(),"2026-10-06");assert.equal(mutations(network).length,1);
    network.abort.clear();await send(dialog);await f.calls("scope",2);await closed(page,node);await f.ready();assert.equal(mutations(network).length,2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: recovery preserves a control that was already disabled",async()=>{
  const f=await fixture({hold:["scope"]}),{page}=f;
  try{
    const dialog=await scope(f);await dialog.locator('[name="sport"]').evaluate(el=>el.disabled=true);await send(dialog);await f.calls("scope");
    await release(f,{status:503,body:{message:"UNAVAILABLE"}});await dialog.getByRole("alert").getByText("La demande n’a pas été confirmée. Réessaie.",{exact:true}).waitFor();
    assert.equal(await dialog.locator('[name="sport"]').isDisabled(),true);assert.equal(await dialog.locator('[name="since_date"]').isDisabled(),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: recovery does not steal focus from a newer unrelated sheet",async()=>{
  const f=await fixture({hold:["scope"]}),{page}=f;
  try{
    const dialog=await scope(f);await send(dialog);await f.calls("scope");
    await page.evaluate(()=>{const d=window.titanShell.sheet({title:"Aide générale",body:'<button type="button" id="co-help-focus">Continuer</button>'});d.querySelector("button#co-help-focus").focus();});
    await release(f,{status:503,body:{message:"UNAVAILABLE"}});
    await page.waitForFunction(()=>document.querySelector('.jr-edit-error')?.textContent.includes("Réessaie"));
    assert.equal(await page.locator('#co-help-focus').evaluate(b=>b===document.activeElement),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("coaching forms: the progress live region is outside the busy form",async()=>{
  const f=await fixture({hold:["scope"]}),{page}=f;
  try{
    const dialog=await scope(f);await send(dialog);await f.calls("scope");
    assert.equal(await dialog.getByRole("status").evaluate(el=>!!el.closest('[aria-busy="true"]')),false);
    assert.equal(await dialog.getByRole("status").textContent(),"Envoi en cours…");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
