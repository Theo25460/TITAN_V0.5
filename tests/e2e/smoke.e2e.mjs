// TITAN 300 — end-to-end smoke tests on the built site (dist/), in Chromium, network to third parties cut.
// Run: pnpm run test:e2e   (builds dist, serves it on a free port, drives a real browser)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;
let server;
let browser;
let BASE;

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function newPage(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: width > 900 ? 900 : 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, context, errors };
}

async function reportPage(width = 360, access = "plus", many = false) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/rapports.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  assert.equal(await page.locator("#bilans").count(), 1, "secondary report surface exists");
  // Finish the real guest adventure boot before replacing the authenticated report gateway.
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(({ access, many }) => {
    if (access !== "guest") window.state.user.id = "00000000-0000-4000-8000-000000000123";
    window.state.user.is_elite = true;
    window.reportAccess = access; window.reportMany = many; window.reportFactor = 1; window.reportCalls = [];
    window.makeReport = p => {
      const owner = window.state.user.id;
      if (window.reportAccess === "free") return { version: 1, owner, available: false, reason: "premium_required" };
      const annual = p.p_period === "year", previous = p.p_offset === 1;
      const from = annual ? (previous ? "2023-01-01" : "2024-01-01") : (previous ? "2024-02-01" : "2024-03-01");
      const to = annual ? (previous ? "2024-01-01" : "2025-01-01") : (previous ? "2024-03-01" : "2024-04-01");
      const shift = n => { const d = new Date(from + "T12:00:00Z"); annual ? d.setUTCMonth(d.getUTCMonth() + n) : d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
      const size = annual ? (previous ? 12 : 3) : (previous ? 29 : 15), f = window.reportFactor;
      const sports = window.reportMany ? Array.from({ length: 200 }, (_, i) => ({ sport: "sport_" + i, sessions: 1, active_days: 1, minutes: f, estimated_sessions: 0 }))
        : [{ sport: "running", sessions: 1, active_days: 1, minutes: 30 * f, estimated_sessions: 1 }, { sport: "yoga", sessions: 1, active_days: 1, minutes: 20 * f, estimated_sessions: 0 }];
      const sessions = window.reportMany ? 200 : 2, minutes = window.reportMany ? 200 * f : 50 * f, estimated_sessions = window.reportMany ? 0 : 1;
      const sources = window.reportMany ? Array.from({ length: 5 }, (_, i) => ({ id: "00000000-0000-4000-8000-" + String(999 - i).padStart(12, "0"), sport: "sport_" + i, date: from + "T12:00:00Z", minutes: f, estimated: false }))
        : [{ id: "00000000-0000-4000-8000-000000000999", sport: "yoga", date: from + "T13:00:00Z", minutes: 20 * f, estimated: false }, { id: "00000000-0000-4000-8000-000000000998", sport: "running", date: from + "T12:00:00Z", minutes: 30 * f, estimated: true }];
      return { version: 1, owner, available: true, period: p.p_period, offset: p.p_offset, timezone: p.p_timezone, as_of: "2024-03-15T12:00:00Z", from, to, current: !previous,
        sessions, active_days: 1, minutes, estimated_sessions, sports, sources,
        series: Array.from({ length: size }, (_, i) => ({ from: shift(i), to: shift(i + 1), sessions: i === 0 ? sessions : 0, active_days: i === 0 ? 1 : 0, minutes: i === 0 ? minutes : 0, estimated_sessions: i === 0 ? estimated_sessions : 0 })) };
    };
    window.titanClient = { rpc: async (name, params) => {
      if (name !== "titan_practice_report") throw Error("unexpected report RPC");
      window.reportCalls.push(params);
      if (window.reportAccess === "missing") return { error: { code: "PGRST202" } };
      if (window.reportAccess === "error") return { error: { message: "Network failed" } };
      return { data: window.makeReport(params) };
    } };
  }, { access, many });
  await page.addScriptTag({ path: ROOT + "/js/app/rapports.js" });
  await page.waitForSelector("#report-panel > summary");
  return fixture;
}

async function viewsPage(width=360, type='report', seeded=false) {
  const fixture=await (type==='comparison'?comparisonPage(width):reportPage(width));
  const {page}=fixture;
  assert.equal(await page.locator('#vues').count(),1,'secondary saved views surface exists');
  await page.evaluate(seeded=>{
    const owner=window.state.user.id;
    const stamp='2026-10-09T20:00:00+00:00';
    window.viewRows=seeded?[{id:'00000000-0000-4000-8000-000000000333',name:'Mon année',kind:'report',options:{period:'year',offset:1},revision:1,created_at:stamp,updated_at:stamp}]:[];
    window.viewsAccess='plus';window.viewsCalls=[];
    window.makeViewList=p=>({version:1,owner:window.state.user.id,available:window.viewsAccess==='plus',...(window.viewsAccess==='plus'?{}:{reason:'premium_required'}),limit:10,count:window.viewRows.length,
      views:window.viewRows.filter(v=>!p?.p_id||p.p_id===v.id).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||(a.id<b.id?-1:1))});
    const analysis=window.titanClient.rpc;
    window.viewGateway=async(name,p)=>{
      if(name==='titan_analysis_views')return {data:window.makeViewList(p)};
      if(name==='titan_mutate_analysis_view'){
        if(window.viewsAccess==='free'&&p.p_action==='save')return {error:{message:'PREMIUM_REQUIRED'}};
        const old=window.viewRows.find(v=>v.id===p.p_id);
        if(p.p_action==='delete'){window.viewRows=window.viewRows.filter(v=>v.id!==p.p_id);return {data:{version:1,owner:window.state.user.id,action:'delete',deleted_id:p.p_id}};}
        if(old&&p.p_expected_revision===0&&old.revision===1)return {data:{version:1,owner:window.state.user.id,action:'save',view:{...old}}};
        if(old&&old.revision!==p.p_expected_revision)return {error:{message:'VIEW_VERSION_CONFLICT'}};
        if(!old&&window.viewRows.length===10)return {error:{message:'VIEW_LIMIT'}};
        const view={id:p.p_id,name:p.p_name,kind:p.p_kind,options:structuredClone(p.p_options),revision:(old?.revision||0)+1,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
        window.viewRows=window.viewRows.filter(v=>v.id!==p.p_id).concat(view);
        return {data:{version:1,owner:window.state.user.id,action:'save',view}};
      }
      return analysis(name,p);
    };
    window.titanClient.rpc=(name,p)=>{window.viewsCalls.push({name,p});return window.viewGateway(name,p);};
  },seeded);
  return fixture;
}

async function recordAnalysisAnalytics(page,granted=true){
  await page.evaluate(granted=>{
    window.TitanAnalytics.setConsent(granted);window.analyticsWrites=[];
    window.titanClient.auth={getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:"fixture-token"}}})};
    const nativeFetch=window.fetch;
    window.fetch=(input,init)=>{
      if(new URL(input).pathname!=="/rest/v1/analytics_events")return nativeFetch(input,init);
      window.analyticsWrites.push(JSON.parse(init.body));return Promise.resolve(new Response(null,{status:201}));
    };
    history.replaceState(null,'','/stats?utm_source=private%20text');
  },granted);
}
test('analysis analytics: standalone signup uses its receipt owner and separate account keys',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await newPage(width);await page.goto(BASE+'/login?mode=signup',{waitUntil:'load'});
    await page.evaluate(()=>{
      if(window.state||window.titanAccountTransition)throw Error('login must be tested without application state');
      const client=window.initTitanSupabaseClient();window.signupOwner='00000000-0000-4000-8000-000000000123';window.signupSession='00000000-0000-4000-8000-000000000456';
      window.analyticsWrites=[];const nativeFetch=window.fetch;
      window.fetch=(input,init)=>{if(new URL(input).pathname!=='/rest/v1/analytics_events')return nativeFetch(input,init);window.analyticsWrites.push(JSON.parse(init.body));return Promise.resolve(new Response(null,{status:201}));};
      client.auth.signUp=async()=>({data:{user:{id:window.signupOwner},session:null},error:null});
      client.auth.getSession=async()=>({data:{session:{user:{id:window.signupSession},access_token:'fixture-token'}}});
      const track=window.TitanAnalytics.track;window.TitanAnalytics.track=(...args)=>(window.lastAnalyticsResult=track(...args));
    });
    const submit=async()=>{
      await page.locator('[name=name]').fill('Agent');await page.locator('[name=email]').fill('agent@example.test');await page.locator('[name=password]').fill('fixture-password');
      await page.locator('[name=terms]').check();await page.locator('[name=analytics]').check();await page.locator('.auth-submit').click();
      await page.waitForSelector('.auth-sent');return page.evaluate(()=>window.lastAnalyticsResult);
    };
    assert.equal(await submit(),false,'a foreign session cannot receive the signup event');
    const repeat=async(owner)=>{
      await page.locator('.auth-sent [data-mode=signin]').click();await page.locator('[data-mode=signup]').click();
      await page.evaluate(owner=>{window.signupOwner=owner;window.signupSession=owner;},owner);return submit();
    };
    const a='00000000-0000-4000-8000-000000000123',b='00000000-0000-4000-8000-000000000456';
    assert.equal(await repeat(a),true);assert.equal(await repeat(b),true);assert.equal(await repeat(b),false);
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.user_id)),[a,b]);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: report use counts intentional previews and CSV, not background refresh',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await reportPage(width);await recordAnalysisAnalytics(page);
    await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-export');
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_report_viewed']);
    await page.evaluate(()=>{window.reportFactor=2;window.dispatchEvent(new Event('focus'));});
    await page.waitForFunction(()=>document.querySelector('[data-report-metric="minutes"]')?.textContent==='1 h 40');
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
    await page.click('#report-submit');await page.waitForSelector('#report-export');
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);
    const download=page.waitForEvent('download');await page.click('#report-export');await download;
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_report_viewed','analysis_report_viewed','analysis_report_exported']);
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>({source:r.source,metadata:r.metadata}))),Array.from({length:3},()=>({source:null,metadata:{consent:'granted',v:300}})));
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: comparison usage ignores refreshes, expired access and invalid snapshots',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await comparisonPage(width);await recordAnalysisAnalytics(page);
    await page.locator('#compare-panel > summary').click();await page.waitForSelector('#compare-save-view');
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_comparison_viewed']);
    await page.evaluate(()=>{window.compareFactor=2;window.dispatchEvent(new Event('titan:history-updated'));});
    await page.waitForSelector('#compare-save-view');assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
    await page.selectOption('#compare-weeks','12');await page.click('#compare-submit');await page.waitForSelector('#compare-save-view');
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);
    await page.evaluate(()=>{window.compareAccess='free';});await page.click('#compare-submit');
    await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.includes('TITAN+ ajoute'));
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);
    await page.evaluate(()=>{window.titanClient.rpc=async()=>({data:{version:1,owner:'wrong-owner',available:true}});});
    await page.click('#compare-submit');await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.includes('pas répondu correctement'));
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: saved view actions use confirmed receipts and closed kinds, including Free deletion',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width);await recordAnalysisAnalytics(page);
    await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');
    await page.fill('#views-name','Nom privé');await page.click('#views-submit');await page.waitForSelector('[data-view]');
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_report_viewed','analysis_view_created']);
    await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Autre nom privé');await page.click('#views-submit');
    await page.waitForFunction(()=>document.querySelector('#views-list').textContent.includes('Autre nom privé'));
    await page.locator('[data-view-action="apply"]').click();
    await page.waitForFunction(()=>window.analyticsWrites.filter(r=>r.event_name==='analysis_report_viewed').length===2);
    await page.evaluate(()=>{window.viewsAccess='free';});await page.click('#views-retry');await page.waitForSelector('[data-view-action="edit"]:disabled');
    await page.locator('[data-view-action="delete"]').click();await page.click('#views-confirm-delete');
    await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('Vue supprimée'));
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.filter(r=>r.event_name.startsWith('analysis_view_')).map(r=>({name:r.event_name,source:r.source,metadata:r.metadata}))),
      ['created','renamed','opened','deleted'].map(action=>({name:'analysis_view_'+action,source:null,metadata:{kind:'report',consent:'granted',v:300}})));
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: refused tracking and a failed report leave the product usable without events',async()=>{
  const {page,context,errors}=await reportPage();await recordAnalysisAnalytics(page,false);
  await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-export');
  const download=page.waitForEvent('download');await page.click('#report-export');await download;
  assert.deepEqual(await page.evaluate(()=>window.analyticsWrites),[]);
  await page.evaluate(()=>{window.TitanAnalytics.setConsent(true);window.reportAccess='error';});await page.click('#report-submit');
  await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('pas répondu correctement'));
  assert.deepEqual(await page.evaluate(()=>window.analyticsWrites),[]);assert.deepEqual(errors,[]);await context.close();
});
test('analysis analytics: an acknowledged mutation counts even if list refresh fails; an invalid receipt does not',async()=>{
  for(const acknowledged of [false,true]){
    const {page,context,errors}=await viewsPage(360,'report',true);await recordAnalysisAnalytics(page);
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Renommage privé');
    await page.evaluate(acknowledged=>{
      const previous=window.viewGateway;let failed=false;
      window.viewGateway=async(name,p)=>{
        if(name==='titan_mutate_analysis_view'){
          if(!acknowledged)return {data:{version:1,owner:'wrong-owner',action:'save'}};
          const result=await previous(name,p);failed=true;return result;
        }
        if(failed&&name==='titan_analysis_views')return {error:{message:'Network lost'}};
        return previous(name,p);
      };
    },acknowledged);
    await page.click('#views-submit');
    await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('mais la liste')||document.querySelector('#views-status').textContent.includes('vérifie la liste'));
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),acknowledged?['analysis_view_renamed']:[]);
    assert.deepEqual(errors,[]);await context.close();
  }
});

test('views UX: pending save retains the draft until its uncertain response arrives',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width,'report',true);
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
    await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Nom à conserver');
    await page.evaluate(()=>{
      const previous=window.viewGateway;
      window.viewGateway=(name,p)=>name==='titan_mutate_analysis_view'
        ?new Promise(resolve=>{window.finishPendingViewFailure=()=>resolve({error:{message:'Network lost'}});})
        :previous(name,p);
    });
    await page.click('#views-submit');await page.waitForFunction(()=>typeof window.finishPendingViewFailure==='function');
    assert.equal(await page.locator('#views-cancel').isDisabled(),true,'pending save cannot discard its draft');
    await page.evaluate(()=>document.querySelector('#views-cancel').click());
    assert.equal(await page.locator('#views-draft-form').isVisible(),true);
    assert.equal(await page.locator('#views-name').inputValue(),'Nom à conserver');
    await page.evaluate(()=>window.finishPendingViewFailure());
    await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('vérifie la liste'));
    assert.equal(await page.locator('#views-cancel').isDisabled(),false);
    assert.equal(await page.locator('#views-draft-form').isVisible(),true);
    assert.equal(await page.locator('#views-name').inputValue(),'Nom à conserver');
    await page.click('#views-cancel');assert.equal(await page.locator('#views-draft-form').isVisible(),false);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('views UX: rename removes the previous delete confirmation',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width,'report',true);
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
    await page.locator('[data-view-action="delete"]').click();assert.equal(await page.locator('#views-confirm-delete').count(),1);
    await page.locator('[data-view-action="edit"]').click();
    assert.equal(await page.locator('#views-confirm-delete').count(),0,'rename clears the visible confirmation');
    assert.equal(await page.locator('#views-draft-form').isVisible(),true);
    assert.equal(await page.locator('#views-name').inputValue(),'Mon année');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'views-name');
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('views UX: keyboard cancellation returns focus to the same view delete button',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width,'report',true);
    await page.evaluate(()=>window.viewRows.push({...window.viewRows[0],id:'00000000-0000-4000-8000-000000000444',name:'Deuxième vue'}));
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
    const card=page.locator('[data-view="00000000-0000-4000-8000-000000000444"]');
    await card.locator('[data-view-action="delete"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'views-confirm-delete');
    await page.keyboard.press('Tab');await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(()=>({action:document.activeElement?.dataset.viewAction,id:document.activeElement?.closest('[data-view]')?.dataset.view})),
      {action:'delete',id:'00000000-0000-4000-8000-000000000444'});
    assert.equal(await page.locator('#views-confirm-delete').count(),0);
    await page.keyboard.press('Enter');assert.equal(await card.locator('#views-confirm-delete').count(),1);
    assert.deepEqual(errors,[]);await context.close();
  }
});

test('views: save current report, restore fresh, rename and delete at 360/1280 px',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width);
    assert.equal(await page.locator('#views-panel').getAttribute('open'),null);
    await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');
    await page.selectOption('#report-period','year:1');await page.click('#report-submit');await page.waitForSelector('#report-save-view');
    await page.click('#report-save-view');await page.waitForSelector('#views-draft-form:not([hidden])');
    await page.fill('#views-name','Mon année');await page.click('#views-submit');await page.waitForSelector('[data-view]');
    assert.match(await page.locator('#views-list').innerText(),/Mon année.*Année précédente/s);
    await page.evaluate(()=>{window.reportFactor=2;});await page.locator('[data-view-action="apply"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-report-metric="minutes"]')?.textContent==='1 h 40');
    assert.equal(await page.locator('#report-period').inputValue(),'year:1');
    const last=await page.evaluate(()=>window.reportCalls.at(-1));assert.equal(last.p_offset,1);assert.ok(last.p_timezone);
    await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','<b>Privé</b>');await page.click('#views-submit');
    await page.waitForFunction(()=>document.querySelector('#views-list').textContent.includes('<b>Privé</b>'));assert.equal(await page.locator('#views-list b').count(),0);
    if(process.env.TITAN_QA_SCREENSHOTS)await page.locator('#vues').screenshot({path:`/tmp/titan-views-${width}.png`,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('[data-view-action="delete"]').click();await page.click('#views-confirm-delete');
    await page.waitForFunction(()=>document.querySelectorAll('[data-view]').length===0);assert.match(await page.locator('#views-status').innerText(),/supprimée/);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('views: comparison sport and 12 weeks restored with a fresh calculation',async()=>{
  const {page,context,errors}=await viewsPage(360,'comparison');
  await page.locator('#compare-panel > summary').click();await page.waitForSelector('#compare-save-view');
  await page.selectOption('#compare-weeks','12');await page.fill('#compare-sport-q','course');await page.locator('[data-sport="running"]').click();await page.click('#compare-submit');
  await page.waitForSelector('#compare-save-view');await page.click('#compare-save-view');await page.fill('#views-name','Course 12 semaines');await page.click('#views-submit');await page.waitForSelector('[data-view]');
  await page.selectOption('#compare-weeks','4');await page.click('#compare-all');await page.locator('[data-view-action="apply"]').click();
  await page.waitForSelector('#compare-save-view');assert.equal(await page.locator('#compare-weeks').inputValue(),'12');
  assert.match(await page.locator('#compare-sport-current').innerText(),/Course/);const p=await page.evaluate(()=>window.compareCalls.at(-1));assert.equal(p.p_sport,'running');assert.equal(p.p_weeks,12);
  assert.deepEqual(errors,[]);await context.close();
});
test('views: expired retained parameters are deletable; fresh apply cannot unlock paid reports',async()=>{
  const {page,context}=await viewsPage(360,'report',true);
  await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
  await page.evaluate(()=>{window.viewsAccess='free';window.reportAccess='free';});
  await page.locator('[data-view-action="apply"]').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('conservées'));
  assert.equal(await page.locator('[data-view-action="apply"]').isDisabled(),true);assert.equal(await page.locator('[data-view-action="edit"]').isDisabled(),true);
  assert.equal(await page.locator('.report-results').count(),0);assert.match(await page.locator('#views-list').innerText(),/Mon année/);
  await page.locator('[data-view-action="delete"]').click();await page.click('#views-confirm-delete');await page.waitForFunction(()=>!document.querySelector('[data-view]'));
  await context.close();
});
test('views: stable create UUID survives uncertain response; success then refresh error remains honest',async()=>{
  const {page,context}=await viewsPage();
  await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');await page.fill('#views-name','Retry');
  await page.evaluate(()=>{const gateway=window.viewGateway;let first=true;window.viewGateway=async(name,p)=>{const result=await gateway(name,p);if(name==='titan_mutate_analysis_view'&&first){first=false;return {error:{message:'Network lost'}};}return result;};});
  await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('vérifie'));
  await page.click('#views-submit');await page.waitForSelector('[data-view]');
  const ids=await page.evaluate(()=>window.viewsCalls.filter(c=>c.name==='titan_mutate_analysis_view').map(c=>c.p.p_id));assert.equal(new Set(ids).size,1);assert.equal(await page.evaluate(()=>window.viewRows.length),1);
  await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Saved');
  await page.evaluate(()=>{const gateway=window.viewGateway;let saved=false;window.viewGateway=async(name,p)=>{if(name==='titan_analysis_views'&&saved)return {error:{message:'Offline'}};const result=await gateway(name,p);if(name==='titan_mutate_analysis_view')saved=true;return result;};});
  await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('enregistrée')&&/actualiser/i.test(document.querySelector('#views-status').textContent));
  assert.equal(await page.evaluate(()=>window.viewRows[0].name),'Saved');await context.close();
});
test('views: malformed list rejected, missing server and timeout recover without retaining stale rows',async()=>{
  const {page,context}=await viewsPage(360,'report',true);await page.clock.install();
  await page.evaluate(()=>{window.viewGateway=async()=>({data:{...window.makeViewList({}),owner:'foreign'}});});
  await page.locator('#views-panel > summary').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('correctement'));assert.equal(await page.locator('[data-view]').count(),0);
  await page.evaluate(()=>{window.viewGateway=()=>new Promise(resolve=>{window.oldViewReply=()=>resolve({data:window.makeViewList({})});});});
  await page.click('#views-retry');await page.waitForFunction(()=>!!window.oldViewReply);await page.clock.fastForward(15100);
  assert.match(await page.locator('#views-status').innerText(),/15 secondes/);await page.evaluate(()=>window.oldViewReply());assert.equal(await page.locator('[data-view]').count(),0);
  await page.evaluate(()=>{window.viewGateway=async()=>({error:{code:'PGRST202'}});});await page.click('#views-retry');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('mise à jour du serveur'));await context.close();
});
test('views: delayed mutations cannot cross an actual A to B to A auth transition',async()=>{
  const {page,context}=await viewsPage();await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');await page.fill('#views-name','Private A');
  await page.evaluate(async()=>{window.__titanAuthListenerBound=false;window.titanClient.auth={onAuthStateChange(cb){window.viewsAuth=cb;}};await window.setupTitanAuthListener();const gateway=window.viewGateway;
    window.viewGateway=(name,p)=>name==='titan_mutate_analysis_view'?new Promise(async resolve=>{const response=await gateway(name,p);window.oldViewMutation=()=>resolve(response);}):gateway(name,p);});
  await page.click('#views-submit');await page.waitForFunction(()=>!!window.oldViewMutation);
  await page.evaluate(()=>{window.viewsAuth('SIGNED_IN',{user:{id:'00000000-0000-4000-8000-000000000456'}});window.viewsAuth('SIGNED_IN',{user:{id:'00000000-0000-4000-8000-000000000123'}});window.oldViewMutation();});
  assert.equal(await page.locator('[data-view]').count(),0);assert.equal(await page.locator('#views-draft-form').isVisible(),false);assert.doesNotMatch(await page.locator('#views-status').innerText(),/enregistrée/);
  await page.evaluate(()=>window.viewsAuth('SIGNED_OUT',null));assert.equal(await page.locator('[data-view]').count(),0);await context.close();
});

test('views: closing/offline cancels late mutations; stale rename requires a fresh revision',async()=>{
  const {page,context}=await viewsPage(360,'report',true);
  await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Stale');
  await page.evaluate(()=>{window.viewRows[0].revision=2;window.viewRows[0].name='Other device';});
  await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('autre appareil'));
  assert.equal(await page.evaluate(()=>window.viewRows[0].name),'Other device');
  await page.click('#views-cancel');await page.waitForFunction(()=>document.querySelector('#views-list').textContent.includes('Other device'));
  await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Late');
  await page.evaluate(()=>{const gateway=window.viewGateway;window.viewGateway=(name,p)=>name==='titan_mutate_analysis_view'?new Promise(async resolve=>{const response=await gateway(name,p);window.lateClosedView=()=>resolve(response);}):gateway(name,p);});
  await page.click('#views-submit');await page.waitForFunction(()=>!!window.lateClosedView);await page.locator('#views-panel > summary').click();await page.evaluate(()=>window.lateClosedView());
  await page.waitForFunction(()=>!document.querySelector('[data-view]'));
  assert.equal(await page.locator('[data-view]').count(),0);assert.equal(await page.locator('#views-draft-form').isVisible(),false);
  await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  assert.equal(await page.locator('[data-view]').count(),0);assert.match(await page.locator('#views-status').innerText(),/Hors ligne/);await context.close();
});
test('views: expiration during save disables paid draft controls and retains the name',async()=>{
  const {page,context}=await viewsPage();await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');await page.fill('#views-name','Retained draft');
  await page.evaluate(()=>{window.viewsAccess='free';});await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('conservées'));
  assert.equal(await page.locator('#views-name').isDisabled(),true);assert.equal(await page.locator('#views-submit').isDisabled(),true);assert.equal(await page.locator('#views-name').inputValue(),'Retained draft');await context.close();
});

test("reports: four choices, provisional labels, estimates and sources at 360/1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await reportPage(width);
    assert.equal(await page.locator("#report-panel").getAttribute("open"), null);
    await page.locator("#report-panel > summary").click();
    await page.waitForSelector(".report-results");
    for (const [choice, size] of [["month:0", 15], ["month:1", 29], ["year:0", 3], ["year:1", 12]]) {
      await page.selectOption("#report-period", choice);
      await page.click("#report-submit");
      await page.waitForSelector(".report-results");
      assert.match(await page.locator(".report-results").innerText(), choice.endsWith(":0") ? /provisoire/i : /période complète/i);
      assert.match(await page.locator(".report-results").innerText(), /estimée/);
      assert.equal(await page.locator('[data-report-metric="active_days"]').innerText(), "1");
      await page.locator("#report-calendar summary").click();
      assert.equal(await page.locator("#report-calendar tbody tr").count(), size);
    }
    assert.equal(await page.locator('.report-sources a[href="/journal?session=00000000-0000-4000-8000-000000000999"]').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.locator("#bilans").screenshot({ path: `/tmp/titan-reports-${width}.png`, animations: "disabled" });
    await context.close();
  }
});
test("reports: CSV uses a fresh server snapshot and retains all 200 sports beyond pagination", async () => {
  const { page, context, errors } = await reportPage(360, "plus", true);
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  assert.equal(await page.locator("#report-sport-rows tr").count(), 20);
  await page.click("#report-next"); assert.match(await page.locator("#report-page").innerText(), /2.*10/);
  await page.fill("#report-sport-search", "sport_199"); assert.equal(await page.locator("#report-sport-rows tr").count(), 1);
  const calls = await page.evaluate(() => window.reportCalls.length);
  await page.evaluate(() => { window.reportFactor = 2; });
  const downloadPromise = page.waitForEvent("download"); await page.click("#report-export");
  const download = await downloadPromise, csv = readFileSync(await download.path(), "utf8");
  assert.match(download.suggestedFilename(), /bilan.*\.csv$/);
  assert.equal(csv.split("\r\n").filter(s => s.startsWith('"Sport"')).length, 200);
  assert.match(csv, /"200";"1";"400";"0"/);
  assert.doesNotMatch(csv, /00000000-0000/);
  assert.ok(await page.evaluate(() => window.reportCalls.length) > calls);
  assert.deepEqual(errors, []); await context.close();
});
test("reports: guest, Free, old server and network errors never expose a paid aggregate", async () => {
  for (const access of ["guest", "free", "missing", "error"]) {
    const { page, context, errors } = await reportPage(360, access);
    await page.locator("#report-panel > summary").click();
    await page.waitForFunction(() => !document.querySelector("#report-status").textContent.includes("Calcul") && !!document.querySelector("#report-status").textContent);
    assert.equal(await page.locator(".report-results").count(), 0);
    assert.equal(await page.locator("#report-export").count(), 0);
    assert.equal(await page.locator(".wk-hero").count(), 1);
    assert.match(await page.locator("#report-status").innerText(), access === "missing" ? /mise à jour du serveur/ : access === "error" ? /Réessaie/ : /compte|TITAN\+/);
    if (access === "guest") assert.equal(await page.evaluate(() => window.reportCalls.length), 0);
    else assert.ok(await page.evaluate(() => window.reportCalls.length) > 0);
    assert.deepEqual(errors, []); await context.close();
  }
});
test("reports: expiry between preview and export blocks download and removes the old report", async () => {
  const { page, context } = await reportPage(); let downloads = 0; page.on("download", () => downloads++);
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.evaluate(() => { window.reportAccess = "free"; });
  await page.click("#report-export"); await page.waitForSelector("#report-status a");
  assert.equal(await page.locator(".report-results").count(), 0); assert.equal(downloads, 0);
  await context.close();
});
test("reports: never-answering request expires at fifteen seconds and can be retried", async () => {
  const { page, context } = await reportPage(); await page.clock.install();
  await page.evaluate(() => { window.titanClient.rpc = () => { window.hungReport = true; return new Promise(() => {}); }; });
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => window.hungReport);
  await page.clock.runFor(15001);
  assert.match(await page.locator("#report-status").innerText(), /15 secondes/);
  assert.equal(await page.locator("#report-submit").isDisabled(), false);
  await page.evaluate(() => { window.titanClient.rpc = async (name, p) => ({ data: window.makeReport(p) }); });
  await page.click("#report-submit"); await page.waitForSelector(".report-results");
  await context.close();
});
test("reports: malformed totals and obsolete filter response never become a preview", async () => {
  const { page, context } = await reportPage();
  await page.evaluate(() => { window.pendingReports = []; window.titanClient.rpc = (name, p) => new Promise(resolve => { const data = window.makeReport(p); window.pendingReports.push({ p, finish: () => resolve({ data }) }); }); });
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => window.pendingReports.length > 0);
  await page.selectOption("#report-period", "year:1"); await page.click("#report-submit");
  await page.waitForFunction(() => window.pendingReports.some(r => r.p.p_period === "year"));
  await page.evaluate(() => window.pendingReports.filter(r => r.p.p_period === "month").forEach(r => r.finish()));
  assert.equal(await page.locator("#report-output").getAttribute("aria-busy"), "true");
  await page.evaluate(() => window.pendingReports.filter(r => r.p.p_period === "year").forEach(r => r.finish()));
  await page.waitForSelector(".report-results"); assert.match(await page.locator("#report-title").innerText(), /2023/);
  await page.evaluate(() => { window.titanClient.rpc = async (name, p) => { const data = window.makeReport(p); data.active_days = 99; return { data }; }; });
  await page.click("#report-submit"); await page.waitForFunction(() => document.querySelector("#report-status").textContent.includes("correctement"));
  assert.equal(await page.locator(".report-results").count(), 0); await context.close();
});
test("reports: actual SIGNED_OUT and A→B→A invalidate both preview and pending export", async () => {
  const { page, context } = await reportPage(); let downloads = 0; page.on("download", () => downloads++);
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.evaluate(async () => {
    window.__titanAuthListenerBound = false; window.titanClient.auth = { onAuthStateChange(cb) { window.reportAuth = cb; } };
    await window.setupTitanAuthListener();
    window.titanClient.rpc = (name, p) => new Promise(resolve => { const data = window.makeReport(p); window.oldReportExport = () => resolve({ data }); });
  });
  await page.click("#report-export"); await page.waitForFunction(() => !!window.oldReportExport);
  await page.evaluate(() => {
    window.reportAuth("SIGNED_IN", { user: { id: "00000000-0000-4000-8000-000000000456" } });
    window.reportAuth("SIGNED_IN", { user: { id: "00000000-0000-4000-8000-000000000123" } });
    window.oldReportExport(); window.dispatchEvent(new Event("focus"));
  });
  assert.equal(await page.locator(".report-results").count(), 0); assert.equal(downloads, 0);
  await page.evaluate(() => window.reportAuth("SIGNED_OUT", null));
  assert.equal(await page.locator(".report-sources a").count(), 0); await context.close();
});
test("reports: close, offline and history change clear stale reports immediately", async () => {
  const { page, context } = await reportPage();
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => !document.querySelector(".report-results"));
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  assert.equal(await page.locator(".report-results").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForSelector(".report-results");
  await page.evaluate(() => { window.reportAccess = "free"; window.dispatchEvent(new Event("titan:history-updated")); });
  await page.waitForSelector("#report-status a"); assert.equal(await page.locator(".report-results").count(), 0);
  await context.close();
});
test("reports: empty period is explicit and abort signal cancels obsolete options", async () => {
  const { page, context } = await reportPage();
  await page.evaluate(() => {
    window.reportSignals = []; window.titanClient.rpc = (name, p) => ({
      abortSignal(signal) { window.reportSignals.push(signal); return new Promise(() => {}); }
    });
  });
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => window.reportSignals.length > 0);
  await page.selectOption("#report-period", "year:1");
  assert.equal(await page.evaluate(() => window.reportSignals.every(s => s.aborted)), true);
  await page.evaluate(() => { window.titanClient.rpc = async (name, p) => {
    const data = window.makeReport(p); Object.assign(data, { sessions: 0, active_days: 0, minutes: 0, estimated_sessions: 0, sports: [], sources: [] });
    data.series = data.series.map(s => ({ ...s, sessions: 0, active_days: 0, minutes: 0, estimated_sessions: 0 })); return { data };
  }; });
  await page.click("#report-submit"); await page.waitForSelector(".report-results");
  assert.match(await page.locator(".report-results").innerText(), /Aucune séance synchronisée/);
  assert.equal(await page.locator('[data-report-metric="minutes"]').innerText(), "0 min");
  await context.close();
});

// The real analysis UI/shell, with only the remote RPC replaced by its full contract.
async function comparisonPage(width = 360, access = "plus") {
  const fixture = await newPage(width);
  const { page } = fixture;
  await page.route("**/js/app/analyses.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  assert.equal(await page.locator("#analyses").count(), 1, "Progrès has the secondary comparison panel");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate((access) => {
    const owner = "00000000-0000-4000-8000-000000000123";
    if (access !== "guest") window.state.user.id = owner;
    window.state.user.is_elite = true; // Cannot unlock anything on its own.
    window.compareAccess = access;
    window.compareCalls = [];
    window.makeComparison = (p) => {
      if (window.compareAccess === "free") return { version: 1, owner: window.state.user.id, available: false, reason: "premium_required" };
      const end = new Date("2026-10-05T12:00:00Z");
      const shift = (d, days) => { const v = new Date(d); v.setUTCDate(v.getUTCDate() + days); return v.toISOString().slice(0, 10); };
      const period = (part) => {
        const to = shift(end, -part * p.p_weeks * 7), from = shift(end, -(part + 1) * p.p_weeks * 7);
        const start = new Date(from + "T12:00:00Z");
        return { from, to, sessions: part ? 4 : 8, active_days: part ? 2 : 4, minutes: part ? 0 : 240, estimated_sessions: part ? 0 : 1,
          series: Array.from({ length: p.p_weeks }, (_, i) => ({ from: shift(start, i * 7), to: shift(start, (i + 1) * 7), sessions: i === p.p_weeks - 1 ? (part ? 4 : 8) : 0, active_days: i === p.p_weeks - 1 ? (part ? 2 : 4) : 0, minutes: i === p.p_weeks - 1 && !part ? 240 : 0 })),
          sources: [{ id: "00000000-0000-4000-8000-000000000999", sport: p.p_sport || "running", date: shift(new Date(to + "T12:00:00Z"), -3) + "T12:00:00Z", minutes: part ? 0 : 30, estimated: !part }] };
      };
      return { version: 1, owner: window.state.user.id, available: true, as_of: "2026-10-08T12:00:00Z", timezone: p.p_timezone, weeks: p.p_weeks, sport: p.p_sport, recent: period(0), previous: period(1) };
    };
    window.titanClient = { rpc: async (name, params) => {
      if (name !== "titan_compare_periods") throw Error("unexpected analysis RPC");
      window.compareCalls.push(params);
      if (window.compareAccess === "missing") return { error: { code: "PGRST202", message: "Could not find function" } };
      if (window.compareAccess === "error") return { error: { message: "Network request failed" } };
      return { data: window.makeComparison(params) };
    } };
  }, access);
  await page.addScriptTag({ path: ROOT + "/js/app/analyses.js" });
  await page.waitForSelector("#compare-panel summary");
  return fixture;
}

test("comparisons: guest and Free keep the free recap, client elite flag never unlocks", async () => {
  for (const access of ["guest", "free"]) {
    const { page, context, errors } = await comparisonPage(360, access);
    assert.equal(await page.locator("#compare-panel").getAttribute("open"), null);
    await page.locator("#compare-panel summary").click();
    await page.waitForSelector("#compare-status a");
    assert.equal(await page.locator(".compare-results").count(), 0);
    assert.equal(await page.locator(".wk-hero").count(), 1, "free weekly recap is retained");
    const calls = await page.evaluate(() => window.compareCalls.length);
    if (access === "guest") assert.equal(calls, 0);
    else assert.ok(calls >= 1, "Free entitlement is actually checked by the server, including revalidation events");
    assert.match(await page.locator("#compare-status").innerText(), /compte|TITAN\+/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("comparisons: equal periods, estimates, source links and zero reference at 360/1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await comparisonPage(width);
    await page.locator("#compare-panel summary").click();
    await page.waitForSelector(".compare-results");
    assert.match(await page.locator(".compare-results").innerText(), /4 h/);
    assert.match(await page.locator(".compare-results").innerText(), /estimée/);
    assert.match(await page.locator('[data-comparison-metric="minutes"]').innerText(), /pas de référence/i);
    assert.match(await page.locator('[data-comparison-metric="minutes"]').innerText(), /0 min/, "zero is known practice volume, not missing data");
    assert.doesNotMatch(await page.locator(".compare-results").innerText(), /Infinity|NaN/);
    assert.equal(await page.locator('a[href="/journal?session=00000000-0000-4000-8000-000000000999"]').count(), 2);
    await page.locator("#compare-weekly summary").click();
    assert.equal(await page.locator("#compare-weekly tbody tr").count(), 4);
    for (const weeks of [12, 26]) {
      await page.selectOption("#compare-weeks", String(weeks));
      await page.click("#compare-submit");
      await page.waitForSelector(".compare-results");
      await page.locator("#compare-weekly summary").click();
      assert.equal(await page.locator("#compare-weekly tbody tr").count(), weeks);
    }
    await page.fill("#compare-sport-q", "course");
    assert.ok(await page.locator("#compare-sport-results button").count() <= 12);
    await page.locator('#compare-sport-results [data-sport="running"]').click();
    await page.click("#compare-submit");
    await page.waitForSelector(".compare-results");
    assert.equal(await page.evaluate(() => window.compareCalls.at(-1).p_sport), "running");
    assert.match(await page.locator(".compare-results").innerText(), /Course à pied/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.locator("#analyses").screenshot({ path: `/tmp/titan-comparisons-${width}.png`, animations: "disabled" });
    await context.close();
  }
});

test("comparisons: missing server, network failure and Retry show honest states", async () => {
  for (const access of ["missing", "error"]) {
    const { page, context, errors } = await comparisonPage(360, access);
    await page.locator("#compare-panel summary").click();
    await page.waitForSelector("#compare-status p");
    assert.match(await page.locator("#compare-status").innerText(), access === "missing" ? /mise à jour du serveur/ : /Réessaie/);
    assert.equal(await page.locator(".compare-results").count(), 0);
    await page.evaluate(() => { window.compareAccess = "plus"; });
    await page.click("#compare-submit");
    await page.waitForSelector(".compare-results");
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    assert.equal(await page.locator(".compare-results").count(), 0);
    assert.match(await page.locator("#compare-status").innerText(), /Hors ligne/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("comparisons: revalidation removes results after expiry and ignores prior-owner response", async () => {
  const { page, context, errors } = await comparisonPage();
  await page.locator("#compare-panel summary").click();
  await page.waitForSelector(".compare-results");
  await page.evaluate(() => { window.compareAccess = "free"; window.dispatchEvent(new Event("focus")); });
  await page.waitForSelector("#compare-status a");
  assert.equal(await page.locator(".compare-results").count(), 0);
  await page.evaluate(() => {
    window.compareAccess = "plus";
    window.titanClient.rpc = (name, p) => new Promise((resolve) => { const data = window.makeComparison(p); window.resolveOldComparison = () => resolve({ data }); });
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() => !!window.resolveOldComparison);
  await page.evaluate(() => { window.state.user.id = "guest_other"; window.dispatchEvent(new Event("titan:history-updated")); window.resolveOldComparison(); });
  await page.waitForSelector("#compare-status a");
  assert.equal(await page.locator(".compare-results").count(), 0);
  assert.equal(await page.locator('a[href*="session="]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("comparisons: an older filter response cannot overwrite a newer request", async () => {
  const { page, context } = await comparisonPage();
  await page.evaluate(() => {
    window.deferredComparisons = [];
    window.titanClient.rpc = (name, p) => p.p_weeks === 12 ? Promise.resolve({ data: window.makeComparison(p) }) : new Promise((resolve) => { window.deferredComparisons.push(() => resolve({ data: window.makeComparison(p) })); });
  });
  await page.locator("#compare-panel summary").click();
  await page.waitForFunction(() => window.deferredComparisons.length >= 1);
  await page.selectOption("#compare-weeks", "12");
  await page.click("#compare-submit");
  await page.waitForSelector(".compare-results");
  await page.evaluate(() => window.deferredComparisons.forEach(resolve => resolve()));
  assert.match(await page.locator("#compare-period-title").innerText(), /12 semaines/);
  await context.close();
});

test("comparisons: a discarded response cannot end the newer loading state", async () => {
  const { page, context } = await comparisonPage();
  await page.evaluate(() => {
    window.pendingComparisons = { 4: [], 12: [] };
    window.titanClient.rpc = (name, p) => new Promise(resolve => window.pendingComparisons[p.p_weeks].push(() => resolve({ data: window.makeComparison(p) })));
  });
  await page.locator("#compare-panel summary").click();
  await page.waitForFunction(() => window.pendingComparisons[4].length > 0);
  await page.selectOption("#compare-weeks", "12");
  // A real focus refresh can already start the selected request in a slow CI browser.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => window.pendingComparisons[12].length > 0);
  await page.evaluate(() => window.pendingComparisons[4].forEach(resolve => resolve()));
  assert.equal(await page.locator("#compare-submit").isDisabled(), true, "new comparison is still loading");
  assert.equal(await page.locator("#compare-output").getAttribute("aria-busy"), "true");
  await page.evaluate(() => window.pendingComparisons[12].forEach(resolve => resolve()));
  await page.waitForSelector(".compare-results");
  await context.close();
});

test("comparisons: malformed or wrong-owner data never becomes a result", async () => {
  for (const invalid of ["owner", "series"]) {
    const { page, context, errors } = await comparisonPage();
    await page.evaluate(invalid => {
      const make = window.makeComparison;
      window.makeComparison = p => { const j = make(p); if (invalid === "owner") j.owner = "another_account"; else j.recent.series = []; return j; };
    }, invalid);
    await page.locator("#compare-panel summary").click();
    await page.waitForFunction(() => document.getElementById("compare-status").textContent.includes("correctement"));
    assert.equal(await page.locator(".compare-results").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

async function journalSourcePage() {
  const fixture = await newPage(360);
  const { page } = fixture;
  await page.route("**/js/app/journal.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/journal?session=00000000-0000-4000-8000-000000000999", { waitUntil: "load" });
  await page.evaluate(() => {
    const owner = "00000000-0000-4000-8000-000000000123";
    window.state.user.id = owner;
    window.state.history = [];
    window.sourceFilters = [];
    const query = { select() { return this; }, eq(k, v) { window.sourceFilters.push([k, v]); return this; }, maybeSingle: async () => ({ data: { id: "00000000-0000-4000-8000-000000000999", user_id: owner, sport: "running", unit: "km", val: 5, date: "2026-01-01T12:00:00Z", details: { val2: 30, note: "Note privée du compte A" }, xp: 0, revision: 1 } }) };
    window.titanClient = { from(t) { if (t !== "training_logs") throw Error("unexpected source read"); return query; } };
  });
  await page.addScriptTag({ path: ROOT + "/js/app/journal.js" });
  await page.waitForSelector("dialog.asc-sheet[open]");
  return fixture;
}

test("journal: a source outside the local history opens via an owner-filtered read", async () => {
  const { page, context, errors } = await journalSourcePage();
  assert.match(await page.locator("dialog.asc-sheet[open]").innerText(), /Course à pied|5 km/);
  assert.deepEqual(await page.evaluate(() => window.sourceFilters), [["id", "00000000-0000-4000-8000-000000000999"], ["user_id", "00000000-0000-4000-8000-000000000123"]]);
  await page.evaluate(() => { window.state.user.id = "guest_new"; window.dispatchEvent(new Event("titan:history-updated")); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("comparisons: real profile sync clears the prior account before history pagination ends", async () => {
  const { page, context } = await comparisonPage();
  await page.locator("#compare-panel summary").click();
  await page.waitForSelector(".compare-results");
  await page.evaluate(() => {
    const owner = "00000000-0000-4000-8000-000000000456";
    const profile = { id: owner, friend_code: "B123", is_elite: false, game_state: structuredClone(window.state) };
    profile.game_state.user.id = owner;
    window.titanClient.auth = { getSession: async () => ({ data: { session: { user: { id: owner } } } }) };
    window.titanClient.from = () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile }) });
    window.compareAccess = "free";
    window.titanMaybeSubmitCacheReconciliation = undefined;
    window.titanSyncAppearance = async () => {};
    window.TitanTraining.paginate = () => new Promise(resolve => { window.finishHistory = () => resolve({ logs: [], total: 0 }); });
    window.TitanQueue.migrate = async () => {};
    window.TitanQueue.refresh = async () => [];
    window.TitanQueue.saveHistory = async () => {};
    window.syncWithSupabase();
  });
  await page.waitForFunction(() => !!window.finishHistory);
  assert.equal(await page.evaluate(() => window.state.user.id), "00000000-0000-4000-8000-000000000456");
  assert.equal(await page.locator(".compare-results").count(), 0);
  assert.equal(await page.locator('.compare-sources a').count(), 0);
  await context.close();
});

test("comparisons: real SIGNED_OUT callback immediately removes results and blocks refresh", async () => {
  const { page, context } = await comparisonPage();
  await page.locator("#compare-panel summary").click();
  await page.waitForSelector(".compare-results");
  await page.evaluate(async () => {
    window.__titanAuthListenerBound = false;
    window.titanClient.auth = { onAuthStateChange(cb) { window.authCallback = cb; } };
    await window.setupTitanAuthListener();
    window.authCallback("SIGNED_OUT", null);
    window.dispatchEvent(new Event("focus"));
  });
  assert.equal(await page.locator(".compare-results").count(), 0);
  assert.equal(await page.locator('.compare-sources a').count(), 0);
  await context.close();
});

test("journal: correction closes on account change and a retained form cannot save its private note", async () => {
  const { page, context } = await journalSourcePage();
  await page.locator("dialog[open] [data-edit]").click();
  assert.equal(await page.locator('dialog[open] [name=note]').inputValue(), "Note privée du compte A");
  await page.evaluate(() => {
    window.retainedCorrection = document.querySelector("dialog[open] form");
    window.sourceSaves = 0;
    window.TitanSessions.update = async () => { window.sourceSaves++; };
    window.state.user.id = "guest_new";
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.evaluate(() => window.retainedCorrection.dispatchEvent(new Event("submit", { cancelable: true })));
  assert.equal(await page.evaluate(() => window.sourceSaves), 0);
  await context.close();
});

test("journal: detail and derived archive confirmation close before a new account is adopted", async () => {
  for (const archive of [false, true]) {
    const { page, context } = await journalSourcePage();
    if (archive) await page.locator("dialog[open] [data-toggle-archive]").click();
    await page.evaluate(async () => {
      window.__titanAuthListenerBound = false;
      window.titanClient.auth = { onAuthStateChange(cb) { window.authCallback = cb; } };
      window.syncWithSupabase = () => new Promise(() => {});
      await window.setupTitanAuthListener();
      window.authCallback("SIGNED_IN", { user: { id: "00000000-0000-4000-8000-000000000456" } });
    });
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await context.close();
  }
});

test("landing: one h1, the start call to action, no horizontal scroll", async () => {
  const { page, errors } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator('a.asc-btn-primary[href="/onboarding"]').first().isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
});

test("Titan+ prices: concrete capacities and worlds are readable on mobile and desktop", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await newPage(width);
    await page.goto(BASE + "/tarifs#concret", { waitUntil: "load" });
    assert.equal(await page.locator("#concret").count(), 1);
    for (const [kind, free] of [["routines", 5], ["coach", 3]]) {
      const meter = page.locator(`[data-benefit="${kind}"] .pub-benefit-meter`);
      assert.equal(await meter.locator("span").count(), 20);
      assert.equal(await meter.locator(".is-free").count(), free);
      assert.match(await meter.getAttribute("aria-label"), new RegExp(`${free}.*20`));
    }
    assert.equal(await page.locator('#concret a[href="/aventures-sportives#forge"]').count(), 1);
    assert.equal(await page.locator('#concret a[href="/aventures-sportives#aurores"]').count(), 1);
    assert.equal(await page.locator("#stats-free").isVisible(), true);
    assert.match(await page.locator("#stats-free").innerText(), /gratuites/);
    await page.getByText("TITAN+ ajoute-t-il des analyses sportives ?", { exact: true }).click();
    assert.match(await page.locator("details[open]").innerText(), /4, 12 ou 26 semaines/);
    const expiry = page.locator("details").filter({ has: page.getByText("Que se passe-t-il à la fin de TITAN+ ?", { exact: true }) });
    await expiry.locator("summary").click();
    assert.match(await expiry.innerText(), /pièces acquises avec tes crédits restent à toi/);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-offer-${width}.png`, fullPage: true, animations: "disabled" });
    await context.close();
  }
});

test("Atelier: both subscription states can consult the concrete benefits without a checkout", async () => {
  for (const plus of [false, true]) {
    const { page, context, errors } = await atelierPage(360, plus);
    const calls = await page.evaluate(() => window.atelierCalls.length);
    let checkoutCalls = 0;
    await page.exposeFunction("recordCheckoutCall", () => { checkoutCalls++; });
    await page.evaluate(() => { window.openEliteCheckout = window.recordCheckoutCall; });
    const link = page.locator('#plus a[href="/tarifs#concret"]');
    assert.equal(await link.count(), 1);
    await link.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/tarifs#concret");
    assert.equal(await page.locator("#concret").isVisible(), true);
    assert.equal(checkoutCalls, 0, "consulting benefits never calls the checkout entry point");
    // Check before returning: the active Atelier can clear a pending marker on reload.
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v1")), null);
    assert.ok(calls > 0, "subscription state was loaded before navigating");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("guest: record a run, then find it in the journal and the week", async () => {
  const { page, errors } = await newPage();
  await page.goto(BASE + "/training", { waitUntil: "load" });
  await page.fill("#sport-q", "course");
  await page.click('#sport-results [data-sport="running"]');
  await page.fill('[data-k="distance"]', "10");
  await page.fill('[data-k="durM"]', "52");
  await page.click('[data-rpe="6"]');
  await page.click('[data-act="save"]');
  await page.waitForSelector("dialog.asc-sheet[open]", { timeout: 5000 });
  const moment = await page.locator("dialog.asc-sheet[open]").innerText();
  assert.match(moment, /10 km/);
  await page.goto(BASE + "/journal", { waitUntil: "load" });
  await page.waitForTimeout(500);
  assert.match(await page.locator("#journal").innerText(), /Course à pied/);
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  await page.waitForTimeout(500);
  assert.match(await page.locator(".wk-hero").innerText(), /52 min|1 jour actif/);
  assert.deepEqual(errors, []);
});

test("validation: a run without distance or duration is refused on the field", async () => {
  const { page } = await newPage();
  await page.goto(BASE + "/training?sport=running", { waitUntil: "load" });
  await page.waitForSelector('[data-act="save"]');
  await page.click('[data-act="save"]');
  await page.waitForTimeout(300);
  assert.ok((await page.locator('[aria-invalid="true"]').count()) >= 1);
});

test("private pages are noindex, public guides are indexable", async () => {
  for (const [path, indexable] of [["/aujourdhui", false], ["/journal", false], ["/profile", false], ["/boutique", false], ["/u/abcdefghij", false], ["/tarifs", true], ["/niveaux-et-xp", true]]) {
    const html = await (await fetch(BASE + path)).text();
    const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1] || "";
    assert.equal(/noindex/.test(robots), !indexable, `${path}: ${robots}`);
  }
});

// Real Atelier page/shell with a synthetic RPC contract. No signed-in production account.
async function atelierPage(width, plus = false, legacy = false, existing = null) {
  const fixture = existing || await newPage(width);
  if (existing) await fixture.page.evaluate(() => {
    // Our synthetic signed-in state can have been persisted by the real shell. Finish a
    // genuine guest boot again before reinstalling the external authenticated RPC fixture.
    const saved = JSON.parse(localStorage.getItem(window.STATE_KEY) || "null");
    if (saved?.user?.id === "00000000-0000-4000-8000-000000000123") {
      saved.user.id = "guest_checkout_fixture";
      localStorage.setItem(window.STATE_KEY, JSON.stringify(saved));
    }
  });
  await fixture.page.unroute("**/js/app/atelier.js?*");
  await fixture.page.route("**/js/app/atelier.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await fixture.page.goto(BASE + "/boutique", { waitUntil: "load" });
  await fixture.page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await fixture.page.evaluate(({ plus, legacy }) => {
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    const items = [
      { id: "cos_frame_standard", cosmetic: "frame-standard", slot: "frame", name: "Standard", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_frame_aegis", cosmetic: "frame-aegis", slot: "frame", name: "Cadre Aegis", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1400, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_frame_frost", cosmetic: "frame-frost", slot: "frame", name: "Cadre Givre", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1400, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_map_default", cosmetic: "map-default", slot: "map", name: "Vallée", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_map_aurora", cosmetic: "map-aurora", slot: "map", name: "Aurores", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1000, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_card_default", cosmetic: "card-default", slot: "card", name: "Classique", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_card_obsidian", cosmetic: "card-obsidian", slot: "card", name: "Obsidienne", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 800, owned: plus, permanent: false, plus_access: !legacy },
    ];
    if (legacy) {
      items.push({ id: "cos_frame_neon", cosmetic: "frame-neon", slot: "frame", name: "Néon", unlock: "credits", price: 450, owned: true });
      for (const i of items) { delete i.permanent; delete i.plus_access; }
    }
    window.atelierFixture = { credits: 2000, level: 1, week_credits: 0, week_credit_cap: 960, plus: { active: plus }, appearance: {}, items };
    window.atelierCalls = [];
    window.titanClient = { rpc: async (name, params) => {
      window.atelierCalls.push({ name, params });
      const d = window.atelierFixture;
      if (name === "titan_atelier") return { data: structuredClone(d) };
      const item = d.items.find((i) => i.id === (params.p_item_id || params.p_item));
      if (name === "titan_purchase_shop_item") {
        d.credits -= item.price;
        item.owned = item.permanent = true;
        return { data: [{ credits_after: d.credits }] };
      }
      if (name === "titan_set_appearance") {
        d.appearance[params.p_slot] = item.cosmetic;
        return { data: structuredClone(d.appearance) };
      }
      throw new Error("Unexpected fixture RPC: " + name);
    } };
  }, { plus, legacy });
  await fixture.page.addScriptTag({ path: ROOT + "/js/app/atelier.js" });
  await fixture.page.waitForSelector("[data-buy], [data-wear], [data-goto-plus]");
  return fixture;
}

// Keep the real checkout helper, Atelier and analytics transport; replace only external boundaries.
async function checkoutPage(width = 360, configured = true, granted = true, existing = null) {
  const fixture = await atelierPage(width, false, false, existing);
  await fixture.page.evaluate(({ configured, granted }) => {
    if (granted !== null) window.TitanAnalytics.setConsent(granted);
    window.checkoutWrites = []; window.checkoutOpens = []; window.activationToasts = [];
    window.checkoutReceiptTasks = [];
    if (navigator.locks?.request) {
      const request = navigator.locks.request.bind(navigator.locks);
      navigator.locks.request = (...args) => { const pending = request(...args); window.checkoutReceiptTasks.push(pending); return pending; };
    }
    window.checkoutMetricStatus = 201;
    window.titanClient.auth = { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture-token" } } }) };
    const nativeFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (new URL(input).pathname !== "/rest/v1/analytics_events") return nativeFetch(input, init);
      const row = JSON.parse(init.body); window.checkoutWrites.push(row);
      if (row.event_name === "premium_activated" && window.checkoutMetricGate) await window.checkoutMetricGate;
      return new Response(null, { status: window.checkoutMetricStatus });
    };
    const toast = window.titanShell.toast.bind(window.titanShell);
    window.titanShell.toast = options => { if (options.title === "TITAN+ est actif") window.activationToasts.push(options); return toast(options); };
    window.TITAN_PADDLE = configured ? { clientToken: "fixture-token", elitePriceId: "pri_fixture", environment: "sandbox" } : {};
    window.loadTitanPaddleSdk = async () => {
      window.checkoutSdkWaiting = true;
      if (window.checkoutSdkGate) await window.checkoutSdkGate;
      return { Environment: { set() {} }, Initialize() {}, Checkout: { open: data => window.checkoutOpens.push(data) } };
    };
    const open = window.openEliteCheckout;
    window.openEliteCheckout = options => window.checkoutOpening = open(options);
    const track = window.TitanAnalytics.track;
    window.TitanAnalytics.track = (name, props) => {
      const result = track(name, props);
      if (name === "premium_activated") window.checkoutActivation = result;
      return result;
    };
  }, { configured, granted });
  return fixture;
}
async function clickCheckout(page) {
  await page.click("[data-checkout]");
  await page.evaluate(() => window.checkoutOpening);
  await page.waitForFunction(() => !document.querySelector("[data-checkout]")?.disabled);
}
async function confirmCheckout(page) {
  await page.evaluate(() => { window.atelierFixture.plus.active = true; dispatchEvent(new Event("online")); });
  await page.waitForFunction(() => window.state.user.is_elite === true);
  await settleCheckout(page);
}
async function settleCheckout(page) {
  await page.evaluate(async () => {
    await Promise.all(window.checkoutReceiptTasks || []);
    await window.checkoutActivation;
    await Promise.all(window.checkoutReceiptTasks || []);
  });
}

test("checkout attribution: missing payment configuration leaves no activation receipt but preserves click intent", async () => {
  const { page, context, errors } = await checkoutPage(360, false);
  await clickCheckout(page);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("titan_checkout_started"))), []);
  await page.waitForFunction(() => window.checkoutWrites.some(r => r.event_name === "premium_checkout_started"));
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: SDK rejection and opening exception cannot leave an activation receipt", async () => {
  for (const failure of ["load", "open"]) {
    const { page, context, errors } = await checkoutPage();
    await page.evaluate(failure => {
      const load = window.loadTitanPaddleSdk;
      window.loadTitanPaddleSdk = async () => {
        if (failure === "load") throw Error("Synthetic SDK unavailable");
        const sdk = await load(); sdk.Checkout.open = () => { throw Error("Synthetic opening failure"); }; return sdk;
      };
    }, failure);
    await clickCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutOpening), false);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("titan_checkout_started"))), []);
    assert.equal(await page.locator("[data-checkout]").getAttribute("aria-busy"), null);
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("checkout attribution: older RPC and compatibility-profile reads cannot overwrite a newer Free status", async () => {
  for (const gateway of ["rpc", "profile"]) {
    const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
    await page.evaluate(gateway => {
      const pending = [];
      const original = window.titanClient.rpc;
      const response = () => gateway === "rpc" ? { data: structuredClone(window.atelierFixture) }
        : { data: { is_elite: false, elite_renews_at: null, elite_ends_at: null } };
      window.readsPending = pending;
      if (gateway === "rpc") window.titanClient.rpc = name => name === "titan_atelier" ? new Promise(resolve => pending.push(resolve)) : original(name);
      else {
        window.titanClient.rpc = async () => ({ error: { code: "PGRST202" } });
        window.titanClient.from = table => {
          if (table !== "profiles") throw Error("Unexpected table");
          return { select: () => ({ eq: (field, owner) => {
            if (field !== "id" || owner !== window.state.user.id) throw Error("Unexpected profile owner");
            return { maybeSingle: () => new Promise(resolve => pending.push(resolve)) };
          } }) };
        };
        // Drop the already loaded Atelier through the real account lifecycle so fallback is reachable.
        const epoch = window.titanAccountTransition.epoch;
        window.titanAccountTransition = { epoch: epoch + 1, active: true }; dispatchEvent(new CustomEvent("titan:account-changing"));
        window.titanAccountTransition = { epoch: epoch + 1, active: false };
      }
      window.freeReadResponse = response(); dispatchEvent(new Event("online"));
    }, gateway);
    await page.waitForFunction(() => window.readsPending.length === 1);
    await page.evaluate(() => { dispatchEvent(new Event("online")); });
    await page.waitForFunction(() => window.readsPending.length === 2);
    await page.evaluate(() => { window.state.user.is_elite = true; window.readsPending[1](window.freeReadResponse); });
    await page.waitForFunction(() => window.state.user.is_elite === false);
    await page.evaluate(gateway => {
      const stale = structuredClone(window.freeReadResponse);
      if (gateway === "rpc") stale.data.plus.active = true; else stale.data.is_elite = true;
      window.readsPending[0](stale);
    }, gateway);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.state.user.is_elite), false);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("checkout attribution: another account cannot consume the receipt and its owner receives one activation", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await checkoutPage(width);
    await clickCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutOpens[0].customData.user_id), "00000000-0000-4000-8000-000000000123");
    await page.evaluate(() => { window.state.user.id = "00000000-0000-4000-8000-000000000456"; });
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0, "B must not inherit A's checkout");
    assert.ok(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")));
    await page.evaluate(() => { window.state.user.id = "00000000-0000-4000-8000-000000000123"; window.state.user.is_elite = false; });
    await confirmCheckout(page);
    assert.deepEqual(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").map(r => r.user_id)), ["00000000-0000-4000-8000-000000000123"]);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")), null);
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("checkout attribution: a refused metric retains the receipt for a fresh server confirmation", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => { window.checkoutMetricStatus = 500; });
  await confirmCheckout(page);
  assert.ok(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")), "failed delivery remains retryable");
  await page.evaluate(() => { window.checkoutMetricStatus = 201; window.state.user.is_elite = false; });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 2);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.state.user.credits), 2000);
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")), null);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: a session round trip during SDK loading prevents opening the old checkout", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => { window.checkoutSdkGate = new Promise(resolve => { window.finishCheckoutSdk = resolve; }); });
  await page.click("[data-checkout]"); await page.waitForFunction(() => window.checkoutSdkWaiting);
  await page.evaluate(() => {
    const epoch = window.titanAccountTransition?.epoch || 0;
    window.titanAccountTransition = { epoch: epoch + 1, active: true }; dispatchEvent(new CustomEvent("titan:account-changing"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    window.titanAccountTransition = { epoch: epoch + 2, active: false }; dispatchEvent(new CustomEvent("titan:account-changed"));
    window.finishCheckoutSdk();
  });
  assert.equal(await page.evaluate(() => window.checkoutOpening), false);
  assert.equal(await page.evaluate(() => window.checkoutOpens.length), 0);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("titan_checkout_started"))), []);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: a stale server response after A to B to A cannot confirm activation", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    const rpc = window.titanClient.rpc;
    window.titanClient.rpc = name => name === "titan_atelier" ? new Promise(resolve => { window.finishOldAtelier = resolve; }) : rpc(name);
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => !!window.finishOldAtelier);
  await page.evaluate(() => {
    const epoch = window.titanAccountTransition?.epoch || 0;
    window.titanAccountTransition = { epoch: epoch + 1, active: true }; dispatchEvent(new CustomEvent("titan:account-changing"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    window.titanAccountTransition = { epoch: epoch + 2, active: false };
    const response = structuredClone(window.atelierFixture); response.plus.active = true;
    window.finishOldAtelier({ data: response });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.state.user.is_elite), false);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: denied consent keeps functional activation and cannot revive the receipt", async () => {
  const { page, context, errors } = await checkoutPage(360, true, false); await clickCheckout(page); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.checkoutWrites.length), 0);
  await page.evaluate(() => { window.TitanAnalytics.setConsent(true); window.state.user.is_elite = false; });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: legacy, future and expired receipts cannot produce an activation", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => { localStorage.setItem("titan_checkout_started_v1", String(Date.now())); });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  await page.evaluate(() => {
    const owner = window.state.user.id;
    localStorage.setItem("titan_checkout_started_v2:" + owner, JSON.stringify({ v: 2, owner, at: Date.now(), notified: false }));
    window.state.user.is_elite = false;
  });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1, "an owned legacy receipt keeps the functional server confirmation");
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0, "legacy has no reliable preference snapshot");
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v2:" + window.state.user.id)), null);
  for (const at of [Date.now() + 86400000, Date.now() - 4 * 86400000]) {
    await page.evaluate(at => {
      const owner = window.state.user.id;
      localStorage.setItem("titan_checkout_started_v3:" + owner, JSON.stringify({ v: 3, owner, at, notified: false, consent: window.TitanAnalytics.consentSnapshot() }));
      window.state.user.is_elite = false;
    }, at);
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), null);
  }
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: an older ack cannot erase a newer receipt and concurrent refreshes send once", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    window.checkoutMetricGate = new Promise(resolve => { window.finishCheckoutMetric = resolve; });
    window.atelierFixture.plus.active = true; dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.checkoutWrites.some(r => r.event_name === "premium_activated"));
  assert.ok(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), "the receipt remains until the HTTP ack");
  await page.evaluate(() => {
    dispatchEvent(new Event("online"));
    const owner = window.state.user.id;
    window.newReceipt = JSON.stringify({ v: 3, owner, at: Date.now(), notified: false, consent: window.TitanAnalytics.consentSnapshot() });
    localStorage.setItem("titan_checkout_started_v3:" + owner, window.newReceipt);
    window.finishCheckoutMetric();
  });
  await page.evaluate(() => window.checkoutActivation);
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id) === window.newReceipt), true);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("consent replay: refusal then agreement between confirmations cannot revive a failed activation", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await checkoutPage(width);
    await page.evaluate(() => {
      const NativeDate = Date, fixed = Date.now();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
      window.TitanAnalytics.setConsent(true); // All following preference changes have the same timestamp.
    });
    await clickCheckout(page);
    await page.evaluate(() => { window.checkoutMetricStatus = 500; }); await confirmCheckout(page);
    await page.evaluate(() => {
      window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true);
      window.checkoutMetricStatus = 201; window.state.user.is_elite = false;
    });
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1, "only the pre-refusal failed attempt exists");
    assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
    assert.equal(await page.evaluate(() => window.state.user.credits), 2000);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("consent replay: refusal during a failed ack prevents a later retry", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    window.checkoutMetricStatus = 500;
    window.checkoutMetricGate = new Promise(resolve => { window.finishCheckoutMetric = resolve; });
    window.atelierFixture.plus.active = true; dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.checkoutWrites.some(r => r.event_name === "premium_activated"));
  await page.evaluate(() => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); window.finishCheckoutMetric(); });
  await page.evaluate(() => window.checkoutActivation);
  await page.evaluate(() => { window.checkoutMetricStatus = 201; window.state.user.is_elite = false; }); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
  assert.deepEqual(errors, []); await context.close();
});

test("consent replay: a changed preference during SDK loading preserves payment and functional activation only", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => { window.checkoutSdkGate = new Promise(resolve => { window.finishCheckoutSdk = resolve; }); });
  await page.click("[data-checkout]"); await page.waitForFunction(() => window.checkoutSdkWaiting);
  await page.evaluate(() => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); window.finishCheckoutSdk(); });
  assert.equal(await page.evaluate(() => window.checkoutOpening), true);
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutOpens.length), 1);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("consent replay: preference changes on the real profile survive leaving and reopening Atelier", async () => {
  for (const changed of [false, true]) {
    const fixture = await checkoutPage(), { page, context, errors } = fixture; await clickCheckout(page);
    await page.evaluate(() => { window.checkoutMetricStatus = 500; }); await confirmCheckout(page);
    await page.goto(BASE + "/profile", { waitUntil: "load" });
    await page.locator("[data-analytics]").waitFor();
    assert.equal(await page.locator("[data-analytics]").isChecked(), true);
    if (changed) { await page.locator("[data-analytics]").uncheck(); await page.locator("[data-analytics]").check(); }
    await checkoutPage(360, true, null, fixture); await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), changed ? 0 : 1);
    assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("consent replay: refusal in another real tab prevents old conversion while a new checkout remains measurable", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => { window.checkoutMetricStatus = 500; }); await confirmCheckout(page);
  const prefs = await context.newPage(); await prefs.goto(BASE + "/profile", { waitUntil: "load" });
  await prefs.locator("[data-analytics]").uncheck(); await prefs.locator("[data-analytics]").check(); await prefs.close();
  await page.evaluate(() => { window.checkoutMetricStatus = 201; window.state.user.is_elite = false; }); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  // A fresh page removes the old SDK-opening lock without bypassing its production guard.
  await checkoutPage(360, true, null, { page, context, errors }); await clickCheckout(page); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("consent storage: the real profile warns when a refusal cannot be saved", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.goto(BASE + "/profile", { waitUntil: "load" }); await page.locator("[data-analytics]").waitFor();
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
    window.privacyToasts = [];
    const toast = window.titanShell.toast.bind(window.titanShell);
    window.titanShell.toast = options => { window.privacyToasts.push(options); return toast(options); };
  });
  await page.locator("[data-analytics]").uncheck();
  assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
  const notice = await page.evaluate(() => window.privacyToasts.at(-1));
  assert.equal(notice.type, "warn");assert.match(notice.message, /rechargement/);
  assert.doesNotMatch(notice.message, /Plus rien n’est envoyé/);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout confirmation: failed notification persistence still confirms functionally once in the page", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("titan_checkout_started")) throw Error("Synthetic receipt write failure"); return save.call(this, key, value); };
    window.checkoutMetricStatus = 500;
  });
  await confirmCheckout(page); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 2, "unchanged consent permits legitimate failed-ack retries");
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: preference invalidation cannot erase a newer receipt from another tab", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    const key = "titan_checkout_started_v3:" + window.state.user.id;
    const receipt = JSON.parse(localStorage.getItem(key)); receipt.notified = true; localStorage.setItem(key, JSON.stringify(receipt));
    window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true);
    window.newReceipt = JSON.stringify({ v: 3, owner: window.state.user.id, at: Date.now(), notified: false, consent: window.TitanAnalytics.consentSnapshot() });
    const snapshot = window.TitanAnalytics.consentSnapshot;
    window.TitanAnalytics.consentSnapshot = () => { localStorage.setItem(key, window.newReceipt); window.TitanAnalytics.consentSnapshot = snapshot; return snapshot(); };
  });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), await page.evaluate(() => window.newReceipt));
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("consent storage: signup exposes an unsaved choice before automatic navigation", async () => {
  for (const session of [false, true]) {
    const { page, context, errors } = await newPage(); await page.goto(BASE + "/login?mode=signup", { waitUntil: "load" });
    await page.evaluate(session => {
      localStorage.setItem("titan_privacy_v1", JSON.stringify({ analytics: "granted" }));
      const save = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
      const client = window.initTitanSupabaseClient(), user = { id: "00000000-0000-4000-8000-000000000123" };
      client.auth.signUp = async () => ({ data: { user, session: session ? { user, access_token: "fixture-token" } : null }, error: null });
      client.auth.getSession = async () => ({ data: { session: null } });
    }, session);
    await page.fill("[name=name]", "Test consentement"); await page.fill("[name=email]", "fixture@example.test");
    await page.fill("[name=password]", "synthetic-password"); await page.check("[name=terms]"); await page.click(".auth-submit");
    await page.getByRole("alert").filter({ hasText: "rechargement" }).waitFor({ timeout: 3000 });
    assert.match(page.url(), /\/login\?mode=signup$/);assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
    if (session) { await page.locator("#auth a[href='/onboarding']").click(); await page.waitForURL("**/onboarding"); }
    else assert.equal(await page.locator(".auth-sent").count(), 1);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("consent storage: onboarding shows an unsaved choice before continuing", async () => {
  const { page, context, errors } = await newPage();
  await page.addInitScript(() => { localStorage.setItem("titan_privacy_v1", JSON.stringify({ analytics: "granted" })); });
  await page.goto(BASE + "/onboarding?again=1", { waitUntil: "load" });
  await page.locator("[data-next]").click(); await page.locator("[data-next]").click(); await page.locator("[data-analytics]").uncheck();
  await page.locator("[data-next]").click();
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
  });
  await page.locator("[data-finish][href='/aujourdhui']").click();
  await page.getByRole("alert").filter({ hasText: "rechargement" }).waitFor({ timeout: 3000 });
  assert.match(page.url(), /\/onboarding\?again=1$/);assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
  assert.equal(await page.evaluate(() => window.state.user.onboardingComplete), true);
  await page.locator(".ob-go a[href='/aujourdhui']").click(); await page.waitForURL("**/aujourdhui");
  assert.deepEqual(errors, []); await context.close();
});

test("consent storage: an unsaved agreement yields to a refusal in a real second tab", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
    window.TitanAnalytics.setConsent(true);
  });
  await clickCheckout(page);
  const prefs = await context.newPage(); await prefs.goto(BASE + "/profile", { waitUntil: "load" }); await prefs.locator("[data-analytics]").uncheck();
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: a real cross-tab lock protects confirmation from concurrent replacement", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); });
  const writer = await context.newPage(); await writer.goto(BASE + "/legal_privacy", { waitUntil: "load" });
  await writer.evaluate(() => {
    window.writerLock = navigator.locks.request("titan_checkout_receipt:00000000-0000-4000-8000-000000000123", async () => {
      window.writerLocked = true; await new Promise(resolve => { window.releaseWriter = resolve; });
    });
  });
  await writer.waitForFunction(() => window.writerLocked);
  await page.evaluate(() => { window.atelierFixture.plus.active = true; dispatchEvent(new Event("online")); });
  await page.waitForFunction(async () => (await navigator.locks.query()).pending.some(l => l.name === "titan_checkout_receipt:" + window.state.user.id), null, { timeout: 2000 });
  await writer.evaluate(() => {
    const owner = "00000000-0000-4000-8000-000000000123";
    localStorage.setItem("titan_checkout_started_v3:" + owner, JSON.stringify({ v: 3, owner, at: Date.now(), notified: false, consent: localStorage.getItem("titan_privacy_v1") }));
    window.releaseWriter();
  });
  await settleCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1, "the current replacement is measured after the writer releases its lock");
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: opening waits for a real cross-tab receipt writer before changing storage", async () => {
  const { page, context, errors } = await checkoutPage();
  const writer = await context.newPage(); await writer.goto(BASE + "/legal_privacy", { waitUntil: "load" });
  await writer.evaluate(() => {
    window.writerLock = navigator.locks.request("titan_checkout_receipt:00000000-0000-4000-8000-000000000123", async () => {
      window.writerLocked = true; await new Promise(resolve => { window.releaseWriter = resolve; });
    });
  });
  await writer.waitForFunction(() => window.writerLocked); await page.click("[data-checkout]");
  await page.waitForFunction(async () => (await navigator.locks.query()).pending.some(l => l.name === "titan_checkout_receipt:" + window.state.user.id), null, { timeout: 2000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), null);
  await writer.evaluate(() => { window.releaseWriter(); });
  await page.waitForFunction(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id));
  assert.equal(await page.evaluate(() => window.checkoutOpens.length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: browsers without locks keep functional confirmation read-only", async () => {
  for (const existing of [false, true]) {
    const { page, context, errors } = await checkoutPage();
    if (existing) await clickCheckout(page);
    const raw = await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id));
    await page.evaluate(() => { Object.defineProperty(navigator, "locks", { value: undefined, configurable: true }); });
    if (!existing) await clickCheckout(page);
    await confirmCheckout(page); await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
    assert.equal(await page.evaluate(() => window.checkoutOpens.length), 1);
    assert.equal(await page.evaluate(() => window.activationToasts.length), existing ? 1 : 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), raw);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("atelier: Free can buy a formerly exclusive frame permanently at 360 and 1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await atelierPage(width);
    assert.match(await page.locator('[data-buy="cos_frame_aegis"]').innerText(), /Débloquer/);
    assert.match(await page.locator("#collection").innerText(), /1[\s\u202f\u00a0]?400/);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-fair-free-${width}.png`, fullPage: true });
    await page.click('[data-buy="cos_frame_aegis"]');
    assert.match(await page.locator("dialog[open]").innerText(), /gardée dans ta collection|permanent/i);
    await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
    await page.waitForSelector("dialog[open]", { state: "hidden" });
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
    assert.match(await page.locator("#collection").innerText(), /Acquis définitivement/);
    assert.equal(await page.evaluate(() => window.state.user.credits), 600);
    assert.equal(await page.evaluate(() => window.titanShell.look().frame), "frame-aegis", "earned frame reaches the shared shell");
    await page.locator('.asc-avatar[data-frame="frame-aegis"]').first().waitFor({ state: "attached" });
    assert.ok(await page.locator('.asc-avatar[data-frame="frame-aegis"]').count(), "navigation displays the earned frame");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `Atelier overflow at ${width}`);
    assert.deepEqual(errors, []);
    const resolved = await page.evaluate(() => window.atelierFixture);
    await page.goto(BASE + "/profile", { waitUntil: "load" });
    await page.evaluate(async (resolved) => {
      const u = window.state.user;
      u.id = "00000000-0000-4000-8000-000000000123";
      u.is_elite = false;
      // Reconnection restores a raw stored preference containing an old, expired borrowed ambiance.
      u.appearance = { frame: "frame-aegis", map: "map-aurora" };
      delete u.appearanceAccess;
      window.titanClient = { rpc: async (name) => name === "titan_atelier" ? { data: resolved } : { error: { code: "PGRST202" } } };
      await window.titanSyncAppearance();
      window.titanShell.refresh();
      dispatchEvent(new CustomEvent("titan:history-updated"));
    }, resolved);
    await page.waitForSelector('.pf-avatar[data-frame="frame-aegis"]');
    const sportFixture = await seedSports(page);
    await page.getByRole("searchbox", { name: "Rechercher un sport" }).fill(sportFixture.target.label);
    await page.selectOption("#mastery-scope", "favorites");
    await page.waitForSelector("#maitrise .pf-mastery-row");
    assert.equal(await page.locator("#maitrise .pf-mastery-row").count(), 1);
    assert.equal(await page.locator('.pf-avatar[data-frame="frame-aegis"]').count(), 1, "200-sport mastery rerenders keep the acquired frame");
    assert.equal(await page.evaluate(() => window.titanShell.look().map), undefined, "raw expired preference is never reauthorized on navigation");
    assert.equal(await page.evaluate(async (resolved) => {
      let finish;
      window.titanClient.rpc = () => new Promise((resolve) => { finish = resolve; });
      const pending = window.titanSyncAppearance();
      window.state.user.id = "00000000-0000-4000-8000-000000000456";
      window.state.user.appearance = {};
      finish({ data: resolved });
      await pending;
      return window.titanShell.look().frame;
    }, resolved), undefined, "late response from the previous user is ignored");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("atelier: a subscriber can purchase a borrowed piece and keep it when Titan+ ends", async () => {
  const { page, context, errors } = await atelierPage(360, true);
  assert.match(await page.locator("#collection").innerText(), /Accès temporaire TITAN\+/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').evaluate((b) =>
    b.getBoundingClientRect().right <= b.closest(".at-body").getBoundingClientRect().right + 1), true, "purchase control stays inside its card body");
  if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: "/tmp/titan-fair-plus-360.png", fullPage: true });
  await page.click('[data-buy="cos_frame_aegis"]');
  await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
  await page.waitForSelector("dialog[open]", { state: "hidden" });
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.plus.active = false;
    for (const i of d.items) if (!i.permanent) i.owned = false;
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.state.user.is_elite === false);
  assert.match(await page.locator("#collection").innerText(), /Acquis définitivement/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.evaluate(() => window.state.user.appearance.frame), "frame-aegis");
  assert.equal(await page.evaluate(() => window.titanShell.look().frame), "frame-aegis", "permanent access survives expiry on all shell consumers");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier inventory: acquired pieces exclude borrowed access and stay available after removing a style", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await atelierPage(width, true);
    assert.equal(await page.locator('[data-collection="owned"]').count(), 1, "inventory filter is available");
    await page.click('[data-collection="owned"]');
    assert.equal(await page.locator("#collection .at-item").count(), 1, "only the base frame is permanently acquired");
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0, "a borrowed piece is not in the permanent inventory");
    await page.click('[data-collection="all"]');
    await page.click('[data-buy="cos_frame_aegis"]');
    await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
    await page.waitForSelector("dialog[open]", { state: "hidden" });
    await page.click('[data-collection="owned"]');
    assert.equal(await page.locator("#collection .at-item").count(), 2);
    assert.equal(await page.locator('[data-remove="frame"]').count(), 1, "an equipped piece can be removed");
    await page.locator('[data-remove="frame"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.state.user.appearance.frame === "frame-standard");
    assert.equal(await page.locator('[data-wear="cos_frame_aegis"]').count(), 1, "removing does not discard the purchase");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.wear), "cos_frame_aegis", "keyboard focus stays on the removed piece");
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
    assert.equal(await page.evaluate(() => window.state.user.credits), 600, "removing never spends credits");
    assert.equal(await page.evaluate(() => window.titanShell.look().frame), undefined, "the base frame removes the visible decoration");
    await page.waitForFunction(() => !document.querySelector('.asc-avatar[data-frame="frame-aegis"]'));
    assert.equal(await page.locator('.asc-avatar[data-frame="frame-aegis"]').count(), 0);
    assert.equal(await page.evaluate(() => window.atelierCalls.filter((c) => c.name === "titan_purchase_shop_item").length), 1);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.titanShell.look().frame === "frame-aegis");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-inventory-${width}.png`, fullPage: true, animations: "disabled" });
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("atelier inventory: locked filter has a useful empty state and legacy purchases stay acquired", async () => {
  const { page, context, errors } = await atelierPage(360, false, true);
  assert.equal(await page.locator('[data-collection="owned"]').count(), 1);
  await page.click('[data-collection="owned"]');
  assert.equal(await page.locator('[data-wear="cos_frame_neon"]').count(), 1);
  await page.click('[data-collection="locked"]');
  assert.equal(await page.locator("#collection .at-item").count(), 2, "old subscription pieces are still not acquired");
  await page.click('[data-slot="map"][role="tab"]');
  await page.click('[data-collection="owned"]');
  assert.equal(await page.locator("#collection .at-item").count(), 1);
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.items.find((i) => i.id === "cos_map_aurora").owned = true;
    d.items.find((i) => i.id === "cos_map_aurora").unlock = "credits";
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => document.querySelectorAll("#collection .at-item").length === 2);
  await page.click('[data-collection="locked"]');
  assert.equal(await page.locator("#collection .at-item").count(), 0);
  assert.ok(await page.locator('[data-collection-empty]').isVisible());
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier preview: frame, ambiance and card previews do not change balance or equipped appearance", async () => {
  const { page, context, errors } = await atelierPage(360);
  for (const [slot, id, previewSelector] of [["frame", "cos_frame_aegis", '[data-frame="frame-aegis"]'], ["map", "cos_map_aurora", '[data-ambiance="map-aurora"]'], ["card", "cos_card_obsidian", '[data-card="card-obsidian"]']]) {
    await page.click(`[data-slot="${slot}"][role="tab"]`);
    assert.equal(await page.locator(`[data-preview="${id}"]`).count(), 1, "each piece has an explicit preview");
    const before = await page.evaluate(() => ({ credits: window.state.user.credits, appearance: structuredClone(window.state.user.appearance), calls: window.atelierCalls.length }));
    await page.click(`[data-preview="${id}"]`);
    const dialog = page.locator("dialog[open]");
    assert.equal(await dialog.locator(previewSelector).count(), 1);
    assert.equal(await dialog.locator('[data-buy], [data-wear]').count(), 0, "preview cannot silently acquire or equip");
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-preview-${slot}-360.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => ({ credits: window.state.user.credits, appearance: structuredClone(window.state.user.appearance), calls: window.atelierCalls.length })), before);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: an older server shows a catalog update notice without inventing a free price", async () => {
  const { page, context, errors } = await atelierPage(360, false, true);
  assert.match(await page.locator("#atelier").innerText(), /Mise à jour du catalogue en attente/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.locator("[data-goto-plus]").count(), 2);
  const neon = page.locator('article').filter({ has: page.locator('[data-wear="cos_frame_neon"]') });
  assert.match(await neon.innerText(), /Acquis définitivement/, "legacy purchase without new fields stays permanent");
  assert.deepEqual(errors, []);
  await context.close();
});

test("shell: a borrowed cached style expires by date while an earned style stays visible", async () => {
  const { page, context, errors } = await atelierPage(360, true);
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.appearance = { frame: "frame-aegis", map: "map-aurora" };
    d.items.find((i) => i.id === "cos_map_aurora").permanent = true;
    d.plus.ends_at = new Date(Date.now() - 1000).toISOString();
    window.titanApplyAtelierAppearance(d, window.state.user.id);
  });
  assert.equal(await page.evaluate(() => window.titanShell.look().frame), undefined, "stale true flag cannot keep a borrowed style");
  assert.equal(await page.evaluate(() => window.titanShell.look().map), "map-aurora", "date does not remove a permanent acquisition");
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: a delayed response cannot copy the previous user's balance or appearance", async () => {
  const { page, context, errors } = await atelierPage(360);
  assert.equal(await page.evaluate(async () => {
    let finish;
    const previous = structuredClone(window.atelierFixture);
    previous.appearance = { frame: "frame-aegis" };
    window.titanClient.rpc = () => new Promise((resolve) => { finish = resolve; });
    dispatchEvent(new Event("online"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.appearance = {};
    window.state.user.credits = 777;
    finish({ data: previous });
    await new Promise((r) => setTimeout(r, 30));
    return window.state.user.credits === 777 && !window.state.user.appearance.frame;
  }), true, "obsolete response belongs to the previous user");
  assert.deepEqual(errors, []);
  await context.close();
});

async function bootstrapPage(gate = null, fromGuest = false, emptyHistory = false) {
  const fixture = await newPage(360);
  await fixture.page.goto(BASE + "/profile", { waitUntil: "load" });
  await fixture.page.evaluate(({ gate, fromGuest, emptyHistory }) => {
    const a = "00000000-0000-4000-8000-000000000123";
    const b = "00000000-0000-4000-8000-000000000456";
    window.state.user.id = fromGuest ? "guest_bootstrap" : a;
    const f = window.bootstrapFixture = {
      a, b, actor: a, entered: false, heldOnce: false, calls: [],
      profile: { id: a, username: "Compte A", credits: 10, xp: 0, level: 1, friend_code: gate === "friend" ? null : "A-FRIEND", state_version: 1 },
    };
    const step = async (name, value) => {
      f.calls.push({ name, owner: window.state.user.id });
      if (name === gate && !f.heldOnce) {
        f.heldOnce = f.entered = true;
        await new Promise(resolve => { f.release = resolve; });
      }
      return value;
    };
    window.TITAN_DB_STATUS.issues = [];
    window.titanMaybeSubmitCacheReconciliation = undefined;
    window.titanClient = {
      auth: { getSession: () => step("session", { data: { session: { user: { id: f.actor, user_metadata: {} } } } }), onAuthStateChange() {} },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: () => step("profile", { data: gate === "create" ? null : structuredClone(f.profile) }) }),
      rpc: (name) => {
        if (name === "titan_save_profile_state") return step("create", { data: structuredClone(f.profile) });
        if (name === "titan_assign_friend_code") return step("friend", { data: "A-FRIEND" });
        if (name === "titan_atelier") return step("appearance", { data: { owner: f.actor, appearance: {}, items: [], plus: { active: false } } });
        return Promise.resolve({ error: { code: "PGRST202" } });
      },
    };
    window.TitanTraining.paginate = (_client, owner) => {
      // RLS would return no A rows after authentication has moved to B. A request
      // begun before that switch may still complete later with A's own rows.
      const logs = !emptyHistory && owner === f.actor ? [{ id: "A-session", user_id: a, client_event_id: "A-event", sport: "running", category: "endurance", unit: "min", val: 30, date: new Date().toISOString(), details: { duration: 30 }, xp: 0 }] : [];
      return step("history", { logs, total: logs.length });
    };
    Object.assign(window.TitanQueue, {
      migrate: () => step("migrate"), refresh: () => step("refresh", []),
      saveHistory: () => step("saveHistory"), list: () => [],
    });
    // Exercise the real bootstrap while keeping unrelated page-start timers from
    // launching a third synchronization during this deliberately controlled race.
    const sync = window.syncWithSupabase;
    window.syncWithSupabase = () => Promise.resolve();
    f.run = () => sync();
    f.start = () => { f.pending = sync(); };
  }, { gate, fromGuest, emptyHistory });
  return fixture;
}

test("bootstrap: delayed responses never replace another account's profile or history", async () => {
  for (const [gate, emptyHistory] of [...["session", "profile", "create", "friend", "appearance", "history", "migrate", "refresh", "saveHistory"].map(x => [x, false]), ["appearance", true]]) {
    const { page, context, errors } = await bootstrapPage(gate, false, emptyHistory);
    await page.evaluate(() => { window.bootstrapFixture.start(); });
    await page.waitForFunction(() => window.bootstrapFixture.entered);
    const result = await page.evaluate(async () => {
      const f = window.bootstrapFixture;
      f.actor = f.b;
      Object.assign(window.state.user, { id: f.b, name: "Compte B", credits: 777, xp: 123, level: 3 });
      window.state.history = [{ id: "B-session", user_id: f.b, sport: "yoga", unit: "min", val: 20, date: new Date().toISOString(), details: { duration: 20 } }];
      window.state.archivedHistory = [{ id: "B-archive", user_id: f.b }];
      window.state.meta = { profileVersion: 77, historyTotal: 2, owner: f.b };
      window.titanCloudHistoryLoadedAt = 444;
      const expected = structuredClone(window.state);
      const callCount = f.calls.length;
      f.release();
      await f.pending;
      return { expected, actual: window.state, lateCalls: f.calls.slice(callCount), loadedAt: window.titanCloudHistoryLoadedAt, issues: window.TITAN_DB_STATUS.issues };
    });
    assert.deepEqual(result.actual, result.expected, `${gate}: B's identity, balance, history and metadata stay intact`);
    assert.deepEqual(result.lateCalls, [], `${gate}: obsolete bootstrap stops before further account operations`);
    assert.equal(result.loadedAt, 444);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("bootstrap: the normal guest-to-account synchronization still loads confirmed history", async () => {
  const { page, context, errors } = await bootstrapPage(null, true);
  const result = await page.evaluate(async () => {
    window.bootstrapFixture.start();
    await window.bootstrapFixture.pending;
    return { id: window.state.user.id, credits: window.state.user.credits, history: window.state.history, version: window.state.meta.profileVersion, issues: window.TITAN_DB_STATUS.issues };
  });
  assert.equal(result.id, "00000000-0000-4000-8000-000000000123");
  assert.equal(result.credits, 10);
  assert.equal(result.history[0]?.id, "A-session");
  assert.equal(result.history[0]?.syncStatus, "confirmed");
  assert.equal(result.version, 1);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("bootstrap: an older synchronization cannot overwrite a newer one for the same account", async () => {
  const { page, context, errors } = await bootstrapPage("profile");
  await page.evaluate(() => { window.bootstrapFixture.start(); });
  await page.waitForFunction(() => window.bootstrapFixture.entered);
  const result = await page.evaluate(async () => {
    const f = window.bootstrapFixture;
    f.profile = { ...f.profile, username: "Profil récent", credits: 55, state_version: 2 };
    await f.run();
    const expected = structuredClone(window.state);
    const callCount = f.calls.length;
    f.release();
    await f.pending;
    return { expected, actual: window.state, lateCalls: f.calls.slice(callCount), issues: window.TITAN_DB_STATUS.issues };
  });
  assert.equal(result.expected.user.credits, 55);
  assert.deepEqual(result.actual, result.expected, "the newer profile and history win");
  // The successful newer sync also starts independent Auth reads from the page.
  // The older bootstrap already read its session before its held profile request.
  assert.deepEqual(result.lateCalls.filter(call => call.name !== "session"), []);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("app pages fit a 360 px screen without errors", async () => {
  const { page, errors } = await newPage(360);
  for (const path of ["/aujourdhui", "/training", "/journal", "/stats", "/records", "/objectifs", "/prevoir", "/adventure", "/profile", "/social", "/coaching", "/boutique", "/onboarding", "/login"]) {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${path} overflows`);
  }
  assert.deepEqual(errors, []);
});

test("offline: the app shell opens from the service worker cache", async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const own = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
    const page = await context.newPage();
    await page.goto(origin + "/aujourdhui", { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
    await page.reload({ waitUntil: "load" });
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
    await page.waitForFunction(async () => (await (await caches.open("titan-os-v300-ascension")).keys()).length > 50, null, { timeout: 30000 });
    own.kill();
    await new Promise((r) => setTimeout(r, 300));
    await page.goto(origin + "/training", { waitUntil: "load" });
    assert.match(await page.title(), /Séance|séance/);
    await page.goto(origin + "/fonctionnalites", { waitUntil: "load" });
    assert.match(await page.title(), /Hors ligne/);
    await context.close();
  } finally {
    own.kill();
  }
});

// Local fixtures only: no session is written to the backend or persisted in the user's account.
async function seedSports(page, count = 200) {
  await page.waitForFunction(() => window.state?.user && window.TitanProgress && window.TitanSports);
  return page.evaluate((count) => {
    const sports = window.TitanSports.all().slice(0, count);
    window.state.user.favoriteSports = [sports.at(-1).id];
    window.state.history = sports.map((s, i) => ({
      id: `fixture-${i}`, sport: s.id, unit: "min", val: 30, xp: 0,
      date: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      details: { duration: 30 },
    }));
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
    return { count: sports.length, target: sports.at(-1), first: sports[0] };
  }, count);
}

test("records: 200 sports are paginated, searchable and retain their source session", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/records", { waitUntil: "load" });
  const fixture = await seedSports(page);
  assert.equal(fixture.count, 200);
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".rc-sport").count(), 12, "only a bounded page of sports is rendered");
  await page.getByRole("button", { name: "Page suivante" }).click();
  assert.equal(await page.locator(".rc-sport").count(), 12);
  await page.getByRole("searchbox", { name: "Rechercher un sport" }).fill(fixture.target.label);
  await page.waitForTimeout(100);
  assert.ok(await page.locator(".rc-sport").count() <= 12);
  assert.match(await page.locator("#records").innerText(), new RegExp(fixture.target.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.locator(".rc-sport [data-record]").first().click();
  assert.equal(await page.locator('dialog[open] a[href^="/journal?session="]').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("mastery: the 200th sport is reachable, filters survive updates and typing retains focus", async () => {
  const { page, context, errors } = await newPage(360);
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  const fixture = await seedSports(page);
  await page.waitForTimeout(150);
  const search = page.getByRole("searchbox", { name: "Rechercher un sport" });
  assert.equal(await search.count(), 1, "mastery offers a search beyond the original eight rows");
  await search.pressSequentially(fixture.target.label, { delay: 15 });
  assert.equal(await search.inputValue(), fixture.target.label);
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  await page.selectOption("#mastery-scope", "favorites");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("titan:history-updated")));
  await page.waitForTimeout(100);
  assert.equal(await page.inputValue("#mastery-scope"), "favorites");
  assert.equal(await page.locator("#maitrise .pf-mastery-row").count(), 1);
  assert.ok((await page.locator("#maitrise").innerText()).includes(fixture.target.label));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("navigation: empty searches, no-data favorites, and small accounts remain usable", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await seedSports(page, 2);
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".rc-sport").count(), 2);
  const search = page.getByRole("searchbox", { name: "Rechercher un sport" });
  await search.fill("<img src=x onerror=alert(1)>");
  assert.equal(await page.locator(".rc-sport").count(), 0);
  assert.equal(await page.locator("[data-nav-empty]").count(), 1);
  assert.equal(await page.locator("#records img").count(), 0);
  await search.fill("");
  await page.evaluate(() => {
    window.state.user.favoriteSports = ["yoga"];
    window.state.history = [];
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  });
  await page.waitForTimeout(100);
  await page.selectOption("#records-scope", "favorites");
  await page.getByRole("checkbox", { name: "Masquer les sports sans données" }).uncheck();
  assert.equal(await page.locator(".rc-sport").count(), 1);
  assert.ok((await page.locator(".rc-sport").innerText()).includes("Yoga"));
  assert.equal(await page.locator(".rc-sport [data-record]").count(), 0, "no fictitious record for an unpractised sport");
  assert.deepEqual(errors, []);
  await context.close();
});

// Published CMS content and analytics use the real page, entry point and SDK; only HTTP/auth boundaries are synthetic.
async function publicContentPage({consent="granted",content="published",blocked=false,missingCollector=false}={}) {
  const fixture=await newPage(),{page}=fixture;
  await page.addInitScript(({consent,content,blocked})=>{
    if(consent) localStorage.setItem("titan_privacy_v1",JSON.stringify({analytics:consent}));
    else localStorage.removeItem("titan_privacy_v1");
    window.publicWrites=[];window.publicQueries=[];
    if(blocked) window.publicMetricGate=new Promise(resolve=>{window.releasePublicMetric=resolve;});
    const native=window.fetch;
    window.fetch=async(input,init)=>{
      const url=new URL(input,location.origin);
      if(url.pathname==="/rest/v1/dynamic_pages") {
        window.publicQueries.push(url.search);
        const rows=content==="missing"?[]:[{id:"00000000-0000-4000-8000-000000000999",slug:"fixture-public",status:"published",title:"Contenu public de test",meta_title:"Contenu public de test",meta_description:"Un contenu publié de test",content:"<p>Un contenu publié lisible.</p>",cover_image_url:null,is_indexable:false}];
        return new Response(JSON.stringify(content==="error"?{message:"Synthetic server failure"}:rows),{status:content==="error"?500:200,headers:{"content-type":"application/json"}});
      }
      if(url.pathname==="/rest/v1/analytics_events") {
        window.publicWrites.push({row:JSON.parse(init.body),authorization:new Headers(init.headers).get("Authorization")});
        if(window.publicMetricGate) await window.publicMetricGate;
        return new Response(null,{status:blocked?500:201});
      }
      return native(input,init);
    };
  },{consent,content,blocked});
  await page.route("**/js/config.js?*",r=>r.fulfill({contentType:"text/javascript",body:readFileSync(ROOT+"/js/config.js","utf8")+`\nwindow.initTitanSupabaseClient().auth.getSession=async()=>({data:{session:{user:{id:"00000000-0000-4000-8000-000000000123"},access_token:"fixture-public-token"}},error:null});`}));
  await page.route("**/js/content.js?*",r=>r.fulfill({contentType:"text/javascript",body:readFileSync(ROOT+"/js/content.js","utf8")+`\nconst publicTrack=window.titanTrackEvent;window.titanTrackEvent=(...args)=>window.publicTracked=publicTrack(...args);`}));
  if(missingCollector) await page.route("**/js/app/analytics.js?*",r=>r.abort("failed"));
  await page.goto(BASE+"/dynamic-page?slug=fixture-public&utm_source=private-fixture",{waitUntil:"load",referer:BASE+"/private?notes=private-fixture"});
  await page.locator("#dynamic-page h1").filter({hasText:content==="published"?"Contenu public de test":"Page introuvable"}).waitFor();
  return fixture;
}
test("public page analytics: refusal suppresses tracking while published content remains readable",async()=>{
  const {page,context,errors}=await publicContentPage({consent:"denied"});
  assert.equal(await page.evaluate(()=>window.publicTracked),false);assert.deepEqual(await page.evaluate(()=>window.publicWrites),[]);
  assert.match(await page.locator(".dynamic-content").innerText(),/publié lisible/);
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: an unanswered choice never carries account or URL attribution",async()=>{
  const {page,context,errors}=await publicContentPage({consent:null});
  assert.equal(await page.evaluate(()=>window.publicTracked),true);
  assert.deepEqual(await page.evaluate(()=>window.publicWrites),[{row:{event_name:"dynamic_page_opened",user_id:null,page:"/dynamic-page",source:null,referrer:null,metadata:{consent:"anonymous",v:300}},authorization:`Bearer ${await page.evaluate(()=>window.TITAN_SUPABASE_ANON_KEY)}`}]);
  const query=await page.evaluate(()=>window.publicQueries[0]);assert.match(query,/slug=eq.fixture-public/);assert.match(query,/status=eq.published/);
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: agreed published openings keep the stable name and a minimal payload",async()=>{
  const {page,context,errors}=await publicContentPage();assert.equal(await page.evaluate(()=>window.publicTracked),true);
  assert.deepEqual(await page.evaluate(()=>window.publicWrites),[{row:{event_name:"dynamic_page_opened",user_id:"00000000-0000-4000-8000-000000000123",page:"/dynamic-page",source:null,referrer:null,metadata:{consent:"granted",v:300}},authorization:"Bearer fixture-public-token"}]);
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: unavailable or missing CMS content creates no opening",async()=>{
  for(const content of ["missing","error"]){
    const {page,context,errors}=await publicContentPage({content});
    assert.equal(await page.evaluate(()=>window.publicTracked),undefined);assert.deepEqual(await page.evaluate(()=>window.publicWrites),[]);
    assert.equal(await page.locator(".dynamic-back[href='/']").isVisible(),true);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test("public page analytics: an unresolved or failed measure never blocks the rendered page",async()=>{
  const {page,context,errors}=await publicContentPage({blocked:true});
  await page.waitForFunction(()=>window.publicWrites.length===1);
  assert.equal(await page.locator("#dynamic-page h1").textContent(),"Contenu public de test");
  await page.evaluate(()=>window.releasePublicMetric());assert.equal(await page.evaluate(()=>window.publicTracked),false);
  await page.locator(".dynamic-back").click();await page.waitForURL(BASE+"/");
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: home navigation succeeds while the measure is still unresolved",async()=>{
  const {page,context,errors}=await publicContentPage({blocked:true});
  await page.waitForFunction(()=>window.publicWrites.length===1);
  await page.evaluate(()=>{window.publicTracked.then(()=>{window.publicMetricSettled=true;});});
  assert.equal(await page.evaluate(()=>window.publicMetricSettled===true),false);
  // Leave the real metric promise unresolved: navigation must not wait for its HTTP result.
  await page.locator(".dynamic-back").click({timeout:5000});await page.waitForURL(BASE+"/");
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: a missing collector leaves the page usable without unsafe fallback",async()=>{
  const {page,context,errors}=await publicContentPage({missingCollector:true});
  assert.equal(await page.evaluate(()=>window.publicTracked),false);assert.deepEqual(await page.evaluate(()=>window.publicWrites),[]);
  assert.equal(await page.locator("#dynamic-page h1").textContent(),"Contenu public de test");
  assert.deepEqual(errors,[]);await context.close();
});

test("installed PWA: navigation and cosmetic resources bypass the previous cache on the first visit", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/aujourdhui", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const staleScripts = await Promise.all([["/js/state.js", "state"], ["/js/app/shell.js", "shell"], ["/js/app/atelier.js", "atelier"], ["/js/main.js", "main"], ["/js/app/profil.js", "profil"], ["/js/app/auth.js", "auth"], ["/js/app/onboarding.js", "onboarding"], ["/js/content.js", "content"]]
    .map(async ([path, marker]) => [path, marker, await (await fetch(BASE + path)).text()]));
  await page.evaluate(async (staleScripts) => {
    const cache = await caches.open("titan-os-v300-ascension");
    await cache.put("/css/ascension-app.css?v=300.0", new Response(".rc-sport { display: block; }", { headers: { "content-type": "text/css" } }));
    for (const version of ['300.0','300.1','300.2','300.3']) {
      await cache.put(`/js/app/analytics.js?v=${version}`, new Response('window.TitanAnalytics = {EVENTS: new Set(["first_session"]), track: async () => false};', { headers: { "content-type": "text/javascript" } }));
    }
    // Keep valid script bodies and mark the stale generation. Cache-first must not serve them
    // to the new page even when a background fetch will replace them for a later visit.
    for (const [path, marker, body] of staleScripts) {
      const versions = marker === "main" || marker === "profil" || marker === "auth" ? ["300.0", "300.1"] : marker === "atelier" ? ["300.0", "300.4", "300.5"] : ["300.0"];
      for (const version of versions) await cache.put(path + "?v=" + version, new Response(body + `\nwindow.titanPreviousResource ??= {}; window.titanPreviousResource.${marker} = true;`, { headers: { "content-type": "text/javascript" } }));
    }
  }, staleScripts);
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await page.waitForSelector(".sn-selects");
  assert.equal(await page.locator(".sn-selects").evaluate(el => getComputedStyle(el).display), "grid");
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_searched")), true);
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_filtered")), true);
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.state)), false, "first navigation loads the new appearance resolver");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.shell)), false, "first navigation loads the new shared rendering guard");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.main)), false, "first navigation loads the new checkout guard");
  assert.equal(await page.evaluate(() => typeof window.titanSyncAppearance), "function");
  await page.goto(BASE + "/boutique", { waitUntil: "load" });
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.atelier)), false, "first Atelier visit loads permanent-acquisition controls");
  for (const [path, marker] of [["/profile", "profil"], ["/login", "auth"], ["/onboarding?again=1", "onboarding"]]) {
    await page.goto(BASE + path, { waitUntil: "load" });
    assert.equal(await page.evaluate(marker => Boolean(window.titanPreviousResource?.[marker]), marker), false, "first visit loads the updated consent failure notice");
  }
  await page.goto(BASE + "/dynamic-page?slug=fixture-unavailable", { waitUntil: "load" });
  await page.getByRole("heading", { name: "Page introuvable" }).waitFor();
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("dynamic_page_opened")), true, "first public visit loads the shared collector");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.content)), false, "first public visit loads the guarded legacy entry point");
  await context.close();
});
