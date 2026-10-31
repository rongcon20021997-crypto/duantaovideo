"use strict";
// Dedicated Google Flow image-with-references workflow.
// Browser UI only: no undocumented Google endpoints and no project navigation.
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const {createRequire}=require("node:module");
const {projectUrl}=require("./project.cjs");
const {pickUploadTrigger,pickPickerUploadButton,examineUploadControls}=require("./flow-upload-finder.cjs");
const {waitForRightsDecision,isRightsVisible,inspectMediaCards,chooseNewMediaCard,selectMediaCard,findPickerConfirm,findUploadedFilename,filenameSearchPrefix}=require("./flow-rights-upload.cjs");

const INPUTS='[role="textbox"][contenteditable="true"], [contenteditable="true"][role="textbox"], textarea:visible';
const FILES='input[type="file"]';
const UPLOAD=/tải nội dung nghe nhìn lên|upload (image|media|file)|upload from|tải (ảnh|tệp|lên)|chọn tệp|choose (file|image)/i;
const ADD=/add image|add media|thêm ảnh|thêm hình|add_2/i;
const CONFIRM=/add to prompt|use (image|media|selected)|thêm vào (?:ô nhập )?câu lệnh|thêm vào lời nhắc|thêm vào prompt|add selected/i;
const CREATE=/generate image|tạo ảnh|tạo hình|bắt đầu tạo|start generation/i;
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
async function invokeUpload(page,button,filepath,{finalAction=false,log=()=>{}}={}){
 // Set up the chooser listener BEFORE the trusted DOM click. For Google Flow
 // Vietnamese, the final click must be the footer "Tải nội dung nghe nhìn lên".
 const chooserPromise=page.waitForEvent("filechooser",{timeout:finalAction?12000:2500}).catch(()=>null);
 await button.click({timeout:7000});
 const chooser=await chooserPromise;
 if(chooser){
  await chooser.setFiles(filepath,{timeout:15000});
  log("Đã chọn ảnh mẫu trong trình chọn file của Chrome.");
  return "filechooser";
 }
 // Some Flow builds create an <input type=file> without raising filechooser.
 const inputs=page.locator(FILES);
 const count=await inputs.count().catch(()=>0);
 if(count){
  await inputs.last().setInputFiles(filepath,{timeout:15000});
  log("Đã đưa ảnh mẫu vào file input của Flow.");
  return "file-input";
 }
 return "picker";
}


async function composerReferenceIds(page){
 return page.evaluate(()=>{
  const box=[...document.querySelectorAll('[role="textbox"][contenteditable="true"],textarea,[contenteditable="true"]')]
   .find(el=>{const r=el.getBoundingClientRect();return r.width>10&&r.height>10;});
  if(!box)return [];
  const b=box.getBoundingClientRect();
  const nearby=el=>{
    const r=el.getBoundingClientRect();
    return r.width>16&&r.height>16&&r.top>=b.top-120&&r.bottom<=b.bottom+90&&
      r.right>=b.left-15&&r.left<=b.right+15;
  };
  const images=[...document.querySelectorAll("img")].filter(img=>!img.closest('[role="dialog"],[aria-modal="true"]')&&nearby(img))
    .map(img=>img.currentSrc||img.src).filter(Boolean);
  const backgrounds=[...document.querySelectorAll('[style*="background"]')].filter(el=>!el.closest('[role="dialog"],[aria-modal="true"]')&&nearby(el))
    .map(el=>getComputedStyle(el).backgroundImage).filter(v=>v&&v!=="none");
  return [...new Set([...images,...backgrounds])];
 });
}
async function verifyReferenceAttachment(page,composerBefore,log){
 // The media library image alone is NOT enough; only continue once the prompt
 // shows a newly attached reference after clicking the Flow footer button.
 for(let attempt=0;attempt<30;attempt++){
  const after=await composerReferenceIds(page);
  if(after.some(src=>!composerBefore.includes(src))){
   log("Ảnh mẫu đã được gắn vào ô prompt. Tiếp tục nhập câu lệnh trong app.");
   return true;
  }
  await page.waitForTimeout(500);
 }
 return false;
}
async function attachUploadedReference(page,confirm,composerBefore,log){
 log("Ảnh mẫu đã sẵn sàng. Bấm 'Thêm vào câu lệnh'.");
 await confirm.click({timeout:8000});
 const verified=await verifyReferenceAttachment(page,composerBefore,log);
 if(!verified)throw Error("Đã bấm Thêm vào câu lệnh nhưng chưa xác nhận được ảnh mẫu trong ô prompt. Chưa gửi lệnh tạo.");
}

async function waitForReferenceInPicker(page,earlierCards,composerBefore,filepath,log,signal,timeoutMs=180000){
 const deadline=Date.now()+timeoutMs;
 let lastNotice=0,selectedSrc=null,triedUploadFilter=false,triedSelectFilename=false;
 const started=Date.now();
 const oldCards=earlierCards.map(x=>x.src);
 while(Date.now()<deadline){
  checkStopped(signal);
  const failure=page.getByText(/không thể tải lên|tải lên không thành công|upload failed|could not upload|file upload failed/i).first();
  if(await failure.isVisible().catch(()=>false))throw Error("Google Flow thông báo tải ảnh mẫu thất bại. Kiểm tra tệp và thông báo trên màn hình.");
  if(await isRightsVisible(page))await waitForRightsDecision(page,log,signal);
  // Real observed Flow UI: the asset row shows the uploaded filename and
  // the white "Thêm vào câu lệnh" button is enabled, but the overlay lacks
  // role=dialog and thus inspectMediaCards() returns an empty collection.
  // Match THIS uploaded filename before trusting the confirm action.
  const uploadNameVisible=await findUploadedFilename(page,filepath);
  if(uploadNameVisible){
   const confirm=await findPickerConfirm(page);
   if(confirm){
    if(await confirm.isEnabled().catch(()=>false)){
     log("Đã nhận diện đúng ảnh mẫu "+filenameSearchPrefix(filepath)+" trong hộp chọn media.");
     await attachUploadedReference(page,confirm,composerBefore,log);
     return;
    }
    if(!triedSelectFilename){
     triedSelectFilename=true;
     // Uploaded asset is visible but not selected; click its exact label
     // using a DOM-based locator, not a screen coordinate.
     const prefix=filenameSearchPrefix(filepath);
     const asset=page.getByText(prefix,{exact:false}).first();
     if(await asset.isVisible().catch(()=>false)){
      log("Ảnh mẫu đã lên thư viện, đang chọn theo tên tệp.");
      await asset.click({timeout:5000}).catch(()=>undefined);
     }
    }
   }
  }
  const current=await inspectMediaCards(page);
  const newCard=chooseNewMediaCard(current.cards,oldCards);
  // Flow can leave "Tất cả" on an empty cached view after upload. Switch
  // once to "Tệp tải lên" (Uploaded files) to refresh the asset collection.
  if(!newCard&&!triedUploadFilter&&Date.now()-started>16000){
   triedUploadFilter=true;
   const uploaded=page.getByRole("button",{name:/tệp tải lên|uploaded files|uploads/i}).first();
   if(await uploaded.isVisible().catch(()=>false)){
    await uploaded.click({timeout:5000}).catch(()=>undefined);
    log("Đã chuyển sang mục Tệp tải lên để tìm ảnh mẫu vừa upload.");
   }
  }
  if(newCard){
   if(selectedSrc!==newCard.src){
    log("Đã phát hiện thumbnail ảnh mẫu mới trong hộp media.");
    if(!newCard.selected)await selectMediaCard(page,newCard);
    selectedSrc=newCard.src;
    log("Đã chọn ảnh mẫu tải lên. Đang tìm nút Thêm vào câu lệnh.");
   }
   const confirm=await findPickerConfirm(page);
   if(confirm&&await confirm.isEnabled().catch(()=>false)){
    await attachUploadedReference(page,confirm,composerBefore,log);
    return;
   }
  }
  const after=await composerReferenceIds(page);
  if(after.some(src=>!composerBefore.includes(src))){
   log("Google Flow đã tự gắn ảnh mẫu vào prompt.");
   return;
  }
  // Do not silently treat an image existing in the media library as an
  // image already attached to the generation prompt.
  if(Date.now()-lastNotice>=12000){
   lastNotice=Date.now();
   log(newCard?"Đã có ảnh trong thư viện, đang chờ nút Thêm vào câu lệnh...":
    "Đang chờ Google Flow xử lý ảnh mẫu và hiển thị trong hộp media...");
  }
  await page.waitForTimeout(1000);
 }
 throw Error("Đã chọn file và xử lý hộp quyền sử dụng, nhưng Google Flow chưa đưa ảnh mẫu vào prompt trong 3 phút. Không gửi lệnh tạo ảnh khi chưa gắn được ảnh mẫu.");
}

async function uploadReference(page,filepath,log,signal){
 checkStopped(signal);
 const composerBefore=await composerReferenceIds(page);
 let add=await pickUploadTrigger(page,log);
 if(!add&&!(await page.locator(FILES).count())){
   const box=await visibleOne(page.locator(INPUTS));
   if(box){
     await box.hover({timeout:2500}).catch(()=>undefined);
     add=await pickUploadTrigger(page,log);
   }
 }
 if(!add&&!(await page.locator(FILES).count()))throw Error("Không tìm thấy nút thêm ảnh cạnh ô prompt. Danh sách nút đã ghi trong Nhật ký và báo cáo chẩn đoán.");

 const beforeMedia=await inspectMediaCards(page);
 log("Đưa ảnh mẫu vào Google Flow: "+path.basename(filepath));
 const uploadType=add?await invokeUpload(page,add,filepath,{log}):"direct-input";
 if(uploadType==="direct-input"){
   await page.locator(FILES).last().setInputFiles(filepath,{timeout:12000});
   log("Đã nhập file qua input có sẵn trong Flow.");
 }
 if(uploadType==="picker"){
   // The user's real Google Flow UI shows this exact footer action (VN):
   // "upload Tải nội dung nghe nhìn lên". Do NOT click "Tệp tải lên",
   // which is only the asset-library filter.
   const upload=await pickPickerUploadButton(page,log);
   if(!upload){
     const fileinput=page.locator(FILES).last();
     if(await fileinput.count()){
       await fileinput.setInputFiles(filepath,{timeout:10000});
       log("Đã upload ảnh bằng input file trong cửa sổ media.");
     }else throw Error("Hộp media đang mở nhưng không tìm thấy mục 'Tải nội dung nghe nhìn lên'.");
   }else{
     log("Đang bấm Tải nội dung nghe nhìn lên để chọn ảnh trên máy.");
     const actual=await invokeUpload(page,upload,filepath,{finalAction:true,log});
     if(actual==="picker")throw Error("Đã bấm 'Tải nội dung nghe nhìn lên' nhưng Chrome không phát sinh filechooser hay input[type=file]. Kiểm tra ảnh và báo cáo DOM trong diagnostics.");
   }
 }
 // Uploading a real image can prompt a rights attestation. Never click
 // "Tôi đồng ý" automatically: the user must decide. Remain on this tab
 // and RESUME when the user dismisses the dialog.
 await waitForRightsDecision(page,log,signal);
 log("Đang chờ ảnh đã tải lên được thêm vào câu lệnh...");
 await waitForReferenceInPicker(page,beforeMedia.cards,composerBefore,filepath,log,signal);

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
  btn=await visibleOne(page.locator("button").filter({hasText:/arrow_forward\s*create|create\s*arrow_forward|^arrow_forward$/i}));
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
  try{
    const controls=await examineUploadControls(page);
    const meta=controls.filter(x=>x.visible).map(x=>({text:x.text,aria:x.aria,title:x.title,icon:x.icon,near:x.near,popup:x.popup,insideComposer:x.insideComposer})).slice(0,90);
    const report=file.replace(/\.png$/i,"-controls.json");
    await fsp.writeFile(report,JSON.stringify({url:page.url(),controls:meta},null,2),"utf8");
    log("Đã lưu danh sách nút DOM để sửa chính xác: "+report);
  }catch(err){log("Không đọc được danh sách nút: "+String(err?.message||err));}
  log("Đã lưu ảnh chẩn đoán: "+file);
  return file;
 }catch{return null;}
}
async function runCharacterImage({port,project,referenceImages,prompt,outDir,id,outputPrefix="character",cliPath,signal,log=()=>{}},deps={}){
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
  log("Nhập prompt tạo nhân vật từ nội dung đã viết trong app.");
  const attachedBefore=await composerReferenceIds(page);
  await fillPrompt(page,prompt.trim());
  const attachedAfter=await composerReferenceIds(page);
  if(attachedBefore.length&&!attachedBefore.every(src=>attachedAfter.includes(src))){
   throw Error("Nhập prompt làm mất ảnh tham chiếu trong ô câu lệnh. Đã dừng trước khi bấm Tạo.");
  }
  log("Đã nhập câu lệnh nhân vật lấy từ ứng dụng vào Google Flow.");
  const before=await snapshot(page); // after reference uploads; results must be new
  checkStopped(signal);
  await submit(page,log);
  const src=await waitResult(page,before,signal,log);
  const saved=await downloadImage(page,src,outDir,String(outputPrefix||"character")+"-"+id);
  log("Đã tải ảnh nhân vật về app: "+saved);
  return {image:saved,project:projectUrl(page.url()),referenceCount:files.length};
 }catch(e){
  const shot=await captureFailure(page,outDir,log);
  throw Error(String(e?.message||e)+(shot?"\nẢnh chẩn đoán: "+shot:""));
 }finally{await browser.close().catch(()=>{});}
}
module.exports={runCharacterImage,validateFiles,imageCandidates,findProjectPage,imageExtension};
