const test=require("node:test");
const assert=require("node:assert/strict");
const {rankUploadControls,scoreUploadControl}=require("../electron/lib/flow-upload-finder.cjs");
test("Flow icon-only add_2 toolbar control is discovered",()=>{
 const list=[{text:"🍌 Nano Banana 2.1",near:true,insideComposer:true,visible:true},
  {text:"",icon:"add_2",near:true,popup:true,insideComposer:true,visible:true},
  {text:"Create",icon:"arrow_forward",near:true,insideComposer:true,visible:true}];
 const ranked=rankUploadControls(list);assert.equal(ranked[0].index,1);
 assert.equal(ranked.some(x=>x.index===2),false);
});
test("upload media picker is recognized",()=>{
 const found=rankUploadControls([{text:"Upload from computer",visible:true,near:false},
  {aria:"Add image",near:true,visible:true}]);
 assert.equal(found[0].index,1);
});
test("unrelated new project and generate are never upload targets",()=>{
 for(const text of ["New Project","Generate Image","Create Character","arrow_forward Create"]){
  assert.ok(scoreUploadControl({text,near:true,insideComposer:true,popup:true,visible:true})<24,text);
 }
});
test("generic + button must be near composer and visible",()=>{
 assert.ok(scoreUploadControl({aria:"Add",near:true,insideComposer:true,visible:true})>=24);
 assert.ok(scoreUploadControl({aria:"Add",near:false,insideComposer:false,visible:true})<24);
 assert.ok(scoreUploadControl({aria:"Add",near:true,insideComposer:true,visible:false})<24);
});
