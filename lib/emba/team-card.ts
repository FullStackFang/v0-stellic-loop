// The in-chat card (waiting spec of loop-club-reach, design D2 and D2a).
//
// One self-contained page that an assistant with support for in-chat
// interfaces shows beside a tool result. It wears Loop's own panel (app/loop.css:
// tight corner, teal plate, pill buttons) in a light and a dark form, on a
// transparent page. An ask is drawn by its kind: pills for a choice, day tiles
// with a calendar for a dates ask, where the member may add days. It uses only the standard keys and
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

export const CARD_URI='ui://loop/card-v3.html';
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
.brand{display:flex;align-items:center;gap:8px;padding:9px 16px;background:var(--teal);color:var(--on);font-size:15px;font-weight:500;letter-spacing:-.03em}
.brand svg{width:20px;height:20px;flex:none;stroke:var(--aqua);stroke-width:9}
.brand .gap{stroke:var(--teal);stroke-width:15.3}
.brand .you{stroke:var(--lime)}
#loop{padding:11px 16px 13px}
.head{font-weight:500}
.item{padding:10px 0 0;margin:10px 0 0;border-top:1px solid var(--line)}
#loop>.item:first-child{padding-top:0;margin-top:0;border-top:0}
.meta{color:var(--muted);font:12px/1.4 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:0}
.quiet{color:var(--muted);font-size:12.5px}
.words{margin:3px 0 2px;font-size:15px;font-weight:500;letter-spacing:-.025em;white-space:pre-wrap}
.note{margin-top:6px;font-size:12.5px;font-weight:500;color:var(--say)}
.row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
.tally{padding:0;list-style:none}
button{min-height:32px;padding:5px 13px;border:0;border-radius:56px;font:inherit;font-size:13px;font-weight:500;color:inherit;cursor:pointer;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2)}
button:hover:enabled{background:var(--hover)}
button[aria-pressed="true"],button.go,button.go:hover:enabled{color:var(--on-go);background:var(--go);box-shadow:none}
button:focus-visible{outline:2px solid var(--go);outline-offset:2px}
button:disabled{opacity:.55;cursor:default}
.chip{margin-left:auto;font-size:12px;padding:2px 9px;border-radius:999px;background:var(--lime);color:oklch(35.4% 0.095 252);letter-spacing:-.01em}
.top{display:flex;gap:10px;align-items:baseline}.top .meta{flex:1;min-width:0}
.tick{flex:none;font-size:12px;font-weight:500;color:var(--say);white-space:nowrap}
.split{flex-wrap:nowrap;align-items:flex-start}.picks{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0}.acts{display:flex;gap:6px;flex:none}
button.icon{width:32px;padding:0;font-size:15px;line-height:1}
.sw{flex:1;min-width:0}.sw+.acts{align-items:center;height:54px}
.strip{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.strip::-webkit-scrollbar{display:none}.strip>*{flex:none}
.strip.more{-webkit-mask:linear-gradient(90deg,black calc(100% - 32px),transparent);mask:linear-gradient(90deg,black calc(100% - 32px),transparent)}
.strip.less{-webkit-mask:linear-gradient(90deg,transparent,black 32px);mask:linear-gradient(90deg,transparent,black 32px)}
.strip.less.more{-webkit-mask:linear-gradient(90deg,transparent,black 32px,black calc(100% - 32px),transparent);mask:linear-gradient(90deg,transparent,black 32px,black calc(100% - 32px),transparent)}
.rail{display:none;position:relative;height:3px;margin:7px 0 0;border-radius:3px;background:var(--line)}.rail.on{display:block}.rail i{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--go)}
button.day,button.cell{position:relative}
button.day{min-height:54px;width:58px;padding:5px 0 6px;border-radius:12px 12px 12px 4px;display:grid;justify-items:center;align-content:center;line-height:1.15}
.day i{font:10.5px/1.2 ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-style:normal;letter-spacing:0;text-transform:uppercase;opacity:.75}.day b{font-size:17px;font-weight:500;letter-spacing:-.03em}
s{position:absolute;top:3px;right:3px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;text-decoration:none;text-align:center;background:var(--lime);color:oklch(35.4% 0.095 252);font:600 10px/15px system-ui,sans-serif;letter-spacing:0}
button.plus{width:58px;min-height:54px;padding:0;border-radius:12px 12px 12px 4px;box-shadow:none;border:1px dashed var(--line-2);background:transparent;color:var(--muted);font-size:22px;font-weight:300}
button.plus[aria-pressed="true"]{color:var(--on-go);background:var(--go);border-color:transparent}
.cal{margin:9px 0 0;padding:8px 10px 10px;border-radius:16px 16px 16px 4px;background:var(--hover)}
.calhead{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:500;margin-bottom:2px}
.calhead button{min-height:26px;width:26px;box-shadow:none;background:transparent;font-size:17px}
.calgrid{display:grid;grid-template-columns:repeat(7,minmax(0,44px));justify-content:space-between;gap:2px;justify-items:center}
.dow{font:10.5px/1.6 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--muted)}
button.cell{width:32px;min-height:27px;padding:0;border-radius:9px 9px 9px 3px;box-shadow:none;background:transparent;font-size:12.5px}
button.cell.offered{box-shadow:inset 0 0 0 1px var(--line-2);background:var(--surface)}
button.cell[aria-pressed="true"]{color:var(--on-go);background:var(--go);box-shadow:none}
.cell s{top:-4px;right:-3px;min-width:13px;height:13px;padding:0 2px;border-radius:7px;font-size:9px;line-height:13px}
</style>
</head>
<body>
<div class="card">
<div class="brand"><svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M14.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M29 35a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="you" d="M29 35a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M43.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path d="M43.5 60a21 21 0 1 0 42 0a21 21 0 1 0 -42 0"/><path class="gap" d="M43.26 40.49A21 21 0 0 1 54.64 51.36M54.64 68.64A21 21 0 0 1 43.26 79.51"/><path d="M42.58 40.23A21 21 0 0 1 54.93 52.03M54.93 67.97A21 21 0 0 1 42.58 79.77"/></svg><span>Loop</span><span class="chip" id="chip" hidden></span></div>
<main id="loop" aria-live="polite"></main>
</div>
<script>
(function(){
'use strict';
var UNREACHABLE="Couldn't reach Loop. Try again";
var DENIED='This assistant no longer has access to this group. You can grant it on the Loop site.';
var SHOWN=5;
var root=document.getElementById('loop'),chip=document.getElementById('chip'),page=document.documentElement;
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],strips=[];
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
function askEntry(team,ask){return {kind:'ask',team:team,ask:ask,picked:null,days:null,added:[],cal:null,show:null,scroll:0,note:'',busy:false};}
function eventEntry(team,event,why){return {kind:'event',team:team,event:event,why:why||null,declined:false,note:'',busy:false};}
function read(result){
 var data=result&&result.structuredContent,text=textOf(result);
 if(!result||((!data||typeof data!=='object')&&!text))return {failed:UNREACHABLE,retry:true};
 // An assistant that passes on the text alone: its first line is shown.
 if(!data||typeof data!=='object')return {text:text.split('\n')[0]};
 if(result.isError)return data.error==='unavailable'?{failed:UNREACHABLE,retry:true}:{failed:data.error==='forbidden'?DENIED:text.split('\n')[0]||UNREACHABLE,retry:false};
 var entries=[],head='',empty='',more=[],count='';
 if(Array.isArray(data.items)&&typeof data.count==='number'){
  count=data.count+' waiting';
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
 return {head:head,empty:empty,entries:entries,more:more,count:count};
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
function answer(entry,args){
 args.team=entry.team.handle;args.number=entry.ask.number;
 act(entry,'answer',args,function(data){
  if(data.ask)entry.ask=data.ask;
  // A refused choice stays picked, to be changed and sent again.
  if(data.saved||data.reason==='closed'){entry.picked=null;entry.days=null;entry.added=[];entry.cal=null;}
  return data.saved?'Saved.':data.reason==='closed'?'Nothing was saved.':data.reason==='add_days'?'A day you added cannot be used. Nothing was saved.':refusal(data);
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

// Days are handled as YYYY-MM-DD and read as calendar days, never as moments.
function pad(n){return n<10?'0'+n:String(n);}
function isDay(text){return /^\d{4}-\d\d-\d\d$/.test(text);}
function dayParts(day){
 var date=new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7))-1,Number(day.slice(8,10))));
 return [DOW[date.getUTCDay()],String(date.getUTCDate()),MONTHS[date.getUTCMonth()].slice(0,3)];
}
function today(){var now=new Date();return now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());}
function same(a,b){return a.slice().sort().join()===b.slice().sort().join();}
function icon(sign,label,off,tap,name){var node=button(sign,null,off,tap);node.className='icon'+(name?' '+name:'');node.setAttribute('aria-label',label);return node;}
function askTop(entry){
 var ask=entry.ask,top=el('div','top');
 top.title=ask.timezone;
 add(top,el('p','meta',entry.team.handle+' #'+ask.number+' · '+(ask.open?'closes ':'closed ')+String(ask.closes).replace(/ 20\d\d,/,',')+' · '+ask.answered+' of '+ask.expected+' answered'));
 if(entry.note==='Saved.')add(top,el('span','tick','✓ Saved'));
 return top;
}
// The offered days as tiles on one line that scrolls sideways, each with how many picked it. The calendar adds days; nothing is sent until the check.
function drawDays(entry,box,chosen,tally,off){
 var ask=entry.ask,known={},saved=[],all=[];
 ask.options.forEach(function(option){known[option.label]=option.number;all.push(option.label);if(chosen.indexOf(option.number)>=0)saved.push(option.label);});
 if(!entry.days)entry.days=saved.slice();
 entry.added.forEach(function(day){if(all.indexOf(day)<0)all.push(day);});
 all.sort();
 var votes=function(day){return (known[day]?tally[known[day]]||0:0)-(saved.indexOf(day)>=0?1:0)+(entry.days.indexOf(day)>=0?1:0);};
 var flip=function(day){
  var at=entry.days.indexOf(day);
  if(at>=0)entry.days.splice(at,1);else entry.days.push(day);
  if(all.indexOf(day)<0)entry.added.push(day);
  entry.show=day;entry.note='';draw();
 };
 var row=el('div','row split'),sw=el('div','sw'),strip=el('div','picks strip'),rail=add(el('div','rail'),el('i')),acts=el('div','acts'),shown=null;
 all.forEach(function(day){
  var words=dayParts(day),count=votes(day),tile=button('',entry.days.indexOf(day)>=0,off,function(){flip(day);});
  tile.className='day';tile.setAttribute('aria-label',words.join(' ')+(count?', '+count+' picked':''));
  add(tile,el('i','',words[0]),el('b','',words[1]),el('i','',words[2]),count?el('s','',count):null);
  if(day===entry.show)shown=tile;
  add(strip,tile);
 });
 strip.addEventListener('scroll',function(){entry.scroll=strip.scrollLeft;edge(strip,rail);});
 strips.push({entry:entry,strip:strip,rail:rail,shown:shown});
 if(canCall){
  var plus=button(entry.cal?'×':'+',Boolean(entry.cal),entry.busy,function(){
   var from=entry.days.slice().sort()[0]||all[0]||today();
   if(from<today())from=today();
   entry.cal=entry.cal?null:{y:Number(from.slice(0,4)),m:Number(from.slice(5,7))-1};draw();
  });
  plus.className='plus';plus.setAttribute('aria-label',entry.cal?'Close the calendar':'Add days');add(acts,plus);
 }
 if(!same(entry.days,saved)){
  add(acts,icon('✓','Save',off,function(){
   var keep=[],fresh=[],args={};
   entry.days.forEach(function(day){if(known[day])keep.push(known[day]);else fresh.push(day);});
   if(keep.length)args.choices=keep.sort(function(a,b){return a-b;});
   if(fresh.length)args.addDays=fresh.sort();
   if(!keep.length&&!fresh.length)args.remove=true;
   answer(entry,args);
  },'go'),icon('✕','Put back',entry.busy,function(){entry.days=null;entry.added=[];entry.cal=null;entry.note='';draw();}));
 }
 add(box,add(row,add(sw,strip,rail),acts));
 if(entry.cal&&canCall)add(box,calendar(entry,all,votes,flip,off));
}
function calendar(entry,all,votes,flip,off){
 var at=entry.cal,box=el('div','cal'),head=el('div','calhead'),grid=el('div','calgrid'),now=today();
 var lead=(new Date(at.y,at.m,1).getDay()+6)%7,last=new Date(at.y,at.m+1,0).getDate(),n;
 var turn=function(by){return function(){at.m+=by;if(at.m<0){at.m=11;at.y--;}if(at.m>11){at.m=0;at.y++;}draw();};};
 add(head,icon('‹','Earlier month',false,turn(-1)),el('span','',MONTHS[at.m]+' '+at.y),icon('›','Later month',false,turn(1)));
 ['M','T','W','T','F','S','S'].forEach(function(letter){add(grid,el('span','dow',letter));});
 for(n=0;n<lead;n++)add(grid,el('span'));
 for(n=1;n<=last;n++)(function(n){
  var day=at.y+'-'+pad(at.m+1)+'-'+pad(n),count=votes(day),cell=button(String(n),entry.days.indexOf(day)>=0,off||day<now,function(){flip(day);});
  cell.className='cell'+(all.indexOf(day)>=0?' offered':'');
  cell.setAttribute('aria-label',dayParts(day).join(' ')+(count?', '+count+' picked':''));
  add(grid,add(cell,count?el('s','',count):null));
 })(n);
 return add(box,head,grid);
}
function edge(strip,rail){
 var max=strip.scrollWidth-strip.clientWidth,part=strip.scrollWidth?strip.clientWidth/strip.scrollWidth*100:100;
 strip.classList.toggle('more',strip.scrollLeft<max-2);strip.classList.toggle('less',strip.scrollLeft>2);rail.classList.toggle('on',max>2);
 rail.firstChild.style.width=part+'%';rail.firstChild.style.left=(max>0?strip.scrollLeft/max*(100-part):0)+'%';
}
function drawAsk(entry){
 var ask=entry.ask,box=el('section','item'),mine=ask.yourAnswer,tally={},off=entry.busy||!canCall;
 var chosen=mine?mine.choices.map(function(choice){return choice.number;}):[];
 var days=ask.kind==='dates'&&ask.options.every(function(option){return isDay(option.label);});
 (ask.results||[]).forEach(function(option){tally[option.number]=option.count;});
 add(box,askTop(entry),el('p','words',ask.question));
 if(!ask.open){
  add(box,el('p','note','This ask has closed.'));
  if(ask.results&&ask.options.length){
   var list=el('ul','tally quiet');
   ask.options.forEach(function(option){add(list,el('li','',(days?dayParts(option.label).join(' '):option.label)+': '+(tally[option.number]||0)));});
   add(box,list);
  }
 }else if(ask.kind==='text')add(box,el('p','quiet','It takes a written answer: tell your assistant what to say.'));
 else if(days)drawDays(entry,box,chosen,tally,off);
 else{
  var row=el('div','row split'),picks=el('div','picks'),acts=el('div','acts'),many=ask.kind!=='one';
  if(many&&!entry.picked)entry.picked=chosen.slice();
  ask.options.forEach(function(option){
   var was=chosen.indexOf(option.number)>=0,on=many?entry.picked.indexOf(option.number)>=0:was;
   add(picks,button(option.label+(ask.results?' ('+((tally[option.number]||0)-(was?1:0)+(on?1:0))+')':''),on,off,function(){
    if(!many){answer(entry,{choices:[option.number]});return;}
    var at=entry.picked.indexOf(option.number);
    if(at>=0)entry.picked.splice(at,1);else entry.picked.push(option.number);
    entry.note='';draw();
   }));
  });
  if(many&&!same(entry.picked,chosen))add(acts,icon('✓','Save',off,function(){
   answer(entry,entry.picked.length?{choices:entry.picked.slice().sort(function(a,b){return a-b;})}:{remove:true});
  },'go'),icon('✕','Put back',entry.busy,function(){entry.picked=null;entry.note='';draw();}));
  add(box,add(row,picks,acts));
 }
 if(ask.open&&ask.kind!=='text'&&!canCall)add(box,el('p','quiet','To answer, tell your assistant.'));
 // In an open choice the filled control is the answer; words say it only where no control does.
 if(mine&&(!ask.open||ask.kind==='text'))add(box,el('p','quiet','You answered: '+(typeof mine.text==='string'?mine.text:mine.choices.map(function(choice){return days?dayParts(choice.label).join(' '):choice.label;}).join(', '))+'.'));
 if(entry.note&&entry.note!=='Saved.')add(box,el('p','note',entry.note));
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
 root.textContent='';strips=[];
 chip.hidden=!(model.count&&model.entries&&model.entries.length);chip.textContent=chip.hidden?'':model.count;
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
 // Each line of days is put back where it was, or moved to the day just added.
 strips.forEach(function(item){
  var strip=item.strip,tile=item.shown;
  strip.scrollLeft=tile?tile.offsetLeft-strip.offsetLeft-(strip.clientWidth-tile.offsetWidth)/2:item.entry.scroll;
  item.entry.show=null;item.entry.scroll=strip.scrollLeft;edge(strip,item.rail);
 });
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
