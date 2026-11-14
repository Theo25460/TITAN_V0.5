import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const names=JSON.parse(fs.readFileSync(path.join(root,"sources/ui-unframed.json"),"utf8")).files;
const plate='<circle cx="256" cy="258" r="160" fill="url(#metal)" stroke="#0c1821" stroke-width="11"/><circle cx="256" cy="258" r="144" fill="url(#face)" stroke="#90abb3" stroke-width="5"/><circle cx="256" cy="258" r="125" fill="none" stroke="#596f77" stroke-width="2"/>';
let converted=0;
for(const name of names){
 const fp=path.join(root,"proposed/masters/ui",name+".svg");
 let src=fs.readFileSync(fp,"utf8");
 if(src.includes(plate)){fs.writeFileSync(fp,src.replace(plate,""));converted++;}
 else if(src.includes('<circle cx="256" cy="258" r="160"'))throw Error("Unexpected shared plate structure "+name);
}
console.log("Removed generic round backs from "+converted+" UI-specific illustrations; source masters preserved.");
