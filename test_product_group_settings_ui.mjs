import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const core=html.slice(html.indexOf('// Shared by the Apps Script authority'),html.indexOf('      function groupShippingMessage'));
const fn=name=>{const m=html.match(new RegExp('      (?:async )?function '+name+'\\([\\s\\S]*?\n      \\}'));assert.ok(m,name);return m[0];};
function fixture(){
 const elements=Object.fromEntries(['productGroupName','productGroupSpecs','groupShippingEnabled','groupFreeBoxes','groupOffshoreEnabled','groupOffshoreFullFee','productGroupFeedback','productGroupModal'].map(id=>[id,{value:'',checked:false,textContent:'',classList:{remove(){}}}]));
 const fees=[{value:'150'},{value:'250'}],off=[{value:'300'},{value:'350'}],controls=[{disabled:false},{disabled:true}];
 elements.productGroupName.value='測試群組';elements.productGroupSpecs.value='測試小盒\n測試大盒';elements.groupShippingEnabled.checked=true;elements.groupFreeBoxes.value='3';
 let requests=[],deferred,failed=false;let lastMessage='';
 const c=vm.createContext({document:{getElementById:id=>elements[id],querySelectorAll:selector=>selector==='[data-group-fee]'?fees:selector==='[data-group-offshore-fee]'?off:controls},sessionStorage:{getItem:()=> 'fixture-token'},ADMIN_LINE_SESSION_TOKEN_KEY:'fixture',GAS_ORDERS_API_URL:'https://fixture.invalid',productGroupSaveInFlight:false,productManagementSaveInFlight:false,productImageSaveInFlight:false,adminProductCatalogMutationEpoch:0,productGroupBaseRevision:2,adminSiteSettings:{},adminProductCatalog:[],adminProductCatalogVersion:'before',confirm:()=>true,renderProductManagement:()=>{},setProductManagementFeedback:message=>lastMessage=message,fetchWithTimeout:async(_url,options)=>{
  const req=JSON.parse(options.body);requests.push(req);if(deferred)await deferred;if(failed)throw Error('network');return {ok:true,json:async()=>({ok:true,action:req.action,groupName:req.groupName || req.groupSettings.name,siteSettings:{productGroups:[],productGroupSettings:req.groupSettings?[{...req.groupSettings,revision:3}]:[]},products:[{id:'kept'}],catalogVersion:'after'})};
 }});
 vm.runInContext(core+'\n'+['readProductGroupSettingsForm','productGroupErrorMessage','saveProductGroup','getProductGroupConfig','deleteProductGroup'].map(fn).join('\n'),c);
 return {c,elements,fees,controls,requests,get message(){return lastMessage;},setDeferred:p=>deferred=p,fail:()=>failed=true};
}
let f=fixture();assert.deepEqual(JSON.parse(JSON.stringify(f.c.readProductGroupSettingsForm().shipping)),{boxes:3,fees:[150,250],offshore:null});
f.elements.groupShippingEnabled.checked=false;f.elements.productGroupSpecs.value='';assert.equal(f.c.readProductGroupSettingsForm().shipping,null);assert.equal(f.c.readProductGroupSettingsForm().specs.length,0,'draft needs no invented specifications');
f=fixture();f.fees[0].value='';assert.equal(f.c.readProductGroupSettingsForm().shipping.fees[0],null,'empty is not free shipping');f.fees[0].value='0';assert.equal(f.c.readProductGroupSettingsForm().shipping.fees[0],0);
f.elements.productGroupSpecs.value='重複\n重複';await f.c.saveProductGroup();assert.equal(f.requests.length,0);assert.match(f.elements.productGroupFeedback.textContent,/不可重複/);
f=fixture();let release;f.setDeferred(new Promise(resolve=>release=resolve));const first=f.c.saveProductGroup();assert.equal(f.controls[0].disabled,true);await f.c.saveProductGroup();assert.equal(f.requests.length,1);release();await first;
assert.equal(f.requests[0].action,'adminSaveProductGroup');assert.equal(f.requests[0].expectedRevision,2);assert.equal(f.c.adminProductCatalogVersion,'after');assert.equal(f.c.adminProductCatalog[0].id,'kept');assert.equal(f.controls[0].disabled,false);assert.equal(f.controls[1].disabled,true);assert.match(f.message,/已儲存/);
f=fixture();f.fail();await f.c.saveProductGroup();assert.match(f.elements.productGroupFeedback.textContent,/尚未確認/);assert.equal(f.elements.productGroupName.value,'測試群組');assert.equal(f.elements.productGroupSpecs.value,'測試小盒\n測試大盒');assert.equal(f.c.productGroupSaveInFlight,false);await f.c.saveProductGroup();assert.equal(JSON.stringify(f.requests[0]),JSON.stringify(f.requests[1]),'uncertain retry retains identical intended update');
console.log('PASS actual group form: optional drafts, null versus zero fee, validation, singleflight, revision/catalog refresh, disabled-state restoration and retained retry inputs; browser layout verified separately');

f=fixture();f.c.confirm=()=>false;await f.c.deleteProductGroup('測試群組');assert.equal(f.requests.length,0);
f=fixture();f.c.adminProductCatalog=[{variety:'測試群組'}];await f.c.deleteProductGroup('測試群組');assert.equal(f.requests.length,0);assert.match(f.message,/仍有商品/);
f=fixture();f.c.adminSiteSettings={productGroupSettings:[{name:'測試群組',revision:7}]};await f.c.deleteProductGroup('測試群組');assert.equal(f.requests[0].expectedRevision,7);assert.equal(f.requests[0].action,'adminDeleteProductGroup');assert.match(f.message,/已刪除/);assert.equal(f.c.productGroupSaveInFlight,false);
f=fixture();f.fail();await f.c.deleteProductGroup('測試群組');assert.match(f.message,/尚未確認/);assert.equal(f.controls[0].disabled,false);
console.log('PASS deletion UI: cancel, nonempty guard, revision request, successful refresh and uncertain-response recovery');
