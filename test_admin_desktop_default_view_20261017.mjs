import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(process.env.ADMIN_CANDIDATE_HTML || new URL('./index.html',import.meta.url),'utf8');
const a=html.indexOf('      function initializeAdminCardViewMode() {');
const b=html.indexOf('      function toggleAdminCardViewExpanded(',a);
assert.ok(a>=0&&b>a);
for(const desktop of [true,false])for(const saved of ['full','compact','list']){
 let applied;
 const c={window:{matchMedia:query=>{assert.equal(query,'(min-width: 768px)');return {matches:desktop};}},getSavedAdminCardViewMode:()=>saved,setAdminCardViewMode:(mode,options)=>{applied={mode,options};return true;}};
 vm.createContext(c);vm.runInContext(html.slice(a,b),c);assert.equal(c.initializeAdminCardViewMode(),true);
 assert.equal(applied.mode,desktop?'list':saved);
 assert.equal(applied.options.force,true);assert.equal(applied.options.persist,false);
}
console.log('PASS desktop initializes table; mobile keeps saved display preference; initialization does not rewrite preferences');
