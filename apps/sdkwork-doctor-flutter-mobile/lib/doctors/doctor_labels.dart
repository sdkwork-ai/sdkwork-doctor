/// Label lookups for the authored doctor roster.
///
/// Person names stay as published; every *attribute* (department, rank,
/// hospital, specialty) is looked up in the shared care catalog by a stable
/// slug, and an unknown value falls back to the published string so a
/// deployment-provided roster never shows a raw key.
library;

import '../i18n/care_i18n.dart';
import 'doctor_directory.dart';

String _slug(String value) => value
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
    .replaceAll(RegExp(r'^_+|_+$'), '');

String _localized(String locale, String prefix, String raw) {
  final String value = raw.trim();
  if (value.isEmpty) {
    return raw;
  }
  final String key = '$prefix.${_slug(value)}';
  final String translated = careText(locale, key);
  return translated == key ? raw : translated;
}

/// Localized department of one practice site.
String careDepartmentLabel(String locale, DoctorAffiliation affiliation) =>
    _localized(locale, 'platform.care.doctors.department', affiliation.department);

/// Stable category key of one practice site (the department slug).
///
/// The directory groups doctors by the department they practise in, so the key
/// has to come from the published department (or its Appbase code) rather than
/// from the localized label.
String careDepartmentKey(DoctorAffiliation affiliation) => _slug(
      affiliation.department.isNotEmpty
          ? affiliation.department
          : affiliation.departmentCode,
    );

/// Localized rank/title at one practice site.
String careTitleLabel(String locale, DoctorAffiliation affiliation) =>
    _localized(locale, 'platform.care.doctors.title', affiliation.title);

/// Localized hospital name of one practice site.
String careHospitalLabel(String locale, DoctorAffiliation affiliation) =>
    _localized(locale, 'platform.care.doctors.hospital', affiliation.hospitalName);

/// Localized specialty token of the roster.
String careSpecialtyLabel(String locale, String specialty) =>
    _localized(locale, 'platform.care.doctors.specialty', specialty);

/// `Chief physician · Cardiology · SDKWork Care Network` in the active locale.
String careAffiliationSummary(String locale, DoctorAffiliation affiliation) =>
    '${careTitleLabel(locale, affiliation)} · '
    '${careDepartmentLabel(locale, affiliation)} · '
    '${careHospitalLabel(locale, affiliation)}';

/// Comma-joined localized specialties, or the "none recorded" copy.
String careSpecialtiesLabel(String locale, List<String> specialties) {
  if (specialties.isEmpty) {
    return careText(locale, 'platform.care.value.none');
  }
  return specialties
      .map((String specialty) => careSpecialtyLabel(locale, specialty))
      .join(', ');
}
