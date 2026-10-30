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
    view:(eventIds,source={type:'window',url:'https://admin.example/backend/',visibilityState:'visible'})=>fire('message',{data:{type:'sanheyuan-visible-orders-viewed',eventIds},source}),
    legacy:readStartedAt=>fire('message',{data:{type:'sanheyuan-orders-viewed',readStartedAt},source:{type:'window',url:'https://admin.example/backend/',visibilityState:'visible'}}),
    click:()=>fire('notificationclick',{notification:{close(){}}})};
}

const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
test('viewing one matching order deducts only that event; hidden orders stay unread',async()=>{
 const f=fixture();await f.push(A);await f.push(B);await f.push(C);await f.view([B]);assert.deepEqual(f.badges.at(-1),['set',2]);
 await f.view([B]);assert.deepEqual(f.badges.at(-1),['set',2]);await f.view([A]);assert.deepEqual(f.badges.at(-1),['set',1]);await f.view([C]);assert.deepEqual(f.badges.at(-1),['clear']);
});
test('old load-success messages cannot clear unseen notifications',async()=>{
 const f=fixture();await f.push(A);await f.push(B);f.now(300);await f.legacy(200);assert.deepEqual(f.badges.at(-1),['set',2]);
});
test('empty, unrelated and invalid IDs cannot decrement badge',async()=>{
 const f=fixture();await f.push(A);
 for(const ids of [[],[B],null,'all',['invalid'],[A,'bad'],Array(201).fill(A)])await f.view(ids);
 assert.ok(f.badges.every(call=>call[0]==='set'&&call[1]===1));
});
test('hidden windows and another origin/path cannot acknowledge',async()=>{
 const f=fixture();await f.push(A);
 for(const source of [{type:'window',url:'https://admin.example/backend/',visibilityState:'hidden'},{type:'window',url:'https://evil.example/backend/',visibilityState:'visible'},{type:'window',url:'https://admin.example/other/',visibilityState:'visible'}])await f.view([A],source);
 assert.deepEqual(f.badges,[['set',1]]);
});
test('concurrent unseen notification survives acknowledgment of visible order',async()=>{
 const f=fixture();await f.push(A);await Promise.all([f.view([A]),f.push(B)]);assert.deepEqual(f.badges.at(-1),['set',1]);
});
test('duplicates do not recount after viewing, including after worker restart',async()=>{
 const cache=new Map(),f=fixture({sharedCache:cache});await f.push(A);await f.push(A);await f.push(B);await f.view([A]);
 const g=fixture({sharedCache:cache});await g.push(A);assert.deepEqual(g.badges.at(-1),['set',1]);await g.push(C);assert.deepEqual(g.badges.at(-1),['set',2]);
});
test('existing v2 unread state is preserved on upgrade and matched by ID',async()=>{
 const f=fixture();f.cache.set('https://admin.example/backend/__home_badge_state__',JSON.stringify({version:2,events:[{id:A,receivedAt:10,unread:true},{id:B,receivedAt:20,unread:true}]}));
 await f.view([A]);assert.deepEqual(f.badges.at(-1),['set',1]);
});
test('clicking notification only opens backend, without clearing badge',async()=>{
 const f=fixture();await f.push(A);await f.click();assert.deepEqual(f.badges,[['set',1]]);
});
test('visible notifications and foreground messages survive unsupported/rejected badge or failed storage',async()=>{
 for(const options of [{unsupported:true},{rejectBadge:true},{failStorage:true}]){const f=fixture(options);await f.push(A);assert.equal(f.notifications.length,1);assert.equal(f.messages.length,1);await f.view([A]);}
});
test('corrupt storage preserves notifications and does not invent a count',async()=>{
 const f=fixture();await f.push(A);const key=[...f.cache.keys()][0];f.cache.set(key,'invalid');await f.push(B);assert.deepEqual(f.badges.at(-1),['set']);await f.view([A,B]);assert.equal(f.cache.get(key),'invalid');
});
test('malformed payloads do not count as real orders or suppress notification',async()=>{
 const f=fixture();await f.push(A);await f.push('');assert.deepEqual(f.badges,[['set',1]]);assert.equal(f.notifications.length,2);assert.equal(f.listeners.fetch,undefined);
});
