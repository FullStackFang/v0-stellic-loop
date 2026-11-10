// Development-only Clerk OAuth settings. Default mode performs read-only inspection.
// Sources and remaining Dashboard steps: docs/emba-clerk-setup.md.
const settingsPath = '/instance/oauth_application_settings';
const desired = {
  dynamic_oauth_client_registration: false,
  oauth_jwt_access_tokens: false,
  aud_claim_enabled: true,
  pkce_required: true,
  client_id_metadata_documents_advertised: true,
  client_id_metadata_documents_only_allow_pre_registered_clients: true,
  client_id_metadata_documents_block_implicitly_allowed_clients: true,
};
const allowed = [...Object.keys(desired), 'default_scopes', 'dynamic_client_allowed_scopes'];

async function main() {
  const apply = process.argv.includes('--apply');
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Unsupported argument');
  if (apply && process.env.EMBA_CLERK_SETUP !== '1') throw new Error('Set EMBA_CLERK_SETUP=1 to apply development settings');
  const secret = process.env.CLERK_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secret?.startsWith('sk_test_') || !publishable?.startsWith('pk_test_')) throw new Error('Development Clerk keys required');
  const decoded = Buffer.from(publishable.slice('pk_test_'.length), 'base64').toString('utf8');
  if (!/^[a-z0-9.-]+\.clerk\.accounts\.dev\$$/.test(decoded)) throw new Error('Invalid development issuer');
  const issuer = `https://${decoded.slice(0, -1)}`;
  async function request(path, body) {
    const response = await fetch(`https://api.clerk.com/v1${path}`, {
      method: body ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Clerk management request failed (HTTP ${response.status})`);
    return response.json();
  }
  const instance = await request('/instance');
  if (instance.environment_type !== 'development') throw new Error('Refusing non-development instance');
  if (apply) await request(settingsPath, desired);
  const settings = await request(settingsPath);
  const discoveryResponse = await fetch(`${issuer}/.well-known/oauth-authorization-server`, {redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!discoveryResponse.ok) throw new Error(`Discovery failed (HTTP ${discoveryResponse.status})`);
  const discovery = await discoveryResponse.json();
  const matches = Object.entries(desired).every(([key,value]) => settings[key] === value);
  console.log(JSON.stringify({
    mode:apply?'apply':'inspect', environment:instance.environment_type, issuer,
    securitySettingsMatch:matches,
    settings:Object.fromEntries(allowed.map(key=>[key, settings[key]])),
    discovery:Object.fromEntries(['issuer','code_challenge_methods_supported','token_endpoint_auth_methods_supported','client_id_metadata_document_supported','scopes_supported'].map(key=>[key,discovery[key]])),
    registrationEndpointAdvertised:typeof discovery.registration_endpoint==='string',
  },null,2));
  if (apply && !matches) throw new Error('Development settings verification failed');
}

main().catch(error=>{
  // Never output HTTP bodies, SDK errors, credentials, tokens, or user records.
  const message=error instanceof Error && /^(Unsupported argument|Set EMBA_CLERK_SETUP|Development Clerk keys required|Invalid development issuer|Refusing non-development instance|Clerk management request failed|Discovery failed|Development settings verification failed)/.test(error.message)
    ? error.message : 'Clerk setup unavailable';
  console.error(message);
  process.exitCode=1;
});
