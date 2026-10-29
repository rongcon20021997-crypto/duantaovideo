const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {imageCommand}=require("../electron/lib/image.cjs");
const sample={project:"https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000",profile:"default",outputDir:"/tmp/out",imageModel:"Nano Banana Pro",ratio:"9:16",character:{name:"Alex"}};
test("image action builds a real gflow-cli image command with a project",()=>{
 const r=imageCommand(sample,{id:"frame-01",prompt:"A chef making noodles"});
 assert.equal(r.args[0],"image");
 assert.deepEqual(r.args.slice(1,3),["--id","frame-01"]);
 assert.equal(r.args.at(-1),sample.project);
 assert.ok(!r.args.includes("--character"));
 assert.equal(r.dir,path.resolve("/tmp/out"));
});
test("image can optionally use an existing saved character",()=>{
 const r=imageCommand(sample,{id:"frame02",prompt:"Portrait",useSavedCharacter:true});
 assert.deepEqual(r.args.slice(-2),["--character","Alex"]);
});
test("image action refuses missing project instead of auto-creating Flow projects",()=>{
 assert.throws(()=>imageCommand({...sample,project:""},{prompt:"hello"}),/Chưa chọn Project/);
});
test("image action refuses empty prompt and invalid character",()=>{
 assert.throws(()=>imageCommand(sample,{prompt:"  "}),/Prompt/);
 assert.throws(()=>imageCommand({...sample,character:{name:""}},{prompt:"portrait",useSavedCharacter:true}),/tên nhân vật/);
});
test("image job ID removes path separators",()=>{
 assert.equal(imageCommand(sample,{id:"image/../../test",prompt:"a"}).id,"image-------test");
});
