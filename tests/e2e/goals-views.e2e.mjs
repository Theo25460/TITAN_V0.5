// Real guest goals and archive/restore UI, keyboard and local persistence; no external requests.
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

async function fixture(width=360,empty=false){
  const result=await newPage(width),{page}=result;
  page.setDefaultTimeout(2500);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00Z"));
  await page.goto(BASE+"/objectifs");
  await page.waitForFunction(()=>window.TitanAdventure?.status==="ready"&&window.TitanAdventure.snapshot?.owner===window.state.user.id);
  await page.locator("[data-new]").waitFor();
  await page.evaluate(empty=>{
    const base={user_id:window.state.user.id,metric:"days",target:12,sport:null,start_date:"2026-10-18",end_date:"2026-11-14",revision:1,created_at:"2026-10-18T10:00:00Z"};
    const rows=empty?[]:[{...base,id:"goal-current",title:"Objectif courant"},{...base,id:"goal-finished",title:"Repère terminé",start_date:"2026-09-01",end_date:"2026-09-28"},{...base,id:"goal-archived",title:"Objectif archivé",archived_at:"2026-10-10T10:00:00Z"}];
    localStorage.setItem(`titan_goals_v1:${window.state.user.id}`,JSON.stringify(rows));
  },empty);
  await page.reload();await page.locator("[data-new]").waitFor();return {...result,errors};
}
const views=page=>page.getByRole("group",{name:"Vue des objectifs",exact:true});
const current=page=>views(page).getByRole("button",{name:"Mes objectifs",exact:true});
const archives=page=>views(page).getByRole("button",{name:/^Archives/});
const results=page=>page.locator("#ob-results");
async function focused(locator){assert.equal(await locator.evaluate(el=>document.activeElement===el),true,"Focus returns to the logical control or goal");}
async function rows(page){return page.evaluate(()=>JSON.parse(localStorage.getItem(`titan_goals_v1:${window.state.user.id}`)||"[]"));}
async function switchView(page,archived=true){const b=archived?archives(page):current(page);await b.focus();await page.keyboard.press("Enter");await focused(b);}
async function save(page){const d=page.locator('dialog[open]'),node=await d.elementHandle();await d.locator('[type="submit"]').click();await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();}
async function confirm(page,label){const d=page.getByRole("dialog"),node=await d.elementHandle();await d.getByRole("button",{name:label,exact:true}).click();await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();}

test("goal views: two clear controls precede results and expose the selected view at both widths",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      assert.equal(await current(page).getAttribute("aria-pressed"),"true");assert.equal(await archives(page).getAttribute("aria-pressed"),"false");
      assert.equal(await current(page).getAttribute("aria-controls"),"ob-results");assert.equal(await archives(page).getAttribute("aria-controls"),"ob-results");
      assert.equal(await archives(page).innerText(),"Archives (1)");
      assert.ok((await views(page).boundingBox()).y<(await results(page).boundingBox()).y);
      assert.equal(await results(page).getByRole("heading",{name:"Objectif courant",exact:true}).count(),1);
      assert.equal(await results(page).getByRole("heading",{name:"Repère terminé",exact:true}).count(),1);
      assert.equal(await results(page).getByRole("heading",{name:"Objectif archivé",exact:true}).count(),0);
      await page.evaluate(async()=>{await document.fonts.ready;});
      await page.screenshot({path:`/tmp/titan83-goals-${width}.png`,fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
      await archives(page).click();await page.screenshot({path:`/tmp/titan83-goals-${width}-archives.png`,fullPage:true});
    }finally{await context.close();}
  }
});

test("goal views: keyboard view changes preserve focus, counters and separation of archives",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      const before=await rows(page);await switchView(page);
      assert.equal(await archives(page).getAttribute("aria-pressed"),"true");assert.equal(await current(page).getAttribute("aria-pressed"),"false");
      assert.equal(await results(page).getByRole("heading",{name:"Objectif archivé",exact:true}).count(),1);assert.equal(await results(page).getByRole("heading",{name:"Objectif courant",exact:true}).count(),0);
      await page.keyboard.press("Shift+Tab");await focused(current(page));await page.keyboard.press("Enter");await focused(current(page));
      assert.equal(await current(page).getAttribute("aria-pressed"),"true");assert.deepEqual(await rows(page),before);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("goal views: a goal created from Archives becomes visible and focused in the current list",async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await fixture(width);
    try{
      if(await views(page).count())await switchView(page);else await page.locator("[data-toggle-archived]").click();
      await page.locator("[data-new]").click();await page.locator('.ob-form [name="title"]').fill("Créé depuis les archives");await save(page);
      assert.equal(await page.locator("#objectifs").getByRole("heading",{name:"Créé depuis les archives",exact:true}).count(),1,"The saved goal must be visible without another view change");
      assert.equal(await current(page).getAttribute("aria-pressed"),"true");
      const heading=results(page).getByRole("heading",{name:"Créé depuis les archives",exact:true});await heading.waitFor();await focused(heading);
      assert.equal((await rows(page)).length,4);assert.equal(await archives(page).innerText(),"Archives (1)");
      await page.reload();await results(page).getByRole("heading",{name:"Créé depuis les archives",exact:true}).waitFor();assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test("goal views: archive and restore retain a usable selected view and update counts",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await page.locator('[data-archive="goal-current"]').click();await confirm(page,"Archiver");
    await focused(current(page));assert.equal(await archives(page).innerText(),"Archives (2)");
    await switchView(page);await page.locator('[data-archive="goal-current"]').click();await confirm(page,"Restaurer");
    await focused(archives(page));assert.equal(await archives(page).innerText(),"Archives (1)");
    assert.equal(await results(page).getByRole("heading",{name:"Objectif courant",exact:true}).count(),0);
    await switchView(page,false);assert.equal(await results(page).getByRole("heading",{name:"Objectif courant",exact:true}).count(),1);
    assert.equal((await rows(page)).find(r=>r.id==="goal-current").revision,3);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal views: adjusting an archived goal stays in Archives and focuses the saved result",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await switchView(page);await page.locator('[data-edit="goal-archived"]').click();await page.locator('.ob-form [name="title"]').fill("Archive ajustée");await save(page);
    assert.equal(await archives(page).getAttribute("aria-pressed"),"true");
    const heading=results(page).getByRole("heading",{name:"Archive ajustée",exact:true});await focused(heading);
    assert.ok((await rows(page)).find(r=>r.id==="goal-archived").archived_at);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal views: cancelling creation keeps the archive view and its existing rows",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await switchView(page);const before=await rows(page);await page.locator("[data-new]").click();
    const d=page.locator('dialog[open]'),node=await d.elementHandle();await d.locator('[data-cancel]').click();await page.waitForFunction(el=>!el.isConnected,node);await node.dispose();
    assert.equal(await archives(page).getAttribute("aria-pressed"),"true");await focused(page.locator("[data-new]"));assert.deepEqual(await rows(page),before);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal views: empty archives keep both views and creation available",async()=>{
  const {page,context,errors}=await fixture(360,true);
  try{
    assert.equal(await archives(page).innerText(),"Archives (0)");await switchView(page);
    assert.equal(await results(page).getByText("Aucun objectif archivé.",{exact:true}).count(),1);assert.equal(await page.locator("[data-new]").isEnabled(),true);
    await switchView(page,false);assert.equal(await results(page).getByRole("heading",{name:"Pour commencer",exact:true}).count(),1);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test("goal views: refresh preserves the active view control without stealing dialog or outside focus",async()=>{
  const {page,context,errors}=await fixture();
  try{
    async function refresh(){const old=await views(page).elementHandle();await page.evaluate(()=>window.dispatchEvent(new Event("titan:history-updated")));await page.waitForFunction(el=>!el.isConnected,old);await old.dispose();}
    await switchView(page);await refresh();await focused(archives(page));assert.equal(await archives(page).getAttribute("aria-pressed"),"true");
    const outside=page.locator('[data-subnav] a').first();await outside.focus();await refresh();await focused(outside);
    await page.locator("[data-new]").click();const input=page.locator('.ob-form [name="title"]');await input.focus();await refresh();await focused(input);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});


test("goal views: failed creation keeps Archives and its draft, successful retry reveals the new goal",async()=>{
  const {page,context,errors}=await fixture();
  try{
    await switchView(page);await page.locator("[data-new]").click();await page.locator('.ob-form [name="title"]').fill("Reprise depuis Archives");
    await page.evaluate(()=>{window.goalViewSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("titan_goals_v1:"))throw Error("Synthetic goal storage failure");return window.goalViewSetItem.call(this,key,value);};});
    await page.locator('.ob-form [type="submit"]').click();
    assert.match(await page.locator('.ob-form').getByRole("alert").innerText(),/Synthetic goal storage failure/);
    assert.equal(await page.locator('[data-goals-view="archived"]').getAttribute("aria-pressed"),"true");assert.equal((await rows(page)).length,3);
    assert.equal(await page.locator('.ob-form [name="title"]').inputValue(),"Reprise depuis Archives");
    await page.evaluate(()=>Storage.prototype.setItem=window.goalViewSetItem);await save(page);
    assert.equal(await current(page).getAttribute("aria-pressed"),"true");await focused(results(page).getByRole("heading",{name:"Reprise depuis Archives",exact:true}));assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
