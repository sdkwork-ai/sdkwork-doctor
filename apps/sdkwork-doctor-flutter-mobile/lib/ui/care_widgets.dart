import 'package:flutter/material.dart';

import '../doctors/doctor_directory.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';

/// Small pieces the care screens share: the page heading, the triage pill, and
/// the label lookups that keep localized copy out of the widgets.
class CarePageHeader extends StatelessWidget {
  const CarePageHeader({
    super.key,
    required this.title,
    required this.subtitle,
    this.extra,
  });

  final String title;
  final String subtitle;
  final String? extra;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          if (extra != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(extra!, style: Theme.of(context).textTheme.bodySmall),
            ),
        ],
      ),
    );
  }
}

/// Flat level pill: emergency and urgent keep the warm semantic tone, every
/// other level uses the tech-blue tone. No border, no elevation.
class CareLevelChip extends StatelessWidget {
  const CareLevelChip({super.key, required this.label, required this.warn});

  final String label;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: warn ? const Color(0xFFFFF4E0) : kTechBlueSoft,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: warn ? const Color(0xFFB26A00) : kTechBlueStrong,
        ),
      ),
    );
  }
}

/// Round doctor portrait: the roster's bundled portrait, a directory URL, or the
/// doctor's initial when neither is available. Flat and borderless like every
/// other surface element.
class CareDoctorAvatar extends StatelessWidget {
  const CareDoctorAvatar({
    super.key,
    required this.name,
    required this.avatarUrl,
    this.size = 48,
  });

  final String name;

  /// Portrait reference from the roster: a bundle-relative asset path such as
  /// `avatars/doctor-lin-qinghe.png`, or an absolute http(s) URL.
  final String avatarUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final String reference = avatarUrl.trim();
    final Widget fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration:
          const BoxDecoration(color: kSurfaceAlt, shape: BoxShape.circle),
      child: Text(
        doctorInitial(name),
        style: TextStyle(
          fontSize: size * 0.4,
          fontWeight: FontWeight.w700,
          color: kTechBlueStrong,
        ),
      ),
    );
    if (reference.isEmpty) return fallback;
    final ImageProvider<Object> provider = isRemoteDoctorAvatar(reference)
        ? NetworkImage(reference)
        : AssetImage(doctorAvatarAssetPath(reference));
    return ClipOval(
      child: Image(
        image: provider,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (BuildContext context, Object error, StackTrace? stack) =>
            fallback,
      ),
    );
  }
}

/// Small flat badge for non-triage states such as verified or accepting.
class CareBadge extends StatelessWidget {
  const CareBadge({
    super.key,
    required this.label,
    this.warn = false,
    this.neutral = false,
  });

  final String label;
  final bool warn;
  final bool neutral;

  @override
  Widget build(BuildContext context) {
    final Color background = warn
        ? const Color(0xFFFFF4E0)
        : (neutral ? kSurfaceAlt : kTechBlueSoft);
    final Color foreground =
        warn ? const Color(0xFFB26A00) : (neutral ? kMuted : kTechBlueStrong);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}

/// Catalog key of one triage level.
String careLevelKey(TriageLevel level) {
  switch (level) {
    case TriageLevel.emergency:
      return 'platform.care.level.emergency';
    case TriageLevel.urgent:
      return 'platform.care.level.urgent';
    case TriageLevel.routine:
      return 'platform.care.level.routine';
    case TriageLevel.selfCare:
      return 'platform.care.level.self-care';
  }
}

/// Catalog key of the transport that produced a visit record.
String careModeKey(String mode) {
  switch (mode) {
    case 'hosted':
      return 'platform.care.mode.hosted';
    case 'human':
      return 'platform.care.mode.human';
    default:
      return 'platform.care.mode.offline';
  }
}

/// `YYYY-MM-DD HH:mm` in the device zone, or the raw value when unparsable.
String careFormatTime(String iso) {
  final DateTime? value = DateTime.tryParse(iso);
  if (value == null) return iso;
  final DateTime local = value.toLocal();
  String two(int part) => part.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}';
}

/// Localized patient label: the relationship plus the name.
String carePatientLabel(String locale, PatientProfile profile) =>
    '${careText(locale, 'platform.care.profile.relation.${profile.relation.name}')}'
    ' · ${profile.displayName}';

/// Localized blood type, or the "none recorded" copy.
String careBloodTypeLabel(String locale, PatientProfile profile) =>
    profile.bloodType.isEmpty
        ? careText(locale, 'platform.care.value.none')
        : profile.bloodType;

/// Comma-joined list, or the "none recorded" copy when empty.
String careListLabel(String locale, List<String> values) => values.isEmpty
    ? careText(locale, 'platform.care.value.none')
    : values.join(', ');

/// Catalog key of one consultation channel kind.
String careChannelLabelKey(DoctorChannelKind kind) =>
    'platform.care.doctors.channel.${kind.name}';

/// Catalog key of one employment type.
String careEmploymentKey(DoctorEmploymentType type) =>
    'platform.care.doctors.employment.${type.wireName}';

/// Localized engagement label, or the "unknown" copy for a stored wire value
/// that this build does not recognise.
String careEmploymentLabel(String locale, String? wireName) {
  final DoctorEmploymentType? type = doctorEmploymentTypeFrom(wireName);
  if (type == null) return careText(locale, 'platform.care.value.unknown');
  return careText(locale, careEmploymentKey(type));
}

/// `Mon 09:00-12:00 · Wed 14:00-17:30` for one practice site, in its local time.
String careAvailabilityLabel(String locale, DoctorAffiliation? affiliation) {
  if (affiliation == null || affiliation.availability.isEmpty) {
    return careText(locale, 'platform.care.value.none');
  }
  return affiliation.availability
      .map((DoctorAvailabilitySlot slot) =>
          '${careText(locale, 'platform.care.doctors.weekday.${slot.weekday}')} '
          '${slot.startTime}-${slot.endTime}')
      .join(' · ');
}
