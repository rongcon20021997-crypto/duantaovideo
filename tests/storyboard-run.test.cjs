const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const backend=fs.readFileSync(path.join(__dirname,"..","electron","main.cjs"),"utf8");
const renderer=fs.readFileSync(path.join(__dirname,"..","src","App.tsx"),"utf8");
test("full storyboard opts into Flow Character only when user explicitly checks it",()=>{
 const run=backend.slice(backend.indexOf("async function run(input)"),backend.indexOf("async function story"));
 assert.match(run,/const useSavedCharacter=input\?\.useSavedCharacter===true/);
 assert.match(run,/if\(ws.engine==="gflow" && useSavedCharacter && ws.character.name\)/);
 assert.match(run,/if\(useSavedCharacter&&ws.character.name\)args.push/);
 assert.match(renderer,/flow:run",\{\.\.\.saved,useSavedCharacter\}/);
});
test("storyboard reuses an already generated image as video start frame",()=>{
 const run=backend.slice(backend.indexOf("async function run(input)"),backend.indexOf("async function story"));
 assert.match(run,/ws.prepareImages&&scene.imagePrompt&&!\(scene.image&&fs.existsSync\(scene.image\)\)/);
 assert.match(run,/--start-frame",scene.image/);
 assert.match(run,/GFlow video cảnh/);
});
