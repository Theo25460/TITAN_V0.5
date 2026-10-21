/* Campaign encounters are a narration of the existing confirmed objectives.
   Read-only: readiness never grants a victory or a reward. */
(function(root){
  'use strict';
  const obstacles={
    aube:[
      ['Le voile de brume','La brume cache la première balise. Un premier jour admissible trace ton passage.'],
      ['Le pont entravé','Le pont se révèle au fil de tes retours. Les jours admissibles de ce chapitre préparent la traversée.'],
      ['Les ronces du passeur','Les ronces laissent apparaître une piste à chacun de tes retours.'],
      ['La brume des cèdres','Le refuge se distingue dans la brume. Ta régularité dessine son accès.'],
      ['Les échos trompeurs','Les échos se dissipent quand tes jours de pratique deviennent des repères.'],
      ['Le mécanisme brisé','Le mécanisme retrouve ses repères au fil des jours admissibles du chapitre.'],
      ['Le sentier obscur','Le sentier se laisse découvrir à chaque retour, sans exiger une séance démesurée.'],
      ['Le cercle scellé','Les pierres reconnaissent les jours où tu reviens. Le chemin du Veilleur se prépare.']
    ],
    marees:[
      ['La carte brouillée','Les îles se dessinent à mesure que tu reviens. Un premier jour admissible trace la côte.'],
      ['Le phare éteint','Le phare se rallume au fil de tes retours, sans exiger une séance démesurée.'],
      ['Les récifs de la crique','Les récifs s’écartent quand tes jours de pratique deviennent des repères.'],
      ['Les voiles déchirées','Les voiles se recousent à chacun de tes retours. Le départ redevient simple.'],
      ['La boussole affolée','L’aiguille se calme quand ta régularité fixe un cap qui t’appartient.'],
      ['Le brouillard des nuances','Le brouillard se lève au rythme des jours admissibles de ce chapitre.'],
      ['Le courant de travers','Le courant se laisse traverser jour après jour, à ton propre rythme.'],
      ['La marée basse','La marée revient : une semaine légère n’efface pas ton chemin. Tes retours rouvrent le jardin.']
    ],
    forge:[
      ['Le foyer froid','Le foyer reprend vie avec un premier jour admissible. Aucune séance démesurée n’est demandée.'],
      ['L’enclume muette','L’enclume résonne de nouveau au fil de tes retours.'],
      ['Le soufflet crevé','Le soufflet se répare à chaque jour où tu reviens, sans te presser.'],
      ['Le métal rebelle','Le métal cède peu à peu quand ta régularité dessine des repères.'],
      ['Le moule fendu','Le moule tient lorsque les jours admissibles s’ajoutent les uns aux autres.'],
      ['La trempe trop vive','La trempe se règle avec patience : tes retours affinent la lame.'],
      ['L’étau grippé','L’étau se desserre jour après jour, à la mesure de ton effort réel.'],
      ['La braise sous la cendre','La braise reparaît à chacun de tes retours. Le chemin de l’Artisan se prépare.']
    ],
    aurores:[
      ['Le ciel couvert','Les premières lueurs percent un jour admissible après l’autre.'],
      ['Le givre sur le sentier','Le givre fond au fil de tes retours, sans exiger une séance démesurée.'],
      ['La nuit sans étoiles','Les étoiles reviennent quand tes jours de pratique deviennent des repères.'],
      ['Le vent du nord','Le vent tombe à chacun de tes retours. Le passage s’ouvre en douceur.'],
      ['Le lac gelé','La glace se retire au rythme des jours admissibles de ce chapitre.'],
      ['La crête voilée','La crête se dévoile peu à peu : ta régularité trace l’ascension.'],
      ['Le col enneigé','Le col se dégage jour après jour, à ton propre rythme.'],
      ['L’horizon fermé','L’horizon s’ouvre à chacun de tes retours. La Sentinelle t’attend au sommet.']
    ]
  };
  const guardians={
    aube:['Le Veilleur de pierre','Le Veilleur mesure tes retours et l’effort du chapitre. Ses phases avancent avec tes preuves sportives.',['Éveiller le Veilleur','Soutenir l’épreuve','Gagner sa reconnaissance']],
    marees:['La Gardienne des courants','La Gardienne mesure tes retours et l’effort du chapitre. Ses phases avancent avec tes preuves sportives.',['Éveiller la Gardienne','Traverser le courant','Gagner sa reconnaissance']],
    forge:['L’Artisan de braise','L’Artisan mesure tes retours et l’effort du chapitre. Ses phases avancent avec tes preuves sportives.',['Éveiller l’Artisan','Soutenir la trempe','Gagner sa reconnaissance']],
    aurores:['La Sentinelle du ciel','La Sentinelle mesure tes retours et l’effort du chapitre. Ses phases avancent avec tes preuves sportives.',['Éveiller la Sentinelle','Soutenir l’ascension','Gagner sa reconnaissance']]
  };
  function describe(c,progress){
    if(!obstacles[c?.id]||!Number.isInteger(c.chapter)||c.chapter<1||c.chapter>9||!progress?.objectives?.length)return null;
    const day=progress.objectives.find(o=>o.id==='days');if(!day)return null;
    const phase=(id,name,value,target,unit)=>({id,name,value:Math.min(value,target),target,unit,complete:target>0&&value>=target});
    const guardian=c.chapter===9,phases=[];
    if(guardian){
      const gp=guardians[c.id][2];
      phases.push(phase('arrival',gp[0],day.value,Math.min(1,day.target),c.route==='journal'?'jour avec une séance annotée':'jour actif'));
      const effort=progress.objectives.find(o=>o.id==='effort');
      if(effort)phases.push(phase('effort',gp[1],effort.value,effort.target,'min d’effort'));
      phases.push(phase('regularity',gp[2],day.value,day.target,c.route==='journal'?'jours avec une séance annotée':'jours actifs'));
    }else phases.push(phase('passage','Préparer le passage',day.value,day.target,c.route==='journal'?'jours avec une séance annotée':'jours actifs'));
    const current=phases.findIndex(p=>!p.complete);
    phases.forEach((p,i)=>{p.state=p.complete?'done':i===current?'active':'waiting';});
    const [name,text]=guardian?guardians[c.id]:obstacles[c.id][c.chapter-1];
    return {kind:guardian?'guardian':'obstacle',name,text,phases,percent:progress.percent,ready:progress.ready,state:progress.ready?'ready':'active'};
  }
  const api={describe};root.TitanCampaignEncounters=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
