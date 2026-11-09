const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const chrome = require("../electron/lib/chrome.cjs");
const patch = require("../scripts/patch-gflow.cjs");

test("rejects non-Chrome executable when explicitly selected on Windows", () => {
  assert.throws(() => chrome.resolveChromeExecutable({
    platform:"win32", chromePath:"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    exists:()=>true
  }), /chrome\.exe/);
});
test("rejects missing or malformed CDP identity and accepts profile endpoint", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"dtv-chrome-"));
  try {
    assert.equal(chrome.readDebuggerEndpoint(dir),null);
    fs.writeFileSync(path.join(dir,"DevToolsActivePort"),"9222\n/devtools/browser/abcd1234-1234\n");
    assert.equal(chrome.readDebuggerEndpoint(dir),"/devtools/browser/abcd1234-1234");
    fs.writeFileSync(path.join(dir,"DevToolsActivePort"),"9222\n/devtools/page/other\n");
    assert.equal(chrome.readDebuggerEndpoint(dir),null);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test("upstream frame patch must not silently skip upload errors",()=>{
  const upstream=[
    "async uploadFrame(slot, filePath) { throw Error('old'); }",
    "async referenceCharacter(name) {}"
  ].join("\n");
  const patched=patch.patchFlowFramesAndResults(upstream);
  assert.match(patched,/không tìm thấy khung hình/);
  assert.match(patched,/chưa upload xong/);
  assert.match(patched,/confirm\.click\(\{timeout:12000\}\)/);
  assert.doesNotMatch(patched,/if \(\(await slotEl\.count\(\)\) === 0\)\s*return/);
  assert.doesNotMatch(patched,/if \(!\(await uploadButton\.count\(\)\)\) return/);
});
test("scene images/videos use unique job IDs and validate file signatures",()=>{
  const main=fs.readFileSync(path.join(__dirname,"..","electron","main.cjs"),"utf8");
  assert.match(main,/frame-"\+\(i\+1\)\+"-"\+scene\.id\+"-"\+Date\.now\(\)/);
  assert.match(main,/clip-"\+\(i\+1\)\+"-"\+scene\.id\+"-"\+Date\.now\(\)/);
  assert.match(main,/Tệp đầu ra không đúng định dạng/);
});
