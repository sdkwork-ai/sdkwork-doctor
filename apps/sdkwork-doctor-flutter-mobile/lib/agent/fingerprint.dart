/// Deterministic idempotency fingerprint, byte-identical to the TypeScript and
/// mini program implementations. Vectors live in
/// `contracts/care-fingerprint-vectors.json` and are asserted by
/// `test/fingerprint_test.dart`.
library;

const List<String> _salts = <String>[
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
  for (final String salt in _salts) {
    buffer.write(_fnv1a32('$salt\u0000$value', _fnvOffsetBasis).toRadixString(16).padLeft(8, '0'));
  }
  return buffer.toString();
}

String canonicalTurnPayload(String content, String contentType, String entrySurface) =>
    'content=$content\u0001type=$contentType\u0001surface=$entrySurface';

String careTurnPayloadHash(String content, String contentType, String entrySurface) =>
    'care.v1:${careFingerprint(canonicalTurnPayload(content, contentType, entrySurface))}';

String careSessionPayloadHash(String title, String entrySurface) =>
    'care.v1:${careFingerprint('title=$title\u0001surface=$entrySurface')}';
