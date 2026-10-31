const test=require("node:test");
const assert=require("node:assert/strict");
const {rankUploadControls,scoreUploadControl,isPickerUploadAction,EXACT_UPLOAD}=require("../electron/lib/flow-upload-finder.cjs");
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

test("upload icon only in media picker is a high-score upload control",()=>{
 const x=rankUploadControls([{icon:"cloud_upload",visible:true,near:true,insideComposer:true},{text:"Add to Prompt",visible:true,near:true,insideComposer:true}]);
 assert.equal(x[0].index,0);
});

test("real Vietnamese Google Flow asset picker: click footer Upload, never sidebar Uploaded",()=>{
 const controls=[
   {text:"close",aria:"Thêm thành phần vào ô nhập câu lệnh",visible:true,near:true,popup:true},
   {text:"Tệp tải lên",aria:"",visible:true,near:true},
   {text:"upload Tải nội dung nghe nhìn lên",aria:"",visible:true,near:true,insideComposer:true},
   {text:"arrow_forward",aria:"Bắt đầu tạo",visible:true,near:true}
 ];
 assert.equal(isPickerUploadAction(controls[1]),false);
 assert.equal(isPickerUploadAction(controls[2]),true);
 assert.equal(EXACT_UPLOAD.test(controls[2].text),true);
 assert.equal(isPickerUploadAction(controls[3]),false);
 const matches=rankUploadControls(controls).filter(isPickerUploadAction);
 assert.equal(matches.length,1);
 assert.equal(matches[0].index,2);
});
test("asset upload action is independent of locale and accessible text",()=>{
 assert.equal(isPickerUploadAction({text:"upload Upload from computer"}),true);
 assert.equal(isPickerUploadAction({text:"file_upload"}),true);
 assert.equal(isPickerUploadAction({text:"Thêm vào ô nhập câu lệnh"}),false);
});
