/**
 * Deterministic idempotency fingerprint shared by every Doctor client.
 *
 * `payloadHash` in the agents app API is an opaque equality fingerprint (1..128
 * characters, never recomputed by the server): it only has to be stable across a
 * retry of the same logical request with the same `idempotencyKey`. Doctor does
 * not use a cryptographic digest because the WeChat mini program runtime and a
 * dependency-free Flutter build expose no SHA-256 primitive, and shipping four
 * hand-written SHA-256 implementations would create four places to drift.
 *
 * The algorithm is a 128-bit salted FNV-1a fold implemented with 32-bit
 * arithmetic only, so TypeScript, Dart, and the mini program produce identical
 * digests. `tests/care-fingerprint-fixtures.test.mjs` pins the vectors.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SALTS: readonly string[] = Object.freeze(['care.turn.v1', 'care.session.v1', 'care.policy.v1', 'care.reply.v1']);

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash = Math.imul(hash ^ (code & 0xff), FNV_PRIME) >>> 0;
    hash = Math.imul(hash ^ ((code >>> 8) & 0xff), FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/** 32 lowercase hex characters: four salted 32-bit FNV-1a folds. */
export function careFingerprint(value: string): string {
  return SALTS.map((salt) => toHex8(fnv1a32(salt + '\u0000' + value, FNV_OFFSET_BASIS))).join('');
}

/** Canonical, newline-free payload string for a chat turn. */
export function canonicalTurnPayload(content: string, contentType: string, entrySurface: string): string {
  return ['content=' + content, 'type=' + contentType, 'surface=' + entrySurface].join('\u0001');
}

/** `payloadHash` for `CreateAgentTurnRequest`. */
export function careTurnPayloadHash(content: string, contentType: string, entrySurface: string): string {
  return 'care.v1:' + careFingerprint(canonicalTurnPayload(content, contentType, entrySurface));
}

/** `payloadHash` for `CreateAgentSessionRequest`. */
export function careSessionPayloadHash(title: string, entrySurface: string): string {
  return 'care.v1:' + careFingerprint(['title=' + title, 'surface=' + entrySurface].join('\u0001'));
}
