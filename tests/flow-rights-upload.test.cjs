const test=require("node:test");
const assert=require("node:assert/strict");
const {waitForRightsDecision,chooseNewMediaCard,PICKER_CONFIRM,RIGHTS}=require("../electron/lib/flow-rights-upload.cjs");
test("Flow Vietnamese image rights modal is recognized",()=>{
 assert.match("Quyền sử dụng hình ảnh này",RIGHTS);
 assert.match("Thêm vào câu lệnh",PICKER_CONFIRM);
 assert.match("Add to Prompt",PICKER_CONFIRM);
});
test("waits for human to dismiss rights attestation; no automatic click",async()=>{
 let checks=0,clicks=0,logs=[];
 const page={getByText:()=>({first:()=>({isVisible:async()=>++checks<=3})}),
  getByRole:()=>({first:()=>({isVisible:async()=>true,click:()=>{clicks++;}})})};
 const result=await waitForRightsDecision(page,s=>logs.push(s),undefined,{pause:async()=>{}});
 assert.equal(result,true);assert.equal(clicks,0);
 assert.ok(logs.some(l=>l.includes("Tôi đồng ý")));
 assert.ok(logs.some(l=>l.includes("Tiếp tục")));
});
test("rights wait can be cancelled without clicking I agree",async()=>{
 const controller=new AbortController();
 let checks=0;
 const page={getByText:()=>({first:()=>({isVisible:async()=>{checks++;return true;}})}),
  getByRole:()=>({first:()=>({isVisible:async()=>true})})};
 await assert.rejects(()=>waitForRightsDecision(page,()=>{},controller.signal,{
  now:()=>0,timeoutMs:5000,pause:async()=>controller.abort()
 }),/Đã dừng/);
 assert.ok(checks>0);
});
test("only newly uploaded media tile is selected",()=>{
 const old="https://flow.google.com/old.jpg",newSrc="https://flow.google.com/new.jpg";
 const cards=[{src:old,visible:true,index:0},{src:newSrc,visible:true,index:1}];
 assert.deepEqual(chooseNewMediaCard(cards,[old]),cards[1]);
 assert.equal(chooseNewMediaCard(cards,[old,newSrc]),null);
});
