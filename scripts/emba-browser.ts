// Explicit local component/browser rehearsal: real components/actions/services,
// synthetic sessions and disposable PGlite. Never run this as a hosted app.
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { openTestDb } from '../test/db';
import { seedEmbaFixture } from '../test/emba-fixture';
import { withPortalTestSession } from '../lib/emba/portal-session';
import * as actions from '../app/emba/actions';
import * as lifecycle from '../app/emba/lifecycle-actions';
import * as memoryReview from '../app/emba/memory-review-actions';
import * as roleActions from '../app/emba/role-actions';
import { readOrganizerInvitations, readPortalData } from '../app/emba/data';
import { listMyLoops, listOrganizationMembers, listScopedRoles } from '../lib/emba/roles';
import { readActivity, reviseActivity } from '../lib/emba/activities';
import { prepareAgentAction, executeAgentAction } from '../lib/emba/agent-actions';
import { authenticate } from '../lib/emba/access';
import { listMemory } from '../lib/emba/memory';
import { listDocuments, readDocument, searchKnowledge } from '../lib/emba/knowledge';
import type { PortalAction } from '../components/emba/portal-types';

async function main() {
  if(process.env.NODE_ENV!=='test'||process.env.QB_DB==='remote'||process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.SUPABASE_TEST_DB_URL)throw new Error('Browser rehearsal requires explicit test mode and no configured database URLs');
  const t=await openTestDb(),f=await seedEmbaFixture(t.db);
  const actors={memberA:f.memberA,memberB:f.memberB,organizer:f.organizer,nonmember:f.nonmember,owner:f.members[7]};
  await t.db.query("update emba_role set role='owner' where org_id=$1 and loop_id=$2 and person_id=$3",[f.orgId,f.rootId,actors.owner.personId]);
  const calls:Record<string,PortalAction>={savePreference:actions.savePreference,grantConnection:actions.grantConnection,revokeConnection:actions.revokeConnection,reviewAssistantAction:actions.reviewAssistantAction,approveAssistantAction:actions.approveAssistantAction,commitToActivity:actions.commitToActivity,withdrawFromActivity:actions.withdrawFromActivity,revisePublishedActivity:lifecycle.revisePublishedActivity,reviewWantProposal:memoryReview.reviewWantProposal,acceptWantProposal:memoryReview.acceptWantProposal,exportPilotData:actions.exportPilotData,deletePilotData:actions.deletePilotData};
  for(const name of Object.keys(actors) as (keyof typeof actors)[]){const person=actors[name];const verified=await authenticate(t.db,'synthetic',async()=>({issuer:person.issuer,subject:person.subject,expiresAt:person.expiresAt,verifiedEmail:`${name.toLowerCase()}@example.test`}));if(!verified)throw new Error('Synthetic identity unavailable');actors[name]=verified;}
  Object.assign(calls,{createInvitation:actions.createInvitation,cancelInvitation:actions.cancelInvitation,redeemInvitation:actions.redeemInvitation,uploadResource:actions.uploadResource,processResource:actions.processResource,removeResource:actions.removeResource});
  Object.assign(calls,roleActions);
  const port=4319,origin=`http://127.0.0.1:${port}`,capability=randomBytes(32).toString('hex');
  const delegate=async(actor:keyof typeof actors)=>authenticate(t.db,'synthetic',async()=>({issuer:actors[actor].issuer,subject:actors[actor].subject,expiresAt:actors[actor].expiresAt,clientId:'browser-assistant',scopes:['memory:read','plan:read','activity:write']}));
  const handler=async(req:IncomingMessage,res:ServerResponse)=>{
    const json=(status:number,data:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==origin){json(403,{error:'Local rehearsal only'});return;}
    try {
      const url=new URL(req.url??'/',origin),actor=url.searchParams.get('actor')??'memberA';
      if(!Object.hasOwn(actors,actor)){json(400,{error:'Unknown synthetic actor'});return;}
      const person=actors[actor as keyof typeof actors];
      if(req.method==='GET'&&url.pathname==='/state'){
        const data=await readPortalData(person),loops=await listMyLoops(t.db,person);
        const activity=await readActivity(t.db,person,f.activity.id).catch(()=>null);
        const passages=await searchKnowledge(t.db,person,{...f.vietnam,query:'Hanoi bus'}).catch(()=>[]);
        const invitations=await readOrganizerInvitations(person,f.orgId,f.vietnam.loopId).catch(()=>null);
        const documents=await listDocuments(t.db,person,f.vietnam).catch(()=>[]);
        const rootRoles=await listScopedRoles(t.db,person,f.orgId,f.rootId).catch(()=>null),tripRoles=await listScopedRoles(t.db,person,f.orgId,f.vietnam.loopId).catch(()=>null),organizationMembers=await listOrganizationMembers(t.db,person,f.orgId,f.rootId).catch(()=>null);
        json(200,{...data,loops,activity,passages,documents,invitations,rootRoles,tripRoles,organizationMembers,personId:person.personId,rootId:f.rootId,scope:f.vietnam,capability});return;
      }
      if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json'||req.headers['x-rehearsal-capability']!==capability){json(403,{error:'Invalid rehearsal request'});return;}
      let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>65536){json(413,{error:'Request too large'});return;}}
      const body=JSON.parse(raw),form=new FormData();
      for(const [key,value] of body.entries??[])form.append(String(key),String(value));
      if(url.pathname==='/expire-invitation'){await t.db.query("update emba_invitation set created_at='1999-01-01T00:00:00Z',expires_at='2000-01-01T00:00:00Z' where id=$1 and accepted_at is null",[body.id]);json(200,{updated:true});return;}
      if(url.pathname==='/fail-processing'){await t.db.query("update emba_document_version set state='failed',failed_stage='extracting' where document_id=$1 and version=$2 and state='accepted'",[body.id,body.version]);json(200,{updated:true});return;}
      if(url.pathname==='/authentication-age'&&['fresh','expired'].includes(body.mode)){
        const replacement=await authenticate(t.db,'synthetic',async()=>({issuer:person.issuer,subject:person.subject,expiresAt:person.expiresAt,authenticatedAt:Date.now()-(body.mode==='expired'?6*60*1000:0)}));
        if(!replacement)throw new Error('Fixture identity unavailable');
        actors[actor as keyof typeof actors]=replacement;json(200,{updated:true});return;
      }
      if(url.pathname==='/action'&&Object.hasOwn(calls,body.action)){
        const result=await withPortalTestSession(person,()=>calls[body.action]({status:'idle',message:''},form));json(200,result);return;
      }
      if(url.pathname==='/read-document'){json(200,await readDocument(t.db,person,body.id,body.version));return;}
      const delegated=await delegate(actor as keyof typeof actors);if(!delegated)throw new Error('Fixture identity unavailable');
      if(url.pathname==='/assistant-read'){json(200,await listMemory(t.db,delegated,{}));return;}
      if(url.pathname==='/prepare'){
        const activity=await readActivity(t.db,person,f.activity.id);
        const payload={activityId:f.activity.id,revision:activity.revision,operationId:crypto.randomUUID(),minOthers:0,requires:[]};
        json(200,await prepareAgentAction(t.db,delegated,'commitment',payload));return;
      }
      if(url.pathname==='/execute'){json(200,await executeAgentAction(t.db,delegated,'commitment',body.confirmationId,body.payload));return;}
      if(url.pathname==='/advance-revision'){
        const a=await readActivity(t.db,f.organizer,f.activity.id);
        json(200,await reviseActivity(t.db,f.organizer,a.id,a.revision,{...f.vietnam,title:a.title,place:a.place,timezone:a.timezone,startsAt:a.starts_at,endsAt:a.ends_at,deadline:a.deadline}));return;
      }
      json(404,{error:'Unknown rehearsal operation'});
    }catch{json(403,{error:'Access or operation denied'});}
  };
  const server=await createServer({configFile:false,root:resolve('test/emba-browser'),publicDir:resolve('public'),plugins:[react(),{name:'synthetic-rehearsal-api',configureServer(server){server.middlewares.use('/__fixture',handler);}}],resolve:{alias:{'@':resolve('.')}},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[resolve('.')]}}});
  await server.listen();
  console.log(`Synthetic browser rehearsal listening at ${origin}; disposable PGlite only.`);
  const stop=async()=>{await server.close();await t.close();process.exit(0);};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Rehearsal failed');process.exitCode=1;});
