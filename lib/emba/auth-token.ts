import 'server-only';
import type { IdentityVerifier } from './access';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { EmbaError } from './errors';
import { createClerkTokenVerifier } from './clerk-token';
export type AuthConfig = { issuer: string; audience: string; jwksUrl: string; clientIds: readonly string[] };
export type RemoteAuth = { config: AuthConfig; verify: IdentityVerifier };
export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  function url(name: string) {
    const raw = env[name];
    if (!raw || raw !== raw.trim()) throw new EmbaError('unavailable');
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
    } catch { throw new EmbaError('unavailable'); }
    return raw;
  }
  const clientIds = env.LOOP_AUTH_CLIENT_IDS?.split(',').map(value => value.trim()).filter(Boolean);
  if (!clientIds?.length || clientIds.some(id => id.length > 200 || /\s/.test(id))) throw new EmbaError('unavailable');
  return { issuer: url('LOOP_AUTH_ISSUER'), audience: url('LOOP_AUTH_AUDIENCE'), jwksUrl: url('LOOP_AUTH_JWKS_URL'), clientIds: [...new Set(clientIds)] };
}
export function createTokenVerifier(config: AuthConfig, keys?: JWTVerifyGetKey): IdentityVerifier {
  const jwks = keys ?? createRemoteJWKSet(new URL(config.jwksUrl));
  return async token => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer, audience: config.audience,
        algorithms: ['RS256', 'PS256', 'ES256', 'EdDSA'],
        requiredClaims: ['iss', 'aud', 'sub', 'exp', 'client_id'],
      });
      if (payload.aud !== config.audience || typeof payload.sub !== 'string' || !payload.sub.trim() ||
          !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.exp! * 1000) ||
          typeof payload.client_id !== 'string' || !config.clientIds.includes(payload.client_id) ||
          (payload.scope !== undefined && typeof payload.scope !== 'string')) return null;
      // Remote tokens always identify a delegated client. Do not translate email
      // or other claims into first-party authority, invitation consent or roles.
      return { issuer: config.issuer, subject: payload.sub, expiresAt: payload.exp! * 1000,
        clientId: payload.client_id, scopes: typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [] };
    } catch { return null; }
  };
}

let cached: { fingerprint: string; auth: RemoteAuth } | undefined;
export function configuredAuth(): RemoteAuth {
  const config = authConfig();
  const provider=process.env.LOOP_AUTH_PROVIDER;
  const fingerprint = JSON.stringify({config,provider});
  if (!cached || cached.fingerprint !== fingerprint) cached = { fingerprint, auth: { config, verify: provider==='clerk'?createClerkTokenVerifier(config):createTokenVerifier(config) } };
  return cached.auth;
}
