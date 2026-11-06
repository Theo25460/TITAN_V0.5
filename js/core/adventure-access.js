/* Versioned campaign access shared by Web and native; no entitlement is invented locally. */
(function(root){
 'use strict';
 const WORLDS=['aube','marees','forge','aurores'];
 const unavailable=()=>({state:'unavailable',reason:'L’accès à ce monde n’est pas confirmé par le serveur. Actualise l’aventure ou réessaie plus tard. Tes acquis sont conservés.'});
 function worldAccess(snapshot,worldId){
  if(!snapshot||!WORLDS.includes(worldId))return unavailable();
  if(Number(snapshot.version)>=3)return {state:'open'};
  const campaign=snapshot.campaigns?.find(c=>c.id===worldId);
  if(campaign?.tier==='free'||(campaign?.tier==='plus'&&snapshot.plus===true))return {state:'open'};
  return unavailable();
 }
 const api={worldAccess};root.TitanAdventureAccess=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
