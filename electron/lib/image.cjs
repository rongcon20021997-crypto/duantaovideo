"use strict";
const path=require("node:path");
const {safeJobId}=require("./workflow.cjs");

function imageCommand(ws, input={}) {
 const project=String(ws.project||"").trim();
 if(!project) throw new Error("Chưa chọn Project Google Flow. Mở một project trên https://flow.google.com, sao chép URL /project/... vào Cài đặt và Lưu dự án. Không tự tạo dự án.");
 const prompt=String(input.prompt||"").trim();
 if(!prompt) throw new Error("Prompt tạo ảnh đang trống. Nhập mô tả ảnh trước khi bấm Tạo ảnh.");
 if(prompt.length>12000) throw new Error("Prompt dài quá 12.000 ký tự.");
 const id=safeJobId(input.id||"image-"+Date.now());
 const dir=path.resolve(String(ws.outputDir||""));
 const args=["image","--id",id,"--prompt",prompt,"--model",ws.imageModel||"Nano Banana Pro","--ratio",ws.ratio||"9:16","--outputs","1","--out",dir,"--profile",ws.profile||"default","--project",project];
 if(input.useSavedCharacter){
   const name=String(ws.character?.name||"").trim();
   if(!name)throw new Error("Chưa nhập tên nhân vật đã lưu trong Google Flow. Bỏ chọn Dùng nhân vật đã lưu để tạo ảnh thường.");
   args.push("--character",name);
 }
 return {id,dir,args};
}
module.exports={imageCommand};
