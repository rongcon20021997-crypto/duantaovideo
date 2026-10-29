"use strict";
// Read-only diagnostics for the Chrome instance actually used by upstream gflow-cli.
// No navigation, DOM automation, cookie access or private Google API calls.
const http=require("node:http");
function projectUrl(value){
  try {
    const url=new URL(String(value||""));
    if(url.hostname!=="flow.google.com")return null;
    const match=url.pathname.match(/^\/project\/([0-9a-f-]{24,64})(?:\/|$)/i);
    if(!match)return null;
    return "https://flow.google.com/project/"+match[1];
  }catch{return null;}
}
function is404(value){
  try{
    const url=new URL(value);
    return url.hostname==="flow.google.com"&&/^\/404(?:\/|$)/.test(url.pathname);
  }catch{return false;}
}
function parseTabs(raw){
  if(!Array.isArray(raw))throw Error("Chrome trả danh sách tab không hợp lệ.");
  const urls=raw.filter(x=>x&&x.type==="page"&&typeof x.url==="string").map(x=>x.url);
  const projects=[...new Set(urls.map(projectUrl).filter(Boolean))];
  return {projects,has404:urls.some(is404),flowOpen:urls.some(url=>/^https:\/\/flow\.google\.com(?:\/|$)/i.test(url)),tabCount:urls.length};
}
async function listTabs(port,options={}){
  if(!Number.isInteger(port)||port<=0||port>65535)throw Error("Chrome debugging port không hợp lệ.");
  if(options.fetchTabs)return parseTabs(await options.fetchTabs(port));
  const pages=await new Promise((resolve,reject)=>{
    const req=http.get({hostname:"127.0.0.1",port,path:"/json/list",timeout:3500},res=>{
      if(res.statusCode!==200){res.resume();return reject(Error("Chrome DevTools trả HTTP "+res.statusCode));}
      let out="";
      res.on("data",chunk=>{out+=String(chunk);if(out.length>1024*1024)req.destroy(Error("Chrome tab list quá lớn."));});
      res.on("end",()=>{try{resolve(JSON.parse(out));}catch(e){reject(Error("Chrome DevTools trả JSON không hợp lệ."));}});
    });
    req.on("error",reject);
    req.on("timeout",()=>req.destroy(Error("Không nhận được tab Chrome, hãy bấm GFlow Doctor rồi thử lại.")));
  });
  return parseTabs(pages);
}
function explain(tabs){
  if(tabs.projects.length)return "Đã tìm thấy "+tabs.projects.length+" project đang mở trong đúng Chrome của GFlow.";
  if(tabs.has404)return "Chrome GFlow hiện đang hiển thị /404. Hãy mở Flow Dashboard bằng tài khoản này và chọn một project thực sự truy cập được.";
  if(tabs.flowOpen)return "Chrome GFlow đang ở trang chủ, chưa mở project nào. Trong chính cửa sổ Chrome đó, chọn project rồi bấm Dò project lần nữa.";
  return "Không tìm thấy tab Google Flow trong Chrome GFlow. Bấm GFlow Doctor để mở đúng phiên Chrome, rồi tự mở project.";
}
module.exports={projectUrl,is404,parseTabs,listTabs,explain};
