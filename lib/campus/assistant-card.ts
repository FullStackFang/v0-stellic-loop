// The in-chat card of the going-out tools (openspec campus-assistant-tools, design D9), in the team card's look
// (lib/emba/team-card.ts, "B Panel"): teal plate header, rows with small faces, pill buttons, the tight corner, a light
// and a dark form on a transparent page. Mockup: public/demo/mockups-six-adds.html, section 4.
//
// It uses only the standard bridge of the MCP Apps extension and loads nothing: faces are initials in discs, since a
// picture would have to be loaded or sent to the model. Its Join and Close the loop buttons call the same tools the
// model calls, with the code the result's _meta gave the card (design D6); every check is the server's.
// Every word from data reaches the page through textContent.
//
// The address is a cache key: change its version whenever the page changes in a way an old copy would break.

export const CAMPUS_CARD_URI = 'ui://loop/campus-card-v1.html';
export { CARD_MIME } from '../emba/team-card';

// No backtick and no dollar-brace inside: the page is one raw string.
export const CAMPUS_CARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Loopd</title>
<style>
:root{color-scheme:light dark;
 --teal:oklch(37.3% 0.052 206);--lime:oklch(96.4% 0.19 117);--aqua:oklch(90.4% 0.1 194);--on:oklch(99.4% 0.003 230);
 --surface:light-dark(oklch(99.3% 0.003 230),oklch(24% 0.045 252));--ink:light-dark(oklch(35.4% 0.095 252),oklch(99.4% 0.003 230));
 --muted:light-dark(oklch(46.5% 0.012 245),oklch(99.4% 0.003 230 / .66));--line:light-dark(oklch(90.6% 0.008 240),oklch(99.4% 0.003 230 / .13));
 --line-2:light-dark(oklch(85.5% 0.011 240),oklch(99.4% 0.003 230 / .3));--hover:light-dark(oklch(95.3% 0.017 245),oklch(99.4% 0.003 230 / .09));
 --go:light-dark(oklch(47.6% 0.13 250),oklch(90.4% 0.1 194));--on-go:light-dark(oklch(99.4% 0.003 230),oklch(35.4% 0.095 252));--say:light-dark(oklch(37.3% 0.052 206),oklch(90.4% 0.1 194));
 --disc:light-dark(oklch(93% 0.05 194),oklch(37.3% 0.052 206))}
html,body{margin:0;background:transparent}
body{font-family:Archivo,var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:14px;line-height:1.45;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
p{margin:0}
.card{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:24px 24px 24px 6px;overflow:hidden}
.brand{display:flex;align-items:center;gap:8px;padding:9px 16px;background:var(--teal);color:var(--on);font-size:15px;font-weight:500;letter-spacing:-.03em}
.brand svg{width:20px;height:20px;flex:none;stroke:var(--aqua);stroke-width:9}
.brand .gap{stroke:var(--teal);stroke-width:15.3}
.brand .you{stroke:var(--lime)}
.chip{margin-left:auto;font-size:12px;padding:2px 9px;border-radius:999px;background:var(--lime);color:oklch(35.4% 0.095 252);letter-spacing:-.01em}
#loop{padding:11px 16px 13px}
.item{display:flex;align-items:center;gap:10px;padding:10px 0 0;margin:10px 0 0;border-top:1px solid var(--line)}
#loop>.item:first-child{padding-top:0;margin-top:0;border-top:0}
.grow{flex:1;min-width:0}
.words{font-size:15px;font-weight:500;letter-spacing:-.025em}
.meta{color:var(--muted);font:12px/1.4 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:0}
.quiet{color:var(--muted);font-size:12.5px}
.note{margin-top:6px;font-size:12.5px;font-weight:500;color:var(--say)}
.ask{display:block}
.with{display:flex;align-items:center;gap:8px;margin:8px 0 0;font-weight:500}
.row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.faces{display:flex;flex:none}
.faces i{width:24px;height:24px;margin-left:-6px;border-radius:50%;display:grid;place-items:center;font:600 11px/1 system-ui,sans-serif;font-style:normal;background:var(--disc);color:var(--ink);box-shadow:0 0 0 2px var(--surface)}
.faces i:first-child{margin-left:0}
.with .faces i{width:30px;height:30px;font-size:13px}
button{flex:none;min-height:32px;padding:5px 13px;border:0;border-radius:56px;font:inherit;font-size:13px;font-weight:500;color:inherit;cursor:pointer;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2)}
button:hover:enabled{background:var(--hover)}
button[aria-pressed="true"],button.go,button.go:hover:enabled{color:var(--on-go);background:var(--go);box-shadow:none}
button:focus-visible{outline:2px solid var(--go);outline-offset:2px}
button:disabled{opacity:.55;cursor:default}
</style>
</head>
<body>
<div class="card">
<div class="brand"><svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M14.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M29 35a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="you" d="M29 35a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M43.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path d="M43.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M43.26 40.49A21 21 0 0 1 54.64 51.36M54.64 68.64A21 21 0 0 1 43.26 79.51"/><path d="M42.58 40.23A21 21 0 0 1 54.93 52.03M54.93 67.97A21 21 0 0 1 42.58 79.77"/></svg><span id="head">Loopd</span><span class="chip" id="chip" hidden></span></div>
<main id="loop" aria-live="polite"></main>
</div>
<script>
(function(){
'use strict';
var UNREACHABLE="Couldn't reach Loopd. Try again";
var root=document.getElementById('loop'),head=document.getElementById('head'),chip=document.getElementById('chip'),page=document.documentElement;
var pending={},nextId=1,ready=false,canCall=true,lastSize='',model={loading:true};

// The bridge: JSON-RPC 2.0 over postMessage with the host.
function post(message){window.parent.postMessage(message,'*');}
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
 if(message.method==='ui/notifications/tool-result')show(message.params);
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
function button(label,go,off,tap){
 var node=el('button',go?'go':'',label);
 node.type='button';node.disabled=Boolean(off);
 node.addEventListener('click',tap);
 return node;
}
function textOf(result){
 var parts=result&&Array.isArray(result.content)?result.content:[],out=[];
 for(var i=0;i<parts.length;i++)if(parts[i]&&parts[i].type==='text')out.push(String(parts[i].text));
 return out.join('\n');
}
function names(list){return list.length<2?list.join(''):list.slice(0,-1).join(', ')+' and '+list[list.length-1];}
function faces(list){
 var box=el('span','faces');
 list.slice(0,4).forEach(function(name){add(box,el('i','',String(name).charAt(0).toUpperCase()));});
 return list.length?box:null;
}
function when(event){return event.day+' '+event.time+(event.walk?' · '+event.walk+' min walk':'');}
function people(event){return event.known.length?names(event.known.concat(event.others?[event.others+(event.others===1?' other':' others')]:[])):event.going?event.going+' going':'Nobody in yet';}

// The structured form of a result, as what to draw.
function read(result){
 var data=result&&result.structuredContent,text=textOf(result),meta=result&&result._meta;
 if(!result||((!data||typeof data!=='object')&&!text))return {failed:UNREACHABLE};
 if(!data||typeof data!=='object'||result.isError)return {text:text.split('\n')[0]||UNREACHABLE};
 if(Array.isArray(data.events))return {kind:'find',head:{today:'Today',tonight:'Tonight',tomorrow:'Tomorrow',week:'This week'}[data.when]+' at '+data.campus,count:data.events.length+(data.more||0),
  entries:data.events.map(function(event){return {event:event,busy:false,note:''};})};
 if(data.whosIn&&data.saved===undefined)return {kind:'find',head:'Who is in',entries:[{event:data.whosIn,busy:false,note:''}]};
 if(data.whosIn&&data.saved)return {kind:'find',head:data.interested?'Marked interested':'Mark taken back',entries:[{event:data.whosIn,busy:false,note:''}]};
 if(data.pending===true&&data.event&&meta&&typeof meta.tap==='string')return {kind:data.action,data:data,code:meta.tap,busy:false,note:'',dismissed:false};
 if(data.saved===true&&(data.action==='join'||data.action==='close'))return {kind:'done',data:data};
 return {text:text.split('\n')[0]};
}
function call(name,args,then,fail){
 request('tools/call',{name:name,arguments:args},250000).then(function(result){
  var data=result&&result.structuredContent;
  if(!data||typeof data!=='object'||data.error)fail(UNREACHABLE);else then(data,textOf(result));
 },function(){fail(UNREACHABLE);});
}
// Interested is the model's own tool: the card calls it as the model would.
function interest(entry){
 if(entry.busy||!canCall)return;
 var on=entry.event.you!=='interested';
 entry.busy=true;entry.note='';draw();
 call('interested',{event:entry.event.event,on:on},function(data,text){
  entry.busy=false;
  if(data.saved&&data.whosIn)entry.event=data.whosIn;else entry.note=text.split('\n')[0];
  draw();
 },function(note){entry.busy=false;entry.note=note;draw();});
}
// The press: the step's own tool with the code only the card was given.
function press(){
 if(model.busy||!canCall)return;
 var tool=model.kind==='join'?'join':'close_loop';
 model.busy=true;model.note='';draw();
 call(tool,{event:model.data.event.event,code:model.code},function(data,text){
  if(data.saved===true){model={kind:'done',data:data};draw();return;}
  model.busy=false;model.note=text.split('\n')[0];draw();
 },function(note){model.busy=false;model.note=note;draw();});
}
function drawRow(entry){
 var event=entry.event,box=el('section','item'),words=el('div','grow');
 add(words,el('p','words',event.title),el('p','meta',when(event)),el('p','quiet',people(event)+(event.interestedToo&&event.interestedToo.length?' · '+names(event.interestedToo)+' interested too':'')));
 if(entry.note)add(words,el('p','note',entry.note));
 add(box,words,faces(event.known));
 if(event.you==='in')add(box,el('span','quiet','You are in'));
 else{var pill=button('Interested',false,entry.busy||!canCall,function(){interest(entry);});pill.setAttribute('aria-pressed',event.you==='interested'?'true':'false');add(box,pill);}
 return box;
}
function drawAsk(){
 var data=model.data,event=data.event,box=el('section','ask'),join=model.kind==='join';
 add(box,el('p','words',event.title));
 if(event.day)add(box,el('p','meta',when(event)+(event.place?' · '+event.place:'')));
 var who=join?data.with:null,line=join?(who.known.length?'With '+names(who.known.concat(who.others?[who.others+(who.others===1?' other':' others')]:[])):who.others?'With '+who.others+(who.others===1?' person':' people')+' you do not know yet':'You would start a new group')
  :data.checkedIn+' of '+data.of+' checked in';
 add(box,add(el('div','with'),faces(join?who.known:[]),el('span','',line)));
 if(model.dismissed)add(box,el('p','note',join?'Not joined.':'Not closed.'));
 else{
  var row=el('div','row');
  add(row,button(join?'Join':'Close the loop',true,model.busy||!canCall,press),button(join?'Not now':'Not yet',false,model.busy,function(){model.dismissed=true;draw();}));
  add(box,row);
  if(!canCall)add(box,el('p','quiet','Open the link your assistant gave you to do this in Loopd.'));
 }
 if(model.note)add(box,el('p','note',model.note));
 return box;
}
function drawDone(){
 var data=model.data,box=el('section','ask');
 add(box,el('p','words',data.title));
 add(box,el('p','quiet',data.action==='join'?'Check in on your phone when you get there. An assistant cannot do that part.':data.checkedIn+' of '+data.of+' checked in. The loop is closed for you.'));
 return box;
}
function draw(){
 root.textContent='';
 var count=model.kind==='find'?model.count:0;
 chip.hidden=!count;chip.textContent=count?String(count):'';
 head.textContent=model.kind==='find'?model.head:model.kind==='join'?'Join this plan?':model.kind==='close'?'Close the loop?':model.kind==='done'?(model.data.action==='join'?(model.data.joined?'You are in':'Already in'):'Loop closed'):'Loopd';
 if(model.loading)add(root,el('p','quiet','Loading from Loopd'));
 else if(model.failed)add(root,el('p','note',model.failed));
 else if(model.text!==undefined)add(root,el('p','',model.text));
 else if(model.kind==='find'){
  if(!model.entries.length)add(root,el('p','quiet','Nothing on Loopd for this yet.'));
  model.entries.forEach(function(entry){add(root,drawRow(entry));});
 }else if(model.kind==='done')add(root,drawDone());
 else add(root,drawAsk());
 size();
}
function show(result){model=read(result);draw();}

draw();
if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(page);
request('ui/initialize',{appInfo:{name:'loop-campus-card',version:'1'},appCapabilities:{},protocolVersion:'2026-01-26'}).then(function(result){
 context(result&&result.hostContext);
 if(result&&result.hostCapabilities&&!result.hostCapabilities.serverTools){canCall=false;draw();}
 notify('ui/notifications/initialized');
 ready=true;size();
},function(){ready=true;size();});
})();
</script>
</body>
</html>
`;
