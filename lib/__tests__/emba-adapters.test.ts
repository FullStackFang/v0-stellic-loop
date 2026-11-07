// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { grantLease, revokeLease } from '@/lib/emba/consent';
import { saveMemory } from '@/lib/emba/memory';
import { authConfig, createTokenVerifier, type RemoteAuth } from '@/lib/emba/auth-token';
import { handleMemoryRequest, handleMcpRequest, protectedResourceMetadata } from '@/lib/emba/mcp';
import { GET as memoryGET } from '@/app/api/emba/memory/route';
import { POST as mcpPOST } from '@/app/api/mcp/route';
import { GET as metadataGET } from '@/app/.well-known/oauth-protected-resource/route';

const environment = {
  LOOP_AUTH_ISSUER: 'https://issuer.example', LOOP_AUTH_AUDIENCE: 'https://loop.example/api/mcp',
  LOOP_AUTH_JWKS_URL: 'https://issuer.example/jwks', LOOP_AUTH_CLIENT_IDS: 'approved-client,other-approved',
};

describe('EMBA cryptographic remote adapters', () => {
  let t: TestDb;
  let key: CryptoKey;
  let auth: RemoteAuth;
  beforeAll(async () => {
    t = await openTestDb();
    const pair = await generateKeyPair('ES256');
    key = pair.privateKey;
    const config = authConfig(environment);
    auth = { config, verify: createTokenVerifier(config, createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'ES256' }] })) };
  });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });
  async function token(subject: string, changes: JWTPayload = {}, signingKey = key) {
    return new SignJWT({ iss: environment.LOOP_AUTH_ISSUER, aud: environment.LOOP_AUTH_AUDIENCE,
      sub: subject, exp: Math.floor(Date.now() / 1000) + 3600, client_id: 'approved-client', scope: 'memory:read', ...changes })
      .setProtectedHeader({ alg: 'ES256', kid: 'test', typ: 'at+jwt' }).sign(signingKey);
  }
  async function fixture() {
    const person = await makePerson(t.db);
    await t.db.query('insert into emba_identity (issuer,subject,person_id,verified_at) values ($1,$2,$3,now())', [environment.LOOP_AUTH_ISSUER, person.id, person.id]);
    const principal = (await authenticate(t.db, 'first-party', async () => ({ issuer: environment.LOOP_AUTH_ISSUER, subject: person.id, expiresAt: Date.now() + 60000 })))!;
    const lease = await grantLease(t.db, principal, { clientId: 'approved-client', actions: ['memory:read'], expiresAt: new Date(Date.now() + 3600000).toISOString() });
    const saved = await saveMemory(t.db, principal, { operationId: randomUUID(), kind: 'want', text: 'Private Hanoi preference', category: 'food', strength: 0.7, confidence: 1 });
    return { person, principal, lease, saved, bearer: await token(person.id) };
  }
  function api(bearer?: string, query = '', headers: Record<string, string> = {}) {
    return handleMemoryRequest(new Request(`https://loop.example/api/emba/memory${query}`, { headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers } }), { database: t.db, auth });
  }
  function mcp(bearer: string, method: string, params?: unknown) {
    return handleMcpRequest(new Request(environment.LOOP_AUTH_AUDIENCE, { method: 'POST', headers: {
      authorization: `Bearer ${bearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), { database: t.db, auth });
  }

  it('fails closed without complete HTTPS provider configuration', () => {
    for (const input of [{}, { ...environment, LOOP_AUTH_CLIENT_IDS: '' }, { ...environment, LOOP_AUTH_JWKS_URL: 'http://issuer.example/jwks' }, { ...environment, LOOP_AUTH_AUDIENCE: 'https://loop.example/api/mcp#fragment' }]) {
      expect(() => authConfig(input)).toThrow();
    }
  });

  it('returns 503 from actual route entrypoints when configuration is absent', async () => {
    vi.stubEnv('LOOP_AUTH_ISSUER', '');
    try {
      expect((await memoryGET(new Request('https://loop.example/api/emba/memory'))).status).toBe(503);
      expect((await mcpPOST(new Request(environment.LOOP_AUTH_AUDIENCE, { method: 'POST' }))).status).toBe(503);
      expect((await metadataGET()).status).toBe(503);
    } finally { vi.unstubAllEnvs(); }
  });

  it('validates signature, issuer, exact audience, expiry, subject and allowed client identity', async () => {
    const f = await fixture();
    const verified = await auth.verify(f.bearer);
    expect(verified).toMatchObject({ subject: f.person.id, clientId: 'approved-client', scopes: ['memory:read'] });
    expect(verified).not.toHaveProperty('verifiedEmail');
    for (const claims of [
      { iss: 'https://evil.example' }, { aud: 'different-resource' }, { aud: [environment.LOOP_AUTH_AUDIENCE, 'other'] },
      { exp: 1 }, { exp: undefined }, { sub: '' }, { sub: undefined }, { client_id: undefined }, { client_id: 'unknown-client' },
      { scope: ['memory:read'] }, { nbf: Math.floor(Date.now() / 1000) + 3600 },
    ]) expect(await auth.verify(await token(f.person.id, claims))).toBeNull();
    const other = await generateKeyPair('ES256');
    expect(await auth.verify(await token(f.person.id, {}, other.privateKey))).toBeNull();
    expect(await auth.verify('not-a-jwt')).toBeNull();
  });

  it('challenges unauthenticated clients with protected-resource discovery and never accepts cookies or query tokens', async () => {
    const f = await fixture();
    const response = await api(undefined, `?access_token=${f.bearer}`, { cookie: 'qb=legacy' });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('https://loop.example/.well-known/oauth-protected-resource');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const metadata = await protectedResourceMetadata(auth.config).json();
    expect(metadata).toMatchObject({ resource: environment.LOOP_AUTH_AUDIENCE, authorization_servers: [environment.LOOP_AUTH_ISSUER], scopes_supported: ['memory:read','plan:read','activity:write'] });
  });

  it('returns the same scoped private data through HTTP, MCP tools and MCP resources and audits every read', async () => {
    const f = await fixture();
    const response = await api(f.bearer);
    expect(response.status).toBe(200);
    const expected = await response.json();
    expect(expected.items).toHaveLength(1);
    const tool = await (await mcp(f.bearer, 'tools/call', { name: 'list_memory', arguments: {} })).json();
    expect(tool.result.structuredContent).toEqual(expected);
    const resource = await (await mcp(f.bearer, 'resources/read', { uri: 'loop://memory' })).json();
    expect(JSON.parse(resource.result.contents[0].text)).toEqual(expected);
    expect((await t.db.query("select id from emba_audit where person_id=$1 and action='memory:read'", [f.person.id])).rows).toHaveLength(3);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('uses SDK initialization and distinguishes reads from confirmed mutation capabilities', async () => {
    const f = await fixture();
    const initialized = await mcp(f.bearer, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-host', version: '1' } });
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get('mcp-session-id')).toBeNull();
    expect((await initialized.json()).result.serverInfo.name).toBe('loop-memory');
    const listed = await (await mcp(f.bearer, 'tools/list')).json();
    expect(listed.result.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({name:'list_memory',annotations:expect.objectContaining({readOnlyHint:true})}),
      expect.objectContaining({name:'execute_commitment',annotations:expect.objectContaining({readOnlyHint:false})}),
    ]));
    expect((await (await mcp(f.bearer, 'tools/call', { name: 'save_memory', arguments: {} })).json()).result.isError).toBe(true);
  });

  it('blocks revoked leases on subsequent MCP calls and HTTP reads without exposing private bodies', async () => {
    const f = await fixture();
    await mcp(f.bearer, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    await revokeLease(t.db, f.principal, f.lease.id);
    expect((await api(f.bearer)).status).toBe(403);
    const denied = await (await mcp(f.bearer, 'tools/call', { name: 'list_memory', arguments: {} })).json();
    expect(denied.result.isError).toBe(true);
    expect(JSON.stringify(denied)).not.toContain('Private Hanoi preference');
  });

  it('denies wrong scopes, clients, unmapped subjects and revoked identities', async () => {
    const f = await fixture();
    expect((await api(await token(f.person.id, { scope: '' }))).status).toBe(403);
    expect((await api(await token(f.person.id, { client_id: 'other-approved' }))).status).toBe(403);
    expect((await api(await token(f.person.id, { client_id: 'not-approved' }))).status).toBe(401);
    expect((await api(await token(randomUUID()))).status).toBe(401);
    await t.db.query('update emba_identity set revoked_at=now() where person_id=$1', [f.person.id]);
    expect((await api(f.bearer)).status).toBe(401);
  });

  it('rejects hostile browser origins, duplicate query fields, unknown fields and injected person selection', async () => {
    const f = await fixture();
    expect((await api(f.bearer, '', { origin: 'https://evil.example' })).status).toBe(403);
    for (const query of ['?limit=1&limit=2', '?limit=200', `?personId=${f.person.id}`, '?unknown=value', '?__proto__=value']) expect((await api(f.bearer, query)).status).toBe(400);
  });

  it('fails every private output closed on audit failure without leaking database errors', async () => {
    const f = await fixture();
    await t.db.query("alter table emba_audit add constraint secret_audit_failure check(action <> 'memory:read')");
    try {
      const http = await api(f.bearer);
      expect(http.status).toBe(503);
      expect(await http.text()).not.toMatch(/Private Hanoi|secret_audit_failure/);
      const tool = await (await mcp(f.bearer, 'tools/call', { name: 'list_memory', arguments: {} })).json();
      expect(tool.result.isError).toBe(true);
      expect(JSON.stringify(tool)).not.toMatch(/Private Hanoi|secret_audit_failure/);
      const resource = await (await mcp(f.bearer, 'resources/read', { uri: 'loop://memory' })).json();
      expect(resource.error).toBeDefined();
      expect(JSON.stringify(resource)).not.toMatch(/Private Hanoi|secret_audit_failure/);
    } finally { await t.db.query('alter table emba_audit drop constraint secret_audit_failure'); }
  });
});
