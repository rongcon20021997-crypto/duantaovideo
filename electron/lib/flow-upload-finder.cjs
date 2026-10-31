"use strict";
// UI-only discovery for the icon-only "add media" control on Google Flow.
// Pick actual DOM nodes, not pixels. Never click generic Generate/Create controls.
const ADD=/add image|add media|add ingredient|add to prompt|upload|thêm ảnh|thêm hình|add_2/i;
function scoreUploadControl(item){
 const text=String(item.text||"").toLowerCase(),aria=String(item.aria||"").toLowerCase(),
   title=String(item.title||"").toLowerCase(),icon=String(item.icon||"").toLowerCase(),
   all=[text,aria,title,icon].join(" ");
 if(item.visible===false)return -100;
 if(/new project|create project|new scene|create character|add scene/i.test(all))return -100;
 if(/generate|submit|arrow_forward|send|publish|download|delete|remove|settings|model|aspect|crop_16_9|veo/i.test(all)
   && !/(?:add_2|add_circle|add media|upload|add image|attach|ingredient|reference)/i.test(all))return -100;
 let score=0;
 if(/upload (?:image|photo|media|file)|upload from|browse files|choose files|tải ảnh|tải lên|chọn ảnh/i.test(all))score+=40;
 if(/add (?:image|media|photo|ingredient|reference)|add to prompt|thêm (?:ảnh|hình|media)|ingredient|reference image|attach (?:file|image|media)/i.test(all))score+=35;
 if(/upload_file|file_upload|cloud_upload/i.test(icon+" "+text))score+=60;
 else if(/add_2|add_circle|attach_file|add_photo_alternate|photo_library|image_add/i.test(icon+" "+text))score+=27;
 if(/\badd\b|\bplus\b|\bupload\b|\battach\b|thêm/i.test(all))score+=9;
 if(item.popup)score+=5;
 if(item.near)score+=10;
 if(item.insideComposer)score+=12;
 if(!item.near&&!item.insideComposer&&score<35)score-=20;
 return score;
}
function rankUploadControls(items){
 return (Array.isArray(items)?items:[]).map((x,i)=>({...x,score:scoreUploadControl(x),index:i}))
  .filter(x=>x.score>=24).sort((a,b)=>b.score-a.score);
}
const SELECTOR='button,[role="button"],label[for]';
async function examineUploadControls(page){
 // Only read visible DOM metadata, never page HTML, cookies, prompts or Google APIs.
 return page.evaluate((selector)=>{
   const prompt=[...document.querySelectorAll('[role="textbox"][contenteditable="true"],textarea,[contenteditable="true"]')]
    .find(el=>{const r=el.getBoundingClientRect();return r.width>5&&r.height>5;});
   const rect=prompt?.getBoundingClientRect();
   const ancestor=prompt?.closest('[class*="prompt"],[class*="composer"],[role="form"],form')||prompt?.parentElement?.parentElement;
   return [...document.querySelectorAll(selector)].map(el=>{
      const b=el.getBoundingClientRect(),style=getComputedStyle(el);
      const visible=b.width>0&&b.height>0&&style.visibility!=="hidden"&&style.display!=="none";
      const dx=rect?Math.max(rect.left-b.right,b.left-rect.right,0):9999;
      const dy=rect?Math.max(rect.top-b.bottom,b.top-rect.bottom,0):9999;
      const ic=[...el.querySelectorAll('[class*="material"],[data-icon],svg')].slice(0,4).map(x=>[
        x.textContent?.trim(),x.getAttribute("aria-label"),x.getAttribute("data-icon")
      ].filter(Boolean).join(" ")).join(" ").slice(0,80);
      return {text:(el.innerText||el.textContent||"").replace(/\s+/g," ").trim().slice(0,90),
       aria:(el.getAttribute("aria-label")||"").slice(0,90),
       title:(el.getAttribute("title")||el.getAttribute("data-tooltip")||el.getAttribute("data-testid")||"").slice(0,90),
       icon:ic,visible,near:dx<100&&dy<160,insideComposer:!!ancestor&&ancestor.contains(el),
       popup:!!el.getAttribute("aria-haspopup")};
    });
 },SELECTOR);
}
async function visibleOne(locator){
 const count=await locator.count().catch(()=>0);
 for(let i=0;i<Math.min(count,30);i++){const el=locator.nth(i);if(await el.isVisible().catch(()=>false))return el;}
 return null;
}
async function pickUploadTrigger(page,log=()=>{}){
 const known=await visibleOne(page.getByRole("button",{name:ADD}).or(page.locator('button[aria-haspopup="dialog"]').filter({hasText:ADD})));
 if(known){log("Đã tìm thấy nút thêm ảnh theo nhãn Google Flow.");return known;}
 const controls=await examineUploadControls(page);
 const ranked=rankUploadControls(controls);
 const nearby=controls.filter(c=>c.visible&&(c.near||c.insideComposer));
 log("Các nút gần ô prompt: "+nearby.slice(0,18).map(c=>(c.aria||c.text||c.title||c.icon||"?").slice(0,45)).join(" | "));
 if(!ranked.length)return null;
 const best=ranked[0];
 const target=page.locator(SELECTOR).nth(best.index);
 if(!(await target.isVisible().catch(()=>false)))return null;
 log("Đã tìm thấy nút thêm ảnh theo DOM: "+(best.aria||best.text||best.title||best.icon).slice(0,85));
 return target;
}

async function pickPickerUploadButton(page,log=()=>{}){
 const scope=await visibleOne(page.locator('[role="dialog"],[aria-modal="true"],[role="menu"]'))||page;
 const locator=scope.locator(SELECTOR);
 const controls=await locator.evaluateAll(elements=>elements.map(el=>{
   const r=el.getBoundingClientRect(),style=getComputedStyle(el);
   const icon=[...el.querySelectorAll('[class*="material"],[data-icon],svg')].slice(0,4).map(x=>
     [x.textContent?.trim(),x.getAttribute("data-icon"),x.getAttribute("aria-label")].filter(Boolean).join(" ")
   ).join(" ").slice(0,80);
   return {text:(el.innerText||el.textContent||"").replace(/\s+/g," ").trim().slice(0,90),
    aria:(el.getAttribute("aria-label")||"").slice(0,90),
    title:(el.getAttribute("title")||el.getAttribute("data-tooltip")||"").slice(0,90),
    icon,visible:r.width>0&&r.height>0&&style.visibility!=="hidden"&&style.display!=="none",
    popup:!!el.getAttribute("aria-haspopup"),near:true,insideComposer:true};
 }));
 const matches=rankUploadControls(controls).filter(c=>
    /upload|tải|chọn (?:tệp|ảnh)|browse|choose (?:file|image)|computer|device|upload_file|file_upload|cloud_upload/i.test(
    [c.text,c.aria,c.title,c.icon].join(" ")));
 if(!matches.length){
   log("Các mục trong hộp thoại chọn ảnh: "+controls.filter(c=>c.visible).slice(0,18).map(c=>
     (c.aria||c.text||c.title||c.icon||"?").slice(0,40)).join(" | "));
   return null;
 }
 const found=locator.nth(matches[0].index);
 if(!(await found.isVisible().catch(()=>false)))return null;
 log("Đã tìm thấy chức năng Upload ảnh: "+(matches[0].aria||matches[0].text||matches[0].icon));
 return found;
}

module.exports={scoreUploadControl,rankUploadControls,examineUploadControls,pickUploadTrigger,pickPickerUploadButton};
