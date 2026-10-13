// Read-only inventory of the built end-user navigation. No product action or remote data.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const sourceRef = '0a1feec31867c7f1506cdf1f27498fb5331fe8f4';
const output = resolve(ROOT, process.argv[2] || 'docs/CDC_WEB_NAVIGATION_AUDIT_EVIDENCE_2026-10-13.json');
const captures = '/tmp/titan-navigation-audit'; mkdirSync(captures, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const files = readdirSync(resolve(ROOT, 'dist')).filter(f => f.endsWith('.html')).sort();
const excluded = { 'admin.html': 'Console opérateur, hors navigation utilisateur', 'googleb8fedd43e28cf7d4.html': 'Fichier de vérification, sans interface' };
function scripts(directory) {
  return readdirSync(resolve(ROOT,directory),{withFileTypes:true}).flatMap(e=>{
    if(e.isDirectory())return e.name==='vendor'?[]:scripts(directory+'/'+e.name);
    return e.name.endsWith('.js')&&directory+'/'+e.name!=='js/admin.js'?[directory+'/'+e.name]:[];
  });
}
const sourceFiles = [...files,...scripts('js'),...readdirSync(resolve(ROOT,'css')).filter(f=>f.endsWith('.css')).map(f=>'css/'+f)].sort();
const sourceMarkers = [], sourceHashes = {};
for (const file of sourceFiles) {
  const data=readFileSync(resolve(ROOT,file),'utf8');
  assert.equal(data,execFileSync('git',['show',sourceRef+':'+file],{cwd:ROOT,encoding:'utf8'}), 'Product source differs: '+file);
  assert.equal(data,readFileSync(resolve(ROOT,'dist',file),'utf8'),'Built source differs: '+file);
  sourceHashes[file]=hash(data);
  if(file in excluded) continue;
  data.split('\n').forEach((line,i)=>{
    if(/<nav\b|role=["'](?:tab|tablist)|data-subnav|\b(?:TERRITORIES|SECONDARY|SUBNAV|MORE_HINTS|SLOTS|SECTIONS)\s*=/.test(line))sourceMarkers.push({file,line:i+1});
  });
}
const port=await new Promise(ok=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>ok(p));});});
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
let browser;
const surfaces={},controls={},pages=[];
const referenceSurface=surface=>{
  const shape={name:surface.name,class:surface.class,controls:surface.controls.map(({selected,visible,...rest})=>rest)};
  const id=hash(JSON.stringify(shape)).slice(0,16); surfaces[id]=shape;
  return {id,visible:surface.visible,horizontalScroll:surface.horizontalScroll,selected:surface.controls.flatMap((c,i)=>c.selected?[i]:[])};
};
try {
  for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
  for(const width of [360,1280]) {
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.route(/^https?:\/\//,r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('internetdisconnected'));
    await context.addInitScript(()=>localStorage.setItem('titan_privacy_v1',JSON.stringify({analytics:'denied'})));
    const page=await context.newPage();let pageErrors=0;page.on('pageerror',()=>pageErrors++);
    async function snapshot(file,variant='discovery') {
      const data=await page.evaluate(()=>{
        const visible=e=>!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
        const text=e=>(e.textContent||'').replace(/\s+/g,' ').trim();
        const destination=e=>{const h=e.getAttribute('href');if(!h)return null;try{const u=new URL(h,location.href);return u.origin===location.origin?u.pathname+u.hash:'external';}catch{return 'invalid';}};
        const control=e=>({label:e.getAttribute('aria-label')||text(e),text:text(e),role:e.getAttribute('role')||e.tagName.toLowerCase(),destination:destination(e),selected:e.getAttribute('aria-current')==='page'||e.getAttribute('aria-selected')==='true'||e.getAttribute('aria-pressed')==='true',visible:visible(e)});
        return {
          path:location.pathname,territory:document.body.dataset.territory||null,title:document.title,
          headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(text),
          overflow:document.documentElement.scrollWidth>innerWidth,
          surfaces:[...document.querySelectorAll('nav,[role="tablist"]')].map(n=>({name:n.getAttribute('aria-label')||'',class:n.className,visible:visible(n),horizontalScroll:n.scrollWidth>n.clientWidth&&/auto|scroll/.test(getComputedStyle(n).overflowX),controls:[...n.querySelectorAll('a,button')].map(control)})),
          pageControls:[...document.querySelectorAll('main a,main button')].filter(visible).map(e=>({...control(e),markers:Object.keys(e.dataset).sort()})),
          missingLocalAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(visible).filter(e=>e.hash.length>1&&!document.getElementById(decodeURIComponent(e.hash.slice(1)))).map(e=>e.hash),
          primary:[...document.querySelectorAll('.asc-tabbar a')].map(e=>e.getAttribute('href')),
          rail:[...document.querySelectorAll('.asc-rail-link')].map(e=>({label:text(e),href:e.getAttribute('href')})),
        };
      });
      if(data.territory){assert.deepEqual(data.primary,['/aujourdhui','/stats','/training','/adventure','/profile']);assert.equal(data.rail.length,9);}
      const pageRecord={file,width,variant,path:data.path,territory:data.territory,title:data.title,headings:data.headings,overflow:data.overflow,pageErrorCount:pageErrors,
        surfaces:data.surfaces.map(referenceSurface),missingLocalAnchors:[...new Set(data.missingLocalAnchors)],controls:[]};
      for(const c of data.pageControls){const id=hash(JSON.stringify(c)).slice(0,16);controls[id]=c;pageRecord.controls.push(id);}
      pages.push(pageRecord);
      return data;
    }
    for(const file of files.filter(f=>!(f in excluded))) {
      pageErrors=0;const route=file==='index.html'?'/':'/'+file.slice(0,-5);
      const response=await page.goto(origin+route,{waitUntil:'load'});
      if(readFileSync(resolve(ROOT,file),'utf8').includes('data-territory='))await page.locator('.asc-tabbar').waitFor({state:'attached'});
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
      const data=await snapshot(file);pages.at(-1).httpStatus=response.status();
      const more=page.locator('[data-shell-more]');
      if(width===360&&await more.isVisible()) {
        await more.click();const dialog=page.locator('dialog.asc-sheet[open]');await dialog.waitFor();
        const extra=await dialog.locator('nav a').evaluateAll(es=>es.map(e=>({label:e.querySelector('.asc-row-title')?.textContent,hint:e.querySelector('.asc-row-sub')?.textContent,href:e.getAttribute('href'),current:e.getAttribute('aria-current')})));
        assert.equal(extra.length,4);assert.ok(extra.every(e=>e.hint));pages.at(-1).more=extra;
        await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
      }
      const menu=page.locator('details.pub-menu');
      if(width===360&&await menu.isVisible()){await menu.locator('summary').click();await snapshot(file,'public-menu-open');await menu.locator('summary').click();}
      if(data.territory)await page.screenshot({path:`${captures}/${file.slice(0,-5)}-${width}.png`,fullPage:true});
      process.stdout.write(`audit ${width} ${route}\n`);
    }
    // Conditional navigation: synthetic account only, no successful remote reads or mutations.
    for(const route of ['/profile','/coaching','/social','/boutique']) {
      pageErrors=0;await page.goto(origin+route,{waitUntil:'load'});await page.locator('.asc-tabbar').waitFor({state:'attached'});
      await page.evaluate(()=>{
        const id='00000000-0000-4000-8000-000000000050';window.state.user={...window.state.user,id,name:'Audit synthétique',is_elite:false};
        const client={auth:{getSession:async()=>({data:{session:{user:{id},access_token:'synthetic-audit-navigation-token'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc(name){
          const data=name==='titan_social_overview'?{me:{id,findable:false},friends:[],requests_in:[],requests_out:[],moments:[],challenges:[],expedition:null,guild:null}
            :name==='titan_atelier'?{owner:id,credits:0,week_credits:0,appearance:{},items:[],plus:{active:false}}:null;
          const result=data?{data}:{error:{code:'PGRST202',message:'Missing fixture endpoint'}};const query={setHeader(){return query;},then(yes,no){return Promise.resolve(result).then(yes,no);}};return query;
        }};
        window.titanClient=client;window.titanAccountTransition={active:false,epoch:(window.titanAccountTransition?.epoch||0)+1};
        window.dispatchEvent(new CustomEvent('titan:account-changed'));window.dispatchEvent(new CustomEvent('titan:history-updated'));
        // Coaching's already-mounted view reloads on online/visibility, not on history-updated.
        window.dispatchEvent(new Event('online'));
      });
      if(route==='/coaching')await page.locator('[role="tablist"]').waitFor();
      if(route==='/social')await page.locator('.cm-shortcuts').waitFor();
      if(route==='/profile')await page.locator('.pf-jump a[href="#public"]').waitFor();
      if(route==='/boutique')await page.locator('[role="tablist"]').waitFor();
      await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
      await snapshot(route.slice(1)+'.html',route==='/boutique'?'synthetic-member-empty-catalog':'synthetic-member-server-unavailable');
      if(route==='/coaching'||route==='/boutique') {
        const tabs=page.locator('[role="tablist"] [role="tab"]');await tabs.first().focus();
        const before=await tabs.first().textContent();await page.keyboard.press('ArrowRight');
        pages.at(-1).keyboard={key:'ArrowRight',before:before.trim(),after:await page.evaluate(()=>document.activeElement?.textContent?.trim()||''),focusStayedOnFirst:await tabs.first().evaluate(e=>e===document.activeElement)};
      }
      if(route==='/coaching'){await page.locator('[data-mode="coach"]').click();await page.locator('[data-mode="coach"][aria-selected="true"]').waitFor();await snapshot('coaching.html','synthetic-coach-server-unavailable');}
      await page.screenshot({path:`${captures}/${route.slice(1)}-member-${width}.png`,fullPage:true});
    }
    await context.close();
  }
  const paths=[...new Set([...Object.values(controls),...Object.values(surfaces).flatMap(s=>s.controls)].map(c=>c.destination).filter(d=>d&&d!=='external'&&d!=='invalid').map(d=>d.split('#')[0]))].sort();
  const destinations=[];for(const path of paths){
    const builtFile=path==='/'?'index.html':path.replace(/^\//,'')+'.html';
    assert.ok(files.includes(builtFile)&&existsSync(resolve(ROOT,'dist',builtFile)), 'Missing built destination: '+path);
    // This server falls back to index/200; file existence is checked independently above.
    const response=await fetch(origin+path,{method:'HEAD'});destinations.push({path,builtFile,status:response.status});
  }
  assert.ok(destinations.every(d=>d.status<400),'A local navigation destination has no built page');
  const evidence={schema:1,audited_commit:sourceRef,scope:'End-user web/PWA navigation; discovery and stated synthetic variants; no real account/server/Android execution',browser:{engine:'Chromium',widths:[360,1280],reducedMotion:'reduce',serviceWorkers:'block',externalNetwork:'blocked'},sourceHashes,sourceMarkers,excluded,surfaces,controls,pages,destinations};
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({pages:files.length,endUserPages:files.length-Object.keys(excluded).length,observations:pages.length,surfaces:Object.keys(surfaces).length,controls:Object.keys(controls).length,overflow:pages.filter(p=>p.overflow).map(p=>({file:p.file,width:p.width,variant:p.variant})),pageErrors:pages.filter(p=>p.pageErrorCount).map(p=>({file:p.file,width:p.width,count:p.pageErrorCount})),missingAnchors:pages.filter(p=>p.missingLocalAnchors.length).map(p=>({file:p.file,width:p.width,anchors:p.missingLocalAnchors}))}));
} finally {await browser?.close();server.kill();}
