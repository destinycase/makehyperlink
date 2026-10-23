const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const srcPath = name => path.join(__dirname, '..', 'src', name);
const crypto = require('node:crypto');

function background({ tabs = [], respond = () => ({status:'ALIVE'}), inject = async()=>{}, history = [] } = {}) {
 const listeners={}, badges={}, colors={}, titles={}, data={history}, timers=new Map(),queries=[];let timerId=0;
 const chrome={sidePanel:{setPanelBehavior:async options=>{listeners.panelBehavior=options;}},
  runtime:{getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listeners.message=fn},onInstalled:{addListener:fn=>listeners.installed=fn}},
  storage:{local:{get:(keys,cb)=>cb(Object.fromEntries(keys.filter(key=>key in data).map(key=>[key,data[key]]))),set:(value,cb)=>{Object.assign(data,value);cb();}},onChanged:{addListener(){}}},
  contextMenus:{removeAll:cb=>cb(),create:(_,cb)=>cb(),onClicked:{addListener:fn=>listeners.click=fn}},
  tabs:{query:async options=>{queries.push(options);return tabs;},sendMessage:(tabId,message,options,cb)=>cb(respond(message))},
  scripting:{executeScript:inject},
  action:{setBadgeText:async({tabId,text})=>badges[tabId]=text,setBadgeBackgroundColor:async({tabId,color})=>colors[tabId]=color,setTitle:async({tabId,title})=>titles[tabId]=title}
 };
 vm.runInNewContext(fs.readFileSync(srcPath('background.js'),'utf8'),{chrome,crypto,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),console:{log(){},warn(){},error(){}}});
 return {listeners,badges,colors,titles,data,timers,queries};
}

test('shortcut results update only the sending tab badge and tooltip',async()=>{
 const b=background();
 const report=(tabId,success,message)=>new Promise(resolve=>{
  assert.equal(b.listeners.message({action:'COPY_RESULT',success,message},{tab:{id:tabId},frameId:7},resolve),true);
 });
 await report(3,true,'copied');await report(8,false,'select text');
 assert.deepEqual(b.badges,{3:'OK',8:'ERR'});
 assert.deepEqual(b.colors,{3:'#137333',8:'#B3261E'});
 assert.match(b.titles[8],/select text/);
 await report(8,true,'retried');assert.equal(b.badges[8],'OK');assert.equal(b.badges[3],'OK');
 assert.equal(b.listeners.message({action:'COPY_RESULT',success:true},{},()=>assert.fail('no sender tab')),false);
});

test('context menu shows success, copy failure and injection failure badges',async()=>{
 for(const outcome of ['success','failure','injection']){
  const b=background({respond:request=>({status:request.action==='PING'?(outcome==='injection'?'MISSING':'ALIVE'):(outcome==='success'?'SUCCESS':'ERROR')}),inject:async()=>{throw Error('injection failed');}});
  await b.listeners.click({menuItemId:'make-hyperlink-context-menu',selectionText:'selected'},{id:4,url:'https://example.com/'});
  assert.equal(b.badges[4],outcome==='success'?'OK':'ERR');
 }
});

function backgroundRequest(b,request,sender={tab:{id:3}}) {
 return new Promise(resolve=>assert.equal(b.listeners.message(request,sender,resolve),true));
}

test('title lookup returns top-level tab details even for a frame sender',()=>{
 const b=background();let response;
 assert.equal(b.listeners.message({action:'GET_TAB_DETAILS'},{tab:{id:3,title:'Top-level title',url:'https://page.example/'},frameId:7},value=>response=value),false);
 assert.equal(response.title,'Top-level title');assert.equal(response.url,'https://page.example/');
});

test('badge clears after 1000ms and an older timeout cannot erase a newer result',async()=>{
 const b=background();
 await backgroundRequest(b,{action:'COPY_RESULT',success:true});
 const old=[...b.timers.values()][0];assert.equal(old.ms,1000);
 await backgroundRequest(b,{action:'COPY_RESULT',success:false});
 assert.equal(b.timers.size,1);old.fn();assert.equal(b.badges[3],'ERR');
 const latest=[...b.timers.values()][0];assert.equal(latest.ms,1000);latest.fn();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.badges[3],'');assert.equal(b.titles[3],'MakeHyperlink 사이드 패널 열기');
});

test('concurrent successful copies persist, deduplicate and cap history at 100',async()=>{
 const b=background();
 await Promise.all(Array.from({length:105},(_,i)=>backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{text:'text '+i,url:'https://example.com/'+i}})));
 assert.equal(b.data.history.length,100);assert.equal(b.data.history[0].text,'text 104');
 assert.equal(b.data.history[99].text,'text 5');
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{text:'text 5',url:'https://example.com/5'}});
 assert.equal(b.data.history[0].text,'text 5');assert.equal(b.data.history.length,100);
 assert.equal(new Set(b.data.history.map(item=>item.id)).size,100);
 await backgroundRequest(b,{action:'COPY_RESULT',success:false,item:{text:'failed',url:'https://example.com/'}});
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{text:'unsafe',url:'javascript:alert(1)'}});
 assert.equal(b.data.history.length,100);assert.equal(b.data.history[0].text,'text 5');
});

test('side panel can re-copy and delete history through the shared storage queue',async()=>{
 const b=background({tabs:[{id:6}],history:[{id:'existing',text:'popup',url:'https://example.com/',copiedAt:123}]});const sender={url:'chrome-extension://test/sidepanel.html'};
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{text:'popup',url:'https://example.com/'}},sender);
 assert.equal(b.badges[6],'OK');const id=b.data.history[0].id;
 await backgroundRequest(b,{action:'DELETE_HISTORY',id},sender);assert.equal(b.data.history.length,0);
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{text:'again',url:'https://example.com/'}},sender);
 await backgroundRequest(b,{action:'DELETE_HISTORY'},sender);assert.equal(b.data.history.length,0);
 assert.equal(b.listeners.message({action:'DELETE_HISTORY'},{tab:{id:6}},()=>assert.fail('content cannot delete history')),false);
});

test('toolbar opens the registered side panel with all packaged resources present',()=>{
 const b=background();const manifest=JSON.parse(fs.readFileSync(srcPath('manifest.json'),'utf8'));
 assert.equal(b.listeners.panelBehavior.openPanelOnActionClick,true);
 assert.ok(manifest.permissions.includes('sidePanel'));assert.equal(manifest.action.default_popup,undefined);
 assert.ok(fs.existsSync(srcPath(manifest.side_panel.default_path)));
 const html=fs.readFileSync(srcPath(manifest.side_panel.default_path),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(srcPath(match[1])),match[1]);
});

test('panel copy badges target the active tab in the panel window',async()=>{
 const b=background({tabs:[{id:17}]});
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,windowId:9},{url:'chrome-extension://test/sidepanel.html'});
 assert.equal(b.queries[0].windowId,9);assert.equal(b.queries[0].active,true);
 assert.equal(b.queries[0].currentWindow,undefined);assert.equal(b.badges[17],'OK');
});

test('context menu stores the copied snapshot from its frame response',async()=>{
 const item={text:'clicked selection',url:'https://page.example/'};
 const b=background({respond:request=>request.action==='PING'?{status:'ALIVE'}:{status:'SUCCESS',item}});
 await b.listeners.click({menuItemId:'make-hyperlink-context-menu',selectionText:item.text},{id:4,url:item.url});
 assert.equal(b.data.history[0].text,item.text);assert.equal(b.data.history[0].url,item.url);
 assert.equal(b.badges[4],'OK');
});

test('context menu uses pageUrl when Chrome omits tab.url',async()=>{
 const item={text:'selected',url:'https://example.com/'};
 const b=background({respond:request=>request.action==='PING'?{status:'ALIVE'}:{status:'SUCCESS',item}});
 await b.listeners.click({menuItemId:'make-hyperlink-context-menu',selectionText:item.text,pageUrl:item.url},{id:4});
 assert.equal(b.badges[4],'OK');assert.equal(b.data.history[0].url,item.url);
});

test('protected Whale and extension pages fail clearly without attempting injection',async()=>{
 for(const url of ['whale-extension://ojmkgfaeececindhbegihnonpndkbnho/index.html','whale://settings/','chrome-extension://other/index.html']){
  let contacted=false;
  const b=background({respond:()=>{contacted=true;return {status:'ALIVE'};},inject:async()=>{contacted=true;}});
  await b.listeners.click({menuItemId:'make-hyperlink-context-menu',pageUrl:url},{id:4,url});
  assert.equal(contacted,false);assert.equal(b.badges[4],'ERR');
  assert.match(b.titles[4],/브라우저 내부 화면/);assert.equal(b.data.history.length,0);
 }
});
function content({ shortcut, input, selection = '', title = '', tabDetails, fallback = false, copyDenied = false, enabled = true, badgeDenied = false } = {}) {
 const handlers = {}, copied = {}, reports = []; let message;
 const window = {location:{href:'https://frame.example/'},getSelection:()=>({toString:()=>selection}),addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]};
 const noMutation=()=>assert.fail('page DOM or selection was modified');
 const document = {title,activeElement:input,createElement:noMutation,body:{appendChild:noMutation},documentElement:{appendChild:noMutation},execCommand:()=>{if(copyDenied)return false;handlers.copy({clipboardData:{setData:(k,v)=>copied[k]=v},preventDefault(){},stopImmediatePropagation(){}});return true;}};
 vm.runInNewContext(fs.readFileSync(srcPath('content.js'),'utf8'),{window,document,Blob,ClipboardItem:class{constructor(data){this.data=data;}},navigator:{clipboard:{write:async items=>{if(fallback)throw Error('denied');for(const [k,v]of Object.entries(items[0].data))copied[k]=await v.text();}}},chrome:{storage:{local:{get:(_,cb)=>cb({shortcut,enabled})},onChanged:{addListener(){}}},runtime:{getManifest:()=>({}),sendMessage:(report,cb)=>{if(badgeDenied)throw Error('context invalidated');if(report.action==='GET_TAB_DETAILS')return cb(tabDetails);reports.push(report);cb();},onMessage:{addListener:fn=>message=fn}}},console:{log(){},warn(){},error(){}}});
 return {handlers,copied,reports,copy:(request={})=>new Promise(resolve=>message({action:'COPY_LINK',...request},null,resolve))};
}
test('active input selection wins over old page selection',async()=>{
 const c=content({input:Object.freeze({tagName:'INPUT',value:'input text',selectionStart:0,selectionEnd:5}),selection:'old'});
 assert.equal((await c.copy()).status,'SUCCESS');assert.equal(c.copied['text/plain'],'[input](https://frame.example/)');
});
test('fallback writes rich text without moving the selection',async()=>{
 const c=content({selection:'<hello>',fallback:true});assert.equal((await c.copy()).status,'SUCCESS');assert.equal(c.copied['text/html'],'<a href="https://frame.example/">&lt;hello&gt;</a>');assert.equal(c.handlers.copy,undefined);
});
test('context menu snapshot and page URL override frame selection',async()=>{
 const c=content({selection:'old'});await c.copy({selectedText:'clicked',url:'https://page.example/'});assert.equal(c.copied['text/plain'],'[clicked](https://page.example/)');
});
test('unsafe saved shortcut is ignored',()=>{
 const c=content({shortcut:{code:'KeyA',ctrlKey:false,altKey:false,metaKey:false},selection:'text'});
 c.handlers.keydown({code:'KeyA',ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,preventDefault(){assert.fail('plain A blocked');}});
});
test('matching shortcut stops page handlers in capture phase',()=>{
 const c=content({selection:'text'});let stopped=false;c.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert.ok(stopped);
});

test('IME composition does not suppress an explicit copy shortcut',async()=>{
 const c=content({selection:'한글 선택'});let prevented=false;
 c.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,isComposing:true,preventDefault(){prevented=true;},stopImmediatePropagation(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(prevented);assert.equal(c.copied['text/plain'],'[한글 선택](https://frame.example/)');
 assert.equal(c.reports[0].success,true);
 assert.equal(c.reports[0].item.text,'한글 선택');
 assert.equal(c.reports[0].item.url,'https://frame.example/');
});

test('disabled, repeated and nonmatching IME keystrokes remain untouched',()=>{
 for(const [options,event] of [[{enabled:false},{}],[{},{repeat:true}],[{},{code:'KeyA'}],[{},{ctrlKey:false,altKey:false}]]){
  const c=content({selection:'한글',...options});
  c.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,isComposing:true,...event,preventDefault(){assert.fail('key was intercepted');},stopImmediatePropagation(){assert.fail('key was stopped');}});
  assert.deepEqual(c.copied,{});
 }
});

test('failed clipboard methods report failure and allow retry',async()=>{
 const c=content({selection:'text',fallback:true,copyDenied:true});
 assert.equal((await c.copy()).status,'ERROR');
 assert.equal(c.handlers.copy,undefined);
 assert.equal((await c.copy()).status,'ERROR');
 assert.deepEqual(c.copied,{});
});

test('shortcut without a selection copies the tab title and tab URL from an iframe',async()=>{
 const c=content({title:'frame title',tabDetails:{title:'탭 제목 <test>',url:'https://page.example/'}});let prevented=false;
 c.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,preventDefault(){prevented=true;},stopImmediatePropagation(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(prevented);assert.equal(c.copied['text/plain'],'[탭 제목 <test>](https://page.example/)');
 assert.equal(c.copied['text/html'],'<a href="https://page.example/">탭 제목 &lt;test&gt;</a>');
 assert.equal(c.reports[0].success,true);assert.equal(c.reports[0].item.text,'탭 제목 <test>');
});

test('empty input selection uses the title without changing the input or old page selection',async()=>{
 const c=content({title:'document title',selection:'old',input:Object.freeze({tagName:'INPUT',value:'unchanged',selectionStart:0,selectionEnd:0})});
 assert.equal((await c.copy()).status,'SUCCESS');
 assert.equal(c.copied['text/plain'],'[document title](https://frame.example/)');
});

test('untitled pages fall back to the URL and context menu title overrides frame title',async()=>{
 const c=content();await c.copy();assert.equal(c.copied['text/plain'],'[https://frame.example/](https://frame.example/)');
 const menu=content({title:'frame title'});
 await menu.copy({selectedText:' ',title:'Page title',url:'https://page.example/'});
 assert.equal(menu.copied['text/plain'],'[Page title](https://page.example/)');
});

test('badge delivery failure does not prevent shortcut copying',async()=>{
 const c=content({selection:'text',badgeDenied:true});
 c.handlers.keydown({code:'KeyC',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,preventDefault(){},stopImmediatePropagation(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await c.copy()).status,'SUCCESS');
 assert.equal(c.copied['text/plain'],'[text](https://frame.example/)');
});
test('background targets only the clicked frame and sends selection snapshot',async()=>{
 let click;const calls=[];
 const chrome={sidePanel:{setPanelBehavior:async()=>{}},runtime:{getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener(){}},onInstalled:{addListener(){} }},storage:{local:{get:(_,cb)=>cb({})},onChanged:{addListener(){}}},contextMenus:{removeAll:cb=>cb(),create:(_,cb)=>cb(),onClicked:{addListener:fn=>click=fn}},tabs:{sendMessage:(tab,message,options,cb)=>{calls.push({tab,message,options});cb({status:message.action==='PING'?'ALIVE':'SUCCESS'});}},scripting:{},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(srcPath('background.js'),'utf8'),{chrome,crypto,setTimeout:()=>1,clearTimeout(){},console});
 await click({menuItemId:'make-hyperlink-context-menu',frameId:7,selectionText:'clicked',pageUrl:'https://page.example/'},{id:3,url:'https://page.example/'});
 assert.equal(calls.length,2);for(const call of calls)assert.equal(call.options.frameId,7);assert.equal(calls[1].message.selectedText,'clicked');
});

test('install activates existing web tabs before any context menu click',async()=>{
 let installed;const injected=[];
 const chrome={sidePanel:{setPanelBehavior:async()=>{}},runtime:{getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener(){}},onInstalled:{addListener:fn=>installed=fn}},storage:{local:{get:(_,cb)=>cb({})},onChanged:{addListener(){}}},contextMenus:{removeAll:cb=>cb(),create:(_,cb)=>cb(),onClicked:{addListener(){}}},tabs:{query:async()=>[{id:1,url:'https://example.com/'},{id:2,url:'chrome://extensions/'},{id:3,url:'https://other.example/'},{id:4,url:'https://closed.example/'}]},scripting:{executeScript:async options=>{injected.push(options);if(options.target.tabId===4)throw Error('tab closed');}}};
 vm.runInNewContext(fs.readFileSync(srcPath('background.js'),'utf8'),{chrome,crypto,setTimeout:()=>1,clearTimeout(){},console:{log(){},warn(){},error(){}}});
 installed();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(injected.map(item=>item.target.tabId).sort(),[1,3,4]);
 assert.ok(injected.every(item=>item.target.allFrames===true));
 assert.ok(injected.every(item=>item.files[0]==='content.js'));
 assert.ok(JSON.parse(fs.readFileSync(srcPath('manifest.json'),'utf8')).host_permissions.includes('<all_urls>'));
});

test('side panel rejects plain keys and stops recording immediately after saving',()=>{
 const elements={};for(const id of ['record-btn','shortcut-display','current-shortcut','status-msg','enable-shortcut'])elements[id]={textContent:'',classList:{add(){},remove(){}},addEventListener(name,fn){this[name]=fn;}};
 let keyHandler,saveCallback;const saved=[];
 vm.runInNewContext(fs.readFileSync(srcPath('sidepanel.js'),'utf8'),{document:{getElementById:id=>elements[id],addEventListener:(_,fn)=>fn()},window:{addEventListener:(_,fn)=>keyHandler=fn,removeEventListener:()=>keyHandler=undefined},chrome:{runtime:{},storage:{onChanged:{addListener(){}},local:{get:(_,cb)=>cb({}),set:(value,cb)=>{saved.push(value);saveCallback=cb;}}}},clearTimeout(){},setTimeout(){assert.fail('recording must stop without delay');}});
 elements['record-btn'].click();const handler=keyHandler;
 const event={key:'a',code:'KeyA',ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,preventDefault(){}};
 handler(event);assert.equal(saved.length,0);
 handler({...event,ctrlKey:true});assert.equal(saved.length,1);assert.equal(elements['record-btn'].disabled,true);
 handler({...event,code:'KeyB',ctrlKey:true});assert.equal(saved.length,1);
 saveCallback();assert.equal(keyHandler,undefined);assert.equal(elements['record-btn'].disabled,false);
 handler({...event,code:'KeyB',ctrlKey:true});assert.equal(saved.length,1);
});

test('shortcut off dims display, blocks editing and cancels active recording',()=>{
 const elements={};for(const id of ['record-btn','shortcut-display','current-shortcut','status-msg','enable-shortcut']){
 const classes=new Set();elements[id]={textContent:'',checked:true,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},classes,addEventListener(name,fn){this[name]=fn;}};
 }
 let keyHandler,changed;const saved=[];
 vm.runInNewContext(fs.readFileSync(srcPath('sidepanel.js'),'utf8'),{document:{getElementById:id=>elements[id],addEventListener:(_,fn)=>fn()},window:{addEventListener:(_,fn)=>keyHandler=fn,removeEventListener:()=>keyHandler=undefined},chrome:{runtime:{},storage:{onChanged:{addListener:fn=>changed=fn},local:{get:(keys,cb)=>cb(keys.includes('enabled')?{enabled:false}:{}),set:(value,cb)=>{saved.push(value);cb();}}}},clearTimeout(){}});
 assert.equal(elements['record-btn'].disabled,true);assert.ok(elements['shortcut-display'].classes.has('is-disabled'));
 elements['record-btn'].click();assert.equal(keyHandler,undefined);
 elements['enable-shortcut'].checked=true;elements['enable-shortcut'].change();assert.equal(elements['record-btn'].disabled,false);
 elements['record-btn'].click();const captured=keyHandler;assert.equal(typeof captured,'function');
 changed({enabled:{newValue:false}},'local');assert.equal(keyHandler,undefined);assert.equal(elements['record-btn'].disabled,true);
 captured({key:'a',code:'KeyA',ctrlKey:true,preventDefault(){assert.fail('disabled editor handled a key');}});
 assert.equal(saved.length,1);assert.equal(saved[0].enabled,true);
});

test('existing link menu copies clicked text and destination without using page selection',async()=>{
 const c=content({selection:'unrelated selection'});
 const link={href:'https://target.example/path',innerText:'Target & name',matches:()=>true};
 c.handlers.contextmenu({composedPath:()=>[{matches:()=>false},link]});
 const result=await c.copy({action:'COPY_EXISTING_LINK',url:link.href});
 assert.equal(result.status,'SUCCESS');assert.equal(result.item.url,link.href);
 assert.equal(c.copied['text/plain'],'[Target & name](https://target.example/path)');
 assert.match(c.copied['text/html'],/Target &amp; name/);
});
test('existing links fall back to URL for missing or stale snapshots and reject executable links',async()=>{
 const c=content({selection:'unrelated'});
 c.handlers.contextmenu({target:{closest:()=>({href:'https://old.example/',textContent:'Old',getAttribute:()=>null})}});
 await c.copy({action:'COPY_EXISTING_LINK',url:'https://new.example/'});
 assert.equal(c.copied['text/plain'],'[https://new.example/](https://new.example/)');
 assert.equal((await c.copy({action:'COPY_EXISTING_LINK',url:'javascript:alert(1)'})).status,'ERROR');
});
test('link context menu sends destination to content and saves returned item',async()=>{
 const requests=[];const item={text:'Link title',url:'https://target.example/'};
 const b=background({respond:request=>{requests.push(request);return request.action==='PING'?{status:'ALIVE'}:{status:'SUCCESS',item};}});
 await b.listeners.click({menuItemId:'copy-existing-hyperlink',frameId:9,linkUrl:item.url,pageUrl:'https://page.example/'},{id:4,url:'https://page.example/'});
 assert.equal(requests[1].action,'COPY_EXISTING_LINK');assert.equal(requests[1].url,item.url);
 assert.equal(b.data.history[0].text,item.text);assert.equal(b.badges[4],'OK');
});

test('help opens modally, prevents repeated opens and returns focus after close',()=>{
 const handlers={};let opens=0,focused=false;
 const dialog={open:false,showModal(){this.open=true;opens++;},close(){this.open=false;handlers.closed();},addEventListener:(_,fn)=>handlers.closed=fn};
 const open={focus(){focused=true;},addEventListener:(_,fn)=>handlers.open=fn};
 const close={addEventListener:(_,fn)=>handlers.close=fn};
 vm.runInNewContext(fs.readFileSync(srcPath('help.js'),'utf8'),{document:{getElementById:id=>({'help-dialog':dialog,'help-open':open,'help-close':close}[id]),addEventListener:(_,fn)=>fn()}});
 handlers.open();handlers.open();assert.equal(opens,1);assert.equal(dialog.open,true);
 handlers.close();assert.equal(dialog.open,false);assert.equal(focused,true);
});

test('label edits persist only text, preserve ordering and reject empty or deleted items',async()=>{
 const item={id:'edit-me',text:'Old',url:'https://example.com/',copiedAt:123};
 const b=background({history:[item]});const sender={url:'chrome-extension://test/sidepanel.html'};
 const send=request=>new Promise(resolve=>b.listeners.message(request,sender,resolve));
 assert.equal((await send({action:'UPDATE_HISTORY_TEXT',id:item.id,text:' New '})).status,'SUCCESS');
 assert.equal(b.data.history[0].text,'New');assert.equal(b.data.history[0].url,item.url);assert.equal(b.data.history[0].copiedAt,123);assert.equal(b.data.history[0].id,item.id);
 assert.equal((await send({action:'UPDATE_HISTORY_TEXT',id:item.id,text:' '})).status,'ERROR');
 assert.equal((await send({action:'UPDATE_HISTORY_TEXT',id:'deleted',text:'Text'})).status,'ERROR');
 assert.equal(b.data.history.length,1);
 assert.equal(b.listeners.message({action:'UPDATE_HISTORY_TEXT',id:item.id,text:'bad'},{url:'https://example.com/'},()=>assert.fail()),false);
});

test('editing then re-copying a tile preserves IDs, timestamps and order without restoring deleted tiles',async()=>{
 const initial=[{id:'a',text:'First',url:'https://a.example/',copiedAt:200},{id:'b',text:'Second',url:'https://b.example/',copiedAt:100}];
 const b=background({tabs:[{id:6}],history:initial});const sender={url:'chrome-extension://test/sidepanel.html'};
 await backgroundRequest(b,{action:'UPDATE_HISTORY_TEXT',id:'b',text:'Edited'},sender);
 const snapshot=JSON.stringify(b.data.history);
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{...b.data.history[1]}},sender);
 assert.equal(JSON.stringify(b.data.history),snapshot);assert.equal(b.badges[6],'OK');
 await backgroundRequest(b,{action:'DELETE_HISTORY',id:'b'},sender);
 await backgroundRequest(b,{action:'COPY_RESULT',success:true,item:{...initial[1],text:'Edited'}},sender);
 assert.equal(b.data.history.length,1);assert.equal(b.data.history[0].id,'a');
});
