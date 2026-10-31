const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {validateFiles,imageCandidates,findProjectPage,imageExtension,openFreshReferencePicker,attachExistingReference}=require("../electron/lib/character-image.cjs");
const url="https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000";
test("requires one or two actual reference images",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"reference-test-"));
 try{
  const sample=path.join(dir,"sample.png");fs.writeFileSync(sample,Buffer.alloc(512));
  assert.deepEqual(validateFiles([sample]),[sample]);
  assert.throws(()=>validateFiles([]),/Chọn 1/);
  assert.throws(()=>validateFiles([sample,sample,sample]),/1–2/);
  assert.throws(()=>validateFiles([path.join(dir,"missing.png")]),/không tồn tại/);
  assert.throws(()=>validateFiles([__filename]),/PNG/);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test("result detector ignores icons, thumbnails and unchanged inputs",()=>{
 const x=imageCandidates([{src:"https://a/img/abc",width:800,height:640},
   {src:"https://a/img/abc",width:800,height:640},
   {src:"https://a/avatar/avatar",width:500,height:500},
   {src:"data:image/png;base64,aaaa",width:400,height:400},
   {src:"https://a/icon",width:64,height:64}]);
 assert.deepEqual(x,["https://a/img/abc","data:image/png;base64,aaaa"]);
});
test("find project uses existing Chrome tab and never creates/navigates",async()=>{
 let navigations=0;
 const first={url:()=>url,goto:()=>{navigations++;}};
 const context={pages:()=>[first]};
 assert.equal(await findProjectPage({contexts:()=>[context]},url),first);
 assert.equal(navigations,0);
 await assert.rejects(()=>findProjectPage({contexts:()=>[context]},"https://flow.google.com/project/999e4567-e89b-12d3-a456-426614174999"),/khác project/);
});
test("image signature detection rejects html and uses PNG/JPEG/WebP",()=>{
 assert.equal(imageExtension("image/png",Buffer.from([137,80,78,71])), ".png");
 assert.equal(imageExtension("",Buffer.from([255,216,255,219])), ".jpg");
 assert.equal(imageExtension("",Buffer.from("RIFFxxxxWEBPxxxxx")), ".webp");
 assert.throws(()=>imageExtension("text/html",Buffer.from("<html>")),/không phải tệp ảnh/);
});

test("reference image generator supports a frame prefix and fixes filename click matching",()=>{
 const s=fs.readFileSync(path.join(__dirname,"..","electron","lib","character-image.cjs"),"utf8");
 assert.match(s,/outputPrefix="character"/);
 assert.match(s,/String\(outputPrefix\|\|"character"\)\+"-"\+id/);
 assert.match(s,/page.getByText\(prefix,\{exact:false\}\)/);
 assert.doesNotMatch(s,/new RegExp\(prefix\.replace/);
});

test("scene 2 opens reference picker from the composer instead of using Uploads sidebar",async()=>{
 let composerClicks=0,sidebarClicks=0;
 const plus={isVisible:async()=>true,click:async()=>{composerClicks++;}};
 const page={
  getByRole:(_role,{name})=>{
   if(!/Thêm thành phần/.test(name.source))throw Error("Unexpected non-composer navigation");
   return {first:()=>plus};
  },
  waitForTimeout:async()=>{},
  getByText:()=>{sidebarClicks++;throw Error("No media filename should be sought in sidebar");}
 };
 const upload={label:"Tải nội dung nghe nhìn lên"};
 const picker=await openFreshReferencePicker(page,"character-sample-2026.png",()=>{},undefined,{
   findUpload:async()=>composerClicks===2?upload:null,
   findFilename:async()=>false,
   findConfirm:async()=>null
 });
 assert.equal(picker.upload,upload);
 assert.equal(composerClicks,2,"stale scene-1 picker must be reopened once");
 assert.equal(sidebarClicks,0,"do not navigate to sidebar Uploaded Files");
});
test("scene 2 reuses existing reference and explicitly selects it even if prior media was selected",async()=>{
 let selected=false,attached=false,uploads=0;
 const confirm={isEnabled:async()=>true,click:async()=>{assert.equal(selected,true);attached=true;}};
 const page={
  getByText:prefix=>{
   assert.match(prefix,/character-sample/);
   return {first:()=>({isVisible:async()=>true,click:async()=>{selected=true;}})};
  },
  evaluate:async()=>attached?["attached-reference-image"]:[],
  waitForTimeout:async()=>{}
 };
 const reused=await attachExistingReference(page,"character-sample-2026.png",[],()=>{},undefined,
  {upload:{},matching:true,confirm}, {findConfirm:async()=>confirm});
 assert.equal(reused,true);
 assert.equal(selected,true);
 assert.equal(attached,true);
 assert.equal(uploads,0);
});
test("never attach an arbitrary image if requested reference was not found in picker",async()=>{
 let clicks=0;
 const page={getByText:()=>{clicks++;throw Error("Should not click unrelated media");}};
 const reused=await attachExistingReference(page,"character-sample-2026.png",[],()=>{},undefined,
  {upload:{},matching:false,confirm:{}});
 assert.equal(reused,false);
 assert.equal(clicks,0);
});
test("multi-scene uploader never navigates to Uploaded Files sidebar",()=>{
 const src=fs.readFileSync(path.join(__dirname,"..","electron","lib","character-image.cjs"),"utf8");
 assert.match(src,/openFreshReferencePicker\(page,filepath,log,signal\)/);
 assert.match(src,/attachExistingReference\(page,filepath,composerBefore,log,signal,picker\)/);
 assert.doesNotMatch(src,/uploaded\.click\(/);
 assert.match(src,/Không tự điều hướng sang Tệp tải lên/);
});
