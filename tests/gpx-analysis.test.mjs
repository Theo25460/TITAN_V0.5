import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../js/core/gpx.js');
const time = n => new Date(Date.UTC(2026,9,29,7,0,n)).toISOString();
const pt = (lat, seconds, ele = null, tag = 'trkpt') => `<${tag} lat="${lat}" lon="6">${ele === null ? '' : `<ele>${ele}</ele>`}${seconds === null ? '' : `<time>${time(seconds)}</time>`}</${tag}>`;
const track = body => `<gpx><trk><trkseg>${body}</trkseg></trk></gpx>`;

test('route without time or elevation has no fabricated duration, speed or ascent', () => {
  const r = G.analyse(`<gpx><rte>${pt(45,null,null,'rtept')}${pt(45.01,null,null,'rtept')}</rte></gpx>`);
  assert.equal(r.ok,true); assert.equal(r.kind,'route');
  assert.ok(r.distanceKm > 1); assert.equal(r.movingMinutes,null);
  assert.equal(r.elapsedMinutes,null); assert.equal(r.ascent,null); assert.equal(r.descent,null);
  assert.deepEqual(r.splits,[]);
});

test('planned route points stay a route even when a planner adds timestamps', () => {
  const r=G.analyse(`<gpx><rte>${pt(45,0,100,'rtept')}${pt(45.001,30,110,'rtept')}</rte></gpx>`);
  assert.equal(r.kind,'route');assert.equal(r.movingMinutes,null);assert.equal(r.elapsedMinutes,null);assert.deepEqual(r.splits,[]);
});

test('separate track segments are not connected by artificial distance or ascent', () => {
  const r = G.analyse(`<gpx><trk><trkseg>${pt(45,0,100)}${pt(45.001,30,105)}</trkseg><trkseg>${pt(46,3600,500)}${pt(46.001,3630,505)}</trkseg></trk></gpx>`);
  assert.equal(r.ok,true); assert.ok(r.distanceKm < 0.23);
  assert.equal(r.ascent,10); assert.equal(r.segmentCount,2);
  assert.equal(r.movingMinutes,1); assert.equal(r.previewSegments.length,2);
});

test('a single impossible GPS point is skipped and the next valid point recovers from the last good point', () => {
  const r=G.analyse(track(pt(45,0,100)+pt(45.001,30,105)+pt(48,31,3000)+pt(45.002,60,110)));
  assert.equal(r.ignoredPoints,1); assert.ok(Math.abs(r.distanceKm-0.22)<0.02);
  assert.equal(r.movingMinutes,1); assert.equal(r.ascent,10);
});

test('partial timestamps and reversed chronology cannot supply a trustworthy activity duration', () => {
  for(const body of [pt(45,0)+pt(45.001,null)+pt(45.002,60),pt(45,60)+pt(45.001,30)+pt(45.002,0)]) {
    const r=G.analyse(track(body)); assert.equal(r.kind,'incomplete');
    assert.equal(r.elapsedMinutes,null); assert.equal(r.movingMinutes,null); assert.deepEqual(r.splits,[]);
  }
});

test('a measured stationary activity preserves zero moving time and real elapsed time', () => {
  const r=G.analyse(track(pt(45,0,100)+pt(45,60,100)));
  assert.equal(r.movingMinutes,0); assert.equal(r.elapsedMinutes,1); assert.equal(r.ascent,0);
});

test('sparse timing and invalid calendar dates are not turned into a zero active duration', () => {
  const sparse=G.analyse(track(pt(45,0,100)+pt(45.01,600,120)));
  assert.equal(sparse.elapsedMinutes,10); assert.equal(sparse.movingMinutes,null); assert.equal(sparse.pauseMinutes,null);
  const impossible=G.analyse(track(pt(45,0)+pt(45.001,30)).replaceAll('2026-10-29','2026-02-30'));
  assert.equal(impossible.movingMinutes,null);
});

test('altitude gaps remain separate in the sampled profile', () => {
  let body='';for(let i=0;i<1000;i++)body+=pt(45+i*.00001,i,i===501?null:100+i*.01);
  const r=G.analyse(track(body));assert.equal(r.ascent,null);
  const runs=new Set(r.profile.filter(p=>p.altitude!==null).map(p=>p.segment));
  assert.ok(runs.size>=2,'sampling must not reconnect the missing altitude interval');
});

test('kilometre splits are interpolated from timed edges and bounded previews retain endpoints', () => {
  let body=''; for(let i=0;i<=1200;i++)body+=pt(45+i*.00002,i,100+i*.01);
  const r=G.analyse(track(body));
  assert.equal(r.kind,'recorded'); assert.equal(r.splits.length,3);
  assert.ok(Math.abs(r.splits[0].distanceKm-1)<.001);
  assert.ok(r.splits[0].durationSeconds > 440 && r.splits[0].durationSeconds < 460);
  assert.ok(r.profile.length<=160); assert.ok(r.previewSegments.flat().length<=320);
  assert.equal(r.profile.at(-1).distanceKm,r.distanceKm);
});

test('XML entities, excessive data and truncated GPX are rejected instead of partially imported', () => {
  assert.equal(G.analyse('<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+track(pt(45,0)+pt(45.001,30))).ok,false);
  assert.equal(G.analyse(track(pt(45,0)+pt(45.001,30)).slice(0,-6)).ok,false);
  assert.equal(G.analyse('x'.repeat(15*1024*1024+1)).ok,false);
  assert.equal(G.analyse('outside'+track(pt(45,0)+pt(45.001,30))).ok,false);
  assert.equal(G.analyse('<'.repeat(100000)+track(pt(45,0)+pt(45.001,30))).ok,false);
});

test('namespaced GPX and signed exponent coordinates are accepted without interpreting markup as text', () => {
  const r=G.analyse('<g:gpx xmlns:g="urn:gpx"><g:trk><g:trkseg><g:trkpt lat="+4.5e1" lon="6"/><g:trkpt lat="45.001" lon="6"/></g:trkseg></g:trk></g:gpx>');
  assert.equal(r.ok,true); assert.equal(r.kind,'route'); assert.equal(r.ascent,null);
});

test('malformed attribute quotes are refused and nested extensions cannot impersonate point time or altitude', () => {
  const malformed=track(pt(45,0)+pt(45.001,30)).replaceAll('lat="45"',"lat='45\"");
  assert.equal(G.analyse(malformed).ok,false);
  const nested=track('<trkpt lat="45" lon="6"><extensions><time>2026-10-29T07:00:00Z</time><ele>100</ele></extensions></trkpt><trkpt lat="45.001" lon="6"><extensions><time>2026-10-29T07:00:30Z</time><ele>200</ele></extensions></trkpt>');
  const r=G.analyse(nested);assert.equal(r.kind,'route');assert.equal(r.movingMinutes,null);assert.equal(r.ascent,null);
  assert.equal(G.analyse(nested.replaceAll('<time>','<other:time>').replaceAll('</time>','</other:time>')).kind,'route');
  assert.equal(G.analyse(track(pt(45,0)+pt(45.001,30)).replace('<gpx>','<gpx><extensions>').replace('</gpx>','</extensions></gpx>')).ok,false);
  assert.equal(G.analyse(track('<extensions>'+pt(45,0)+pt(45.001,30)+'</extensions>')).ok,false);
});

test('terrain distinguishes consecutive estimated stops from unobserved segment gaps',()=>{
 const r=G.analyse(`<gpx><trk><trkseg>${pt(45,0,100)}${pt(45.001,30,120)}${pt(45.001,60,120)}${pt(45.001,90,120)}${pt(45.002,120,125)}</trkseg><trkseg>${pt(46,600,200)}${pt(46.001,630,210)}</trkseg></trk></gpx>`);
 assert.equal(r.terrainVersion,'gpx-terrain-v1');assert.equal(r.pauses.count,1);assert.equal(r.pauses.totalSeconds,60);assert.equal(r.pauses.unobservedSeconds,480);assert.equal(r.pauses.items.length,1);
 assert.deepEqual(Object.keys(r.pauses.items[0]).sort(),['distanceKm','seconds']);
});

test('terrain does not interpret sparse movement as a stop or a speed colour',()=>{
 const r=G.analyse(track(pt(45,0,100)+pt(45.01,600,150)));
 assert.equal(r.pauses.count,0);assert.equal(r.pauses.unobservedSeconds,600);
 assert.equal(r.previewMetrics[0][1].speedKmh,null);
});

test('planned and incomplete tracks never expose speed colours or estimated pauses',()=>{
 for(const xml of [track(pt(45,0,100)+pt(45.001,null,130)),`<gpx><rte>${pt(45,0,100,'rtept')}${pt(45.001,30,130,'rtept')}</rte></gpx>`]) {
  const r=G.analyse(xml);assert.equal(r.pauses,null);
  assert.ok(r.previewMetrics.flat().every(p=>p.speedKmh===null));
  assert.ok(r.previewMetrics.flat().some(p=>p.gradePercent>0),'altitude still supports planned terrain');
 }
});

test('main climb tolerates minor dips and ends at a real descent, never crosses missing altitude',()=>{
 const r=G.analyse(track(pt(45,0,100)+pt(45.001,30,115)+pt(45.002,60,112)+pt(45.003,90,140)+pt(45.004,120,125)+pt(45.005,150,130)));
 assert.equal(r.primaryClimb.gainMeters,40);assert.equal(r.primaryClimb.startKm,0);assert.ok(r.primaryClimb.distanceKm>.32&&r.primaryClimb.distanceKm<.34);
 const gap=G.analyse(track(pt(45,0,100)+pt(45.001,30,110)+pt(45.002,60,null)+pt(45.003,90,500)+pt(45.004,120,510)));
 assert.equal(gap.primaryClimb,null);
});

test('stationary altitude spikes and tiny noisy rises never create a main climb or grade',()=>{
 const flat=G.analyse(track(pt(45,0,100)+pt(45,30,500)));
 assert.equal(flat.primaryClimb,null);assert.equal(flat.previewMetrics[0][1].gradePercent,null);
 const small=G.analyse(track(pt(45,0,100)+pt(45.001,30,102)+pt(45.002,60,101)));
 assert.equal(small.primaryClimb,null);
});

test('sampled colour values use travelled distance and do not bridge missing altitude',()=>{
 let body='';for(let i=0;i<=1200;i++)body+=pt(45+i*.00002,i,i===501?null:100+i*.01);
 const r=G.analyse(track(body));
 assert.equal(r.previewMetrics.flat().length,r.previewSegments.flat().length);assert.ok(r.previewMetrics.flat().length<=320);
 assert.ok(r.previewMetrics.flat().some((p,i)=>i>0&&p.gradePercent===null));
 assert.ok(r.previewMetrics.flat().filter(p=>p.speedKmh!==null).every(p=>p.speedKmh>7&&p.speedKmh<9));
});

test('pause summaries stay bounded without truncating the total count',()=>{
 let body='';for(let i=0;i<70;i++)body+=pt(45+i*.0002,i*60,100)+pt(45+i*.0002,i*60+30,100);
 const r=G.analyse(track(body));assert.equal(r.pauses.count,70);assert.equal(r.pauses.items.length,50);assert.equal(r.pauses.totalSeconds,2100);
});

test('a stationary altitude spike cannot contaminate the next climb or slope interval',()=>{
 const r=G.analyse(track(pt(45,0,100)+pt(45,30,50)+pt(45.001,60,100)));
 assert.equal(r.primaryClimb,null);assert.equal(r.previewMetrics[0][1].gradePercent,null);assert.equal(r.previewMetrics[0][2].gradePercent,null);
});

test('an exact zero-duration duplicate does not split a continuous estimated stop',()=>{
 const original=G.analyse(track(pt(45,0,100)+pt(45,15,100)+pt(45,30,100)));
 const duplicate=G.analyse(track(pt(45,0,100)+pt(45,15,100)+pt(45,15,100)+pt(45,30,100)));
 assert.equal(duplicate.kind,'recorded');assert.deepEqual(duplicate.pauses,original.pauses);assert.equal(duplicate.pauses.count,1);assert.equal(duplicate.pauses.totalSeconds,30);
});
