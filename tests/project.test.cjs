const test=require("node:test");
const assert=require("node:assert/strict");
const {projectUrl,parseTabs,listTabs,explain,is404}=require("../electron/lib/project.cjs");
const p="https://flow.google.com/project/f17f53d3-049d-4379-9984-05c0ec7d22c2";
test("strictly parse real Flow project and reject other origins or placeholders",()=>{
 assert.equal(projectUrl(p),p);
 assert.equal(projectUrl(p+"/characters"),p);
 assert.equal(projectUrl("https://example.com/project/f17f53d3-049d-4379-9984-05c0ec7d22c2"),null);
 assert.equal(projectUrl("https://flow.google.com/404?reason=project"),null);
 assert.equal(projectUrl("https://flow.google.com/project/<id>"),null);
});
test("detect 404 project account issue without treating it as a valid project",()=>{
 assert.equal(is404("https://flow.google.com/404?reason=project"),true);
 const tabs=parseTabs([{type:"page",url:"https://flow.google.com/404?reason=project"}]);
 assert.equal(tabs.has404,true);
 assert.deepEqual(tabs.projects,[]);
 assert.match(explain(tabs),/404/);
});
test("only collect Chrome tabs with true project URLs and deduplicate",()=>{
 const x=parseTabs([{type:"page",url:p},{type:"page",url:p+"/characters"},{type:"other",url:p},{type:"page",url:"chrome://settings"}]);
 assert.deepEqual(x.projects,[p]);
 assert.equal(x.tabCount,3);
});
test("CDP source is replaceable for isolated testing",async()=>{
 const result=await listTabs(9222,{fetchTabs:async port=>{
 assert.equal(port,9222);return [{type:"page",url:p}];
 }});
 assert.deepEqual(result.projects,[p]);
});
test("empty Flow home prompts the operator to open a project",()=>{
 assert.match(explain(parseTabs([{type:"page",url:"https://flow.google.com/"}])),/chưa mở project/);
});
