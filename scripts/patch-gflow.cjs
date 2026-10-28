"use strict";
// Compatibility patch for the pinned upstream gflow-cli. Only replace the project navigator
// and legacy domain references in the installed package; all generation/DOM workflows remain upstream.
const fs = require("node:fs");
const path = require("node:path");
const oldUrl = "https://labs.google/fx/tools/flow";
const newUrl = "https://flow.google.com";
const modules = ["page.js", "ui.js"];
const navigatorSource = "export async function navigateToProject(page, projectName) {\n  const requested = String(projectName || \"\").trim();\n  const directId = projectIdFromUrl(requested) || (/^[0-9a-f-]{24,}$/i.test(requested) ? requested : undefined);\n  if (directId) {\n    if (/^https?:\\/\\//i.test(requested)) {\n      let url;\n      try { url = new URL(requested); } catch { throw new Error(\"Invalid Flow project URL.\"); }\n      if (![\"flow.google.com\", \"labs.google\"].includes(url.hostname)) throw new Error(\"Project URL must belong to Google Flow.\");\n    }\n    await page.goto(projectSubUrl(directId, \"\"), { waitUntil: \"domcontentloaded\" });\n    if (projectIdFromUrl(page.url()) === directId) return directId;\n    throw new Error(\"Flow did not open project \" + directId + \". Check that the link belongs to the signed-in Google account. Current URL: \" + page.url());\n  }\n\n  const current = projectIdFromUrl(page.url());\n  if (!requested && current) return current;\n\n  await page.goto(FLOW_BASE, { waitUntil: \"domcontentloaded\" });\n  // The 2026 Flow dashboard renders project cards and project creation controls\n  // asynchronously. Prefer an existing project, avoiding duplicate project creation.\n  const cards = page.locator('a[href*=\"/project/\"]');\n  const buttonMatcher = /new\\s+project|create\\s+(?:a\\s+)?project|tạo\\s+dự\\s+án|dự\\s+án\\s+mới/i;\n  const createControls = [\n    page.getByRole(\"button\", { name: buttonMatcher }).first(),\n    page.getByRole(\"link\", { name: buttonMatcher }).first(),\n    page.getByText(buttonMatcher).first(),\n    page.locator('a[href$=\"/project/new\"]').first()\n  ];\n\n  let firstHref = null;\n  let createControl = null;\n  const deadline = Date.now() + 17000;\n  while (Date.now() < deadline) {\n    if (requested) {\n      const href = await page.evaluate((name) => {\n        for (const a of document.querySelectorAll('a[href*=\"/project/\"]')) {\n          if (!/\\/project\\/[0-9a-f-]+/i.test(a.getAttribute(\"href\") || \"\")) continue;\n          let node = a;\n          while (node.parentElement && node.parentElement.querySelectorAll('a[href*=\"/project/\"]').length === 1) node = node.parentElement;\n          if ((node.textContent || \"\").toLocaleLowerCase().includes(name.toLocaleLowerCase())) return a.getAttribute(\"href\");\n        }\n        return null;\n      }, requested);\n      if (href) {\n        await page.goto(new URL(href, FLOW_BASE).toString(), { waitUntil: \"domcontentloaded\" });\n        const id = projectIdFromUrl(page.url());\n        if (id) return id;\n        throw new Error('Google Flow could not open project \"' + requested + '\". URL: ' + page.url());\n      }\n    } else {\n      firstHref = await page.evaluate(() => [...document.querySelectorAll('a[href*=\"/project/\"]')].map(a => a.getAttribute(\"href\")).find(href => /\\/project\\/[0-9a-f-]+/i.test(href || \"\")) || null);\n      if (firstHref && projectIdFromUrl(firstHref)) {\n        await page.goto(new URL(firstHref, FLOW_BASE).toString(), { waitUntil: \"domcontentloaded\" });\n        const id = projectIdFromUrl(page.url());\n        if (id) return id;\n        throw new Error(\"Could not open existing Flow project. URL: \" + page.url());\n      }\n      for (const candidate of createControls) {\n        if (await candidate.isVisible().catch(() => false)) { createControl = candidate; break; }\n      }\n      if (createControl) break;\n    }\n    await page.waitForTimeout(500);\n  }\n\n  if (requested) {\n    throw new Error('Project \"' + requested + '\" was not found. In DuAnTaoVideo Settings paste the full project URL (https://flow.google.com/project/<id>) instead of a project name.');\n  }\n  if (createControl) {\n    await createControl.click({ timeout: 10000 });\n    await page.waitForURL(/\\/project\\/[0-9a-f-]+/i, { timeout: 20000 }).catch(() => undefined);\n    const id = projectIdFromUrl(page.url());\n    if (id) return id;\n    // Do NOT click repeatedly: creation may have succeeded server-side without navigating.\n    throw new Error('The New Project control was clicked but Flow did not navigate to a project. Current URL: ' + page.url() + '. Open a project manually and copy its URL into DuAnTaoVideo Settings → Project.');\n  }\n\n  throw new Error('Could not find an existing Flow project or the New Project control. Current URL: ' + page.url() + '. Open https://flow.google.com, sign in, open a project and paste its URL into DuAnTaoVideo Settings → Project.');\n}\n\n";
const existingSource = "export async function resolveExistingProject(page, projectName) {\n  if (projectName) return navigateToProject(page, projectName);\n  const current = projectIdFromUrl(page.url());\n  if (current) return current;\n  await page.goto(FLOW_BASE, { waitUntil: \"domcontentloaded\" });\n  const firstCard = page.locator('a[href*=\"/project/\"]').first();\n  await firstCard.waitFor({ state: \"visible\", timeout: 16000 }).catch(() => undefined);\n  const href = await firstCard.getAttribute(\"href\").catch(() => null);\n  const id = href && projectIdFromUrl(href);\n  if (!id) throw new Error('No Flow project found. Open an existing project and copy its URL to DuAnTaoVideo Settings → Project.');\n  await page.goto(new URL(href, FLOW_BASE).toString(), { waitUntil: \"domcontentloaded\" });\n  if (projectIdFromUrl(page.url()) !== id) throw new Error('Could not open existing Flow project: ' + page.url());\n  return id;\n}\n\n";
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
function patchGFlow(root=path.resolve(__dirname,"..")){
 const dir=path.join(root,"node_modules","@swissmarley","gflow-cli","dist","src","flow");
 let changed=0;
 for(const basename of modules){
   const file=path.join(dir,basename);
   if(!fs.existsSync(file))throw new Error("Missing GFlow CLI module: "+file);
   const before=fs.readFileSync(file,"utf8");
   let after=before.split(oldUrl).join(newUrl);
   if(basename==="ui.js") after=replaceNavigation(after);
   if(!after.includes(newUrl))throw new Error("Expected Flow URL not found in "+basename);
   if(after!==before){fs.writeFileSync(file,after,"utf8");changed++;}
 }
 return {changed,modules:modules.length,origin:newUrl};
}
if(require.main===module){
 try{const info=patchGFlow();console.log("GFlow project compatibility: "+info.origin+" ("+info.changed+" modules updated)");}
 catch(error){console.error("GFlow compatibility patch failed: "+error.message);process.exitCode=1;}
}
module.exports={patchGFlow,replaceNavigation,navigatorSource,existingSource,oldUrl,newUrl};
