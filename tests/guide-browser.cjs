const {chromium,webkit}=require('playwright');
const {readFile}=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../docs');
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
  try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}
});
async function check(engine,mobile=false){
  const browser=await engine.launch({headless:true});
  try{
    const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{viewport:{width:1280,height:900}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}/`;
    await page.goto(url);await page.waitForSelector('#guide-dialog[open]');
    assert.equal(await page.locator('#guide-title').innerText(),'Apri il tuo PDF');
    assert.equal(await page.locator('#guide-back').isDisabled(),true);
    await page.click('#guide-next');assert.equal(await page.locator('#guide-title').innerText(),'Scrivi e correggi');
    await page.click('#guide-back');assert.equal(await page.locator('#guide-title').innerText(),'Apri il tuo PDF');
    await page.click('#guide-skip');assert.equal(await page.evaluate(()=>localStorage.getItem('edo-guide-v1-seen')),'true');
    await page.reload();await page.waitForFunction(()=>window.pdfEditor);
    assert.equal(await page.locator('#guide-dialog').isVisible(),false,'skip persists after reload');
    await page.click('#help');await page.waitForSelector('#guide-dialog[open]');
    for(let i=0;i<5;i++)await page.click('#guide-next');
    assert.equal(await page.locator('#guide-progress').innerText(),'Passaggio 6 di 6');
    await page.click('#guide-install');await page.waitForSelector('#install-dialog[open]');
    assert.equal(await page.locator('#guide-dialog').isVisible(),false,'only one modal at a time');
    const selected=await page.locator('[data-platform][aria-pressed="true"]').getAttribute('data-platform');
    assert.equal(selected,mobile?'ios':'desktop');
    await page.click('[data-platform="ios"]');assert.ok((await page.locator('#install-steps').innerText()).includes('Aggiungi alla schermata Home'));
    assert.equal(await page.locator('#install-native').isVisible(),false);
    await page.click('[data-platform="android"]');assert.ok((await page.locator('#install-steps').innerText()).includes('Installa app'));
    await page.keyboard.press('Escape');await page.waitForSelector('#guide-dialog[open]');assert.equal(await page.locator('#guide-progress').innerText(),'Passaggio 6 di 6');
    await page.click('#guide-next');assert.equal(await page.locator('#guide-dialog').isVisible(),false);
    await page.click('#welcome-install');await page.waitForSelector('#install-dialog[open]');await page.click('#install-close');
    // Exercise the optional browser prompt without installing on the test host.
    await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.promptCalls=(window.promptCalls||0)+1;};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e);});
    await page.click('#add-home');await page.click('[data-platform="android"]');await page.click('#install-native');
    await page.waitForFunction(()=>document.getElementById('install-note').textContent.includes('più tardi'));
    assert.equal(await page.evaluate(()=>window.promptCalls),1);await page.click('#install-close');
    await page.click('#help');for(let i=0;i<5;i++)await page.click('#guide-next');await page.click('#guide-demo');
    await page.waitForFunction(()=>window.pdfEditor.state.pages.length===2&&window.pdfEditor.state.pages[0].elements.length>0&&document.getElementById('busy').hidden);
    const state=await page.evaluate(()=>JSON.stringify(window.pdfEditor.state.pages));
    await page.click('#help');for(let i=0;i<5;i++)await page.click('#guide-next');
    assert.equal(await page.locator('#guide-demo').isVisible(),false,'help never replaces an open document with the demo');
    await page.click('#guide-details');await page.waitForSelector('#info-dialog[open]');await page.click('#close-info');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.pdfEditor.state.pages)),state);
    await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await page.locator('#add-home').isVisible(),false);
    assert.equal(await page.locator('#welcome-install').isVisible(),false);
    // Manifest paths work under a GitHub Pages project directory as well.
    const manifest=await (await page.request.get(url+'manifest.webmanifest')).json();
    assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
    for(const icon of manifest.icons.filter(i=>i.type==='image/png')) {
      const response=await page.request.get(url+icon.src.replace('./',''));assert.equal(response.status(),200);
      const bytes=await response.body(),size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
    }
    assert.deepEqual(errors,[]);await context.close();
    const blocked=await browser.newContext({viewport:{width:320,height:568}});
    await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage unavailable','SecurityError');}});});
    const small=await blocked.newPage();await small.goto(url);await small.waitForSelector('#guide-dialog[open]');
    for(let i=0;i<5;i++)await small.click('#guide-next');
    assert.equal(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'small screen has no horizontal overflow');
    await small.click('#guide-next');await small.click('#help');await small.keyboard.press('Escape');await blocked.close();
    console.log(`${engine.name()} ${mobile?'mobile':'desktop'}: first visit, skip, reopen, six steps, installation guides, prompt dismissal, document preservation, icons, blocked storage passed`);
  }finally{await browser.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await check(chromium);await check(webkit,true);}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
