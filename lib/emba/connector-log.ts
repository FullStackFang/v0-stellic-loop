import 'server-only';
import type {Db} from '../db';
import type {Principal} from './access';

// The connector request log (design D8 of loop-club-reach). It answers one
// question for the pilot: do assistants check Loop at the start of a
// conversation, and do members act by the card or by the model. It records
// that a tool was called and by what route. Nothing a member wrote is read
// into it: of a call's arguments only the card's own `via` mark is looked at.
//
// The session identifier is minted here when an assistant connects and sent
// back in the Mcp-Session-Id header, which assistants on protocol revisions up
// to 2025-11-25 return on later requests. The connector stays stateless: the
// identifier is only a label in this log, and a request without one is served
// the same. An assistant that keeps no session is logged with none.

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const printable=(value:unknown,max:number)=>typeof value==='string'&&value.length>=1&&value.length<=max&&/^[ -~]+$/.test(value)?value:null;
type Message={method?:unknown;params?:{name?:unknown;arguments?:{via?:unknown};clientInfo?:{name?:unknown;version?:unknown}}};

/**
 * Notes one connector request. Returns a new session identifier when the
 * request opened a connection, for the caller to send back in the response
 * header. It never throws: a request is served whether or not it was logged.
 */
export async function observeConnector(db:Db,p:Principal,request:Request,tools:ReadonlySet<string>):Promise<string|null> {
 try{
  if(p.clientId===null||!/^[ -~]{1,200}$/.test(p.clientId))return null;
  const body:unknown=await request.clone().json();
  const messages=(Array.isArray(body)?body:[body]).filter((item):item is Message=>typeof item==='object'&&item!==null);
  let issued:string|null=null;
  const opened=messages.find(message=>message.method==='initialize');
  if(opened){
   const info=opened.params?.clientInfo;
   const {rows:[row]}=await db.query<{id:string}>('insert into emba_connector_session(person_id,client_id,host_name,host_version) values($1,$2,$3,$4) returning id',[p.personId,p.clientId,printable(info?.name,80),printable(info?.version,40)]);
   issued=row.id;
  }
  const stated=request.headers.get('mcp-session-id')??'';
  // A session is the caller's own, or it is not used: an identifier sent by anyone else labels nothing.
  const {rows:[known]}=issued||!uuid.test(stated)?{rows:[]}:await db.query<{id:string}>('select id from emba_connector_session where id=$1 and person_id=$2 and client_id=$3',[stated,p.personId,p.clientId]);
  const session=issued??known?.id??null;
  for(const message of messages){
   const tool=message.method==='tools/call'&&typeof message.params?.name==='string'&&tools.has(message.params.name)?message.params.name:null;
   if(!tool)continue;
   await db.query(`insert into emba_connector_call(person_id,client_id,session_id,tool,via,first_in_session)
    values($1,$2,$3::uuid,$4,$5,$3::uuid is not null and not exists(select 1 from emba_connector_call c where c.session_id=$3::uuid))`,[p.personId,p.clientId,session,tool,message.params?.arguments?.via==='card'?'card':'model']);
  }
  return issued;
 }catch{return null;}
}
