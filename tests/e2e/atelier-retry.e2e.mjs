// Actual Atelier catalogue UI; synthetic read-only client, no live account, purchase or backend write.
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
  assert.ok(ready, "local atelier server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A="00000000-0000-4000-8000-000000000861",B="00000000-0000-4000-8000-000000000862";
async function fixture({width=360,fail=false,hold=false,guest=false,missing=false}={}){
  const result=await newPage(width),{page}=result;page.setDefaultTimeout(2500);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/js/app/atelier.js?*",r=>r.fulfill({contentType:"text/javascript",body:""}));
  await page.goto(BASE+"/boutique");await page.waitForFunction(()=>window.TitanAdventure?.status==="ready");
  await page.evaluate(({A,B,fail,hold,guest,missing})=>{
    window.state.user.id=guest?"guest_atelier_retry":A;
    window.at={A,B,fail,hold,missing,calls:[],pending:[],profileCalls:0};
    const response=id=>({owner:id,credits:id===A?861:862,level:1,week_credits:0,week_credit_cap:960,plus:{active:false},appearance:{},items:[
      {id:"cos_frame_standard",cosmetic:"frame-standard",slot:"frame",name:"Standard",unlock:"default",price:0,owned:true,permanent:true},
      {id:"cos_frame_givre",cosmetic:"frame-frost",slot:"frame",name:"Cadre Givre",unlock:"credits",price:1400,owned:false,permanent:false}
    ]});
    window.atClient=()=>({rpc:async(name)=>{
      if(name!=="titan_atelier")throw Error("Unexpected mutation in read-only fixture: "+name);
      const id=window.state.user.id;window.at.calls.push({name,owner:id});
      if(window.at.hold)return new Promise(resolve=>window.at.pending.push({owner:id,release:result=>resolve(result||{data:response(id)})}));
      if(window.at.missing)return {error:{code:"PGRST202",message:"Could not find titan_atelier"}};
      if(window.at.fail)return {error:{message:"UNAVAILABLE"}};
      return {data:response(id)};
    },from:name=>({select:()=>({eq:()=>({maybeSingle:async()=>{if(name!=="profiles")throw Error("Unexpected table");window.at.profileCalls++;return {data:{is_elite:true}};}})})})});
    window.titanClient=window.atClient();
    window.atSwitch=(id=B)=>{window.titanAccountTransition={active:true,epoch:window.titanAccountTransition.epoch+1};window.dispatchEvent(new Event("titan:account-changing"));window.state.user.id=id;window.titanAccountTransition.active=false;window.dispatchEvent(new Event("titan:account-changed"));};
  },{A,B,fail,hold,guest,missing});
  await page.addScriptTag({path:ROOT+"/js/app/atelier.js"});
  async function calls(n){await page.waitForFunction(n=>window.at.calls.length>=n,n);assert.equal(await page.evaluate(()=>window.at.calls.length),n);}
  async function ready(label="A"){await page.getByRole("heading",{name:"Collection",exact:true}).waitFor();assert.equal((await page.locator(".at-balance").innerText()).trim(),label==="A"?"861":"862");}
  if(!guest&&!hold&&!missing){if(fail)await page.locator('[data-retry]').waitFor();else await ready();}
  return {...result,errors,calls,ready,close:async()=>{await page.evaluate(()=>{window.at.hold=false;window.at.pending.splice(0).forEach(p=>p.release());}).catch(()=>{});await result.context.close();}};
}
const root=page=>page.locator("#atelier");
async function settle(page){await page.evaluate(()=>new Promise(r=>setTimeout(r,40)));}
async function retry(f){await f.page.evaluate(()=>{window.at.fail=false;window.at.hold=true;});const button=f.page.locator('[data-retry]');await button.focus();await f.page.keyboard.press("Enter");await f.calls(2);}
async function release(page,error=false){await page.evaluate(error=>{const p=window.at.pending.pop();if(!p)throw Error("Missing pending catalogue read");p.release(error?{error:{message:"UNAVAILABLE"}}:undefined);},error);}

test("atelier retry: first load has a live status outside the busy placeholder",async()=>{
  const f=await fixture({hold:true}),{page}=f;
  try{
    await f.calls(1);await root(page).getByRole("status").getByText("Chargement de l’Atelier…",{exact:true}).waitFor();
    assert.equal(await root(page).getByRole("status").evaluate(el=>!!el.closest('[aria-busy="true"]')),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: keyboard retry exposes progress and disables another retry",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width,fail:true}),{page}=f;
    try{
      await retry(f);await root(page).getByRole("status").getByText("Chargement de l’Atelier…",{exact:true}).waitFor();
      assert.equal(await page.locator('[data-retry]').isDisabled(),true);assert.equal(await root(page).getByRole("status").evaluate(el=>el===document.activeElement),true);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("atelier retry: rapid retries and reconnect events share the current catalogue read",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    await page.evaluate(()=>{window.at.fail=false;window.at.hold=true;const button=document.querySelector('[data-retry]');button.dispatchEvent(new MouseEvent("click",{bubbles:true}));button.dispatchEvent(new MouseEvent("click",{bubbles:true}));window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("online"));});
    await settle(page);assert.equal(await page.evaluate(()=>window.at.calls.length),2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: a successful keyboard retry focuses the resulting collection",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width,fail:true}),{page}=f;
    try{
      await retry(f);await release(page);await f.ready();assert.equal(await page.getByRole("heading",{name:"Collection",exact:true}).evaluate(el=>el===document.activeElement),true);assert.equal(await page.getByRole("heading",{name:"Collection",exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=60&&r.bottom<=innerHeight-80;}),true,"result focus remains visible above mobile navigation");assert.equal(await root(page).getByRole("status").count(),0);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("atelier retry: another failure restores an enabled retry and useful focus",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    await retry(f);await release(page,true);await root(page).getByRole("alert").getByText("L’Atelier n’a pas répondu. Réessaie dans un instant.",{exact:true}).waitFor();
    assert.equal(await page.locator('[data-retry]').isDisabled(),false);assert.equal(await page.locator('[data-retry]').evaluate(el=>el===document.activeElement),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: completion keeps focus on an outside action",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    await retry(f);await page.evaluate(()=>{const b=document.createElement("button");b.id="at-outside";b.textContent="Autre action";document.body.append(b);b.focus();});
    await release(page);await f.ready();assert.equal(await page.locator('#at-outside').evaluate(el=>el===document.activeElement),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: a stalled read times out and cannot overwrite a later successful retry",{timeout:24000},async()=>{
  const f=await fixture({hold:true}),{page}=f;
  try{
    await f.calls(1);await page.getByText("Le serveur n’a pas répondu en 15 secondes. Réessaie dans un instant.",{exact:true}).waitFor({timeout:17500});
    await page.locator('[data-retry]').click();await f.calls(2);await release(page);await f.ready();
    await release(page,true);await settle(page);await f.ready();assert.equal(await page.locator('[data-retry]').count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: account transition releases the old read without blocking the new one",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    await retry(f);await page.evaluate(()=>{window.at.hold=false;window.atSwitch();});await f.calls(3);await f.ready("B");
    await release(page,true);await settle(page);await f.ready("B");assert.equal(await root(page).getByRole("status").count(),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: a new client and epoch can replace a pending same-owner read",async()=>{
  const f=await fixture({hold:true}),{page}=f;
  try{
    await f.calls(1);await page.evaluate(()=>{window.at.hold=false;window.titanAccountTransition.epoch++;window.titanClient=window.atClient();window.dispatchEvent(new Event("online"));});
    await f.calls(2);await f.ready();await release(page,true);await settle(page);await f.ready();assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: a missing RPC retains the read-only profile fallback",async()=>{
  const f=await fixture({missing:true}),{page}=f;
  try{
    await page.getByRole("heading",{name:"Merci de soutenir TITAN.",exact:true}).waitFor();assert.equal(await page.locator('[data-retry]').count(),0);assert.equal(await page.evaluate(()=>window.at.profileCalls),1);assert.equal(await root(page).getAttribute("aria-busy"),"false");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: guest discovery sends no catalogue request",async()=>{
  const f=await fixture({guest:true}),{page}=f;
  try{
    await page.getByRole("heading",{name:"Ton style se gagne à l’effort.",exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.at.calls.length),0);assert.equal(await root(page).getAttribute("aria-busy"),"false");assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: retry updates an existing live region rather than replacing it",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    const status=await root(page).getByRole("status").elementHandle();assert.ok(status);
    await retry(f);assert.equal(await status.evaluate(el=>el.isConnected&&el.textContent==="Chargement de l’Atelier…"),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: a retry reaching an older server focuses its fallback notice",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    await page.evaluate(()=>{window.at.fail=false;window.at.missing=true;});await page.locator('[data-retry]').focus();await page.keyboard.press("Enter");
    await page.getByRole("heading",{name:"Merci de soutenir TITAN.",exact:true}).waitFor();
    const text=page.getByText("L’Atelier est momentanément indisponible. Tes crédits sont intacts.",{exact:true});
    assert.equal(await text.locator('..').evaluate(el=>el===document.activeElement),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: cached catalogue controls remain usable during a background read",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await page.evaluate(()=>{window.at.hold=true;window.dispatchEvent(new Event("online"));});await f.calls(2);
    const acquired=page.getByRole("button",{name:"Acquis",exact:true});await acquired.click();assert.equal(await acquired.getAttribute("aria-pressed"),"true");assert.equal(await page.locator('.at-item').count(),1);
    await page.getByRole("tab",{name:"Cadres",exact:true}).focus();await page.keyboard.press("End");await page.keyboard.press("Enter");assert.equal(await page.getByRole("tab",{name:"Cartes",exact:true}).getAttribute("aria-selected"),"true");
    await release(page);await f.ready();assert.equal(await page.getByRole("tab",{name:"Cartes",exact:true}).evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>window.at.calls.length),2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("atelier retry: account cleanup passes cancellation to an abort-aware RPC builder",async()=>{
  const f=await fixture({fail:true}),{page}=f;
  try{
    await page.evaluate(()=>{
      const original=window.titanClient.rpc;window.at.aborted=false;
      window.titanClient.rpc=name=>{
        if(window.state.user.id!==window.at.A)return original(name);
        window.at.calls.push({name,owner:window.at.A});let reject;
        const promise=new Promise((_resolve,j)=>{reject=j;});
        const query={then:(resolve,failure)=>promise.then(resolve,failure),abortSignal:signal=>{signal.addEventListener("abort",()=>{window.at.aborted=true;reject(new Error("AbortError"));},{once:true});return query;}};
        return query;
      };
    });
    await retry(f);await page.evaluate(()=>{window.at.hold=false;window.atSwitch();});await f.calls(3);await f.ready("B");
    assert.equal(await page.evaluate(()=>window.at.aborted),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
