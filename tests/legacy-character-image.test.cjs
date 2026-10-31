const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
// Prevent reintroducing the legacy CharacterPage flow that navigates to /characters.
// Both the legacy and current IPC names must share the one reference-image handler.
const content=fs.readFileSync(path.join(__dirname,"..","electron","main.cjs"),"utf8");
test("current character-image IPC is wired to the direct browser workflow",()=>{
 assert.match(content,/async function createCharacterImageDirect\(x\)/);
 assert.match(content,/ipcMain\.handle\("flow:character:image",\(_,x\)=>createCharacterImageDirect\(x\)\)/);
 assert.match(content,/runCharacterImage\(/);
});
test("legacy button is backward-compatible and no longer invokes old gflow CLI CharacterPage",()=>{
 const legacy=content.match(/ipcMain\.handle\("flow:character:create"[\s\S]*?(?=ipcMain\.handle\("flow:character:list")/);
 assert.ok(legacy,"expected legacy handler");
 assert.match(legacy[0],/createCharacterImageDirect\(x\)/);
 assert.doesNotMatch(legacy[0],/\["character","create"/);
});
