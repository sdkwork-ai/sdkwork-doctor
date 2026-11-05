import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_directory.dart';

/// Pins the Dart fallback roster to `contracts/doctor-roster.json` and covers
/// defensive parsing, the affiliation model, and the directory/fallback source
/// rules. No network is touched: every directory load either uses no URL or an
/// injected fetch.
void main() {
  final File rosterFile = File(
    '../sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/doctor-roster.json',
  );

  Map<String, dynamic> contract() =>
      jsonDecode(rosterFile.readAsStringSync()) as Map<String, dynamic>;

  test('the Dart fallback roster equals the authored contract', () {
    final Map<String, dynamic> source = contract();
    expect(source['schemaVersion'], 2);
    expect(source['kind'], kDoctorRosterDocumentKind);
    expect(kCatalogDoctorRoster.source.name, source['source']);
    expect(
      kCatalogDoctorRoster.doctors
          .map((DoctorProfile doctor) => doctor.toJson())
          .toList(growable: false),
      source['doctors'],
    );
    for (final DoctorProfile doctor in kCatalogDoctorRoster.doctors) {
      expect(doctor.verified, isFalse, reason: doctor.id);
      expect(doctor.affiliations, isNotEmpty, reason: doctor.id);
    }
    expect(
      kCatalogDoctorRoster.doctors
          .any((DoctorProfile doctor) => doctor.affiliations.length > 1),
      isTrue,
      reason: 'the authored roster carries a multi-site doctor',
    );
    expect(
      kCatalogDoctorRoster.doctors
          .any((DoctorProfile doctor) => hasPartTimeEngagement(doctor)),
      isTrue,
      reason: 'the authored roster carries a part-time engagement',
    );
  });

  test('the roster parser accepts a document, a bare array, and an envelope',
      () {
    final Map<String, dynamic> source = contract();
    final List<dynamic> doctors = source['doctors'] as List<dynamic>;
    expect(parseDoctorRoster(rosterFile.readAsStringSync()),
        hasLength(doctors.length));
    expect(parseDoctorRoster(doctors), hasLength(doctors.length));
    expect(
      parseDoctorRoster(<String, Object?>{
        'data': <String, Object?>{
          'item': <String, Object?>{'doctors': doctors},
        },
      }),
      hasLength(doctors.length),
    );
    expect(
      parseDoctorRoster(<String, Object?>{
        'data': <String, Object?>{'items': doctors},
      }),
      hasLength(doctors.length),
    );
  });

  test('the roster parser drops malformed clinicians instead of throwing', () {
    expect(parseDoctorRoster('{not json'), isEmpty);
    expect(parseDoctorRoster(''), isEmpty);
    expect(parseDoctorRoster(null), isEmpty);
    final List<dynamic> doctors = contract()['doctors'] as List<dynamic>;
    final List<DoctorProfile> mixed = parseDoctorRoster(<String, Object?>{
      'doctors': <Object?>[
        doctors[0],
        <String, Object?>{'id': 'no-name'},
        <String, Object?>{'displayName': 'No id'},
        <String, Object?>{'id': 'no-site', 'displayName': 'No site'},
        doctors[0],
        <String, Object?>{
          ...doctors[1] as Map<String, dynamic>,
          'affiliations': <Object?>[
            <String, Object?>{
              'organizationId': 'org.unknown-channel',
              'hospitalName': 'Unknown Channel Hospital',
              'channels': <Object?>[
                <String, Object?>{'kind': 'telepathy', 'target': 'x'},
              ],
            },
          ],
        },
      ],
    });
    expect(mixed, hasLength(2),
        reason:
            'duplicate ids, missing identities, and doctors without a site are dropped');
    expect(mixed[1].affiliations.single.channels, isEmpty,
        reason: 'an unknown channel kind is dropped, not the doctor');
  });

  test('a pre-affiliation flat document migrates into one primary affiliation',
      () {
    final List<DoctorProfile> migrated = parseDoctorRoster(<String, Object?>{
      'doctors': <Object?>[
        <String, Object?>{
          'id': 'legacy-doctor',
          'displayName': 'Legacy Doctor',
          'title': 'Chief physician',
          'department': 'Cardiology',
          'hospital': 'Legacy Hospital',
          'specialties': <String>['Hypertension'],
          'languages': <String>['zh-CN'],
          'yearsOfExperience': 20,
          'bio': 'Migrated from the flat shape.',
          'channels': <Object?>[
            <String, Object?>{
              'kind': 'video',
              'target': 'https://care.sdkwork.com/consult/legacy',
            },
          ],
          'availability': <Object?>[
            <String, Object?>{
              'weekday': 1,
              'startTime': '09:00',
              'endTime': '12:00'
            },
          ],
          'acceptingNewPatients': false,
          'verified': true,
        },
      ],
    });
    expect(migrated, hasLength(1));
    final DoctorAffiliation site = migrated.single.affiliations.single;
    expect(site.organizationId, 'org.legacy-directory');
    expect(site.hospitalName, 'Legacy Hospital');
    expect(site.title, 'Chief physician');
    expect(site.primary, isTrue);
    expect(site.acceptingNewPatients, isFalse);
    expect(preferredDoctorChannel(site)?.kind, DoctorChannelKind.video);
    expect(migrated.single.verified, isTrue);
  });

  test('a doctor round-trips through JSON with every affiliation', () {
    for (final DoctorProfile doctor in kCatalogDoctorRoster.doctors) {
      final DoctorProfile? parsed =
          DoctorProfile.fromJson(jsonDecode(jsonEncode(doctor.toJson())));
      expect(parsed, isNotNull);
      expect(parsed!.toJson(), doctor.toJson());
    }
  });

  test('primary affiliation, lookup, and employment helpers', () {
    final DoctorProfile multiSite = kCatalogDoctorRoster.doctors.first;
    expect(multiSite.affiliations.length, 2);
    expect(primaryAffiliation(multiSite)?.organizationId,
        'org-sdkwork-care-network');
    expect(
      affiliationByOrganization(multiSite, 'org-sdkwork-community-clinic')
          ?.hospitalName,
      'SDKWork Community Clinic',
    );
    expect(affiliationByOrganization(multiSite, 'org.missing'), isNull);
    expect(hasPartTimeEngagement(multiSite), isTrue);
    expect(
      doctorEmploymentTypes(multiSite),
      <DoctorEmploymentType>[
        DoctorEmploymentType.fullTime,
        DoctorEmploymentType.partTime,
      ],
    );

    final DoctorProfile partTimeOnly = kCatalogDoctorRoster.doctors.last;
    expect(primaryAffiliation(partTimeOnly)?.employmentType,
        DoctorEmploymentType.partTime);
    expect(primaryAffiliation(partTimeOnly)?.acceptingNewPatients, isFalse);
    expect(
      doctorEmploymentTypes(partTimeOnly),
      <DoctorEmploymentType>[DoctorEmploymentType.partTime],
    );
  });

  test('the preferred channel skips empty targets and ranks video first', () {
    final DoctorAffiliation? site =
        primaryAffiliation(kCatalogDoctorRoster.doctors.first);
    expect(preferredDoctorChannel(site)?.kind, DoctorChannelKind.video);
    expect(preferredDoctorChannel(null), isNull);

    final DoctorAffiliation phoneOnly =
        _affiliation(doctor: site!, channels: <DoctorChannel>[
      const DoctorChannel(
          kind: DoctorChannelKind.phone, target: 'tel:+10000000000'),
    ]);
    expect(preferredDoctorChannel(phoneOnly)?.kind, DoctorChannelKind.phone);

    final DoctorAffiliation emptyTargets =
        _affiliation(doctor: site, channels: <DoctorChannel>[
      const DoctorChannel(kind: DoctorChannelKind.video, target: '  '),
      const DoctorChannel(
          kind: DoctorChannelKind.clinic,
          target: 'https://care.sdkwork.com/visit'),
    ]);
    expect(
        preferredDoctorChannel(emptyTargets)?.kind, DoctorChannelKind.clinic);
    expect(
      preferredDoctorChannel(
          _affiliation(doctor: site, channels: const <DoctorChannel>[])),
      isNull,
    );
  });

  test(
      'an unconfigured directory answers with the fallback roster and never fetches',
      () async {
    final DoctorDirectory directory = DoctorDirectory(
      directoryUrl: '   ',
      fetch: (String url) async => throw StateError('must not fetch $url'),
    );
    expect(directory.configured, isFalse);
    final DoctorRoster roster = await directory.load();
    expect(roster.source, DoctorRosterSource.catalog);
    expect(roster.doctors, kCatalogDoctorRoster.doctors);
  });

  test('an unreachable or malformed directory falls back to the roster',
      () async {
    final DoctorDirectory unreachable = DoctorDirectory(
      directoryUrl: 'https://care.sdkwork.com/doctor-roster.json',
      fetch: (String url) async => throw const SocketException('offline'),
    );
    expect((await unreachable.load()).source, DoctorRosterSource.catalog);

    final DoctorDirectory malformed = DoctorDirectory(
      directoryUrl: 'https://care.sdkwork.com/doctor-roster.json',
      fetch: (String url) async => '{not json',
    );
    expect((await malformed.load()).source, DoctorRosterSource.catalog);

    final DoctorDirectory empty = DoctorDirectory(
      directoryUrl: 'https://care.sdkwork.com/doctor-roster.json',
      fetch: (String url) async =>
          jsonEncode(<String, Object?>{'doctors': <Object?>[]}),
    );
    expect((await empty.load()).source, DoctorRosterSource.catalog);
  });

  test('a reachable directory answers with the directory source', () async {
    final String body = jsonEncode(<String, Object?>{
      'doctors': <Object?>[
        <String, Object?>{
          'id': 'doctor-directory-1',
          'displayName': 'Directory Doctor',
          'specialties': <String>['Hypertension'],
          'languages': <String>['zh-CN'],
          'yearsOfExperience': 12,
          'bio': 'Directory clinician.',
          'verified': true,
          'affiliations': <Object?>[
            <String, Object?>{
              'organizationId': 'org-directory',
              'hospitalCode': 'DIR-001',
              'hospitalName': 'Directory Hospital',
              'hospitalGrade': 'THIRD_A',
              'departmentCode': '0304',
              'department': 'Cardiology',
              'title': 'Chief physician',
              'employmentType': 'full_time',
              'primary': true,
              'acceptingNewPatients': true,
              'since': '2014-05',
              'availability': <Object?>[
                <String, Object?>{
                  'weekday': 1,
                  'startTime': '09:00',
                  'endTime': '12:00',
                },
              ],
              'channels': <Object?>[
                <String, Object?>{
                  'kind': 'video',
                  'target': 'https://care.sdkwork.com/consult/directory',
                },
              ],
            },
          ],
        },
      ],
    });
    final DoctorDirectory directory = DoctorDirectory(
      directoryUrl: 'https://care.sdkwork.com/doctor-roster.json',
      fetch: (String url) async => body,
    );
    expect(directory.configured, isTrue);
    final DoctorRoster roster = await directory.load();
    expect(roster.source, DoctorRosterSource.directory);
    final DoctorProfile doctor = roster.doctors.single;
    expect(doctor.id, 'doctor-directory-1');
    expect(doctor.verified, isTrue);
    expect(doctor.affiliations.single.organizationId, 'org-directory');
    expect(doctor.affiliations.single.employmentType,
        DoctorEmploymentType.fullTime);
    expect(doctor.affiliations.single.since, '2014-05');
  });

  test('the roster controller reports the source that answered', () async {
    final DoctorRosterController controller =
        DoctorRosterController(DoctorDirectory(directoryUrl: ''));
    expect(controller.loading, isTrue);
    await controller.load();
    expect(controller.loading, isFalse);
    expect(controller.source, DoctorRosterSource.catalog);
    expect(controller.roster?.doctors, kCatalogDoctorRoster.doctors);
    controller.dispose();
  });
}

DoctorAffiliation _affiliation({
  required DoctorAffiliation doctor,
  required List<DoctorChannel> channels,
}) =>
    DoctorAffiliation(
      organizationId: doctor.organizationId,
      hospitalCode: doctor.hospitalCode,
      hospitalName: doctor.hospitalName,
      hospitalGrade: doctor.hospitalGrade,
      departmentCode: doctor.departmentCode,
      department: doctor.department,
      title: doctor.title,
      employmentType: doctor.employmentType,
      primary: doctor.primary,
      acceptingNewPatients: doctor.acceptingNewPatients,
      availability: doctor.availability,
      channels: channels,
      since: doctor.since,
    );
