import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const html = process.env.PENDING_QUERY_TEST_BASE === 'HEAD'
  ? execFileSync('git',['show','HEAD:index.html'],{cwd:new URL('.',import.meta.url),encoding:'utf8',maxBuffer:4*1024*1024})
  : readFileSync(new URL('./index.html',import.meta.url),'utf8');
function part(a,b) {
  const start=html.indexOf(a), end=html.indexOf(b,start+a.length);
  assert.ok(start>=0 && end>start,a);
  return html.slice(start,end);
}
const source = part('      function clearAdminAuthSession()', '      function base64UrlEncode') +
  part('      let adminSessionVerifiedAt','      function adminBrowserIsOffline') +
  part('      function setAdminNetworkRecoveryPending','      function markAdminSessionVerified') +
  part('      let adminAuthCompletionPromise', '      // ADMIN_SETTINGS_CONTROLS_START');
const start=1000, end=start+60000;
const missing={ok:false,action:'adminAuth',error:'ADMIN_AUTH_PENDING',state:'pending',retryAfterMs:1500};
const confirmed={ok:true,action:'adminAuth',allowed:true,adminSessionToken:'fixture-session'};
function fixture({direct=true, reply=()=>missing, bodyLookup=false}={}) {
  const recovery={startedAt:start,deadline:end,nonce:'nonce-A',diagnosticRequestId:'auth-fixture'};
  if (bodyLookup) recovery.bodyResultCheckUsed=false;
  const saved=JSON.stringify(recovery);
  const data=new Map([['state','state-A'],['nonce','nonce-A'],['pkce','verifier-A'],
    ['nonce:submitted','nonce-A'],['nonce:recovery',saved]]);
  const calls=[], overlays=[], diagnostics=[];
  const clock={now:start};
  function reload() {
    const retry={dataset:{}};
    const location={origin:'https://fixture.invalid',pathname:'/admin',hash:'',search:'?state=state-A&code=unreplayed'};
    const c={
      URLSearchParams,Date:class extends Date {static now(){return clock.now;}},
      sessionStorage:{getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key)},
      ADMIN_LINE_STATE_KEY:'state',ADMIN_LINE_NONCE_KEY:'nonce',ADMIN_LINE_CODE_VERIFIER_KEY:'pkce',ADMIN_LINE_SESSION_TOKEN_KEY:'token',
      ADMIN_DISPLAY_NAME_KEY:'display',ADMIN_AUTH_REDIRECT_URI:'https://fixture.invalid/admin',GAS_ORDERS_API_URL:'fixture',
      window:{location,AdminDirectResponse:{enabledFor:()=>direct},setTimeout:(resolve,ms)=>{clock.now+=ms;queueMicrotask(resolve);}},
      history:{replaceState:()=>{location.search='';}},document:{title:'',getElementById:id=>id==='adminAuthRetryBtn'?retry:null},
      adminAuthNavigationPending:false,adminAuthBlocksDataLoad:true,adminOrderMutationRevision:0,adminLoginOrderBootstrap:null,
      adminBrowserIsOffline:()=>false,getAdminOrderPageFilter:()=>({page:1,pageSize:20}),isAdminStartupWorkspaceEnabled:()=>false,
      createAdminDiagnosticRequestId:action=>action+'_fixture',publishAdminAuthDiagnostic:diag=>diagnostics.push(diag.errorCode),
      showAdminAuthOverlay:message=>overlays.push(message),getAdminAuthErrorMessage:code=>code,isAdminNetworkRecoveryError:()=>false,
      fetchAdminRecoverableResponse:async(url,options,timeout)=>{
        const request=JSON.parse(options.body);
        assert.equal(request.resultOnly,true);assert.equal(Object.hasOwn(request,'code'),false);
        assert.equal(request.nonce,'nonce-A');assert.equal(request.codeVerifier,'verifier-A');
        assert.equal(request.diagnosticRequestId,recovery.diagnosticRequestId);
        assert.ok(clock.now<end && timeout>0 && timeout<=end-clock.now);
        calls.push({at:clock.now,timeout});
        const payload=reply(clock.now);
        return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>payload,text:async()=>JSON.stringify(payload)};
      },
    };
    vm.runInNewContext(source,c);
    return c.initAdminAuth();
  }
  return {reload,calls,data,clock,saved,diagnostics,overlays};
}
test('ordinary direct result-only reloads use original deadline even if the nonce claim is still missing',async()=>{
  const f=fixture();
  for(const t of [start,start+1500,end-1]){
    f.clock.now=t;
    assert.equal(await f.reload(),false);
    assert.equal(f.data.get('nonce:recovery'),f.saved);
    assert.equal(f.data.get('pkce'),'verifier-A');
    assert.equal(f.data.has('token'),false);
    assert.match(f.overlays.at(-1),/仍在處理中/);
  }
  f.clock.now=end;assert.equal(await f.reload(),false);
  assert.deepEqual(f.calls.map(x=>x.timeout),[60000,58500,1]);
  assert.equal(f.data.has('nonce:recovery'),false);
  assert.equal(f.data.has('pkce'),false);
  assert.equal(f.diagnostics.at(-1),'ADMIN_AUTH_RECOVERY_EXPIRED');
});
test('a claim becoming available later returns the original owner result by result-only request',async()=>{
  const f=fixture({reply:now=>now<start+1500?missing:confirmed});
  assert.equal(await f.reload(),false);
  assert.equal(f.data.get('nonce:recovery'),f.saved);
  f.clock.now+=1500;
  assert.equal(await f.reload(),true);
  assert.equal(f.calls.length,2);assert.equal(f.data.get('token'),confirmed.adminSessionToken);
  assert.equal(f.data.has('nonce:recovery'),false);
});
test('compatibility result-only polling ends at the initial 60-second deadline under persistent PENDING',async()=>{
  const f=fixture({direct:false});
  assert.equal(await f.reload(),false);
  assert.equal(f.clock.now,end);
  assert.equal(f.calls.length,40);assert.equal(f.calls.at(-1).at,end-1500);
  assert.equal(f.diagnostics.at(-1),'ADMIN_AUTH_RECOVERY_EXPIRED');assert.equal(f.data.has('token'),false);
});
test('a missing claim uses up the sole deferred body-loss query and no subsequent receipt lookup is offered',async()=>{
  const f=fixture({bodyLookup:true});
  assert.equal(await f.reload(),false);assert.equal(f.calls.length,1);
  assert.equal(f.diagnostics.at(-1),'ADMIN_AUTH_RESULT_UNAVAILABLE');
  assert.equal(f.data.has('nonce:recovery'),false);
  assert.equal(f.data.has('pkce'),false);assert.equal(f.data.has('token'),false);
  assert.match(f.overlays.at(-1),/重新登入 LINE/);
  f.clock.now+=1500;assert.equal(await f.reload(),false);assert.equal(f.calls.length,1);
});
