import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const start=html.indexOf('const productManagementView =');
const end=html.indexOf('      function renderProductManagement()',start);
assert.ok(start>0&&end>start);
let writes=[],message='',cancelled=0;
const ctx={normalizeAdminProductStatus:v=>v,productManagementSaveInFlight:false,productImageSaveInFlight:false,setProductManagementFeedback:m=>message=m,readPendingProductSave:()=>null,saveProductManagementPayload:async payload=>{writes.push(payload);return true;}};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const p={id:'p1',code:'A22',variety:'蔗香梨',grade:'22A',count:'6顆',productSeries:'精裝版',status:'上架'};
function check(filters,expected){ctx.filters=filters;vm.runInContext("Object.assign(productManagementView,{query:'',group:'',status:''},filters)",ctx);assert.equal(ctx.productMatchesManagementFilter(p),expected,JSON.stringify(filters));}
check({},true);check({query:'２２ａ'},true);check({query:'22A 精裝'},true);check({query:'禮盒'},false);check({query:'22A',group:'牛奶梨'},false);
for(const status of ['上架','僅後台販售','後台販售，允許超賣','停售'])check({status},status==='上架');
check({query:'不存在'},false);
// Reserve editing must never send price/photo/status or silently coerce an empty value to zero.
let input={value:'6'};
const family={dataset:{productId:'p1'},gradeReserveBase:3,querySelector:()=>input};
const button={closest:()=>family};
await ctx.saveProductGradeInventory(button);
assert.deepEqual(JSON.parse(JSON.stringify(writes)),[{productId:'p1',changes:[{field:'adminReservedStock',before:3,after:6,productId:'p1'}]}]);
for(const invalid of ['','-1','1.5','NaN']){writes=[];input.value=invalid;await ctx.saveProductGradeInventory(button);assert.equal(writes.length,0);assert.match(message,/整數/);}
ctx.cancelGradeInventoryEdit=()=>cancelled++;
input.value='3';writes=[];await ctx.saveProductGradeInventory(button);assert.equal(writes.length,0);assert.equal(cancelled,1);
ctx.productManagementSaveInFlight=true;input.value='9';await ctx.saveProductGradeInventory(button);assert.equal(writes.length,0);
assert.match(html,/card\.dataset\.shared !== 'true' \|\| change\.field !== 'adminReservedStock'/);
assert.match(html,/family\.gradeReserveBase = conflict\.current/);
console.log('PASS fullwidth/multi-term search, exact group/four-state filters, reserve-only CAS patch, empty/negative/fraction rejection, unchanged reserve and in-flight guards');
