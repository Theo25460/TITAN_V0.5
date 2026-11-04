// Real Moment sheet and vendored Supabase SDK with synthetic auth/custom transport; no real account or write.
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
  assert.ok(ready, "local preview server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A = "00000000-0000-4000-8000-000000000801", B = "00000000-0000-4000-8000-000000000802";
async function fixture(width = 360) {
  const result = await newPage(width), { page } = result;
  page.setDefaultTimeout(2500);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(({A,B}) => {
    window.shareA=A;window.shareB=B;window.state.user.id=A;
    window.shareCalls=[];window.shareAuthCalls=0;window.shareMode="success";window.shareAuthMode="normal";window.shareAuthOwner=A;
    window.shareResponse = params => ({ id:"00000000-0000-4000-8000-000000000899",user_id:A,...params });
    window.shareSwitch = () => {
      window.titanAccountTransition={active:true,owner:B,epoch:window.titanAccountTransition.epoch+1};
      window.dispatchEvent(new Event("titan:account-changing"));window.state.user.id=B;
      window.titanAccountTransition.active=false;window.dispatchEvent(new Event("titan:account-changed"));
    };
    const client = window.supabase.createClient("https://fixture.invalid", "fixture-public-key", {
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{fetch:async (url,init) => {
        if(!String(url).includes("/rpc/titan_moment_share"))return new Response(JSON.stringify({code:"PGRST202"}),{status:404});
        const call={headers:Object.fromEntries(new Headers(init.headers)),params:JSON.parse(init.body)};window.shareCalls.push(call);
        if(window.shareMode==="network")throw new TypeError("Failed to fetch");
        if(window.shareMode==="hold")return new Promise(resolve=>{call.release=(data=window.shareResponse(call.params))=>resolve(new Response(JSON.stringify(data),{status:200}));});
        if(window.shareMode==="gateway")return new Response(JSON.stringify({code:"PGRST003",message:"Gateway timeout"}),{status:503});
        if(window.shareMode==="error")return new Response(JSON.stringify({code:"P0001",message:"SOCIAL_RATE_LIMIT"}),{status:400});
        return new Response(JSON.stringify(window.shareMode==="wrong-owner"?{...window.shareResponse(call.params),user_id:B}:window.shareResponse(call.params)),{status:200});
      }}
    });
    client.auth.getSession=async()=>{
      window.shareAuthCalls++;
      const receipt={data:{session:{user:{id:window.shareAuthOwner},access_token:"fixture-token-"+window.shareAuthOwner}}};
      if(window.shareAuthMode==="hold")return new Promise(resolve=>{window.releaseShareAuth=()=>resolve(receipt);});
      if(window.shareAuthMode==="sdk-switch" && window.shareAuthCalls>1)return {data:{session:{user:{id:B},access_token:"fixture-token-"+B}}};
      return receipt;
    };
    window.titanClient=client;
    window.shareOpen = () => {window.shareResult="pending";window.sharePromise=window.TitanShare.open({kind:"session",title:"Sortie privée A",detail:"30 min",sport:"running",logId:"00000000-0000-4000-8000-000000000898"});window.sharePromise.then(value=>window.shareResult=value);};
    window.shareOpen();
  },{A,B});
  await sheet(page).waitFor();
  return {...result,errors};
}
const sheet = page => page.getByRole("dialog",{name:"Partager un Moment",exact:true});
const form = page => sheet(page).locator("form");
const submit = page => sheet(page).getByRole("button",{name:"Partager",exact:true});
async function calls(page,count) {await page.waitForFunction(count=>window.shareCalls.length===count,count,{timeout:2500});}
async function settled(page) {await page.waitForFunction(()=>document.querySelector('dialog[open] form')?.getAttribute("aria-busy")==="false");}
async function success(page) {await page.waitForFunction(()=>window.shareResult===true);}
async function emptySuccess(page) {assert.equal(await page.getByText("Moment partagé",{exact:true}).count(),0);}
async function close(page) {const node=await sheet(page).elementHandle();await sheet(page).locator("[data-close]").click();await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();}

test("Moment share: successful explicit consent pins the owner token and sends only whitelisted fields",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      await submit(page).click();await success(page);
      const c=await page.evaluate(()=>window.shareCalls);
      assert.equal(c.length,1);assert.equal(c[0].headers.authorization,"Bearer fixture-token-"+A);
      assert.deepEqual(c[0].params,{p_kind:"session",p_title:"Sortie privée A",p_detail:"30 min",p_sport:"running",p_log_id:"00000000-0000-4000-8000-000000000898",p_visibility:"friends"});
      assert.equal(await page.getByText("Moment partagé",{exact:true}).count(),1);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("Moment share: repeated submissions send once and closure cannot imply cancellation while pending",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareMode="hold");await submit(page).click();await calls(page,1);
    await page.evaluate(()=>{const f=document.querySelector('dialog[open] form');for(let i=0;i<3;i++)f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
    assert.equal(await page.evaluate(()=>window.shareCalls.length),1);
    assert.equal(await form(page).getAttribute("aria-busy"),"true");
    assert.equal(await sheet(page).locator("input:enabled,button:enabled").count(),0);
    await page.keyboard.press("Escape");assert.equal(await sheet(page).count(),1);
    await sheet(page).dispatchEvent("click");assert.equal(await sheet(page).count(),1);
    assert.equal(await page.evaluate(()=>window.shareResult),"pending");
    await page.evaluate(()=>window.shareCalls[0].release());await success(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: an explicit server rejection preserves the draft for a manual retry",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareMode="error");await submit(page).click();await calls(page,1);await settled(page);
    assert.match(await sheet(page).getByRole("alert").innerText(),/demain/);
    assert.equal(await sheet(page).locator('[name="title"]').inputValue(),"Sortie privée A");assert.equal(await submit(page).isEnabled(),true);
    await page.evaluate(()=>window.shareMode="success");await submit(page).click();await success(page);
    assert.equal(await page.evaluate(()=>window.shareCalls.length),2);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: an account transition closes the old draft and retained submission cannot send it",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>{window.retainedShare=document.querySelector('dialog[open] form');window.shareSwitch();});
    await page.waitForFunction(()=>window.shareResult===false);
    await page.evaluate(()=>window.retainedShare.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(await page.evaluate(()=>window.shareCalls.length),0);assert.equal(await page.locator('dialog[open] input[name="title"]').count(),0);
    await emptySuccess(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: a transition during session lookup prevents the write",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareAuthMode="hold");await submit(page).click();
    await page.waitForFunction(()=>typeof window.releaseShareAuth==="function");
    await page.evaluate(()=>{window.shareSwitch();window.releaseShareAuth();});
    await page.waitForFunction(()=>window.shareResult===false);
    assert.equal(await page.evaluate(()=>window.shareCalls.length),0);await emptySuccess(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: a mismatched authenticated session cannot send the draft",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareAuthOwner=window.shareB);await submit(page).click();
    await page.waitForFunction(()=>window.shareResult===false);
    assert.equal(await page.evaluate(()=>window.shareCalls.length),0);await emptySuccess(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: an old successful response is ignored after an account transition",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareMode="hold");await submit(page).click();await calls(page,1);
    await page.evaluate(()=>{window.shareSwitch();window.shareCalls[0].release();});
    await page.waitForFunction(()=>window.shareResult===false);await emptySuccess(page);
    assert.equal(await page.evaluate(()=>window.shareCalls.length),1);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: the SDK's later session lookup cannot replace the pinned token",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareAuthMode="sdk-switch");await submit(page).click();await success(page);
    assert.ok(await page.evaluate(()=>window.shareAuthCalls>=2));
    assert.equal(await page.evaluate(()=>window.shareCalls[0].headers.authorization),"Bearer fixture-token-"+A);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: offline submission stays local and can retry after reconnect",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await context.setOffline(true);await submit(page).click();await settled(page);
    assert.equal(await page.evaluate(()=>window.shareCalls.length),0);assert.match(await sheet(page).getByRole("alert").innerText(),/Hors ligne/);
    await context.setOffline(false);await submit(page).click();await success(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: an auth lookup timeout allows retry without sending the old job later",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.clock.install();await page.evaluate(()=>window.shareAuthMode="hold");await submit(page).click();
    await page.waitForFunction(()=>typeof window.releaseShareAuth==="function");await page.clock.runFor(15100);await settled(page);
    assert.equal(await submit(page).isEnabled(),true);assert.equal(await page.evaluate(()=>window.shareCalls.length),0);
    await page.evaluate(()=>{window.shareAuthMode="normal";window.releaseShareAuth();});
    await submit(page).click();await success(page);assert.equal(await page.evaluate(()=>window.shareCalls.length),1);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: a lost write response is uncertain and cannot be retried blindly",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.clock.install();await page.evaluate(()=>window.shareMode="hold");await submit(page).click();await calls(page,1);
    await page.clock.runFor(15100);await settled(page);
    assert.equal(await submit(page).isDisabled(),true);assert.match(await sheet(page).getByRole("alert").innerText(),/confirm|Communauté/);
    assert.equal(await sheet(page).getByRole("link",{name:/Communauté/}).getAttribute("href"),"/social#moments");
    await page.evaluate(()=>{document.querySelector('dialog[open] form').dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));window.shareCalls[0].release();});
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30)));
    assert.equal(await page.evaluate(()=>window.shareCalls.length),1);await emptySuccess(page);await close(page);
    assert.equal(await page.evaluate(()=>window.shareResult),false);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: a transport failure after dispatch requires checking Moments",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareMode="network");await submit(page).click();await calls(page,1);await settled(page);
    assert.equal(await submit(page).isDisabled(),true);assert.equal(await sheet(page).getByRole("link",{name:/Communauté/}).count(),1);
    await emptySuccess(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: a response for another owner cannot confirm success",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareMode="wrong-owner");await submit(page).click();await calls(page,1);
    await page.waitForFunction(()=>window.shareResult===true||document.querySelector('dialog[open] form')?.getAttribute("aria-busy")==="false");
    await emptySuccess(page);assert.equal(await submit(page).isDisabled(),true);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: opening twice reuses the same draft and missing owner is unavailable",async()=>{
  const {page,context,errors}=await fixture();
  try{
    assert.equal(await page.evaluate(()=>window.TitanShare.open({title:"Second draft"})===window.sharePromise),true);
    assert.equal(await sheet(page).count(),1);await close(page);
    assert.equal(await page.evaluate(()=>{window.state.user.id=null;return window.TitanShare.available();}),false);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});


test("Moment share: a gateway failure with a code is still uncertain after dispatch",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>window.shareMode="gateway");await submit(page).click();await calls(page,1);await settled(page);
    assert.equal(await submit(page).isDisabled(),true);assert.equal(await sheet(page).getByRole("link",{name:/Communauté/}).count(),1);
    await emptySuccess(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("Moment share: silent owner, client, epoch or transition changes invalidate retained drafts",async()=>{
  for(const change of ["owner","client","epoch","transition"]){
    const {page,context,errors}=await fixture();
    try{
      await page.evaluate(change=>{
        window.replacementWrites=0;
        if(change==="owner")window.state.user.id=window.shareB;
        if(change==="client")window.titanClient={rpc:async()=>{window.replacementWrites++;return {data:{}};}};
        if(change==="epoch")window.titanAccountTransition.epoch++;
        if(change==="transition")window.titanAccountTransition.active=true;
      },change);
      await submit(page).click();await page.waitForFunction(()=>window.shareResult===false);
      assert.equal(await page.evaluate(()=>window.shareCalls.length+window.replacementWrites),0);await emptySuccess(page);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});
