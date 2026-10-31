"use strict";
// Dedicated Google Flow image-with-references workflow.
// Browser UI only: no undocumented Google endpoints and no project navigation.
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const {createRequire}=require("node:module");
const {projectUrl}=require("./project.cjs");

const INPUTS='[role="textbox"][contenteditable="true"], [contenteditable="true"][role="textbox"], textarea:visible';
const FILES='input[type="file"]';
const UPLOAD=/upload (image|media|file)|tải (ảnh|tệp|lên)|chọn tệp|choose (file|image)/i;
const ADD=/add image|add media|thêm ảnh|thêm hình|add_2/i;
const CONFIRM=/add to prompt|use (image|media|selected)|thêm vào lời nhắc|thêm vào prompt|add selected/i;
const CREATE=/generate image|tạo ảnh|tạo hình/i;
const MODEL=/nano banana|imagen|veo/i;
const PREFERRED_TIMEOUT=360000;

function validateFiles(files){
 if(!Array.isArray(files)||files.length<1||files.length>2)throw Error("Chọn 1–2 ảnh mẫu của nhân vật trước khi tạo.");
 return files.map(p=>{
   const file=path.resolve(String(p));
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error("Ảnh mẫu không tồn tại: "+file);
   if(!/\.(png|jpe?g|webp)$/i.test(file))throw Error("Chỉ hỗ trợ ảnh mẫu PNG/JPG/WEBP: "+file);
   if(fs.statSync(file).size>20*1024*1024)throw Error("Ảnh mẫu quá 20 MB: "+path.basename(file));
   return file;
 });
}
function imageCandidates(items){
 const urls=Array.isArray(items)?items:[];
 return [...new Set(urls.filter(x=>x&&typeof x.src==="string"&&x.width>=250&&x.height>=250)
   .filter(x=>/^(https?:|blob:|data:image\/)/i.test(x.src))
   .filter(x=>!/(?:avatar|favicon|logo|emoji|placeholder|thumbnail)/i.test(x.src))
   .map(x=>x.src))];
}
async function snapshot(page){
 return imageCandidates(await page.locator("img").evaluateAll(imgs=>imgs.map(img=>({
   src:img.currentSrc||img.src||"",
   width:img.naturalWidth||0,height:img.naturalHeight||0
 }))));
}
function checkStopped(signal){if(signal?.aborted)throw Error("Đã dừng tạo hình nhân vật.");}
const shortPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function visibleOne(locator){
 const count=await locator.count().catch(()=>0);
 for(let i=0;i<Math.min(count,12);i++){const el=locator.nth(i);if(await el.isVisible().catch(()=>false))return el;}
 return null;
}
async function clickAny(page,patterns,scope=page){
 for(const regex of patterns){
   const btn=await visibleOne(scope.getByRole("button",{name:regex}).or(scope.locator('[role="button"]').filter({hasText:regex})));
   if(btn){await btn.click({timeout:5000});return true;}
 }
 return false;
}
async function findProjectPage(browser,chosen){
 const pages=browser.contexts().flatMap(c=>c.pages());
 const valid=pages.filter(p=>Boolean(projectUrl(p.url())));
 if(!valid.length)throw Error("Không có tab project Google Flow đang mở trong Chrome GFlow. Hãy mở project trong cửa sổ Chrome của GFlow Doctor.");
 if(chosen){
  const match=valid.find(p=>projectUrl(p.url())===projectUrl(chosen));
  if(!match)throw Error("Project trong Cài đặt khác project đang mở. Bấm Dò project đang mở rồi thử lại.");
  return match;
 }
 if(valid.length!==1)throw Error("Có nhiều tab project Google Flow đang mở. Đóng các tab không dùng hoặc chọn đúng project trong Cài đặt.");
 return valid[0];
}
async function chooseImageMode(page,log){
 const composer=await visibleOne(page.locator(INPUTS));
 if(!composer)throw Error("Không tìm thấy ô prompt trong tab Google Flow hiện tại.");
 const modelButton=await visibleOne(page.getByRole("button",{name:MODEL}).or(page.locator("button").filter({hasText:MODEL})));
 if(modelButton){
  const label=(await modelButton.innerText().catch(()=>"")).toLowerCase();
  if(/veo|video/.test(label)||!/nano banana|imagen|image/.test(label)){
    await modelButton.click({timeout:6000});
    const item=await visibleOne(page.getByRole("menuitem",{name:/^image$|image/i}).or(page.getByRole("option",{name:/^image$/i})).or(page.getByRole("button",{name:/^image$/i})));
    if(!item)throw Error("Đã mở cài đặt nhưng không tìm thấy lựa chọn Image. Hãy tự chuyển sang Image trong Flow rồi bấm tạo lại.");
    await item.click({timeout:6000});
    log("Đã chọn chế độ Image.");
  }else log("Đã nhận diện trình tạo ảnh: "+label.slice(0,75));
 }else{
  const generate=await visibleOne(page.getByRole("button",{name:CREATE}));
  if(!generate)throw Error("Chưa xác nhận được chế độ Image. Hãy chọn Image/Nano Banana trên Google Flow trước khi tạo.");
 }
 return composer;
}
async function invokeUpload(page,button,filepath){
 const chooserPromise=page.waitForEvent("filechooser",{timeout:2200}).catch(()=>null);
 await button.click({timeout:7000});
 let chooser=await chooserPromise;
 if(chooser){await chooser.setFiles(filepath);return "filechooser";}
 // Some Flow versions render a hidden file input instead of opening OS chooser.
 const input=page.locator(FILES).last();
 if(await input.count()){
  await input.setInputFiles(filepath,{timeout:10000});
  return "file-input";
 }
 return "picker";
}
async function uploadReference(page,filepath,log,signal){
 checkStopped(signal);
 const starting=await snapshot(page);
 const add=await visibleOne(page.getByRole("button",{name:ADD}).or(page.locator('button[aria-haspopup="dialog"]').filter({hasText:ADD})));
 if(!add)throw Error("Không thấy nút Add Image/Thêm ảnh của Google Flow để đưa ảnh mẫu vào prompt.");
 log("Đưa ảnh mẫu vào Google Flow: "+path.basename(filepath));
 const uploadType=await invokeUpload(page,add,filepath);
 if(uploadType==="picker"){
   const scope=await visibleOne(page.locator('[role="dialog"],[aria-modal="true"]'))||page;
   const upload=await visibleOne(scope.getByRole("button",{name:UPLOAD}).or(scope.getByText(UPLOAD)));
   if(!upload){
     const fileinput=page.locator(FILES).last();
     if(await fileinput.count())await fileinput.setInputFiles(filepath,{timeout:10000});
     else throw Error("Đã mở Add Image nhưng không tìm thấy Upload Media / input chọn file.");
   }else{
     const actual=await invokeUpload(page,upload,filepath);
     if(actual==="picker")throw Error("Google Flow không mở được trình chọn ảnh mẫu sau Upload Media.");
   }
 }
 await page.waitForTimeout(1000);
 // New uploads are often selected automatically, and the picker needs confirmation.
 let confirmed=false;
 for(let attempt=0;attempt<12;attempt++){
   checkStopped(signal);
   const dialog=await visibleOne(page.locator('[role="dialog"],[aria-modal="true"]'));
   const candidate=dialog?await visibleOne(dialog.getByRole("button",{name:CONFIRM}).or(dialog.getByText(CONFIRM))):null;
   if(candidate){
     if(await candidate.isEnabled().catch(()=>true)){
       await candidate.click({timeout:8000});
       confirmed=true;break;
     }
   } else if(!dialog)break;
   await page.waitForTimeout(600);
 }
 // If no dialog was used, require the uploaded media to appear on screen.
 const after=await snapshot(page);
 const newMedia=after.some(src=>!starting.includes(src));
 const dialogStillOpen=Boolean(await visibleOne(page.locator('[role="dialog"],[aria-modal="true"]')));
 if(dialogStillOpen&&!confirmed)throw Error("Ảnh mẫu chưa được xác nhận Add to Prompt trong cửa sổ chọn media.");
 if(!confirmed&&!newMedia)throw Error("Đã upload nhưng không xác nhận được ảnh mẫu đã gắn vào prompt. Dừng trước khi tạo để tránh ảnh sai nhân vật.");
 log("Đã thêm ảnh mẫu vào prompt"+(confirmed?" (Add to Prompt)":"")+".");
}
async function fillPrompt(page,prompt){
 const box=await visibleOne(page.locator(INPUTS));
 if(!box)throw Error("Không tìm thấy ô prompt.");
 const type=await box.evaluate(el=>({tag:el.tagName.toLowerCase(),contenteditable:el.getAttribute("contenteditable")}));
 if(type.tag==="textarea"){await box.fill(prompt,{timeout:12000});}
 else{
  await box.click({timeout:8000});
  await box.press("ControlOrMeta+A");
  await box.press("Backspace");
  await box.pressSequentially(prompt,{delay:3});
 }
 const actual=await box.evaluate(el=>("value" in el?el.value:el.textContent)||"");
 if(!actual.includes(prompt.slice(0,Math.min(prompt.length,50))))throw Error("Prompt chưa nhập thành công vào Google Flow.");
}
async function submit(page,log){
 const preferred=await visibleOne(page.getByRole("button",{name:CREATE}));
 let btn=preferred;
 if(!btn){
  btn=await visibleOne(page.locator("button").filter({hasText:/arrow_forward\s*create|create\s*arrow_forward/i}));
 }
 if(!btn)throw Error("Không tìm thấy nút Generate Image trên Google Flow. Đã dừng trước khi gửi.");
 if(!await btn.isEnabled())throw Error("Nút Generate Image đang bị vô hiệu. Có thể ảnh mẫu chưa tải xong hoặc nội dung prompt không hợp lệ.");
 log("Đã tìm thấy nút tạo ảnh, đang nhấn Generate Image.");
 await btn.click({timeout:12000});
 log("Đã bấm tạo ảnh, đang đợi kết quả.");
}
async function waitResult(page,already,signal,log,timeoutMs=PREFERRED_TIMEOUT){
 const started=Date.now();
 let lastLogged=started;
 while(Date.now()-started<timeoutMs){
   checkStopped(signal);
   if(!projectUrl(page.url()))throw Error("Tab Google Flow đã rời khỏi project trong lúc tạo.");
   const errorText=await page.getByText(/unusual activity|rate limit|quota exceeded|generation failed|couldn.t generate|insufficient credits|verify your identity/i).first().isVisible().catch(()=>false);
   if(errorText)throw Error("Google Flow báo lỗi/giới hạn tài khoản trên màn hình. Hãy xem thông báo trong Chrome.");
   const current=await snapshot(page);
   const added=current.filter(src=>!already.includes(src));
   if(added.length){log("Đã phát hiện ảnh mới.");return added[0];}
   if(Date.now()-lastLogged>=15000){lastLogged=Date.now();log("Đang chờ ảnh kết quả từ Google Flow...");}
   await shortPause(1200);
 }
 throw Error("Đã gửi lệnh nhưng chưa thấy ảnh mới trong Google Flow. Hãy xem ảnh chẩn đoán, không tự gửi lại để tránh trùng.");
}
function imageExtension(type,bytes){
 if(bytes.subarray(0,4).toString()==="\x89PNG"||bytes.subarray(1,4).toString()==="PNG")return ".png";
 if(bytes[0]===0xff&&bytes[1]===0xd8)return ".jpg";
 if(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP")return ".webp";
 if(type?.includes("png"))return ".png";
 if(type?.includes("jpeg"))return ".jpg";
 if(type?.includes("webp"))return ".webp";
 throw Error("Kết quả tải về không phải tệp ảnh PNG/JPG/WEBP.");
}
async function downloadImage(page,src,outDir,basename){
 let bytes,contentType="";
 if(src.startsWith("data:image/")){
  const comma=src.indexOf(",");
  const header=src.slice(0,comma),value=src.slice(comma+1);
  bytes=Buffer.from(value,header.includes(";base64")?"base64":"utf8");
  contentType=header;
 }else if(src.startsWith("blob:")){
  const base64=await page.evaluate(async url=>{
    const resp=await fetch(url);if(!resp.ok)throw Error("Không đọc được blob ảnh.");
    const blob=await resp.blob();
    if(blob.size>24*1024*1024)throw Error("Ảnh lớn hơn 24 MB.");
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(",")[1]);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },src);
  bytes=Buffer.from(base64,"base64");
 }else{
  const response=await page.context().request.get(src,{timeout:30000});
  if(!response.ok())throw Error("Không tải được ảnh Google Flow (HTTP "+response.status()+").");
  contentType=response.headers()["content-type"]||"";
  bytes=Buffer.from(await response.body());
 }
 if(bytes.length<1024||bytes.length>24*1024*1024)throw Error("Ảnh kết quả không hợp lệ hoặc chưa tải xong.");
 const ext=imageExtension(contentType,bytes);
 const dest=path.join(outDir,basename+ext);
 await fsp.mkdir(outDir,{recursive:true});
 await fsp.writeFile(dest,bytes);
 return dest;
}
async function captureFailure(page,outDir,log){
 if(!page)return null;
 try{
  const dir=path.join(outDir,"diagnostics");
  await fsp.mkdir(dir,{recursive:true});
  const file=path.join(dir,"character-image-"+Date.now()+".png");
  await page.screenshot({path:file,timeout:7000,fullPage:false});
  log("Đã lưu ảnh chẩn đoán: "+file);
  return file;
 }catch{return null;}
}
async function runCharacterImage({port,project,referenceImages,prompt,outDir,id,cliPath,signal,log=()=>{}},deps={}){
 const files=validateFiles(referenceImages);
 if(!String(prompt||"").trim())throw Error("Chưa nhập prompt mô tả nhân vật.");
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("Không tìm thấy Chrome GFlow debug port.");
 const chromium=deps.chromium||createRequire(cliPath)("playwright").chromium;
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,{timeout:12000});
 let page;
 try{
  checkStopped(signal);
  page=await findProjectPage(browser,project);
  log("Đã kết nối đúng tab Google Flow: "+page.url());
  await chooseImageMode(page,log);
  for(const file of files)await uploadReference(page,file,log,signal);
  checkStopped(signal);
  log("Nhập prompt tạo nhân vật.");
  await fillPrompt(page,prompt.trim());
  const before=await snapshot(page); // after reference uploads; results must be new
  checkStopped(signal);
  await submit(page,log);
  const src=await waitResult(page,before,signal,log);
  const saved=await downloadImage(page,src,outDir,"character-"+id);
  log("Đã tải ảnh nhân vật về app: "+saved);
  return {image:saved,project:projectUrl(page.url()),referenceCount:files.length};
 }catch(e){
  const shot=await captureFailure(page,outDir,log);
  throw Error(String(e?.message||e)+(shot?"\nẢnh chẩn đoán: "+shot:""));
 }finally{await browser.close().catch(()=>{});}
}
module.exports={runCharacterImage,validateFiles,imageCandidates,findProjectPage,imageExtension};
