import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { db } from '../lib/db';
import { authenticate } from '../lib/emba/access';
import { authConfig, createTokenVerifier } from '../lib/emba/auth-token';
import { createMemoryMcpServer } from '../lib/emba/mcp';

async function main() {
  const config = authConfig();
  const token = process.env.LOOP_ACCESS_TOKEN;
  if (!token) throw new Error('Missing explicit credential');
  const database = db();
  const principal = await authenticate(database,token,createTokenVerifier(config));
  if (!principal) throw new Error('Credential rejected');
  const server = createMemoryMcpServer(database,principal);
  await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:32768}));
}

// Stdout belongs exclusively to the MCP protocol. Never log token or claims.
main().catch(() => { console.error('Loop MCP could not start: check auth configuration, credential and identity mapping.'); process.exitCode=1; });
