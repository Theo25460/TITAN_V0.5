import fs from 'node:fs';
const base=process.argv[2];
if(!base||!/^https:\/\/(?:titan-app\.fr|[a-z0-9-]+--titano-app\.netlify\.app)$/.test(base))throw Error('Use the TITAN production or deploy URL.');
const checks=[
 ...['/','/tarifs','/fonctionnalites','/pour-les-coachs','/niveaux-et-xp','/aventures-sportives','/comprendre-mes-donnees','/debuter-titan','/sports','/aujourdhui','/adventure','/training','/journal','/stats','/personnage','/objectifs','/records','/coaching','/profile','/sitemap.xml','/robots.txt','/manifest.json','/sw.js','/assets/renaissance/valley-small.webp','/assets/renaissance/guardian-aube.webp'].map(path=>({path,status:200})),
 ...['/personnage.html','/objectifs.html','/records.html','/coaching.html','/guide','/algorithme'].map(path=>({path,status:301})),
 ...['/sql/tests/200_coaching.sql','/supabase/migrations/20260913133307_renaissance_coaching_workspace.sql','/RENAISSANCE_ART.json','/RENAISSANCE_200.md','/package.json','/sys_core_override_99.html','/page-inconnue-renaissance'].map(path=>({path,status:404})),
 {path:'/.netlify/functions/webhook',status:405}
];
const results=[];
for(let start=0;start<checks.length;start+=5)await Promise.all(checks.slice(start,start+5).map(async c=>{
 const response=await fetch(base+c.path,{redirect:'manual',signal:AbortSignal.timeout(30000)});
 const body=await response.text();const result={path:c.path,status:response.status,expected:c.status,pass:response.status===c.status};
 if(response.status===301)result.location=response.headers.get('location');
 if(['/personnage','/objectifs','/records','/coaching'].includes(c.path)){result.noindex=response.headers.get('x-robots-tag');result.pass&&=Boolean(result.noindex?.includes('noindex'));}
 if(c.path==='/'){result.csp=Boolean(response.headers.get('content-security-policy'));result.copy=body.includes('Écris ta légende.');result.pass&&=result.csp&&result.copy;}
 if(c.path==='/sw.js'){result.current=body.includes('titan-os-v200-renaissance-2');result.pass&&=result.current;}
 results.push(result);
}));
results.sort((a,b)=>a.path.localeCompare(b.path));
const report={base,checkedAt:new Date().toISOString(),passed:results.filter(r=>r.pass).length,total:results.length,results};
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/deployment-'+(base.includes('netlify')?'preview':'production')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
