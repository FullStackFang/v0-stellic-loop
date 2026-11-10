import 'server-only';
import {z} from 'zod';
import type {IdentityVerifier} from './access';
import type {AuthConfig} from './auth-token';

// Online IdPOAuthAccessToken.verify returns expiration in Unix seconds. Do not
// use the SDK's local JWT factory here: online verification also checks revocation.
const claims=z.object({
 subject:z.string().regex(/^user_[A-Za-z0-9_]{1,200}$/),
 clientId:z.string().min(1).max(200),
 scopes:z.array(z.string().min(1).max(200).regex(/^\S+$/)).max(100),
 revoked:z.literal(false),expired:z.literal(false),
 expiration:z.number().int().positive().refine(n=>Number.isSafeInteger(n*1000)),
 aud:z.array(z.string()).length(1),
});

export function createClerkTokenVerifier(config:AuthConfig):IdentityVerifier {
 return async token=>{
  try {
   if(!token||token.length>16384||/\s/.test(token))return null;
   const secretKey=process.env.CLERK_SECRET_KEY;
   if(!secretKey||secretKey!==secretKey.trim())return null;
   // Lazy provider imports preserve the default JWT adapter and its deployments.
   const [{clerkIssuer},{createClerkClient}]=await Promise.all([import('./clerk-identity'),import('@clerk/nextjs/server')]);
   if(clerkIssuer()!==config.issuer)return null;
   const client=createClerkClient({secretKey});
   const result=claims.safeParse(await client.idPOAuthAccessToken.verify(token,{audience:config.audience}));
   if(!result.success)return null;
   const value=result.data;
   if(value.aud[0]!==config.audience||!config.clientIds.includes(value.clientId)||value.expiration*1000<=Date.now())return null;
   // Only a previously linked first-party subject can authenticate downstream.
   // Email, organization and role claims cannot provision/link/grant authority.
   return {issuer:config.issuer,subject:value.subject,expiresAt:value.expiration*1000,clientId:value.clientId,scopes:value.scopes};
  }catch{return null;}
 };
}
