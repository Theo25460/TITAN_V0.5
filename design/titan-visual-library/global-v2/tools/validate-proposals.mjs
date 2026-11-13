import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const sharp=require("./.deps/node_modules/sharp");
const root=path.resolve(import.meta.dirname,"..");
const repo=path.resolve(root,"../../..");
const registry=JSON.parse(fs.readFileSync(path.join(root,"registry/assets.json"),"utf8"));
const qaPath=path.join(root,"preview/QA-REPORT.json"), report=JSON.parse(fs.readFileSync(qaPath,"utf8"));
const failures=[], warnings=[], fingerprint=[];
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const rel=p=>path.relative(repo,p).replaceAll(path.sep,"/");
let verified=0;
for(const item of registry.assets){
 if(item.status!=="proposed" || item.decision!=="approval_required")failures.push("Unauthorized state: "+item.id);
 if(!item.master) {failures.push("Missing master reference: "+item.id);continue;}
 const master=path.join(repo,item.master);
 if(!fs.existsSync(master)){failures.push("Missing master: "+item.id);continue;}
 verified++;
 if(!item.derived || item.derived.length<2){failures.push("Missing web/android exports: "+item.id);continue;}
 for(const ref of item.derived){
  const f=path.join(repo,ref);
  if(!fs.existsSync(f)){failures.push("Missing derived file "+ref);continue;}
  verified++;
  const actual=sha(f);
  if(item.sha256?.[ref]!==actual)failures.push("SHA-256 mismatch "+ref);
  const metadata=await sharp(f).metadata();
  if(!metadata.width||!metadata.height)failures.push("Empty dimensions "+ref);
  if(item.master.endsWith(".svg") && !metadata.hasAlpha)failures.push("Missing alpha "+ref);
  if(ref.endsWith(".webp") && fs.statSync(f).size>260000)warnings.push("WebP over 260KB "+ref);
 }
 const buf=fs.readFileSync(master);
 if(master.endsWith(".svg") && /<image[\s>]|(?:http:\/\/|https:\/\/)[^"']+(?:png|jpg|webp)/i.test(buf.toString()))failures.push("External bitmap in SVG "+item.id);
 if(item.family==="world-photo" && !item.license_url)failures.push("Photo missing license "+item.id);
 const candidates=["rank","guardian","avatar","world","world-photo","reward","ui-illustration"].includes(item.family);
 if(!candidates)continue;
 try{
  const mini=item.derived.find(x=>x.endsWith("-256.webp")||x.endsWith("-android.webp"))||item.derived[0];
  const src=path.join(repo,mini);
  const {data,info}=await sharp(src).resize(9,8,{fit:"fill"}).greyscale().removeAlpha().raw().toBuffer({resolveWithObject:true});
  let bits=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=y*9+x;bits=(bits<<1n)|(data[i]>data[i+1]?1n:0n);}
  fingerprint.push({id:item.id,family:item.family,bitset:bits,source:mini});
 }catch(err){warnings.push("Unable to compute perceptual signature: "+item.id+" "+err.message);}
}
function popcount(a){let n=0;while(a){a&=a-1n;n++;}return n;}
const pairs=[];
for(let i=0;i<fingerprint.length;i++)for(let j=i+1;j<fingerprint.length;j++){
 const a=fingerprint[i],b=fingerprint[j];
 if(a.family!==b.family||a.id===b.id)continue;
 // A low Hamming distance flags inspection, not necessarily duplication.
 const d=popcount(a.bitset^b.bitset);
 if(d<=4)pairs.push({a:a.id,b:b.id,distance:d,family:a.family});
}
const selected=registry.assets.filter(a=>a.family==="rank"||a.family==="guardian"&&a.id.startsWith("guardian-object-")||a.family==="avatar"&&a.id.startsWith("avatar-token-"));
const cw=200,ch=162,cols=4,rows=Math.ceil(selected.length/cols),wide=cols*cw,high=rows*ch+55;
const compositions=[{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+wide+'" height="50"><text x="17" y="32" fill="#e7eef0" font-size="22" font-family="Arial" font-weight="700">TITAN · contrôle d’échelle 32 / 48 / 64 px</text></svg>'),left:0,top:0}];
const escape=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;");
let n=0;
for(const asset of selected){
 const x=(n%cols)*cw,y=Math.floor(n/cols)*ch+55;n++;
 const f=path.join(repo,asset.master);
 let left=x+10;
 for(const sz of [32,48,64]){
  const buffer=await sharp(f).resize(sz,sz,{fit:"contain"}).png().toBuffer();
  compositions.push({input:buffer,left:left+Math.round((64-sz)/2),top:y+25+Math.round((64-sz)/2)});
  left+=63;
 }
 const title=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+cw+'" height="58"><text x="5" y="18" fill="#dbe6e8" font-size="12" font-family="Arial">'+escape(asset.id.slice(0,27))+'</text><text x="5" y="39" fill="#82aab0" font-size="12" font-family="Arial">32     48       64</text></svg>');
 compositions.push({input:title,left:x+2,top:y+96});
}
const out=path.join(root,"preview/contact-legibility.webp");
await sharp({create:{width:wide,height:high,channels:4,background:"#05070aff"}}).composite(compositions).webp({quality:82,effort:5}).toFile(out);
const stat=await sharp(out).metadata();
report.files.push({path:rel(out),bytes:fs.statSync(out).size,width:stat.width,height:stat.height,alpha:stat.hasAlpha,sha256:sha(out)});
report.counts.sheets+=1;
report.quality_v2={verified_references:verified,master_assets:registry.assets.length,perceptual_near_duplicates:pairs,threshold_hamming:4,missing_files_or_hash_failures:failures,warnings,scale_contact_sheet:rel(out),checks:["master existence","web/android variant existence","SHA-256 per derived file","SVG opacity/alpha","portrait-friendly small sizes contact sheet","photographic license metadata","WebP size warnings","dHash near-duplicate screening"]};
fs.writeFileSync(qaPath,JSON.stringify(report,null,2)+"\n");
const galleryPath=path.join(root,"preview/GALLERY.md");
let gallery=fs.readFileSync(galleryPath,"utf8");
gallery+="\n## Contrôle visuel à 32 / 48 / 64 px\n\n![Contrôle de lisibilité 32, 48 et 64 px](./contact-legibility.webp)\n\nCette planche ne constitue pas une validation esthétique. Les rapprochements perceptuels éventuels sont listés dans [le rapport QA](./QA-REPORT.json).\n";
fs.writeFileSync(galleryPath,gallery);
console.log(JSON.stringify({masters:registry.assets.length,verified_references:verified,near_duplicates:pairs.length,failures,warnings: warnings.length,legibility:rel(out)},null,2));
if(failures.length)process.exitCode=1;
