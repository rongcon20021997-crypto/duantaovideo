const test=require("node:test");
const assert=require("node:assert/strict");
const {diagnosticsFromUi}=require("../electron/lib/flow-diagnostics.cjs");
test("Google Flow Generate Image button and visible prompt pass preflight",()=>{
 const result=diagnosticsFromUi({url:"https://flow.google.com/project/1",promptInputs:[{type:"textarea"}],buttons:["Nano Banana Pro","Generate Image"]});
 assert.equal(result.ready,true);assert.deepEqual(result.submitLabels,["Generate Image"]);
});
test("old Create label remains recognized",()=>{
 assert.equal(diagnosticsFromUi({promptInputs:[{}],buttons:["Create"]}).ready,true);
});
test("do not treat New Project/Create Character as image submit",()=>{
 const result=diagnosticsFromUi({promptInputs:[{}],buttons:["New Project","Create Character"]});
 assert.equal(result.ready,false);assert.match(result.reason,/Generate Image/);
});
test("fail clearly when the editor prompt is missing",()=>{
 const result=diagnosticsFromUi({promptInputs:[],buttons:["Generate Image"]});
 assert.equal(result.ready,false);assert.match(result.reason,/prompt/);
});

test("old Flow arrow_forward Create submit remains supported",()=>{
 assert.equal(diagnosticsFromUi({promptInputs:[{}],buttons:["arrow_forward Create"]}).ready,true);
});
