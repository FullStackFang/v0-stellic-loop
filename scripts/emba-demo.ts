// Disposable synthetic rehearsal. Never connects to the configured application DB.
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openTestDb, makePerson } from '../test/db';
import { authenticate } from '../lib/emba/access';
import { grantLease, revokeLease } from '../lib/emba/consent';
import { saveMemory } from '../lib/emba/memory';
import { createMemoryMcpServer } from '../lib/emba/mcp';

async function main() {
  if (process.env.QB_DB === 'remote') throw new Error('Demo requires a disposable local database');
  const t = await openTestDb();
  const person = await makePerson(t.db,'Synthetic Hanoi traveler');
  await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('urn:loop:synthetic-demo','traveler',$1,now())",[person.id]);
  const claims = {issuer:'urn:loop:synthetic-demo',subject:'traveler',expiresAt:Date.now()+60*60*1000};
  const member = (await authenticate(t.db,'synthetic',async()=>claims))!;
  const delegate = (await authenticate(t.db,'synthetic',async()=>({...claims,clientId:'local-demo',scopes:['memory:read']})))!;
  await saveMemory(t.db,member,{operationId:randomUUID(),kind:'want',text:'Enjoy short walking food tours',category:'food',place:'Hanoi',strength:0.8,confidence:1});
  await saveMemory(t.db,member,{operationId:randomUUID(),kind:'intent',text:'Find a quiet afternoon activity in Hanoi',category:'rest',place:'Hanoi',strength:0.9,confidence:1,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()});
  const lease = await grantLease(t.db,member,{clientId:'local-demo',actions:['memory:read'],expiresAt:new Date(claims.expiresAt).toISOString()});
  const server = createMemoryMcpServer(t.db,delegate);
  if (process.argv.includes('--stdio')) {
    console.error('Synthetic Loop demo only: disposable memory; no real accounts or OAuth.');
    const transport = new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:32768});
    server.server.onclose = () => { void t.close(); };
    await server.connect(transport);
    return;
  }
  const client = new Client({name:'loop-rehearsal',version:'1.0.0'});
  const [clientTransport,serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    console.log('Available MCP tools:',tools.tools.map(tool=>tool.name).join(', '));
    const result = await client.callTool({name:'list_memory',arguments:{place:'Hanoi'}});
    if (result.isError) throw new Error('Synthetic authorized read failed');
    console.log('Hanoi private memory:',JSON.stringify(result));
    await revokeLease(t.db,member,lease.id);
    const denied = await client.callTool({name:'list_memory',arguments:{place:'Hanoi'}});
    if (!denied.isError) throw new Error('Revoked connection unexpectedly returned memory');
    console.log('PASS: the same open MCP connection is denied after lease revocation.');
  } finally {
    await client.close();
    await server.close();
    await t.close();
  }
}

main().catch(() => { console.error('Loop rehearsal failed; no credentials or private payloads logged.'); process.exitCode=1; });
