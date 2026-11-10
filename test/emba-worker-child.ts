// Native PostgreSQL crash-recovery fixture. Never accepts application DB URLs.
import {fromPool,type Db} from '../lib/db';
import {authenticate} from '../lib/emba/access';
import {processDocument} from '../lib/emba/knowledge';
import {deliverPending} from '../lib/emba/delivery';
import {runDocumentBatch} from '../lib/emba/document-worker';

const [mode,personId,documentId,stage]=process.argv.slice(2);
const url=new URL(process.env.SUPABASE_TEST_DB_URL??'http://invalid');
if(process.env.QB_DB!=='remote'||url.hostname!=='127.0.0.1'||!process.send)process.exit(2);
const db=fromPool(url.href);
async function signal(data:object) {
  await new Promise<void>((resolve,reject)=>process.send!(data,error=>error?reject(error):resolve()));
}
async function checkpoint(data:object):Promise<never> {
  await signal(data);
  return new Promise(()=>{setInterval(()=>{},1000);});
}
async function main() { try {
  if(mode==='batch-crash') {
    const observed:Db={query:db.query.bind(db),tx:async fn=>{
      const result=await db.tx(fn);
      await checkpoint({checkpoint:'claimed'});
      return result;
    }};
    await runDocumentBatch(observed);
  } else if(mode==='delivery-crash'||mode==='delivery-resume') {
    await deliverPending(db,async message=>{
      if(mode==='delivery-crash')await checkpoint({checkpoint:'sent',id:message.id});
      else await signal({receipt:message.id});
    });
  } else {
    const p=await authenticate(db,'fixture',async()=>({issuer:'worker-recovery',subject:personId,expiresAt:Date.now()+60000}));
    if(!p)throw new Error('forbidden');
    let commits=0;
    const observed:Db={query:db.query.bind(db),tx:async fn=>{
      const result=await db.tx(fn);
      if(mode==='document-crash'&&++commits===Number(stage))await checkpoint({checkpoint:'committed',stage:Number(stage)});
      return result;
    }};
    await processDocument(observed,p,documentId,1);
  }
  process.exit(0);
} catch(error) {
  // No private payload, SQL parameter, credential or raw exception crosses IPC.
  await signal({denied:error instanceof Error&&['forbidden','conflict','not_found'].includes(error.message)});
  process.exit(3);
} }
void main();
