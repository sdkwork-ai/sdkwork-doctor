import 'package:flutter/material.dart';

import '../doctors/doctor_directory.dart';
import '../doctors/doctor_selection.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/care_session_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';
import 'device_screen.dart';
import 'patient_files_screen.dart';

/// 我的: an account screen in the native idiom. The identity block states who
/// this household is (avatar, name, patient facts, status pills), and below it
/// every capability is one full-bleed row of a grouped list that opens its own
/// module — patient files, doctors, the conversation, records, and the device
/// environment.
class MeTab extends StatelessWidget {
  const MeTab({
    super.key,
    required this.locale,
    required this.agentMode,
    required this.records,
    required this.careSessions,
    required this.patients,
    required this.selection,
    required this.roster,
    required this.onOpenChat,
    required this.onOpenVideoCall,
    required this.onOpenDoctors,
    required this.onOpenRecords,
    required this.onToggleLocale,
  });

  final String locale;
  final String agentMode;
  final VisitRecordStore records;
  final CareSessionStore careSessions;
  final PatientProfileStore patients;
  final DoctorSelectionStore selection;
  final DoctorRosterController roster;
  final VoidCallback onOpenChat;
  final VoidCallback onOpenVideoCall;
  final VoidCallback onOpenDoctors;
  final VoidCallback onOpenRecords;

  /// Switches the care catalog between 中文 and English; the session drawer is a
  /// pure conversation list, so this control lives here.
  final VoidCallback onToggleLocale;

  Future<void> _openPatientFiles(BuildContext context) async {
    await Navigator.of(context).push<void>(MaterialPageRoute<void>(
      builder: (BuildContext _) => PatientFilesScreen(
        locale: locale,
        patients: patients,
      ),
    ));
  }

  Future<void> _openDevice(BuildContext context) async {
    await Navigator.of(context).push<void>(MaterialPageRoute<void>(
      builder: (BuildContext _) =>
          DeviceScreen(locale: locale, mode: agentMode),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable:
          Listenable.merge(<Listenable>[patients, selection, roster, records, careSessions]),
      builder: (BuildContext context, Widget? _) {
        final DoctorRoster? answered = roster.roster;
        final DoctorProfile? primary = answered == null
            ? null
            : resolvePrimaryDoctor(answered, selection.state);
        return ListView(
          padding: EdgeInsets.zero,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: _Identity(
                active: patients.active,
                locale: locale,
                modeHosted: agentMode == 'hosted',
                modeLabel: careText(locale, careModeKey(agentMode)),
                onTap: () => _openPatientFiles(context),
              ),
            ),
            const SizedBox(height: 28),
            CareGroup(
              label: careText(locale, 'platform.care.me.group.family'),
              children: <Widget>[
                CareCell(
                  icon: Icons.people_outline,
                  title: careText(locale, 'platform.care.me.patients'),
                  value: careText(locale, 'platform.care.me.patientsCount',
                      params: <String, String>{
                        'count': '${patients.profiles.length}',
                      }),
                  onTap: () => _openPatientFiles(context),
                ),
                CareCell(
                  icon: Icons.medical_information_outlined,
                  title: careText(locale, 'platform.care.me.doctors'),
                  value: primary?.displayName ??
                      careText(locale, 'platform.care.me.notChosen'),
                  onTap: onOpenDoctors,
                ),
              ],
            ),
            const SizedBox(height: 10),
            CareGroup(
              label: careText(locale, 'platform.care.me.group.care'),
              children: <Widget>[
                CareCell(
                  icon: Icons.chat_bubble_outline,
                  title: careText(locale, 'platform.care.chat.title'),
                  onTap: onOpenChat,
                ),
                CareCell(
                  icon: Icons.videocam_outlined,
                  title: careText(locale, 'platform.care.call.videoTitle'),
                  onTap: onOpenVideoCall,
                ),
                CareCell(
                  icon: Icons.receipt_long_outlined,
                  title: careText(locale, 'platform.care.me.recordsAndMedical'),
                  value: careText(locale, 'platform.care.me.recordsCount',
                      params: <String, String>{
                        'count': '${careSessions.sessions.length}',
                      }),
                  onTap: onOpenRecords,
                ),
              ],
            ),
            const SizedBox(height: 10),
            CareGroup(
              label: careText(locale, 'platform.care.me.group.system'),
              children: <Widget>[
                CareCell(
                  icon: Icons.devices_outlined,
                  title: careText(locale, 'platform.care.me.device'),
                  onTap: () => _openDevice(context),
                ),
                CareCell(
                  icon: Icons.translate,
                  title: careText(locale, 'platform.care.language.label'),
                  value: locale == 'zh-CN' ? '中文' : 'English',
                  onTap: onToggleLocale,
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
              child: Center(
                child: Text(
                  careText(locale, 'platform.care.privacy.local'),
                  style: const TextStyle(fontSize: 11, color: kMuted),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// The account header: a large monogram, the active patient's facts, and the
/// status pills. Tapping it opens 病人档案.
class _Identity extends StatelessWidget {
  const _Identity({
    required this.active,
    required this.locale,
    required this.modeHosted,
    required this.modeLabel,
    required this.onTap,
  });

  final PatientProfile? active;
  final String locale;
  final bool modeHosted;
  final String modeLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final PatientProfile? member = active;
    final String initial = member == null || member.displayName.trim().isEmpty
        ? ''
        : member.displayName.trim().substring(0, 1).toUpperCase();
    final String facts = member == null
        ? careText(locale, 'platform.care.profile.subtitle')
        : '${careText(locale, 'platform.care.profile.relation.${member.relation.name}')}'
            ' · ${member.birthYear}'
            ' · ${careText(locale, 'platform.care.profile.sex.${member.sex.name}')}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: <Widget>[
                Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: kTechBlueSoft,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: member == null
                      ? const Icon(Icons.people_outline,
                          size: 28, color: kTechBlueStrong)
                      : Text(
                          initial,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w700,
                            color: kTechBlueStrong,
                          ),
                        ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        member?.displayName ??
                            careText(
                                locale, 'platform.care.profile.notCreated'),
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: kInk,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        facts,
                        style: const TextStyle(fontSize: 13, color: kMuted),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, size: 20, color: kMuted),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.only(left: 80),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              if (member != null)
                CarePill(
                  label: careText(locale, 'platform.care.profile.completeness',
                      params: <String, String>{
                        'percent': '${patientProfileCompleteness(member)}',
                      }),
                ),
              CarePill(
                label: modeLabel,
                dotColor: modeHosted ? const Color(0xFF0E9F6E) : kMuted,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
