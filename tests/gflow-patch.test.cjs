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
 const browserDir=path.join(temp,"node_modules","@swissmarley","gflow-cli","dist","src","browser");
 fs.mkdirSync(browserDir,{recursive:true});
 fs.writeFileSync(path.join(browserDir,"session.js"),
  'const existingPort = running.length > 0 ? await readDevToolsPort(profileDir) : undefined; function pickFlowPage(context) { return context.pages().find((page) => page.url().includes("labs.google")); } // Bundled-Chromium path\nif (!browser) { launchChrome(); }');
 fs.writeFileSync(path.join(dir,"page.js"),'const url="https://labs.google/fx/tools/flow"; class FlowPage { async open() { await this.page.goto(this.flowUrl, { waitUntil: "domcontentloaded" }); } async runJob(input) { await this.assertReady(); await this.applySettings(input.job); await this.fillPrompt(input.job.prompt); await this.submit(); } async submit() { const submit = flowLocators(this.page).submitButton.first(); await submit.waitFor({ state: "visible", timeout: 15000 }); } }');
 fs.writeFileSync(path.join(dir,"ui.js"),fixture);
 fs.writeFileSync(path.join(dir,"locators.js"),[
 'export function flowLocators(page) { return {',
 'promptBox: page.locator(\'[role="textbox"][contenteditable="true"]\'),',
 'submitButton: page.locator("button", { hasText: "Create" }).filter({ hasText: /arrow_forward/ }),',
 'settingsButton: page.locator("button").filter({ hasText: /crop_(16_9|9_16|square|portrait|landscape)/ }),',
 '}; }'].join("\n"));
 fs.writeFileSync(path.join(dir,"characters.js"),
 'await this.page.goto(projectSubUrl(projectId, "characters"), { waitUntil: "domcontentloaded" }); await this.page.goto(projectSubUrl(projectId, ""), { waitUntil: "domcontentloaded" });');
 const cliDir=path.join(temp,"node_modules","@swissmarley","gflow-cli","dist","src");
 fs.writeFileSync(path.join(cliDir,"cli.js"),
 'await session.page.goto(FLOW_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);');
 try{
  assert.equal(patchGFlow(temp).changed,6);
  assert.equal(patchGFlow(temp).changed,0);
  const ui=fs.readFileSync(path.join(dir,"ui.js"),"utf8");
  assert.ok(!ui.includes("createControl.click"));
  assert.ok(ui.includes("KHÔNG tự bấm Tạo dự án"));
  assert.ok(ui.includes(newUrl));
  const page=fs.readFileSync(path.join(dir,"page.js"),"utf8");
  assert.ok(page.includes("if (!/\\/project\\/"));
  assert.ok(page.includes(newUrl));
  const session=fs.readFileSync(path.join(browserDir,"session.js"),"utf8");
  assert.ok(session.includes("const existingPort = await readDevToolsPort(profileDir);"));
  assert.ok(session.includes('page.url().includes("flow.google.com")'));
  assert.ok(session.includes("GFLOW_USE_CURRENT_TAB"));
  const cli=fs.readFileSync(path.join(browserDir,"..","cli.js"),"utf8");
  assert.ok(cli.includes('process.env.GFLOW_USE_CURRENT_TAB !== "1"'));
  const chars=fs.readFileSync(path.join(dir,"characters.js"),"utf8");
  assert.ok(chars.includes('process.env.GFLOW_USE_CURRENT_TAB !== "1"'));
  const locators=fs.readFileSync(path.join(dir,"locators.js"),"utf8");
  assert.ok(locators.includes("Generate Image"));
  assert.ok(locators.includes("Bắt đầu tạo"));
  assert.ok(locators.includes("arrow_forward"));
  assert.ok(locators.includes("textarea[placeholder]"));
  assert.ok(page.includes("gflow stage: submitting prompt"));
  assert.ok(page.includes("gflow stage: submit controls"));
  assert.doesNotThrow(()=>new Function(page));
  assert.ok(page.includes("GFlow VIDEO MODE NOT SELECTED"));
  assert.ok(page.includes("GFlow IMAGE MODE NOT SELECTED"));
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
   {URL,process:{env:{}},FLOW_BASE:"https://flow.google.com",
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
   {URL,process:{env:{}},FLOW_BASE:"https://flow.google.com",
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

test("Windows GFlow browser session reuses active debug port and recognizes new Flow host",()=>{
 const {patchBrowserSession}=require("../scripts/patch-gflow.cjs");
 const old='const existingPort = running.length > 0 ? await readDevToolsPort(profileDir) : undefined; function pickFlowPage(context) { return context.pages().find(page => page.url().includes("labs.google")); } // Bundled-Chromium path\nif (!browser) { launchChrome(); }';
 const patched=patchBrowserSession(old);
 assert.ok(patched.includes("const existingPort = await readDevToolsPort(profileDir);"));
 assert.ok(patched.includes('page.url().includes("flow.google.com")'));
 assert.equal(patchBrowserSession(patched),patched);
});

test("current-tab mode never navigates to a project URL when editor is already open",async()=>{
 const vm=require("node:vm");
 const fn=vm.runInNewContext(
   navigatorSource.replace(/^export /,"")+"\nnavigateToProject",
   {URL,process:{env:{GFLOW_USE_CURRENT_TAB:"1"}},FLOW_BASE:"https://flow.google.com",
    projectIdFromUrl:url=>String(url).match(/\/project\/([0-9a-f-]+)/i)?.[1],
    projectSubUrl:id=>"https://flow.google.com/project/"+id});
 const url="https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000";
 let navigations=0;
 const page={url:()=>url,goto:()=>{navigations++;throw Error("Navigation prohibited");}};
 const id=await fn(page,url);
 assert.equal(id,"123e4567-e89b-12d3-a456-426614174000");
 assert.equal(navigations,0);
});
test("current-tab mode stops on mismatched project without navigating",async()=>{
 const vm=require("node:vm");
 const fn=vm.runInNewContext(
   navigatorSource.replace(/^export /,"")+"\nnavigateToProject",
   {URL,process:{env:{GFLOW_USE_CURRENT_TAB:"1"}},FLOW_BASE:"https://flow.google.com",
    projectIdFromUrl:url=>String(url).match(/\/project\/([0-9a-f-]+)/i)?.[1]});
 const page={url:()=>"https://flow.google.com/project/123e4567-e89b-12d3-a456-426614174000",
   goto:()=>{throw Error("Unwanted navigation");}};
 await assert.rejects(()=>fn(page,"https://flow.google.com/project/999e4567-e89b-12d3-a456-426614174999"),/không trùng project/);
});

test("GFlow select image UI supports Generate Image and old Create arrow",()=>{
 const {patchFlowLocators}=require("../scripts/patch-gflow.cjs");
 const src=[
 'promptBox: page.locator(\'[role="textbox"][contenteditable="true"]\'),',
 'submitButton: page.locator("button", { hasText: "Create" }).filter({ hasText: /arrow_forward/ }),',
 'settingsButton: page.locator("button").filter({ hasText: /crop_(16_9|9_16|square|portrait|landscape)/ }),'].join("\n");
 const out=patchFlowLocators(src);
 assert.match(out,/Generate Image/);
 assert.match(out,/textarea\[placeholder\]/);
 assert.equal(patchFlowLocators(out),out);
});
test("GFlow job diagnostics marks stages and remains idempotent",()=>{
 const {patchFlowJobDiagnostics}=require("../scripts/patch-gflow.cjs");
 const s="await this.assertReady(); await this.applySettings(input.job); await this.fillPrompt(input.job.prompt); await this.submit();";
 const r=patchFlowJobDiagnostics(s);
 assert.match(r,/gflow stage: submitting prompt/);
 assert.equal(patchFlowJobDiagnostics(r),r);
});

test("Vietnamese Flow submit selector matches Bắt đầu tạo for image and video",()=>{
 const {patchFlowLocators}=require("../scripts/patch-gflow.cjs");
 const input=[
 'promptBox: page.locator(\'[role="textbox"][contenteditable="true"]\'),',
 'submitButton: page.locator("button", { hasText: "Create" }).filter({ hasText: /arrow_forward/ }),',
 'settingsButton: page.locator("button").filter({ hasText: /crop_16_9/ }),'
 ].join("\n");
 const patched=patchFlowLocators(input);
 assert.match(patched,/Bắt đầu tạo/);
 assert.match(patched,/arrow_forward/);
 assert.match(patched,/Generate Image/);
 assert.match(patched,/Start generation/);
 assert.equal(patchFlowLocators(patched),patched);
});
test("GFlow video mode safety aborts before submitting when model pill still says Nano Banana",()=>{
 const {patchFlowModeGuard,patchFlowSubmitDiagnostics}=require("../scripts/patch-gflow.cjs");
 const source=[
 "async runJob(input) { await this.applySettings(input.job); }",
 'async submit() { await submit.waitFor({ state: "visible", timeout: 15000 }); }'
 ].join("\n");
 const guarded=patchFlowModeGuard(source);
 assert.match(guarded,/GFlow VIDEO MODE NOT SELECTED/);
 assert.match(guarded,/GFlow IMAGE MODE NOT SELECTED/);
 assert.equal(patchFlowModeGuard(guarded),guarded);
 const diagnosed=patchFlowSubmitDiagnostics(guarded);
 assert.match(diagnosed,/gflow stage: submit controls/);
 assert.equal(patchFlowSubmitDiagnostics(diagnosed),diagnosed);
});

test("video mode guard refuses Nano Banana before submitting and permits Veo",async()=>{
 const vm=require("node:vm");
 const {patchFlowModeGuard}=require("../scripts/patch-gflow.cjs");
 const src='class Guarded { async applySettings() {} async runJob(input) { await this.applySettings(input.job); this.submitted=true; } } Guarded';
 const C=vm.runInNewContext(patchFlowModeGuard(src),{});
 const model=text=>({locator:()=>({filter:()=>({first:()=>({innerText:async()=>text})})})});
 const instance=new C();
 instance.page=model("🍌 Nano Banana 2.1 crop_16_9 x2");
 await assert.rejects(()=>instance.runJob({job:{type:"video"}}),/VIDEO MODE NOT SELECTED/);
 assert.equal(instance.submitted,undefined);
 instance.page=model("Veo 3.1 crop_16_9 x1");
 await instance.runJob({job:{type:"video"}});
 assert.equal(instance.submitted,true);
});
test("image mode guard refuses to generate an image with Veo selected",async()=>{
 const vm=require("node:vm");
 const {patchFlowModeGuard}=require("../scripts/patch-gflow.cjs");
 const src='class Guarded { async applySettings() {} async runJob(input) { await this.applySettings(input.job); this.submitted=true; } } Guarded';
 const C=vm.runInNewContext(patchFlowModeGuard(src),{});
 const instance=new C();
 instance.page={locator:()=>({filter:()=>({first:()=>({innerText:async()=>"Veo 3.1 crop_9_16 x1"})})})};
 await assert.rejects(()=>instance.runJob({job:{type:"image"}}),/IMAGE MODE NOT SELECTED/);
 assert.equal(instance.submitted,undefined);
});
