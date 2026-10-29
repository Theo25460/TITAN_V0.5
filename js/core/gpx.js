/* TITAN — bounded local GPX analysis. A file is an import, never proof of real effort.
   No network, no XML entity expansion, no inferred timestamps or corrected altitude. */
/** @typedef {{lat:number, lon:number, ele:number|null, time:number|null, segment:number}} GpxPoint */
/** @typedef {{distance:number, seconds:number}} TimedEdge */
(function (root) {
  "use strict";
  const R = 6371008.8, MAX_CHARS = 15 * 1024 * 1024, MAX_POINTS = 100000, MAX_SEGMENTS = 160;
  const NS = "(?:[A-Za-z_][\\w.-]*:)?";
  /** @param {number} d */
  const rad = d => d * Math.PI / 180;
  /** @param {{lat:number,lon:number}} a @param {{lat:number,lon:number}} b */
  function haversine(a, b) {
    const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  /** @param {number} value @param {number} [places] */
  const round = (value, places=2) => Number(value.toFixed(places));
  /** @param {string|undefined} value */
  function timestamp(value) {
    if(!value)return NaN;
    const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);
    if(!m)return NaN;
    const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
    const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
    if(month<1||month>12||day<1||day>(days[month-1]||0)||Number(m[4])>23||Number(m[5])>59||Number(m[6])>59)return NaN;
    return Date.parse(value);
  }

  /** Validate nesting of supported XML without evaluating entities or embedding source markup.
      GPX with constructs we cannot interpret safely is rejected, not silently repaired.
      @param {string} xml */
  function validXml(xml) {
    /** @type {string[]} */ const stack=[];
    let roots=0;
    let offset=0;
    for(const match of xml.matchAll(/<[^<>]*>/g)) {
      const token=match[0], between=xml.slice(offset,match.index);
      if(/[<>]/.test(between)||(!stack.length&&between.trim()))return false;
      offset=match.index+token.length;
      if (/^<\?xml\s[\s\S]*\?>$/.test(token)) continue;
      const m=/^<(\/)?([A-Za-z_][\w.:-]*)(?:\s[^<>]*?)?\s*(\/?)>$/.exec(token);
      if(!m || !m[2])return false;
      if(m[1]) {if(token.slice(2,-1).trim()!==m[2]||stack.pop()!==m[2])return false;}
      else {
        const attributes=token.slice(1+m[2].length,-1).replace(/\/\s*$/,'');
        const attr=/\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"<>]*"|'[^'<>]*')/y;
        const names=new Set();let pos=0;
        while(pos<attributes.length&&attributes.slice(pos).trim()) {
          attr.lastIndex=pos;const value=attr.exec(attributes);
          if(!value||names.has(value[1]))return false;
          names.add(value[1]);pos=attr.lastIndex;
        }
        if(!stack.length) {roots++;if(m[2].split(':').pop()!=='gpx')return false;}
        if(!m[3])stack.push(m[2]);
      }
    }
    return roots===1 && stack.length===0 && !xml.slice(offset).trim();
  }

  /** Read only direct GPX children. Vendor-extension descendants never become GPX data.
      @param {string} body @param {string} prefix @param {string[]} names */
  function directElements(body,prefix,names) {
    let depth=0,start=-1,attributes='';
    /** @type {{name:string,attributes:string,body:string}[]} */ const result=[];
    for(const match of body.matchAll(/<(\/)?([A-Za-z_][\w.:-]*)(?:\s[^<>]*?)?\s*(\/?)>/g)) {
      const closing=!!match[1],tag=match[2],selfClosing=!!match[3];
      if(!tag)continue;
      const wanted=names.some(name=>tag===prefix+name);
      if(closing) {
        depth--;
        if(depth===0&&start>=0&&wanted) {
          result.push({name:tag,attributes,body:body.slice(start,match.index)});start=-1;
        }
      } else {
        if(depth===0&&wanted) {
          attributes=match[0].slice(1+tag.length,-1).replace(/\/\s*$/,'');
          if(selfClosing)result.push({name:tag,attributes,body:''});
          else start=match.index+match[0].length;
        }
        if(!selfClosing)depth++;
      }
    }
    return result;
  }
  /** @param {string} body @param {string} prefix @param {string} name */
  function directValue(body,prefix,name) {
    const elements=directElements(body,prefix,[name]);
    return elements.length===1&&!elements[0]?.body.includes('<')?elements[0]?.body.trim():undefined;
  }

  /** @param {unknown} input */
  function read(input) {
    const source=typeof input==='string'?input:'';
    /** @type {GpxPoint[]} */ const out=[];
    const bad=(error="Ce fichier GPX est incomplet ou non pris en charge.")=>({ok:false,error,points:out,invalidPoints:0,invalidTimes:0,recording:false});
    if(source.length>MAX_CHARS)return bad("Le GPX doit faire moins de 15 Mo.");
    if(/<!\s*(DOCTYPE|ENTITY)\b/i.test(source))return bad("Les déclarations d’entités XML ne sont pas acceptées.");
    const xml=source.replace(/<!--[\s\S]*?-->/g,'').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'');
    if(!validXml(xml))return bad();
    const rootTag=new RegExp(`<(${NS}gpx)\\b[^>]*>`).exec(xml);
    const rootName=rootTag?.[1]||'gpx';
    const prefix=rootName.includes(':')?rootName.slice(0,rootName.indexOf(':')+1):'';
    const rootBody=rootTag&&!rootTag[0].endsWith('/>')?xml.slice(rootTag.index+rootTag[0].length,xml.lastIndexOf('</'+rootName)):'';
    const tracks=directElements(rootBody,prefix,['trk']).flatMap(t=>directElements(t.body,prefix,['trkseg']).map(s=>s.body));
    const segments=tracks.length?tracks:directElements(rootBody,prefix,['rte']).map(s=>s.body);
    const tag=tracks.length?'trkpt':'rtept';
    if(segments.length>MAX_SEGMENTS)return bad("Le GPX contient trop de fragments (160 maximum).");
    let invalidPoints=0,invalidTimes=0;
    for(let segment=0;segment<segments.length;segment++) {
      for(const element of directElements(segments[segment]||'',prefix,[tag])) {
        if(out.length+invalidPoints>=MAX_POINTS)return bad("Le GPX contient trop de points (100 000 maximum).");
        const attrs=element.attributes, body=element.body;
        const lat=Number(/(?:^|\s)lat\s*=\s*["']([-\d.eE+]+)["']/.exec(attrs)?.[1]);
        const lon=Number(/(?:^|\s)lon\s*=\s*["']([-\d.eE+]+)["']/.exec(attrs)?.[1]);
        if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){invalidPoints++;continue;}
        const altitude=directValue(body,prefix,'ele');
        const date=directValue(body,prefix,'time');
        const ele=altitude===undefined||altitude===''?NaN:Number(altitude);
        const time=timestamp(date);
        if(date&&!Number.isFinite(time))invalidTimes++;
        out.push({lat,lon,ele:Number.isFinite(ele)&&ele>=-500&&ele<=10000?ele:null,time:Number.isFinite(time)?time:null,segment});
      }
    }
    return {ok:true,error:'',points:out,invalidPoints,invalidTimes,recording:tracks.length>0};
  }
  /** @param {unknown} text */
  function points(text) {return read(text).points;}

  /** Select evenly spaced samples while retaining both endpoints.
      @template T @param {T[]} values @param {number} limit @returns {T[]} */
  function sample(values,limit) {
    if(values.length<=limit)return values.slice();
    return Array.from({length:limit},(_,i)=>values[Math.round(i*(values.length-1)/(limit-1))]).filter(/** @returns {v is T} */ v=>v!==undefined);
  }

  /** @param {TimedEdge[]} edges */
  function splitKilometres(edges) {
    /** @type {{index:number,distanceKm:number,durationSeconds:number}[]} */ const splits=[];
    let distance=0, seconds=0, index=1;
    for(const edge of edges) {
      let left=edge.distance, time=edge.seconds;
      // A stationary interval belongs to the current split; segment gaps never enter this list.
      if(left===0){seconds+=time;continue;}
      while(left>0.000001 && splits.length<1000) {
        const take=Math.min(1000-distance,left), dt=time*take/left;
        distance+=take;seconds+=dt;left-=take;time-=dt;
        if(distance>=999.999999){splits.push({index:index++,distanceKm:1,durationSeconds:round(seconds,1)});distance=0;seconds=0;}
      }
    }
    if(distance>0.01 && splits.length<1000)splits.push({index,distanceKm:round(distance/1000,3),durationSeconds:round(seconds,1)});
    return splits;
  }

  /** @param {unknown} text */
  function analyse(text) {
    const parsed=read(text), pts=parsed.points;
    if(!parsed.ok)return {ok:false,error:parsed.error,points:pts.length};
    if(pts.length<2)return {ok:false,error:"Ce fichier ne contient pas de trace exploitable.",points:pts.length};
    /** @type {GpxPoint[]} */ const clean=[];
    /** @type {{distanceKm:number,altitude:number|null,segment:number}[]} */ const rawProfile=[];
    /** @type {TimedEdge[]} */ const edges=[];
    let dist=0,moving=0,ascent=0,descent=0,ignored=parsed.invalidPoints||0,invalidTime=parsed.invalidTimes>0,altitudeComplete=true,movingAvailable=true,profileRun=0;
    /** @type {GpxPoint|null} */ let previous=null;
    /** @type {number|null} */ let refEle=null;
    for(const p of pts) {
      if(!previous || previous.segment!==p.segment) {
        if(previous && p.time!==null && previous.time!==null && p.time<previous.time)invalidTime=true;
        profileRun++;
        previous=p;refEle=p.ele;clean.push(p);altitudeComplete=altitudeComplete&&p.ele!==null;
        rawProfile.push({distanceKm:dist/1000,altitude:p.ele,segment:profileRun});continue;
      }
      const d=haversine(previous,p);
      const dt=p.time!==null&&previous.time!==null?(p.time-previous.time)/1000:null;
      if(dt!==null&&dt>0&&d/dt>60){ignored++;continue;}
      if(dt!==null&&(dt<0||(dt===0&&d>0.01)))invalidTime=true;
      if(dt!==null&&dt>=300&&d>0.01)movingAvailable=false;
      dist+=d;
      if(dt!==null&&dt>0){edges.push({distance:d,seconds:dt});if(dt<300&&d/dt>=0.4)moving+=dt;}
      else if(d>0)edges.push({distance:d,seconds:0});
      if(p.ele===null || previous.ele===null){profileRun++;altitudeComplete=false;refEle=p.ele;}
      else if(refEle!==null){const diff=p.ele-refEle;if(diff>=3){ascent+=diff;refEle=p.ele;}else if(diff<=-3){descent-=diff;refEle=p.ele;}}
      clean.push(p);rawProfile.push({distanceKm:dist/1000,altitude:p.ele,segment:profileRun});previous=p;
    }
    const times=clean.filter(p=>p.time!==null), complete=parsed.recording&&times.length===clean.length&&!invalidTime;
    const first=clean[0]?.time??null,last=clean.at(-1)?.time??null;
    const elapsed=complete&&first!==null&&last!==null?(last-first)/60000:null;
    const kind=!parsed.recording?'route':complete?'recorded':invalidTime||times.length?'incomplete':'route';
    const segmentIds=[...new Set(clean.map(p=>p.segment))];
    const perSegment=Math.max(2,Math.floor(320/segmentIds.length));
    const previewSegments=segmentIds.map(id=>sample(clean.filter(p=>p.segment===id),perSegment).map(p=>[p.lat,p.lon]));
    const profile=sample(rawProfile,160).map(p=>({...p,distanceKm:round(p.distanceKm)}));
    if(profile.length)profile[profile.length-1]={...profile[profile.length-1],distanceKm:round(dist/1000),altitude:clean.at(-1)?.ele??null,segment:profileRun};
    return {ok:true,points:pts.length,ignoredPoints:ignored,cleanPoints:clean.length,distanceKm:round(dist/1000),
      kind, routeType:parsed.recording?'track':'planned_route', timing:complete?'complete':invalidTime?'invalid':times.length?'partial':'missing',
      movingMinutes:complete&&movingAvailable?round(moving/60,1):null,elapsedMinutes:elapsed===null?null:round(elapsed,1),
      pauseMinutes:elapsed===null||!movingAvailable?null:round(Math.max(0,elapsed-moving/60),1),
      ascent:altitudeComplete?Math.round(ascent):null,descent:altitudeComplete?Math.round(descent):null,
      altitudeSource:altitudeComplete?'gpx_unverified':rawProfile.some(p=>p.altitude!==null)?'partial':'missing',
      start:complete&&first!==null?new Date(first).toISOString():null,
      segmentCount:segmentIds.length,profile,previewSegments,splits:complete?splitKilometres(edges):[],analysisVersion:'gpx-v2',
    };
  }
  const api={haversine,points,analyse};
  /** @type {any} */(root).TitanGpx=api;
  if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
