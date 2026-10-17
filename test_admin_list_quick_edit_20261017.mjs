import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(process.env.ADMIN_CANDIDATE_HTML||'index.html','utf8');
const a=html.indexOf('      function handleAdminListRowClick('),b=html.indexOf('      function handleAdminListRowKeydown(',a);assert.ok(a>=0&&b>a);
function fixture(){
 let now=1000,expanded=0,toggled=0,focus=0,pickers=0,scrolls=0;
 const state=new Set(),details={open:false},status={innerText:''};
 let panel=null,restored=0,refreshed=0;
 const editor={dataset:{baselineDate:'',baselinePayment:'bank_unpaid'},before(){},closest:()=>card};
 const input={value:'',disabled:false,setAttribute(){},closest:()=>editor,focus(){focus++;},showPicker(){pickers++;},scrollIntoView(){scrolls++;}};
 function element(){return {dataset:{},children:[],className:'',setAttribute(){},append(child){this.children.push(child);},addEventListener(name,fn){this[name]=fn;},remove(){panel=null;}};}

 const cell={classList:{add(){},remove(){}},append:node=>{panel=node;},focus(){}};
 const card={dataset:{},dirty:false,classList:{contains:x=>state.has(x)},append:node=>{panel=node;},querySelector:s=>s.includes('admin-list-inline-editor')?panel:s.includes('save')?(card.dirty?{}:null):s.includes('admin-card-list-')?cell:input};
 const other={dirty:false,querySelector:()=>other.dirty?{}:null};
 const c={Date:{now:()=>now},document:{querySelectorAll:()=>[card,other],getElementById:()=>status,createComment:()=>({replaceWith(){restored++;}}),createElement:element},adminCardViewMode:'list',adminBatchProcessing:false,adminCreateOrderSubmitting:false,
 adminWorkflowIsDirty:()=>card.dirty,adminWorkflowRefreshDirtyState:()=>{refreshed++;card.dirty=false;},adminCardHasBlockingWork:node=>node===card&&!!panel,expandAdminCardFromListRow:()=>{expanded++;state.add('is-view-expanded');return true;},toggleAdminCardViewExpanded:()=>{toggled++;state.delete('is-view-expanded');return true;}};
 vm.createContext(c);vm.runInContext(html.slice(a,b),c);
 const event=(interactive=false,statusTarget=true,summaryTarget=statusTarget)=>({key:'Enter',preventDefault(){},stopPropagation(){},target:{closest:s=>s.includes('button,')?interactive:s.includes('.row-top')?summaryTarget:statusTarget}});
 return {c,card,other,input,status,details,event,panel:()=>panel,editor,restored:()=>restored,refreshed:()=>refreshed,tick:()=>now+=100,stats:()=>({expanded,toggled,focus,pickers,scrolls}),state};
}
let f=fixture();assert.equal(f.c.handleAdminListRowClick(f.event(),f.card),false);f.tick();assert.equal(f.c.handleAdminListRowClick(f.event(),f.card),true);assert.equal(f.stats().expanded,1);f.tick();f.c.handleAdminListRowClick(f.event(),f.card);f.tick();assert.equal(f.c.handleAdminListRowClick(f.event(),f.card),true);assert.equal(f.stats().toggled,1);
f=fixture();f.state.add('is-view-expanded');f.card.dirty=true;f.c.handleAdminListRowClick(f.event(),f.card);f.tick();assert.equal(f.c.handleAdminListRowClick(f.event(),f.card),false);assert.equal(f.stats().toggled,0);assert.match(f.status.innerText,/儲存/);
f=fixture();assert.equal(f.c.handleAdminListRowClick(f.event(true),f.card),false);assert.equal(f.stats().expanded,0);
for(const field of ['date','payment']){f=fixture();assert.equal(f.c.openAdminListQuickEditor(f.event(),f.card,field),true);assert.equal(f.panel().children[0],f.editor);assert.equal(f.panel().dataset.field,field);assert.equal(f.stats().focus,1);assert.equal(f.stats().pickers,1);assert.equal(f.stats().expanded,0);f.card.dirty=true;f.input.value='changed';f.panel().children[1].click(f.event());assert.equal(f.panel(),null);assert.equal(f.input.value,field==='date'?'':'bank_unpaid');assert.equal(f.restored(),1);assert.equal(f.refreshed(),1);}
f=fixture();f.input.disabled=true;assert.equal(f.c.openAdminListQuickEditor(f.event(),f.card,'date'),false);assert.equal(f.stats().expanded,0);
f=fixture();f.card.querySelector=()=>null;assert.equal(f.c.openAdminListQuickEditor(f.event(),f.card,'payment'),false);
f=fixture();f.other.dirty=true;assert.equal(f.c.openAdminListQuickEditor(f.event(),f.card,'date'),false);assert.equal(f.stats().expanded,0);
f=fixture();f.c.adminBatchProcessing=true;assert.equal(f.c.openAdminListQuickEditor(f.event(),f.card,'date'),false);
f=fixture();f.c.handleAdminListQuickEditKey({...f.event(),key:'Tab'},f.card,'date');assert.equal(f.stats().focus,0);f.c.handleAdminListQuickEditKey(f.event(),f.card,'date');assert.equal(f.stats().focus,1);
f=fixture();f.card.dirty=true;assert.equal(f.c.openAdminListQuickEditor(f.event(),f.card,'date'),false);
f=fixture();f.c.openAdminListQuickEditor(f.event(),f.card,'date');f.editor.dataset.saving='true';f.panel().children[1].click(f.event());assert.ok(f.panel());assert.equal(f.restored(),0);
assert.ok(!html.slice(a,b).includes('card.append(panel)'));assert.ok(html.slice(a,b).includes('cell.append(panel)'));assert.ok(html.includes("if(event.target.closest('.admin-list-inline-editor'))return;"));
assert.match(html,/adminWorkflowEditable \? "role=\\"button/);
console.log('PASS double-tap expand/collapse, interactive exclusion, dirty protection, original-cell date/payment without card expansion, cancel restores original control/baseline, saving blocks cancel, readonly/disabled, other-card draft, batch guard, keyboard');

f=fixture();
for (const [data,label] of [
 [{requestedShippingStartDate:'2026-10-17',requestedShippingEndDate:'2026-10-18'},'10/17～10/18'],
 [{requestedShippingStartDate:'2026-10-17',requestedShippingEndDate:'2026-10-17'},'10/17'],
 [{requestedShippingEndDate:'2026-10-18'},'10/18'],
 [{requestedShippingStartDate:'2026-12-31',requestedShippingEndDate:'2027-01-02'},'2026-12-31～2027-01-02'],
 [{requestedShippingBatchLabel:'中秋批次'},'中秋批次'],[{},'未指定']
]) assert.equal(f.c.getAdminListRequestedShippingLabel(data),label);
assert.ok(html.includes(':not(.admin-list-requested-date)'));
console.log('PASS independent requested dates: range, same day, partial dates, cross-year, legacy label, unspecified, visible during cell editing');

f=fixture();f.state.add('is-view-expanded');f.c.handleAdminListRowClick(f.event(false,false,true),f.card);f.tick();assert.equal(f.c.handleAdminListRowClick(f.event(false,false,true),f.card),true);assert.equal(f.stats().toggled,1);
f=fixture();f.state.add('is-view-expanded');f.c.handleAdminListRowClick(f.event(false,false,false),f.card);f.tick();assert.equal(f.c.handleAdminListRowClick(f.event(false,false,false),f.card),false);assert.equal(f.stats().toggled,0);
f=fixture();f.c.adminCardViewMode='compact';f.state.add('is-view-expanded');f.c.handleAdminListRowClick(f.event(false,false,true),f.card);f.tick();assert.equal(f.c.handleAdminListRowClick(f.event(false,false,true),f.card),true);
console.log('PASS expanded summary double tap collapses in table/compact; lower non-summary area excluded');

f=fixture();for(const [source,group,label] of [['管理端','','管理員新增'],['管理員新增','','管理員新增'],['LINE表單','','LINE 表單'],['LINE OA 客戶下單','','LINE 表單'],['管理端','G1','團體訂單'],['','','未註明'],['其他來源','','其他來源']])assert.equal(f.c.getAdminListSourceLabel(source,group),label);
console.log('PASS order source display: LINE, admin, groups and unknown preserved');
