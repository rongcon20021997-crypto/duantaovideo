const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
require("../extension/asset-core.js");
const core=globalThis.DTVAssetCore;
const bridge=require("../electron/lib/flow-extension-bridge.cjs");
const p="https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000";
test("extension identifies explicit Flow DOM media id without claiming it is public Google ID",()=>{
 const id=core.identity({project:p,attrs:{"data-media-id":"asset-1234"},src:"https://cdn/image?token=secret",label:"reference.png"});
 assert.equal(id.kind,"dom");assert.equal(id.key,"dom:data-media-id:asset-1234");assert.equal(id.rawId,"asset-1234");
});
test("extension generates local fallback independent of expiring URL query token",()=>{
 const a=core.identity({project:p,src:"https://cdn.google/img/abc?Expires=1&token=secret",label:"character.jpg"});
 const b=core.identity({project:p,src:"https://cdn.google/img/abc?Expires=2&token=other",label:"character.jpg"});
 assert.equal(a.key,b.key);assert.equal(a.kind,"local");assert.equal(a.rawId,null);
 assert.notEqual(a.key,core.identity({project:p,src:"https://cdn.google/img/xyz",label:"character.jpg"}).key);
});
test("IDs are scoped to Flow project URLs only",()=>{
 assert.equal(core.projectFromUrl("https://flow.google.com/404"),null);
 assert.equal(core.identity({project:"https://example.com/project/1234",src:"x",label:"x"}),null);
});
test("extension status reads only DOM bridge marker from live tab",async()=>{
 const page={evaluate:async fn=>fn()};
 const saved=global.document;
 global.document={documentElement:{dataset:{dtvExtensionReady:"1",dtvExtensionVersion:"1.0.0",dtvPickerVisible:"1",dtvAssetCount:"2"}}};
 try{const r=await bridge.extensionStatus(page);assert.equal(r.ready,true);assert.equal(r.visibleAssetCount,2);}
 finally{global.document=saved;}
});
test("extension bridge never sends network calls for selecting an asset",async()=>{
 let clicked=false,seen=null;
 const page={evaluate:async(fn,arg)=>{
   if(arg){seen=arg;return true;}
   return null;
  },locator:selector=>{
   assert.equal(selector,'img[data-dtv-bridge-select="1"]');
   return {first:()=>({locator:()=>({count:async()=>0}),click:async()=>{clicked=true;}})};
  }};
 assert.equal(await bridge.selectExtensionAsset(page,"local:abc"),true);
 assert.equal(seen,"local:abc");assert.equal(clicked,true);
});
test("findExtensionAssetByFilename matches short filenames and name stems",async()=>{
 const page={evaluate:async(fn,arg)=>{
  const saved=global.document;
  global.document={
   documentElement:{dataset:{dtvExtensionReady:"1"}},
   querySelector:()=>({
    querySelectorAll:()=>[{
     dataset:{dtvAssetKey:"local:nv1",dtvAssetKind:"local",dtvAssetLabel:"nv1.png"},
     alt:"",closest:()=>null,parentElement:null
    }]
   })
  };
  try{return fn(arg);}finally{global.document=saved;}
 }};
 const result=await bridge.findExtensionAssetByFilename(page,"/refs/nv1.png");
 assert.equal(result?.key,"local:nv1");
});
test("content.js executes in DOM and tags images without ReferenceError",async()=>{
 const src=fs.readFileSync(require("node:path").join(__dirname,"..","extension","content.js"),"utf8");
 const imgs=[{
  getBoundingClientRect:()=>({width:100,height:100}),
  naturalWidth:100,naturalHeight:100,
  currentSrc:"https://flow.google.com/cdn/image1.png",
  dataset:{},getAttribute:()=>null,parentElement:{
   parentElement:null,innerText:"character_sample.png",getAttribute:()=>null
  }
 }];
 const picker={
  getBoundingClientRect:()=>({width:500,height:500}),parentElement:null,setAttribute:(k,v)=>{picker[k]=v;},
  querySelectorAll:()=>imgs,
  querySelector:()=>({getBoundingClientRect:()=>({width:100,height:30})})
 };
 const uploadBtn={
  getBoundingClientRect:()=>({width:100,height:40}),
  getAttribute:()=>"Tải nội dung nghe nhìn lên",
  innerText:"Tải nội dung nghe nhìn lên",
  parentElement:picker,closest:()=>picker
 };
 const docEl={dataset:{}};
 const sandbox={
  console,DTVAssetCore:core,globalThis:{DTVAssetCore:core},
  document:{
   documentElement:docEl,body:{parentElement:null},
   querySelectorAll:(sel)=>sel.includes("button")?[uploadBtn]:[],
   querySelector:()=>picker
  },
  location:{href:p},
  getComputedStyle:()=>({display:"block",visibility:"visible"}),
  MutationObserver:class{observe(){}disconnect(){}},
  chrome:{runtime:{onMessage:{addListener:()=>{}}},storage:{local:{get:async()=>({}),set:async()=>{}}}},
  queueMicrotask:(fn)=>fn(),
  setTimeout:()=>{}
 };
 vm.runInNewContext(src,sandbox); await new Promise(r=>setTimeout(r,50));
 assert.equal(docEl.dataset.dtvExtensionReady,"1");
 assert.equal(docEl.dataset.dtvPickerVisible,"1");
 assert.equal(docEl.dataset.dtvAssetCount,"1");
 assert.ok(imgs[0].dataset.dtvAssetKey);
});
