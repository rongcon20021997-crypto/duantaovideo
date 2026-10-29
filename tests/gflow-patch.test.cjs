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
 fs.writeFileSync(path.join(dir,"page.js"),'const url="https://labs.google/fx/tools/flow"; class FlowPage { async open() { await this.page.goto(this.flowUrl, { waitUntil: "domcontentloaded" }); } }');
 fs.writeFileSync(path.join(dir,"ui.js"),fixture);
 try{
  assert.equal(patchGFlow(temp).changed,2);
  assert.equal(patchGFlow(temp).changed,0);
  const ui=fs.readFileSync(path.join(dir,"ui.js"),"utf8");
  assert.ok(!ui.includes("createControl.click"));
  assert.ok(ui.includes("KHÔNG tự bấm Tạo dự án"));
  assert.ok(ui.includes(newUrl));
  const page=fs.readFileSync(path.join(dir,"page.js"),"utf8");
  assert.ok(page.includes("if (!/\\/project\\/"));
  assert.ok(page.includes(newUrl));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test("navigator patch refuses mismatched upstream instead of silently corrupting library",()=>{
 assert.throws(()=>replaceNavigation("export async function navigateToProject() {}"),/navigator|Upstream/i);
});
test("navigator never creates projects and validates Flow /404 redirects",()=>{
 assert.match(navigatorSource,/toLocaleLowerCase/);
 assert.match(navigatorSource,/directId/);
 assert.ok(!navigatorSource.includes("createControl.click"));
 assert.match(navigatorSource,/\/404/);
 assert.match(navigatorSource,/KHÔNG tự bấm Tạo dự án/);
});

test("no accessible project: fail safely without clicking New Project",async()=>{
 const vm=require("node:vm");
 const fn=vm.runInNewContext(
   navigatorSource.replace(/^export /,"")+"\nnavigateToProject",
   {URL,FLOW_BASE:"https://flow.google.com",
     projectIdFromUrl:u=>String(u).match(/\/project\/([0-9a-f-]+)/i)?.[1],
     projectSubUrl:id=>"https://flow.google.com/project/"+id});
 let current="https://flow.google.com/",clicks=0;
 const page={
   url:()=>current,
   goto:async url=>{current=url;},
   waitForTimeout:async()=>undefined,
   locator:()=>({first:()=>({waitFor:async()=>{}}),evaluateAll:async()=>[]}),
   getByRole:()=>{clicks++;throw Error("Must not click Create Project");}
 };
 await assert.rejects(()=>fn(page),/KHÔNG tự bấm Tạo dự án/);
 assert.equal(clicks,0);
});
test("invalid project permission redirects to 404 and aborts",async()=>{
 const vm=require("node:vm");
 const fn=vm.runInNewContext(
   navigatorSource.replace(/^export /,"")+"\nnavigateToProject",
   {URL,FLOW_BASE:"https://flow.google.com",
     projectIdFromUrl:u=>String(u).match(/\/project\/([0-9a-f-]+)/i)?.[1],
     projectSubUrl:id=>"https://flow.google.com/project/"+id});
 let current="https://flow.google.com/";
 const page={url:()=>current,goto:async()=>{current="https://flow.google.com/404?reason=project";},waitForTimeout:async()=>{}};
 await assert.rejects(()=>fn(page,"https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000"),/\/404/);
});

test("FlowPage.open preserves an editor already showing an authenticated project",()=>{
 const {patchFlowOpen}=require("../scripts/patch-gflow.cjs");
 const src='await this.page.goto(this.flowUrl, { waitUntil: "domcontentloaded" });';
 const patched=patchFlowOpen(src);
 assert.match(patched,/this\.page\.url\(\)/);
 assert.match(patched,/\/project/);
 assert.equal(patchFlowOpen(patched),patched);
});
