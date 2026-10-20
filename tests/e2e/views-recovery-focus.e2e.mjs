// Real saved-view UI with synthetic server receipts; no real account or backend mutation.
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
  assert.ok(ready, "local saved-views server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A="00000000-0000-4000-8000-000000000881",B="00000000-0000-4000-8000-000000000882",ID="00000000-0000-4000-8000-000000000883";
async function fixture({width=360,count=2}={}){
  const result=await newPage(width),{page}=result;page.setDefaultTimeout(2500);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/js/app/vues.js?*",r=>r.fulfill({contentType:"text/javascript",body:""}));await page.goto(BASE+"/stats");await page.waitForFunction(()=>window.TitanAdventure?.status==="ready");
  await page.evaluate(({A,B,ID,count})=>{
    window.state.user.id=A;const stamp="2026-10-15T12:00:00Z";
    const rows=label=>Array.from({length:count},(_,i)=>({id:i?"00000000-0000-4000-8000-000000000884":ID,name:`Vue ${label}${i+1}`,kind:"report",options:{period:"year",offset:1},revision:1,created_at:stamp,updated_at:stamp}));
    window.vv={A,B,ID,rows:{[A]:rows("A"),[B]:rows("B")},calls:[],hold:false,releases:[],error:null,listError:false,failAfterAck:false};
    window.vvClient=()=>({rpc:async(name,p)=>{
      const owner=window.state.user.id;window.vv.calls.push({name,p:structuredClone(p),owner});
      if(name==="titan_analysis_views"){
        if(window.vv.listError)return {error:{message:"NETWORK"}};
        const data=structuredClone(window.vv.rows[owner]);return {data:{version:1,owner,available:true,limit:10,count:data.length,views:p?.p_id?data.filter(v=>v.id===p.p_id):data}};
      }
      if(name!=="titan_mutate_analysis_view")throw Error("Unexpected fixture RPC: "+name);
      const answer=()=>{
        if(window.vv.error)return {error:{message:window.vv.error}};
        if(p.p_action==="delete"){window.vv.rows[owner]=window.vv.rows[owner].filter(v=>v.id!==p.p_id);return {data:{version:1,owner,action:"delete",deleted_id:p.p_id}};}
        const old=window.vv.rows[owner].find(v=>v.id===p.p_id);
        const view={id:p.p_id,name:p.p_name,kind:p.p_kind,options:p.p_options,revision:p.p_expected_revision+1,created_at:old?.created_at||stamp,updated_at:"2026-10-18T12:00:00Z"};
        window.vv.rows[owner]=[view,...window.vv.rows[owner].filter(v=>v.id!==view.id)];if(window.vv.failAfterAck)window.vv.listError=true;
        return {data:{version:1,owner,action:"save",view}};
      };
      if(window.vv.hold)return new Promise(resolve=>window.vv.releases.push(()=>resolve(answer())));return answer();
    }});
    window.titanClient=window.vvClient();
    window.vvSwitch=()=>{window.titanAccountTransition={active:true,epoch:window.titanAccountTransition.epoch+1};window.dispatchEvent(new Event("titan:account-changing"));window.state.user.id=B;window.titanClient=window.vvClient();window.titanAccountTransition.active=false;window.dispatchEvent(new Event("titan:account-changed"));};
  },{A,B,ID,count});
  await page.addScriptTag({path:ROOT+"/js/app/vues.js"});await page.locator('#views-panel > summary').click();await page.locator('[data-view]').first().waitFor();
  return {...result,errors,close:async()=>{await page.evaluate(()=>window.vv.releases.splice(0).forEach(r=>r())).catch(()=>{});await result.context.close();}};
}
const mutations=page=>page.evaluate(()=>window.vv.calls.filter(c=>c.name==="titan_mutate_analysis_view"));
async function edit(f,name="Nom modifié"){await f.page.locator('[data-view-action="edit"]').first().click();await f.page.locator('#views-name').fill(name);}
async function pending(f){await f.page.evaluate(()=>window.vv.hold=true);await f.page.locator('#views-submit').click();await f.page.waitForFunction(()=>window.vv.releases.length===1);}
async function release(page){await page.evaluate(()=>window.vv.releases.shift()());}
async function focused(locator){assert.equal(await locator.evaluate(el=>el===document.activeElement),true);}
async function settled(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}

test("views recovery: live progress remains outside the busy form and list",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width}),{page}=f;
    try{
      await edit(f);await pending(f);assert.equal(await page.locator('#views-status').textContent(),"Enregistrement…");assert.equal(await page.locator('#views-status').evaluate(el=>!!el.closest('[aria-busy="true"]')),false);
      assert.equal(await page.locator('#views-draft-form').getAttribute("aria-busy"),"true");assert.equal(await page.locator('#views-name').isDisabled(),true);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("views recovery: confirmed rename focuses its resulting title and preserves the request contract",async()=>{
  for(const width of [360,1280]){
    const f=await fixture({width}),{page}=f;
    try{
      await edit(f);await page.locator('#views-submit').focus();await page.keyboard.press("Enter");const title=page.getByRole("heading",{name:"Nom modifié",exact:true});await title.waitFor();await focused(title);
      const calls=await mutations(page);assert.equal(calls.length,1);assert.deepEqual(calls[0].p,{p_action:"save",p_id:ID,p_expected_revision:1,p_name:"Nom modifié",p_kind:"report",p_options:{period:"year",offset:1}});assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});

test("views recovery: creating from analysis parameters retains name focus after list refresh",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("titan:analysis-view-save",{detail:{owner:window.vv.A,epoch:window.titanAccountTransition.epoch,kind:"report",options:{period:"month",offset:0}}})));
    await page.waitForFunction(()=>!document.querySelector('#views-name').disabled);await focused(page.locator('#views-name'));
    await page.locator('#views-name').fill("Nouvelle vue");await page.locator('#views-submit').click();const title=page.getByRole("heading",{name:"Nouvelle vue",exact:true});await title.waitFor();await focused(title);assert.equal((await mutations(page))[0].p.p_expected_revision,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: deleting a view focuses the next remaining title",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await page.locator('[data-view-action="delete"]').first().click();await page.locator('#views-confirm-delete').click();await page.getByText("Vue supprimée.",{exact:true}).waitFor();await focused(page.getByRole("heading",{name:"Vue A2",exact:true}));assert.equal((await mutations(page)).length,1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: deleting the final view focuses the available refresh control",async()=>{
  const f=await fixture({count:1}),{page}=f;
  try{
    await page.locator('[data-view-action="delete"]').click();await page.locator('#views-confirm-delete').click();await page.getByText("Vue supprimée.",{exact:true}).waitFor();await focused(page.locator('#views-retry'));assert.equal(await page.locator('#views-retry').isDisabled(),false);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: uncertain save keeps the draft and focuses refresh before an explicit retry",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f,"Brouillon conservé");await page.evaluate(()=>window.vv.error="NETWORK");await page.locator('#views-submit').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes("vérifie la liste"));await focused(page.locator('#views-retry'));
    assert.equal(await page.locator('#views-name').inputValue(),"Brouillon conservé");assert.equal((await mutations(page)).length,1);
    await page.locator('#views-retry').click();await page.waitForFunction(()=>!document.querySelector('#views-name').disabled);await focused(page.locator('#views-name'));assert.equal((await mutations(page)).length,1);
    await page.evaluate(()=>window.vv.error=null);await page.locator('#views-submit').click();await page.getByRole("heading",{name:"Brouillon conservé",exact:true}).waitFor();assert.equal((await mutations(page)).length,2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: an acknowledged save followed by failed list refresh never asks to resend",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f,"Déjà enregistrée");await page.evaluate(()=>window.vv.failAfterAck=true);await page.locator('#views-submit').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes("mais la liste"));await focused(page.locator('#views-retry'));
    assert.equal(await page.locator('#views-draft-form').isHidden(),true);assert.equal((await mutations(page)).length,1);
    await page.evaluate(()=>window.vv.listError=false);await page.locator('#views-retry').click();const title=page.getByRole("heading",{name:"Déjà enregistrée",exact:true});await title.waitFor();await focused(title);assert.equal((await mutations(page)).length,1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: server name conflict is linked to the editable field and clears on correction",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f,"Doublon");await page.evaluate(()=>window.vv.error="VIEW_NAME_TAKEN");await page.locator('#views-submit').click();await page.waitForFunction(()=>!document.querySelector('#views-name').disabled);
    assert.equal(await page.locator('#views-name').getAttribute("aria-invalid"),"true");assert.match(await page.locator('#views-name').getAttribute("aria-describedby"),/views-draft-summary.*views-name-error/);await focused(page.locator('#views-name'));assert.equal(await page.locator('#views-name-error').textContent(),"Ce nom existe déjà dans tes vues. Choisis un autre nom.");
    await page.locator('#views-name').fill("Nom disponible");assert.equal(await page.locator('#views-name').getAttribute("aria-invalid"),null);await page.evaluate(()=>window.vv.error=null);await page.locator('#views-submit').click();await page.getByRole("heading",{name:"Nom disponible",exact:true}).waitFor();assert.equal((await mutations(page)).length,2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

for(const failure of [false,true]){
  test(`views recovery: ${failure?"failure":"success"} leaves an outside action focused`,async()=>{
    const f=await fixture(),{page}=f;
    try{
      await edit(f);await pending(f);await page.evaluate(failure=>{if(failure)window.vv.error="NETWORK";const b=document.createElement("button");b.id="vv-outside";b.textContent="Autre action";document.body.append(b);b.focus();},failure);
      await release(page);await page.waitForFunction(()=>!document.querySelector('#views-retry').disabled);await focused(page.locator('#vv-outside'));assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  });
}

test("views recovery: a newer dialog keeps its focus after background completion",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f);await pending(f);await page.evaluate(()=>{const d=window.titanShell.sheet({title:"Aide générale",body:'<button id="vv-help">Continuer</button>'});d.querySelector('#vv-help').focus();});await release(page);await page.waitForFunction(()=>!document.querySelector('#views-retry').disabled);await focused(page.locator('#vv-help'));assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: old account completion cannot restore its draft or focus over the new account",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f,"Brouillon A");await pending(f);await page.evaluate(()=>window.vvSwitch());await page.getByRole("heading",{name:"Vue B1",exact:true}).waitFor();
    await page.evaluate(()=>{const b=document.createElement("button");b.id="vv-new-focus";b.textContent="Compte B";document.body.append(b);b.focus();});await release(page);await settled(page);await focused(page.locator('#vv-new-focus'));assert.equal(await page.getByRole("heading",{name:"Brouillon A",exact:true}).count(),0);assert.equal(await page.locator('#views-draft-form').isHidden(),true);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: a server name error is marked without taking focus from another action",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f,"Doublon");await pending(f);await page.evaluate(()=>{window.vv.error="VIEW_NAME_TAKEN";const b=document.createElement("button");b.id="vv-outside-name";b.textContent="Autre action";document.body.append(b);b.focus();});await release(page);await page.waitForFunction(()=>!document.querySelector('#views-name').disabled);
    assert.equal(await page.locator('#views-name').getAttribute("aria-invalid"),"true");await focused(page.locator('#vv-outside-name'));assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: refreshing a conflict focuses the fresh row without silently rebasing its draft",async()=>{
  const f=await fixture(),{page}=f;
  try{
    await edit(f,"Mon brouillon");await page.evaluate(()=>{window.vv.error="VIEW_VERSION_CONFLICT";Object.assign(window.vv.rows[window.vv.A][0],{revision:2,name:"Autre appareil",updated_at:"2026-10-18T11:00:00Z"});});await page.locator('#views-submit').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes("autre appareil"));await focused(page.locator('#views-retry'));
    await page.locator('#views-retry').click();const title=page.getByRole("heading",{name:"Autre appareil",exact:true});await title.waitFor();await focused(title);assert.equal(await page.locator('#views-name').inputValue(),"Mon brouillon");assert.equal((await mutations(page)).length,1);
    await page.locator('[data-view-action="edit"]').first().click();await page.locator('#views-name').fill("Nom repris");await page.evaluate(()=>window.vv.error=null);await page.locator('#views-submit').click();await page.getByRole("heading",{name:"Nom repris",exact:true}).waitFor();assert.equal((await mutations(page))[1].p.p_expected_revision,2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test("views recovery: background refresh preserves the corresponding current row heading or action",async()=>{
  for(const kind of ["heading","action"]){
    const f=await fixture(),{page}=f;
    try{
      const row=page.locator('[data-view]').nth(1),id=await row.getAttribute('data-view');const target=kind==="heading"?row.locator('h3'):row.locator('[data-view-action="edit"]');
      await target.evaluate(el=>{if(el.tagName==="H3")el.tabIndex=-1;el.focus();});const old=await target.elementHandle();
      await page.evaluate(()=>window.dispatchEvent(new Event("titan:adventure-updated")));await page.waitForFunction(el=>!el.isConnected,old);await old.dispose();await page.waitForFunction(()=>!document.querySelector('#views-retry').disabled);
      const fresh=page.locator(`[data-view="${id}"]`);await focused(kind==="heading"?fresh.locator('h3'):fresh.locator('[data-view-action="edit"]'));assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});
