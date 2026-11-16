// The in-chat card (waiting spec of loop-club-reach, design D2 and D2a).
//
// One self-contained page that an assistant with support for in-chat
// interfaces shows beside a tool result. It wears Loop's own panel (app/loop.css:
// tight corner, teal plate, pill buttons) in a light and a dark form, on a
// transparent page. It uses only the standard keys and
// the standard bridge of the MCP Apps extension (notes.md, "The bridge"): no
// package, nothing loaded from outside, and no object that only one assistant
// provides. It draws from the structured form of the result it is given and
// shows nothing the text form does not state. Its buttons call the same
// `answer` and `interested` tools the model calls, so every check is the
// server's; the card decides nothing.
//
// Every member-written word reaches the page through textContent. The script
// never builds markup from data.
//
// The address is a cache key: assistants may keep the page. Change the
// version in it whenever the page changes in a way an old copy would break.

export const CARD_URI='ui://loop/card-v2.html';
export const CARD_MIME='text/html;profile=mcp-app';

// No backtick and no dollar-brace inside: the page is one raw string.
export const CARD_HTML=String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Loop</title>
<style>
:root{color-scheme:light dark;
 --teal:oklch(37.3% 0.052 206);--lime:oklch(96.4% 0.19 117);--aqua:oklch(90.4% 0.1 194);--on:oklch(99.4% 0.003 230);
 --surface:light-dark(oklch(99.3% 0.003 230),oklch(24% 0.045 252));--ink:light-dark(oklch(35.4% 0.095 252),oklch(99.4% 0.003 230));
 --muted:light-dark(oklch(46.5% 0.012 245),oklch(99.4% 0.003 230 / .66));--line:light-dark(oklch(90.6% 0.008 240),oklch(99.4% 0.003 230 / .13));
 --line-2:light-dark(oklch(85.5% 0.011 240),oklch(99.4% 0.003 230 / .3));--hover:light-dark(oklch(95.3% 0.017 245),oklch(99.4% 0.003 230 / .09));
 --go:light-dark(oklch(47.6% 0.13 250),oklch(90.4% 0.1 194));--on-go:light-dark(oklch(99.4% 0.003 230),oklch(35.4% 0.095 252));--say:light-dark(oklch(37.3% 0.052 206),oklch(90.4% 0.1 194))}
html,body{margin:0;background:transparent}
body{font-family:Archivo,var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:14px;line-height:1.45;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
p,ul{margin:0}
.card{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:24px 24px 24px 6px;overflow:hidden}
.brand{display:flex;align-items:center;gap:8px;padding:11px 16px;background:var(--teal);color:var(--on);font-size:15px;font-weight:500;letter-spacing:-.03em}
.brand svg{width:20px;height:20px;flex:none;stroke:var(--aqua);stroke-width:9}
.brand .gap{stroke:var(--teal);stroke-width:15.3}
.brand .you{stroke:var(--lime)}
#loop{padding:13px 16px 15px}
.head{font-weight:500}
.item{padding:12px 0 0;margin:12px 0 0;border-top:1px solid var(--line)}
#loop>.item:first-child{padding-top:0;margin-top:0;border-top:0}
.meta{color:var(--muted);font:12px/1.4 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:0}
.quiet{color:var(--muted);font-size:12.5px}
.words{margin:3px 0 2px;font-size:15px;font-weight:500;letter-spacing:-.025em;white-space:pre-wrap}
.note{margin-top:6px;font-size:12.5px;font-weight:500;color:var(--say)}
.row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 2px}
.tally{padding:0;list-style:none}
button{min-height:32px;padding:5px 13px;border:0;border-radius:56px;font:inherit;font-size:13px;font-weight:500;color:inherit;cursor:pointer;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2)}
button:hover:enabled{background:var(--hover)}
button[aria-pressed="true"],button.go,button.go:hover:enabled{color:var(--on-go);background:var(--go);box-shadow:none}
button:focus-visible{outline:2px solid var(--go);outline-offset:2px}
button:disabled{opacity:.55;cursor:default}
</style>
</head>
<body>
<div class="card">
<div class="brand"><svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M14.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M29 35a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="you" d="M29 35a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M43.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path d="M43.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M43.26 40.49A21 21 0 0 1 54.64 51.36M54.64 68.64A21 21 0 0 1 43.26 79.51"/><path d="M42.58 40.23A21 21 0 0 1 54.93 52.03M54.93 67.97A21 21 0 0 1 42.58 79.77"/></svg><span>Loop</span></div>
<main id="loop" aria-live="polite"></main>
</div>
<script>
(function(){
'use strict';
var UNREACHABLE="Couldn't reach Loop. Try again";
var DENIED='This assistant no longer has access to this group. You can grant it on the Loop site.';
var SHOWN=5;
var root=document.getElementById('loop'),page=document.documentElement;
var pending={},nextId=1,ready=false,canCall=true,lastSize='',toolName=null,toolArgs=null,model={loading:true};

// The bridge: JSON-RPC 2.0 over postMessage with the host.
function post(message){window.parent.postMessage(message,'*');}
// A tool call may sit behind the assistant's own approval prompt, so it is given as long as the longest tool call an assistant allows.
function request(method,params,patience){
 return new Promise(function(resolve,reject){
  var id=nextId++;
  var timer=setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error('timeout'));}},patience||30000);
  pending[id]={resolve:resolve,reject:reject,timer:timer};
  post({jsonrpc:'2.0',id:id,method:method,params:params});
 });
}
function notify(method,params){post({jsonrpc:'2.0',method:method,params:params||{}});}
function size(){
 if(!ready)return;
 var box=page.getBoundingClientRect(),width=Math.ceil(box.width),height=Math.ceil(box.height),key=width+'x'+height;
 if(!height||key===lastSize)return;
 lastSize=key;notify('ui/notifications/size-changed',{width:width,height:height});
}
function context(given){
 if(!given||typeof given!=='object')return;
 if(given.theme==='light'||given.theme==='dark')page.style.colorScheme=given.theme;
 var values=given.styles&&given.styles.variables;
 if(values&&typeof values==='object')Object.keys(values).forEach(function(name){
  if(/^--[a-z0-9-]+$/.test(name)&&typeof values[name]==='string')page.style.setProperty(name,values[name]);
 });
 if(given.toolInfo&&given.toolInfo.tool&&typeof given.toolInfo.tool.name==='string')toolName=given.toolInfo.tool.name;
}
window.addEventListener('message',function(event){
 if(event.source!==window.parent)return;
 var message=event.data;
 if(!message||message.jsonrpc!=='2.0')return;
 if(message.method===undefined){
  var waiting=pending[message.id];
  if(!waiting)return;
  delete pending[message.id];clearTimeout(waiting.timer);
  if(message.error)waiting.reject(message.error);else waiting.resolve(message.result);
  return;
 }
 if(message.method==='ui/notifications/tool-input')toolArgs=(message.params&&message.params.arguments)||{};
 else if(message.method==='ui/notifications/tool-result')show(message.params);
 else if(message.method==='ui/notifications/tool-cancelled'){model={text:'Cancelled.'};draw();}
 else if(message.method==='ui/notifications/host-context-changed')context(message.params);
 else if(message.id!==undefined){
  if(message.method==='ui/resource-teardown'||message.method==='ping')post({jsonrpc:'2.0',id:message.id,result:{}});
  else post({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}});
 }
});

// Drawing. Data becomes text nodes only.
function el(tag,name,text){
 var node=document.createElement(tag);
 if(name)node.className=name;
 if(text!==undefined&&text!==null)node.textContent=String(text);
 return node;
}
function add(parent){for(var i=1;i<arguments.length;i++)if(arguments[i])parent.appendChild(arguments[i]);return parent;}
function button(label,pressed,off,tap){
 var node=el('button','',label);
 node.type='button';
 if(pressed!==null)node.setAttribute('aria-pressed',pressed?'true':'false');
 node.disabled=Boolean(off);
 node.addEventListener('click',tap);
 return node;
}
function textOf(result){
 var parts=result&&Array.isArray(result.content)?result.content:[],out=[];
 for(var i=0;i<parts.length;i++)if(parts[i]&&parts[i].type==='text')out.push(String(parts[i].text));
 return out.join('\n');
}
function eventTag(team,slug){return String(team.handle).split('/')[0]+'/'+slug;}
function when(event){
 if(event.starts)return event.starts+(event.ends?' to '+event.ends:'')+' ('+event.timezone+')';
 if(event.idea)return event.idea.day?'on '+event.idea.day+', no time yet':'no day yet';
 return 'no date set';
}

// The structured form of a result, as a list of things to draw.
function askEntry(team,ask){return {kind:'ask',team:team,ask:ask,picked:null,note:'',busy:false};}
function eventEntry(team,event,why){return {kind:'event',team:team,event:event,why:why||null,declined:false,note:'',busy:false};}
function read(result){
 var data=result&&result.structuredContent,text=textOf(result);
 if(!result||((!data||typeof data!=='object')&&!text))return {failed:UNREACHABLE,retry:true};
 // An assistant that passes on the text alone: its first line is shown.
 if(!data||typeof data!=='object')return {text:text.split('\n')[0]};
 if(result.isError)return data.error==='unavailable'?{failed:UNREACHABLE,retry:true}:{failed:data.error==='forbidden'?DENIED:text.split('\n')[0]||UNREACHABLE,retry:false};
 var entries=[],head='',empty='',more=[];
 if(Array.isArray(data.items)&&typeof data.count==='number'){
  head=data.count+(data.count===1?' thing':' things')+' from your groups.';
  empty='Nothing waiting from your groups.';
  data.items.forEach(function(item){
   if(item.kind==='ask')entries.push(askEntry(item.team,item.ask));
   else if(item.kind==='event'||item.kind==='idea')entries.push(eventEntry(item.team,item.event,item.kind==='idea'?item.why:null));
   else entries.push({kind:'record',team:item.team,record:item.record,mention:item.kind==='mention'});
  });
  (data.more||[]).forEach(function(rest){more.push(rest.count+' more waiting in '+rest.team.handle+'.');});
 }else if(data.events&&Array.isArray(data.events.items)&&data.team){
  head='Upcoming in '+data.team.handle;
  empty='No upcoming events.';
  data.events.items.forEach(function(event){entries.push(eventEntry(data.team,event));});
  if(data.events.more)more.push(data.events.more+' more not shown.');
 }else if(data.event&&data.team)entries.push(eventEntry(data.team,data.event));
 else if(data.ask&&data.team)entries.push(askEntry(data.team,data.ask));
 else if(data.open&&Array.isArray(data.open.items)&&data.team){
  head='Open asks in '+data.team.handle;
  empty='No open asks.';
  data.open.items.forEach(function(ask){entries.push(askEntry(data.team,ask));});
  if(data.open.more)more.push(data.open.more+' more not shown.');
 }else return {text:text.split('\n')[0]};
 return {head:head,empty:empty,entries:entries,more:more};
}

// A button tap: the same tool the model calls, marked as coming from the card.
function refusal(data){
 return data.reason==='busy'?'Loop was busy. Try again.'
  :data.reason==='cap'?'Too many changes this hour. Try again later.'
  :data.reason==='members_only'?'Only members of the group can do this.'
  :data.reason==='not_in'?'Only those who are in on the idea can answer.'
  :'Not saved.';
}
function act(entry,name,args,done){
 if(entry.busy||!canCall)return;
 entry.busy=true;entry.note='';draw();
 args.via='card';
 request('tools/call',{name:name,arguments:args},250000).then(function(result){
  var data=result&&result.structuredContent;
  entry.busy=false;
  entry.note=!data||typeof data!=='object'||data.error==='unavailable'?UNREACHABLE:data.error==='forbidden'?DENIED:data.error==='not_found'?'This is no longer there.':data.error?'Not saved.':done(data);
  draw();
 },function(){entry.busy=false;entry.note=UNREACHABLE;draw();});
}
function answer(entry,choices){
 act(entry,'answer',{team:entry.team.handle,number:entry.ask.number,choices:choices},function(data){
  if(data.ask)entry.ask=data.ask;
  // A refused choice stays picked, to be changed and sent again.
  if(data.saved||data.reason==='closed')entry.picked=null;
  return data.saved?'Saved.':data.reason==='closed'?'Nothing was saved.':refusal(data);
 });
}
function interest(entry,args){
 args.team=eventTag(entry.team,entry.event.slug);
 act(entry,'interested',args,function(data){
  if(!data.saved)return data.reason==='unknown_event'?'This event is no longer there.':refusal(data);
  entry.event=data.event;entry.declined=Boolean(data.declined);
  return data.declined?'Noted. It will not be offered to you again.':data.interested?'Saved.':'Saved. You are no longer in.';
 });
}

function drawAsk(entry){
 var ask=entry.ask,box=el('section','item'),mine=ask.yourAnswer,tally={};
 var chosen=mine?mine.choices.map(function(choice){return choice.number;}):[];
 (ask.results||[]).forEach(function(option){tally[option.number]=option.count;});
 add(box,el('p','meta','Ask #'+ask.number+' in '+entry.team.handle+', '+(ask.open?'closes ':'closed ')+ask.closes+' ('+ask.timezone+'). '+ask.answered+' of '+ask.expected+' answered.'));
 add(box,el('p','words',ask.question));
 if(!ask.open){
  add(box,el('p','note','This ask has closed.'));
  if(ask.results&&ask.options.length){
   var list=el('ul','tally quiet');
   ask.options.forEach(function(option){add(list,el('li','',option.label+': '+(tally[option.number]||0)));});
   add(box,list);
  }
 }else if(ask.kind==='text')add(box,el('p','quiet','It takes a written answer: tell your assistant what to say.'));
 else{
  var row=el('div','row'),many=ask.kind!=='one';
  if(many&&!entry.picked)entry.picked=chosen.slice();
  ask.options.forEach(function(option){
   var on=(many?entry.picked:chosen).indexOf(option.number)>=0;
   add(row,button(option.label+(ask.results?' ('+(tally[option.number]||0)+')':''),on,entry.busy||!canCall,function(){
    if(!many){answer(entry,[option.number]);return;}
    var at=entry.picked.indexOf(option.number);
    if(at>=0)entry.picked.splice(at,1);else entry.picked.push(option.number);
    draw();
   }));
  });
  add(box,row);
  if(!canCall)add(box,el('p','quiet','To answer, tell your assistant.'));
  if(many)add(box,button('Save',null,entry.busy||!canCall||!entry.picked.length,function(){answer(entry,entry.picked.slice().sort(function(a,b){return a-b;}));}));
 }
 if(mine)add(box,el('p','quiet','You answered: '+(typeof mine.text==='string'?mine.text:mine.choices.map(function(choice){return choice.label;}).join(', '))+'.'));
 if(entry.note)add(box,el('p','note',entry.note));
 return box;
}
function drawEvent(entry){
 var event=entry.event,idea=event.idea,box=el('section','item');
 var yours={needs_place:'It needs a place from you: tell your assistant.',needs_time:'It needs a start time from you: tell your assistant.',choose_day:'The day is yours to choose: tell your assistant.'}[entry.why];
 var open=!event.archived&&(!idea||idea.state==='idea'||idea.state==='planned');
 add(box,el('p','meta',(idea?(idea.state==='planned'?'Plan ':'Idea '):'Event ')+eventTag(entry.team,event.slug)+': '+when(event)+'.'));
 add(box,el('p','words',event.name));
 if(event.place)add(box,el('p','quiet','Place: '+event.place));
 add(box,el('p','quiet',event.interested+(idea?' in':' interested')+(event.youAreInterested?', including you':'')+(idea&&idea.state==='idea'&&idea.needs?', needs '+idea.needs+' more':'')+'.'));
 if(yours)add(box,el('p','quiet',yours));
 else if(open){
  var row=el('div','row');
  // Taking a mark back can cancel a calendar entry, so it is its own plainly named button, never a second tap on "I'm in".
  if(event.youAreInterested)add(row,button('Take it back',null,entry.busy||!canCall,function(){interest(entry,{interested:false});}));
  else{
   add(row,button("I'm in",null,entry.busy||!canCall,function(){interest(entry,{interested:true});})).lastChild.className='go';
   if(!entry.declined)add(row,button('Not for me',null,entry.busy||!canCall,function(){interest(entry,{notForMe:true});}));
  }
  add(box,row);
  if(!canCall)add(box,el('p','quiet','To respond, tell your assistant.'));
 }
 if(entry.note)add(box,el('p','note',entry.note));
 return box;
}
function drawRecord(entry){
 var record=entry.record,box=el('section','item');
 var kind={output:'Output',decision:'Decision',claim:'Claim',announcement:'Announcement'}[record.kind]||'Record';
 var words=record.text||record.statement||record.what||record.title;
 add(box,el('p','meta',(entry.mention?'Mentions you in '+entry.team.handle+': '+kind+' #'+record.number:'Announcement in '+entry.team.handle)+'.'));
 if(words)add(box,el('p','words',words));
 return box;
}
function retry(){
 model={loading:true};draw();
 request('tools/call',{name:toolName,arguments:toolArgs||{}},250000).then(show,function(){model={failed:UNREACHABLE,retry:true};draw();});
}
function draw(){
 root.textContent='';
 if(model.loading)add(root,el('p','quiet','Loading from Loop'));
 else if(model.failed){
  add(root,el('p','note',model.failed));
  // Only a read is asked for again; a write is never repeated by the card on its own.
  if(model.retry&&(toolName==='waiting'||toolName==='events'||toolName==='ask_results'))add(root,el('div','row')).appendChild(button('Try again',null,false,retry));
 }else if(model.text!==undefined)add(root,el('p','',model.text));
 else{
  if(!model.entries.length)add(root,el('p','head',model.empty||model.head));
  else if(model.head)add(root,el('p','head',model.head));
  model.entries.slice(0,SHOWN).forEach(function(entry){add(root,entry.kind==='ask'?drawAsk(entry):entry.kind==='event'?drawEvent(entry):drawRecord(entry));});
  if(model.entries.length>SHOWN)add(root,el('p','quiet item',(model.entries.length-SHOWN)+' more: ask your assistant to list them.'));
  model.more.forEach(function(line){add(root,el('p','quiet',line));});
 }
 size();
}
function show(result){model=read(result);draw();}

draw();
if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(page);
request('ui/initialize',{appInfo:{name:'loop-card',version:'1'},appCapabilities:{},protocolVersion:'2026-01-26'}).then(function(result){
 context(result&&result.hostContext);
 // An assistant that draws cards and passes on no tool calls: the controls are shown switched off.
 if(result&&result.hostCapabilities&&!result.hostCapabilities.serverTools){canCall=false;draw();}
 notify('ui/notifications/initialized');
 ready=true;size();
},function(){
 // No answer to the handshake: the card still reports its size, so whatever arrives is not drawn at no height.
 ready=true;size();
});
})();
</script>
</body>
</html>
`;
