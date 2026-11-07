# EMBA signing custody

## Engineering decision — 2026-11-07

Use service-held Ed25519 private keys in a server-only Vercel **Secret** environment variable for this bounded pilot. This is service-attested authorship, not proof that a member holds a private key. Keys are available to the application process; this is not hardware-backed non-exportable custody. Keep separate keys and registrations for every environment and exact organization/loop.

The linked project was verified read-only as `Fullstackfang Production / v0-stellic-loop`, Node 24, with its existing Supabase integration. No signing secret was present. No live environment or database was changed.

[Vercel KMS](https://vercel.com/docs/kms) currently lists RSA/PSS/ECDSA signing families, not Ed25519. It is therefore not a drop-in implementation of the spec's canonical Ed25519 envelope. Changing the algorithm to fit KMS would change the acceptance contract. [Vercel Secret variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables) provide existing deployment configuration without a new provider or billing integration. Do not claim that environment secrets offer KMS isolation.

## Configuration and authority

`LOOP_ANNOUNCEMENT_KEYS` contains a JSON array of `{orgId, loopId, keyId, privateKey}`. `privateKey` is an Ed25519 PKCS8 PEM string with JSON-escaped newlines. IDs are UUIDs; `keyId` is the matching public-key registration returned by `registerAnnouncementKey`. Configuration is capped at 16 exact scopes and 16 KiB. Duplicate scopes/IDs, malformed JSON, unsupported algorithms or invalid keys disable the resolver. Missing configuration or scope returns unavailable. Secret-bearing parse/crypto errors are neither logged nor returned.

The resolver is server-only and never reads a key from a browser field, cookie, query or announcement. It reads current configuration on each lookup. A signer is still not authorization: publication verifies current organizer authority, exact registered key scope, active lifecycle status and the resulting signature against the registered public key inside its transaction. A stale deployment holding a retired key cannot publish with it. Verification requires only stored public keys.

## Initial provisioning

1. Establish the pilot organization/loops and verified organizer through the approved enrollment workflow. Do not register keys against synthetic fixture IDs in production.
2. Generate an Ed25519 pair in a trusted operator environment using Node's `generateKeyPairSync('ed25519')` or equivalent audited tooling. Export the private key as PKCS8 PEM and the public key as SPKI PEM. Store private material in an access-controlled secret workflow, never repository files, terminal output, chat or command arguments.
3. Call the existing `registerAnnouncementKey` service as the verified organizer with **only the public SPKI key** and exact scope. Retain its returned `keyId`.
4. Supply the scoped JSON to the linked project's `LOOP_ANNOUNCEMENT_KEYS` as type **Secret**, scoped to the intended environment. Use the dashboard secret input or CLI standard input from a protected temporary file; never place the value in a command argument. Remove any temporary private file with the same controlled secret-handling workflow. Do not pull production signing secrets into ordinary developer environments.
5. Redeploy only after the pilot's migration/auth/launch gates are satisfied. Publish a harmless reviewed notice, verify its stored envelope/signature and access controls, and record the operator/date/key ID. No real provisioning or hosted smoke test is claimed by local tests.

## Rotation, revocation and compromise

Generate/register a new pair before changing the scope's configured `keyId` and private key. Deploy the new configuration, verify a reviewed notice, then retire the old public-key record through the organizer key-status control. While older deployments drain, retirement denies their new signing attempts; their historical signatures remain verifiable. Never overwrite the existing public-key row or change a published envelope.

For suspected exposure, mark the old key **compromised** immediately through the authenticated control, remove it from deployment configuration, and rotate. Compromise makes all of that key's historical notices unverified. Revocation also invalidates historical verification; retirement is for ordinary replacement. Revoke access to compromised deployment credentials and replace affected secrets. Removing configuration alone does not change historical verification; the database lifecycle action is required. Already delivered information cannot be recalled.

The pilot owner must name an operator before enrollment. Production key generation/provisioning and the hosted rotation drill remain deployment actions after real identity/scope setup; they are not reasons to leave the server implementation absent.
