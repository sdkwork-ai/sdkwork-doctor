import 'package:flutter/material.dart';

import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';
import 'patient_form_screen.dart';

/// 病人档案: the household file manager, reached from 我的. Create, edit,
/// switch, and delete a file here; deleting never deletes the visit records
/// recorded for that member.
class PatientFilesScreen extends StatefulWidget {
  const PatientFilesScreen({
    super.key,
    required this.locale,
    required this.patients,
  });

  final String locale;
  final PatientProfileStore patients;

  @override
  State<PatientFilesScreen> createState() => _PatientFilesScreenState();
}

class _PatientFilesScreenState extends State<PatientFilesScreen> {
  Future<void> _openEditor({PatientProfile? profile}) async {
    await Navigator.of(context).push<void>(MaterialPageRoute<void>(
      builder: (BuildContext _) => PatientEditorScreen(
        locale: widget.locale,
        patients: widget.patients,
        profile: profile,
      ),
    ));
  }

  Future<void> _confirmDelete(PatientProfile profile) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(careText(widget.locale, 'platform.care.profile.delete')),
        content: Text(
            careText(widget.locale, 'platform.care.profile.deleteConfirm')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child:
                Text(careText(widget.locale, 'platform.care.profile.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child:
                Text(careText(widget.locale, 'platform.care.profile.delete')),
          ),
        ],
      ),
    );
    if (confirmed == true) await widget.patients.remove(profile.id);
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return Scaffold(
      appBar: AppBar(
        title: Text(careText(locale, 'platform.care.profile.title')),
      ),
      body: ListenableBuilder(
        listenable: widget.patients,
        builder: (BuildContext context, Widget? _) {
          final List<PatientProfile> profiles = widget.patients.profiles;
          final String? activeId = widget.patients.activeId;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: <Widget>[
              Text(
                careText(locale, 'platform.care.profile.subtitle'),
                style:
                    const TextStyle(fontSize: 12, color: kMuted, height: 1.5),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: profiles.length >= kPatientProfileLimit
                      ? null
                      : () => _openEditor(),
                  icon: const Icon(Icons.person_add_alt_1_outlined),
                  label: Text(careText(locale, 'platform.care.profile.add')),
                ),
              ),
              if (profiles.length >= kPatientProfileLimit)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    careText(locale, 'platform.care.profile.limit',
                        params: <String, String>{
                          'count': '$kPatientProfileLimit',
                        }),
                    style: const TextStyle(fontSize: 12, color: kMuted),
                  ),
                ),
              const SizedBox(height: 6),
              if (profiles.isEmpty)
                Text(
                  careText(locale, 'platform.care.profile.empty'),
                  style: const TextStyle(color: kMuted),
                )
              else
                for (final PatientProfile profile in profiles)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              CareMemberAvatar(name: profile.displayName),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    Text(
                                      profile.displayName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 15,
                                        color: kInk,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${careText(locale, 'platform.care.profile.relation.${profile.relation.name}')}'
                                      ' · ${profile.birthYear}'
                                      ' · ${careText(locale, 'platform.care.profile.sex.${profile.sex.name}')}',
                                      style: const TextStyle(
                                          fontSize: 12, color: kMuted),
                                    ),
                                  ],
                                ),
                              ),
                              if (profile.id == activeId)
                                CareBadge(
                                  label:
                                      careText(locale, 'platform.care.active'),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            careText(
                                locale, 'platform.care.profile.completeness',
                                params: <String, String>{
                                  'percent':
                                      '${patientProfileCompleteness(profile)}',
                                }),
                            style: const TextStyle(
                                fontSize: 12, color: kTechBlueStrong),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${careText(locale, 'platform.care.profile.field.allergies')}: '
                            '${careListLabel(locale, profile.allergies)}'
                            ' · ${careText(locale, 'platform.care.profile.field.conditions')}: '
                            '${careListLabel(locale, profile.chronicConditions)}',
                            style: const TextStyle(fontSize: 12, color: kMuted),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: <Widget>[
                              if (profile.id != activeId)
                                TextButton(
                                  onPressed: () =>
                                      widget.patients.select(profile.id),
                                  child: Text(careText(
                                      locale, 'platform.care.profile.select')),
                                ),
                              TextButton(
                                onPressed: () => _openEditor(profile: profile),
                                child: Text(careText(
                                    locale, 'platform.care.profile.edit')),
                              ),
                              TextButton(
                                style: TextButton.styleFrom(
                                    foregroundColor: kDanger),
                                onPressed: () => _confirmDelete(profile),
                                child: Text(careText(
                                    locale, 'platform.care.profile.delete')),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}
