// One-time feasibility test for authentication-free HTTP on public Douyin pages.
// Does not use Playwright, signatures, cookies, session data, or verification bypass.
// Reports whether a fetch-only serverless handler would have reliable public
// LIVE / OFFLINE evidence; "not seen" is NEVER OFFLINE.
import fs from 'node:fs/promises';
const input=JSON.parse(await fs.readFile('config/tcl-douyin-live-room-candidates.json','utf8'));
if(input.targets?.length!==4)throw Error('Expected four official TCL targets');
const results={schemaVersion:1,startedAt:new Date().toISOString(),method:'Node fetch; no browser/cookies/auth/secret',targets:[]};
function stripTags(raw){return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').slice(0,20000);}
async function get(url,accountName,douyinId,roomId){
  const item={url,http:null,reason:'UNKNOWN',explicitLiveEvidence:false,explicitOfflineEvidence:false};
  try{
    const resp=await fetch(url,{signal:AbortSignal.timeout(16000),redirect:'follow',headers:{'Accept':'text/html','Accept-Language':'zh-CN,zh;q=0.9'}});
    const raw=(await resp.text()).slice(0,1200000), visible=stripTags(raw);
    item.http=resp.status;item.bytes=raw.length;
    item.finalHost=new URL(resp.url).hostname;
    const title=(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';
    const description=(raw.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i)||[])[1]||'';
    item.title=title.slice(0,130);item.metaDescription=description.slice(0,160);
    item.containsAccountName=(title+description+visible).includes(accountName);
    item.containsDouyinId=(title+description+visible).includes(douyinId);
    item.containsRoomLink=raw.includes('live.douyin.com/'+roomId);
    item.containsLiveBadge=visible.includes('直播中');
    item.isChallenge=/验证码中间页|安全验证|滑块验证|captcha|访问异常|频繁访问/i.test(title+' '+visible.slice(0,1000));
    item.isLoginGate=/请登录后观看|登录后观看|扫码登录后观看/.test(visible.slice(0,1500));
    if(item.isChallenge){item.reason='GUEST_CHALLENGE';}
    else if(item.http!==200){item.reason='HTTP_ERROR';}
    else if(item.isLoginGate){item.reason='LOGIN_GATE';}
    else if(item.containsAccountName && item.containsDouyinId && item.containsRoomLink && item.containsLiveBadge){
      item.explicitLiveEvidence=true;item.reason='HTTP_PROFILE_LIVE_BADGE_IDENTIFIED';
    } else {item.reason='INSUFFICIENT_HTTP_EVIDENCE';}
    // Negative detection requires explicit authoritative end/offline evidence.
    // Text omissions/old HTML and page errors never establish an OFFLINE state.
  }catch(e){item.reason='FETCH_ERROR';item.error=String(e?.message||e).slice(0,160)}
  return item;
}
for(const t of input.targets){
 const r={key:t.key,accountName:t.accountName,displayDouyinId:t.displayDouyinId,roomId:t.roomId,scopeApproved:t.scopeApproved,
   profile:await get(t.profileUrl,t.accountName,t.displayDouyinId,t.roomId),
   room:await get(t.roomUrl,t.accountName,t.displayDouyinId,t.roomId)};
 r.state=r.profile.explicitLiveEvidence&&r.room.containsAccountName&&r.room.http===200&&!r.room.isChallenge?'LIVE':'UNKNOWN';
 r.reason=r.state==='LIVE'?'HTTP_PROFILE_AND_ROOM_CORROBORATED':'NO_STRICT_HTTP_CORROBORATION';
 results.targets.push(r);
}
results.completedAt=new Date().toISOString();
results.summary={checked:results.targets.length,provenLive:results.targets.filter(x=>x.state==='LIVE').length,
 provenOffline:0,unknown:results.targets.filter(x=>x.state==='UNKNOWN').length};
await fs.writeFile('tcl-douyin-http-only-feasibility.json',JSON.stringify(results,null,2)+'\n');
console.log('TCL_DOUYIN_HTTP_ONLY_START');
console.log(JSON.stringify(results,null,2));
console.log('TCL_DOUYIN_HTTP_ONLY_END');
