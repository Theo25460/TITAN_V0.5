/* Local, dependency-free GPX preview. Only bounded numeric coordinates reach SVG. */
(function(root){
  'use strict';
  const esc=s=>root.titanEsc(s);
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const terrainOn=()=>root.titanFlags?.enabled?.('screens.gpxterrain',false)===true;
  const number=(n,unit='')=>finite(n)?`${n.toLocaleString('fr-FR',{maximumFractionDigits:2})}${unit}`:'Non disponible';
  function lines(paths,attr,label){
    const valid=paths.filter(p=>p.length>=2);
    if(!valid.length)return '';
    const points=valid.flat(), xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const dx=maxX-minX||1,dy=maxY-minY||1;
    return `<svg ${attr} viewBox="0 0 320 160" role="img" aria-label="${esc(label)}">${valid.map(path=>`<polyline points="${path.map(p=>`${(12+(p[0]-minX)/dx*296).toFixed(2)},${(148-(p[1]-minY)/dy*136).toFixed(2)}`).join(' ')}"/>`).join('')}</svg>`;
  }
  function route(stats,requestedMode){
    if(!Array.isArray(stats.previewSegments))return '';
    let budget=320;
    const segments=stats.previewSegments.slice(0,160).map((s,i)=>{
      if(!Array.isArray(s))return [];
      const values=s.slice(0,budget);budget-=values.length;
      return values.map((p,j)=>Array.isArray(p)&&p.length===2&&finite(p[0])&&finite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180?{point:p,metric:stats.previewMetrics?.[i]?.[j]}:null);
    });
    const pts=segments.flat().filter(Boolean).map(p=>p.point),first=pts[0];if(!first)return '';
    const available=key=>segments.some(s=>s.some(p=>p&&finite(p.metric?.[key])));
    const speed=stats.kind==='recorded'&&available('speedKmh'),grade=available('gradePercent');
    const mode=!terrainOn()||requestedMode==='plain'?'plain':requestedMode==='grade'&&grade?'grade':requestedMode==='speed'&&speed?'speed':speed?'speed':grade?'grade':'plain';
    const center=pts.reduce((n,p)=>n+p[0],0)/pts.length,cos=Math.max(.01,Math.cos(center*Math.PI/180));
    const project=p=>[(((p[1]-first[1]+540)%360)-180)*cos,p[0]];
    const all=pts.map(project),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
    const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys),extent=Math.max(dx,dy*296/136,.000001);
    const x0=Math.min(...xs),y0=Math.min(...ys),scale=296/extent;
    const xy=p=>{const [x,y]=project(p);return [(12+(x-x0)*scale+(296-dx*scale)/2).toFixed(2),(148-(y-y0)*scale-(136-dy*scale)/2).toFixed(2)];};
    const base=[],coloured=[];
    for(const segment of segments){
      let path=[];
      const flush=()=>{if(path.length>=2)base.push(`<polyline points="${path.join(' ')}"/>`);path=[];};
      for(let j=0;j<segment.length;j++){
        const entry=segment[j],before=segment[j-1];
        if(!entry){flush();continue;}
        const [x,y]=xy(entry.point);path.push(`${x},${y}`);
        const value=mode==='speed'?entry.metric?.speedKmh:mode==='grade'?entry.metric?.gradePercent:null;
        if(before&&finite(value)&&((mode==='speed'&&value>=0&&value<=216)||(mode==='grade'&&Math.abs(value)<=100))){
          const [bx,by]=xy(before.point),band=mode==='speed'?(value<5?0:value<15?1:value<30?2:3):(value<-3?0:value<3?1:value<8?2:3);
          coloured.push(`<line class="gpx-color-line gpx-band-${band}" x1="${bx}" y1="${by}" x2="${x}" y2="${y}"/>`);
        }
      }
      flush();
    }
    const labels=mode==='speed'?['< 5 km/h','5–15 km/h','15–30 km/h','≥ 30 km/h']:mode==='grade'?['< −3 %','−3 à 3 %','3–8 %','≥ 8 %']:[];
    return `<figure class="gpx-figure" data-gpx-route-figure>
      ${terrainOn()?`<div class="gpx-color-controls asc-seg" role="group" aria-label="Coloration du parcours">${[['plain','Tracé',true],['speed','Vitesse',speed],['grade','Pente',grade]].map(([key,label,on])=>`<button type="button" data-gpx-color="${key}" aria-pressed="${key===mode}" ${on?'':'disabled'}>${label}</button>`).join('')}</div>`:''}
      <svg data-gpx-route data-color-mode="${mode}" viewBox="0 0 320 160" role="img" aria-label="Aperçu schématique du parcours${mode==='speed'?', couleur selon la vitesse moyenne':mode==='grade'?', couleur selon la pente estimée':''}">${base.join('')}${coloured.join('')}</svg>
      ${labels.length?`<ul class="gpx-legend" data-gpx-legend>${labels.map((label,i)=>`<li><span class="gpx-band-${i}" aria-hidden="true"></span>${esc(label)}</li>`).join('')}<li><span class="gpx-unknown" aria-hidden="true"></span>Non disponible</li></ul>`:''}
      <figcaption>Aperçu schématique · sans fond de carte. ${mode==='speed'?'Moyennes des portions affichées, pauses incluses.':mode==='grade'?'Pente moyenne estimée sur au moins 20 m, altitude du fichier non corrigée.':''} ${!speed?'Vitesse non disponible.':''} ${!grade?'Pente non disponible.':''}</figcaption></figure>`;
  }
  function setMode(container,stats,mode){
    const figure=container?.querySelector('[data-gpx-route-figure]');
    if(!terrainOn()||!figure||!['plain','speed','grade'].includes(mode))return;
    figure.outerHTML=route(stats,mode);
    container.querySelector(`[data-gpx-color="${mode}"]`)?.focus({preventScroll:true});
  }
  function terrainSummary(stats){
    if(stats.terrainVersion!=='gpx-terrain-v1')return '';
    const c=stats.primaryClimb,p=stats.pauses;
    const climb=c&&finite(c.gainMeters)&&finite(c.distanceKm)&&finite(c.startKm)&&finite(c.endKm)&&finite(c.averageGradePercent)?`<p><strong>+${esc(number(c.gainMeters,' m'))}</strong> sur ${esc(number(c.distanceKm,' km'))} · pente moyenne ${esc(number(c.averageGradePercent,' %'))}</p><p class="asc-small asc-muted">Du km ${esc(number(c.startKm))} au km ${esc(number(c.endKm))} du fichier.</p>`:`<p class="asc-small asc-muted">${stats.altitudeSource==='missing'?'Altitude non disponible.':'Aucune montée répondant aux seuils dans les portions renseignées.'}</p>`;
    const items=Array.isArray(p?.items)?p.items.slice(0,50).filter(s=>s&&finite(s.distanceKm)&&finite(s.seconds)):[];
    return `<div class="gpx-terrain"><section data-gpx-climb><h4>Montée principale estimée</h4>${climb}<p class="asc-small asc-faint">Plus grand gain net : au moins 20 m sur 100 m, fin après 10 m de descente. Estimation du fichier, sans correction d’altitude.</p></section>
      <section data-gpx-pauses><h4>Arrêts estimés</h4>${p&&finite(p.count)&&finite(p.totalSeconds)&&finite(p.unobservedSeconds)?`<p>${esc(number(p.count))} arrêt${p.count===1?'':'s'} · ${esc(number(p.totalSeconds/60,' min'))}</p>${p.unobservedSeconds>0?`<p class="asc-small asc-muted">${esc(number(p.unobservedSeconds/60,' min'))} sans observation continue : ce temps n’est pas assimilé à un arrêt.</p>`:''}${items.length?`<details><summary>Détail des arrêts${p.count>50?' (50 premiers)':''}</summary><ul>${items.map(s=>`<li>Vers le km ${esc(number(s.distanceKm))} · ${esc(number(s.seconds,' s'))}</li>`).join('')}</ul></details>`:''}`:'<p class="asc-small asc-muted">Pauses non disponibles : une trace enregistrée entièrement horodatée est nécessaire.</p>'}<p class="asc-small asc-faint">Au moins 20 s consécutives à moins de 1,44 km/h. Une marche très lente peut être comptée comme arrêt ; les coupures GPS sont distinguées.</p></section></div>`;
  }
  function profile(stats){
    if(!Array.isArray(stats.profile))return '';
    const paths=[];let line=[],segment=null;
    for(const p of stats.profile.slice(0,160)){
      if(!p||!finite(p.distanceKm)||!finite(p.altitude)||p.altitude < -500||p.altitude>10000){if(line.length)paths.push(line);line=[];segment=null;continue;}
      if(segment!==null&&segment!==p.segment){if(line.length)paths.push(line);line=[];}
      line.push([p.distanceKm,p.altitude]);segment=p.segment;
    }
    if(line.length)paths.push(line);
    const svg=lines(paths,'data-gpx-profile','Profil altimétrique du fichier GPX');
    return svg?`<figure class="gpx-figure">${svg}<figcaption>Profil altimétrique · altitude du fichier, non corrigée</figcaption></figure>`:'';
  }
  function render(stats,{preview=false}={}){
    if(!stats)return '';
    if(stats.analysisVersion!=='gpx-v2')return preview?'<section class="gpx-preview" data-gpx-preview><p>Ancien import GPX : réimporte le fichier pour analyser sa trace, ou repars en saisie manuelle.</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="clear-gpx">Repartir en saisie manuelle</button></section>':'';
    const kind=stats.kind==='recorded'?'Trace horodatée':stats.kind==='route'?(stats.routeType==='planned_route'?'Itinéraire prévu':'Itinéraire sans horodatage'):'Horodatage incomplet ou incohérent';
    const splits=Array.isArray(stats.splits)?stats.splits.slice(0,1000).filter(s=>s&&finite(s.distanceKm)&&s.distanceKm>0&&s.distanceKm<=1&&finite(s.durationSeconds)&&s.durationSeconds>=0):[];
    const time=s=>{const sec=Math.round(s);return `${Math.floor(sec/60)} min ${String(sec%60).padStart(2,'0')} s`;};
    return `<section class="gpx-preview" ${preview?'data-gpx-preview':''}><p class="asc-eyebrow">GPX · importé, non vérifié</p><h3>${esc(kind)}</h3>
      <p class="asc-small asc-muted">Mesures du fichier d’origine ; les corrections de la séance ne modifient pas ce profil.</p><dl class="gpx-metrics"><div><dt>Distance du fichier</dt><dd>${esc(number(stats.distanceKm,' km'))}</dd></div><div><dt>Temps en mouvement</dt><dd>${esc(number(stats.movingMinutes,' min'))}</dd></div><div><dt>Temps écoulé</dt><dd>${esc(number(stats.elapsedMinutes,' min'))}</dd></div><div><dt>Pauses / coupures estimées</dt><dd>${esc(number(stats.pauseMinutes,' min'))}</dd></div><div><dt>D+ / D− du fichier</dt><dd>${finite(stats.ascent)&&finite(stats.descent)?`${esc(number(stats.ascent))} / ${esc(number(stats.descent,' m'))}`:'Altitude non disponible'}</dd></div></dl>
      ${preview?route(stats):''}${profile(stats)}${terrainOn()?terrainSummary(stats):''}
      ${stats.altitudeSource==='partial'?'<p class="asc-small asc-muted">Altitude partielle : dénivelé non calculé sur une trace incomplète.</p>':''}
      ${splits.length?`<details class="gpx-splits" data-gpx-splits><summary>Temps par kilomètre <small>pauses incluses · fragments séparés</small></summary><div class="gpx-table"><table><thead><tr><th scope="col">Portion</th><th scope="col">Distance</th><th scope="col">Temps</th></tr></thead><tbody>${splits.map((s,i)=>`<tr><th scope="row">${i+1}</th><td>${esc(number(s.distanceKm,' km'))}</td><td>${time(s.durationSeconds)}</td></tr>`).join('')}</tbody></table></div></details>`:''}
      <p class="asc-small asc-faint">${stats.kind==='recorded'?'Les chiffres du fichier restent modifiables et ne certifient pas l’effort.':'Ce fichier ne fournit pas de durée sportive exploitable. Il ne peut pas enregistrer automatiquement une activité.'} ${preview?'Le tracé précis reste sur cet appareil ; seuls les chiffres et le profil sont sauvegardés.':''}</p>
      ${preview?'<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="clear-gpx">Repartir en saisie manuelle</button>':''}</section>`;
  }
  root.TitanGpxView={render,profile,setMode};
})(window);
