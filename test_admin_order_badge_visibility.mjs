import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto,createHash} from 'node:crypto';import fs from 'node:fs';import vm from 'node:vm';
import {orderPushEventIds,visibleOrderNumbers,mountOrderBadgeVisibility} from './admin-order-badge.js';
function emitter(object={}){const listeners=new Map();return Object.assign(object,{addEventListener(n,fn){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(fn);},removeEventListener(n,fn){listeners.get(n)?.delete(fn);},fire(n,value={}){for(const fn of listeners.get(n)||[])fn(value);}});}
function fixture(){
 const rows=[],frames=[],sent=[];let ready=true,modal=false,covered=false,observer,controller;
 const doc=emitter({body:{},visibilityState:'visible',querySelector:()=>modal?{}:null,querySelectorAll:()=>rows,
 elementFromPoint(x,y){if(covered)return {};return rows.find(r=>r.visible&&r.isConnected&&x>=r.rect.left&&x<=r.rect.right&&y>=r.rect.top&&y<=r.rect.bottom)||null;}});
 const sw=emitter({controller:{postMessage:msg=>sent.push(msg)}});controller=sw.controller;
 const platform=emitter({document:doc,navigator:{serviceWorker:sw},crypto:webcrypto,innerWidth:390,innerHeight:600,getComputedStyle:r=>r.style,requestAnimationFrame:fn=>frames.push(fn),MutationObserver:class {constructor(fn){observer=fn;}observe(){}disconnect(){observer=()=>{};}}});
 function add(orderNo,top=50){const card={dataset:{orderNo},isConnected:true,visible:true,rect:{left:10,right:380,width:370,top,bottom:top+80,height:80},style:{visibility:'visible',display:'block',opacity:'1'},contains:node=>node===card,getClientRects:()=>card.visible?[card.rect]:[],getBoundingClientRect:()=>card.rect};rows.push(card);return card;}
 return {doc,platform,sw,rows,sent,add,ready:v=>ready=v,modal:v=>modal=v,covered:v=>covered=v,canView:()=>ready,
 mount(){return mountOrderBadgeVisibility({platform,canView:()=>ready});},mutate(){observer();},async flush(){for(const fn of frames.splice(0))await fn();},move(card,top){card.rect={...card.rect,top,bottom:top+80};doc.fire('scroll');},controller};
}
const hash=value=>createHash('sha256').update(value).digest('hex');
test('event IDs match existing GAS public/admin derivation, including Unicode order numbers',async()=>{
 for(const no of ['ORDER-001','訂單-20261030'])assert.deepEqual(await orderPushEventIds(no,webcrypto),[hash('public-new-order:'+no),hash('admin-create-order:'+no)]);
});
test('only actual visible rows enter acknowledgment; hidden, below-fold and removed rows are excluded',()=>{
 const f=fixture();f.add('A');f.add('B',700);f.add('C').visible=false;f.add('D').isConnected=false;f.add('E').style.visibility='hidden';assert.deepEqual(visibleOrderNumbers(f.doc,f.platform,f.canView),['A']);
});
test('authentication, background, other-page visibility and overlays keep badges',async()=>{
 for(const block of [f=>f.ready(false),f=>f.doc.visibilityState='hidden',f=>f.modal(true),f=>f.covered(true),f=>f.rows[0].visible=false]){const f=fixture();f.add('A');block(f);f.mount();await f.flush();assert.equal(f.sent.length,0);}
});
test('scrolling into view sends only the newly visible page rows',async()=>{
 const f=fixture();const a=f.add('A'),b=f.add('B',700);f.mount();await f.flush();assert.deepEqual(f.sent.at(-1).eventIds,await orderPushEventIds('A',webcrypto));
 f.move(a,-100);f.move(b,100);await f.flush();assert.deepEqual(f.sent.at(-1).eventIds,await orderPushEventIds('B',webcrypto));
});
test('filter/search/page changes use rendered rows, never all loaded orders',async()=>{
 const f=fixture();f.add('A');f.mount();await f.flush();f.rows.splice(0);f.add('C');f.mutate();await f.flush();assert.deepEqual(f.sent.at(-1).eventIds,await orderPushEventIds('C',webcrypto));
 f.rows.splice(0);f.mutate();await f.flush();assert.equal(f.sent.length,2);
});
test('returning to orders and background-resume checks current visibility',async()=>{
 const f=fixture();const card=f.add('A');card.visible=false;f.mount();await f.flush();assert.equal(f.sent.length,0);
 card.visible=true;f.mutate();await f.flush();assert.equal(f.sent.length,1);
 f.doc.visibilityState='hidden';f.doc.fire('visibilitychange');await f.flush();assert.equal(f.sent.length,1);
 f.doc.visibilityState='visible';f.doc.fire('visibilitychange');await f.flush();assert.equal(f.sent.length,2);
});
test('same screen avoids repeated hashes/messages but a new push forces recheck',async()=>{
 const f=fixture();f.add('A');f.mount();await f.flush();f.mutate();f.doc.fire('scroll');await f.flush();assert.equal(f.sent.length,1);
 f.sw.fire('message',{data:{type:'sanheyuan-order-push'}});await f.flush();assert.equal(f.sent.length,2);
});
test('service worker activation rechecks visible orders',async()=>{
 const f=fixture();f.add('A');f.sw.controller=null;f.mount();await f.flush();assert.equal(f.sent.length,0);f.sw.controller=f.controller;f.sw.fire('controllerchange');await f.flush();assert.equal(f.sent.length,1);
});
test('filter/session/visibility changing during hashing cannot acknowledge stale screen',async()=>{
 for(const change of [f=>f.ready(false),f=>f.doc.visibilityState='hidden',f=>f.rows.splice(0)]){
  const f=fixture();f.add('A');const pending=[];f.platform.crypto={subtle:{digest:(...args)=>new Promise(resolve=>pending.push(async()=>resolve(await webcrypto.subtle.digest(...args))))}};
  f.mount();const work=f.flush();change(f);await Promise.all(pending.map(fn=>fn()));await work;assert.equal(f.sent.length,0);
 }
});
test('no badge APIs or hashing failure does not interrupt order UI',async()=>{
 const f=fixture();f.add('A');f.platform.crypto={subtle:{digest:async()=>{throw Error('crypto');}}};f.mount();await f.flush();assert.equal(f.sent.length,0);
 const g=fixture();g.platform.crypto=null;assert.equal(g.mount(),undefined);
});
test('disconnect prevents queued scans',async()=>{const f=fixture();f.add('A');f.mount().disconnect();await f.flush();assert.equal(f.sent.length,0);});
test('partly visible rows require meaningful exposure and respect visual viewport',()=>{
 const f=fixture();f.add('A',590);assert.deepEqual(visibleOrderNumbers(f.doc,f.platform,f.canView),[]);f.move(f.rows[0],570);assert.deepEqual(visibleOrderNumbers(f.doc,f.platform,f.canView),['A']);
 f.platform.visualViewport={offsetTop:0,offsetLeft:0,width:390,height:500};assert.deepEqual(visibleOrderNumbers(f.doc,f.platform,f.canView),[]);
});
test('page integrates readiness guard, removes blanket-clear hooks and parses',()=>{
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');assert.match(html,/mountOrderBadgeVisibility\(\{canView: \(\) => adminInitialOrdersReady/);assert.doesNotMatch(html,/acknowledgeAdminOrderBadge|adminBadgeReads|sanheyuan-orders-viewed/);
 const badgeScript=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('mountOrderBadgeVisibility'));assert.ok(badgeScript);assert.doesNotMatch(badgeScript[1],/mountAdminPush/);
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/type="module"/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
});
