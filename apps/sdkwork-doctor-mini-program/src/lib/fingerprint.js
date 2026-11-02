// Deterministic idempotency fingerprint shared with the TypeScript, Dart, and
// web implementations. Vectors are frozen in
// contracts/care-fingerprint-vectors.json and asserted by tests/fingerprint.test.mjs.
const SALTS = ['care.turn.v1', 'care.session.v1', 'care.policy.v1', 'care.reply.v1'];
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(value, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash = Math.imul(hash ^ (code & 0xff), FNV_PRIME) >>> 0;
    hash = Math.imul(hash ^ ((code >>> 8) & 0xff), FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function toHex8(value) {
  return (value >>> 0).toString(16).padStart(8, '0');
}

function careFingerprint(value) {
  return SALTS.map((salt) => toHex8(fnv1a32(salt + '\u0000' + value, FNV_OFFSET_BASIS))).join('');
}

function canonicalTurnPayload(content, contentType, entrySurface) {
  return ['content=' + content, 'type=' + contentType, 'surface=' + entrySurface].join('\u0001');
}

function careTurnPayloadHash(content, contentType, entrySurface) {
  return 'care.v1:' + careFingerprint(canonicalTurnPayload(content, contentType, entrySurface));
}

function careSessionPayloadHash(title, entrySurface) {
  return 'care.v1:' + careFingerprint(['title=' + title, 'surface=' + entrySurface].join('\u0001'));
}

module.exports = {
  careFingerprint,
  canonicalTurnPayload,
  careTurnPayloadHash,
  careSessionPayloadHash,
};
