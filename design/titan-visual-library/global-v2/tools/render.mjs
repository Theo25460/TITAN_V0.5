
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const sharp=require("./.deps/node_modules/sharp");
const base=path.resolve(import.meta.dirname,".."), repo=path.resolve(base,"../../..");
const masters=path.join(base,"proposed/masters"), exports=path.join(base,"proposed/exports"), preview=path.join(base,"preview");
const registryPath=path.join(base,"registry/assets.json"), registry=JSON.parse(fs.readFileSync(registryPath,"utf8"));
const issues=[], files=[], counts={vectors:0,remasters:0,png:0,webp:0,sheets:0};
const mkdir=p=>fs.mkdirSync(path.dirname(p),{recursive:true});
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const rel=p=>path.relative(repo,p).split(path.sep).join("/");
const xml=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const names={ranks:"Grades", "level-tiers":"Paliers", "chapter-beacons":"Balises", rewards:"Recompenses",ui:"Etats"};
function upsert(x){const i=registry.assets.findIndex(a=>a.id===x.id&&a.family===x.family); if(i>=0)registry.assets[i]={...registry.assets[i],...x};else registry.assets.push(x);}
async function check(p,alpha=false){if(!fs.existsSync(p)){issues.push("missing "+rel(p));return null;}const m=await sharp(p).metadata();if(!m.width||!m.height)issues.push("dimensions "+rel(p));if(alpha&&!m.hasAlpha)issues.push("missing alpha "+rel(p));files.push({path:rel(p),bytes:fs.statSync(p).size,width:m.width,height:m.height,alpha:m.hasAlpha,sha256:sha(p)});return m;}
function listSvgs(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?listSvgs(path.join(dir,x.name)):x.name.endsWith(".svg")?[path.join(dir,x.name)]:[]);}
for(const src of listSvgs(masters)){
 const sub=path.relative(masters,src).slice(0,-4);
 const out=path.join(exports,sub), png=out+"-512.png",web=out+"-256.webp",small=out+"-96.webp";
 for(const p of [png,web,small])mkdir(p);
 await sharp(src).png({compressionLevel:9}).toFile(png);
 await sharp(src).resize(256,256,{fit:"contain"}).webp({quality:80,alphaQuality:92,effort:5}).toFile(web);
 await sharp(src).resize(96,96,{fit:"contain"}).webp({quality:77,alphaQuality:90,effort:5}).toFile(small);
 await check(png,true); await check(web,true); await check(small,true);
 const old=registry.assets.find(x=>x.master===rel(src));
 if(!old){issues.push("master not registered: "+rel(src));continue;}
 upsert({...old,status:"proposed",decision:"approval_required",derived:[rel(png),rel(web),rel(small)],source_sha256:sha(src),sha256:Object.fromEntries([png,web,small].map(p=>[rel(p),sha(p)])),presence:true});
 counts.vectors++;counts.png++;counts.webp+=2;
}
const oldPhotos=[
["valley","world","assets/renaissance/valley.webp","wide"],
["archipelago","world","assets/renaissance/archipelago.webp","wide"],
["forge","world","assets/renaissance/forge.webp","wide"],
["aurora","world","assets/renaissance/aurora.webp","wide"],
["guardian-aube","guardian","assets/renaissance/guardian-aube.webp","square"],
["guardian-marees","guardian","assets/renaissance/guardian-marees.webp","square"],
["guardian-forge","guardian","assets/renaissance/guardian-forge.webp","square"],
["guardian-aurores","guardian","assets/renaissance/guardian-aurores.webp","square"],
["scout","avatar","assets/renaissance/scout.webp","square"],
["ranger","avatar","assets/renaissance/ranger.webp","square"],
["keeper","avatar","assets/renaissance/keeper.webp","square"],
["artisan","avatar","assets/renaissance/artisan.webp","square"],
["navigator","avatar","assets/renaissance/navigator.webp","square"],
["sentinel","avatar","assets/renaissance/sentinel.webp","square"],
["editorial-hero","editorial","image/editorial/hero.webp","wide"]
];
for(const [id,family,srcRel,shape] of oldPhotos){
 const src=path.join(repo,srcRel);
 if(!fs.existsSync(src)){issues.push("source absent: "+srcRel);continue;}
 const p=path.join(masters,"renaissance",id+".png"), w=path.join(exports,"renaissance",id+"-web.webp"),m=path.join(exports,"renaissance",id+"-android.webp");
 for(const f of [p,w,m])mkdir(f);
 const original=await sharp(src).metadata();
 await sharp(src).modulate({brightness:.96,saturation:.79}).sharpen({sigma:.65,m1:.4,m2:2,x1:2,y2:7,y3:12}).png({compressionLevel:9}).toFile(p);
 await sharp(p).resize({width:shape==="wide"?1200:512,withoutEnlargement:true}).webp({quality:80,effort:5}).toFile(w);
 await sharp(p).resize({width:shape==="wide"?480:256,withoutEnlargement:true}).webp({quality:76,effort:5}).toFile(m);
 const mm=await check(p);await check(w);await check(m);
 if(mm.width>original.width||mm.height>original.height)issues.push("upscaled "+id);
 upsert({id,family,priority:"P1",name:id,usage:family==="world"?"Renaissance / aventure":family==="avatar"?"Avatar Renaissance":family==="guardian"?"Gardien Renaissance":"Accueil / hero",
 master:rel(p),source_original:srcRel,source_sha256:sha(src),derived:[rel(w),rel(m)],sha256:Object.fromEntries([p,w,m].map(f=>[rel(f),sha(f)])),status:"proposed",decision:"approval_required",presence:true,version:"v2-remaster",technique:"Subtle non-destructive color and contrast remaster of September 2026 project artwork, not a newly generated scene",rights:"Existing TITAN ImageGen originals per RENAISSANCE_ART.json"});
 counts.remasters++;counts.png++;counts.webp+=2;
}
const groups=[
["ranks","Grades TITAN",registry.assets.filter(a=>a.family==="rank"&&a.status==="proposed"),4,180,180],
["tiers","Paliers intermediaires",registry.assets.filter(a=>a.family==="level-tier"&&a.status==="proposed"),5,150,150],
["beacons","Balises de chapitres",registry.assets.filter(a=>a.family==="chapter-beacon"&&a.status==="proposed"),4,180,180],
["rewards","Recompenses et records",registry.assets.filter(a=>a.family==="reward"&&a.status==="proposed"),4,180,180],
["reward-states","Etats des recompenses",registry.assets.filter(a=>a.family==="reward-state"&&a.status==="proposed"),5,150,150],
["ui","Etats et modules",registry.assets.filter(a=>a.family==="ui-illustration"&&a.status==="proposed"),4,180,180],
["worlds","Mondes Renaissance · remasters",registry.assets.filter(a=>a.family==="world"&&a.status==="proposed"),2,440,260],
["characters","Gardiens et avatars · remasters",registry.assets.filter(a=>["guardian","avatar"].includes(a.family)&&a.status==="proposed"),5,160,160],
["hero","Hero · remaster",registry.assets.filter(a=>a.family==="editorial"&&a.status==="proposed"),1,580,320]
];
const gallery=["# TITAN — Galerie globale v2","","**PROPOSED — approbation requise. Aucun asset integre au code ni deploye.**","","Originals vectoriels: "+counts.vectors+" | Retouches des visuels existants: "+counts.remasters+" | PNG: "+counts.png+" | WebP: "+counts.webp,""];
for(const [key,label,items,columns,w,h] of groups){
 if(!items.length)continue;const cw=w+24,ch=h+53,rows=Math.ceil(items.length/columns),width=columns*cw,height=rows*ch+60;
 const overlays=[];let n=0;
 for(const a of items){
  const ix=n%columns,iy=Math.floor(n/columns),x=ix*cw+12,y=iy*ch+58;n++;
  const f=path.join(repo,a.master);
  if(!fs.existsSync(f)){issues.push("thumbnail source absent "+a.id);continue;}
  overlays.push({input:await sharp(f).resize(w,h,{fit:"contain",background:"#0e141a"}).png().toBuffer(),left:x,top:y});
  const cap=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+cw+'" height="48"><text x="4" y="17" fill="#e8edf0" font-size="15" font-family="Arial">'+xml((a.name||a.id).slice(0,28))+'</text><text x="4" y="35" fill="#83bac3" font-size="12" font-family="Arial">'+xml(a.id)+'</text></svg>');
  overlays.push({input:cap,left:x,top:y+h});
 }
 const title=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="55"><text x="19" y="35" fill="#e8eef1" font-size="26" font-family="Arial" font-weight="bold">'+xml(label)+'</text></svg>');
 overlays.unshift({input:title,left:0,top:0});
 const out=path.join(preview,"contact-"+key+".webp");mkdir(out);
 await sharp({create:{width,height,channels:4,background:"#05070aff"}}).composite(overlays).webp({quality:78,effort:5}).toFile(out);
 await check(out);counts.sheets++;
 gallery.push("## "+label,"","![Contact sheet "+key+"](./contact-"+key+".webp)","");
 for(const a of items){gallery.push("- ["+a.id+"](../"+a.master.split("global-v2/")[1]+") — "+(a.name||a.usage)+" — **proposed** — "+(a.derived||[]).map(p=>"[export](../"+p.split("global-v2/")[1]+")").join(" "));}
 gallery.push("");
}
gallery.push("## Portee et limites","","Les retouches Renaissance sont des retraitements des images deja presentes, et NON de nouvelles scenes originales.","Les changements restent exclusivement dans le dossier de propositions; le code Web/Android, les forfaits, logos et pictogrammes sportifs ne sont pas modifies.","Les validations automatiques ne prouvent pas la qualite esthetique ni la visualisation sur un vrai telephone.");
mkdir(path.join(preview,"GALLERY.md"));fs.writeFileSync(path.join(preview,"GALLERY.md"),gallery.join("\n")+"\n");
registry.updated_at=new Date().toISOString();registry.proposals={new_vector_masters:counts.vectors,photo_remasters:counts.remasters,png:counts.png,webp:counts.webp,contact_sheets:counts.sheets};
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+"\n");
const hashes=new Map(), duplicates=[];
for(const a of registry.assets.filter(x=>x.status==="proposed"&&x.source_sha256)){
 const prev=hashes.get(a.source_sha256);if(prev&&prev!==a.id)duplicates.push([prev,a.id]);else hashes.set(a.source_sha256,a.id);
}
fs.writeFileSync(path.join(preview,"QA-REPORT.json"),JSON.stringify({generated_at:new Date().toISOString(),counts,issues,duplicate_source_pairs:duplicates,files,notes:["Static dimension and alpha checks only","No visual or real device test; review required","15 remasters retain original subjects rather than new ImageGen creations"],protected_production_paths_unchanged:true},null,2)+"\n");
console.log(JSON.stringify({counts,issues,duplicate_source_pairs:duplicates},null,2));
if(issues.length)process.exitCode=1;
