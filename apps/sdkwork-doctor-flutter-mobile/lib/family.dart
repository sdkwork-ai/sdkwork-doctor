/// Family member facts the hosted agent receives as turn context.
///
/// Mirrors `FamilyMember` in @sdkwork/doctor-common-doctor without a codegen
/// dependency: the Flutter app is standalone and ships a demo household.
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

  final String id;
  final String displayName;
  final String relation;
  final int birthYear;
  final List<String> allergies;
  final List<String> chronicConditions;
  final List<String> medications;

  /// `Name (relation)` for subtitles.
  String get label => '$displayName ($relation)';
}

const FamilyMember demoSelfMember = FamilyMember(
  id: 'member-self',
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
);
