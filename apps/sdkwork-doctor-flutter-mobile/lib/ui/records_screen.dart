import 'package:flutter/material.dart';

import '../doctors/doctor_directory.dart';
import '../doctors/doctor_selection.dart';
import '../i18n/care_i18n.dart';
import '../records/care_session_store.dart';
import '../records/medical_record_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';
import 'care_widgets.dart';
import 'record_detail_screen.dart';
import '../care/voice/care_voice_ports.dart';

/// 看病记录: one card per conversation session, newest first. Each card opens the
/// dedicated 4-tab detail page (病历 / AI总结 / 医生人工确认 / 通话回放); the list
/// never expands the full 病历 in place.
class RecordsScreen extends StatefulWidget {
  const RecordsScreen({
    super.key,
    required this.locale,
    required this.records,
    required this.medicalRecords,
    required this.careSessions,
    required this.voiceEnvironment,
    this.roster,
    this.selection,
  });

  final String locale;

  /// Kept for the 我的 count and older callers; the list is session-based now.
  final VisitRecordStore records;
  final MedicalRecordStore medicalRecords;
  final CareSessionStore careSessions;
  final CareVoiceCallEnvironment voiceEnvironment;
  final DoctorRoster? roster;
  final DoctorSelectionStore? selection;

  @override
  State<RecordsScreen> createState() => _RecordsScreenState();
}

class _RecordsScreenState extends State<RecordsScreen> {
  Future<void> _confirmClear() async {
    if (widget.careSessions.isEmpty && widget.medicalRecords.isEmpty) return;
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(careText(widget.locale, 'platform.care.records.title')),
        content: Text(
            careText(widget.locale, 'platform.care.records.clearAllConfirm')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(
                careText(widget.locale, 'platform.care.action.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
                careText(widget.locale, 'platform.care.records.clearAll')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.careSessions.clear();
    await widget.medicalRecords.clear();
  }

  String get _primaryDoctorName {
    final DoctorRoster? roster = widget.roster;
    if (roster == null) return '';
    final DoctorProfile? primary = resolvePrimaryDoctor(
      roster,
      widget.selection?.state ?? const DoctorSelectionState(),
    );
    return primary?.displayName ?? '';
  }

  void _open(CareSession session) {
    Navigator.of(context).push<void>(MaterialPageRoute<void>(
      builder: (BuildContext context) => RecordDetailScreen(
        locale: widget.locale,
        sessionId: session.id,
        careSessions: widget.careSessions,
        medicalRecords: widget.medicalRecords,
        synthesizer: widget.voiceEnvironment.createSynthesizer(),
        primaryDoctorName: _primaryDoctorName,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return AnimatedBuilder(
      animation: Listenable.merge(
          <Listenable>[widget.careSessions, widget.medicalRecords]),
      builder: (BuildContext context, Widget? _) {
        final List<CareSession> sessions = mergeCareSessions(
          widget.careSessions.sessions,
          widget.medicalRecords.records,
        );
        return ListView(
          padding: const EdgeInsets.only(bottom: 16),
          children: <Widget>[
            CarePageHeader(
              title: careText(locale, 'platform.care.records.title'),
              subtitle: careText(locale, 'platform.care.records.subtitle'),
              extra: careText(
                locale,
                'platform.care.records.sessionCount',
                params: <String, String>{'count': '${sessions.length}'},
              ),
            ),
            if (sessions.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  careText(locale, 'platform.care.records.empty'),
                  style: const TextStyle(color: kMuted),
                ),
              )
            else
              for (final CareSession session in sessions)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
                  child: _SessionCard(
                    locale: locale,
                    session: session,
                    record: careSessionRecord(
                        session, widget.medicalRecords.records),
                    onTap: () => _open(session),
                  ),
                ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: FilledButton.tonal(
                style: FilledButton.styleFrom(
                  backgroundColor: kSurfaceAlt,
                  foregroundColor: kTechBlueStrong,
                  elevation: 0,
                ),
                onPressed:
                    sessions.isEmpty ? null : () => _confirmClear(),
                child: Text(
                    careText(locale, 'platform.care.records.clearAll')),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({
    required this.locale,
    required this.session,
    required this.record,
    required this.onTap,
  });

  final String locale;
  final CareSession session;
  final MedicalRecord? record;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final String status = session.isActive
        ? 'active'
        : record == null
            ? 'ended'
            : record!.needsDoctorReview
                ? 'awaiting_doctor'
                : 'confirmed';
    final TriageLevel level = careSessionLevel(session);
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      session.title,
                      style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: kInk),
                    ),
                  ),
                  CareLevelChip(
                    label: careText(
                        locale, 'platform.care.records.status.$status'),
                    warn: status == 'awaiting_doctor',
                  ),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                '${session.memberLabel} · ${careFormatTime(session.startedAt)}',
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
              const SizedBox(height: 4),
              Text(
                record?.aiDiagnosis.impression ??
                    careText(locale, 'platform.care.record.recordPending'),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: <Widget>[
                  CareLevelChip(
                    label: careText(
                      locale,
                      'platform.care.records.messageCount',
                      params: <String, String>{
                        'count': '${session.transcript.length}',
                      },
                    ),
                    warn: false,
                  ),
                  if (session.calls.isNotEmpty)
                    CareLevelChip(
                      label: careText(
                        locale,
                        'platform.care.records.callCount',
                        params: <String, String>{
                          'count': '${session.calls.length}',
                        },
                      ),
                      warn: false,
                    ),
                  if (level != TriageLevel.selfCare)
                    CareLevelChip(
                      label: careText(locale, careLevelKey(level)),
                      warn: level == TriageLevel.emergency ||
                          level == TriageLevel.urgent,
                    ),
                  Text(
                    careText(locale, 'platform.care.records.open'),
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: kTechBlueStrong),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
