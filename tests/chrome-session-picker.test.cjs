const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const chrome=require("../electron/lib/chrome.cjs");

test("Chrome chooser displays GFlow sessions separately from personal Chrome",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"dtv-picker-"));
 try{
  const work=chrome.profileDir(root,"work");
  fs.mkdirSync(work,{recursive:true});
  fs.writeFileSync(path.join(work,"DevToolsActivePort"),"40123\n/devtools/browser/abc-123\n");
  const original=chrome.profileDir(root,"default");
  const result=await chrome.listChromeSessions({
    platform:"win32",userDataDir:root,profile:"default",
    chromeProcesses:[
      {ProcessId:410,CommandLine:'"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="'+work+'"'},
      {ProcessId:420,CommandLine:'"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="'+original+'"'},
      {ProcessId:430,CommandLine:'"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --profile-directory=Default'}
    ],
    checkPort:async(p,endpoint)=>p===40123&&endpoint==="/devtools/browser/abc-123"
  });
  assert.equal(result.sessions.find(s=>s.profile==="work").status,"ready");
  assert.equal(result.sessions.find(s=>s.profile==="default").status,"no-cdp");
  assert.equal(result.externalChromeProcessCount,1);
  assert.equal(result.sessions.some(s=>s.profile==="Default"),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("CDP launcher reuses ready profile instead of spawning another Chrome",async()=>{
 let spawned=false;
 const state={debuggingReady:true,profileDir:"C:\\gflow\\default",debugPort:41777};
 const result=await chrome.ensureDebugging({probe:async()=>state,spawnChrome:()=>{spawned=true;}});
 assert.equal(result.launched,false);
 assert.equal(spawned,false);
});

test("CDP launcher opens browser with remote debugging enabled from the start",async()=>{
 let calls=0,launchArgs=null;
 const base={debuggingReady:false,profileDir:"C:\\gflow\\default",executable:"C:\\Chrome\\chrome.exe",processInspectionAvailable:true,plainLoginChromeRunning:false};
 const result=await chrome.ensureDebugging({
  platform:"win32",probe:async()=>++calls>1?{...base,debuggingReady:true,debugPort:42424}:base,
  spawnChrome:(_exe,args)=>{launchArgs=args;return {once(){},unref(){}};},
  mkdir:async()=>{},pause:async()=>{}
 });
 assert.equal(result.launched,true);
 assert.ok(launchArgs.includes("--remote-debugging-port=0"));
 assert.ok(launchArgs.includes("--user-data-dir=C:\\gflow\\default"));
});

test("CDP launcher refuses existing non-debuggable GFlow Chrome without terminating processes",async()=>{
 let spawned=false;
 const base={debuggingReady:false,plainLoginChromeRunning:true,profileDir:"C:\\gflow\\default",windowsProcessIds:[9516]};
 await assert.rejects(()=>chrome.ensureDebugging({
   probe:async()=>base,spawnChrome:()=>{spawned=true;}
 }),/CHƯA bật cổng điều khiển/);
 assert.equal(spawned,false);
});
