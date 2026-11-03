// Standalone ordinary-public-guest playback diagnostic for TCL air conditioning Tmall shop.
// No access credentials, proxies, CAPTCHA bypass or persistent browser data.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const target={name:'TCL空调官方旗舰店',accountId:'2098070993',shopId:'111869866',storeUrl:'https://tclkt.tmall.com/'};
function parse(raw){
  const text=String(raw||'').trim();try{return JSON.parse(text)}catch{}
  const a=text.indexOf('('),b=text.lastIndexOf(')'),cb=text.slice(0,a).trim();
  if(a<1||b<=a||!/^[\w.$]{1,64}$/.test(cb))throw Error('unknown JSONP');
  return JSON.parse(text.slice(a+1,b));
}
const result={target,date:new Date().toISOString(),credentialsUsed:false,state:'UNKNOWN',checkedBy:'fresh public guest browser',attempts:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  for(let n=1;n<=2;n++){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
      locale:'zh-CN',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'});
    const page=await context.newPage(),pending=[],answers=[];
    page.on('response',res=>{
      let u;try{u=new URL(res.url())}catch{return;}
      if(u.hostname!=='h5api.m.taobao.com'||!u.pathname.includes('/mtop.mediaplatform.live.livedetail/4.0/'))return;
      pending.push((async()=>{
        const item={http:res.status()};
        try{
          const j=parse(await res.text()),d=j.data||{},bc=d.broadCaster||{};
          item.ret=Array.isArray(j.ret)?j.ret.filter(x=>typeof x==='string').slice(0,3):[];
          item.data={accountId:String(d.accountId??''),liveId:String(d.liveId??''),roomNum:String(d.roomNum??''),
            roomStatus:d.roomStatus??null,streamStatus:d.streamStatus??null,status:d.status??null,
            title:String(d.title??'').slice(0,70),
            broadcasterAccountId:String(bc.accountId??''),broadcasterName:String(bc.accountName??'').slice(0,100),
            broadcasterRoomNum:String(bc.roomNum??'')};
        }catch(e){item.parseError=String(e.message).slice(0,90)}
        answers.push(item);
      })());
    });
    const row={attempt:n,at:new Date().toISOString()};
    try{
      const res=await page.goto('https://h5.m.taobao.com/taolive/video.html?userId='+target.accountId,
        {waitUntil:'domcontentloaded',timeout:24000});
      await page.waitForTimeout(7000);
      await Promise.allSettled(pending);
      const text=(await page.locator('body').innerText()).slice(0,400);
      row.page={status:res?.status(),title:(await page.title()).slice(0,80),
        displayedTCLName:text.includes('TCL空调'),hasLogin:text.includes('登录'),hasEnded:text.includes('直播结束'),
        roomNum:(text.match(/房间号：\s*(\d+)/)||[])[1]||null};
    }catch(e){row.error=String(e.message).slice(0,130)}
    row.apiResponses=answers;
    const good=answers.find(x=>x.ret?.some(r=>r.startsWith('SUCCESS'))&&x.data?.broadcasterAccountId===target.accountId
      &&x.data?.broadcasterName?.includes('TCL空调')&&x.data?.roomNum===x.data?.broadcasterRoomNum);
    if(good){
      const v=good.data;
      result.observedAccountName=v.broadcasterName;result.roomNum=v.roomNum;
      result.roomStatus=v.roomStatus;result.streamStatus=v.streamStatus;result.liveId=v.liveId;
      result.identityMatched=true;
      if(Number(v.roomStatus)===1&&Number(v.streamStatus)===1&&Number(v.liveId)>0&&v.accountId===target.accountId) result.state='LIVE';
      else if(Number(v.roomStatus)===0&&Number(v.streamStatus)===0&&Number(v.liveId)===0)result.state='OFFLINE';
    }
    result.attempts.push(row);
    await context.close();
    if(result.state!=='UNKNOWN')break;
  }
}finally{await browser.close();}
await fs.writeFile('tcl-air-conditioner-diagnostic.json',JSON.stringify(result,null,2)+'\n');
console.log('TCL_AIR_DIAGNOSTIC_START');
console.log(JSON.stringify(result,null,2));
console.log('TCL_AIR_DIAGNOSTIC_END');
