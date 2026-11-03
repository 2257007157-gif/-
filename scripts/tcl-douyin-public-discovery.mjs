/**
 * TCL Douyin guest-web account discovery.
 * Scope: ordinary publicly rendered pages ONLY; no login, no tokens/cookies,
 * no browser fingerprint evasion, no signature generation, no third-party APIs.
 * A HTTP 200, a video title or a suggested account does not prove broadcast.
 */
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const input=JSON.parse(await fs.readFile('config/tcl-douyin-public-discovery.json','utf8'));
if(input.schemaVersion!==1||!Array.isArray(input.candidates))throw Error('invalid candidate config');
if(new Set(input.candidates.map(c=>c.key)).size!==input.candidates.length)throw Error('duplicate candidates');

const result={schemaVersion:1,startedAt:new Date().toISOString(),authUsed:false,method:'public web guest browsing',platform:'douyin',candidates:[],verifiedLiveAccounts:0};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
 for(const c of input.candidates){
   const u=new URL(c.url);
   if(u.protocol!=='https:'||u.hostname!=='www.douyin.com')throw Error('unapproved origin');
   const row={key:c.key,label:c.label,kind:c.kind,sourceUrl:c.url,checkedAt:new Date().toISOString(),
     pageStatus:'UNKNOWN',liveStatus:'UNKNOWN',identityVerified:false,accountLinks:[],liveRoomLinks:[],reason:null};
   const page=await context.newPage();
   try{
     const response=await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:23000});
     row.httpStatus=response?.status()??null;
     await page.waitForTimeout(3500);
     const doc=await page.evaluate(()=>{
       const safe=(value,max)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
       const body=safe(document.body?.innerText,350);
       const links=[...document.querySelectorAll('a[href]')].slice(0,400);
       const user=[];
       const live=[];
       const seen=new Set();
       for(const a of links){
         try{
           const url=new URL(a.href);
           if(url.hostname==='www.douyin.com'&&url.pathname.startsWith('/user/')){
             const secUid=decodeURIComponent(url.pathname.slice('/user/'.length));
             if(secUid&&secUid.length<=180&&!seen.has('u'+secUid)){
               seen.add('u'+secUid);
               user.push({secUid,profileUrl:'https://www.douyin.com/user/'+encodeURIComponent(secUid),
                 linkText:safe(a.innerText||a.getAttribute('aria-label'),80)});
             }
           }
           if(url.hostname==='live.douyin.com'&&/^\/\d{5,24}$/.test(url.pathname)){
             const roomId=url.pathname.slice(1);
             if(!seen.has('r'+roomId)){seen.add('r'+roomId);live.push({roomId,liveUrl:'https://live.douyin.com/'+roomId,linkText:safe(a.innerText,80)});}
           }
         }catch{}
       }
       const meta=(selector)=>safe(document.querySelector(selector)?.content,170);
       return {title:safe(document.title,110),bodyExcerpt:body,
         metaDescription:meta('meta[name="description"]'),ogDescription:meta('meta[property="og:description"]'),
         canonical:safe(document.querySelector('link[rel="canonical"]')?.href,180),
         userLinks:user.slice(0,12),liveRoomLinks:live.slice(0,12),
         htmlLength:document.documentElement?.outerHTML.length??0};
     });
     row.pageTitle=doc.title;
     row.metaDescription=doc.metaDescription;
     row.ogDescription=doc.ogDescription;
     row.bodyExcerpt=doc.bodyExcerpt;
     row.canonical=doc.canonical;
     row.htmlLength=doc.htmlLength;
     row.accountLinks=doc.userLinks;
     row.liveRoomLinks=doc.liveRoomLinks;
     const sign=(doc.title+' '+doc.bodyExcerpt+' '+doc.metaDescription).toLowerCase();
     if(/验证码|安全验证|滑块|captcha|verify you are human|访问频繁|异常访问/.test(sign)){
       row.pageStatus='CHALLENGE';
       row.reason='VISIBLE_SECURITY_CHALLENGE';
     }else if(/请先登录|登录后继续|扫码登录/.test(sign)&&doc.userLinks.length===0){
       row.pageStatus='LOGIN_REQUIRED';
       row.reason='GUEST_LOGIN_GATE';
     }else if(row.httpStatus!==200){
       row.pageStatus='HTTP_ERROR';row.reason='NON_200_PAGE';
     }else{
       row.pageStatus='PUBLIC_RENDERED';
       row.reason=doc.userLinks.length?'PUBLIC_PROFILE_LINKS_NEED_AUTHOR_IDENTITY_VALIDATION':'NO_VERIFIED_ACCOUNT_IDENTIFIER';
     }
   }catch(e){row.pageStatus='NAVIGATION_ERROR';row.reason=String(e?.message||e).slice(0,160)}
   finally{await page.close().catch(()=>{});}
   result.candidates.push(row);
 }
 await context.close();
}finally{await browser.close();}
result.completedAt=new Date().toISOString();
result.counts=result.candidates.reduce((counts,x)=>{counts[x.pageStatus]=(counts[x.pageStatus]||0)+1;return counts;},{});
await fs.writeFile('tcl-douyin-public-discovery.json',JSON.stringify(result,null,2)+'\n');
console.log('TCL_DOUYIN_DISCOVERY_START');
console.log(JSON.stringify(result,null,2));
console.log('TCL_DOUYIN_DISCOVERY_END');
