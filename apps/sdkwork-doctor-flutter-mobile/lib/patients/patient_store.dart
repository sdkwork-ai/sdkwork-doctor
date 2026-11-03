import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Patient files: the household's per-person health record.
///
/// One profile per patient; a family keeps several. The conversation always
/// carries exactly one active profile, and the persisted document is pinned by
/// `contracts/patient-profile.schema.json`, which the TypeScript, H5, mini
/// program, and Flutter surfaces all read and write.
///
/// The shape here mirrors `patient-profiles.ts` in
/// `@sdkwork/doctor-common-doctor`; `test/patient_store_test.dart` asserts it
/// against the authored schema.

/// Storage key shared by every surface.
const String kPatientProfilesStorageKey = 'sdkwork.doctor.patient-profiles.v1';

/// Serialized household document version.
const int kPatientProfileVersion = 1;

/// A household may keep this many patient files.
const int kPatientProfileLimit = 12;

/// Earliest birth year a profile accepts.
const int kMinPatientBirthYear = 1900;

/// Longest accepted display name, matching the schema.
const int kPatientDisplayNameMaxLength = 40;

/// Longest accepted free-form notes, matching the schema.
const int kPatientNotesMaxLength = 500;

/// Blood types a profile may carry; an empty string means "not recorded".
const List<String> kBloodTypes = <String>[
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

/// Household relationship of a patient file.
enum PatientRelation { self, spouse, child, parent, other }

/// Recorded sex of a patient file.
enum PatientSex { female, male, unspecified }

/// Parses a persisted relation, or null when the value is not one of the five.
PatientRelation? patientRelationFrom(Object? value) {
  if (value is! String) return null;
  for (final PatientRelation relation in PatientRelation.values) {
    if (relation.name == value) return relation;
  }
  return null;
}

/// Parses a persisted sex, or null when the value is not one of the three.
PatientSex? patientSexFrom(Object? value) {
  if (value is! String) return null;
  for (final PatientSex sex in PatientSex.values) {
    if (sex.name == value) return sex;
  }
  return null;
}

/// True when [value] is one of [kBloodTypes].
bool isBloodType(Object? value) =>
    value is String && kBloodTypes.contains(value);

/// One patient file in the household.
class PatientProfile {
  const PatientProfile({
    required this.id,
    required this.displayName,
    required this.relation,
    required this.birthYear,
    this.birthDate,
    this.sex = PatientSex.unspecified,
    this.bloodType = '',
    this.allergies = const <String>[],
    this.chronicConditions = const <String>[],
    this.medications = const <String>[],
    this.notes = '',
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String displayName;
  final PatientRelation relation;
  final int birthYear;

  /// Full birth date as `YYYY-MM-DD`, or null when only the year is known.
  final String? birthDate;
  final PatientSex sex;

  /// One of [kBloodTypes], or an empty string when not recorded.
  final String bloodType;
  final List<String> allergies;
  final List<String> chronicConditions;
  final List<String> medications;
  final String notes;
  final String? createdAt;
  final String? updatedAt;

  /// `Name (relation)` label used by the visit-record contract.
  String get label => '$displayName (${relation.name})';

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'displayName': displayName,
        'relation': relation.name,
        'birthYear': birthYear,
        'birthDate': birthDate,
        'sex': sex.name,
        'bloodType': bloodType,
        'allergies': allergies,
        'chronicConditions': chronicConditions,
        'medications': medications,
        'notes': notes,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  /// Returns null for an entry that does not satisfy the pinned shape.
  static PatientProfile? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? displayName = value['displayName'];
    final PatientRelation? relation = patientRelationFrom(value['relation']);
    final Object? birthYear = value['birthYear'];
    final PatientSex? sex = patientSexFrom(value['sex']);
    if (id is! String || id.trim().isEmpty) return null;
    if (displayName is! String || displayName.trim().isEmpty) return null;
    if (relation == null) return null;
    if (birthYear is! int) return null;
    if (sex == null) return null;
    final Object? createdAt = value['createdAt'];
    final Object? updatedAt = value['updatedAt'];
    final Object? notes = value['notes'];
    return PatientProfile(
      id: id.trim(),
      displayName: displayName.trim(),
      relation: relation,
      birthYear: birthYear,
      birthDate: _validBirthDate(value['birthDate']),
      sex: sex,
      bloodType:
          isBloodType(value['bloodType']) ? value['bloodType'] as String : '',
      allergies: _stringList(value['allergies']),
      chronicConditions: _stringList(value['chronicConditions']),
      medications: _stringList(value['medications']),
      notes:
          _optionalText(notes is String ? notes : '', kPatientNotesMaxLength),
      createdAt: createdAt is String ? createdAt : null,
      updatedAt: updatedAt is String ? updatedAt : null,
    );
  }
}

final RegExp _birthDatePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

/// Trims, drops blanks, de-duplicates case-insensitively, keeps first spelling.
List<String> normalizeProfileList(Iterable<String> values) {
  final Set<String> seen = <String>{};
  final List<String> normalized = <String>[];
  for (final String raw in values) {
    final String text = raw.trim();
    if (text.isEmpty) continue;
    if (!seen.add(text.toLowerCase())) continue;
    normalized.add(text);
  }
  return List<String>.unmodifiable(normalized);
}

/// Splits one comma-separated field into normalized entries; accepts full-width
/// commas and the enumeration comma.
List<String> splitProfileField(String value) =>
    normalizeProfileList(value.split(RegExp('[,，、]')));

/// Best-effort unique id.
String newPatientProfileId() {
  final Random random = Random();
  final String stamp = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  final String suffix = random.nextInt(1 << 32).toRadixString(36);
  return 'patient-$stamp-$suffix';
}

/// The seeded household, present only on a device that has never stored a
/// profile. Once a household document exists (even an empty one) the seed is
/// never re-applied, so deleting every profile stays deleted.
const PatientProfile kDemoSelfPatient = PatientProfile(
  id: 'member-self',
  displayName: 'Me',
  relation: PatientRelation.self,
  birthYear: 1990,
  sex: PatientSex.unspecified,
);

/// The first-run household: exactly one self profile.
PatientHousehold defaultPatientHousehold() => PatientHousehold(
      profiles: const <PatientProfile>[kDemoSelfPatient],
      activeId: kDemoSelfPatient.id,
    );

/// The persisted household document.
class PatientHousehold {
  const PatientHousehold({required this.profiles, required this.activeId});

  final List<PatientProfile> profiles;

  /// Id of the active profile, or null when the household is empty.
  final String? activeId;
}

/// The form values one create/edit produces.
class PatientProfileInput {
  const PatientProfileInput({
    required this.displayName,
    required this.relation,
    required this.birthYear,
    this.birthDate,
    this.sex = PatientSex.unspecified,
    this.bloodType = '',
    this.allergies = const <String>[],
    this.chronicConditions = const <String>[],
    this.medications = const <String>[],
    this.notes = '',
  });

  /// The form values of an existing profile, for an in-place edit.
  factory PatientProfileInput.fromProfile(PatientProfile profile) =>
      PatientProfileInput(
        displayName: profile.displayName,
        relation: profile.relation,
        birthYear: profile.birthYear,
        birthDate: profile.birthDate,
        sex: profile.sex,
        bloodType: profile.bloodType,
        allergies: profile.allergies,
        chronicConditions: profile.chronicConditions,
        medications: profile.medications,
        notes: profile.notes,
      );

  final String displayName;
  final PatientRelation relation;
  final int birthYear;
  final String? birthDate;
  final PatientSex sex;
  final String bloodType;
  final List<String> allergies;
  final List<String> chronicConditions;
  final List<String> medications;
  final String notes;

  /// Copies these values with the named fields replaced. [clearBirthDate]
  /// clears a stored full birth date, which a null [birthDate] cannot express.
  PatientProfileInput copyWith({
    String? displayName,
    PatientRelation? relation,
    int? birthYear,
    String? birthDate,
    bool clearBirthDate = false,
    PatientSex? sex,
    String? bloodType,
    List<String>? allergies,
    List<String>? chronicConditions,
    List<String>? medications,
    String? notes,
  }) =>
      PatientProfileInput(
        displayName: displayName ?? this.displayName,
        relation: relation ?? this.relation,
        birthYear: birthYear ?? this.birthYear,
        birthDate: clearBirthDate ? null : (birthDate ?? this.birthDate),
        sex: sex ?? this.sex,
        bloodType: bloodType ?? this.bloodType,
        allergies: allergies ?? this.allergies,
        chronicConditions: chronicConditions ?? this.chronicConditions,
        medications: medications ?? this.medications,
        notes: notes ?? this.notes,
      );
}

String _requiredText(String value, String field, int maxLength) {
  final String text = value.trim();
  if (text.isEmpty) {
    throw ArgumentError('patient profile needs a $field');
  }
  if (text.length > maxLength) {
    throw ArgumentError('patient profile $field is too long');
  }
  return text;
}

String _optionalText(String value, int maxLength) {
  final String text = value.trim();
  return text.length > maxLength ? text.substring(0, maxLength) : text;
}

String? _validBirthDate(Object? value) {
  if (value is! String) return null;
  final String text = value.trim();
  if (!_birthDatePattern.hasMatch(text)) return null;
  final List<String> parts = text.split('-');
  final int? year = int.tryParse(parts[0]);
  final int? month = int.tryParse(parts[1]);
  final int? day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return text;
}

List<String> _stringList(Object? value) {
  if (value is! List) return const <String>[];
  return normalizeProfileList(value.whereType<String>());
}

/// Builds one patient file. Validation is strict and explicit so a form can
/// show a precise failure instead of persisting a half-valid record.
PatientProfile createPatientProfile(
  PatientProfileInput input, {
  String? id,
  DateTime? now,
  String? createdAt,
}) {
  final String displayName = _requiredText(
      input.displayName, 'display name', kPatientDisplayNameMaxLength);
  final int maxYear = DateTime.now().year;
  if (input.birthYear < kMinPatientBirthYear || input.birthYear > maxYear) {
    throw ArgumentError(
      'patient profile needs a birth year between $kMinPatientBirthYear and $maxYear',
    );
  }
  final String timestamp = (now ?? DateTime.now()).toUtc().toIso8601String();
  final String resolvedId = (id ?? newPatientProfileId()).trim();
  return PatientProfile(
    id: resolvedId.isEmpty ? newPatientProfileId() : resolvedId,
    displayName: displayName,
    relation: input.relation,
    birthYear: input.birthYear,
    birthDate: _validBirthDate(input.birthDate),
    sex: input.sex,
    bloodType: isBloodType(input.bloodType) ? input.bloodType : '',
    allergies: normalizeProfileList(input.allergies),
    chronicConditions: normalizeProfileList(input.chronicConditions),
    medications: normalizeProfileList(input.medications),
    notes: _optionalText(input.notes, kPatientNotesMaxLength),
    createdAt: createdAt ?? timestamp,
    updatedAt: timestamp,
  );
}

/// Applies a form edit and re-validates the result; `id` and `createdAt` never
/// change.
PatientProfile updatePatientProfile(
  PatientProfile profile,
  PatientProfileInput input, {
  DateTime? now,
}) =>
    createPatientProfile(
      input,
      id: profile.id,
      createdAt: profile.createdAt,
      now: now,
    );

/// Share of the six care facts that are filled in, as a whole percentage.
int patientProfileCompleteness(PatientProfile profile) {
  final List<bool> checks = <bool>[
    profile.birthDate != null || profile.birthYear > kMinPatientBirthYear,
    profile.bloodType.isNotEmpty,
    profile.allergies.isNotEmpty,
    profile.chronicConditions.isNotEmpty,
    profile.medications.isNotEmpty,
    profile.notes.trim().isNotEmpty,
  ];
  final int filled = checks.where((bool check) => check).length;
  return (filled / checks.length * 100).round();
}

const PatientHousehold _emptyHousehold =
    PatientHousehold(profiles: <PatientProfile>[], activeId: null);

/// Parses a persisted household defensively. A corrupt profile is dropped
/// instead of taking the tab down; an unknown active id falls back to the first
/// profile so the app is never left without an active patient.
PatientHousehold parsePatientHousehold(Object? value) {
  Object? parsed = value;
  if (value is String) {
    if (value.trim().isEmpty) return _emptyHousehold;
    try {
      parsed = jsonDecode(value);
    } on FormatException {
      return _emptyHousehold;
    }
  }
  final List<Object?> rawProfiles;
  Object? rawActiveId;
  if (parsed is List) {
    rawProfiles = List<Object?>.from(parsed);
  } else if (parsed is Map) {
    final Object? profiles = parsed['profiles'];
    rawProfiles =
        profiles is List ? List<Object?>.from(profiles) : const <Object?>[];
    rawActiveId = parsed['activeId'];
  } else {
    return _emptyHousehold;
  }
  final List<PatientProfile> profiles = rawProfiles
      .map(PatientProfile.fromJson)
      .whereType<PatientProfile>()
      .toList(growable: false);
  final String requested = rawActiveId is String ? rawActiveId : '';
  final bool found =
      profiles.any((PatientProfile profile) => profile.id == requested);
  final String? activeId =
      found ? requested : (profiles.isEmpty ? null : profiles.first.id);
  return PatientHousehold(profiles: profiles, activeId: activeId);
}

/// Serializes the household exactly as the shared document declares:
/// `{"version":1,"activeId":"...","profiles":[...]}`.
String serializePatientHousehold(PatientHousehold household) => jsonEncode(
      <String, Object?>{
        'version': kPatientProfileVersion,
        'activeId': household.activeId,
        'profiles': household.profiles
            .map((PatientProfile profile) => profile.toJson())
            .toList(growable: false),
      },
    );

/// Persistence port; the app uses shared preferences, tests use memory.
abstract class PatientProfileStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SharedPreferencesPatientProfileStorage implements PatientProfileStorage {
  @override
  Future<String?> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(kPatientProfilesStorageKey);
  }

  @override
  Future<void> write(String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString(kPatientProfilesStorageKey, value);
  }
}

/// In-memory persistence for tests and hosts without storage.
class MemoryPatientProfileStorage implements PatientProfileStorage {
  MemoryPatientProfileStorage([this._value]);

  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async => _value = value;
}

/// Observable household store: selects the active patient, and creates,
/// edits, and deletes patient files.
class PatientProfileStore extends ChangeNotifier {
  PatientProfileStore._(this._storage, this._household);

  /// Reads the stored household; the seed applies only when no document has
  /// ever been written, so a stored empty household is never re-seeded.
  static Future<PatientProfileStore> load(
    PatientProfileStorage storage, {
    PatientProfileStorage? fallback,
    PatientHousehold? seed,
  }) async {
    final PatientHousehold seeded = seed ?? defaultPatientHousehold();
    try {
      final String? raw = await storage.read();
      final PatientHousehold household = raw == null || raw.trim().isEmpty
          ? seeded
          : parsePatientHousehold(raw);
      return PatientProfileStore._(storage, household);
    } catch (_) {
      // A broken storage backend must not take the patient files down.
      return PatientProfileStore._(
          fallback ?? MemoryPatientProfileStorage(), seeded);
    }
  }

  /// In-memory store for tests.
  factory PatientProfileStore.memory({
    List<PatientProfile>? profiles,
    String? activeId,
  }) {
    final PatientHousehold household = profiles == null
        ? defaultPatientHousehold()
        : PatientHousehold(
            profiles: profiles,
            activeId: activeId ?? (profiles.isEmpty ? null : profiles.first.id),
          );
    return PatientProfileStore._(
      MemoryPatientProfileStorage(serializePatientHousehold(household)),
      household,
    );
  }

  final PatientProfileStorage _storage;
  PatientHousehold _household;

  /// Every patient file in household order, newest added last.
  List<PatientProfile> get profiles =>
      List<PatientProfile>.unmodifiable(_household.profiles);

  /// Id of the active patient, or null when no profile exists.
  String? get activeId => _household.activeId;

  /// The active profile, or null when the household has no profile yet.
  PatientProfile? get active {
    final String? id = _household.activeId;
    for (final PatientProfile profile in _household.profiles) {
      if (profile.id == id) return profile;
    }
    return _household.profiles.isEmpty ? null : _household.profiles.first;
  }

  /// Switches the active patient; an unknown id is ignored.
  Future<void> select(String id) async {
    if (!_household.profiles
        .any((PatientProfile profile) => profile.id == id)) {
      return;
    }
    if (_household.activeId == id) return;
    _household = PatientHousehold(
      profiles: _household.profiles,
      activeId: id,
    );
    notifyListeners();
    await _persist();
  }

  /// Adds one patient file. The first profile becomes active.
  Future<PatientProfile> add(PatientProfileInput input) async {
    if (_household.profiles.length >= kPatientProfileLimit) {
      throw StateError('patient profile limit reached: $kPatientProfileLimit');
    }
    final PatientProfile profile = createPatientProfile(input);
    _household = PatientHousehold(
      profiles: <PatientProfile>[..._household.profiles, profile],
      activeId: _household.activeId ?? profile.id,
    );
    notifyListeners();
    await _persist();
    return profile;
  }

  /// Applies a form edit to one profile; an unknown id throws.
  Future<PatientProfile> update(String id, PatientProfileInput input) async {
    final PatientProfile current = _requireProfile(id);
    final PatientProfile updated = updatePatientProfile(current, input);
    _household = PatientHousehold(
      profiles: _household.profiles
          .map((PatientProfile profile) => profile.id == id ? updated : profile)
          .toList(growable: false),
      activeId: _household.activeId,
    );
    notifyListeners();
    await _persist();
    return updated;
  }

  /// Removes one profile. Removing the active profile promotes the first
  /// remaining one; deleting every profile stays deleted.
  Future<void> remove(String id) async {
    final List<PatientProfile> remaining = _household.profiles
        .where((PatientProfile profile) => profile.id != id)
        .toList(growable: false);
    if (remaining.length == _household.profiles.length) return;
    _household = PatientHousehold(
      profiles: remaining,
      activeId: _household.activeId == id
          ? (remaining.isEmpty ? null : remaining.first.id)
          : _household.activeId,
    );
    notifyListeners();
    await _persist();
  }

  PatientProfile _requireProfile(String id) {
    for (final PatientProfile profile in _household.profiles) {
      if (profile.id == id) return profile;
    }
    throw StateError('unknown patient profile: $id');
  }

  Future<void> _persist() async {
    try {
      await _storage.write(serializePatientHousehold(_household));
    } catch (_) {
      // Keep the session copy when the device rejects the write.
    }
  }
}
