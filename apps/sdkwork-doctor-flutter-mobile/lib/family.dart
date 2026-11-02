import 'patients/patient_store.dart';

/// Family member facts the hosted agent receives as turn context.
///
/// Mirrors `FamilyMember` in @sdkwork/doctor-common-doctor without a codegen
/// dependency: the Flutter app is standalone and derives this context from the
/// active patient file ([PatientProfile]).
class FamilyMember {
  const FamilyMember({
    required this.id,
    required this.displayName,
    required this.relation,
    required this.birthYear,
    this.allergies = const <String>[],
    this.chronicConditions = const <String>[],
    this.medications = const <String>[],
  });

  /// The conversation context of one patient file.
  factory FamilyMember.fromPatient(PatientProfile profile) => FamilyMember(
        id: profile.id,
        displayName: profile.displayName,
        relation: profile.relation.name,
        birthYear: profile.birthYear,
        allergies: profile.allergies,
        chronicConditions: profile.chronicConditions,
        medications: profile.medications,
      );

  final String id;
  final String displayName;
  final String relation;
  final int birthYear;
  final List<String> allergies;
  final List<String> chronicConditions;
  final List<String> medications;

  /// `Name (relation)` for subtitles and the visit-record contract.
  String get label => '$displayName ($relation)';
}

/// The seeded self profile as agent context, retained for callers that have not
/// loaded the household store yet.
final FamilyMember demoSelfMember =
    FamilyMember.fromPatient(kDemoSelfPatient);
