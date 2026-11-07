import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openTestDb,makeBoard,type TestDb} from '@/test/db';
import {world} from '@/test/world';
import {createWorkspace} from '@/lib/trip-workspace-store';
import {issueMagicLink} from '@/lib/tokens';
import {signSession} from '@/lib/session';

// Opt-in: run through the disposable native runner AFTER the final Next build.
// This never supplies a first-party EMBA session or a production credential.
describe.skipIf(process.env.EMBA_PRODUCTION_HTTP_TEST!=='1')('production HTTP legacy boundaries',()=>{
 let t:TestDb,server:ChildProcess,origin:string,cookie:string,slug:string,publicSlug:string,proposalId:string,fileId:string,workspaceId:string,editToken:string,documentId:string,magicPath:string;
 const canary='PRIVATE_HTTP_CANARY_7fb0',secret=randomBytes(32).toString('hex');
 beforeAll(async()=>{
  const url=new URL(process.env.SUPABASE_TEST_DB_URL??'about:blank');
  if(process.env.QB_DB!=='remote'||url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.port!=='55439')throw new Error('Use the disposable native PostgreSQL runner');
  if(!existsSync('.next/BUILD_ID'))throw new Error('Run the final production build first');
  t=await openTestDb();
  const w=await world(t.db),owner=await w.person(canary);slug=w.board.slug;
  proposalId=await w.proposal(owner.id,{title:canary,status:'on',on_day:'2099-02-15',on_at:new Date().toISOString()});
  magicPath=new URL(await issueMagicLink(t.db,owner.id,`/p/${proposalId}`,'on_text')).pathname;
  cookie=`qb=${signSession(owner.id,secret)}`;
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Synthetic HTTP cohort') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'http') returning id",[org.id]);
  await t.db.query('insert into trip(board_id,owner_id) values($1,$2)',[w.board.id,owner.id]);
  const {rows:[file]}=await t.db.query<{id:string}>("insert into trip_item(board_id,owner_id,kind,title,shared,filename,file_data) values($1,$2,'document',$3,true,'private.txt',$4) returning id",[w.board.id,owner.id,canary,Buffer.from(canary)]);fileId=file.id;
  await t.db.query('update board set name=$3,pilot_loop_id=$2 where id=$1',[w.board.id,loop.id,canary]);
  const ws=await createWorkspace(t.db);workspaceId=ws.id;editToken=ws.token;
  const {rows:[doc]}=await t.db.query<{id:string}>("insert into trip_document(workspace_id,name,mime,file_data) values($1,$2,'text/plain',$3) returning id",[ws.id,canary,Buffer.from(canary)]);documentId=doc.id;
  await t.db.query('update trip_workspace set pilot_loop_id=$2 where id=$1',[ws.id,loop.id]);
  publicSlug=(await makeBoard(t.db)).slug;
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,stdio:'pipe',env:{...process.env,NODE_ENV:'production',DATABASE_URL:url.href,POSTGRES_URL:url.href,SESSION_SECRET:secret,LOOP_AUTH_ISSUER:'',LOOP_AUTH_AUDIENCE:'',LOOP_AUTH_JWKS_URL:'',LOOP_AUTH_CLIENT_IDS:''}});
  server.stdout?.resume();server.stderr?.resume();
  for(let attempt=0;attempt<100;attempt++){
   if(server.exitCode!==null)throw new Error('Local production server exited before readiness');
   try{if((await fetch(`${origin}/emba`)).ok)return;}catch{}
   await delay(100);
  }
  throw new Error('Local production server did not become ready');
 });
 afterAll(async()=>{
  try {
   if(server?.pid&&server.exitCode===null&&server.signalCode===null)await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{server.kill('SIGKILL');reject(new Error('Local HTTP test server did not stop'));},5000);
    server.once('exit',()=>{clearTimeout(timer);resolve();});server.kill();
   });
  } finally {if(t)await t.close();}
 });
 it.each(['anonymous','legacy owner'])('hides classified HTML, files and previews from %s',async actor=>{
  const headers=actor==='legacy owner'?{cookie}:undefined;
  for(const path of [`/b/${slug}`,`/b/${slug}/you`,`/b/${slug}/new`,`/p/${proposalId}`,`/api/trip/${slug}/files/${fileId}`,`/p/${proposalId}/invite.ics`,`/p/${proposalId}/og`]){
   const response=await fetch(origin+path,{headers});const body=await response.text();
   expect(body,path).not.toContain(canary);
   if(path.startsWith('/api/')||path.endsWith('/invite.ics')||path.endsWith('/og'))expect(response.status,path).toBe(404);
   else expect([200,404],path).toContain(response.status); // Next streamed not-found may already have sent 200.
  }
  const image=await fetch(`${origin}/b/${slug}/opengraph-image`,{headers});
  const generic=await fetch(`${origin}/b/nonexistent-synthetic-http-board/opengraph-image`,{headers});
  expect(image.headers.get('cache-control')).toContain('no-store');
  expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from(await generic.arrayBuffer()));
 });
 it('rejects old workspace tokens and does not redeem a classified magic link',async()=>{
  for(const [path,method] of [[`/api/trips/${workspaceId}`,'GET'],[`/api/trips/${workspaceId}`,'POST'],[`/api/trips/${workspaceId}/parse`,'POST'],[`/api/trips/${workspaceId}/documents`,'POST'],[`/api/trips/${workspaceId}/documents/${documentId}`,'GET']] as const){
   const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${editToken}`}});
   expect(response.status,path).toBe(404);expect(await response.text()).not.toContain(canary);
  }
  const magic=await fetch(origin+magicPath,{redirect:'manual'});
  expect(new URL(magic.headers.get('location')!,origin).pathname).toBe('/');
  expect(magic.headers.get('set-cookie')??'').not.toMatch(/(?:^|[,;]\s*)qb=/);
  const publicPage=await fetch(`${origin}/b/${publicSlug}`);
  expect(publicPage.status).toBe(200);expect(await publicPage.text()).toContain('Test board');
 });
});
