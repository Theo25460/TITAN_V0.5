/* V1.5.2 — Camp et conséquences. The canonical outcome of the Veilleur (V1.5.1) becomes a lasting access in the Vallée de
   l'Aube, reached from one existing return point: le Camp de base. Shared unchanged by the website and the Android app
   (mobile/src/core/web/adventure-consequence.js is a byte copy, checked by hash). The server stays the authority: the
   outcome, the discovery and the visits come from titan_adventure_consequences_v1. This module only describes the contract
   (the server holds the same JSON, checked by tests/adventure-consequence.test.mjs) and turns a server item into what both
   clients show. It never grants, never stores and never guesses a discovery. No XP, no credits, no LIVE resources. */
(function(root){
  'use strict';
  // Every visible string has a key so that the January translation adds a locale without touching the structure.
  const strings={fr:{
    'camp.eyebrow':'Retour de la Vallée de l’Aube',
    'rules':'Accès gagné au terme de l’arc pilote. Il ne donne ni XP, ni crédits, ni ressources du Camp, et ne compte aucun effort : aucune balise ni aucun seuil n’est contourné.',
    'privacy':'Ce récit reste privé : il n’apparaît ni sur ta carte publique, ni chez tes amis, ni chez ton coach.',
    'feedback.title':'Ton essai',
    'visits':'{visits} passage(s) depuis ta découverte.',
    'visits.none':'Pas encore emprunté depuis ta découverte.',
    'unknown.text':'Cette version de l’accès n’est pas connue de l’application. Mets-la à jour pour continuer, ta découverte est conservée.',
    'error.CONSEQUENCE_UNAVAILABLE':'Aucune conséquence de la Vallée n’est liée à ton compte pour l’instant.',
    'error.CONSEQUENCE_INCOMPATIBLE':'Cette version de l’accès n’est pas connue de l’application. Ta découverte est conservée.',
    'error.CONSEQUENCE_NOT_DISCOVERED':'Découvre d’abord l’accès depuis ton croquis ou ton fragment.',
    'error.INVALID_MARKS':'Ce choix ne correspond pas aux repères visibles.',
    'error.offline':'Hors ligne : l’accès s’ouvre avec le serveur. Ta découverte est conservée.',
    'error.sync':'Synchronisation impossible. Rien n’est perdu : l’écran garde le dernier état confirmé par le serveur. Réessaie.',
    // La corniche: the passage reopened, the sketch and two landmarks give a shortcut between two sectors already open.
    'passage_rouvert.camp.title':'Le passage rouvert',
    'passage_rouvert.camp.discover':'Le camp retrouve le passage rouvert. Au belvédère, ton croquis peut révéler un raccourci entre deux secteurs déjà ouverts.',
    'passage_rouvert.camp.open':'Ton raccourci relie la clairière des lucioles au passage du Veilleur. Tu peux l’emprunter à chaque visite.',
    'passage_rouvert.camp.cta.discover':'Monter au belvédère',
    'passage_rouvert.camp.cta.open':'Emprunter le raccourci',
    'passage_rouvert.title':'Le belvédère du passage',
    'passage_rouvert.intro':'Au-dessus du passage rouvert, le belvédère domine la vallée. Sur ton croquis, tu as noté deux repères l’un derrière l’autre. Aligne-les pour retrouver le raccourci.',
    'passage_rouvert.item.name':'Ton croquis de la corniche',
    'passage_rouvert.item.text':'Au premier plan, un tas de pierres fendu ; plus loin sur la crête, un arbre à terre. Les deux traits se suivent sur une même ligne.',
    'passage_rouvert.marks.title':'Repères visibles depuis le belvédère',
    'passage_rouvert.need':'Choisis deux repères : le second choix les aligne.',
    'passage_rouvert.select':'Viser {mark}',
    'passage_rouvert.selected':'Premier repère : {mark}. Choisis le second.',
    'passage_rouvert.unselect':'Changer de premier repère',
    'passage_rouvert.align':'Aligner avec {mark}',
    'passage_rouvert.mark.cairn.name':'le cairn fendu',
    'passage_rouvert.mark.cairn.text':'Un tas de pierres fendu en deux, au bord du sentier.',
    'passage_rouvert.mark.pin.name':'le pin couché',
    'passage_rouvert.mark.pin.text':'Un pin abattu par le vent, sur la crête.',
    'passage_rouvert.mark.tour.name':'la tour des passeurs',
    'passage_rouvert.mark.tour.text':'Une tour ruinée, de l’autre côté de la vallée.',
    'passage_rouvert.mark.cascade.name':'la cascade',
    'passage_rouvert.mark.cascade.text':'Un filet d’eau qui tombe de la falaise.',
    'passage_rouvert.wrong.tour':'La tour des passeurs est de l’autre côté de la vallée : elle n’est pas sur ton croquis. Cherche ce qui est à terre sur la crête.',
    'passage_rouvert.wrong.cascade':'La cascade tombe de la falaise, hors de ton croquis. Ton premier plan est un tas de pierres au bord du sentier.',
    'passage_rouvert.right':'Le cairn fendu et le pin couché s’alignent : entre eux, une sente descend droit vers la clairière des lucioles. Le raccourci est ouvert.',
    'passage_rouvert.open':'Le raccourci relie la clairière des lucioles au passage du Veilleur, deux secteurs que tu as déjà ouverts.',
    'passage_rouvert.from':'La clairière des lucioles',
    'passage_rouvert.to':'Le passage du Veilleur',
    'passage_rouvert.visit':'Emprunter le raccourci',
    'passage_rouvert.vignette.0':'Tu descends la sente entre le cairn et le pin. Les lucioles s’allument une à une à ton passage.',
    'passage_rouvert.vignette.1':'Au milieu du raccourci, une borne porte la marque du Veilleur : un sabot gravé dans la pierre.',
    'passage_rouvert.vignette.2':'Tu arrives au passage par le haut. Le Veilleur, à l’écart, tourne la tête vers toi puis reprend sa garde.',
    // Les ruines: the oath restored, the fragment and the engravings reveal the symbol of an annex room.
    'serment_restitue.camp.title':'Le serment restauré',
    'serment_restitue.camp.discover':'Le camp retrouve le serment restauré. Dans l’archive des passeurs, ton fragment peut révéler le symbole d’une salle annexe.',
    'serment_restitue.camp.open':'La salle annexe de l’archive des passeurs reste ouverte pour toi. Tu peux y revenir à chaque visite.',
    'serment_restitue.camp.cta.discover':'Ouvrir l’archive',
    'serment_restitue.camp.cta.open':'Entrer dans la salle annexe',
    'serment_restitue.title':'L’archive des passeurs',
    'serment_restitue.intro':'Le Veilleur t’a confié l’archive des passeurs. Sur sa carte de la vallée, quatre gravures marquent d’anciens lieux. Rapproche ton fragment de la gravure qui lui répond : son symbole ouvre une salle annexe.',
    'serment_restitue.item.name':'Ton fragment du serment',
    'serment_restitue.item.text':'« Je garde le passage tant que mes bois portent la lumière de la vallée. »',
    'serment_restitue.marks.title':'Gravures de la carte',
    'serment_restitue.need':'Choisis une gravure : ton fragment s’y pose.',
    'serment_restitue.select':'Poser le fragment sur {mark}',
    'serment_restitue.mark.cerf.name':'les bois du cerf',
    'serment_restitue.mark.cerf.text':'Des bois de cerf gravés près du cercle de pierre.',
    'serment_restitue.mark.soleil.name':'le soleil levant',
    'serment_restitue.mark.soleil.text':'Un soleil à demi levé au-dessus de la clairière.',
    'serment_restitue.mark.spirale.name':'la spirale',
    'serment_restitue.mark.spirale.text':'Une spirale serrée sur le refuge des cèdres.',
    'serment_restitue.mark.vague.name':'les trois vagues',
    'serment_restitue.mark.vague.text':'Trois vagues au bord de la rivière.',
    'serment_restitue.wrong.soleil':'Le soleil levant marque la clairière. Ton fragment ne parle pas de la lumière elle-même, mais de ce qui la porte.',
    'serment_restitue.wrong.spirale':'La spirale marque le refuge des cèdres. Ton fragment ne parle pas d’un chemin qui tourne : relis ce qui porte la lumière.',
    'serment_restitue.wrong.vague':'Les vagues marquent la rivière. Ton fragment ne parle pas d’eau : relis ce qui porte la lumière.',
    'serment_restitue.right':'Les bois du cerf répondent à ton fragment. Le symbole s’illumine et une porte s’ouvre au fond de l’archive : la salle annexe.',
    'serment_restitue.open':'La salle annexe de l’archive reste ouverte pour toi, à côté de la salle où le Veilleur t’a confié ses registres.',
    'serment_restitue.from':'L’archive des passeurs',
    'serment_restitue.to':'La salle annexe',
    'serment_restitue.visit':'Entrer dans la salle annexe',
    'serment_restitue.vignette.0':'Dans la salle annexe, les registres des passeurs racontent ceux qui ont franchi la vallée avant toi.',
    'serment_restitue.vignette.1':'Une niche abrite une lanterne éteinte. Sous elle, quelqu’un a gravé : « Revenir est déjà un chemin. »',
    'serment_restitue.vignette.2':'Sur le mur du fond, le serment complet est recopié. Ta ligne y figure désormais.'
  }};
  function t(key,vars={},locale='fr'){
    const table=strings[locale]||strings.fr,raw=table[key]??strings.fr[key]??key;
    return raw.replace(/\{(\w+)\}/g,(_,k)=>vars[k]!=null?String(vars[k]):'');
  }
  /* The server contract. One consequence per canonical outcome of the guardian: answer is the set of marks the server
     accepts (order does not matter); from/to are sectors the player already opened (the arc's first place and the
     guardian's passage, or the archive the Veilleur handed over). */
  const CONSEQUENCES={'veilleur-retour':{current:1,versions:{1:{
    id:'veilleur-retour',version:1,world:'aube',guardian:'veilleur',guardianVersions:[1],returnPoint:'camp',
    outcomes:[
      {outcome:'passage_rouvert',route:'corniche',kind:'shortcut',item:'croquis',marks:['cairn','pin','tour','cascade'],answer:['cairn','pin'],from:'clairiere',to:'passage'},
      {outcome:'serment_restitue',route:'ruines',kind:'annex',item:'fragment',marks:['cerf','soleil','spirale','vague'],answer:['cerf'],from:'archive',to:'salle-annexe'}
    ]
  }}}};
  const contract=(id,version)=>CONSEQUENCES[id]?.versions?.[version]||null;
  const consequenceFor=world=>Object.values(CONSEQUENCES).map(c=>c.versions[c.current]).find(c=>c.world===world)||null;
  // Where the access lives in the Vallée. The Camp links here: one tap, and the interaction is the next one.
  const href=world=>`/adventure?world=${encodeURIComponent(world)}#retour`;

  /* Server item → view model, identical on both clients. Returns null when no consequence is linked to the account. */
  function view(item,locale='fr',selected=null){
    if(!item||item.state==='none')return null;
    const cfg=contract(item.id,item.version),o=cfg?.outcomes.find(x=>x.outcome===item.outcome);
    if(!cfg||!o||item.state==='unknown')return {state:'unknown',world:item.world||null,text:t('unknown.text',{},locale)};
    const k=o.outcome,name=id=>t(`${k}.mark.${id}.name`,{},locale);
    const open=item.state==='open',need=o.answer.length;
    const first=!open&&need>1&&o.marks.includes(selected)?selected:null;
    const marks=o.marks.map(id=>({id,name:name(id),text:t(`${k}.mark.${id}.text`,{},locale),selected:id===first,
      label:need>1?(first&&first!==id?t(`${k}.align`,{mark:name(id)},locale):t(`${k}.select`,{mark:name(id)},locale)):t(`${k}.select`,{mark:name(id)},locale),
      // With two marks, the first choice stays on this device until the second one sends the alignment.
      sends:need===1||(first!==null&&first!==id)}));
    const last=Array.isArray(item.lastAnswer)?item.lastAnswer:[];
    let feedback=null;
    if(!open&&last.length&&item.lastCorrect===false){
      const wrong=last.find(m=>!o.answer.includes(m))||last[0];
      feedback={correct:false,attempts:Number(item.attempts)||0,text:t(`${k}.wrong.${wrong}`,{},locale)};
    }
    if(open)feedback={correct:true,attempts:Number(item.attempts)||0,text:t(`${k}.right`,{},locale)};
    const visits=Number(item.visits)||0;
    const camp={eyebrow:t('camp.eyebrow',{},locale),title:t(`${k}.camp.title`,{},locale),text:t(`${k}.camp.${open?'open':'discover'}`,{},locale),
      cta:t(`${k}.camp.cta.${open?'open':'discover'}`,{},locale),href:href(item.world||cfg.world),world:item.world||cfg.world};
    return {id:cfg.id,version:cfg.version,world:item.world||cfg.world,state:item.state,outcome:k,kind:o.kind,route:o.route,need,camp,
      title:t(`${k}.title`,{},locale),intro:t(`${k}.intro`,{},locale),
      item:{name:t(`${k}.item.name`,{},locale),text:t(`${k}.item.text`,{},locale)},
      marksTitle:t(`${k}.marks.title`,{},locale),needText:t(`${k}.need`,{},locale),marks:open?[]:marks,
      selectedText:first?t(`${k}.selected`,{mark:name(first)},locale):'',unselect:first?t(`${k}.unselect`,{},locale):'',feedback,
      access:open?{text:t(`${k}.open`,{},locale),from:t(`${k}.from`,{},locale),to:t(`${k}.to`,{},locale),action:t(`${k}.visit`,{},locale),
        visits,visitsText:visits?t('visits',{visits},locale):t('visits.none',{},locale),
        vignette:visits?t(`${k}.vignette.${(visits-1)%3}`,{},locale):''}:null,
      discoveredAt:item.discoveredAt||null,rules:t('rules',{},locale),privacy:t('privacy',{},locale)};
  }
  /* The Camp's entries: one per linked consequence, nothing at all for an account without a resolved pilot guardian. */
  function campEntries(payload,locale='fr'){
    return (payload?.items||[]).map(i=>view(i,locale)).filter(v=>v&&v.state!=='unknown').map(v=>({...v.camp,state:v.state,outcome:v.outcome}));
  }
  const itemFor=(payload,world)=>(payload?.items||[]).find(i=>i.world===world)||null;
  function errorText(code,locale='fr'){
    if(code==='RPG_OFFLINE'||code==='CONSEQUENCE_OFFLINE')return t('error.offline',{},locale);
    if(strings.fr[`error.${code}`])return t(`error.${code}`,{},locale);
    if(code==='RPG_TIMEOUT'||/fetch|network|timeout/i.test(String(code||'')))return t('error.sync',{},locale);
    return '';
  }
  const api={CONSEQUENCES,strings,t,contract,consequenceFor,href,view,campEntries,itemFor,errorText};
  root.TitanAdventureConsequence=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
