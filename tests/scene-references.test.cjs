const test=require("node:test");
const assert=require("node:assert/strict");
const {resolveSceneReferences}=require("../electron/lib/scene-references.cjs");
const sep=require("node:path");
test("storyboard image prefers generated character image instead of original photos when legacy unconfigured",()=>{
 const ws={character:{thumbnail:"/out/character-done.png",referenceImages:["/refs/portrait1.jpg","/refs/portrait2.jpg"]}};
 const x=resolveSceneReferences(ws,{exists:p=>p==="/out/character-done.png"});
 assert.deepEqual(x.files,[sep.resolve("/out/character-done.png")]);
 assert.equal(x.source,"generated-character");
});
test("storyboard image prefers original attached references when referenceSource is original even if thumbnail exists",()=>{
 const ws={referenceSource:"original",character:{thumbnail:"/out/character-done.png",referenceImages:["/refs/portrait1.jpg","/refs/portrait2.jpg"]}};
 const x=resolveSceneReferences(ws,{exists:p=>p===sep.resolve("/refs/portrait1.jpg")||p===sep.resolve("/refs/portrait2.jpg")});
 assert.deepEqual(x.files,[sep.resolve("/refs/portrait1.jpg"),sep.resolve("/refs/portrait2.jpg")]);
 assert.equal(x.source,"original-references");
});
test("storyboard image prefers generated character when referenceSource is generated",()=>{
 const ws={referenceSource:"generated",character:{thumbnail:"/out/character-done.png",referenceImages:["/refs/portrait1.jpg"]}};
 const x=resolveSceneReferences(ws,{exists:p=>p==="/out/character-done.png"});
 assert.deepEqual(x.files,[sep.resolve("/out/character-done.png")]);
 assert.equal(x.source,"generated-character");
});
test("storyboard images use up to two original photos if no generated portrait exists",()=>{
 const ws={character:{referenceImages:["/refs/a.jpg","/refs/b.jpg","/refs/c.jpg"]}};
 const x=resolveSceneReferences(ws,{exists:()=>true});
 assert.deepEqual(x.files,["/refs/a.jpg","/refs/b.jpg"].map(p=>sep.resolve(p)));
 assert.equal(x.source,"original-references");
});
test("missing generated image falls back to chosen original",()=>{
 const ws={character:{thumbnail:"/out/missing.png",referenceImages:["/refs/a.jpg"]}};
 const x=resolveSceneReferences(ws,{exists:p=>p===sep.resolve("/refs/a.jpg")});
 assert.equal(x.source,"original-references");
});
test("with refs enabled, missing files must never silently generate without a reference",()=>{
 assert.throws(()=>resolveSceneReferences({character:{}},{exists:()=>false}),/Chưa có ảnh mẫu/);
 assert.throws(()=>resolveSceneReferences({character:{referenceImages:["/refs/missing.jpg"]}},{exists:()=>false}),/không còn trên máy/);
});
test("users can explicitly disable storyboard image references",()=>{
 const x=resolveSceneReferences({useSceneReferences:false,character:{}},{exists:()=>false});
 assert.deepEqual(x,{files:[],source:"disabled"});
});
