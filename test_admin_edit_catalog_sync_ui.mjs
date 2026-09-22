import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const file=process.env.ADMIN_CANDIDATE_HTML || new URL('./index.html',import.meta.url);
const html=readFileSync(file,'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const source=part('      function buildAdminContentProductRow','      function getAdminContentEditorItems')+
 part(html.includes('      let adminContentCatalogSyncRunning') ? '      let adminContentCatalogSyncRunning' : '      async function enterAdminContentEdit','      function addAdminContentProductRow');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();
 await page.setContent('<div class="card" data-order-no="fixture"><button class="admin-content-edit-trigger"></button><div class="admin-content-editor-host"></div></div>');
 await page.addScriptTag({content:`
 let adminProductsReady=true, adminProductCatalog=[{code:'NG'},{code:'14A',stopped:true}], adminProductCatalogReadFailed=false;
 const order={orderNo:'fixture',orderStatus:'已安排出貨日期',itemsSummary:'fixture',recipientName:'原姓名',orderSource:'管理端'};
 const getLatestAdminOrder=()=>order, ensureAdminCardExpandedForEditing=()=>{},scrollAdminOrderCardIntoView=()=>{},updateAdminContentPreview=()=>{};
 const parseAdminEditableItemsSummary=()=>[{code:'NG',qty:1}],parseAdminDisplayItemsSummary=()=>[];
 const getProductByCode=code=>adminProductCatalog.find(p=>p.code===code),getDefaultAdminProduct=()=>adminProductCatalog[0];
 const escapeHtml=x=>String(x??''),buildAdminContentPreviewHtml=()=>'',buildLockedHistoricalProductRow=()=>'';
 const buildAdminProductOptionsHtml=code=>adminProductCatalog.filter(p=>!p.stopped||p.code===code).map(p=>'<option value="'+p.code+'" '+(p.code===code?'selected':'')+'>'+p.code+'</option>').join('');
 let reads=0, resolveRead, lastOptions, timers=[];
 window.setTimeout=(fn,ms)=>{timers.push({fn,ms});};
 const fetchAdminProductCatalogFromGas=opts=>{reads++;lastOptions=opts;return new Promise(resolve=>resolveRead=resolve);};
 ${source}
 `});
 await page.evaluate(()=>{void enterAdminContentEdit(document.querySelector('.card'));});
 assert.equal(await page.locator('.admin-content-editor').count(),1,'editor opens while catalog request is unresolved');
 assert.equal(await page.evaluate(()=>reads),1,'opening an editor must check for external product changes even with a cached catalog');
 assert.equal(await page.locator('.admin-content-product-code option[value="14A"]').count(),0);
 await page.locator('.admin-content-recipient-name').fill('草稿姓名');
 await page.locator('.admin-content-product-qty').fill('3');
 await page.evaluate(()=>{adminProductCatalog[1].stopped=false;refreshAdminContentProductOptions();});
 assert.equal(await page.locator('.admin-content-product-code option[value="14A"]').count(),1,'management refresh updates the already-open editor');
 assert.equal(await page.locator('.admin-content-recipient-name').inputValue(),'草稿姓名');
 assert.equal(await page.locator('.admin-content-product-qty').inputValue(),'3');
 assert.equal(await page.locator('.admin-content-product-code').inputValue(),'NG');
 await page.evaluate(()=>startAdminContentCatalogSync());
 assert.deepEqual(await page.evaluate(()=>({reads,operations:lastOptions.includeOperations})),{reads:1,operations:false});
 await page.evaluate(()=>{resolveRead(adminProductCatalog);});
 assert.equal(await page.evaluate(()=>timers[0].ms),3000);
 // Removed selections must not silently change to the first available SKU.
 await page.evaluate(()=>{adminProductCatalog=adminProductCatalog.filter(p=>p.code!=='NG');refreshAdminContentProductOptions();});
 assert.equal(await page.locator('.admin-content-product-code').inputValue(),'');
 assert.equal(await page.locator('.admin-content-product-qty').inputValue(),'3');
 // Cold entry must allow typing immediately and hydrate only product fields.
 await page.evaluate(()=>{document.querySelector('.card').dataset.contentEditing='false';adminProductCatalog=[];adminProductsReady=false;void enterAdminContentEdit(document.querySelector('.card'));});
 await page.locator('.admin-content-recipient-name').fill('讀取中輸入');
 assert.equal(await page.locator('.admin-content-editor').getAttribute('data-catalog-pending'),'true');
 await page.evaluate(()=>{adminProductCatalog=[{code:'NG'},{code:'14A'}];refreshAdminContentProductOptions();});
 assert.equal(await page.locator('.admin-content-recipient-name').inputValue(),'讀取中輸入');
 assert.equal(await page.locator('.admin-content-product-code option[value="14A"]').count(),1);
 assert.equal(await page.locator('.admin-content-editor').getAttribute('data-catalog-pending'),'false');
 await page.evaluate(()=>{timers.shift().fn();});
 await page.evaluate(()=>{adminProductCatalogReadFailed=true;resolveRead(null);});
 assert.match(await page.locator('.admin-content-catalog-status').innerText(),/更新失敗/);
 assert.equal(await page.evaluate(()=>timers[0].ms),15000);
 assert.equal(await page.locator('.admin-content-recipient-name').inputValue(),'讀取中輸入');
 const count=await page.evaluate(()=>reads);
 await page.evaluate(()=>{document.querySelector('.card').remove();timers.shift().fn();});
 assert.equal(await page.evaluate(()=>reads),count,'closing the editor stops future catalog requests');
 await page.evaluate(()=>{
   document.body.innerHTML='<div class="card" data-order-no="fixture"><div class="admin-content-editor-host"></div></div>';
   Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
   void enterAdminContentEdit(document.querySelector('.card'));
 });
 assert.equal(await page.evaluate(()=>reads),count,'offline editor must not issue network requests');
 await page.evaluate(()=>{document.querySelector('.card').remove();timers.shift().fn();});

 assert.match(html,/if \(ready === true\) refreshAdminContentProductOptions\(\)/,'all successful catalog commits refresh editors');
 assert.match(html,/editor.dataset.catalogPending === "true"[\s\S]*?商品仍在讀取中/,'cold catalog cannot be saved before hydration');
 console.log('PASS editor opens before network; external catalog changes; lean single-flight polling; draft preservation; cold hydration; removed SKU; failure retry; cancellation');
} finally {await browser.close();}
