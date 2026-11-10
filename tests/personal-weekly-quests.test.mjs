import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
function rules(){const c=vm.createContext({Date,Intl});for(const f of ["training-store","renaissance-catalog","renaissance-engine"])vm.runInContext(readFileSync(new URL(`../js/${f}.js`,import.meta.url),"utf8"),c);return c.TitanAdventure;}
const now=new Date("2026-11-05T12:00:00Z");
const log=(sport,date,extra={})=>({id:`${sport}-${date}`,sport,date,details:{duration:30},...extra});
test("legacy weekly missions count every discipline",()=>{const q=rules().weeklyQuests([log("yoga","2026-11-02"),log("football","2026-11-04")],3,now);assert.deepEqual(Array.from(q,q=>q.id),["rhythm","perspective","context","return"]);assert.equal(q[0].value,2);});
test("optional favorite follows previous complete weeks without a moving weekly target",()=>{const rows=[...[5,8,12,15,19,22,26,29].map(n=>log("yoga",`2026-10-${String(n).padStart(2,"0")}`)),log("running","2026-10-20"),log("yoga","2026-11-02"),log("football","2026-11-03")];const q=rules().weeklyQuests(rows,3,now,{favoriteSports:["running","yoga"]});const p=q.find(q=>q.id==="sport-rhythm");assert.ok(p);assert.equal(p.sport,"yoga");assert.equal(p.target,2);assert.equal(p.value,1);assert.match(p.text,/facultatif/i);assert.equal(q[0].value,2);assert.equal(rules().weeklyQuests([...rows,log("yoga","2026-11-04")],3,now,{favoriteSports:["running","yoga"]}).at(-1).target,2);});
test("new favorites need one optional session and no reward or recovery penalty",()=>{const p=rules().weeklyQuests([log("swimming","2026-11-08"),log("swimming","2026-10-20",{archived_at:"2026-10-21"}),log("swimming","2026-01-01")],1,now,{favoriteSports:["swimming"]}).at(-1);assert.equal(p.id,"sport-rhythm");assert.equal(p.target,1);assert.equal(p.value,0);assert.match(p.text,/repos/i);assert.equal("xp" in p,false);});

test("weekly paths offer one favorite and two optional routes based on real journal data", () => {
  const logs = [log("yoga", "2026-11-02", { details: { note: "Ma séance à retrouver" } }), log("running", "2026-11-03")];
  const paths = rules().weeklyQuestPaths(logs, 3, now, { favoriteSports: ["swimming"] });
  assert.equal(paths.main.id, "sport-rhythm");
  assert.equal(paths.main.value, 0);
  assert.match(paths.why, /favoris/);
  assert.deepEqual(Array.from(paths.alternatives, (q) => [q.id, q.value]), [["return", 2], ["perspective", 1]]);
  for (const q of [paths.main, ...paths.alternatives]) assert.equal("xp" in q, false);
});

test("weekly paths support any sport and leave the cadence target aside while paused", () => {
  const ruleset = rules();
  assert.equal(ruleset.weeklyQuestPaths([], 3, now).main.id, "return");
  const paths = ruleset.weeklyQuestPaths([], 3, now, { favoriteSports: ["swimming"], cadencePaused: true });
  assert.equal(paths.main.id, "perspective");
  assert.equal(paths.alternatives.length, 2);
  assert.equal(paths.alternatives.some((q) => q.sport || q.id === "rhythm" || q.id === "return"), false);
});
const snapshot=(extra={})=>({owner:"a",selected_world:"aube",campaigns:[{id:"aube",chapter:2,target:2,evidence:{days:1,source_ids:["session-1"]}}],...extra});
const impact=(extra={})=>rules().sessionImpact({logId:"session-1",owner:"a",status:"confirmed",snapshot:snapshot(),snapshotReady:true,...extra});
test("chapter attribution requires exact authoritative session evidence",()=>{const r=impact();assert.equal(r.state,"confirmed");assert.equal(r.campaignId,"aube");assert.match(r.text,/chapitre 2.*1\/2/i);assert.doesNotMatch(r.text,/balise|débloqu|gagn|\+.*XP/i);});
test("pending held stale local and wrong-account snapshots cannot confirm adventure gains",()=>{for(const extra of [{status:"pending"},{rewardHeld:true},{snapshotReady:false},{snapshot:null},{snapshot:snapshot({local:true})},{snapshot:snapshot({owner:"b"})},{owner:"",snapshot:snapshot({owner:""})}]){const r=impact(extra);assert.equal(r.state,"pending");assert.equal(r.campaignId,undefined);assert.match(r.text,/confirmation|vérification/i);}});
test("confirmed sessions without evidence and inactive worlds have honest explanations",()=>{const r=impact({logId:"unrelated"});assert.equal(r.state,"confirmed");assert.equal(r.campaignId,undefined);assert.match(r.text,/n’attribue pas de nouvelle avancée/i);assert.match(impact({snapshot:snapshot({campaigns:[]})}).text,/aucun monde actif/i);assert.equal(impact({historical:true}).state,"historical");});
