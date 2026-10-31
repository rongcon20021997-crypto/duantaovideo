"use strict";
(()=>{
 const core=globalThis.DTVAssetCore;
 if(!core)return;
 // Flow often navigates from home to /project via SPA (without reload).
 // Always inject on flow.google.com, then derive the live project per scan.
 const VERSION="1.0.0";
 const ROOT=document.documentElement;
 const STORAGE_KEY="dtvAssetRegistryV1";
 let observer=null,busy=false,needsScan=false,persistPending=false;
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>12&&r.height>12&&s.display!=="none"&&s.visibility!=="hidden";};
 const text=el=>((el?.getAttribute?.("aria-label")||"")+" "+(el?.innerText||"")).trim();
 const UPLOAD=/tải nội dung nghe nhìn lên|upload (?:media|image|files?|from computer)/i;
 function pickerRoot(){
  const controls=[...document.querySelectorAll("button,[role=button]")].filter(el=>visible(el)&&UPLOAD.test(text(el)));
  for(const btn of controls){
   for(let parent=btn.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    if(!visible(parent))continue;
    const search=parent.querySelector('[role=searchbox],input[placeholder*="Tìm kiếm"],input[placeholder*="Search"]');
    if(search&&visible(search))return parent;
   }
  }
  return null;
 }
 function closestMediaTile(image,picker){
  for(let node=image.parentElement;node&&node!==picker;node=node.parentElement){
   const t=(node.innerText||"").trim();
   if(t.length>0&&t.length<320&&(core.looksLikeFilename(t)||node.getAttribute("aria-selected")!==null||node.hasAttribute("tabindex")))return node;
  }
  return image.parentElement||image;
 }
 function filename(tile,img){
  const attrs=[tile.getAttribute("title"),tile.getAttribute("aria-label"),img.getAttribute("alt")].filter(Boolean);
  const txt=(tile.innerText||"").trim().split(/\r?\n/).map(s=>s.trim()).find(s=>core.looksLikeFilename(s));
  return core.cleanLabel(txt||attrs.find(s=>core.looksLikeFilename(s))||attrs[0]||"");
 }
 function identityFor(tile,img,label){
  const attrs={};
  for(const name of ["data-asset-id","data-media-id","data-item-id","data-resource-id","data-file-id"]){
   let node=img;
   for(let i=0;i<4&&node;i++,node=node.parentElement){
    if(node===document.body)break;
    const value=node.getAttribute?.(name);
    if(value){attrs[name]=value;break;}
   }
  }
  return core.identity({project:PROJECT,attrs,src:img.currentSrc||img.src||"",label});
 }
 async function persist(entries){
  if(!entries.length||!chrome?.storage?.local)return;
  try{
   const result=await chrome.storage.local.get(STORAGE_KEY);
   const old=Array.isArray(result[STORAGE_KEY])?result[STORAGE_KEY]:[];
   const unique=new Map(old.filter(v=>v&&typeof v.key==="string").map(v=>[v.project+"|"+v.key,v]));
   for(const item of entries)unique.set(item.project+"|"+item.key,item);
   await chrome.storage.local.set({[STORAGE_KEY]:[...unique.values()].slice(-400)});
  }catch{ /* Chrome may be closing; DOM bridge still works. */ }
 }
 async function scan(){
  if(busy){needsScan=true;return;}busy=true;
  try{
   ROOT.dataset.dtvExtensionReady="1";ROOT.dataset.dtvExtensionVersion=VERSION;
   const PROJECT=core.projectFromUrl(location.href);
   if(!PROJECT){ROOT.dataset.dtvPickerVisible="0";ROOT.dataset.dtvAssetCount="0";return;}
   const picker=pickerRoot();
   if(!picker){ROOT.dataset.dtvPickerVisible="0";return;}
   ROOT.dataset.dtvPickerVisible="1";
   picker.setAttribute("data-dtv-picker","1");
   const entries=[];
   for(const img of [...picker.querySelectorAll("img")].slice(0,150)){
    if(!visible(img)||img.naturalWidth<48||img.naturalHeight<48)continue;
    const tile=closestMediaTile(img,picker),label=filename(tile,img);
    const id=identityFor(tile,img,label);
    if(!id)continue;
    // The key is an explicit DOM asset identifier if available; otherwise
    // a local fingerprint of stable visible metadata (not a Google ID).
    img.dataset.dtvAssetKey=id.key;
    img.dataset.dtvAssetKind=id.kind;
    if(label)img.dataset.dtvAssetLabel=label;
    entries.push({project:PROJECT,key:id.key,kind:id.kind,label,updatedAt:Date.now()});
   }
   ROOT.dataset.dtvAssetCount=String(entries.length);
   if(entries.length&&!persistPending){
    persistPending=true;
    await persist(entries);
    persistPending=false;
   }
  }finally{
   busy=false;
   if(needsScan){needsScan=false;queueMicrotask(scan);}
  }
 }
 function schedule(){
  if(needsScan)return;
  needsScan=true;
  setTimeout(()=>{needsScan=false;void scan();},350);
 }
 ROOT.dataset.dtvExtensionReady="1";
 ROOT.dataset.dtvExtensionVersion=VERSION;
 ROOT.dataset.dtvAssetCount="0";
 observer=new MutationObserver(schedule);
 observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src","aria-selected","title"]});
 void scan();
 chrome.runtime?.onMessage?.addListener((msg,_sender,sendResponse)=>{
  if(msg?.type==="DTV_REFRESH"){void scan().then(()=>sendResponse({ready:true}));return true;}
  return false;
 });
})();
