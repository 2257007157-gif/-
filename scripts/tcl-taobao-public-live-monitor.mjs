// TCL public live-room guest monitor. No merchant secrets, passwords or cookies.
// Source: public Taobao live page and the ordinary live-detail response loaded by that page.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const TARGET = Object.freeze({
  platform: '天猫/淘宝直播',
  shopName: 'TCL集团官方旗舰店',
  shopId: '109942179',
  accountId: '2050532947',
  roomNumber: '130742',
  page: 'https://h5.m.taobao.com/taolive/video.html?userId=2050532947',
});

function parseJsonOrJsonp(s) {
  s=s.trim();
  try { return JSON.parse(s); } catch {}
  const a=s.indexOf('('), b=s.lastIndexOf(')'), cb=s.slice(0,a).trim();
  if(a<0||b<=a||!(/^[a-zA-Z_$][\w.$]{0,63}$/).test(cb))throw Error('Unsupported live-detail response');
  return JSON.parse(s.slice(a+1,b));
}
function normalise(payload) {
  if(!payload || !Array.isArray(payload.ret) || !payload.ret.some(x=>typeof x==='string'&&x.startsWith('SUCCESS'))) return null;
  const d=payload.data;
  // A stopped broadcast may return data.accountId=0 and data.liveId=0.
  // The broadcaster object still identifies the fixed TCL account and room.
  if(!d || String(d.broadCaster?.accountId)!==TARGET.accountId ||
     d.broadCaster?.accountName!==TARGET.shopName ||
     String(d.broadCaster?.roomNum)!==TARGET.roomNumber ||
     String(d.roomNum)!==TARGET.roomNumber) return null;
  const room=Number(d.roomStatus), stream=Number(d.streamStatus);
  let state='UNKNOWN';
  // "LIVE" must represent a current nonzero session, not a cached room shell.
  if(room===1 && stream===1 &&
     String(d.accountId)===TARGET.accountId &&
     /^\\d{4,24}$/.test(String(d.liveId||''))) state='LIVE';
  // Preview and completed-room states with no stream are both not currently live.
  else if((room===2||room===0) && stream===0) state='OFFLINE';
  return {
    state, roomStatus:room, streamStatus:stream,
    liveId:String(d.liveId||''), roomNumber:String(d.roomNum),
    broadcastTitle:String(d.title||'').slice(0,100),
    sourceStartTime: /^\d{13}$/.test(String(d.startTime||''))?new Date(Number(d.startTime)).toISOString():null,
  };
}
const report={schemaVersion:2,checkedAt:new Date().toISOString(),timeZone:'Asia/Shanghai',
  platform:TARGET.platform,shopName:TARGET.shopName,shopId:TARGET.shopId,
  accountId:TARGET.accountId,roomNumber:TARGET.roomNumber,
  status:'UNKNOWN',liveId:null,title:null,startTime:null,
  roomStatus:null,streamStatus:null,source:'public Taobao guest browser / live-detail',
  credentialsUsed:false,error:null,attempts:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'});
  for (let attempt=1;attempt<=2;attempt++) {
    const page=await context.newPage(), waiting=[], seen=[];
    page.on('response',resp=>{
      try {
        const u=new URL(resp.url());
        if(u.hostname!=='h5api.m.taobao.com'||!u.pathname.includes('/mtop.mediaplatform.live.livedetail/4.0/'))return;
        waiting.push((async()=>{
          try {
            const result=normalise(parseJsonOrJsonp(await resp.text()));
            seen.push(result||{state:'UNKNOWN',reason:'API success/identity/status check failed'});
          }catch(e){seen.push({state:'UNKNOWN',reason:String(e.message).slice(0,100)});}
        })());
      }catch{}
    });
    const step={attempt,status:'UNKNOWN'};
    try {
      const response=await page.goto(TARGET.page,{waitUntil:'domcontentloaded',timeout:27000});
      await page.waitForTimeout(7500);
      await Promise.allSettled(waiting);
      step.http=response?.status()||null;
      step.apiResponses=seen.length;
      const valid=seen.find(x=>x && x.roomNumber===TARGET.roomNumber);
      if(valid){
        step.status=valid.state;
        report.status=valid.state;report.roomStatus=valid.roomStatus;report.streamStatus=valid.streamStatus;
        report.liveId=valid.liveId||null;report.title=valid.broadcastTitle;report.startTime=valid.sourceStartTime;
        report.error=null;
      } else step.reason=seen[0]?.reason||'No verified live-detail response';
    }catch(e){step.reason=String(e.message).slice(0,140);}
    report.attempts.push(step);
    await page.close().catch(()=>{});
    if(report.status!=='UNKNOWN')break;
  }
  await context.close();
} finally { await browser.close(); }
if(report.status==='UNKNOWN') report.error='No verified public live-state observation (do not count as offline)';
const outfile='tcl-live-status.json';
await fs.writeFile(outfile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.status==='UNKNOWN')process.exitCode=2;
