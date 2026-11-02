import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/patients/patient_store.dart';

/// Pins the Dart patient-file shape to the shared contract and covers
/// validation, completeness, the one-time seed, the household limit, and
/// persistence.
void main() {
  final File schemaFile = File(
    '../sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/patient-profile.schema.json',
  );

  Map<String, dynamic> schema() =>
      jsonDecode(schemaFile.readAsStringSync()) as Map<String, dynamic>;

  const PatientProfileInput child = PatientProfileInput(
    displayName: 'Xiaoman',
    relation: PatientRelation.child,
    birthYear: 2019,
    sex: PatientSex.female,
    allergies: <String>['penicillin'],
  );

  test('the Dart profile carries exactly the contract fields', () {
    final Map<String, dynamic> contract = schema();
    expect(contract['kind'], 'sdkwork.doctor.patient-profile');
    expect(contract['storageKey'], kPatientProfilesStorageKey);
    expect(contract['limit'], kPatientProfileLimit);
    expect(contract['documentVersion'], kPatientProfileVersion);
    expect(contract['document']['version'], kPatientProfileVersion.toString());

    final PatientProfile profile = createPatientProfile(
      child,
      id: 'member-child',
      now: DateTime.utc(2026, 11, 2, 9),
    );
    expect(
      profile.toJson().keys.toSet(),
      (contract['fields'] as Map<String, dynamic>).keys.toSet(),
    );
    for (final String required
        in (contract['required'] as List<dynamic>).cast<String>()) {
      expect(profile.toJson().containsKey(required), isTrue,
          reason: required);
    }
    expect(profile.displayName, 'Xiaoman');
    expect(profile.relation, PatientRelation.child);
    expect(profile.birthYear, 2019);
    expect(profile.allergies, <String>['penicillin']);
  });

  test('profile validation rejects the facts the app cannot safely store', () {
    expect(
      () => createPatientProfile(child.copyWith(displayName: '   ')),
      throwsArgumentError,
    );
    expect(
      () => createPatientProfile(
        child.copyWith(displayName: List<String>.filled(41, 'x').join()),
      ),
      throwsArgumentError,
    );
    expect(
      () => createPatientProfile(child.copyWith(birthYear: 1899)),
      throwsArgumentError,
    );
    expect(
      () => createPatientProfile(child.copyWith(birthYear: DateTime.now().year + 1)),
      throwsArgumentError,
    );
  });

  test('list fields are trimmed and de-duplicated, and comma fields split both widths', () {
    expect(
      normalizeProfileList(<String>[' peanut ', 'Peanut', '', 'dust']),
      <String>['peanut', 'dust'],
    );
    expect(
      splitProfileField('penicillin, aspirin，dust、latex'),
      <String>['penicillin', 'aspirin', 'dust', 'latex'],
    );
    expect(splitProfileField(''), isEmpty);
  });

  test('an unknown blood type degrades to "not recorded"', () {
    final PatientProfile profile =
        createPatientProfile(child.copyWith(bloodType: 'Z+'));
    expect(profile.bloodType, '');
    expect(
      createPatientProfile(child.copyWith(bloodType: 'O+')).bloodType,
      'O+',
    );
  });

  test('completeness counts the six care facts', () {
    expect(
      patientProfileCompleteness(
          createPatientProfile(child.copyWith(allergies: <String>[]))),
      17,
    );
    final PatientProfile full = createPatientProfile(
      child.copyWith(
        birthDate: '2019-06-02',
        bloodType: 'O+',
        chronicConditions: <String>['asthma'],
        medications: <String>['salbutamol'],
        notes: 'Wheezing after colds.',
      ),
    );
    expect(patientProfileCompleteness(full), 100);
  });

  test('a seeded device keeps exactly one self profile', () {
    final PatientProfileStore store = PatientProfileStore.memory();
    expect(store.profiles, hasLength(1));
    expect(store.profiles.first.id, 'member-self');
    expect(store.activeId, 'member-self');
    expect(store.active?.displayName, 'Me');
    expect(kDemoSelfPatient.id, 'member-self');
  });

  test('the store adds, selects, updates, removes, and persists', () async {
    final MemoryPatientProfileStorage storage = MemoryPatientProfileStorage();
    final PatientProfileStore store =
        await PatientProfileStore.load(storage);
    expect(store.profiles, hasLength(1), reason: 'first run seeds the household');

    final PatientProfile added = await store.add(child);
    expect(store.profiles, hasLength(2));
    expect(store.activeId, 'member-self', reason: 'adding does not steal the active patient');

    await store.select(added.id);
    expect(store.active?.id, added.id);

    final PatientProfile updated = await store.update(
      added.id,
      PatientProfileInput.fromProfile(added).copyWith(
        notes: 'Peanut allergy too.',
        allergies: <String>['penicillin', 'peanut'],
      ),
    );
    expect(updated.allergies, <String>['penicillin', 'peanut']);
    expect(updated.notes, 'Peanut allergy too.');
    expect(updated.id, added.id, reason: 'update keeps the id');
    expect(updated.updatedAt, isNotNull);

    final PatientProfileStore reloaded =
        await PatientProfileStore.load(storage);
    expect(reloaded.profiles, hasLength(2));
    expect(reloaded.activeId, added.id, reason: 'the active patient survives a reload');
    expect(reloaded.active?.allergies, <String>['penicillin', 'peanut']);

    await reloaded.remove(added.id);
    expect(reloaded.profiles, hasLength(1));
    expect(reloaded.activeId, 'member-self',
        reason: 'removing the active patient promotes the first remaining one');
  });

  test('deleting every profile stays deleted instead of re-seeding', () async {
    final MemoryPatientProfileStorage storage = MemoryPatientProfileStorage();
    final PatientProfileStore store = await PatientProfileStore.load(storage);
    await store.remove('member-self');
    expect(store.profiles, isEmpty);
    expect(store.active, isNull);

    final PatientProfileStore reloaded =
        await PatientProfileStore.load(storage);
    expect(reloaded.profiles, isEmpty,
        reason: 'an empty stored household is not re-seeded');
  });

  test('the household is capped at the documented limit', () async {
    final PatientProfileStore store =
        PatientProfileStore.memory(profiles: <PatientProfile>[]);
    for (int index = 0; index < kPatientProfileLimit; index += 1) {
      await store.add(child.copyWith(displayName: 'Patient $index'));
    }
    expect(store.profiles, hasLength(kPatientProfileLimit));
    expect(
      () => store.add(child.copyWith(displayName: 'One too many')),
      throwsStateError,
    );
  });

  test('a stored document round-trips through the pinned shape', () {
    final PatientHousehold household = defaultPatientHousehold();
    final Map<String, dynamic> document =
        jsonDecode(serializePatientHousehold(household)) as Map<String, dynamic>;
    expect(document.keys.toSet(), <String>{'version', 'activeId', 'profiles'});
    expect(document['version'], 1);
    expect(document['activeId'], 'member-self');
    expect(document['profiles'], isA<List<dynamic>>());

    final PatientHousehold parsed =
        parsePatientHousehold(serializePatientHousehold(household));
    expect(parsed.profiles.single.id, 'member-self');
    expect(parsed.activeId, 'member-self');
  });

  test('corrupt persistence is dropped instead of taking the tab down', () {
    expect(parsePatientHousehold('{not json').profiles, isEmpty);
    expect(parsePatientHousehold('').profiles, isEmpty);
    expect(parsePatientHousehold(null).profiles, isEmpty);
    final String mixed = jsonEncode(<String, Object?>{
      'version': 1,
      'activeId': 'missing',
      'profiles': <Object?>[
        createPatientProfile(child).toJson(),
        <String, Object?>{'id': 'x'},
        42,
        null,
      ],
    });
    final PatientHousehold parsed = parsePatientHousehold(mixed);
    expect(parsed.profiles, hasLength(1));
    expect(parsed.activeId, parsed.profiles.first.id,
        reason: 'an unknown active id falls back to the first profile');
  });

  test('unknown actions are ignored instead of throwing', () async {
    final PatientProfileStore store = PatientProfileStore.memory();
    await store.select('missing');
    expect(store.activeId, 'member-self');
    await store.remove('missing');
    expect(store.profiles, hasLength(1));
    expect(
      () => store.update('missing', child),
      throwsStateError,
    );
  });

  test('a storage failure degrades to the session household', () async {
    final PatientProfileStore store = await PatientProfileStore.load(
      _ThrowingPatientStorage(),
      fallback: MemoryPatientProfileStorage(),
    );
    expect(store.profiles, hasLength(1));
    await store.add(child);
    expect(store.profiles, hasLength(2));
  });

  test('mutations notify listeners', () async {
    final PatientProfileStore store = PatientProfileStore.memory();
    int notifications = 0;
    store.addListener(() => notifications += 1);
    await store.add(child);
    expect(notifications, 1);
    await store.select(store.profiles.last.id);
    expect(notifications, 2);
    await store.remove(store.profiles.last.id);
    expect(notifications, 3);
  });
}

class _ThrowingPatientStorage implements PatientProfileStorage {
  @override
  Future<String?> read() async => throw StateError('storage unavailable');

  @override
  Future<void> write(String value) async =>
      throw StateError('storage unavailable');
}
