const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {patchGFlow,newUrl,navigatorSource,replaceNavigation}=require("../scripts/patch-gflow.cjs");
const fixture=["export const FLOW_BASE = \"https://labs.google/fx/tools/flow\";",
 "export function projectIdFromUrl(url){return url.match(/\\/project\\/([0-9a-f-]+)/i)?.[1];}",
 "export function projectSubUrl(id,sub){return FLOW_BASE+\"/project/\"+id+(sub?\"/\"+sub:\"\");}",
 "export async function navigateToProject(page,projectName){throw Error(\"Old navigator\");}",
 "export async function resolveExistingProject(page,projectName){throw Error(\"Old resolver\");}",
 "export async function pickOptionInSection(page) {return true;}"].join("\n");
test("patch changes domain and project navigator, idempotently",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"duanta-flow-"));
 const dir=path.join(temp,"node_modules","@swissmarley","gflow-cli","dist","src","flow");
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"page.js"),'const url="https://labs.google/fx/tools/flow";');
 fs.writeFileSync(path.join(dir,"ui.js"),fixture);
 try{
  assert.equal(patchGFlow(temp).changed,2);
  assert.equal(patchGFlow(temp).changed,0);
  const ui=fs.readFileSync(path.join(dir,"ui.js"),"utf8");
  assert.ok(ui.includes("page.getByRole(\"button\""));
  assert.ok(ui.includes("Open a project manually"));
  assert.ok(ui.includes(newUrl));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test("navigator patch refuses mismatched upstream instead of silently corrupting library",()=>{
 assert.throws(()=>replaceNavigation("export async function navigateToProject() {}"),/navigator|Upstream/i);
});
test("navigator includes existing project, project URL and Vietnamese create button paths",()=>{
 assert.match(navigatorSource,/toLocaleLowerCase/);
 assert.match(navigatorSource,/directId/);
 assert.ok(navigatorSource.includes("tạo\\s+dự"));
});
