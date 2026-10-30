"use strict";
// Read-only UI probe. The upstream gflow-cli remains the only component that
// clicks or submits anything to Google Flow.
const fs=require("node:fs/promises");
const path=require("node:path");
const {createRequire}=require("node:module");

function diagnosticsFromUi(info) {
 const labels=Array.isArray(info.buttons)?info.buttons:[];
 const submits=labels.filter(s=>/(generate\s*(image|video)?|tạo\s*ảnh|^create$|arrow_forward\s*create|create\s*arrow_forward)/i.test(s));
 const prompts=Array.isArray(info.promptInputs)?info.promptInputs:[];
 return {ready:prompts.length>0&&submits.length>0,
  prompts:prompts.length,submitLabels:submits,buttons:labels.slice(0,55),
  url:info.url,mode:info.mode||"",reason:prompts.length===0?
  "Không tìm thấy ô nhập prompt trên tab này.":
  submits.length===0?"Không tìm thấy nút Generate Image/Create trên giao diện hiện tại.":"Đã thấy ô prompt và nút tạo ảnh."
 };
}
function getBrowser(cliPath,injected) {
 if(injected?.chromium)return injected.chromium;
 return createRequire(cliPath)("playwright").chromium;
}
async function inspectFlowUi({port,projectUrl,cliPath,dir,capture=false},injected={}) {
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("Chrome CDP port không hợp lệ.");
 const {projectUrl:canonicalProject}=require("./project.cjs");
 const expected=canonicalProject(projectUrl);
 if(!expected)throw Error("Cần URL project hợp lệ để kiểm tra giao diện.");
 const browser=await getBrowser(cliPath,injected).connectOverCDP("http://127.0.0.1:"+port,{timeout:10000});
 try {
  const pages=browser.contexts().flatMap(ctx=>ctx.pages());
  const page=pages.find(p=>canonicalProject(p.url())===expected);
  if(!page)throw Error("Không tìm thấy đúng tab project trong Chrome GFlow. Vào Cài đặt → Dò project đang mở.");
  const data=await page.evaluate(()=>{
   const visible=el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>0&&r.height>0&&style.visibility!=="hidden"&&style.display!=="none";};
   const prompts=[...document.querySelectorAll('[role="textbox"][contenteditable="true"],[contenteditable="true"],textarea,[role="textbox"]')]
     .filter(visible).slice(0,12).map(el=>({
        type:el.tagName.toLowerCase(),editable:el.getAttribute("contenteditable"),
        placeholder:el.getAttribute("placeholder")||el.getAttribute("data-placeholder")||el.getAttribute("aria-label")||""
     }));
   const buttons=[...document.querySelectorAll("button,[role=button]")].filter(visible)
     .map(el=>(el.getAttribute("aria-label")||el.innerText||el.getAttribute("title")||"").trim().replace(/\s+/g," ")).filter(Boolean).slice(0,120);
   const mode=[...document.querySelectorAll("button")].filter(visible)
     .map(el=>(el.innerText||"").trim()).find(text=>/nano banana|imagen|veo/i.test(text))||"";
   return {url:location.href,promptInputs:prompts,buttons,mode};
  });
  const result=diagnosticsFromUi(data);
  let screenshot=null,jsonPath=null;
  if(capture||!result.ready){
   await fs.mkdir(dir,{recursive:true});
   const stamp=new Date().toISOString().replace(/[:.]/g,"-");
   const base=path.join(dir,"flow-diagnostic-"+stamp);
   // Do not store page HTML, cookies, prompts or private user text in JSON.
   const report={at:new Date().toISOString(),...result};
   jsonPath=base+".json";
   await fs.writeFile(jsonPath,JSON.stringify(report,null,2),"utf8");
   if(capture||!result.ready){
     try{await page.screenshot({path:base+".png",fullPage:false,timeout:8000});screenshot=base+".png";}catch{}
   }
  }
  return {...result,jsonPath,screenshot};
 }finally{await browser.close().catch(()=>{});}
}
module.exports={inspectFlowUi,diagnosticsFromUi};
