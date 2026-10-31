"use strict";
// Extension ↔ Electron bridge through the same live Flow DOM/CDP tab.
// No localhost listener, hidden Google API calls, cookie reads or spoofed clicks.
const path=require("node:path");
const {createRequire}=require("node:module");
const {projectUrl}=require("./project.cjs");
function extensionAssetSelector(){return 'img[data-dtv-asset-key]';}
async function extensionStatus(page){
 return page.evaluate(()=>({
  ready:document.documentElement.dataset.dtvExtensionReady==="1",
  version:document.documentElement.dataset.dtvExtensionVersion||null,
  pickerVisible:document.documentElement.dataset.dtvPickerVisible==="1",
  visibleAssetCount:Number(document.documentElement.dataset.dtvAssetCount||0)
 }));
}
async function findExtensionAssetByFilename(page,filepath){
 const filename=path.basename(filepath).toLowerCase(),prefix=filename.slice(0,Math.min(19,filename.length));
 if(prefix.length<8)return null;
 return page.evaluate(({prefix})=>{
  if(document.documentElement.dataset.dtvExtensionReady!=="1"||!document.querySelector('[data-dtv-picker="1"]'))return null;
  const root=document.querySelector('[data-dtv-picker="1"]');
  const items=[...root.querySelectorAll("img[data-dtv-asset-key]")];
  for(const img of items){
   const text=[img.dataset.dtvAssetLabel||"",img.alt||"",img.closest('[role=option],[role=button],button,[tabindex]')?.textContent||"",img.parentElement?.parentElement?.textContent||""].join(" ").toLowerCase();
   if(text.includes(prefix)){
    return {key:img.dataset.dtvAssetKey,kind:img.dataset.dtvAssetKind||"local",label:img.dataset.dtvAssetLabel||""};
   }
  }
  return null;
 },{prefix});
}
async function selectExtensionAsset(page,assetKey){
 if(!assetKey||typeof assetKey!=="string"||assetKey.length>300)return false;
 const selected=await page.evaluate(key=>{
  if(document.documentElement.dataset.dtvExtensionReady!=="1")return false;
  const root=document.querySelector('[data-dtv-picker="1"]');
  if(!root)return false;
  const visible=el=>{const r=el.getBoundingClientRect();return r.width>15&&r.height>15;};
  const image=[...root.querySelectorAll('img[data-dtv-asset-key]')].find(el=>visible(el)&&el.dataset.dtvAssetKey===key);
  if(!image)return false;
  image.setAttribute("data-dtv-bridge-select","1");
  return true;
 },assetKey);
 if(!selected)return false;
 try{
  const img=page.locator('img[data-dtv-bridge-select="1"]').first();
  const target=img.locator('xpath=ancestor::*[@role="option" or @role="button" or self::button or @tabindex][1]');
  if(await target.count())await target.first().click({timeout:8000});
  else await img.click({timeout:8000});
  return true;
 }finally{await page.evaluate(()=>document.querySelector('img[data-dtv-bridge-select="1"]')?.removeAttribute("data-dtv-bridge-select")).catch(()=>{});}
}
async function inspectExtensionInChrome({port,project,cliPath},deps={}){
 const chromium=deps.chromium||createRequire(cliPath)("playwright").chromium;
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,{timeout:12000});
 try{
  const expected=projectUrl(project);
  if(!expected)throw Error("Không có URL Google Flow project hợp lệ để kiểm tra extension.");
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>projectUrl(p.url())===expected);
  if(!page)throw Error("Chưa mở đúng project trong Chrome GFlow.");
  return {...await extensionStatus(page),project:expected};
 }finally{await browser.close().catch(()=>{});}
}
module.exports={extensionAssetSelector,extensionStatus,findExtensionAssetByFilename,selectExtensionAsset,inspectExtensionInChrome};
