const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function content({ shortcut, input, selection = '', fallback = false } = {}) {
 const handlers = {}, copied = {}; let message;
 const window = {location:{href:'https://frame.example/'},getSelection:()=>({toString:()=>selection}),addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]};
 const document = {activeElement:input,execCommand:()=>{handlers.copy({clipboardData:{setData:(k,v)=>copied[k]=v},preventDefault(){},stopImmediatePropagation(){}});return true;}};
 vm.runInNewContext(fs.readFileSync('content.js','utf8'),{window,document,Blob,ClipboardItem:class{constructor(data){this.data=data;}},navigator:{clipboard:{write:async items=>{if(fallback)throw Error('denied');for(const [k,v]of Object.entries(items[0].data))copied[k]=await v.text();}}},chrome:{storage:{local:{get:(_,cb)=>cb({shortcut})},onChanged:{addListener(){}}},runtime:{onMessage:{addListener:fn=>message=fn}}},console:{log(){},warn(){},error(){}}});
 return {handlers,copied,copy:(request={})=>new Promise(resolve=>message({action:'COPY_LINK',...request},null,resolve))};
}
test('active input selection wins over old page selection',async()=>{
 const c=content({input:Object.freeze({tagName:'INPUT',value:'input text',selectionStart:0,selectionEnd:5}),selection:'old'});
 assert.equal((await c.copy()).status,'SUCCESS');assert.equal(c.copied['text/plain'],'[input](https://frame.example/)');
});
test('fallback writes rich text without DOM or selection mutations',async()=>{
 const c=content({selection:'<hello>',fallback:true});assert.equal((await c.copy()).status,'SUCCESS');assert.equal(c.copied['text/html'],'<a href="https://frame.example/">&lt;hello&gt;</a>');assert.equal(c.handlers.copy,undefined);
});
test('context menu snapshot and page URL override frame selection',async()=>{
 const c=content({selection:'old'});await c.copy({selectedText:'clicked',url:'https://page.example/'});assert.equal(c.copied['text/plain'],'[clicked](https://page.example/)');
});
test('unsafe saved shortcut is ignored; empty selection does not swallow keys',()=>{
 const c=content({shortcut:{code:'KeyA',ctrlKey:false,altKey:false,metaKey:false},selection:'text'});
 c.handlers.keydown({code:'KeyA',ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,preventDefault(){assert.fail('plain A blocked');}});
 const empty=content();empty.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,preventDefault(){assert.fail('empty selection blocked');}});
});
test('matching shortcut stops page handlers in capture phase',()=>{
 const c=content({selection:'text'});let stopped=false;c.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert.ok(stopped);
});
test('background targets only the clicked frame and sends selection snapshot',async()=>{
 let click;const calls=[];
 const chrome={runtime:{onInstalled:{addListener(){} }},storage:{local:{get:(_,cb)=>cb({})},onChanged:{addListener(){}}},contextMenus:{removeAll:cb=>cb(),create:(_,cb)=>cb(),onClicked:{addListener:fn=>click=fn}},tabs:{sendMessage:(tab,message,options,cb)=>{calls.push({tab,message,options});cb({status:message.action==='PING'?'ALIVE':'SUCCESS'});}},scripting:{}};
 vm.runInNewContext(fs.readFileSync('background.js','utf8'),{chrome,console});
 await click({menuItemId:'make-hyperlink-context-menu',frameId:7,selectionText:'clicked',pageUrl:'https://page.example/'},{id:3,url:'https://page.example/'});
 assert.equal(calls.length,2);for(const call of calls)assert.equal(call.options.frameId,7);assert.equal(calls[1].message.selectedText,'clicked');
});

test('popup rejects plain keys and stops recording immediately after saving',()=>{
 const elements={};for(const id of ['record-btn','shortcut-display','current-shortcut','status-msg','enable-shortcut'])elements[id]={textContent:'',classList:{add(){},remove(){}},addEventListener(name,fn){this[name]=fn;}};
 let keyHandler,saveCallback;const saved=[];
 vm.runInNewContext(fs.readFileSync('popup.js','utf8'),{document:{getElementById:id=>elements[id],addEventListener:(_,fn)=>fn()},window:{addEventListener:(_,fn)=>keyHandler=fn,removeEventListener:()=>keyHandler=undefined},chrome:{runtime:{},storage:{local:{get:(_,cb)=>cb({}),set:(value,cb)=>{saved.push(value);saveCallback=cb;}}}},clearTimeout(){},setTimeout(){assert.fail('recording must stop without delay');}});
 elements['record-btn'].click();const handler=keyHandler;
 const event={key:'a',code:'KeyA',ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,preventDefault(){}};
 handler(event);assert.equal(saved.length,0);
 handler({...event,ctrlKey:true});assert.equal(saved.length,1);assert.equal(elements['record-btn'].disabled,true);
 handler({...event,code:'KeyB',ctrlKey:true});assert.equal(saved.length,1);
 saveCallback();assert.equal(keyHandler,undefined);assert.equal(elements['record-btn'].disabled,false);
 handler({...event,code:'KeyB',ctrlKey:true});assert.equal(saved.length,1);
});
