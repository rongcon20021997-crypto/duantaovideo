"use strict";
// Local, per-project reference-upload index. No Google APIs, cookies or tokens.
// Records that the file was successfully ATTACHED to a Flow prompt, not merely
// accepted by a browser file chooser. Used to avoid duplicate scene uploads.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {projectUrl}=require("./project.cjs");
const CACHE_FILE=".duantaovideo-flow-references.json";
const memory=new Map();
function fileFingerprint(file){
 const filename=path.resolve(String(file));
 const stat=fs.statSync(filename);
 if(!stat.isFile())throw Error("Ảnh mẫu không phải tệp: "+filename);
 const hash=crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
 return {file:filename,filename:path.basename(filename),hash,bytes:stat.size};
}
function indexKey(project,fingerprint){
 const projectId=projectUrl(project);
 if(!projectId)throw Error("Không có project Google Flow hợp lệ cho bộ nhớ ảnh.");
 return projectId+"::"+fingerprint.hash;
}
function readIndex(dir){
 try{
  const content=JSON.parse(fs.readFileSync(path.join(dir,CACHE_FILE),"utf8"));
  if(content&&content.version===1&&Array.isArray(content.entries))return content.entries.filter(x=>
   x&&typeof x.project==="string"&&typeof x.hash==="string"&&typeof x.filename==="string");
 }catch{}
 return [];
}
function getReference(project,file,dir){
 const fp=fileFingerprint(file),key=indexKey(project,fp);
 const session=memory.get(key);
 if(session)return {...session,from:"session"};
 const disk=readIndex(dir).find(e=>indexKey(e.project,{hash:e.hash})===key);
 if(!disk)return null;
 const entry={project:projectUrl(project),hash:fp.hash,filename:disk.filename,bytes:fp.bytes,assetSrc:null,assetKey:typeof disk.assetKey==="string"?disk.assetKey:null,assetKind:typeof disk.assetKind==="string"?disk.assetKind:null};
 memory.set(key,entry);
 return {...entry,from:"disk"};
}
function rememberReference(project,file,dir,assetSrc=null,assetRef=null){
 const fp=fileFingerprint(file),key=indexKey(project,fp),canonical=projectUrl(project);
 const existing=memory.get(key);
 const record={project:canonical,hash:fp.hash,filename:fp.filename,bytes:fp.bytes,assetSrc:assetSrc||existing?.assetSrc||null,assetKey:assetRef?.key||existing?.assetKey||null,assetKind:assetRef?.kind||existing?.assetKind||null};
 memory.set(key,record);
 const index=readIndex(dir);
 const next=index.filter(x=>indexKey(x.project,{hash:x.hash})!==key);
 next.push({project:canonical,hash:fp.hash,filename:fp.filename,bytes:fp.bytes,...(record.assetKey?{assetKey:record.assetKey,assetKind:record.assetKind}:{})});
 fs.mkdirSync(dir,{recursive:true});
 const target=path.join(dir,CACHE_FILE),temp=target+".tmp-"+process.pid;
 fs.writeFileSync(temp,JSON.stringify({version:1,entries:next.slice(-100)},null,2)+"\n","utf8");
 fs.renameSync(temp,target);
 return {...record,from:"new"};
}
function clearMemory(){memory.clear();}
module.exports={CACHE_FILE,fileFingerprint,indexKey,getReference,rememberReference,clearMemory};
