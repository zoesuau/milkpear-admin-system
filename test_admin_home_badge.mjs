import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const sw = fs.readFileSync(new URL('./admin-push-sw.js', import.meta.url), 'utf8');
function fixture({unsupported=false, rejectBadge=false, failStorage=false, sharedCache=new Map()}={}) {
  const listeners={}, badges=[], notifications=[], messages=[], cache=sharedCache;
  let now=100;
  const cacheApi={put:async(k,v)=>cache.set(k,await v.text()),match:async k=>cache.has(k)?new Response(cache.get(k)):undefined};
  const context={URL, Response, Date:{now:()=>now}, caches:{open:async()=>{if(failStorage)throw Error('storage');return cacheApi;}}, self:{
    navigator:unsupported?{}:{setAppBadge:async(...args)=>{badges.push(['set',...args]);if(rejectBadge)throw Error('badge');},clearAppBadge:async()=>badges.push(['clear'])},
    registration:{scope:'https://admin.example/backend/',showNotification:async(...args)=>notifications.push(args)},
    addEventListener:(name,fn)=>listeners[name]=fn,
    clients:{matchAll:async()=>[{url:'https://admin.example/backend/',visibilityState:'visible',navigate:async()=>({focus(){}}),postMessage:x=>messages.push(x)}],openWindow:async()=>{}}
  }};
  vm.createContext(context);vm.runInContext(sw,context);
  async function fire(name,event){let work;listeners[name]({...event,waitUntil:p=>work=p});await work;}
  return {badges,notifications,messages,cache,context,listeners,now:n=>now=n,
    push:(id='a'.repeat(64))=>fire('push',{data:{json:()=>({eventId:id})}}),
    view:(readStartedAt,source={type:'window',url:'https://admin.example/backend/',visibilityState:'visible'})=>fire('message',{data:{type:'sanheyuan-orders-viewed',readStartedAt},source}),
    click:()=>fire('notificationclick',{notification:{close(){}}})};
}
test('push displays a numeric badge and keeps the system notification and foreground message',async()=>{
 const f=fixture();await f.push();assert.deepEqual(f.badges,[['set',1]]);assert.equal(f.notifications.length,1);assert.equal(f.messages.length,1);assert.equal(f.listeners.fetch,undefined);
});
test('successful later read clears; notification click alone does not',async()=>{
 const f=fixture();await f.push();await f.click();assert.equal(f.badges.length,1);f.now(200);await f.view(150);assert.deepEqual(f.badges,[['set',1],['clear']]);
});
test('push arriving during a read is retained; later read acknowledges it',async()=>{
 const f=fixture();await f.push();f.now(300);await f.push('b'.repeat(64));f.now(400);await f.view(200);assert.deepEqual(f.badges,[['set',1],['set',2],['set',1]]);await f.view(350);assert.equal(f.badges.at(-1)[0],'clear');
});
test('concurrent clear and new push finish with new badge',async()=>{
 const f=fixture();await f.push();f.now(300);await Promise.all([f.view(200),f.push('b'.repeat(64))]);assert.equal(f.badges.at(-1)[0],'set');
});
test('hidden, foreign-path and invalid acknowledgements cannot clear badge',async()=>{
 const f=fixture();await f.push();f.now(300);
 for(const source of [{type:'window',url:'https://admin.example/backend/',visibilityState:'hidden'},{type:'window',url:'https://admin.example/other/',visibilityState:'visible'},{type:'window',url:'https://evil.example/backend/',visibilityState:'visible'}])await f.view(200,source);
 for(const stamp of [0,NaN,Infinity,301,'200',100])await f.view(stamp);
 assert.ok(f.badges.every(call=>call[0]==='set' && call[1]===1));
});
test('badge unsupported/rejected and storage failure never suppress notifications',async()=>{
 for(const options of [{unsupported:true},{rejectBadge:true},{failStorage:true}]){const f=fixture(options);await f.push();assert.equal(f.notifications.length,1);assert.equal(f.messages.length,1);f.now(200);await f.view(150);}
});
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const helper=html.slice(html.indexOf('      const adminBadgeReads ='),html.indexOf('      async function fetchAdminOrdersFromGas'));
function pageFixture(){
 const messages=[],frames=[],ctx={Date,WeakMap,document:{visibilityState:'visible',getElementById:id=>id==='cards-container'?{getClientRects:()=>[{}]}:null},requestAnimationFrame:fn=>frames.push(fn),adminAuthBlocksDataLoad:false,sessionStorage:{getItem:()=> 'token'},ADMIN_LINE_SESSION_TOKEN_KEY:'session',navigator:{serviceWorker:{controller:{postMessage:v=>messages.push(v)}}}};
 vm.createContext(ctx);vm.runInContext(helper+'\nthis.stamp = orders => adminBadgeReads.set(orders, 150);',ctx);
 const orders=[];ctx.stamp(orders);
 return {ctx,orders,messages,run(){ctx.acknowledgeAdminOrderBadge(orders);frames.splice(0).forEach(fn=>fn());}};
}
test('only authenticated visible rendered orders acknowledge badge',()=>{
 const f=pageFixture();f.run();assert.equal(f.messages.length,1);
 for(const mutate of [f=>f.ctx.document.visibilityState='hidden',f=>f.ctx.adminAuthBlocksDataLoad=true,f=>f.orders.adminReadMeta={snapshotStale:true},f=>f.ctx.sessionStorage.getItem=()=>null,f=>f.ctx.document.getElementById=()=>({getClientRects:()=>[],classList:{contains:()=>true}}),f=>f.ctx.document.getElementById=id=>id==='adminAuthOverlay'?{classList:{contains:()=>false}}:{getClientRects:()=>[{}]}]){const f=pageFixture();mutate(f);f.run();assert.equal(f.messages.length,0);}
 const g=pageFixture();g.ctx.acknowledgeAdminOrderBadge([]);assert.equal(g.messages.length,0);
});
test('read wrapper stamps only successful non-stale arrays; render and unchanged sync are connected',()=>{
 assert.match(html,/if \(Array.isArray\(orders\) && !orders.adminReadMeta\?\.snapshotStale\) adminBadgeReads.set/);
 const render=html.slice(html.indexOf('      function renderAdminOrders('),html.indexOf('      function replaceAdminOrderLocally'));
 assert.equal((render.match(/acknowledgeAdminOrderBadge\(adminOrders\)/g)||[]).length,2);
 const sync=html.slice(html.indexOf('      async function runAdminLiveOrderSync()'),html.indexOf('      async function refreshAdminOrdersInBackground'));
 assert.match(sync,/acknowledgeAdminOrderBadge\(orders\);/);
});
test('all classic inline scripts parse',()=>{
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(!/type="module"/.test(m[1])&&m[2].trim())new vm.Script(m[2]);}
});

test('read wrapper records successful reads and ignores failed or stale responses',async()=>{
 const source=html.slice(html.indexOf('      const adminBadgeReads ='),html.indexOf('      async function fetchInitialAdminOrdersWithRecovery'));
 const ctx={Date,WeakMap,adminLoginOrderBootstrap:null,ADMIN_ORDER_SNAPSHOT_CLIENT_ENABLED:true,adminOrderWorkspaceComplete:true,createAdminDiagnosticRequestId:()=> 'id',performAdminOrderSnapshotFetch:async()=>ctx.result};
 vm.createContext(ctx);vm.runInContext(source+'\nthis.stampOf = orders => adminBadgeReads.get(orders);',ctx);
 ctx.result=[];const orders=await ctx.fetchAdminOrdersFromGas();assert.ok(ctx.stampOf(orders)>0);
 ctx.result=Object.assign([],{adminReadMeta:{snapshotStale:true}});assert.equal(ctx.stampOf(await ctx.fetchAdminOrdersFromGas()),undefined);
 ctx.result=null;assert.equal(await ctx.fetchAdminOrdersFromGas(),null);
});

test('distinct orders accumulate; retries do not count twice even after viewing',async()=>{
 const f=fixture();await f.push();await f.push();await f.push('b'.repeat(64));
 assert.deepEqual(f.badges,[['set',1],['set',1],['set',2]]);
 f.now(300);await f.view(200);assert.deepEqual(f.badges.at(-1),['clear']);
 await f.push();assert.deepEqual(f.badges.at(-1),['clear']);
 await f.push('c'.repeat(64));assert.deepEqual(f.badges.at(-1),['set',1]);
});
test('counts and deduplication survive service worker restarts',async()=>{
 const cache=new Map();const first=fixture({sharedCache:cache});await first.push();
 const second=fixture({sharedCache:cache});await second.push('b'.repeat(64));assert.deepEqual(second.badges.at(-1),['set',2]);
 second.now(300);await second.view(200);
 const third=fixture({sharedCache:cache});await third.push();assert.deepEqual(third.badges.at(-1),['clear']);
 await third.push('c'.repeat(64));assert.deepEqual(third.badges.at(-1),['set',1]);
});
test('concurrent distinct pushes accumulate without losing increments',async()=>{
 const f=fixture();await Promise.all(['a','b','c','a'].map(id=>f.push(id.repeat(64))));assert.deepEqual(f.badges.at(-1),['set',3]);
});
test('missing event ID cannot invent an order count',async()=>{
 const f=fixture();await f.push();await f.push('');await f.push('bad');assert.deepEqual(f.badges,[['set',1]]);assert.equal(f.notifications.length,3);
});
test('corrupt state is preserved and falls back to a generic alert',async()=>{
 const f=fixture();await f.push();const key=[...f.cache.keys()][0];f.cache.set(key,'invalid');
 await f.push('b'.repeat(64));assert.deepEqual(f.badges.at(-1),['set']);assert.equal(f.cache.get(key),'invalid');
 f.now(300);await f.view(200);assert.deepEqual(f.badges.at(-1),['set']);
});
test('storage failure produces an unnumbered alert while keeping notifications',async()=>{
 const f=fixture({failStorage:true});await f.push();assert.deepEqual(f.badges,[['set']]);assert.equal(f.notifications.length,1);
});
