/* Read-only quest presentation. Account v3 targets/progress come exclusively from the server.
   Discovery and older servers keep indicative personal preparations. No mutation here. */
(function(root){
  'use strict';
  const encounters = [
    ['Les lueurs éteintes','Le sentier disparaît dans la brume. Le passeur te confie trois préparatifs pour retrouver la première lumière.','Une lueur répond à tes préparatifs. Le sentier commence à se dessiner.','Les lueurs dessinent le passage. Tu peux poursuivre à ton rythme.'],
    ['Le pont des possibles','Les planches du pont sont couvertes de brume. Prépare ton passage avec les missions de ce chapitre.','Des repères se révèlent sur le pont. Tes préparatifs prennent forme.','Le pont se dessine dans la brume. Tes préparatifs sont réunis.'],
    ['Le carnet du passeur','Le passeur cherche une trace du chemin. Un retour, un effort et quelques mots lui raconteront ton passage.','Le carnet accueille les premières traces de ton chapitre.','Le passeur referme son carnet : ton passage a une histoire.'],
    ['Le refuge des cèdres','Le refuge attend des voyageurs à leur rythme. Prépare une halte sans sacrifier tes jours de repos.','Le refuge retrouve ses repères au fil de tes préparatifs.','Le refuge est prêt pour ta halte. Rien ne presse pour repartir.'],
    ['Les échos du lac','Des échos brouillent le sentier du lac. Tes traces personnelles donnent un sens au chemin.','Les échos se distinguent peu à peu. Tes repères se rejoignent.','Le lac reflète tes préparatifs. Tu retrouves le fil de ton aventure.'],
    ['L’atelier des repères','Le vieux mécanisme attend tes repères plutôt que ta force. Rassemble ce qui t’aide à comprendre ton effort.','Les pièces du mécanisme retrouvent leur place.','Le mécanisme prend forme. Tu as réuni tes repères.'],
    ['La montée des lucioles','Les lucioles suivent les chemins qui se répètent. Prépare cette montée à partir de ta pratique habituelle.','Une première ligne de lucioles accompagne tes préparatifs.','Les lucioles éclairent ta montée. Tes préparatifs sont réunis.'],
    ['Le cercle de pierre','Le cercle garde la route du Veilleur. Tes préparatifs racontent comment tu es arrivé jusque-là.','Le cercle laisse apparaître les traces de ton parcours.','Les pierres révèlent ton passage. Tu peux avancer vers le Veilleur.'],
    ['Devant le Veilleur','Le Veilleur observe tes préparatifs. Ces missions restent facultatives : son épreuve suit les objectifs de la balise.','Tes préparatifs prennent forme devant le Veilleur.','Tes préparatifs sont réunis. L’épreuve du gardien reste confirmée par la campagne.']
  ];
  const finite = v => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : 0;
  const invalid = l => !l || l.archived_at || l.is_suspicious || ['rejected','flagged','pending_review'].includes(l.status) || l.details?.historical===true || l.details?.historical==='true';
  const rewards={days:'Éclat de constance',effort:'Éclat d’élan',note:'Éclat de mémoire'};
  const names={days:['Retrouver le chemin','jours actifs'],effort:['Rassembler les éclats','min d’effort'],note:['Laisser une trace','séance annotée']};
  function rewardName(id){return rewards[id]||null;}
  function serverPlan(c){
    const data=c.quests,profile=data?.profile;
    if(data?.version!==1||!profile||!Array.isArray(data.items)||data.items.length!==3)return null;
    const quests=[];
    for(const id of ['days','effort','note']){
      const q=data.items.find(q=>q.id===id),max=id==='days'?3:id==='effort'?45:1;
      if(!q||!Number.isFinite(q.target)||q.target<1||q.target>max||!Number.isFinite(q.value)||q.value<0||typeof q.complete!=='boolean')return null;
      quests.push({id,name:names[id][0],unit:names[id][1],value:Math.min(q.target,q.value),target:q.target,available:true,complete:q.complete,reward:rewards[id]});
    }
    const completed=quests.filter(q=>q.complete).length;
    const scene=c.id==='aube'?encounters[c.chapter-1]:['Les repères du voyage','Trois missions facultatives accompagnent ce chapitre.','Tes préparatifs prennent forme.','Tes préparatifs sont réunis.'];
    return {chapter:c.chapter,authority:'server',profile:{...profile},quests,completed,encounter:{name:scene[0],text:scene[completed===3?3:completed?2:1]}};
  }
  function plan({campaign:c,history=[],guest=false,owner=null,effortOf,serverVersion=0}={}){
    if(!guest&&serverVersion>=3){
      if(!['aube','marees','forge','aurores'].includes(c?.id)||!Number.isInteger(c.chapter)||c.chapter<1||c.chapter>9)return null;
      return serverPlan(c);
    }
    if(c?.id!=='aube'||!Number.isInteger(c.chapter)||c.chapter<1||c.chapter>9)return null;
    const anchor=Date.parse(c.started_at),from=anchor-28*86400000;
    const owned=l=>!owner||!l.user_id||l.user_id===owner;
    const prior=history.filter(l=>{
      if(invalid(l)||!owned(l))return false;
      const reward=l.details?.serverReward;
      const confirmedReceipt=l.syncStatus==='confirmed' && reward && typeof reward==='object' && !Array.isArray(reward);
      if(!guest && (l.syncStatus && l.syncStatus!=='confirmed' || reward!==true && reward!=='true' && !confirmedReceipt))return false;
      const date=Date.parse(l.date),created=Date.parse(l.created_at||l.date);
      return Number.isFinite(anchor)&&Number.isFinite(date)&&Number.isFinite(created)&&date>=from&&date<anchor&&created<anchor;
    });
    const daily=new Map();
    for(const l of prior){
      const day=String(l.date).slice(0,10);
      const effort=finite(effortOf?effortOf(l):l.details?.effort?.effort_minutes);
      daily.set(day,Math.min(90,(daily.get(day)||0)+effort));
    }
    const days=daily.size,daysTarget=days<=4?1:days<=12?2:3;
    const efforts=[...daily.values()].filter(n=>n>0).sort((a,b)=>a-b);
    const mid=Math.floor(efforts.length/2);
    const median=efforts.length?(efforts.length%2?efforts[mid]:(efforts[mid-1]+efforts[mid])/2):30;
    const effortTarget=Math.min(45,Math.max(15,Math.round(median/10)*5));
    const sources=new Set((c.evidence?.source_ids||[]).map(String));
    const noted=history.some(l=>!invalid(l)&&owned(l)&&(sources.has(String(l.id))||sources.has(String(l.client_event_id)))&&String(l.details?.note||l.details?.notes||'').trim().length>=10);
    const quest=(id,name,value,target,unit,available=true)=>({id,name,value:Math.min(target,finite(value)),target,unit,available,complete:available&&finite(value)>=target});
    const effortAvailable=c.evidence?.effort!=null&&Number.isFinite(Number(c.evidence.effort));
    const quests=[
      quest('days','Retrouver le chemin',c.evidence?.days,daysTarget,'jours actifs'),
      quest('effort','Rassembler les éclats',c.evidence?.effort,effortTarget,'min d’effort',effortAvailable),
      quest('note','Laisser une trace',noted?1:0,1,'séance annotée')
    ];
    const completed=quests.filter(q=>q.complete).length,[name,intro,progress,ending]=encounters[c.chapter-1];
    return {chapter:c.chapter,profile:{days,daysTarget,effortTarget,windowDays:28},quests,completed,encounter:{name,text:completed===3?ending:completed?progress:intro}};
  }
  const api={plan,rewardName};root.TitanCampaignQuests=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
