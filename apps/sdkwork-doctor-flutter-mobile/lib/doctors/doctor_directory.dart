import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// Human-doctor directory and its authored fallback roster.
///
/// A doctor is a **person**; employment is a **relationship** to a healthcare
/// organization. The two are modelled separately:
///
/// - [DoctorProfile] carries person facts only (who the clinician is).
/// - [DoctorAffiliation] carries one employment/practice relationship: the
///   employing organization, its Appbase `med_hospital` reference, the
///   department and rank at that site, whether the engagement is full-time or
///   part-time, and the consulting hours and channels that belong to that site.
///
/// Organizational authority is SDKWork Appbase: `organizationId` is the
/// Appbase organization unit that employs or contracts the clinician and
/// `hospitalCode` is the natural key of a `med_hospital` reference row. An
/// sdkwork-company id never stands in for the clinical employer.
///
/// The roster is deployment content: a deployment binds a doctor-directory
/// document through a runtime document and this app receives that URL as a
/// build-time constant ([DoctorDirectory.directoryUrl]). When no directory is
/// configured, unreachable, or malformed, the authored fallback answers and the
/// UI states which source answered.
///
/// This mirrors `doctors.ts` in `@sdkwork/doctor-common-doctor`. The fallback
/// roster must equal `contracts/doctor-roster.json` field for field;
/// `test/doctor_directory_test.dart` asserts that equality against the file.

/// Machine kind of the deployment document this module consumes.
const String kDoctorRosterDocumentKind = 'sdkwork.doctor.doctor-roster';

/// How a clinician is engaged by one organization.
enum DoctorEmploymentType {
  fullTime('full_time'),
  partTime('part_time'),
  contract('contract'),
  visiting('visiting');

  const DoctorEmploymentType(this.wireName);

  /// The value the shared contract stores.
  final String wireName;
}

/// Parses a persisted employment type, or null when it is not one of the four.
DoctorEmploymentType? doctorEmploymentTypeFrom(Object? value) {
  if (value is! String) return null;
  for (final DoctorEmploymentType type in DoctorEmploymentType.values) {
    if (type.wireName == value) return type;
  }
  return null;
}

/// How a human doctor can be consulted.
enum DoctorChannelKind { video, phone, messaging, clinic }

/// One consult channel. `target` is a URL, a `tel:` link, or a channel id;
/// an empty target means the channel is not available.
class DoctorChannel {
  const DoctorChannel({required this.kind, required this.target});

  final DoctorChannelKind kind;
  final String target;

  Map<String, Object?> toJson() =>
      <String, Object?>{'kind': kind.name, 'target': target};
}

/// Weekly consulting window at one affiliation, in the site's local time.
/// `weekday` 0 = Sunday.
class DoctorAvailabilitySlot {
  const DoctorAvailabilitySlot({
    required this.weekday,
    required this.startTime,
    required this.endTime,
  });

  final int weekday;

  /// `HH:mm`, 00:00 through 23:59.
  final String startTime;

  /// `HH:mm`, later than [startTime].
  final String endTime;

  Map<String, Object?> toJson() => <String, Object?>{
        'weekday': weekday,
        'startTime': startTime,
        'endTime': endTime,
      };
}

/// One employment / practice relationship between a clinician and a
/// healthcare organization. Site facts live here: hospital, department, rank,
/// engagement type, consulting hours, and channels.
class DoctorAffiliation {
  const DoctorAffiliation({
    required this.organizationId,
    this.hospitalCode = '',
    required this.hospitalName,
    this.hospitalGrade = '',
    this.departmentCode = '',
    this.department = '',
    this.title = '',
    this.employmentType = DoctorEmploymentType.fullTime,
    this.primary = false,
    this.acceptingNewPatients = true,
    this.availability = const <DoctorAvailabilitySlot>[],
    this.channels = const <DoctorChannel>[],
    this.since = '',
  });

  /// Appbase organization unit that employs or contracts the clinician.
  final String organizationId;

  /// Appbase `med_hospital` natural key (`hospital_code`).
  final String hospitalCode;

  /// Display name of the site at the time the roster was published.
  final String hospitalName;

  /// Hospital grade, e.g. `THIRD_A`; empty when the directory does not publish
  /// it.
  final String hospitalGrade;

  /// Appbase `med_department` code when the directory publishes one.
  final String departmentCode;

  /// Localized department name at this site.
  final String department;

  /// Clinician rank at this site (chief physician, attending, ...).
  final String title;

  final DoctorEmploymentType employmentType;

  /// The affiliation shown first and used for a consultation by default.
  final bool primary;

  final bool acceptingNewPatients;
  final List<DoctorAvailabilitySlot> availability;
  final List<DoctorChannel> channels;

  /// ISO year-month the engagement started, e.g. `2019-06`; empty when unknown.
  final String since;

  Map<String, Object?> toJson() => <String, Object?>{
        'organizationId': organizationId,
        'hospitalCode': hospitalCode,
        'hospitalName': hospitalName,
        'hospitalGrade': hospitalGrade,
        'departmentCode': departmentCode,
        'department': department,
        'title': title,
        'employmentType': employmentType.wireName,
        'primary': primary,
        'acceptingNewPatients': acceptingNewPatients,
        'since': since,
        'availability': availability
            .map((DoctorAvailabilitySlot slot) => slot.toJson())
            .toList(growable: false),
        'channels': channels
            .map((DoctorChannel channel) => channel.toJson())
            .toList(growable: false),
      };
}

/// One human clinician in the family's roster: person facts only.
class DoctorProfile {
  const DoctorProfile({
    required this.id,
    required this.displayName,
    this.specialties = const <String>[],
    this.languages = const <String>[],
    this.yearsOfExperience = 0,
    this.bio = '',
    this.verified = false,
    this.affiliations = const <DoctorAffiliation>[],
  });

  final String id;
  final String displayName;
  final List<String> specialties;
  final List<String> languages;
  final int yearsOfExperience;
  final String bio;

  /// True only when the deployment's doctor directory vouched for this
  /// clinician; the authored fallback roster is always false.
  final bool verified;
  final List<DoctorAffiliation> affiliations;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'displayName': displayName,
        'specialties': specialties,
        'languages': languages,
        'yearsOfExperience': yearsOfExperience,
        'bio': bio,
        'verified': verified,
        'affiliations': affiliations
            .map((DoctorAffiliation affiliation) => affiliation.toJson())
            .toList(growable: false),
      };

  /// Returns null for an entry that does not satisfy the pinned shape. A
  /// clinician without any practice site carries no consultation facts, so it
  /// is dropped instead of rendering an empty card.
  static DoctorProfile? fromJson(Object? value) {
    if (value is! Map) return null;
    final String id = _requiredText(value['id'], 80);
    final String displayName = _requiredText(value['displayName'], 60);
    if (id.isEmpty || displayName.isEmpty) return null;
    final List<DoctorAffiliation> affiliations = _affiliationsFrom(value);
    if (affiliations.isEmpty) return null;
    final Object? years = value['yearsOfExperience'];
    final int parsedYears = years is int ? years : 0;
    return DoctorProfile(
      id: id,
      displayName: displayName,
      specialties: _textList(value['specialties'], 40),
      languages: _textList(value['languages'], 20),
      yearsOfExperience:
          parsedYears >= 0 && parsedYears <= 70 ? parsedYears : 0,
      bio: _requiredText(value['bio'], 600),
      verified: value['verified'] == true,
      affiliations: affiliations,
    );
  }
}

/// Where a roster came from: an operator directory, or the authored fallback.
enum DoctorRosterSource { directory, catalog }

/// One roster plus the source that answered.
class DoctorRoster {
  const DoctorRoster({required this.source, required this.doctors});

  final DoctorRosterSource source;
  final List<DoctorProfile> doctors;
}

final RegExp _timePattern = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
final RegExp _yearMonthPattern = RegExp(r'^\d{4}-(0[1-9]|1[0-2])$');

String _requiredText(Object? value, int maxLength) {
  if (value is! String) return '';
  final String text = value.trim();
  return text.length > maxLength ? text.substring(0, maxLength) : text;
}

List<String> _textList(Object? value, int maxLength) {
  if (value is! List) return const <String>[];
  final Set<String> seen = <String>{};
  final List<String> entries = <String>[];
  for (final Object? item in value) {
    if (item is! String) continue;
    final String text = item.trim();
    final String limited =
        text.length > maxLength ? text.substring(0, maxLength) : text;
    if (limited.isEmpty || !seen.add(limited.toLowerCase())) continue;
    entries.add(limited);
  }
  return List<String>.unmodifiable(entries);
}

DoctorChannelKind? _channelKindFrom(Object? value) {
  if (value is! String) return null;
  for (final DoctorChannelKind kind in DoctorChannelKind.values) {
    if (kind.name == value) return kind;
  }
  return null;
}

List<DoctorChannel> _channelsFrom(Object? value) {
  if (value is! List) return const <DoctorChannel>[];
  final List<DoctorChannel> channels = <DoctorChannel>[];
  for (final Object? entry in value) {
    if (entry is! Map) continue;
    final DoctorChannelKind? kind = _channelKindFrom(entry['kind']);
    if (kind == null) continue;
    channels.add(
      DoctorChannel(
        kind: kind,
        target: _requiredText(entry['target'], 500),
      ),
    );
  }
  return List<DoctorChannel>.unmodifiable(channels);
}

List<DoctorAvailabilitySlot> _availabilityFrom(Object? value) {
  if (value is! List) return const <DoctorAvailabilitySlot>[];
  final List<DoctorAvailabilitySlot> slots = <DoctorAvailabilitySlot>[];
  for (final Object? entry in value) {
    if (entry is! Map) continue;
    final Object? rawWeekday = entry['weekday'];
    final Object? rawStart = entry['startTime'];
    final Object? rawEnd = entry['endTime'];
    final int weekday = rawWeekday is int ? rawWeekday : -1;
    final String startTime = rawStart is String ? rawStart.trim() : '';
    final String endTime = rawEnd is String ? rawEnd.trim() : '';
    if (weekday < 0 || weekday > 6) continue;
    if (!_timePattern.hasMatch(startTime) || !_timePattern.hasMatch(endTime)) {
      continue;
    }
    if (startTime.compareTo(endTime) >= 0) continue;
    slots.add(
      DoctorAvailabilitySlot(
        weekday: weekday,
        startTime: startTime,
        endTime: endTime,
      ),
    );
  }
  return List<DoctorAvailabilitySlot>.unmodifiable(slots);
}

DoctorAffiliation? _affiliationFromUnknown(
  Object? value, {
  required bool fallbackPrimary,
}) {
  if (value is! Map) return null;
  final String organizationId = _requiredText(value['organizationId'], 80);
  final String hospitalName = _requiredText(value['hospitalName'], 120);
  if (organizationId.isEmpty || hospitalName.isEmpty) return null;
  final Object? rawSince = value['since'];
  final String since =
      rawSince is String && _yearMonthPattern.hasMatch(rawSince.trim())
          ? rawSince.trim()
          : '';
  final Object? rawPrimary = value['primary'];
  return DoctorAffiliation(
    organizationId: organizationId,
    hospitalCode: _requiredText(value['hospitalCode'], 60),
    hospitalName: hospitalName,
    hospitalGrade: _requiredText(value['hospitalGrade'], 40),
    departmentCode: _requiredText(value['departmentCode'], 20),
    department: _requiredText(value['department'], 60),
    title: _requiredText(value['title'], 60),
    employmentType:
        doctorEmploymentTypeFrom(value['employmentType']) ??
            DoctorEmploymentType.fullTime,
    primary: rawPrimary == true || (fallbackPrimary && rawPrimary != false),
    acceptingNewPatients: value['acceptingNewPatients'] != false,
    availability: _availabilityFrom(value['availability']),
    channels: _channelsFrom(value['channels']),
    since: since,
  );
}

/// Reads the affiliations of one clinician. A directory document that still
/// uses the pre-affiliation flat shape is migrated into a single primary
/// affiliation so an older deployment document keeps working instead of losing
/// every doctor.
List<DoctorAffiliation> _affiliationsFrom(Map<Object?, Object?> value) {
  final Object? rawAffiliations = value['affiliations'];
  if (rawAffiliations is List) {
    final List<DoctorAffiliation> affiliations = <DoctorAffiliation>[];
    for (int index = 0; index < rawAffiliations.length; index += 1) {
      final DoctorAffiliation? affiliation = _affiliationFromUnknown(
        rawAffiliations[index],
        fallbackPrimary: index == 0,
      );
      if (affiliation != null) affiliations.add(affiliation);
    }
    if (affiliations.isNotEmpty) {
      final bool hasPrimary =
          affiliations.any((DoctorAffiliation entry) => entry.primary);
      if (hasPrimary) return List<DoctorAffiliation>.unmodifiable(affiliations);
      return List<DoctorAffiliation>.unmodifiable(<DoctorAffiliation>[
        for (int index = 0; index < affiliations.length; index += 1)
          _copyAffiliation(affiliations[index], primary: index == 0),
      ]);
    }
  }
  final String legacyHospital = _requiredText(value['hospital'], 120);
  if (legacyHospital.isEmpty) return const <DoctorAffiliation>[];
  final Object? legacyOrganizationId = value['organizationId'];
  final DoctorAffiliation? legacy = _affiliationFromUnknown(
    <String, Object?>{
      'organizationId':
          legacyOrganizationId is String && legacyOrganizationId.trim().isNotEmpty
              ? legacyOrganizationId
              : 'org.legacy-directory',
      'hospitalCode': value['hospitalCode'] ?? '',
      'hospitalName': legacyHospital,
      'department': value['department'],
      'title': value['title'],
      'employmentType': value['employmentType'] ?? 'full_time',
      'primary': true,
      'acceptingNewPatients': value['acceptingNewPatients'],
      'availability': value['availability'],
      'channels': value['channels'],
    },
    fallbackPrimary: true,
  );
  return legacy == null
      ? const <DoctorAffiliation>[]
      : List<DoctorAffiliation>.unmodifiable(<DoctorAffiliation>[legacy]);
}

DoctorAffiliation _copyAffiliation(DoctorAffiliation affiliation,
        {required bool primary}) =>
    DoctorAffiliation(
      organizationId: affiliation.organizationId,
      hospitalCode: affiliation.hospitalCode,
      hospitalName: affiliation.hospitalName,
      hospitalGrade: affiliation.hospitalGrade,
      departmentCode: affiliation.departmentCode,
      department: affiliation.department,
      title: affiliation.title,
      employmentType: affiliation.employmentType,
      primary: primary,
      acceptingNewPatients: affiliation.acceptingNewPatients,
      availability: affiliation.availability,
      channels: affiliation.channels,
      since: affiliation.since,
    );

List<Object?> _rosterArray(Object? parsed) {
  if (parsed is List) return List<Object?>.from(parsed);
  if (parsed is! Map) return const <Object?>[];
  final Object? doctors = parsed['doctors'];
  if (doctors is List) return List<Object?>.from(doctors);
  final Object? data = parsed['data'];
  if (data is Map) {
    final Object? item = data['item'];
    if (item is Map) {
      final Object? itemDoctors = item['doctors'];
      if (itemDoctors is List) return List<Object?>.from(itemDoctors);
    }
    final Object? items = data['items'];
    if (items is List) return List<Object?>.from(items);
  }
  return const <Object?>[];
}

/// Parses a directory document defensively: a malformed clinician is dropped
/// instead of taking the doctor tab down. Accepts a bare array, a
/// `{doctors: []}` document, or a `data.item.doctors` / `data.items` envelope.
List<DoctorProfile> parseDoctorRoster(Object? value) {
  Object? parsed = value;
  if (value is String) {
    if (value.trim().isEmpty) return const <DoctorProfile>[];
    try {
      parsed = jsonDecode(value);
    } on FormatException {
      return const <DoctorProfile>[];
    }
  }
  final Set<String> seen = <String>{};
  final List<DoctorProfile> doctors = <DoctorProfile>[];
  for (final Object? entry in _rosterArray(parsed)) {
    final DoctorProfile? doctor = DoctorProfile.fromJson(entry);
    if (doctor == null || !seen.add(doctor.id)) continue;
    doctors.add(doctor);
  }
  return List<DoctorProfile>.unmodifiable(doctors);
}

/// The affiliation shown first and used for a consultation by default.
DoctorAffiliation? primaryAffiliation(DoctorProfile doctor) {
  for (final DoctorAffiliation affiliation in doctor.affiliations) {
    if (affiliation.primary) return affiliation;
  }
  return doctor.affiliations.isEmpty ? null : doctor.affiliations.first;
}

/// One affiliation by organization id, or null when the doctor does not
/// practise there.
DoctorAffiliation? affiliationByOrganization(
  DoctorProfile doctor,
  String organizationId,
) {
  for (final DoctorAffiliation affiliation in doctor.affiliations) {
    if (affiliation.organizationId == organizationId) return affiliation;
  }
  return null;
}

/// True when the clinician holds at least one part-time engagement.
bool hasPartTimeEngagement(DoctorProfile doctor) => doctor.affiliations
    .any((DoctorAffiliation entry) =>
        entry.employmentType == DoctorEmploymentType.partTime);

/// Unique engagement types, ordered by the employment vocabulary.
List<DoctorEmploymentType> doctorEmploymentTypes(DoctorProfile doctor) =>
    List<DoctorEmploymentType>.unmodifiable(
      DoctorEmploymentType.values.where((DoctorEmploymentType type) =>
          doctor.affiliations.any(
              (DoctorAffiliation entry) => entry.employmentType == type)),
    );

/// One consult channel that can actually be opened at this affiliation, or
/// null. Video is preferred, then messaging, phone, and clinic.
DoctorChannel? preferredDoctorChannel(DoctorAffiliation? affiliation) {
  if (affiliation == null) return null;
  for (final DoctorChannelKind kind in <DoctorChannelKind>[
    DoctorChannelKind.video,
    DoctorChannelKind.messaging,
    DoctorChannelKind.phone,
    DoctorChannelKind.clinic,
  ]) {
    for (final DoctorChannel channel in affiliation.channels) {
      if (channel.kind == kind && channel.target.trim().isNotEmpty) {
        return channel;
      }
    }
  }
  return null;
}

/// The authored fallback roster, semantically identical to
/// `contracts/doctor-roster.json` (schemaVersion 2). Every entry is
/// `verified: false` and references demo organization and hospital codes, so no
/// surface presents it as a directory-verified appointment.
const DoctorRoster kCatalogDoctorRoster = DoctorRoster(
  source: DoctorRosterSource.catalog,
  doctors: <DoctorProfile>[
    DoctorProfile(
      id: 'doctor-lin-qinghe',
      displayName: 'Lin Qinghe',
      specialties: <String>[
        'Hypertension',
        'Coronary heart disease',
        'Arrhythmia',
      ],
      languages: <String>['zh-CN', 'en-US'],
      yearsOfExperience: 22,
      bio:
          'Cardiology lead focused on long-term blood-pressure and coronary care for families.',
      verified: false,
      affiliations: <DoctorAffiliation>[
        DoctorAffiliation(
          organizationId: 'org-sdkwork-care-network',
          hospitalCode: 'SDKWORK-CARE-001',
          hospitalName: 'SDKWork Care Network',
          hospitalGrade: 'THIRD_A',
          departmentCode: '0304',
          department: 'Cardiology',
          title: 'Chief physician',
          employmentType: DoctorEmploymentType.fullTime,
          primary: true,
          acceptingNewPatients: true,
          availability: <DoctorAvailabilitySlot>[
            DoctorAvailabilitySlot(
              weekday: 1,
              startTime: '09:00',
              endTime: '12:00',
            ),
            DoctorAvailabilitySlot(
              weekday: 3,
              startTime: '14:00',
              endTime: '17:30',
            ),
            DoctorAvailabilitySlot(
              weekday: 5,
              startTime: '09:00',
              endTime: '12:00',
            ),
          ],
          channels: <DoctorChannel>[
            DoctorChannel(
              kind: DoctorChannelKind.video,
              target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe',
            ),
            DoctorChannel(
              kind: DoctorChannelKind.messaging,
              target:
                  'https://care.sdkwork.com/consult/doctor-lin-qinghe/messages',
            ),
          ],
          since: '2011-07',
        ),
        DoctorAffiliation(
          organizationId: 'org-sdkwork-community-clinic',
          hospitalCode: 'SDKWORK-CARE-002',
          hospitalName: 'SDKWork Community Clinic',
          hospitalGrade: 'COMMUNITY',
          departmentCode: '02',
          department: 'General practice',
          title: 'Visiting cardiologist',
          employmentType: DoctorEmploymentType.partTime,
          primary: false,
          acceptingNewPatients: true,
          availability: <DoctorAvailabilitySlot>[
            DoctorAvailabilitySlot(
              weekday: 6,
              startTime: '09:00',
              endTime: '11:30',
            ),
          ],
          channels: <DoctorChannel>[
            DoctorChannel(
              kind: DoctorChannelKind.video,
              target:
                  'https://care.sdkwork.com/consult/doctor-lin-qinghe/clinic',
            ),
          ],
          since: '2023-03',
        ),
      ],
    ),
    DoctorProfile(
      id: 'doctor-su-wanning',
      displayName: 'Su Wanning',
      specialties: <String>[
        'Child fever',
        'Childhood asthma',
        'Vaccination planning',
      ],
      languages: <String>['zh-CN'],
      yearsOfExperience: 15,
      bio:
          'Pediatrician for infants and school-age children, with a focus on fever triage and asthma.',
      verified: false,
      affiliations: <DoctorAffiliation>[
        DoctorAffiliation(
          organizationId: 'org-sdkwork-care-network',
          hospitalCode: 'SDKWORK-CARE-001',
          hospitalName: 'SDKWork Care Network',
          hospitalGrade: 'THIRD_A',
          departmentCode: '07',
          department: 'Pediatrics',
          title: 'Associate chief physician',
          employmentType: DoctorEmploymentType.fullTime,
          primary: true,
          acceptingNewPatients: true,
          availability: <DoctorAvailabilitySlot>[
            DoctorAvailabilitySlot(
              weekday: 2,
              startTime: '08:30',
              endTime: '12:00',
            ),
            DoctorAvailabilitySlot(
              weekday: 4,
              startTime: '13:30',
              endTime: '17:00',
            ),
            DoctorAvailabilitySlot(
              weekday: 6,
              startTime: '09:00',
              endTime: '11:30',
            ),
          ],
          channels: <DoctorChannel>[
            DoctorChannel(
              kind: DoctorChannelKind.video,
              target: 'https://care.sdkwork.com/consult/doctor-su-wanning',
            ),
            DoctorChannel(
              kind: DoctorChannelKind.phone,
              target: 'https://care.sdkwork.com/consult/doctor-su-wanning/phone',
            ),
          ],
          since: '2018-09',
        ),
      ],
    ),
    DoctorProfile(
      id: 'doctor-he-zhiyuan',
      displayName: 'He Zhiyuan',
      specialties: <String>[
        'Respiratory infection',
        'Gastroenteritis',
        'Chronic disease follow-up',
      ],
      languages: <String>['zh-CN', 'en-US'],
      yearsOfExperience: 9,
      bio:
          'Family physician handling common infections and chronic-disease follow-up for all ages.',
      verified: false,
      affiliations: <DoctorAffiliation>[
        DoctorAffiliation(
          organizationId: 'org-sdkwork-community-clinic',
          hospitalCode: 'SDKWORK-CARE-002',
          hospitalName: 'SDKWork Community Clinic',
          hospitalGrade: 'COMMUNITY',
          departmentCode: '02',
          department: 'General practice',
          title: 'Attending physician',
          employmentType: DoctorEmploymentType.partTime,
          primary: true,
          acceptingNewPatients: false,
          availability: <DoctorAvailabilitySlot>[
            DoctorAvailabilitySlot(
              weekday: 1,
              startTime: '13:30',
              endTime: '18:00',
            ),
            DoctorAvailabilitySlot(
              weekday: 3,
              startTime: '08:30',
              endTime: '12:00',
            ),
            DoctorAvailabilitySlot(
              weekday: 5,
              startTime: '13:30',
              endTime: '18:00',
            ),
          ],
          channels: <DoctorChannel>[
            DoctorChannel(
              kind: DoctorChannelKind.messaging,
              target:
                  'https://care.sdkwork.com/consult/doctor-he-zhiyuan/messages',
            ),
            DoctorChannel(
              kind: DoctorChannelKind.clinic,
              target: 'https://care.sdkwork.com/consult/doctor-he-zhiyuan/clinic',
            ),
          ],
          since: '2024-01',
        ),
      ],
    ),
  ],
);

/// Fetches one directory document body.
typedef DoctorDirectoryFetch = Future<String> Function(String url);

/// Loads the roster for this surface. It never throws: an unreachable or
/// malformed directory falls back to [kCatalogDoctorRoster] so the doctor tab
/// still lists human doctors instead of going blank, and [DoctorRoster.source]
/// tells the UI which one it is showing.
class DoctorDirectory {
  DoctorDirectory({required String directoryUrl, DoctorDirectoryFetch? fetch})
      : directoryUrl = directoryUrl.trim(),
        _fetch = fetch ?? _fetchJson;

  /// Deployment doctor-directory document URL; empty selects the fallback.
  final String directoryUrl;

  final DoctorDirectoryFetch _fetch;

  /// Whether the deployment bound a directory URL. The UI states this instead
  /// of implying a live directory when the authored roster is in use.
  bool get configured => directoryUrl.isNotEmpty;

  Future<DoctorRoster> load() async {
    if (!configured) return kCatalogDoctorRoster;
    try {
      final List<DoctorProfile> doctors = parseDoctorRoster(
        await _fetch(directoryUrl),
      );
      if (doctors.isEmpty) return kCatalogDoctorRoster;
      return DoctorRoster(
        source: DoctorRosterSource.directory,
        doctors: doctors,
      );
    } catch (_) {
      return kCatalogDoctorRoster;
    }
  }
}

Future<String> _fetchJson(String url) async {
  final Uri? uri = Uri.tryParse(url);
  if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http')) {
    throw FormatException('doctor directory URL is not an http(s) URL: $url');
  }
  final HttpClient client = HttpClient();
  try {
    final HttpClientRequest request = await client
        .getUrl(uri)
        .timeout(const Duration(seconds: 8));
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    final HttpClientResponse response =
        await request.close().timeout(const Duration(seconds: 8));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException(
        'doctor directory responded with HTTP ${response.statusCode}',
        uri: uri,
      );
    }
    return await response.transform(utf8.decoder).join();
  } finally {
    client.close(force: true);
  }
}

/// Loads a roster once and exposes the loading state to the doctor tab.
class DoctorRosterController extends ChangeNotifier {
  DoctorRosterController(this._directory);

  final DoctorDirectory _directory;

  DoctorRoster? _roster;
  bool _loading = true;

  /// The loaded roster, or null while the first load is running.
  DoctorRoster? get roster => _roster;

  bool get loading => _loading;

  /// Whether the deployment configured a doctor directory URL.
  bool get configured => _directory.configured;

  /// The source the answered roster came from, or null while loading.
  DoctorRosterSource? get source => _roster?.source;

  /// Reloads the roster; [DoctorDirectory.load] never throws.
  Future<void> load() async {
    _loading = true;
    notifyListeners();
    final DoctorRoster value = await _directory.load();
    _roster = value;
    _loading = false;
    notifyListeners();
  }
}
