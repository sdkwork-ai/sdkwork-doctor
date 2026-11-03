/// Deterministic idempotency fingerprint, byte-identical to the TypeScript and
/// mini program implementations.
///
/// The single Dart implementation lives in the care package
/// (`sdkwork_doctor_flutter_mobile_care`); this file keeps the app-facing import
/// path stable and is asserted by `test/fingerprint_test.dart` against
/// `contracts/care-fingerprint-vectors.json`.
///
/// Salts (`care.turn.v1`, `care.session.v1`, `care.policy.v1`, `care.reply.v1`)
/// and the `care.v1:` digest prefix are owned by
/// `packages/sdkwork_doctor_flutter_mobile_care/lib/src/sdk/care_fingerprint.dart`.
library;

export 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart'
    show
        canonicalCareTurnPayload,
        careFingerprint,
        careFingerprintSalts,
        careSessionPayloadHash,
        careTurnPayloadHash;
