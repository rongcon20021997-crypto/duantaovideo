const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const VIDEO_MODELS = ["Omni Flash", "Veo 3.1 - Lite", "Veo 3.1 - Fast", "Veo 3.1 - Quality"];
const IMAGE_MODELS = ["Nano Banana 2", "Nano Banana Pro", "Imagen 4"];
const safeText = (value, fallback = "") => typeof value === "string" ? value.slice(0, 12000) : fallback;
const clamp = (value, min, max, fallback) => {const n=Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback; };
const newId = () => crypto.randomUUID();
function normalizeScene(scene = {}, index = 0) {
  return { id: safeText(scene.id, newId()).slice(0, 90) || newId(),
    title: safeText(scene.title, `Cảnh ${index + 1}`).slice(0, 120),
    prompt: safeText(scene.prompt), imagePrompt: safeText(scene.imagePrompt),
    voiceover: safeText(scene.voiceover), duration: clamp(scene.duration, 4, 10, 8),
    status: ["completed","failed"].includes(scene.status) ? scene.status : "pending",
    ...(scene.image ? { image: String(scene.image) } : {}), ...(scene.video ? { video: String(scene.video) } : {})
  };
}
function normalizeWorkspace(input = {}, fallbackDir) {
 const character = input.character || {};
 return { name: safeText(input.name,"Dự án video mới").slice(0,120), topic: safeText(input.topic,"Nấu ăn món bò lúc lắc"), project: safeText(input.project),
 profile: /^[\w-]{1,40}$/.test(input.profile || "") ? input.profile : "default",
 engine: input.engine === "sdk" ? "sdk" : "gflow",
 outputDir: safeText(input.outputDir,fallbackDir) || fallbackDir,
 ratio: input.ratio === "16:9" ? "16:9" : "9:16",
 imageModel: IMAGE_MODELS.includes(input.imageModel) ? input.imageModel : "Nano Banana Pro",
 videoModel: VIDEO_MODELS.includes(input.videoModel) ? input.videoModel : "Veo 3.1 - Fast",
 prepareImages: input.prepareImages !== false,
 character: { name: safeText(character.name,"Alex").slice(0,70), prompt: safeText(character.prompt,"Người dẫn chương trình nấu ăn nam, 28 tuổi, khuôn mặt cố định, mặc áo đầu bếp, mang găng tay sạch"), description: safeText(character.description,"Tự nhiên, vui vẻ, hướng dẫn chi tiết"), voice: safeText(character.voice).slice(0,80), referenceImages: Array.isArray(character.referenceImages) ? character.referenceImages.filter(x=>typeof x==="string").slice(0,5) : [], ...(character.thumbnail ? {thumbnail: character.thumbnail}: {}) },
 scenes: Array.isArray(input.scenes) ? input.scenes.slice(0,40).map(normalizeScene) : []
 };
}
function templateScenes(topic="Món bò lúc lắc", n=6) {
 const steps=[
 ["Giới thiệu món ăn", "MC giới thiệu món ăn thành phẩm, nếm thử trước máy quay", "Món ăn hoàn thiện trên đĩa sứ trắng, studio bếp sáng"],
 ["Nguyên liệu", "Bày đúng nguyên liệu lên tô thủy tinh trắng, giới thiệu định lượng", "Các tô thủy tinh trắng đựng nguyên liệu được xếp ngay ngắn trên bàn bếp"],
 ["Sơ chế", "Cắt và ướp nguyên liệu, tay đeo găng sạch, POV chi tiết", "Cận cảnh bàn tay đeo găng sạch đang sơ chế trên thớt sạch"],
 ["Chế biến", "Làm nóng chảo, cho nguyên liệu vào đúng thứ tự, cận cảnh kỹ thuật", "Chảo nóng trên bếp sạch, nguyên liệu được đảo đều"],
 ["Hoàn thiện", "Nêm và bày ra đĩa, quay POV cận cảnh thành phẩm", "Đĩa thành phẩm nóng hổi được trình bày đẹp mắt"],
 ["Thưởng thức", "MC nếm món ăn, nhận xét mùi vị và chia sẻ mẹo", "MC trong bếp đang thưởng thức thành phẩm với ánh sáng ấm"]
 ];
 return Array.from({length:clamp(n,1,20,6)},(_,i)=>{const [title,action,visual]=steps[i%steps.length];
 return normalizeScene({id:newId(), title: `Cảnh ${i+1} — ${title}`, duration:8, prompt:`Realistic cooking tutorial of ${topic}. ${action}. Consistent host face, clean gloves when handling food, consistent utensils and kitchen. Natural South Vietnamese male narration, accurate lip synchronization if speaking. Cinematic 9:16, no text, no watermark.`,imagePrompt:`Photorealistic Vietnamese cooking tutorial, ${topic}. ${visual}. Maintain consistent kitchen, character and cookware; clean food styling, no writing, 9:16.`,voiceover:action},i)});
}
function safeJobId(id) { return String(id||newId()).replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,72); }
function latestArtifact(dir,id,extensions) {
 if(!fs.existsSync(dir)) return undefined;
 const prefix=safeJobId(id)+"-";
 return fs.readdirSync(dir).filter(n=>n.startsWith(prefix)&&extensions.includes(path.extname(n).toLowerCase())).map(n=>({name:n,mtime:fs.statSync(path.join(dir,n)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime)[0]?.name;
}
module.exports={newId,normalizeScene,normalizeWorkspace,templateScenes,safeJobId,latestArtifact,VIDEO_MODELS,IMAGE_MODELS};
