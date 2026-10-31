"use strict";
(async()=>{
 const state=document.querySelector("#state"),ul=document.querySelector("#items");
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const match=tab?.url?.match(/^https:\/\/flow\.google\.com\/project\/([0-9a-f-]{24,64})/i);
  if(!match){state.textContent="Hãy mở một project Google Flow trong Chrome GFlow.";return;}
  const data=await chrome.storage.local.get("dtvAssetRegistryV1");
  const project="https://flow.google.com/project/"+match[1].toLowerCase();
  const rows=(data.dtvAssetRegistryV1||[]).filter(e=>e.project===project);
  state.textContent="Project hiện tại: "+rows.length+" ảnh có mã nhận diện";
  if(!rows.length){ul.textContent="Chưa có ảnh nào. Mở dấu + và thư viện media để extension quét.";return;}
  for(const e of rows.slice(-20).reverse()){
   const li=document.createElement("li");
   li.textContent=(e.label||"Ảnh mẫu")+" — "+e.kind+": "+e.key.slice(0,55);
   ul.append(li);
  }
 }catch(e){state.textContent="Không đọc được dữ liệu extension: "+String(e?.message||e);}
})();
