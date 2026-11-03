// Independent Douyin guest live-room corroboration, no login or platform API use.
// A visible profile "live" badge is positive evidence, but a missing badge alone
// is never treated as "offline". A challenge or navigation failure -> UNKNOWN.
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const input=JSON.parse(await fs.readFile('config/tcl-douyin-live-room-candidates.json','utf8'));
if(input.schemaVersion!==1||!Array.isArray(input.targets)||input.targets.length!==4)throw Error('Expected exactly four approved Douyin targets');
if(input.targets.some(t=>t.scopeApproved!==true))throw Error('Target scope not approved');
if(new Set(input.targets.map(t=>t.displayDouyinId)).size!==4||new Set(input.targets.map(t=>t.profileUrl)).size!==4)throw Error('Duplicate account identity');
if(new Set(input.targets.map(t=>t.roomId)).size!==4)throw Error('Duplicate room identifier');
const report={schemaVersion:1,startedAt:new Date().toISOString(),platform:'douyin',
 method:'public profile + publicly linked live room page; no credentials',targets:[]};
function assertUrl(s,host,prefix){
 const u=new URL(s);if(u.protocol!=='https:'||u.hostname!==host||!u.pathname.startsWith(prefix))throw Error('Unapproved URL');
}
async function view(page,url){
 const out={url,checkedAt:new Date().toISOString(),httpStatus:null};
 try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
   out.httpStatus=response?.status()??null;
   await page.waitForTimeout(4500);
   const d=await page.evaluate(()=>{
     const text=String(document.body?.innerText||'').replace(/\s+/g,' ').slice(0,1000);
     const title=String(document.title||'').slice(0,150);
     const anchors=[...document.querySelectorAll('a[href]')].map(a=>({href:a.href,text:String(a.innerText||a.textContent||'').replace(/\s+/g,' ').slice(0,70)}))
       .filter(x=>/^https:\/\/live\.douyin\.com\/\d{5,24}/.test(x.href)).slice(0,15);
     return {title,bodyExcerpt:text,liveRoomAnchors:anchors,metaDescription:String(document.querySelector('meta[name="description"]')?.content||'').slice(0,200)};
   });
   Object.assign(out,d);
   out.finalUrl=new URL(page.url()).origin+new URL(page.url()).pathname;
   out.securityChallenge=/(验证码中间页|安全验证|滑块验证|captcha)/i.test(out.title+' '+out.bodyExcerpt);
   out.loginGate=/(请先登录后观看|登录后观看|扫码登录后观看)/i.test(out.bodyExcerpt);
 }catch(e){out.navigationError=String(e?.message||e).slice(0,170)}
 return out;
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
 for(const t of input.targets){
  assertUrl(t.profileUrl,'www.douyin.com','/user/');
  assertUrl(t.roomUrl,'live.douyin.com','/');
  if(!/^\d{5,24}$/.test(t.roomId)||t.roomUrl!=='https://live.douyin.com/'+t.roomId)throw Error('invalid room');
  const row={key:t.key,accountName:t.accountName,displayDouyinId:t.displayDouyinId,roomId:t.roomId,
    state:'UNKNOWN',scopeApproved:t.scopeApproved===true,reason:'NOT_CHECKED',positiveProfileLiveEvidence:false,
    profileIdentityVerified:false,roomPageIdentityVerified:false};
  const profilePage=await context.newPage(),roomPage=await context.newPage();
  try{
    row.profile=await view(profilePage,t.profileUrl);
    const p=row.profile;
    row.profileIdentityVerified=p.httpStatus===200&&!p.securityChallenge
      &&p.title===t.accountName+'的抖音 - 抖音'
      &&p.bodyExcerpt?.includes('抖音号：'+t.displayDouyinId);
    row.positiveProfileLiveEvidence=row.profileIdentityVerified&&p.liveRoomAnchors?.some(a=>
      new URL(a.href).pathname==='/'+t.roomId&&a.text.includes('直播中'));
    row.room=await view(roomPage,t.roomUrl);
    const room=row.room;
    // We never equate successful loading alone with a LIVE signal.
    row.roomPageIdentityVerified=room.httpStatus===200&&!room.securityChallenge
      &&!room.loginGate&&room.title===t.accountName+'的抖音直播间 - 抖音直播'
      &&room.metaDescription?.startsWith('欢迎来到'+t.accountName+'的抖音直播间');
    // A positive result needs account-specific profile link AND a matching room page.
    // Unknown is never silently converted to OFFLINE: no negative-control proof yet.
    if(row.positiveProfileLiveEvidence&&row.roomPageIdentityVerified){
      row.state='LIVE';
      row.reason='PROFILE_LIVE_BADGE_AND_ROOM_PAGE_IDENTITY';
    }else if(row.positiveProfileLiveEvidence) {
      row.state='UNKNOWN';
      row.reason='LIVE_BADGE_BUT_ROOM_PAGE_NOT_CROSS_VERIFIED';
    }else if(p.securityChallenge||room.securityChallenge){
      row.reason='PUBLIC_GUEST_ACCESS_CHALLENGED';
    }else if(!row.profileIdentityVerified){
      row.reason='PROFILE_IDENTITY_NOT_VERIFIED';
    }else if(!room.httpStatus||room.httpStatus!==200){
      row.reason='LIVE_ROOM_PAGE_UNAVAILABLE';
    }else{
      row.reason='NO_CORROBORATED_LIVE_EVIDENCE; not proof of offline';
    }
  }finally{await profilePage.close().catch(()=>{});await roomPage.close().catch(()=>{});}
  report.targets.push(row);
 }
 await context.close();
}finally{await browser.close();}
report.completedAt=new Date().toISOString();
report.counts=report.targets.reduce((a,x)=>(a[x.state]=(a[x.state]||0)+1,a),{});
await fs.writeFile('tcl-douyin-live-room-diagnostic.json',JSON.stringify(report,null,2)+'\n');
console.log('TCL_DOUYIN_ROOM_START');
console.log(JSON.stringify(report,null,2));
console.log('TCL_DOUYIN_ROOM_END');
