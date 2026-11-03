// Read-only guest diagnostics for public TCL Tmall store URLs.
// This tool never converts an unverified shop URL into a live-room accountId.
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const config=JSON.parse(await fs.readFile('config/tcl-tmall-public-store-discovery.json','utf8'));
if(config.schemaVersion!==1||!Array.isArray(config.items))throw Error('bad config');
const allowedHost=(host)=>host.endsWith('.tmall.com')||host.endsWith('.taobao.com')||host==='tmall.com'||host==='taobao.com';
function infoFromURL(url){
  try{
    const u=new URL(url);
    return {host:u.host,path:u.pathname,isLogin:/login|passport|havanaone/.test(u.host+u.pathname),
      publicIds:Object.fromEntries([...u.searchParams].filter(([k,v])=>/^(shopId|userId|sellerId|user_number_id|ownerId|accountId)$/i.test(k)&&/^\d{4,24}$/.test(v)))};
  }catch{return {error:'invalid-url'};}
}
function possibleIds(text){
  const keys=['shopId','sellerId','user_number_id','userId','accountId'];
  const output={};
  for(const key of keys){
    const re=new RegExp('(?:["\\']?'+key+'["\\']?\\s*[:=]\\s*["\\']?)(\\d{5,24})(?=["\\'\\s,;&<>}])','gi');
    const ids=new Set();
    let m;let n=0;
    while((m=re.exec(text))!==null&&n++<120)ids.add(m[1]);
    if(ids.size)output[key]=[...ids].slice(0,10);
  }
  return output;
}
const r={schemaVersion:1,checkedAt:new Date().toISOString(),purpose:'public store discovery only; does not prove live-account binding',noCredentials:true,stores:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'});
  for(const entry of config.items){
    const u=new URL(entry.url);
    if(u.protocol!=='https:'||!allowedHost(u.hostname))throw Error('unapproved domain');
    const item={key:entry.key,name:entry.name,storeUrl:entry.url,status:'UNKNOWN',accountId:null,roomNumber:null,checks:[]};
    // HTTP response only. No proxy, cookies, tokens, or security challenge bypass.
    try{
      const response=await fetch(entry.url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{
        'user-agent':'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
        'accept-language':'zh-CN,zh;q=0.9'
      }});
      const text=(await response.text()).slice(0,300000);
      item.checks.push({method:'guest-fetch',http:response.status,redirect:infoFromURL(response.headers.get('location')||''),
        contentType:response.headers.get('content-type')?.split(';')[0],htmlIds:possibleIds(text)});
    }catch(e){item.checks.push({method:'guest-fetch',error:String(e?.message||e).slice(0,100)});}
    const page=await context.newPage();
    try{
      const response=await page.goto(entry.url,{waitUntil:'domcontentloaded',timeout:23000});
      await page.waitForTimeout(2500);
      const dest=infoFromURL(page.url());
      const html=dest.isLogin?'':(await page.content()).slice(0,500000);
      item.checks.push({method:'guest-chromium',http:response?.status(),final:dest,pageTitle:(await page.title()).slice(0,85),htmlIds:possibleIds(html)});
      const signals=[...item.checks].map(x=>x.htmlIds||{});
      item.status=dest.isLogin?'LOGIN_GATE':'PUBLIC_PAGE_CHECKED';
      item.publicNumericIdSignals=signals.some(x=>Object.keys(x).length>0);
      // Identity cannot be assumed even if some unvalidated ID candidate exists.
    }catch(e){
      item.checks.push({method:'guest-chromium',error:String(e?.message||e).slice(0,125)});
      item.status='GUEST_ACCESS_ERROR';
    }finally{await page.close().catch(()=>{});}
    r.stores.push(item);
  }
  await context.close();
}finally{await browser.close();}
r.completedAt=new Date().toISOString();
await fs.writeFile('tcl-tmall-public-store-discovery.json',JSON.stringify(r,null,2)+'\n');
console.log('DISCOVERY_START');
console.log(JSON.stringify(r,null,2));
console.log('DISCOVERY_END');
