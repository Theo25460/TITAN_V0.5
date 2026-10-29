/* Local, dependency-free GPX preview. Only bounded numeric coordinates reach SVG. */
(function(root){
  'use strict';
  const esc=s=>root.titanEsc(s);
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const number=(n,unit='')=>finite(n)?`${n.toLocaleString('fr-FR',{maximumFractionDigits:2})}${unit}`:'Non disponible';
  function lines(paths,attr,label){
    const valid=paths.filter(p=>p.length>=2);
    if(!valid.length)return '';
    const points=valid.flat(), xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const dx=maxX-minX||1,dy=maxY-minY||1;
    return `<svg ${attr} viewBox="0 0 320 160" role="img" aria-label="${esc(label)}">${valid.map(path=>`<polyline points="${path.map(p=>`${(12+(p[0]-minX)/dx*296).toFixed(2)},${(148-(p[1]-minY)/dy*136).toFixed(2)}`).join(' ')}"/>`).join('')}</svg>`;
  }
  function route(stats){
    if(!Array.isArray(stats.previewSegments))return '';
    const segments=stats.previewSegments.slice(0,160).map(s=>Array.isArray(s)?s.slice(0,320).filter(p=>Array.isArray(p)&&p.length===2&&finite(p[0])&&finite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180):[]);
    const pts=segments.flat(),first=pts[0];if(!first)return '';
    const center=pts.reduce((n,p)=>n+p[0],0)/pts.length,cos=Math.max(.01,Math.cos(center*Math.PI/180));
    let paths=segments.map(segment=>segment.map(p=>[(((p[1]-first[1]+540)%360)-180)*cos,p[0]]));
    // Preserve geographic proportions in the schematic; longitude and latitude are never labelled.
    const all=paths.flat(),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
    const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys),extent=Math.max(dx,dy*296/136,.000001);
    const x0=Math.min(...xs),y0=Math.min(...ys),scale=296/extent;
    paths=paths.map(p=>p.map(([x,y])=>[12+(x-x0)*scale+(296-dx*scale)/2,148-(y-y0)*scale-(136-dy*scale)/2]));
    return `<figure class="gpx-figure"><svg data-gpx-route viewBox="0 0 320 160" role="img" aria-label="Aperçu schématique du parcours">${paths.filter(p=>p.length>=2).map(p=>`<polyline points="${p.map(([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}"/>`).join('')}</svg><figcaption>Aperçu schématique · sans fond de carte</figcaption></figure>`;
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
      ${preview?route(stats):''}${profile(stats)}
      ${stats.altitudeSource==='partial'?'<p class="asc-small asc-muted">Altitude partielle : dénivelé non calculé sur une trace incomplète.</p>':''}
      ${splits.length?`<details class="gpx-splits" data-gpx-splits><summary>Temps par kilomètre <small>pauses incluses · fragments séparés</small></summary><div class="gpx-table"><table><thead><tr><th scope="col">Portion</th><th scope="col">Distance</th><th scope="col">Temps</th></tr></thead><tbody>${splits.map((s,i)=>`<tr><th scope="row">${i+1}</th><td>${esc(number(s.distanceKm,' km'))}</td><td>${time(s.durationSeconds)}</td></tr>`).join('')}</tbody></table></div></details>`:''}
      <p class="asc-small asc-faint">${stats.kind==='recorded'?'Les chiffres du fichier restent modifiables et ne certifient pas l’effort.':'Ce fichier ne fournit pas de durée sportive exploitable. Il ne peut pas enregistrer automatiquement une activité.'} ${preview?'Le tracé précis reste sur cet appareil ; seuls les chiffres et le profil sont sauvegardés.':''}</p>
      ${preview?'<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="clear-gpx">Repartir en saisie manuelle</button>':''}</section>`;
  }
  root.TitanGpxView={render,profile};
})(window);
