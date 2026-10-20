/* Campaign encounters are a narration of the existing confirmed objectives.
   Read-only: readiness never grants a victory or a reward. */
(function(root){
  'use strict';
  const obstacles=[
    ['Le voile de brume','La brume cache la première balise. Un premier jour admissible trace ton passage.'],
    ['Le pont entravé','Le pont se révèle au fil de tes retours. Les jours admissibles de ce chapitre préparent la traversée.'],
    ['Les ronces du passeur','Les ronces laissent apparaître une piste à chacun de tes retours.'],
    ['La brume des cèdres','Le refuge se distingue dans la brume. Ta régularité dessine son accès.'],
    ['Les échos trompeurs','Les échos se dissipent quand tes jours de pratique deviennent des repères.'],
    ['Le mécanisme brisé','Le mécanisme retrouve ses repères au fil des jours admissibles du chapitre.'],
    ['Le sentier obscur','Le sentier se laisse découvrir à chaque retour, sans exiger une séance démesurée.'],
    ['Le cercle scellé','Les pierres reconnaissent les jours où tu reviens. Le chemin du Veilleur se prépare.']
  ];
  function describe(c,progress){
    if(c?.id!=='aube'||!Number.isInteger(c.chapter)||c.chapter<1||c.chapter>9||!progress?.objectives?.length)return null;
    const day=progress.objectives.find(o=>o.id==='days');if(!day)return null;
    const phase=(id,name,value,target,unit)=>({id,name,value:Math.min(value,target),target,unit,complete:target>0&&value>=target});
    const guardian=c.chapter===9,phases=[];
    if(guardian){
      phases.push(phase('arrival','Éveiller le Veilleur',day.value,Math.min(1,day.target),c.route==='journal'?'jour avec une séance annotée':'jour actif'));
      const effort=progress.objectives.find(o=>o.id==='effort');
      if(effort)phases.push(phase('effort','Soutenir l’épreuve',effort.value,effort.target,'min d’effort'));
      phases.push(phase('regularity','Gagner sa reconnaissance',day.value,day.target,c.route==='journal'?'jours avec une séance annotée':'jours actifs'));
    }else phases.push(phase('passage','Préparer le passage',day.value,day.target,c.route==='journal'?'jours avec une séance annotée':'jours actifs'));
    const current=phases.findIndex(p=>!p.complete);
    phases.forEach((p,i)=>{p.state=p.complete?'done':i===current?'active':'waiting';});
    const [name,text]=guardian?['Le Veilleur de pierre','Le Veilleur mesure tes retours et l’effort du chapitre. Ses phases avancent avec tes preuves sportives.']:obstacles[c.chapter-1];
    return {kind:guardian?'guardian':'obstacle',name,text,phases,percent:progress.percent,ready:progress.ready,state:progress.ready?'ready':'active'};
  }
  const api={describe};root.TitanCampaignEncounters=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
