"use strict";
// Resolve a storyboard frame's reference image consistently in manual and batch runs.
// A generated character portrait takes precedence over the raw source photo.
const fs=require("node:fs");
const path=require("node:path");
function resolveSceneReferences(ws,{exists=fs.existsSync}={}){
 if(ws?.useSceneReferences===false)return {files:[],source:"disabled"};
 const character=ws?.character||{};
 const portrait=String(character.thumbnail||"").trim();
 if(portrait&&exists(portrait)){
  return {files:[path.resolve(portrait)],source:"generated-character"};
 }
 const originals=Array.isArray(character.referenceImages)?character.referenceImages:[];
 const selected=[...new Set(originals.filter(x=>typeof x==="string"&&x.trim()).map(p=>path.resolve(p)))].slice(0,2);
 if(selected.length){
  const missing=selected.filter(p=>!exists(p));
  if(missing.length)throw Error("Ảnh mẫu gốc không còn trên máy: "+missing.map(p=>path.basename(p)).join(", ")+". Hãy chọn lại ảnh trong mục Nhân vật.");
  return {files:selected,source:"original-references"};
 }
 if(portrait&&!exists(portrait))throw Error("Ảnh nhân vật đã tạo không còn trên máy: "+portrait+". Hãy tạo lại/chọn ảnh mẫu trong mục Nhân vật.");
 throw Error("Chưa có ảnh mẫu để tạo ảnh phân cảnh. Vào Nhân vật → chọn ảnh mẫu hoặc tạo hình nhân vật; hoặc tắt 'Dùng ảnh nhân vật làm mẫu cho ảnh cảnh' để tạo ảnh chỉ bằng prompt.");
}
module.exports={resolveSceneReferences};
