const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const chrome=require("../electron/lib/chrome.cjs");
test("Windows Chrome found in 32-bit install if default path missing",()=>{
 const good=path.win32.join("C:\\Program Files (x86)","Google","Chrome","Application","chrome.exe");
 const got=chrome.resolveChromeExecutable({platform:"win32",env:{ProgramFiles:"C:\\Program Files","ProgramFiles(x86)":"C:\\Program Files (x86)",LOCALAPPDATA:"C:\\Users\\test\\AppData\\Local"},exists:p=>p===good});
 assert.equal(got,good);
});
test("valid explicit Chrome path is respected",()=>{
 const value="C:\\ChromePortable\\chrome.exe";
 assert.equal(chrome.resolveChromeExecutable({platform:"win32",chromePath:value,exists:p=>p===value}),path.win32.resolve(value));
});
test("missing explicit Chrome fails with actionable information",()=>{
 assert.throws(()=>chrome.resolveChromeExecutable({platform:"win32",chromePath:"C:\\missing\\chrome.exe",exists:()=>false}),/Đường dẫn Chrome/);
});
test("Windows gflow profile dir isolated and validated",()=>{
 assert.equal(chrome.profileDir("C:\\DuAn","default"),path.join("C:\\DuAn",".gflow","profiles","default"));
 assert.throws(()=>chrome.profileDir("C:\\DuAn","../my-profile"),/Chrome profile/);
});
test("manual close tip only for undebuggable gflow process",()=>{
 const state={plainLoginChromeRunning:true,windowsProcessIds:[123],profileDir:"C:\\temp\\.gflow\\profiles\\default"};
 assert.match(chrome.guidance(state),/đóng TẤT CẢ cửa sổ Chrome/);
 assert.equal(chrome.guidance({...state,plainLoginChromeRunning:false}),null);
});
test("Windows process matcher only returns scoped Chrome profile pids",async()=>{
 const fakeExec=async(_exe,_args,options)=>{
 assert.equal(options.env.GFLOW_TARGET_PROFILE,"C:\\Test\\gflow");
 return {stdout:"4201\r\n4202\r\n"};
 };
 assert.deepEqual(await chrome.windowsProfileProcesses("C:\\Test\\gflow",{platform:"win32",exec:fakeExec}),[4201,4202]);
});
