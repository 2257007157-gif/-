// Configurable public Taobao/Tmall livestream monitor.
// Runs without user login, cookies, merchant keys or anti-bot workarounds.
// A successful HTML response alone is NEVER a broadcast status.
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const DEFAULT_CONFIG = 'config/tcl-taobao-tmall-shops.json';
const OUTPUT = 'tcl-multi-shop-status.json';
const LIVE_PAGE = 'https://h5.m.taobao.com/taolive/video.html?userId=';
const LIVE_DETAIL_PATH = '/h5/mtop.mediaplatform.live.livedetail/4.0/';

function parseJSONOrJSONP(raw) {
  const text = String(raw || '').trim();
  try { return JSON.parse(text); } catch {}
  const left = text.indexOf('(');
  const right = text.lastIndexOf(')');
  if (left < 1 || right <= left || !/^[a-zA-Z_$][\w.$]{0,63}$/.test(text.slice(0, left).trim())) {
    throw Error('Unrecognized JSON/JSONP response');
  }
  return JSON.parse(text.slice(left + 1, right));
}
const clean = x => String(x ?? '').replace(/\s+/g,'').trim();
function classify(payload, target) {
  const ret = Array.isArray(payload?.ret) ? payload.ret.filter(x=>typeof x==='string').slice(0,3) : [];
  if (!ret.some(x => x.startsWith('SUCCESS'))) {
    return {state:'UNKNOWN',reason:'API_ERROR',apiRet:ret};
  }
  const d = payload?.data, broadcaster = d?.broadCaster;
  if (!d || !broadcaster) {
    return {state:'UNKNOWN',reason:'MISSING_BROADCASTER',apiRet:ret};
  }
  const observedName = String(broadcaster.accountName || '');
  const observedAccountId = String(broadcaster.accountId ?? '');
  const roomNumber = String(broadcaster.roomNum ?? d.roomNum ?? '');
  const observed = {accountId:observedAccountId,name:observedName,roomNumber};
  if (observedAccountId !== target.accountId || clean(observedName) !== clean(target.displayName)) {
    return {state:'UNKNOWN',reason:'IDENTITY_MISMATCH',observed,apiRet:ret};
  }
  if (target.roomNumber && String(target.roomNumber) !== roomNumber) {
    return {state:'UNKNOWN',reason:'ROOM_MISMATCH',observed,apiRet:ret};
  }
  if (String(d.roomNum ?? '') !== roomNumber) {
    return {state:'UNKNOWN',reason:'CONFLICTING_ROOM_NUMBERS',observed,apiRet:ret};
  }
  const room = Number(d.roomStatus), stream = Number(d.streamStatus);
  if (![0,1,2].includes(room) || ![0,1].includes(stream)) {
    return {state:'UNKNOWN',reason:'UNRECOGNIZED_STATUS',observed,roomStatus:d.roomStatus,streamStatus:d.streamStatus};
  }
  const liveId = String(d.liveId ?? '');
  const sourceStartTime = /^\d{13}$/.test(String(d.startTime??'')) && Number(d.startTime)>0
    ? new Date(Number(d.startTime)).toISOString() : null;
  const base={state:'UNKNOWN',reason:'AMBIGUOUS_STATUS',observed,roomStatus:room,streamStatus:stream,liveId:liveId||null,
    liveTitle:String(d.title??'').slice(0,90),sourceStartTime};
  // LIVE requires corroborating top-level account and session fields.
  if (room===1 && stream===1 && String(d.accountId)===target.accountId && /^\d{5,24}$/.test(liveId) && Number(liveId)>0) {
    return {...base,state:'LIVE',reason:null};
  }
  // Offline deliberately does NOT require top-level accountId, which becomes 0.
  if ((room===0 || room===2) && stream===0 && (!liveId || liveId==='0')) {
    return {...base,state:'OFFLINE',reason:null};
  }
  return base;
}
function validTarget(t) {
  return t && /^[a-z0-9][a-z0-9-]{1,60}$/.test(t.key) && ['tmall','taobao'].includes(t.platform)
    && typeof t.displayName === 'string' && t.displayName.length>0 && /^https:\/\/[^ ]+$/.test(t.storeUrl)
    && (t.accountId===null || /^\d{5,24}$/.test(t.accountId))
    && (t.roomNumber===null || /^\d{1,24}$/.test(t.roomNumber));
}
function baseRow(t) {
  return {key:t.key,platform:t.platform,displayName:t.displayName,storeUrl:t.storeUrl,
    verificationStage:t.verificationStage,userConfirmed:t.userConfirmed===true,
    accountId:t.accountId,expectedRoomNumber:t.roomNumber,
    checkedAt:new Date().toISOString(),state:'UNKNOWN',identityVerified:false,
    roomNumber:null,liveId:null,roomStatus:null,streamStatus:null,
    sourceStartTime:null,reason:'NOT_RUN',attempts:[]};
}
async function runTarget(context,t) {
  const row=baseRow(t);
  if (!t.accountId) {
    row.state='DISCOVERY_PENDING';
    row.reason='NO_PUBLIC_ACCOUNT_ID; only shop URL is known, no live-room state requested';
    return row;
  }
  for(let attempt=1; attempt<=2; attempt++) {
    const page=await context.newPage(), samples=[], pending=[];
    const step={attempt,attemptTime:new Date().toISOString(),apiResponses:0};
    page.on('response',response=>{
      try {
        const url=new URL(response.url());
        if (url.hostname!=='h5api.m.taobao.com' || url.pathname!==LIVE_DETAIL_PATH) return;
        const task=(async()=>{
          try {
            const text=await response.text();
            const item=classify(parseJSONOrJSONP(text),t);
            samples.push(item);
          } catch(e) { samples.push({state:'UNKNOWN',reason:'API_RESPONSE_PARSE_ERROR'}); }
        })();
        pending.push(task);
      } catch {}
    });
    try {
      const response=await page.goto(LIVE_PAGE+encodeURIComponent(t.accountId),{waitUntil:'domcontentloaded',timeout:25000});
      step.http=response?.status()??null;
      await page.waitForTimeout(7000);
      await Promise.allSettled(pending);
      step.apiResponses=samples.length;
      const best=samples.find(x=>x.state==='LIVE'||x.state==='OFFLINE')
        || samples.find(x=>x.observed?.accountId===t.accountId)
        || samples.find(x=>x.reason==='IDENTITY_MISMATCH')
        || samples.at(-1);
      if(best) {
        step.state=best.state;
        step.reason=best.reason;
        if(best.observed) step.observed=best.observed;
        if(best.state==='LIVE'||best.state==='OFFLINE') {
          row.state=best.state;
          row.identityVerified=true;
          row.roomNumber=best.observed.roomNumber;
          row.liveId=best.liveId;
          row.roomStatus=best.roomStatus;
          row.streamStatus=best.streamStatus;
          row.liveTitle=best.liveTitle;
          row.sourceStartTime=best.sourceStartTime;
          row.reason=null;
        } else row.reason=best.reason||'UNCLASSIFIED';
      } else {
        step.reason='NO_LIVE_DETAIL_RESPONSE';
        row.reason=step.reason;
      }
    } catch(e) {
      step.reason='PAGE_NAVIGATION_FAILURE';
      row.reason=step.reason;
    } finally { await page.close().catch(()=>{}); }
    row.attempts.push(step);
    if(row.identityVerified) break;
  }
  row.checkedAt=new Date().toISOString();
  return row;
}
function selfTest() {
  const t={key:'fixture',platform:'tmall',displayName:'TCL集团官方旗舰店',storeUrl:'https://example.org',
    accountId:'2050532947',roomNumber:'130742'};
  const fixture={
    ret:['SUCCESS::调用成功'],
    data:{accountId:'2050532947',liveId:'2440260024340383',roomNum:'130742',
      roomStatus:'1',streamStatus:'1',title:'example',startTime:'1793574006000',
      broadCaster:{accountId:'2050532947',accountName:'TCL集团官方旗舰店',roomNum:'130742'}}
  };
  const check=(expected,result,msg)=>{
    if(result.state!==expected)throw Error(msg+': expected '+expected+' got '+result.state+'/'+result.reason);
  };
  check('LIVE',classify(fixture,t),'live');
  check('OFFLINE',classify({...fixture,data:{...fixture.data,accountId:'0',liveId:'0',roomStatus:0,streamStatus:0,startTime:0}},t),'offline');
  check('UNKNOWN',classify({...fixture,data:{...fixture.data,broadCaster:{...fixture.data.broadCaster,accountId:'1111111111'}}},t),'identity mismatch');
  check('UNKNOWN',classify({ret:['FAIL_SYS_TOKEN_EMPTY::令牌为空'],data:{}},t),'API error');
  check('UNKNOWN',classify({...fixture,data:{...fixture.data,roomStatus:1,streamStatus:0}},t),'ambiguous');
  if(parseJSONOrJSONP('mtopjsonp1({"data":{},"ret":["SUCCESS"]})').ret[0]!=='SUCCESS')throw Error('JSONP parse');
  console.log('PASS 6 self-tests: LIVE/OFFLINE/identity/API error/ambiguous/JSONP');
}
async function main() {
  if(process.argv.includes('--self-test')) { selfTest(); return; }
  const path=process.argv[2]||DEFAULT_CONFIG;
  const config=JSON.parse(await fs.readFile(path,'utf8'));
  if(config.schemaVersion!==1 || !Array.isArray(config.targets) || !config.targets.every(validTarget)) {
    throw Error('Invalid multi-shop config schema');
  }
  if(new Set(config.targets.map(x=>x.key)).size!==config.targets.length)throw Error('Duplicate target keys');
  const report={schemaVersion:1,createdAt:new Date().toISOString(),
    probeType:'public guest-page API; NOT a continuous observation',noCredentials:true,
    noCloudSchedule:true,targets:[],counts:{}};
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',
      userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'});
    for(const target of config.targets) {
      report.targets.push(await runTarget(context,target));
    }
    await context.close();
  } finally {await browser.close();}
  for(const t of report.targets) report.counts[t.state]=(report.counts[t.state]||0)+1;
  report.completedAt=new Date().toISOString();
  await fs.writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
  console.log('MULTI_SHOP_PROBE_REPORT_START');
  console.log(JSON.stringify(report,null,2));
  console.log('MULTI_SHOP_PROBE_REPORT_END');
  // A historical candidate may be invalid; results must be surfaced, not misreported as SUCCESS.
  if(report.targets.some(t=>t.userConfirmed && !t.identityVerified)) process.exitCode=2;
}
await main();
