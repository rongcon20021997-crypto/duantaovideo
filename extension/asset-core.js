"use strict";
// Pure parsing helpers for the DuAnTaoVideo Flow reference extension.
// A DOM ID is not guaranteed to be Google's public/permanent media ID.
(function(global){
 const FILENAME=/\.(?:png|jpe?g|webp|heic|avif)(?:[_.\s]|$|[^a-z0-9])/i;
 function projectFromUrl(url){
  try{const u=new URL(url);const m=u.pathname.match(/^\/project\/([0-9a-f-]{24,64})/i);
   return u.hostname==="flow.google.com"&&m?"https://flow.google.com/project/"+m[1].toLowerCase():null;
  }catch{return null;}
 }
 function hash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,"0");
 }
 function stripTransientUrl(src){
  try{const u=new URL(src);return u.origin+u.pathname;}catch{return String(src||"").slice(0,300);}
 }
 function cleanLabel(value){
  return String(value||"").trim().replace(/\s+/g," ").slice(0,160);
 }
 function identity({project,attrs={},src="",label=""}){
  if(!projectFromUrl(project))return null;
  const preferred=["data-asset-id","data-media-id","data-item-id","data-resource-id","data-file-id"];
  for(const name of preferred){
   const id=String(attrs[name]||"").trim();
   if(id&&id.length>=5&&id.length<=200&&/^[\w:-]+$/.test(id))return {key:"dom:"+name+":"+id,kind:"dom",rawId:id};
  }
  const normalized=stripTransientUrl(src);
  const filename=cleanLabel(label);
  if(!normalized&&!filename)return null;
  return {key:"local:"+hash(project+"|"+normalized+"|"+filename.toLowerCase()),kind:"local",rawId:null};
 }
 function looksLikeFilename(s){return FILENAME.test(String(s||""));}
 const api={projectFromUrl,hash,stripTransientUrl,cleanLabel,identity,looksLikeFilename};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 global.DTVAssetCore=api;
})(typeof window!=="undefined"?window:globalThis);
