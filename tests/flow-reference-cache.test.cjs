const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const cache=require("../electron/lib/flow-reference-cache.cjs");
const projectA="https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000";
const projectB="https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174001";
test("one uploaded photo is remembered for all six scenes and survives app restart",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"flow-ref-"));
 try{
  const image=path.join(dir,"character.png");
  fs.writeFileSync(image,Buffer.from("local reference image 123"));
  assert.equal(cache.getReference(projectA,image,dir),null);
  cache.rememberReference(projectA,image,dir,"blob:cached-image");
  for(let i=0;i<6;i++){
   const ref=cache.getReference(projectA,image,dir);
   assert.equal(ref.filename,"character.png");
   assert.equal(ref.assetSrc,"blob:cached-image");
  }
  cache.clearMemory();
  const restored=cache.getReference(projectA,image,dir);
  assert.equal(restored.from,"disk");
  assert.equal(restored.filename,"character.png");
  assert.equal(restored.assetSrc,null);
  assert.equal(cache.getReference(projectB,image,dir),null,"other projects must not share uploads");
  fs.writeFileSync(image,Buffer.from("a different photo"));
  assert.equal(cache.getReference(projectA,image,dir),null,"changed photo needs its own upload");
 }finally{cache.clearMemory();fs.rmSync(dir,{recursive:true,force:true});}
});
test("project upload index contains only project, filename, content hash and byte size",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"flow-ref-"));
 try{
  const image=path.join(dir,"sample.jpg");fs.writeFileSync(image,"bytes");
  cache.rememberReference(projectA,image,dir,"https://private.example/signed-image?token=SECRET");
  const raw=fs.readFileSync(path.join(dir,cache.CACHE_FILE),"utf8");
  assert.doesNotMatch(raw,/SECRET|private.example|blob:/);
  assert.match(raw,/sample.jpg/);
 }finally{cache.clearMemory();fs.rmSync(dir,{recursive:true,force:true});}
});

test("persists extension asset key across app restart and keeps project isolation",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"flow-ref-id-"));
 try{
  const image=path.join(dir,"sample.jpg");fs.writeFileSync(image,"same-picture-2026");
  cache.rememberReference(projectA,image,dir,null,{key:"dom:data-media-id:asset-12345",kind:"dom"});
  assert.equal(cache.getReference(projectA,image,dir).assetKey,"dom:data-media-id:asset-12345");
  cache.clearMemory();
  const restored=cache.getReference(projectA,image,dir);
  assert.equal(restored.assetKey,"dom:data-media-id:asset-12345");
  assert.equal(restored.assetKind,"dom");
  assert.equal(cache.getReference(projectB,image,dir),null);
  assert.doesNotMatch(fs.readFileSync(path.join(dir,cache.CACHE_FILE),"utf8"),/private.example|cookie|token/);
 }finally{cache.clearMemory();fs.rmSync(dir,{recursive:true,force:true});}
});
