/// Browsing rules for the doctor directory.
///
/// The category strip the navbar shows is derived from the departments the
/// published roster actually practises in, so a deployment document adds its own
/// category without a code change. The search haystack is built from the facts a
/// family searches by — name, department, rank, site, and specialty — and
/// deliberately excludes the free-text bio, so "pressure" does not make a
/// cardiologist match a search for "Su".
library;

import 'doctor_directory.dart';
import 'doctor_labels.dart';

/// Category keys in roster order, deduplicated.
List<String> doctorCategoryKeys(List<DoctorProfile> doctors) {
  final List<String> keys = <String>[];
  for (final DoctorProfile doctor in doctors) {
    for (final DoctorAffiliation affiliation in doctor.affiliations) {
      final String key = careDepartmentKey(affiliation);
      if (key.isNotEmpty && !keys.contains(key)) {
        keys.add(key);
      }
    }
  }
  return keys;
}

/// Localized label of one category key.
String doctorCategoryLabel(
  String locale,
  List<DoctorProfile> doctors,
  String key,
) {
  for (final DoctorProfile doctor in doctors) {
    for (final DoctorAffiliation affiliation in doctor.affiliations) {
      if (careDepartmentKey(affiliation) == key) {
        return careDepartmentLabel(locale, affiliation);
      }
    }
  }
  return key;
}

/// Text one search query is matched against.
String doctorSearchHaystack(String locale, DoctorProfile doctor) {
  return <String>[
    doctor.displayName,
    ...doctor.specialties,
    ...doctor.specialties
        .map((String specialty) => careSpecialtyLabel(locale, specialty)),
    for (final DoctorAffiliation affiliation
        in doctor.affiliations) ...<String>[
      affiliation.department,
      affiliation.title,
      affiliation.hospitalName,
      careDepartmentLabel(locale, affiliation),
      careTitleLabel(locale, affiliation),
      careHospitalLabel(locale, affiliation),
    ],
  ].join(' ').toLowerCase();
}

/// Doctors matching one category (`null` = all) and one query, in roster order.
List<DoctorProfile> browseDoctors({
  required String locale,
  required List<DoctorProfile> doctors,
  String? category,
  String query = '',
}) {
  final String needle = query.trim().toLowerCase();
  return <DoctorProfile>[
    for (final DoctorProfile doctor in doctors)
      if ((category == null ||
              doctor.affiliations.any((DoctorAffiliation affiliation) =>
                  careDepartmentKey(affiliation) == category)) &&
          (needle.isEmpty ||
              doctorSearchHaystack(locale, doctor).contains(needle)))
        doctor,
  ];
}
