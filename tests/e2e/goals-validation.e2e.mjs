// Real guest goal editor and localStorage writes; no authenticated account or external requests.
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

async function fixture(width = 360) {
  const result = await newPage(width), { page } = result;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00Z"));
  await page.goto(BASE + "/objectifs");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("[data-new]").click(); await page.locator(".ob-form").waitFor();
  return {...result,errors};
}
const form = page => page.locator("dialog[open] .ob-form");
const field = (page,name) => form(page).locator(`[name="${name}"]`);
const submit = page => form(page).locator('[type="submit"]');
async function stored(page) {return page.evaluate(()=>JSON.parse(localStorage.getItem(`titan_goals_v1:${window.state.user.id}`)||"[]"));}
async function invalid(page,name) {
  const input=field(page,name);
  assert.equal(await input.getAttribute("aria-invalid"),"true");
  const ids=(await input.getAttribute("aria-describedby")||"").split(/\s+/).filter(Boolean);
  assert.ok(ids.length);
  const alert=form(page).getByRole("alert");
  assert.equal(await alert.count(),1);assert.ok(ids.includes(await alert.getAttribute("id")));
  assert.equal(await input.evaluate(el=>document.activeElement===el),true);
}
async function cleared(page,name) {
  assert.equal(await field(page,name).getAttribute("aria-invalid"),null);
  assert.equal(await form(page).getByRole("alert").count(),0);
}
async function save(page) {
  const node=await page.locator("dialog[open]").elementHandle();
  await submit(page).click();await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();
}
async function dates(page,start="2026-10-17",end="2026-11-13") {
  await field(page,"start_date").fill(start);await field(page,"end_date").fill(end);
}

test("goal validation: whitespace name focuses its linked error and corrected creation persists at both widths",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      assert.equal(await form(page).getByRole("alert").count(),0);
      await field(page,"title").fill("   ");await submit(page).click();await invalid(page,"title");
      assert.deepEqual(await stored(page),[]);
      await field(page,"title").fill("Mon rythme");await cleared(page,"title");await save(page);
      const rows=await stored(page);assert.equal(rows.length,1);assert.equal(rows[0].title,"Mon rythme");assert.equal(rows[0].revision,1);
      await page.reload();await page.locator(`[data-edit="${rows[0].id}"]`).click();
      assert.equal(await field(page,"title").inputValue(),"Mon rythme");assert.equal(await field(page,"target").inputValue(),"12");
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("goal validation: invalid numeric targets focus the target and never write a goal",async()=>{
  const {page,context,errors}=await fixture();
  try{
    for(const value of ["","0","-1","1000001","bad"]){
      await field(page,"target").fill("");
      if(value==="bad"){await field(page,"target").focus();await page.keyboard.type("e");assert.equal(await field(page,"target").evaluate(el=>el.validity.badInput),true);}
      else await field(page,"target").fill(value);
      await submit(page).click();await invalid(page,"target");assert.deepEqual(await stored(page),[]);
      await field(page,"target").fill("12");await cleared(page,"target");
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal validation: integer errors clear when a different metric makes a fractional target usable",async()=>{
  const {page,context,errors}=await fixture();
  try{
    for(const metric of ["days","sessions"]){
      await form(page).locator(`[data-metric="${metric}"]`).click();await field(page,"target").fill("1.5");
      await submit(page).click();await invalid(page,"target");
      assert.match(await form(page).getByRole("alert").innerText(),/entiers/);
      await form(page).locator('[data-metric="distance"]').click();await cleared(page,"target");
    }
    await save(page);const rows=await stored(page);assert.equal(rows[0].metric,"distance");assert.equal(rows[0].target,1.5);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal validation: missing dates, inverted dates and excessive periods point to the relevant field",async()=>{
  const {page,context,errors}=await fixture();
  try{
    for(const [start,end,name] of [["","2026-11-13","start_date"],["2026-10-17","","end_date"],["2026-11-14","2026-11-13","end_date"],["2026-10-17","2028-10-18","end_date"]]){
      await dates(page,start,end);await submit(page).click();await invalid(page,name);assert.deepEqual(await stored(page),[]);
      await dates(page);await cleared(page,name);
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal validation: changing the other date or choosing a period clears the related date error",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await dates(page,"2026-11-14","2026-11-13");await submit(page).click();await invalid(page,"end_date");
    await field(page,"start_date").fill("2026-10-17");await cleared(page,"end_date");
    await field(page,"end_date").fill("");await submit(page).click();await invalid(page,"end_date");
    await form(page).locator('[data-period="7"]').click();await cleared(page,"end_date");
    assert.equal(await field(page,"end_date").inputValue(),"2026-10-23");await save(page);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal validation: correction preserves an existing field description",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await field(page,"target").evaluate(el=>{const hint=document.createElement("p");hint.id="goal-target-hint";hint.textContent="Repère de test";el.closest("form").append(hint);el.setAttribute("aria-describedby",hint.id);});
    await field(page,"target").fill("0");await submit(page).click();await invalid(page,"target");
    assert.ok((await field(page,"target").getAttribute("aria-describedby")).split(" ").includes("goal-target-hint"));
    await field(page,"target").fill("12");await cleared(page,"target");
    assert.equal(await field(page,"target").getAttribute("aria-describedby"),"goal-target-hint");assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal validation: a local save error is still visible and can retry with its draft",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.evaluate(()=>{window.goalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("titan_goals_v1:"))throw Error("Synthetic goals quota");return window.goalSetItem.call(this,key,value);};});
    await field(page,"title").fill("Conserver ce brouillon");await submit(page).click();
    assert.match(await form(page).getByRole("alert").innerText(),/Synthetic goals quota/);
    assert.equal(await field(page,"title").inputValue(),"Conserver ce brouillon");assert.equal(await submit(page).isEnabled(),true);assert.deepEqual(await stored(page),[]);
    await page.evaluate(()=>Storage.prototype.setItem=window.goalSetItem);await save(page);
    assert.equal((await stored(page))[0].title,"Conserver ce brouillon");assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal validation: an invalid adjustment cannot overwrite the saved goal and corrected edit keeps one row",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      await field(page,"title").fill("Objectif initial");await save(page);const first=(await stored(page))[0];
      await page.locator(`[data-edit="${first.id}"]`).click();await field(page,"title").fill("");await submit(page).click();await invalid(page,"title");
      assert.equal((await stored(page))[0].title,"Objectif initial");assert.equal((await stored(page))[0].revision,1);
      await field(page,"title").fill("Objectif ajusté");await field(page,"target").fill("15");await save(page);
      const rows=await stored(page);assert.equal(rows.length,1);assert.equal(rows[0].id,first.id);assert.equal(rows[0].revision,2);assert.equal(rows[0].target,15);
      await page.reload();await page.locator(`[data-edit="${first.id}"]`).click();assert.equal(await field(page,"title").inputValue(),"Objectif ajusté");assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("goal validation: cancelling invalid input leaves a clean new editor",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await field(page,"title").fill("");await submit(page).click();await invalid(page,"title");
    const node=await page.locator("dialog[open]").elementHandle();await form(page).locator("[data-cancel]").click();await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();
    await page.locator("[data-new]").click();assert.equal(await form(page).getByRole("alert").count(),0);
    assert.equal(await field(page,"title").getAttribute("aria-invalid"),null);assert.deepEqual(await stored(page),[]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
