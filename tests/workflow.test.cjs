const test = require("node:test"); const assert = require("node:assert/strict");
const {normalizeWorkspace,normalizeScene,templateScenes,safeJobId} = require("../electron/lib/workflow.cjs");
test("input normalization protects settings",()=>{const x=normalizeWorkspace({engine:"wrong",profile:"../bad",ratio:"foo",scenes:[{duration:999}]}, "/tmp/v");assert.equal(x.engine,"gflow");assert.equal(x.profile,"default");assert.equal(x.scenes[0].duration,10);});
test("example contains requested number of scenes",()=>{const x=templateScenes("Bò lúc lắc",6);assert.equal(x.length,6);assert.ok(x.every(s=>s.prompt.includes("Bò lúc lắc")));});
test("safe output filename",()=>assert.equal(safeJobId("a/b:c?"),"a-b-c-"));

test("storyboard reference defaults on, and can be switched off deliberately",()=>{
 const {normalizeWorkspace}=require("../electron/lib/workflow.cjs");
 const a=normalizeWorkspace({},"/tmp/test");
 assert.equal(a.useSceneReferences,true);
 const b=normalizeWorkspace({useSceneReferences:false},"/tmp/test");
 assert.equal(b.useSceneReferences,false);
});
