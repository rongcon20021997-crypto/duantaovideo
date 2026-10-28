const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {patchGFlow,newUrl}=require("../scripts/patch-gflow.cjs");
test("GFlow compatibility patch targets the upstream URL and is idempotent",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"duanta-flow-"));
 const dir=path.join(temp,"node_modules","@swissmarley","gflow-cli","dist","src","flow");
 fs.mkdirSync(dir,{recursive:true});
 for(const name of ["page.js","ui.js"])fs.writeFileSync(path.join(dir,name),'const url="https://labs.google/fx/tools/flow";');
 try{
   assert.equal(patchGFlow(temp).changed,2);
   assert.equal(patchGFlow(temp).changed,0);
   assert.equal(fs.readFileSync(path.join(dir,"ui.js"),"utf8").includes(newUrl),true);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
