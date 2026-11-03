/// Deterministic idempotency fingerprint for the care surface.
///
/// Byte-identical to `apps/sdkwork-doctor-flutter-mobile/lib/agent/fingerprint.dart`,
/// the TypeScript contract (`sdkwork-doctor-common-agent/src/fingerprint.ts`) and
/// the mini program implementation: a 128-bit salted FNV-1a fold over four
/// salts, computed with 32-bit arithmetic only. `payloadHash` in the agents app
/// API is an opaque equality fingerprint, so one algorithm across four clients
/// keeps retries idempotent without a cryptographic dependency.
library;

/// Salts, in digest order. Shared with every Doctor client.
const List<String> careFingerprintSalts = <String>[
  'care.turn.v1',
  'care.session.v1',
  'care.policy.v1',
  'care.reply.v1',
];

const int _fnvOffsetBasis = 0x811c9dc5;
const int _fnvPrime = 0x01000193;
const int _mask32 = 0xFFFFFFFF;

int _fnv1a32(String value, int seed) {
  int hash = seed & _mask32;
  for (int index = 0; index < value.length; index += 1) {
    final int code = value.codeUnitAt(index);
    hash = ((hash ^ (code & 0xff)) * _fnvPrime) & _mask32;
    hash = ((hash ^ ((code >> 8) & 0xff)) * _fnvPrime) & _mask32;
  }
  return hash & _mask32;
}

/// 32 lowercase hex characters: four salted 32-bit FNV-1a folds.
String careFingerprint(String value) {
  final StringBuffer buffer = StringBuffer();
  for (final String salt in careFingerprintSalts) {
    buffer.write(
      _fnv1a32('$salt\u0000$value', _fnvOffsetBasis).toRadixString(16).padLeft(8, '0'),
    );
  }
  return buffer.toString();
}

/// Canonical, newline-free payload string for one chat turn.
String canonicalCareTurnPayload(
  String content,
  String contentType,
  String entrySurface,
) =>
    'content=$content\u0001type=$contentType\u0001surface=$entrySurface';

/// `payloadHash` for a `CreateAgentTurnRequest`.
String careTurnPayloadHash(
  String content,
  String contentType,
  String entrySurface,
) =>
    'care.v1:${careFingerprint(canonicalCareTurnPayload(content, contentType, entrySurface))}';

/// `payloadHash` for a `CreateAgentSessionRequest`.
String careSessionPayloadHash(String title, String entrySurface) =>
    'care.v1:${careFingerprint('title=$title\u0001surface=$entrySurface')}';
