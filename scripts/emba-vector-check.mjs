// Disposable official pgvector Docker acceptance. Never reads application DB URLs.
import { randomBytes } from 'node:crypto';
import { accessSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';
const root=process.cwd(),name='emba-vector-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
const suites=[...['emba-knowledge-vector','emba-embeddings','emba-worker-embeddings','emba-semantic-mcp'].map(name=>`lib/__tests__/${name}.test.ts`),'app/emba/emba-semantic-actions.test.ts'];
for(const suite of suites)accessSync(join(root,suite));
const run=(command,args,options={})=>new Promise((resolve,reject)=>{
 const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});let out='';
 child.stdout?.on('data',chunk=>{out+=chunk;});child.stderr?.on('data',chunk=>{out+=chunk;});
 child.once('error',reject);child.once('exit',code=>code===0?resolve(out.trim()):reject(new Error(out||`Process exited ${code}`)));
});
let created=false;
try {
 await run('docker',['run','--detach','--rm','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD','pgvector/pgvector:pg17'],{env:{...process.env,POSTGRES_PASSWORD:password}});created=true;
 const mapping=await run('docker',['port',name,'5432/tcp']);
 const port=Number(mapping.match(/^127\.0\.0\.1:(\d+)$/)?.[1]);if(!port)throw new Error('Unexpected loopback port mapping');
 let ready=false;
 for(let attempt=0;attempt<60;attempt++) {
  try{await run('docker',['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}
 }
 if(!ready)throw new Error('Disposable pgvector database did not become ready');
 const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'});await client.connect();
 try {
  await client.query('create role anon;create role authenticated;');
  for(const directory of ['supabase/migrations','supabase/optional-migrations/emba-vectors']) for(const file of readdirSync(join(root,directory)).filter(f=>f.endsWith('.sql')).sort()) await client.query(readFileSync(join(root,directory,file),'utf8'));
  console.log((await client.query("select version(),extversion from pg_extension where extname='vector'")).rows);
 } finally {await client.end();}
 await run(process.execPath,['node_modules/vitest/vitest.mjs','run',...suites,'--maxWorkers=1','--no-file-parallelism'],{stdio:'inherit',env:{...process.env,QB_DB:'remote',EMBA_VECTOR_TEST:'1',SUPABASE_TEST_DB_URL:`postgres://postgres:${password}@127.0.0.1:${port}/postgres`}});
} finally {if(created)await run('docker',['rm','--force',name]);}
