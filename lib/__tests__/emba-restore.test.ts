// @vitest-environment node
import {expect,it} from 'vitest';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import {basename,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {PARSERS,type Db} from '@/lib/db';
import {authenticate,canAccessPersonal} from '@/lib/emba/access';
import {saveMemory,listMemory} from '@/lib/emba/memory';
import {grantLease} from '@/lib/emba/consent';
import {createActivity,saveCommitment,finalizeActivity} from '@/lib/emba/activities';
import {deliverPending} from '@/lib/emba/delivery';
import {uploadDocument,processDocument} from '@/lib/emba/knowledge';
import {deletePersonalData,applyDeletionTombstones} from '@/lib/emba/privacy';

function connection(url:URL) {
  const pool=new pg.Pool({connectionString:url.href,ssl:false,max:3,types:{getTypeParser:((oid:number,format?:string)=>PARSERS[oid]??pg.types.getTypeParser(oid,format as 'text')) as typeof pg.types.getTypeParser}});
  const db:Db={query:(sql,params)=>pool.query(sql,params) as never,tx:async fn=>{
    const client=await pool.connect();
    try {await client.query('begin');const result=await fn({query:(sql,params)=>client.query(sql,params) as never});await client.query('commit');return result;}
    catch(error){await client.query('rollback').catch(()=>{});throw error;}finally{client.release();}
  }};
  return {db,close:()=>pool.end()};
}
async function control(binary:string,args:string[],successThrough=0,timeout=45000) {
  await new Promise<void>((resolveRun,reject)=>{
    const child=spawn(binary,args,{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>child.kill(),timeout);
    child.once('error',()=>{clearTimeout(timer);reject(new Error('Local PostgreSQL rehearsal command could not start'));});
    child.once('exit',code=>{clearTimeout(timer);if(code!==null&&code<=successThrough)resolveRun();else reject(new Error(`Local PostgreSQL rehearsal command exited ${code??'without status'}`));});
  });
}
async function copyColdCluster(source:string,target:string) {
  // Copy only; never mirror/purge. Native parallel I/O avoids serial per-file
  // overhead on Windows/OneDrive. Robocopy codes 0..7 are successful copies.
  await control('robocopy.exe',[source,target,'/E','/COPY:DAT','/DCOPY:T','/R:0','/W:0','/MT:16','/NFL','/NDL','/NJH','/NJS','/NP'],7,90000);
}
function inside(root:string,target:string) {
  const path=resolve(target),rel=relative(root,path);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||resolve(root,rel)!==path)throw new Error('Unsafe rehearsal path');
  return path;
}
async function freePort() {
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));return port;
}

it.skipIf(process.env.QB_DB!=='remote'||process.env.EMBA_RESTORE_TEST!=='1')('restores a cold PostgreSQL backup with the newer external deletion ledger before enabling readers and workers',async()=>{
  const sourceUrl=new URL(process.env.SUPABASE_TEST_DB_URL??'about:blank');
  if(sourceUrl.protocol!=='postgres:'||sourceUrl.hostname!=='127.0.0.1'||sourceUrl.port!=='55439'||sourceUrl.pathname!=='/postgres'||sourceUrl.username!=='postgres'||!/^[a-f0-9]{48}$/.test(sourceUrl.password))throw new Error('Use only the disposable native PostgreSQL runner');
  const root=await realpath(process.cwd()),binary=join(root,'.playwright-mcp/emba-postgres/binaries/package/native/bin/pg_ctl.exe');
  const scratch=inside(root,await mkdtemp(join(root,'.playwright-mcp/emba-restore-')));
  const backup=inside(scratch,join(scratch,'cold-backup')),restored=inside(scratch,join(scratch,'restored-cluster'));
  const ledgerPath=join(scratch,'current-deletions.json');
  const sourceName='emba_source_'+randomUUID().replaceAll('-',''),restoredName='emba_restored_'+randomUUID().replaceAll('-','');
  let admin:ReturnType<typeof connection>|undefined=connection(sourceUrl),source:ReturnType<typeof connection>|undefined,restore:ReturnType<typeof connection>|undefined;
  let sourceData='',sourceStopped=false,restoreStarted=false;
  try {
    const {rows:[directory]}=await admin.db.query<{data_directory:string}>('show data_directory');
    sourceData=inside(join(root,'.playwright-mcp/emba-postgres'),await realpath(directory.data_directory));
    if(!basename(sourceData).startsWith('data-'))throw new Error('Not a disposable runner cluster');
    await admin.db.query(`create database "${sourceName}"`);
    const scopedUrl=new URL(sourceUrl);scopedUrl.pathname='/'+sourceName;source=connection(scopedUrl);
    for(const file of (await readdir(join(root,'supabase/migrations'))).filter(name=>name.endsWith('.sql')).sort())await source.db.query(await readFile(join(root,'supabase/migrations',file),'utf8'));
    const db=source.db;
    const {rows:[org]}=await db.query<{id:string}>("insert into emba_organization(name) values('Synthetic restore rehearsal') returning id");
    const {rows:[loop]}=await db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'restore') returning id",[org.id]);
    const members=[];
    for(const [index,role] of ['owner','member'].entries()) {
      const {rows:[person]}=await db.query<{id:string}>('insert into person(name,phone) values($1,$2) returning id',['Synthetic restore '+index,'+1607999100'+index]);
      await db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('restore-fixture',$1,$2,now())",[person.id,person.id]);
      await db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,person.id]);
      await db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)',[org.id,loop.id,person.id,role]);
      const claims={issuer:'restore-fixture',subject:person.id,expiresAt:Date.now()+3600000,authenticatedAt:Date.now()};
      const principal=(await authenticate(db,'synthetic',async()=>claims))!;
      members.push({principal,claims});
      await saveMemory(db,principal,{operationId:randomUUID(),kind:'want',text:'Synthetic private want '+index,category:'culture',strength:0.7,confidence:1});
    }
    const [deleted,unrelated]=members;
    await grantLease(db,deleted.principal,{clientId:'stale-worker',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
    const staleAgent=(await authenticate(db,'synthetic',async()=>({...deleted.claims,clientId:'stale-worker',scopes:['memory:read']})))!;
    const document=await uploadDocument(db,deleted.principal,{operationId:randomUUID(),orgId:org.id,loopId:loop.id,title:'Retained organization source',mediaType:'text/plain',body:'Synthetic organization evidence'});
    const activity=await createActivity(db,deleted.principal,{orgId:org.id,loopId:loop.id,title:'Synthetic walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',deadline:'2099-01-01T00:00:00Z'});
    for(const member of members)await saveCommitment(db,member.principal,{activityId:activity.id,revision:1,operationId:randomUUID(),minOthers:0,requires:[]});
    await db.query("update emba_activity_revision set deadline='2000-01-01' where activity_id=$1",[activity.id]);
    await finalizeActivity(db,deleted.principal,activity.id,1);

    // A clean cluster shutdown makes this an actual physical cold backup. No
    // plaintext credentials appear in command arguments or logged output.
    await source.close();source=undefined;await admin.close();admin=undefined;
    await control(binary,['-D',sourceData,'-m','fast','-w','stop']);sourceStopped=true;
    await copyColdCluster(sourceData,backup);
    await control(binary,['-D',sourceData,'-l',join(sourceData,'server.log'),'-o','-h 127.0.0.1 -p 55439','-w','start']);sourceStopped=false;
    source=connection(scopedUrl);
    await deletePersonalData(source.db,deleted.principal);
    const {rows:tombstones}=await source.db.query<{person_id:string}>('select person_id from emba_deletion_tombstone order by person_id');
    expect(tombstones).toEqual([{person_id:deleted.principal.personId}]);
    // This ledger is captured AFTER deletion, separately from the stale backup.
    await writeFile(ledgerPath,JSON.stringify(tombstones.map(row=>row.person_id)),{mode:0o600});

    await copyColdCluster(backup,restored);
    const port=await freePort();
    await control(binary,['-D',restored,'-l',join(scratch,'restored.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);restoreStarted=true;
    const restoredUrl=new URL(sourceUrl);restoredUrl.port=String(port);
    restore=connection(restoredUrl);
    await restore.db.query(`alter database "${sourceName}" rename to "${restoredName}"`);
    await restore.close();restoredUrl.pathname='/'+restoredName;restore=connection(restoredUrl);
    const restoredDb=restore.db;
    // Maintenance-only diagnostic: the stale backup resurrects the identity
    // without the external ledger. No application reader/worker is enabled yet.
    expect((await restoredDb.query('select person_id from emba_deletion_tombstone')).rows).toEqual([]);
    expect(await authenticate(restoredDb,'synthetic',async()=>deleted.claims)).not.toBeNull();
    expect((await restoredDb.query('select id from emba_memory where person_id=$1',[deleted.principal.personId])).rows).toHaveLength(1);
    await applyDeletionTombstones(restoredDb,JSON.parse(await readFile(ledgerPath,'utf8')) as string[]);
    // Only now exercise application outputs and workers.
    expect(await authenticate(restoredDb,'synthetic',async()=>deleted.claims)).toBeNull();
    expect(await restoredDb.tx(q=>canAccessPersonal(q,deleted.principal,deleted.principal.personId))).toBe(false);
    await expect(listMemory(restoredDb,deleted.principal,{})).rejects.toThrow('forbidden');
    await expect(listMemory(restoredDb,staleAgent,{})).rejects.toThrow('forbidden');
    await expect(processDocument(restoredDb,deleted.principal,document.id,1)).rejects.toThrow('forbidden');
    for(const table of ['emba_identity','emba_membership','emba_lease','emba_memory','emba_memory_version','emba_memory_operation','emba_commitment','emba_activity_operation','emba_inbox','emba_document_operation'])expect((await restoredDb.query(`select 1 from ${table} where person_id=$1`,[deleted.principal.personId])).rows,table).toEqual([]);
    expect((await restoredDb.query('select uploaded_by from emba_document_version where document_id=$1',[document.id])).rows).toEqual([{uploaded_by:null}]);
    expect((await restoredDb.query('select creator_id from emba_activity where id=$1',[activity.id])).rows).toEqual([{creator_id:null}]);
    expect(await authenticate(restoredDb,'synthetic',async()=>unrelated.claims)).not.toBeNull();
    expect((await listMemory(restoredDb,unrelated.principal,{})).items).toHaveLength(1);
    const sent:string[]=[];await deliverPending(restoredDb,async message=>{sent.push(message.personId);});
    expect(sent).not.toContain(deleted.principal.personId);expect(sent).toContain(unrelated.principal.personId);
    await applyDeletionTombstones(restoredDb,[deleted.principal.personId]);
    expect((await listMemory(restoredDb,unrelated.principal,{})).items).toHaveLength(1);
  } finally {
    const closes=await Promise.allSettled([restore?.close(),source?.close(),admin?.close()]);
    let cleanupFailed=closes.some(result=>result.status==='rejected');
    if(restoreStarted)try {await control(binary,['-D',restored,'-m','fast','-w','stop']);restoreStarted=false;}catch {cleanupFailed=true;}
    // Restore the runner's source even if backup creation failed partway through.
    if(sourceStopped)try {await control(binary,['-D',sourceData,'-l',join(sourceData,'server.log'),'-o','-h 127.0.0.1 -p 55439','-w','start']);sourceStopped=false;}catch {cleanupFailed=true;}
    if(!sourceStopped) {
      const cleanup=connection(sourceUrl);
      try {await cleanup.db.query(`drop database if exists "${sourceName}"`);}catch {cleanupFailed=true;}finally{await cleanup.close();}
    }
    if(!restoreStarted)await rm(inside(root,scratch),{recursive:true,force:true});
    if(cleanupFailed)throw new Error('Local restore rehearsal cleanup failed; inspect disposable cluster state');
  }
},300000);
