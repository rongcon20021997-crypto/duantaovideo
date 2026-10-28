
const {app,BrowserWindow,ipcMain,dialog,shell,safeStorage}=require("electron");
const fs=require("node:fs"),fsp=fs.promises,path=require("node:path"),{spawn}=require("node:child_process");
const w=require("./lib/workflow.cjs");
const chrome=require("./lib/chrome.cjs");
let win=null,active=null;
const root=()=>app.getPath("userData"),output=()=>path.join(app.getPath("videos"),"DuAnTaoVideo");
const read=(name,def={})=>{try{return JSON.parse(fs.readFileSync(path.join(root(),name),"utf8"));}catch{return def;}};
async function write(name,v){await fsp.mkdir(root(),{recursive:true});const p=path.join(root(),name);await fsp.writeFile(p+".tmp",JSON.stringify(v,null,2),{mode:0o600});await fsp.rename(p+".tmp",p);}
const workspace=()=>w.normalizeWorkspace(read("workspace.json"),output());
const save=async(x)=>{const a=w.normalizeWorkspace(x,output());await write("workspace.json",a);return a;};
const emit=(e)=>{if(win&&!win.isDestroyed())win.webContents.send("studio:event",e);};
const log=(message)=>emit({kind:"log",message:String(message).slice(-1800)});
const rawSettings=()=>read("settings.json");
function settings(){const s=rawSettings();const provider=s.provider==="gemini"?"gemini":"openai";return {provider,model:s.model||(provider==="gemini"?"gemini-2.5-flash":"gpt-4o-mini"),hasKey:!!(s.encrypted||(provider==="gemini"?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY)),keyStored:!!s.encrypted};}
function secret(){const s=rawSettings();if(s.encrypted&&safeStorage.isEncryptionAvailable()){try{return safeStorage.decryptString(Buffer.from(s.encrypted,"base64"));}catch{}}return (s.provider==="gemini"?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY)||"";}
async function saveSettings(data){const old=rawSettings(),provider=data?.provider==="gemini"?"gemini":"openai";const s={provider,model:String(data?.model||(provider==="gemini"?"gemini-2.5-flash":"gpt-4o-mini")).slice(0,80)};
if(!data?.clearKey&&old.provider===provider)s.encrypted=old.encrypted;
if(data?.apiKey){if(!safeStorage.isEncryptionAvailable())throw Error("Không thể mã hóa API key trên máy. Hãy dùng biến môi trường OPENAI_API_KEY/GEMINI_API_KEY.");s.encrypted=safeStorage.encryptString(String(data.apiKey)).toString("base64");}
await write("settings.json",s);return settings();}
function cliPath(){const p=path.join(app.getAppPath(),"node_modules","@swissmarley","gflow-cli","dist","src","index.js");if(!fs.existsSync(p))throw Error("Thiếu @swissmarley/gflow-cli. Hãy chạy npm install.");return p;}
function idle(){if(active)throw Error("Đang có hàng đợi chạy. Vui lòng dừng hoặc đợi xong trước khi điều khiển Google Flow.");}
function cmd(args,timeout=1800000,requestedChromePath){
const executable=chrome.resolveChromeExecutable({chromePath:requestedChromePath||workspace().chromePath});
return new Promise((resolve,reject)=>{if(active?.cancelled)return reject(Error("Đã dừng hàng đợi."));
const child=spawn(process.execPath,[cliPath(),...args],{cwd:root(),windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:"1",...(executable?{GFLOW_CHROME_PATH:executable}:{})},stdio:["ignore","pipe","pipe"]});
if(active)active.child=child;let out="",err="";const trim=s=>s.slice(-18000);
child.stdout.on("data",d=>{const t=String(d);out=trim(out+t);for(const line of t.split(/\r?\n/).filter(Boolean).slice(-3))log(line);});
child.stderr.on("data",d=>{const t=String(d);err=trim(err+t);for(const line of t.split(/\r?\n/).filter(Boolean).slice(-3))log(line);});
const timer=setTimeout(()=>child.kill(),timeout);let settled=false;
child.on("error",e=>{if(!settled){settled=true;clearTimeout(timer);reject(e);}});
child.on("close",code=>{clearTimeout(timer);if(active?.child===child)active.child=null;if(settled)return;settled=true;if(active?.cancelled)return reject(Error("Đã dừng theo yêu cầu."));if(code!==0){let detail=(err||out||"CLI không chạy thành công").slice(-2200);if(detail.includes("Could not start Google Chrome with a debugging port"))detail+="\nTrên Windows: đóng hẳn Chrome do GFlow mở để đăng nhập (KHÔNG phải Chrome cá nhân), kiểm tra đường dẫn chrome.exe trong Cài đặt rồi thử GFlow Doctor. Không xóa profile/cookie.";return reject(Error(detail));}resolve(out);});
});}
function flags(ws){return [...(ws.profile?["--profile",ws.profile]:[]),...(ws.project?["--project",ws.project]:[])];}
function artifact(dir,id,extensions){const x=w.latestArtifact(dir,id,extensions);if(!x)throw Error("Lệnh hoàn tất nhưng chưa tìm được file "+id+" trong "+dir);return path.join(dir,x);}
function sdk(autoLaunch=false){const raw=require("google-flow-cli"),FlowClient=raw.FlowClient||raw.default||raw;return new FlowClient({port:9222,autoLaunch});}
async function sdkDoctor(){const c=sdk(false);try{return await c.doctor();}finally{await c.disconnect().catch(()=>{});}}
async function sdkProjects(){const c=sdk(true);try{return await c.listProjects();}finally{await c.disconnect().catch(()=>{});}}
async function sdkVideo(ws,scene,i,dir){const c=sdk(true);try{const p=path.join(dir,w.safeJobId("sdk-"+i+"-"+scene.id)+".mp4");const r=await c.runScene({mediaType:"video",model:ws.videoModel==="Omni Flash"?"Veo 3.1 - Fast":ws.videoModel,duration:String(scene.duration)+"s",aspect:ws.ratio,prompt:scene.prompt,generate:true,wait:true,timeout:1200,output:p});if(r.status!=="completed")throw Error("SDK chưa xác nhận video hoàn tất.");return r.download?.path||p;}finally{await c.disconnect().catch(()=>{});}}
async function run(input){idle();const ws=w.normalizeWorkspace(input,output());if(!ws.scenes.length)throw Error("Chưa có phân cảnh.");
const state={cancelled:false,child:null};active=state;const dir=path.resolve(ws.outputDir);await fsp.mkdir(dir,{recursive:true});emit({kind:"run",running:true});
try{if(ws.engine==="gflow" && ws.character.name){log("Kiểm tra nhân vật đã được lưu trong Flow...");const names=await cmd(["character","list",...flags(ws)],120000);if(!names.toLowerCase().includes(ws.character.name.toLowerCase()))throw Error("Không tìm thấy nhân vật "+ws.character.name+" trên Google Flow. Vào tab Nhân vật tạo hoặc chọn tên nhân vật đang tồn tại trước khi chạy.");}for(let i=0;i<ws.scenes.length;i++){const scene=ws.scenes[i];if(state.cancelled)break;if(scene.status==="completed"&&scene.video&&fs.existsSync(scene.video)){log("Bỏ qua cảnh đã hoàn thành: "+scene.title);continue;}
scene.status="generating";scene.error=undefined;emit({kind:"scene",sceneId:scene.id,status:"generating"});log("Cảnh "+(i+1)+"/"+ws.scenes.length+": "+scene.title);
try{if(ws.engine==="sdk"){scene.video=await sdkVideo(ws,scene,i+1,dir);}
else{
if(ws.prepareImages&&scene.imagePrompt){const id=w.safeJobId("frame-"+(i+1)+"-"+scene.id);const args=["image","--id",id,"--prompt",scene.imagePrompt,"--model",ws.imageModel,"--ratio",ws.ratio,"--outputs","1","--out",dir,...flags(ws)];if(ws.character.name)args.push("--character",ws.character.name);await cmd(args);scene.image=artifact(dir,id,[".png",".jpg",".jpeg",".webp"]);emit({kind:"scene",sceneId:scene.id,status:"generating",image:scene.image});}
if(state.cancelled)throw Error("Hàng đợi đã được hủy.");
const id=w.safeJobId("clip-"+(i+1)+"-"+scene.id);const args=["video","--id",id,"--prompt",scene.prompt,"--model",ws.videoModel,"--duration",String(scene.duration),"--ratio",ws.ratio,"--outputs","1","--out",dir,...flags(ws)];
if(scene.image&&fs.existsSync(scene.image))args.push("--start-frame",scene.image);if(ws.character.name)args.push("--character",ws.character.name);await cmd(args);scene.video=artifact(dir,id,[".mp4",".webm"]); }
scene.status="completed";emit({kind:"scene",sceneId:scene.id,status:"completed",image:scene.image,video:scene.video});log("Đã tải: "+scene.video);
}catch(e){scene.status="failed";scene.error=String(e.message||e);log("Lỗi: "+scene.error);emit({kind:"scene",sceneId:scene.id,status:"failed",error:scene.error});break;}
finally{await save(ws);}
}return ws;
}finally{active=null;emit({kind:"run",running:false});}}
async function story(input){const s=settings(),key=secret();if(!key)throw Error("Cần AI API key ở Cài đặt để tạo kịch bản bằng AI; có thể dùng Mẫu 6 cảnh để thử.");
const count=Math.max(1,Math.min(20,Math.round(Number(input?.count)||6)));const topic=String(input?.topic||"Dạy nấu ăn").slice(0,400);
const instruction='Viết kịch bản video nấu ăn tiếng Việt với đúng '+count+' phân cảnh, chủ đề "'+topic+'". Người dẫn thống nhất khuôn mặt, đạo cụ và bối cảnh. Khi chế biến phải đeo găng tay sạch. Ưu tiên POV, nhân vật xuất hiện có chọn lọc. Giọng NAM MIỀN NAM đồng nhất. Mỗi cảnh 8 giây: hành động, khung hình, lời thoại phải vừa thời lượng. Trả JSON object duy nhất: {"scenes":[{"title":"Tên cảnh","prompt":"English realistic Veo prompt with action, camera and Vietnamese speech","imagePrompt":"English photorealistic start-frame description","voiceover":"Lời thoại ngắn giọng nam miền Nam","duration":8}]}. Không thêm markdown. Phân chia đầy đủ giới thiệu, nguyên liệu, sơ chế, nấu, thành phẩm, thưởng thức.';
let txt="";
if(s.provider==="gemini"){const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(s.model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{parts:[{text:instruction}]}],generationConfig:{responseMimeType:"application/json"}}),signal:AbortSignal.timeout(90000)});const j=await res.json();if(!res.ok)throw Error(JSON.stringify(j.error||j).slice(0,1000));txt=j.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")||"";}
else{const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({model:s.model,messages:[{role:"user",content:instruction}],response_format:{type:"json_object"}}),signal:AbortSignal.timeout(90000)});const j=await res.json();if(!res.ok)throw Error(JSON.stringify(j.error||j).slice(0,1000));txt=j.choices?.[0]?.message?.content||"";}
const parsed=JSON.parse(txt.replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\s*\x60{3}$/,""));if(!Array.isArray(parsed.scenes)||parsed.scenes.length!==count)throw Error("AI trả về số cảnh không chính xác; thử lại.");return parsed.scenes.map((x,i)=>w.normalizeScene({...x,id:w.newId(),status:"pending"},i));
}
function initIpc(){
ipcMain.handle("workspace:get",()=>workspace());
ipcMain.handle("workspace:save",(_,x)=>{idle();return save(x);});
ipcMain.handle("settings:get",()=>settings());ipcMain.handle("settings:save",(_,x)=>saveSettings(x));
ipcMain.handle("story:generate",(_,x)=>story(x));
ipcMain.handle("flow:auth",(_,x)=>{idle();return cmd(["auth","login","--profile",x?.profile||"default"],120000,x?.chromePath);});
ipcMain.handle("flow:chromeStatus",async(_,x)=>{idle();return chrome.inspect({userDataDir:root(),profile:x?.profile||"default",chromePath:x?.chromePath||workspace().chromePath});});
ipcMain.handle("flow:doctor",async(_,x)=>{idle();const profile=x?.profile||"default";const state=await chrome.inspect({userDataDir:root(),profile,chromePath:x?.chromePath||workspace().chromePath});const tip=chrome.guidance(state);if(tip)throw Error(tip);return cmd(["doctor","--profile",profile],120000,x?.chromePath);});
ipcMain.handle("flow:character:create",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output()),c=ws.character;const args=["character","create","--name",c.name,"--prompt",c.prompt,"--out",ws.outputDir,...flags(ws)];if(c.description)args.push("--description",c.description);if(c.voice)args.push("--voice",c.voice);if(c.referenceImages.length)args.push("--image",...c.referenceImages);return cmd(args,1200000,ws.chromePath);});
ipcMain.handle("flow:character:list",(_,x)=>{idle();return cmd(["character","list",...flags(w.normalizeWorkspace(x?.workspace||workspace(),output()))],120000);});
ipcMain.handle("flow:media:list",(_,x)=>{idle();return cmd(["media","list",...flags(w.normalizeWorkspace(x?.workspace||workspace(),output()))],120000);});
ipcMain.handle("flow:extend",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output());const ref=String(x?.sceneId||x?.mediaId||"").trim(),prompt=String(x?.prompt||"").trim();if(!ref||!prompt)throw Error("Nhập Scene/Media ID và prompt nối tiếp.");return cmd(["extend",...(x?.sceneId?["--scene",ref]:["--media-id",ref]),"--prompt",prompt,"--out",ws.outputDir,...flags(ws)],1200000);});
ipcMain.handle("flow:agent:run",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output()),prompt=String(x?.prompt||"").trim();if(!prompt)throw Error("Nhập yêu cầu Flow Agent.");return cmd(["agent","--prompt",prompt,"--id",w.safeJobId("agent-"+Date.now()),"--out",ws.outputDir,...flags(ws)],1800000);});
ipcMain.handle("flow:agent:instruction",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output()),line=String(x?.text||"").trim();if(!line)throw Error("Chưa có quy tắc cho Flow Agent.");return cmd(["agent","instruction","add","--text",line,...flags(ws)],120000);});
ipcMain.handle("flow:agent:list",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output());return cmd(["agent","instruction","list",...flags(ws)],120000);});
ipcMain.handle("flow:tool:create",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output()),name=String(x?.name||"").trim(),prompt=String(x?.prompt||"").trim();if(!name||!prompt)throw Error("Điền tên và mô tả công cụ.");return cmd(["tool","create","--name",name,"--prompt",prompt,...flags(ws)],600000);});
ipcMain.handle("flow:tool:list",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output());return cmd(["tool","list",...flags(ws)],120000);});
ipcMain.handle("flow:scene:list",(_,x)=>{idle();const ws=w.normalizeWorkspace(x?.workspace||workspace(),output());return cmd(["scene","list",...flags(ws)],120000);});
ipcMain.handle("flow:batch",(_,x)=>{idle();const file=String(x?.file||"");if(!path.isAbsolute(file)||!/\.ya?ml$/i.test(file)||!fs.existsSync(file))throw Error("Chọn file pipeline YAML hợp lệ.");const ws=w.normalizeWorkspace(x?.workspace||workspace(),output());return cmd(["batch",file,"--out",ws.outputDir],3600000);});
ipcMain.handle("flow:run",(_,x)=>run(x));ipcMain.handle("flow:stop",()=>{if(!active)return false;active.cancelled=true;active.child?.kill();log("Đã yêu cầu dừng.");return true;});
ipcMain.handle("flow:sdkDoctor",()=>sdkDoctor());ipcMain.handle("flow:sdkProjects",()=>{idle();return sdkProjects();});
ipcMain.handle("flow:sdkCreateProject",async(_,x)=>{idle();const c=sdk(true);try{return await c.createProject({title:String(x?.title||"Dự án video").slice(0,120)});}finally{await c.disconnect().catch(()=>{});}});
ipcMain.handle("dialog:pickChrome",async()=>{const r=await dialog.showOpenDialog(win,{title:"Chọn Chrome executable",properties:["openFile"],filters:[{name:"Google Chrome",extensions:["exe"]}]});return r.canceled?null:r.filePaths[0];});
ipcMain.handle("dialog:pickImages",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile","multiSelections"],filters:[{name:"Image",extensions:["png","jpg","jpeg","webp"]}]});return r.canceled?[]:r.filePaths;});
ipcMain.handle("dialog:pickYaml",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"YAML pipeline",extensions:["yaml","yml"]}]});return r.canceled?null:r.filePaths[0];});
ipcMain.handle("workspace:chooseOutput",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openDirectory"]});return r.canceled?null:r.filePaths[0];});
ipcMain.handle("shell:openPath",(_,p)=>{if(!path.isAbsolute(String(p||""))||!fs.existsSync(p))throw Error("File không hợp lệ.");return shell.openPath(p);});
ipcMain.handle("shell:openFlow",()=>shell.openExternal("https://labs.google/fx/tools/flow"));
}
function createWindow(){win=new BrowserWindow({width:1480,height:940,minWidth:1050,minHeight:690,backgroundColor:"#090f1a",title:"DuAnTaoVideo | Flow Studio",webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:false}});
win.webContents.setWindowOpenHandler(()=>({action:"deny"}));win.webContents.on("will-navigate",(e,url)=>{if(!url.startsWith("http://127.0.0.1:5173/")&&!url.startsWith("file://"))e.preventDefault();});
if(process.env.ELECTRON_DEV_URL)win.loadURL(process.env.ELECTRON_DEV_URL);else win.loadFile(path.join(__dirname,"..","dist","index.html"));}
app.whenReady().then(()=>{initIpc();createWindow();app.on("activate",()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
