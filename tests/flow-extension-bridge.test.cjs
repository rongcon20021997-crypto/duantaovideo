const test=require("node:test"),assert=require("node:assert/strict");
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
