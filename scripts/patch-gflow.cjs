"use strict";
// Small compatibility update for an upstream Flow base URL. All DOM interactions
// remain owned by @swissmarley/gflow-cli — no duplicated controller or selectors.
const fs=require("node:fs");
const path=require("node:path");
const oldUrl="https://labs.google/fx/tools/flow";
const newUrl="https://flow.google.com";
const modules=["page.js","ui.js"];
function patchGFlow(root=path.resolve(__dirname,"..")){
  const dir=path.join(root,"node_modules","@swissmarley","gflow-cli","dist","src","flow");
  let changed=0;
  for(const basename of modules){
    const file=path.join(dir,basename);
    if(!fs.existsSync(file))throw new Error("Không tìm thấy module GFlow CLI: "+file);
    const before=fs.readFileSync(file,"utf8");
    const after=before.split(oldUrl).join(newUrl);
    if(!after.includes(newUrl))throw new Error("GFlow CLI thiếu URL Flow cần thiết trong "+basename+"; kiểm tra upstream trước khi cài.");
    if(after!==before){fs.writeFileSync(file,after,"utf8");changed++;}
  }
  return {changed,modules:modules.length,origin:newUrl};
}
if(require.main===module){
  try{const info=patchGFlow();console.log("GFlow URL compatibility: "+info.origin+" ("+info.changed+" modules updated)");}
  catch(e){console.error("GFlow compatibility patch: "+e.message);process.exitCode=1;}
}
module.exports={patchGFlow,oldUrl,newUrl};
