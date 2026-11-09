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
 const visible=el=>{
  if(!el||typeof el.getBoundingClientRect!=="function")return false;
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return r.width>12&&r.height>12&&s.display!=="none"&&s.visibility!=="hidden";
 };
 const text=el=>((el?.getAttribute?.("aria-label")||"")+" "+(el?.innerText||el?.textContent||"")).trim();
 const UPLOAD=/tải nội dung nghe nhìn lên|upload (?:media|image|files?|from computer)|tải ảnh|tải lên/i;
 function pickerRoot(){
  const controls=[...document.querySelectorAll("button,[role=button],label[for]")].filter(el=>visible(el)&&UPLOAD.test(text(el)));
  for(const btn of controls){
   // 1. Try parent containing a search control
   for(let parent=btn.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    if(!visible(parent))continue;
    const search=parent.querySelector('[role=searchbox],input[type=search],input[placeholder*="Tìm" i],input[placeholder*="Search" i]');
    if(search&&visible(search))return parent;
   }
   // 2. Try modal / dialog ancestor
   const dialog=btn.closest('[role="dialog"],[aria-modal="true"],[data-state="open"]');
   if(dialog&&visible(dialog))return dialog;
   // 3. Try ancestor that contains images
   for(let parent=btn.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    if(!visible(parent))continue;
    if(parent.querySelectorAll("img").length>=1)return parent;
   }
  }
  // 4. Any visible dialog with media images
  const openDialog=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(d=>visible(d)&&d.querySelectorAll("img").length>=1);
  if(openDialog)return openDialog;
  return null;
 }
 function closestMediaTile(image,picker){
  for(let node=image.parentElement;node&&node!==picker;node=node.parentElement){
   const t=(node.innerText||"").trim();
   const role=node.getAttribute("role");
   if(t.length>0&&t.length<320&&(core.looksLikeFilename(t)||node.getAttribute("aria-selected")!==null||node.hasAttribute("tabindex")||role==="option"||role==="button"))return node;
  }
  return image.parentElement||image;
 }
 function filename(tile,img){
  const attrs=[tile.getAttribute("title"),tile.getAttribute("aria-label"),img.getAttribute("alt")].filter(Boolean);
  const lines=(tile.innerText||"").trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const txt=lines.find(s=>core.looksLikeFilename(s));
  return core.cleanLabel(txt||attrs.find(s=>core.looksLikeFilename(s))||attrs[0]||lines[0]||"");
 }
 function identityFor(tile,img,label,project){
  const attrs={};
  for(const name of ["data-asset-id","data-media-id","data-item-id","data-resource-id","data-file-id"]){
   let node=img;
   for(let i=0;i<4&&node;i++,node=node.parentElement){
    if(node===document.body)break;
    const value=node.getAttribute?.(name);
    if(value){attrs[name]=value;break;}
   }
  }
  return core.identity({project,attrs,src:img.currentSrc||img.src||"",label});
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
    const r=img.getBoundingClientRect();
    const isLoaded=(img.naturalWidth>=24&&img.naturalHeight>=24)||(r.width>=24&&r.height>=24);
    if(!visible(img)||!isLoaded)continue;
    if(/(?:avatar|logo|favicon)/i.test(img.src||""))continue;
    const tile=closestMediaTile(img,picker),label=filename(tile,img);
    const id=identityFor(tile,img,label,PROJECT);
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
  }catch(err){
   console.warn("DTV scan error:",err);
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
