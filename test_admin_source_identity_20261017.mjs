import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(process.env.ADMIN_CANDIDATE_HTML||'index.html','utf8');
const start=html.indexOf('      function handleAdminListRowClick('),end=html.indexOf('      function handleAdminListRowKeydown(',start);
const c={};vm.createContext(c);vm.runInContext(html.slice(start,end),c);
assert.equal(typeof c.getAdminListSourceIdentity,'function');
for(const [order,name,title] of [
 [{orderSource:'管理端',createdBy:'建單管理員',lineDisplayName:'客人LINE',lastUpdatedBy:'另一位修改者'},'建單管理員','建立者：建單管理員'],
 [{orderSource:'管理員新增',createdBy:' Zoe '},'Zoe','建立者：Zoe'],
 [{orderSource:'管理端',createdBy:'',lastUpdatedBy:'不可冒充建立者',lineDisplayName:'不可冒充建立者'},'—','建立者：未記錄'],
 [{orderSource:'LINE表單',lineDisplayName:'下單客人',createdBy:'後台管理員'},'下單客人','LINE 名稱：下單客人'],
 [{orderSource:'LINE表單',createdBy:'不可替代客人名稱'},'—','LINE 名稱：未取得'],
 [{orderSource:'管理端',groupOrderId:'G1',createdBy:'團體建單人'},'團體建單人','建立者：團體建單人'],
 [{orderSource:'管理端',createdBy:'<img src=x onerror=alert(1)>'},'<img src=x onerror=alert(1)>','建立者：<img src=x onerror=alert(1)>']
]){const r=c.getAdminListSourceIdentity(order);assert.equal(r.name,name);assert.equal(r.title,title);}
assert.ok(html.includes('escapeHtml(listSourceIdentity.title)'));assert.ok(html.includes('escapeHtml(listSourceIdentity.name)'));
console.log('PASS source identity: recorded creator for admin, customer LINE for LINE orders, no last-modifier/current-user fallback, group creator, escaped output');
