/** Run against a fresh isolated QA server. Creates a disposable demo session, never a hosted event. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert/strict'),path=require('path'),os=require('os');
const out=process.env.LIVE_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'rn-master-ui-'));
fs.mkdirSync(out,{recursive:true});
if(!process.env.LIVE_QA_SESSION_FILE)throw Error('Set LIVE_QA_SESSION_FILE to the output from npm run qa:live');
(async()=>{
 const raw=fs.readFileSync(process.env.LIVE_QA_SESSION_FILE,'utf8');let qa=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
 assert.ok(['127.0.0.1','localhost'].includes(new URL(qa.base).hostname),'UI tests only run against isolated localhost QA');
 const created=await (await fetch(qa.base+'/api/live-run',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev'},body:JSON.stringify({slug:'live-demo',forceNew:true})})).json();
 if(!created.code)throw Error(JSON.stringify(created));
 qa={...qa,master:qa.base+'/x/live-demo/master#hk='+created.hostKey,present:qa.base+'/x/live-demo/present/'+created.code,joinA:qa.base+'/j/'+created.code};
 const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(qa.master);await page.locator('#master-next-label').filter({hasText:'First activity'}).waitFor();await page.waitForTimeout(1800);
 assert.equal(await page.locator('#master-advanced').isVisible(),false);
 await page.screenshot({path:path.join(out,'master-final.png'),fullPage:true});
 await page.locator('#btn-guide').click();await page.locator('#master-guide img').first().waitFor();assert.equal(await page.locator('#master-guide img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),true);await page.locator('#master-guide').screenshot({path:path.join(out,'guide-final.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#master-guide').isVisible(),false);
 const next=async(label)=>{await page.waitForFunction(l=>document.querySelector('#master-next-label').textContent===l&&!document.querySelector('#btn-next').disabled,label);await page.locator('#btn-next').click();};
 await page.locator('#btn-advanced').click();assert.equal(await page.locator('#master-auto-open-polls').isChecked(),true);await page.locator('#master-auto-open-polls').uncheck();await page.waitForTimeout(1000);await page.reload();await page.locator('#btn-advanced').click();assert.equal(await page.locator('#master-auto-open-polls').isChecked(),false);await page.locator('#master-auto-open-polls').check();await page.waitForTimeout(1000);await page.locator('#btn-advanced').click();
 await next('First activity');await page.waitForFunction(()=>document.querySelector('#master-next-label').textContent==='Tally votes');
 const contexts=[],phones=[];
 for(let i=0;i<8;i++){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const phone=await context.newPage();contexts.push(context);phones.push(phone);await phone.goto(qa.joinA);await phone.getByRole('button',{name:'Left',exact:true}).click();await phone.waitForFunction(()=>!document.querySelector('button.live-option')||document.body.innerText.includes('Left'));}
 await page.waitForFunction(()=>document.querySelector('#master-tip').textContent.startsWith('8 votes received'));console.log('PASS 8 separately joined phone browsers each voted');
 const identity=await phones[7].evaluate(()=>JSON.stringify(localStorage));await contexts[7].setOffline(true);await page.waitForTimeout(1300);await contexts[7].setOffline(false);await phones[7].reload();assert.equal(await phones[7].evaluate(()=>JSON.stringify(localStorage)),identity);console.log('PASS reconnect preserves participant identity and vote');
 const present=await browser.newPage({viewport:{width:1920,height:1080}});await present.goto(qa.present);await present.locator('.live-option').first().waitFor();await present.waitForTimeout(1200);
 const control=async(action,extra={})=>{const res=await fetch(qa.base+'/api/live-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:created.code,hostKey:created.hostKey,action,...extra})});assert.equal(res.status,200,await res.text());};
 const metrics=async()=>present.evaluate(()=>{const main=document.querySelector('#live-main'),qr=document.querySelector('.live-dock img'),q=document.querySelector('.live-question');return {width:innerWidth,height:innerHeight,question:q?.getBoundingClientRect().height,qr:qr.getBoundingClientRect().width,overflowY:main.scrollHeight-main.clientHeight,overflowX:main.scrollWidth-main.clientWidth};});
 for(const width of [1920,3840,7680]){await present.setViewportSize({width,height:width*9/16});await present.waitForTimeout(250);const m=await metrics();assert.ok(m.overflowX<2);assert.ok(m.overflowY<2);console.log('PASS scale',m);}
 await present.setViewportSize({width:3840,height:2160});await present.waitForTimeout(500);const baseline=await metrics();
 await page.locator('#btn-size-up').click();await page.waitForFunction(()=>document.querySelector('#master-scale').textContent==='105%');await present.waitForFunction(w=>document.querySelector('.live-dock img').getBoundingClientRect().width>w,baseline.qr);
 await present.reload();await present.waitForFunction(w=>document.querySelector('.live-dock img')?.getBoundingClientRect().width>w,baseline.qr);console.log('PASS size change reaches presenter and survives refresh');
 await control('set-presenter-scale',{scale:150});await present.waitForTimeout(2200);console.log('150%',await metrics());await present.screenshot({path:path.join(out,'presenter-150.png')});
 await control('set-presenter-scale',{scale:100});await page.waitForFunction(()=>document.querySelector('#master-scale').textContent==='100%');
 await page.locator('.master-primary-actions').screenshot({path:path.join(out,'controls.png')});await page.locator('.master-size').screenshot({path:path.join(out,'size.png')});
 await page.screenshot({path:path.join(out,'master-poll-final.png'),fullPage:true});
 await page.locator('#btn-next').dblclick();await page.waitForFunction(()=>document.querySelector('#master-next-label').textContent==='Show results');await page.waitForTimeout(1800);
 assert.equal(await present.locator('.live-tally-bar').count(),0);console.log('PASS double click tallies once; results remain hidden');
 await next('Show results');await page.waitForFunction(()=>document.querySelector('#master-next-label').textContent==='Next activity');
 await next('Next activity');await page.waitForFunction(()=>document.querySelector('#master-next-label').textContent==='Start race');
 await page.locator('#btn-advanced').click();await page.getByLabel('Round length in seconds').fill('10');await page.getByRole('button',{name:'Apply timer',exact:true}).click();await page.waitForTimeout(800);await page.locator('#btn-advanced').click();
 await next('Start race');await page.waitForFunction(()=>document.querySelector('#master-next-label').textContent==='Race in progress');assert.equal(await page.locator('#btn-next').isDisabled(),true);
 await phones[0].screenshot({path:path.join(out,'phone-race.png')});await Promise.all(phones.map(p=>p.getByRole('button',{name:'Correct',exact:true}).click()));
 const lateContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const late=await lateContext.newPage();await late.goto(qa.joinA);await late.getByRole('button',{name:'Correct',exact:true}).click();
 console.log('PASS 8 phone browsers answered Fill and a ninth joined during the race and answered');
 await present.screenshot({path:path.join(out,'presenter-fill.png')});
 await page.waitForFunction(()=>document.querySelector('#master-next-label').textContent==='Next activity');console.log('PASS race Next waits for automatic finish');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'master-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('errors',errors);assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
