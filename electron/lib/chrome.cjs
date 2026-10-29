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
async function portReachable(port) {
  if (!port) return false;
  return await new Promise(resolve => {
    let done = false;
    const finish = value => { if (!done) { done=true; resolve(value); } };
    const req = http.get({hostname:"127.0.0.1",port,path:"/json/version",timeout:1200},res=>{
      res.resume();finish(res.statusCode === 200);
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
  const debuggingReady = await portReachable(port);
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
    return "Chrome đăng nhập của DuAnTaoVideo vẫn đang mở (PID " +
      state.windowsProcessIds.join(", ") +
      "). Do gflow-cli chưa xử lý chuyển phiên Chrome trên Windows, hãy đóng TẤT CẢ cửa sổ Chrome thuộc profile gflow vừa mở (không đóng Chrome cá nhân), sau đó bấm GFlow Doctor lại. Không xóa profile hoặc cookie. Profile: " + state.profileDir;
  }
  return null;
}
module.exports={resolveChromeExecutable,profileDir,readPort,portReachable,windowsProfileProcesses,inspect,guidance};
