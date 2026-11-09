// Windows Chrome launch preflight only. Browser automation itself stays in upstream gflow-cli.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);

function normalizeCandidate(s) {
  const value = String(s || "").trim();
  return value.replace(/^"(.*)"$/, "$1");
}
function resolveChromeExecutable(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const exists = options.exists || fs.existsSync;
  const explicit = normalizeCandidate(options.chromePath || env.GFLOW_CHROME_PATH);
  if (explicit) {
    if (platform === "win32" && path.win32.basename(explicit).toLowerCase() !== "chrome.exe") {
      throw new Error("Hãy chọn Google Chrome (chrome.exe), không phải Edge, Chromium hoặc trình duyệt khác.");
    }
    if (!exists(explicit)) {
      throw new Error("Không tìm thấy chrome.exe tại: " + explicit + ". Chọn đúng Chrome executable trong Cài đặt → Đường dẫn Chrome.");
    }
    return platform === "win32" ? path.win32.resolve(explicit) : path.resolve(explicit);
  }
  if (platform !== "win32") return undefined;
  const roots = [
    env.ProgramFiles || "C:\\Program Files",
    env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    env.LOCALAPPDATA || path.win32.join(env.USERPROFILE || "C:\\Users\\Public", "AppData", "Local")
  ];
  const candidates = roots.map(root => path.win32.join(root, "Google", "Chrome", "Application", "chrome.exe"));
  const first = candidates.find(exists);
  if (first) return first;
  throw new Error(
    "Không tìm thấy Google Chrome. Đã thử: " + candidates.join(" | ") +
    ". Chọn file chrome.exe trong Cài đặt → Đường dẫn Chrome. Không cần cài lại nếu Chrome nằm ở thư mục khác."
  );
}
function profileDir(userDataDir, profile) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(profile))) {
    throw new Error("Chrome profile chỉ được chứa chữ, số, - hoặc _.");
  }
  return path.join(userDataDir, ".gflow", "profiles", profile);
}
function readPort(dir) {
  try {
    const first = fs.readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0].trim();
    const num = Number(first);
    return Number.isInteger(num) && num > 0 && num < 65536 ? num : null;
  } catch { return null; }
}
function readDebuggerEndpoint(dir) {
  try {
    const lines = fs.readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split(/\r?\n/);
    const endpoint = (lines[1] || "").trim();
    return /^\/devtools\/browser\/[a-z0-9-]+$/i.test(endpoint) ? endpoint : null;
  } catch { return null; }
}
async function portReachable(port, expectedEndpoint) {
  if (!port) return false;
  return await new Promise(resolve => {
    let done = false;
    const finish = value => { if (!done) { done=true; resolve(value); } };
    const req = http.get({hostname:"127.0.0.1",port,path:"/json/version",timeout:1200},res=>{
      if(res.statusCode !== 200){res.resume();return finish(false);}
      let body="";
      res.on("data",chunk=>{body+=String(chunk);if(body.length>16384)req.destroy();});
      res.on("end",()=>{
        try {
          const data=JSON.parse(body);
          if(!/^Chrome\//.test(String(data.Browser||"")))return finish(false);
          if(expectedEndpoint){
            const actual=new URL(String(data.webSocketDebuggerUrl||"")).pathname;
            return finish(actual===expectedEndpoint);
          }
          finish(true);
        } catch { finish(false); }
      });
      res.on("error",()=>finish(false));
    });
    req.on("error",()=>finish(false));
    req.on("timeout",()=>{req.destroy();finish(false);});
  });
}
async function windowsProfileProcesses(dir, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== "win32") return null;
  // Only detect processes belonging to THIS gflow profile. Never kill browsers, modify cookies,
  // or terminate any other Chrome session from this application.
  const script = [
    "$target = ('--user-data-dir=' + $env:GFLOW_TARGET_PROFILE).ToLower();",
    "$items = Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -ErrorAction Stop;",
    "$items | Where-Object { $_.CommandLine -and (($_.CommandLine -replace '\"','').ToLower().Contains($target)) } | Select-Object -ExpandProperty ProcessId"
  ].join(" ");
  try {
    const result = await (options.exec || exec)("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{
      windowsHide:true,timeout:9000,maxBuffer:1024*1024,
      env:{...process.env,GFLOW_TARGET_PROFILE:dir}
    });
    return result.stdout.split(/\r?\n/).map(x=>Number.parseInt(x.trim(),10)).filter(Number.isInteger);
  } catch { return null; }
}
async function inspect(options = {}) {
  const platform = options.platform || process.platform;
  const executable = resolveChromeExecutable({chromePath:options.chromePath,platform,env:options.env,exists:options.exists});
  const dir = profileDir(options.userDataDir, options.profile || "default");
  const port = readPort(dir);
  // A stale DevToolsActivePort may point to ANOTHER Chrome/profile.
  // Compare the browser websocket identity saved by THIS GFlow profile.
  const endpoint = readDebuggerEndpoint(dir);
  const debuggingReady = Boolean(endpoint) && await portReachable(port, endpoint);
  const processes = !debuggingReady ? await windowsProfileProcesses(dir,{platform,exec:options.exec}) : [];
  return {
    executable: executable || null,
    profileDir: dir,
    debugPort: port,
    debuggingReady,
    windowsProcessIds: processes,
    processInspectionAvailable: processes !== null,
    plainLoginChromeRunning: Array.isArray(processes) && processes.length > 0 && !debuggingReady
  };
}
function guidance(state) {
  if (state.plainLoginChromeRunning) {
    return "Chrome GFlow đang mở nhưng CHƯA bật cổng điều khiển (CDP). " +
      "Vì vậy ứng dụng không thể bấm nút hoặc upload ảnh trong cửa sổ này. " +
      "Hãy lưu công việc, ĐÓNG các cửa sổ Chrome thuộc profile GFlow (KHÔNG đóng Chrome cá nhân), " +
      "rồi bấm GFlow Doctor để mở lại phiên Chrome có CDP. " +
      "Sau đó mở sẵn project trong cửa sổ Chrome GFlow vừa được Doctor khởi chạy và bấm Tạo hình nhân vật bằng ảnh mẫu. " +
      "KHÔNG bấm Đăng nhập Chrome lần nữa nếu đã đăng nhập. Không xóa profile hoặc cookie. " +
      "Các PID thuộc profile này: " + state.windowsProcessIds.join(", ") +
      ". Profile: " + state.profileDir;
  }
  return null;
}
// Start debugging BEFORE authentication, never by launching a second regular Chrome
// on top of the same profile. A running Chrome without CDP must be closed by the user.
async function ensureDebugging(options = {}) {
  const probe = options.probe || inspect;
  const spawnChrome = options.spawnChrome || require("node:child_process").spawn;
  const pause = options.pause || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const initial = await probe(options);
  if (initial.debuggingReady) return {...initial, launched:false};
  const tip = guidance(initial);
  if (tip) throw new Error(tip);
  const platform = options.platform || process.platform;
  if (platform === "win32" && !initial.processInspectionAvailable) {
    throw new Error("Không kiểm tra được tiến trình Chrome GFlow qua Windows PowerShell. Hãy đóng phiên Chrome GFlow trước khi mở lại; không tắt Chrome cá nhân.");
  }
  if (!initial.executable || !initial.profileDir) throw new Error("Không xác định được Google Chrome hoặc GFlow profile.");
  await (options.mkdir || fs.promises.mkdir)(initial.profileDir,{recursive:true});
  const args = [
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    "--user-data-dir=" + initial.profileDir,
    "--no-first-run",
    "--no-default-browser-check",
    "https://flow.google.com/"
  ];
  const child = spawnChrome(initial.executable,args,{stdio:"ignore",windowsHide:false,detached:true});
  let spawnError=null;
  child.once?.("error",error=>{spawnError=error;});
  child.unref?.();
  for (let attempt=0;attempt<35;attempt++) {
    await pause(500);
    if(spawnError)throw new Error("Không mở được Chrome GFlow: "+spawnError.message);
    const state = await probe(options);
    if (state.debuggingReady && state.profileDir === initial.profileDir) return {...state,launched:true};
  }
  throw new Error("Đã yêu cầu mở Google Chrome với CDP nhưng chưa xác nhận được cổng điều khiển cho profile GFlow. Kiểm tra Chrome có mở không, đóng riêng phiên GFlow nếu cần rồi thử lại. Không xóa profile hoặc cookie.");
}
async function listWindowsChromeProcesses(options={}) {
  if ((options.platform || process.platform)!=="win32") return [];
  if (options.chromeProcesses) return options.chromeProcesses;
  const script = '$items = @(Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\'" -ErrorAction Stop | Select-Object ProcessId,CommandLine); ConvertTo-Json -InputObject $items -Compress -Depth 2';
  try {
    const r=await (options.exec || exec)("powershell.exe",
      ["-NoProfile","-NonInteractive","-Command",script],
      {windowsHide:true,timeout:9000,maxBuffer:2*1024*1024});
    const parsed=JSON.parse(String(r.stdout||"[]").trim()||"[]");
    return (Array.isArray(parsed)?parsed:[parsed]).filter(x=>x&&Number.isInteger(Number(x.ProcessId)));
  } catch { return null; }
}
function commandProfile(commandLine) {
  const match=String(commandLine||"").match(/--user-data-dir=(?:"([^"]+)"|([^\s"]+))/i);
  return match ? path.win32.normalize((match[1]||match[2]).trim()).toLowerCase().replace(/[\\\/]+$/,"") : null;
}
async function listChromeSessions(options={}) {
  const current=String(options.profile||"default");
  // Only GFlow-owned profiles can be selected: upstream gflow-cli uses this directory.
  const base=path.join(options.userDataDir,".gflow","profiles");
  const names=new Set([current]);
  try { for(const item of fs.readdirSync(base,{withFileTypes:true}))
    if(item.isDirectory()&&/^[A-Za-z0-9_-]{1,40}$/.test(item.name)) names.add(item.name);
  } catch {}
  const processes=await listWindowsChromeProcesses(options);
  const matchedPids=new Set();
  const sessions=[];
  for(const name of names){
    const dir=profileDir(options.userDataDir,name);
    const normalized=path.win32.normalize(dir).toLowerCase().replace(/[\\\/]+$/,"");
    const pids=Array.isArray(processes)?processes
      .filter(p=>commandProfile(p.CommandLine)===normalized)
      .map(p=>Number(p.ProcessId)):[];
    pids.forEach(pid=>matchedPids.add(pid));
    const port=readPort(dir),endpoint=readDebuggerEndpoint(dir);
    const ready=Boolean(port&&endpoint)&&await (options.checkPort || portReachable)(port,endpoint);
    // The selected profile may be closed: keep it visible so the user can start it.
    if(pids.length||ready||name===current) sessions.push({
      profile:name,label:"Chrome GFlow — "+name,
      status:ready?"ready":pids.length?"no-cdp":"closed",
      debuggingReady:ready,debugPort:ready?port:null,processCount:pids.length,
      selectable:true
    });
  }
  sessions.sort((a,b)=>Number(b.debuggingReady)-Number(a.debuggingReady)||a.profile.localeCompare(b.profile));
  return {
    sessions,selectedProfile:current,
    externalChromeProcessCount:Array.isArray(processes)?processes.filter(p=>!matchedPids.has(Number(p.ProcessId))).length:null,
    processInspectionAvailable:Array.isArray(processes)
  };
}

module.exports={resolveChromeExecutable,profileDir,readPort,readDebuggerEndpoint,portReachable,windowsProfileProcesses,inspect,guidance,ensureDebugging,listWindowsChromeProcesses,commandProfile,listChromeSessions};
