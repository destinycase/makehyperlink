const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
function translations(saved){
 const nodes=[{textContent:'목록 ',parentElement:{closest:()=>false}},{textContent:'사용자 제목',parentElement:{closest:()=>true}}];
 const attributes={title:'설정'};
 const element={closest:()=>false,hasAttribute:key=>key in attributes,getAttribute:key=>attributes[key],setAttribute:(key,value)=>attributes[key]=value};
 let start,changed;
 const document={body:{},documentElement:{},createTreeWalker(){let i=-1;return {nextNode(){i++;this.currentNode=nodes[i];return i<nodes.length;}};},querySelectorAll:()=>[element],addEventListener:(_,fn)=>start=fn};
 const context={document,NodeFilter:{SHOW_TEXT:4},chrome:{runtime:{},storage:{local:{get:(_,cb)=>cb(saved?{language:saved}:{})},onChanged:{addListener:fn=>changed=fn}}}};
 vm.runInNewContext(source('i18n.js'),context);start();return {context,document,nodes,attributes,changed};
}
test('language defaults to English and switches both ways without changing user labels',()=>{
 const p=translations();assert.equal(p.context.MH.language,'en');assert.equal(p.nodes[0].textContent,'List ');assert.equal(p.attributes.title,'Settings');assert.equal(p.nodes[1].textContent,'사용자 제목');
 p.changed({language:{newValue:'ko'}},'local');assert.equal(p.nodes[0].textContent,'목록 ');assert.equal(p.attributes.title,'설정');
 p.context.MH.apply('en');assert.equal(p.nodes[0].textContent,'List ');assert.equal(p.context.MH.t(' 복사'),' Copy');
});
test('saved Korean is restored and unsupported languages default to English',()=>{
 const p=translations('ko');assert.equal(p.document.documentElement.lang,'ko');assert.equal(p.nodes[0].textContent,'목록 ');
 p.context.MH.apply('invalid');assert.equal(p.context.MH.language,'en');
});
test('settings dialog saves language, restores selection on failure and restores focus on close',()=>{
 const elements={};for(const id of ['settings-dialog','settings-open','settings-close','language-select','settings-status'])elements[id]={listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},focus(){this.focused=true;}};
 const dialog=elements['settings-dialog'];dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;dialog.listeners.close();};
 let applyCount=0,fail=false;
 const MH={language:'en',t:x=>x,subscribe(){},apply(value){this.language=value;applyCount++;}};
 const chrome={runtime:{},storage:{local:{set(value,cb){chrome.runtime.lastError=fail?{message:'failed'}:undefined;cb();}}}};
 vm.runInNewContext(source('settings.js'),{MH,chrome,document:{getElementById:id=>elements[id],addEventListener:(_,fn)=>fn()}});
 elements['settings-open'].listeners.click();assert.equal(dialog.open,true);assert.equal(elements['language-select'].value,'en');
 elements['language-select'].value='ko';elements['language-select'].listeners.change();assert.equal(MH.language,'ko');assert.equal(applyCount,1);
 fail=true;elements['language-select'].value='en';elements['language-select'].listeners.change();assert.equal(elements['language-select'].value,'ko');assert.equal(MH.language,'ko');
 elements['settings-close'].listeners.click();assert.equal(dialog.open,false);assert.ok(elements['settings-open'].focused);
});
