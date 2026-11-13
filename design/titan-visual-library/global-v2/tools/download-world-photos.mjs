import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const sharp=require("./.deps/node_modules/sharp");
const root=path.resolve(import.meta.dirname,"..");
const list=JSON.parse(fs.readFileSync(path.join(root,"sources/photographic-worlds.json"),"utf8")).items;
const outdir=path.join(root,"proposed/masters/photographic-worlds");
const report=[];
fs.mkdirSync(outdir,{recursive:true});
for(const entry of list){
 const dest=path.join(outdir,entry.id+"-source.jpg");
 if(!fs.existsSync(dest)){
  const u=new URL(entry.src);u.searchParams.set("fm","jpg");u.searchParams.set("fit","crop");u.searchParams.set("w","2000");u.searchParams.set("q","90");u.searchParams.set("auto","format");
  const response=await fetch(u,{headers:{"User-Agent":"TITAN Visual Library Review/2.0"},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error("Download "+entry.id+" HTTP "+response.status);
  const b=Buffer.from(await response.arrayBuffer());
  const meta=await sharp(b).metadata();
  if(meta.width<1000 || meta.height<550)throw new Error("Original insufficient: "+entry.id+" "+meta.width+"x"+meta.height);
  const bytes=await sharp(b).rotate().jpeg({quality:92,mozjpeg:true}).toBuffer();
  fs.writeFileSync(dest,bytes);
 }
 const m=await sharp(dest).metadata();
 const sha=crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
 report.push({id:entry.id,file:path.relative(root,dest),width:m.width,height:m.height,bytes:fs.statSync(dest).size,sha256:sha,license:entry.license,author:entry.author,page:entry.page});
}
fs.writeFileSync(path.join(root,"sources/photographic-worlds.lock.json"),JSON.stringify({generated_at:new Date().toISOString(),items:report},null,2)+"\n");
console.log(report.map(x=>x.id+" "+x.width+"x"+x.height).join("\n"));
