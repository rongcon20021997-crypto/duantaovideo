"use strict";
// Compatibility patch for the pinned upstream gflow-cli. Only replace the project navigator
// and legacy domain references in the installed package; all generation/DOM workflows remain upstream.
const fs = require("node:fs");
const path = require("node:path");
const oldUrl = "https://labs.google/fx/tools/flow";
const newUrl = "https://flow.google.com";
const modules = ["page.js", "ui.js"];
const navigatorSource = "export async function navigateToProject(page, projectName) {\n  const requested = String(projectName || \"\").trim();\n  let directId;\n  if (/^https?:\\/\\//i.test(requested)) {\n    let url;\n    try { url = new URL(requested); } catch { throw new Error(\"Project URL không hợp lệ.\"); }\n    if (![\"flow.google.com\", \"labs.google\"].includes(url.hostname)) throw new Error(\"Chỉ chấp nhận URL project từ Google Flow.\");\n    const matched = url.pathname.match(/\\/project\\/([0-9a-f-]{24,})(?:\\/|$)/i);\n    if (!matched) throw new Error(\"URL phải là project Google Flow dạng https://flow.google.com/project/<id>.\");\n    directId = matched[1];\n  } else if (/^[0-9a-f-]{24,}$/i.test(requested)) {\n    directId = requested;\n  }\n  const currentUrl = page.url();\n  const current = projectIdFromUrl(currentUrl);\n  if (directId) {\n    if (current && current.toLowerCase() === directId.toLowerCase() && !/\\/404(?:[/?#]|$)/.test(currentUrl)) return current;\n    await page.goto(projectSubUrl(directId, \"\"), { waitUntil: \"domcontentloaded\" });\n    await page.waitForTimeout(900);\n    const after = page.url();\n    if (/\\/404(?:[/?#]|$)/.test(after)) {\n      throw new Error(\"Google Flow chuyển đến /404 khi mở project. Project có thể không tồn tại hoặc không thuộc tài khoản Google đang đăng nhập trong Chrome của GFlow. Kiểm tra quyền và đúng tài khoản; URL: \" + after);\n    }\n    const actual = projectIdFromUrl(after);\n    if (!actual || actual.toLowerCase() !== directId.toLowerCase()) {\n      throw new Error(\"Không mở được project đã chọn. URL thực tế: \" + after + \". Hãy mở project thủ công bằng đúng tài khoản Google Flow trước khi chạy.\");\n    }\n    return actual;\n  }\n  if (!requested && current && !/\\/404(?:[/?#]|$)/.test(currentUrl)) return current;\n  if (/\\/404(?:[/?#]|$)/.test(currentUrl) && !requested) {\n    throw new Error(\"Google Flow đang ở /404. Ứng dụng đã dừng, không tự nhấn Tạo dự án. Hãy trở lại Flow, mở một project thuộc tài khoản đã đăng nhập, rồi dán URL project vào Cài đặt.\");\n  }\n\n  await page.goto(FLOW_BASE, { waitUntil: \"domcontentloaded\" });\n  await page.locator('a[href*=\"/project/\"]').first().waitFor({ state: \"visible\", timeout: 8000 }).catch(() => undefined);\n  const links = await page.locator('a[href*=\"/project/\"]').evaluateAll(elements =>\n    elements.map(a => {\n      const href = a.getAttribute(\"href\") || \"\";\n      let card = a;\n      while (card.parentElement && card.parentElement.querySelectorAll('a[href*=\"/project/\"]').length === 1) card = card.parentElement;\n      return { href, label: (card.textContent || \"\").trim() };\n    }).filter(x => /\\/project\\/[0-9a-f-]{24,}(?:[/?#]|$)/i.test(x.href))\n  );\n  const match = requested ? links.find(x => x.label.toLocaleLowerCase().includes(requested.toLocaleLowerCase())) : links[0];\n  if (!match) {\n    throw new Error(\"Không tìm thấy project Google Flow có thể truy cập. DuAnTaoVideo sẽ KHÔNG tự bấm Tạo dự án vì Flow có thể chuyển sang /404. Hãy mở https://flow.google.com bằng Chrome đăng nhập GFlow, tự tạo hoặc mở một project, rồi sao chép URL vào Cài đặt → Project Google Flow.\");\n  }\n  await page.goto(new URL(match.href, FLOW_BASE).toString(), { waitUntil: \"domcontentloaded\" });\n  await page.waitForTimeout(900);\n  const after = page.url();\n  if (/\\/404(?:[/?#]|$)/.test(after)) {\n    throw new Error(\"Flow trả về /404 khi mở project có sẵn. Hãy kiểm tra project đó thuộc đúng tài khoản Google đang đăng nhập. URL: \" + after);\n  }\n  const found = projectIdFromUrl(after);\n  if (!found) throw new Error(\"Không mở được project Google Flow. URL sau điều hướng: \" + after + \". Hãy chọn project thủ công và dán URL project vào Cài đặt.\");\n  return found;\n}\n\n";
const existingSource = "export async function resolveExistingProject(page, projectName) {\n  // Media, scenes, character and image workflows never create a project implicitly.\n  return navigateToProject(page, projectName);\n}\n\n";
const NAV_START = "export async function navigateToProject(";
const EXIST_START = "export async function resolveExistingProject(";
const END_MARKER = "export async function pickOptionInSection(";
function replaceNavigation(src){
  const begin=src.indexOf(NAV_START), end=src.indexOf(END_MARKER,begin);
  if(begin<0||end<0||end<=begin) throw new Error("Upstream GFlow project navigation changed. Refusing unsafe patch; review dependency version.");
  const before=src.slice(0,begin), after=src.slice(end);
  if(!src.slice(begin,end).includes(EXIST_START)) throw new Error("GFlow project navigator signature changed. Review upstream.");
  return before+navigatorSource+existingSource+after;
}

const OPEN_GOTO = 'await this.page.goto(this.flowUrl, { waitUntil: "domcontentloaded" });';
const OPEN_GUARD = 'if (!/\\/project\\/[0-9a-f-]{24,}/i.test(this.page.url())) await this.page.goto(this.flowUrl, { waitUntil: "domcontentloaded" });';
function patchFlowOpen(source) {
  if(source.includes(OPEN_GUARD))return source;
  if(!source.includes(OPEN_GOTO))throw Error("GFlow upstream FlowPage.open changed: cannot safely skip home navigation.");
  return source.replace(OPEN_GOTO,OPEN_GUARD);
}


function patchBrowserSession(source){
  // Upstream only checks running processes using "ps" and returns [] on Windows.
  // Reuse the authenticated Chrome's DevToolsActivePort on Windows as on macOS/Linux.
  const oldPort="const existingPort = running.length > 0 ? await readDevToolsPort(profileDir) : undefined;";
  const newPort="const existingPort = await readDevToolsPort(profileDir);";
  if(source.includes(oldPort))source=source.replace(oldPort,newPort);
  else if(!source.includes(newPort))throw Error("Upstream GFlow browser session port detection changed. Review pinned version.");
  const oldSelector='page.url().includes("labs.google")';
  const newSelector='(page.url().includes("flow.google.com") || page.url().includes("labs.google"))';
  if(source.includes(newSelector))return source;
  if(!source.includes(oldSelector))throw Error("Upstream GFlow browser tab matcher changed. Review pinned version.");
  return source.replace(oldSelector,newSelector);
}

function patchGFlow(root=path.resolve(__dirname,"..")){
 const dir=path.join(root,"node_modules","@swissmarley","gflow-cli","dist","src","flow");
 let changed=0;
 for(const basename of modules){
   const file=path.join(dir,basename);
   if(!fs.existsSync(file))throw new Error("Missing GFlow CLI module: "+file);
   const before=fs.readFileSync(file,"utf8");
   let after=before.split(oldUrl).join(newUrl);
   if(basename==="ui.js") after=replaceNavigation(after);
   if(basename==="page.js") after=patchFlowOpen(after);
   if(!after.includes(newUrl))throw new Error("Expected Flow URL not found in "+basename);
   if(after!==before){fs.writeFileSync(file,after,"utf8");changed++;}
 }
 const sessionPath=path.join(root,"node_modules","@swissmarley","gflow-cli","dist","src","browser","session.js");
 if(!fs.existsSync(sessionPath))throw Error("Missing upstream browser/session.js");
 const prevSession=fs.readFileSync(sessionPath,"utf8");
 const nextSession=patchBrowserSession(prevSession);
 if(nextSession!==prevSession){fs.writeFileSync(sessionPath,nextSession,"utf8");changed++;}
 return {changed,modules:modules.length+1,origin:newUrl};
}
if(require.main===module){
 try{const info=patchGFlow();console.log("GFlow project compatibility: "+info.origin+" ("+info.changed+" modules updated)");}
 catch(error){console.error("GFlow compatibility patch failed: "+error.message);process.exitCode=1;}
}
module.exports={patchGFlow,patchBrowserSession,patchFlowOpen,replaceNavigation,navigatorSource,existingSource,oldUrl,newUrl};
