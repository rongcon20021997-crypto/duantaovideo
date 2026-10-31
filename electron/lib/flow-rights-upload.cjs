"use strict";
// Google Flow prompts for a rights attestation after choosing a reference image.
// Never agree to legal/content rights on the user's behalf: wait for their click,
// then continue the normal media-picker workflow.
const RIGHTS=/quyền sử dụng hình ảnh này|rights to use this image|rights to this image|you have (?:the )?rights to use/i;
const YES=/^(?:tôi đồng ý|i agree|agree)$/i;
const NO=/^(?:hủy|cancel)$/i;
const PICKER_CONFIRM=/add to (?:prompt|scene|character)|thêm vào (?:ô nhập )?câu lệnh|thêm vào lời nhắc|thêm vào prompt|dùng ảnh|use (?:selected|image)/i;
function aborted(signal){if(signal?.aborted)throw Error("Đã dừng tạo hình nhân vật.");}
async function isRightsVisible(page){
 return page.getByText(RIGHTS).first().isVisible().catch(()=>false);
}
async function waitForRightsDecision(page,log=()=>{},signal,options={}){
 const pause=options.pause||((ms)=>new Promise(r=>setTimeout(r,ms)));
 const now=options.now||Date.now;
 const timeoutMs=options.timeoutMs||180000;
 // Consent may mount asynchronously immediately after the file chooser returns.
 if(!await isRightsVisible(page))await pause(1300);
 if(!await isRightsVisible(page))return false;
 const deadline=now()+timeoutMs;
 log("Google Flow yêu cầu xác nhận quyền sử dụng ảnh. HÃY ĐỌC và bấm 'Tôi đồng ý' hoặc 'Hủy' trực tiếp trong Chrome. Ứng dụng sẽ tự tiếp tục sau khi bạn xác nhận.");
 while(now()<deadline){
  aborted(signal);
  if(!(await isRightsVisible(page))){ 
    log("Đã đóng hộp xác nhận quyền sử dụng ảnh. Tiếp tục chờ ảnh tải lên...");
    return true;
  }
  // The user must decide. Don't synthesize clicks on consent controls.
  await pause(650);
 }
 throw Error("Google Flow vẫn chờ bạn xác nhận quyền sử dụng ảnh. Hãy xem Chrome và tự chọn 'Tôi đồng ý' hoặc 'Hủy'.");
}
function chooseNewMediaCard(cards,previous){
 const known=new Set(previous||[]);
 const current=(cards||[]).filter(x=>x&&x.visible&&x.src&&!known.has(x.src));
 const distinct=new Set();
 return current.find(x=>{if(distinct.has(x.src))return false;distinct.add(x.src);return true;})||null;
}
async function inspectMediaCards(page){
 // Only inspect the visible media-picker DOM. Image URLs are used in memory to
 // distinguish new tiles, not logged or stored as diagnostic metadata.
 return page.evaluate(()=>{
  const visible=el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=="none"&&s.visibility!=="hidden";};
  const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible);
  const root=dialogs.at(-1);
  if(!root)return {picker:false,cards:[]};
  const imgs=[...root.querySelectorAll('img')].filter(visible);
  const cards=imgs.map((img,index)=>({
   src:img.currentSrc||img.src||"",
   alt:img.alt||"",index,visible:true,
   selected:img.closest('[aria-selected="true"],[data-state="checked"]')!==null,
   width:img.naturalWidth||0,height:img.naturalHeight||0
  })).filter(x=>x.src&&x.width>=32&&x.height>=32&&!/avatar|logo|icon|favicon/i.test(x.src));
  return {picker:true,cards};
 });
}
async function selectMediaCard(page,newCard){
 // Locate by the exact newly uploaded image's src in the visible media dialog,
 // not a pixel coordinate or an arbitrary tile index.
 const marked=await page.evaluate(src=>{
   const visible=el=>{const r=el.getBoundingClientRect();return r.width>20&&r.height>20;};
   const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible);
   const dialog=dialogs.at(-1);
   const img=dialog&&[...dialog.querySelectorAll("img")].find(i=>visible(i)&&(i.currentSrc||i.src)===src);
   if(!img)return false;
   img.setAttribute("data-gflow-new-reference","1");
   return true;
 },newCard.src);
 if(!marked)throw Error("Ảnh mới đã được tải lên nhưng không còn thấy thumbnail để chọn.");
 try{
   const img=page.locator('img[data-gflow-new-reference="1"]').first();
   const selectable=img.locator('xpath=ancestor::*[@role="option" or @role="button" or self::button or @tabindex][1]');
   if(await selectable.count())await selectable.first().click({timeout:8000});
   else await img.click({timeout:8000});
 }finally{
   await page.evaluate(()=>document.querySelector('img[data-gflow-new-reference="1"]')?.removeAttribute("data-gflow-new-reference")).catch(()=>{});
 }
}

function filenameSearchPrefix(filepath){
 const name=require("node:path").basename(String(filepath||""));
 // Flow truncates long filenames visually; the beginning remains available.
 return name.length>=8?name.slice(0,Math.min(19,name.length)):"";
}
function escapeRegExp(text){
 return text.replace(/[|\\{}()[\]^$+*?.]/g,"\\$&");
}
async function findUploadedFilename(page,filepath){
 const prefix=filenameSearchPrefix(filepath);
 if(!prefix)return false;
 return page.getByText(new RegExp(escapeRegExp(prefix),"i")).first().isVisible().catch(()=>false);
}
async function findPickerConfirm(page){
 // Flow media overlay can lack role=dialog entirely, so do not scope
 // button detection only to an ARIA dialog.
 const direct=page.getByRole("button",{name:PICKER_CONFIRM}).first();
 if(await direct.isVisible().catch(()=>false))return direct;
 const generic=page.locator('button,[role="button"]').filter({hasText:PICKER_CONFIRM}).first();
 if(await generic.isVisible().catch(()=>false))return generic;
 const dialogs=page.locator('[role="dialog"],[aria-modal="true"]');
 const count=await dialogs.count();
 for(let i=count-1;i>=0;i--){
  const d=dialogs.nth(i);
  if(!await d.isVisible().catch(()=>false))continue;
  const exact=d.getByRole("button",{name:PICKER_CONFIRM}).first();
  if(await exact.isVisible().catch(()=>false))return exact;
 }
 return null;
}

module.exports={RIGHTS,YES,NO,PICKER_CONFIRM,isRightsVisible,waitForRightsDecision,
 chooseNewMediaCard,inspectMediaCards,selectMediaCard,findPickerConfirm,filenameSearchPrefix,findUploadedFilename};
