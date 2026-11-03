import 'dart:io';

import 'package:flutter/material.dart';

import '../doctors/doctor_directory.dart';
import '../doctors/doctor_labels.dart';
import '../doctors/doctor_selection.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';
import 'patient_form_screen.dart';

/// 我的: the household control surface.
///
/// Patient files live here (create, switch, edit, delete), together with the
/// selected family doctor, the 看病记录 entry, the conversation mode, the device
/// environment, and the privacy line.
class MeTab extends StatelessWidget {
  const MeTab({
    super.key,
    required this.locale,
    required this.agentMode,
    required this.records,
    required this.patients,
    required this.selection,
    required this.roster,
    required this.onOpenDoctors,
    required this.onOpenRecords,
    required this.onToggleLocale,
  });

  final String locale;
  final String agentMode;
  final VisitRecordStore records;
  final PatientProfileStore patients;
  final DoctorSelectionStore selection;
  final DoctorRosterController roster;
  final VoidCallback onOpenDoctors;
  final VoidCallback onOpenRecords;

  /// Switches the care catalog between 中文 and English. The session drawer is a
  /// pure conversation list, so this control lives here.
  final VoidCallback onToggleLocale;

  Future<void> _openEditor(BuildContext context,
      {PatientProfile? profile}) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (BuildContext _) => PatientEditorScreen(
        locale: locale,
        patients: patients,
        profile: profile,
      ),
    ));
  }

  Future<void> _confirmDelete(
      BuildContext context, PatientProfile profile) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(careText(locale, 'platform.care.profile.delete')),
        content: Text(careText(locale, 'platform.care.profile.deleteConfirm')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(careText(locale, 'platform.care.profile.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(careText(locale, 'platform.care.profile.delete')),
          ),
        ],
      ),
    );
    if (confirmed == true) await patients.remove(profile.id);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation:
          Listenable.merge(<Listenable>[patients, selection, roster, records]),
      builder: (BuildContext context, Widget? _) {
        final List<PatientProfile> profiles = patients.profiles;
        final DoctorRoster? answered = roster.roster;
        final DoctorProfile? primary = answered == null
            ? null
            : resolvePrimaryDoctor(answered, selection.state);
        final DoctorAffiliation? primarySite =
            primary == null ? null : primaryAffiliation(primary);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            CarePageHeader(
              title: careText(locale, 'platform.care.me.title'),
              subtitle: careText(locale, 'platform.care.me.subtitle'),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            careText(locale, 'platform.care.me.patients'),
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                    fontWeight: FontWeight.w600, color: kInk),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: profiles.length >= kPatientProfileLimit
                              ? null
                              : () => _openEditor(context),
                          icon: const Icon(Icons.person_add_alt_1_outlined),
                          label: Text(
                              careText(locale, 'platform.care.profile.add')),
                        ),
                      ],
                    ),
                    Text(
                      careText(locale, 'platform.care.profile.subtitle'),
                      style: const TextStyle(fontSize: 12, color: kMuted),
                    ),
                    if (profiles.length >= kPatientProfileLimit)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          careText(
                            locale,
                            'platform.care.profile.limit',
                            params: <String, String>{
                              'count': '$kPatientProfileLimit',
                            },
                          ),
                          style: const TextStyle(fontSize: 12, color: kMuted),
                        ),
                      ),
                    const SizedBox(height: 8),
                    if (profiles.isEmpty)
                      Text(
                        careText(locale, 'platform.care.profile.empty'),
                        style: const TextStyle(color: kMuted),
                      )
                    else
                      for (final PatientProfile profile in profiles)
                        _PatientRow(
                          locale: locale,
                          profile: profile,
                          active: profile.id == patients.activeId,
                          onSelect: () => patients.select(profile.id),
                          onEdit: () => _openEditor(context, profile: profile),
                          onDelete: () => _confirmDelete(context, profile),
                        ),
                  ],
                ),
              ),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      careText(locale, 'platform.care.me.doctors'),
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w600, color: kInk),
                    ),
                    const SizedBox(height: 6),
                    if (primary == null)
                      Text(
                        careText(locale, 'platform.care.me.noDoctor'),
                        style: const TextStyle(color: kMuted),
                      )
                    else ...<Widget>[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          CareDoctorAvatar(
                            name: primary.displayName,
                            avatarUrl: primary.avatarUrl,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(
                                  primary.displayName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600, color: kInk),
                                ),
                                if (primarySite != null) ...<Widget>[
                                  const SizedBox(height: 2),
                                  Text(
                                    careAffiliationSummary(locale, primarySite),
                                    style: const TextStyle(
                                        fontSize: 12, color: kMuted),
                                  ),
                                  const SizedBox(height: 4),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 4,
                                    children: <Widget>[
                                      CareBadge(
                                        label: careText(
                                          locale,
                                          careEmploymentKey(
                                              primarySite.employmentType),
                                        ),
                                        neutral: true,
                                      ),
                                      if (!primarySite.acceptingNewPatients)
                                        CareBadge(
                                          label: careText(
                                            locale,
                                            'platform.care.doctors.notAccepting',
                                          ),
                                          warn: true,
                                        ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${careText(locale, 'platform.care.doctors.primary')} · '
                        '${careText(locale, 'platform.care.doctors.count', params: <String, String>{
                              'count': '${selection.selectedIds.length}'
                            })}',
                        style: const TextStyle(fontSize: 12, color: kMuted),
                      ),
                    ],
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: onOpenDoctors,
                      icon: const Icon(Icons.medical_information_outlined),
                      label: Text(
                          careText(locale, 'platform.care.doctors.choose')),
                    ),
                  ],
                ),
              ),
            ),
            Card(
              child: ListTile(
                title: Text(careText(locale, 'platform.care.me.records')),
                subtitle: Text(careText(
                  locale,
                  'platform.care.me.recordsCount',
                  params: <String, String>{
                    'count': '${records.records.length}',
                  },
                )),
                trailing: Text(
                  careText(locale, 'platform.care.home.open'),
                  style: const TextStyle(color: kTechBlueStrong),
                ),
                onTap: onOpenRecords,
              ),
            ),
            Card(
              child: ListTile(
                title: Text(careText(locale, 'platform.care.me.mode')),
                subtitle: Text(careText(locale, careModeKey(agentMode))),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.translate, color: kMuted),
                title: Text(careText(locale, 'platform.care.language.label')),
                trailing: Text(
                  locale == 'zh-CN' ? '中文' : 'English',
                  style: const TextStyle(color: kMuted, fontSize: 12),
                ),
                onTap: onToggleLocale,
              ),
            ),
            Card(
              child: ListTile(
                title: Text(careText(locale, 'platform.care.me.device')),
                subtitle: Text(
                  '${careText(locale, 'platform.care.me.deviceHint')}\n'
                  '${Platform.operatingSystem} · $locale',
                ),
                isThreeLine: true,
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.shield_outlined, color: kMuted),
                title: Text(
                  careText(locale, 'platform.care.privacy.local'),
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _PatientRow extends StatelessWidget {
  const _PatientRow({
    required this.locale,
    required this.profile,
    required this.active,
    required this.onSelect,
    required this.onEdit,
    required this.onDelete,
  });

  final String locale;
  final PatientProfile profile;
  final bool active;
  final VoidCallback onSelect;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kCanvas,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  profile.displayName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: kInk,
                  ),
                ),
              ),
              if (active)
                CareBadge(label: careText(locale, 'platform.care.active')),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            '${careText(locale, 'platform.care.profile.relation.${profile.relation.name}')}'
            ' · ${profile.birthYear}'
            ' · ${careText(locale, 'platform.care.profile.sex.${profile.sex.name}')}'
            ' · ${careText(locale, 'platform.care.profile.field.bloodType')}: '
            '${careBloodTypeLabel(locale, profile)}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          const SizedBox(height: 4),
          Text(
            careText(
              locale,
              'platform.care.profile.completeness',
              params: <String, String>{
                'percent': '${patientProfileCompleteness(profile)}',
              },
            ),
            style: const TextStyle(fontSize: 12, color: kTechBlueStrong),
          ),
          const SizedBox(height: 2),
          Text(
            '${careText(locale, 'platform.care.profile.field.allergies')}: '
            '${careListLabel(locale, profile.allergies)}'
            ' · ${careText(locale, 'platform.care.profile.field.conditions')}: '
            '${careListLabel(locale, profile.chronicConditions)}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              if (!active)
                TextButton(
                  onPressed: onSelect,
                  child: Text(careText(locale, 'platform.care.profile.select')),
                ),
              TextButton(
                onPressed: onEdit,
                child: Text(careText(locale, 'platform.care.profile.edit')),
              ),
              TextButton(
                onPressed: onDelete,
                child: Text(careText(locale, 'platform.care.profile.delete')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
