/* Fixed, cosmetic narrative catalog. Ownership/readiness/rewards are server facts. */
(function(root){
  'use strict';
  const worlds=[
    {id:'aube',name:'La Vallée de l’Aube',places:['La clairière des lucioles','Le refuge des cèdres','Le cercle de pierre'],monster:'Le Renard de brume',boss:'Le Cerf des racines',lore:'Les passeurs n’ont pas construit ces balises pour mesurer la vitesse : ils voulaient que chacun retrouve son chemin.',choices:['Suivre les lucioles','Écouter le passeur']},
    {id:'marees',name:'Les Îles des Marées',places:['La crique des cartes','Le phare des nuances','Le jardin des courants'],monster:'La Raie des mirages',boss:'Le Crabe des récifs',lore:'Les cartes de l’archipel changent avec les marées. Les navigateurs y inscrivent aussi leurs haltes : le repos fait partie du voyage.',choices:['Lire la carte des marées','Questionner la gardienne']},
    {id:'forge',name:'La Forge des Titans',places:['Le foyer des artisans','L’atelier des braises','L’enclume du souvenir'],monster:'Le Scarabée de suie',boss:'Le Golem de cuivre',lore:'Les artisans gardent les traces de chaque réparation. Une fissure réparée raconte davantage qu’une lame jamais éprouvée.',choices:['Réparer le vieux soufflet','Écouter les artisans']},
    {id:'aurores',name:'Les Hauts des Aurores',places:['Le lac des étoiles','Le col du silence','L’observatoire du ciel'],monster:'Le Hibou de givre',boss:'Le Loup des constellations',lore:'L’observatoire reste ouvert les nuits sans étoiles. Les sentinelles savent qu’une lumière invisible n’est pas une lumière perdue.',choices:['Observer les constellations','Partager une histoire']}
  ];
  const kinds=['discovery','choice','monster','lore','treasure','miniboss'];
  const arcs=['Les premiers repères','Les chemins partagés','La mémoire du monde'];
  function path(id){
    const w=worlds.find(w=>w.id===id);if(!w)return [];
    return Array.from({length:18},(_,i)=>{
      const step=i%6,arc=Math.floor(i/6)+1,kind=kinds[step],place=w.places[arc-1];
      const names=[place,'Deux pistes se dessinent',w.monster,'La mémoire du lieu','Le coffre des voyageurs',w.boss];
      const stories=[`Tu découvres ${place}. Le chemin se construit au rythme de tes retours.`,
        `Deux pistes mènent au même refuge. Ton choix change le récit, sans modifier les objectifs.`,
        `${w.monster} brouille le passage. Tes efforts confirmés dissipent son illusion ; aucune séance supplémentaire n’est imposée.`,
        w.lore,`Le coffre contient un souvenir de ${place}. Sa valeur tient à ton histoire, sans XP ni coins.`,
        `${w.boss} protège ce lieu. Plusieurs jours de pratique préparent cette rencontre facultative, sans délai.`];
      return {ordinal:i+1,arc,arcName:arcs[arc-1],chapter:Math.ceil((i+1)/2),kind,name:names[step],story:stories[step],choices:kind==='choice'?w.choices:[],
        endings:kind==='choice'?[`Tu prends le temps de regarder. ${place} révèle une route oubliée.`,`Tu prends le temps d’écouter. Une voix te confie l’histoire de ${place}.`]:[]};
    });
  }
  const familyTitle=family=>`Compagnon · ${family}`;
  const api={worlds,path,familyTitle};root.TitanAdventureRpg=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
