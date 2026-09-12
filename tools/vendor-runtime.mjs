import {mkdirSync,writeFileSync,readFileSync,readdirSync,cpSync} from 'node:fs';
const text=async url=>{const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.text()};
const download=async(url,path)=>{const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);writeFileSync(path,Buffer.from(await r.arrayBuffer()));};
mkdirSync('js/vendor',{recursive:true});mkdirSync('licenses',{recursive:true});
cpSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js','js/vendor/supabase-2.111.0.js');
cpSync('node_modules/@supabase/supabase-js/LICENSE','licenses/supabase-MIT.txt');
const iconCSS=await text('https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css');
await download('https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.woff2','css/fonts/remixicon.woff2');
writeFileSync('css/icons.css',iconCSS.replace(/@font-face\s*\{[\s\S]*?\}/,'@font-face{font-family:"remixicon";font-display:swap;src:url("./fonts/remixicon.woff2") format("woff2")}'));
writeFileSync('licenses/remixicon-Apache-2.txt',await text('https://cdn.jsdelivr.net/npm/remixicon@3.5.0/License'));
writeFileSync('licenses/manrope-OFL.txt',await text('https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt'));
const r=await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&display=swap',{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}});
const css=await r.text(),blocks=css.match(/\/\* latin(?:-ext)? \*\/[\s\S]*?\}/g);
if(!blocks?.length)throw new Error('No Latin variable font returned');
let output='';for(const [i,block] of blocks.entries()){const url=block.match(/url\((https:[^)]+)\)/)[1];await download(url,`css/fonts/manrope-latin-${i}.woff2`);output+=block.replace(url,`./fonts/manrope-latin-${i}.woff2`)+'\n';}
writeFileSync('css/fonts.css',output);
for(const f of readdirSync('.').filter(f=>f.endsWith('.html'))){let s=readFileSync(f,'utf8');s=s.replaceAll('https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css','/css/icons.css?v=102.0').replaceAll('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0','/js/vendor/supabase-2.111.0.js');writeFileSync(f,s);}
let base=readFileSync('css/style.css','utf8').replace(/@import url\('https:\/\/fonts.googleapis.com[^']*'\);\s*/,'');writeFileSync('css/style.css',base);
let sw=readFileSync('sw.js','utf8');
const assets=['./js/vendor/supabase-2.111.0.js','./css/icons.css?v=102.0','./css/fonts/remixicon.woff2',...blocks.map((_,i)=>`./css/fonts/manrope-latin-${i}.woff2`)];
const missing=assets.filter(path=>!sw.includes(JSON.stringify(path))&&!sw.includes("'"+path+"'"));
if(missing.length) sw=sw.replace('const ASSETS_TO_CACHE = [',`const ASSETS_TO_CACHE = [${missing.map(path=>JSON.stringify(path)).join(',')}, `);
writeFileSync('sw.js',sw);
console.log(`Self-hosted Supabase, icons and ${blocks.length} variable font subsets.`);
