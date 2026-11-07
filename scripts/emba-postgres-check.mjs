// Disposable native PostgreSQL acceptance runner. Never uses application DB URLs.
// Extract @embedded-postgres/windows-x64@18.6.0-beta.19 under
// .playwright-mcp/emba-postgres/binaries (see docs/emba-pilot.md).
import {mkdtempSync,readdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import pg from 'pg';

const root=process.cwd();
const modulePath=resolve(root,'.playwright-mcp/emba-postgres/binaries/package/dist/index.js');
const {initdb,pg_ctl}=await import(pathToFileURL(modulePath).href);
const data=mkdtempSync(join(root,'.playwright-mcp/emba-postgres/data-'));
const password=randomBytes(24).toString('hex'),port=55439;
const passwordPath=join(root,'.playwright-mcp/emba-postgres/password-'+randomBytes(8).toString('hex'));
writeFileSync(passwordPath,password,{mode:0o600});
const run=(command,args)=>new Promise((yes,no)=>{const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',no);child.once('exit',code=>code===0?yes():no(new Error(output)));});
let started=false;
try {
 await run(initdb,['-D',data,'-U','postgres','--pwfile='+passwordPath,'--auth=scram-sha-256','--locale=C','--encoding=UTF8']);
 unlinkSync(passwordPath);
 await run(pg_ctl,['-D',data,'-l',join(data,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'});await client.connect();
 try {
  await client.query('create role anon; create role authenticated;');
  for(const file of readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await client.query(readFileSync(join(root,'supabase/migrations',file),'utf8'));
  console.log('Native PostgreSQL migrations applied to disposable localhost database.');
 }finally{await client.end();}
 // Optional pgvector schema has its own Docker runner; this PG18 distribution
 // does not ship the extension. Explicit test arguments are never filtered.
 const vectorTests=new Set(['emba-knowledge-vector.test.ts','emba-embeddings.test.ts','emba-worker-embeddings.test.ts','emba-semantic-mcp.test.ts','emba-semantic-actions.test.ts']);
 const files=process.argv.slice(2).length?process.argv.slice(2):readdirSync(join(root,'lib/__tests__')).filter(f=>f.startsWith('emba-')&&f.endsWith('.test.ts')&&!vectorTests.has(f)).map(f=>'lib/__tests__/'+f);
 const exitCode=await new Promise((resolveExit,reject)=>{
  const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=1','--no-file-parallelism'],{
   cwd:root,stdio:'inherit',windowsHide:true,
   env:{...process.env,QB_DB:'remote',SUPABASE_TEST_DB_URL:`postgres://postgres:${password}@127.0.0.1:${port}/postgres`},
  });
  child.once('error',reject);child.once('exit',code=>resolveExit(code??1));
 });
 process.exitCode=exitCode;
}finally{if(started)await run(pg_ctl,['-D',data,'-m','fast','-w','stop']);try{unlinkSync(passwordPath);}catch{}}
