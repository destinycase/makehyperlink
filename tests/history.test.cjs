const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const srcPath=name=>path.join(__dirname,'..','src',name);

function panel({fallback=false,denied=false}={}) {
 class Element {
  constructor(tagName){this.tagName=tagName;this.children=[];this.listeners={};this.textContent='';this.scrollTop=0;}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);}
  replaceChildren(){this.children=[];}
  addEventListener(name,fn){this.listeners[name]=fn;}
  focus(){}
  select(){}
  setCustomValidity(message){this.validationMessage=message;}
  reportValidity(){}
 }
 const elements=Object.fromEntries(['history-list','history-empty','history-count','history-status','clear-history'].map(id=>[id,new Element()]));
 const history=[{id:'1',text:'<img src=x onerror=alert(1)> & 한글',url:'https://example.com/?x="&y=2',copiedAt:Date.now()}];
 const copied={},messages=[],handlers={};let onStorageChanged;
 const chrome={windows:{getCurrent:async()=>({id:9})},storage:{local:{get:(_,cb)=>cb({history})},onChanged:{addListener:fn=>onStorageChanged=fn}},runtime:{sendMessage:(request,cb)=>{messages.push(request);if(request.action==='DELETE_HISTORY')history.splice(0);if(request.action==='UPDATE_HISTORY_TEXT')history.find(item=>item.id===request.id).text=request.text.trim();cb({status:'SUCCESS'});}}};
 const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),addEventListener:(_,fn)=>fn(),execCommand:()=>{if(denied)return false;handlers.copy({clipboardData:{setData:(type,value)=>copied[type]=value},preventDefault(){},stopImmediatePropagation(){}});return true;}};
 vm.runInNewContext(fs.readFileSync(srcPath('history.js'),'utf8'),{document,chrome,window:{addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]},Blob,ClipboardItem:class{constructor(data){this.data=data;}},navigator:{clipboard:{write:async items=>{if(fallback||denied)throw Error('denied');for(const [type,blob]of Object.entries(items[0].data))copied[type]=await blob.text();}}}});
 return {elements,copied,messages,history,handlers,change:onStorageChanged};
}

test('history renders text safely and re-copies escaped rich links',async()=>{
 const p=panel();const row=p.elements['history-list'].children[0];
 assert.equal(row.children[0].textContent,p.history[0].text);
 assert.equal(row.children[0].title,p.history[0].text);
 assert.equal(p.elements['history-count'].textContent,'1 / 100');
 const link=row.children[1];assert.equal(link.tagName,'a');assert.equal(link.href,p.history[0].url);
 assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 const button=row.children[2].children[1];button.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(button.disabled,false);
 assert.match(p.copied['text/html'],/&lt;img/);assert.match(p.copied['text/html'],/&quot;&amp;y=2/);
 assert.equal(p.copied['text/plain'],`[${p.history[0].text}](${p.history[0].url})`);
 assert.equal(p.messages[0].success,true);assert.equal(p.messages[0].item.id,'1');
 assert.equal(p.messages[0].windowId,9);
});

test('panel fallback preserves rich data and removes its copy listener',async()=>{
 const p=panel({fallback:true});p.elements['history-list'].children[0].children[2].children[1].listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(p.copied['text/html'],/&lt;img/);assert.equal(p.handlers.copy,undefined);
 assert.equal(p.messages[0].success,true);
});

test('failed history copy reports failure without saving an item',async()=>{
 const p=panel({denied:true});p.elements['history-list'].children[0].children[2].children[1].listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.messages[0].success,false);assert.equal(p.messages[0].item,undefined);
 assert.deepEqual(p.copied,{});assert.equal(p.handlers.copy,undefined);
});

test('deleting an item refreshes the panel empty state',async()=>{
 const p=panel();p.elements['history-list'].children[0].children[2].children[2].listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.messages[0].action,'DELETE_HISTORY');assert.equal(p.messages[0].id,'1');
 assert.equal(p.elements['history-list'].children.length,0);assert.equal(p.elements['history-empty'].hidden,false);
 assert.equal(p.elements['clear-history'].disabled,true);
});

test('an open panel refreshes history when a different tab copies a link',()=>{
 const p=panel();p.history.unshift({id:'2',text:'new copy',url:'https://other.example/',copiedAt:Date.now()});
 p.change({history:{newValue:p.history}},'local');
 assert.equal(p.elements['history-count'].textContent,'2 / 100');
 assert.equal(p.elements['history-list'].children[0].children[0].textContent,'new copy');
});

test('history refresh keeps the current scroll position',()=>{
 const p=panel();p.elements['history-list'].scrollTop=180;
 p.change({history:{newValue:p.history}},'local');
 assert.equal(p.elements['history-list'].scrollTop,180);
 const time=p.elements['history-list'].children[0].children[2].children[0];
 assert.ok(time.title);assert.ok(time.textContent.length<time.title.length);
});

test('tile edit confirms a new label and subsequent copy uses it with the original URL',async()=>{
 const p=panel();let row=p.elements['history-list'].children[0];
 const url=p.history[0].url;row.children[3].listeners.click();
 const editor=row.children[4],input=editor.children[0];assert.equal(editor.hidden,false);
 input.value='New <label>';input.listeners.input();editor.children[1].listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.history[0].text,'New <label>');assert.equal(p.history[0].url,url);
 row=p.elements['history-list'].children[0];row.children[2].children[1].listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.copied['text/plain'],`[New <label>](${url})`);assert.match(p.copied['text/html'],/New &lt;label&gt;/);
});
test('cancel and blank labels do not change stored text; drafts survive live list updates',()=>{
 const p=panel();const original=p.history[0].text;let row=p.elements['history-list'].children[0];
 row.children[3].listeners.click();let editor=row.children[4],input=editor.children[0];
 input.value='  ';editor.children[1].listeners.click();assert.ok(input.validationMessage);assert.equal(p.messages.length,0);
 input.value='Draft';input.listeners.input();p.change({history:{}},'local');
 row=p.elements['history-list'].children[0];editor=row.children[4];assert.equal(editor.hidden,false);assert.equal(editor.children[0].value,'Draft');
 editor.children[2].listeners.click();assert.equal(editor.hidden,true);assert.equal(p.history[0].text,original);assert.equal(p.messages.length,0);
});
