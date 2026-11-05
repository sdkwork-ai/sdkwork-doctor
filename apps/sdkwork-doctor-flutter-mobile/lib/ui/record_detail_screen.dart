import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../care/voice/care_voice_ports.dart';
import '../i18n/care_i18n.dart';
import '../records/care_playback_controller.dart';
import '../records/care_session_store.dart';
import '../records/medical_record_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';
import 'care_widgets.dart';

/// One 看病记录: the visit session and the 病历 it produced, split into the four
/// tabs the doctor and the patient read it with — 病历 / AI总结 / 医生人工确认 /
/// 通话回放.
class RecordDetailScreen extends StatefulWidget {
  const RecordDetailScreen({
    super.key,
    required this.locale,
    required this.sessionId,
    required this.careSessions,
    required this.medicalRecords,
    required this.synthesizer,
    this.primaryDoctorName = '',
  });

  final String locale;
  final String sessionId;
  final CareSessionStore careSessions;
  final MedicalRecordStore medicalRecords;

  /// Device speech engine used by 通话回放; owned by this screen.
  final CareSpeechSynthesizer synthesizer;
  final String primaryDoctorName;

  @override
  State<RecordDetailScreen> createState() => _RecordDetailScreenState();
}

class _RecordDetailScreenState extends State<RecordDetailScreen> {
  int _tab = 0;
  CarePlaybackController? _playback;
  String? _playbackVersion;

  @override
  void dispose() {
    _playback?.dispose();
    unawaited(widget.synthesizer.dispose());
    super.dispose();
  }

  CarePlaybackController _ensurePlayback(CareSession session) {
    final String version = '${session.id}@${session.updatedAt}';
    if (_playback != null && _playbackVersion == version) {
      return _playback!;
    }
    _playback?.dispose();
    _playback = CarePlaybackController(
      synthesizer: widget.synthesizer,
      localeTag: widget.locale,
      items: buildCarePlayback(session),
    );
    _playbackVersion = version;
    return _playback!;
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
        CareSession? session;
        for (final CareSession entry in sessions) {
          if (entry.id == widget.sessionId) {
            session = entry;
            break;
          }
        }
        if (session == null) {
          return Scaffold(
            appBar: AppBar(
                title: Text(careText(locale, 'platform.care.records.detailTitle'))),
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                careText(locale, 'platform.care.records.notFound'),
                style: const TextStyle(color: kMuted),
              ),
            ),
          );
        }
        final CareSession visit = session;
        final MedicalRecord? record = careSessionRecord(
            visit, widget.medicalRecords.records);
        return Scaffold(
          appBar: AppBar(
            title: Text(careText(locale, 'platform.care.records.detailTitle')),
          ),
          body: Column(
            children: <Widget>[
              _VisitHeader(locale: locale, session: visit, record: record),
              _RecordTabs(
                locale: locale,
                index: _tab,
                onChanged: (int next) {
                  if (next != 3) unawaited(_playback?.stop() ?? Future<void>.value());
                  setState(() => _tab = next);
                },
              ),
              Expanded(
                child: _tab == 3
                    ? _PlaybackTab(
                        locale: locale,
                        controller: _ensurePlayback(visit),
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        children: <Widget>[
                          if (_tab == 0)
                            ..._medicalBody(locale, visit, record)
                          else if (_tab == 1)
                            ..._aiBody(locale, record)
                          else
                            ..._doctorBody(locale, record),
                        ],
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _medicalBody(
      String locale, CareSession session, MedicalRecord? record) {
    final String complaint = _chiefComplaint(session);
    final List<MedicalAttachment> files =
        record?.attachments ?? const <MedicalAttachment>[];
    return <Widget>[
      if (session.isActive)
        _Notice(text: careText(locale, 'platform.care.record.recordPending')),
      _Section(
        title: careText(locale, 'platform.care.record.visitTime'),
        child: Column(
          children: <Widget>[
            _FactRow(
              label: careText(locale, 'platform.care.records.member'),
              value: session.memberLabel,
            ),
            _FactRow(
              label: careText(locale, 'platform.care.record.visitTime'),
              value: careFormatTime(session.startedAt),
            ),
            _FactRow(
              label: careText(locale, 'platform.care.record.duration'),
              value: _formatDuration(careSessionDurationMs(session)),
            ),
            _FactRow(
              label: careText(locale, 'platform.care.records.mode'),
              value: careText(locale, careModeKey(session.mode)),
            ),
            _FactRow(
              label: careText(locale, 'platform.care.record.status'),
              value: _statusLabel(locale, session, record),
            ),
            _FactRow(
              label: careText(locale, 'platform.care.record.doctor'),
              value: (record?.confirmation?.doctorLabel ?? '').isEmpty
                  ? careText(locale, 'platform.care.record.doctorUnassigned')
                  : record!.confirmation!.doctorLabel,
            ),
          ],
        ),
      ),
      if (complaint.isNotEmpty)
        _Section(
          title: careText(locale, 'platform.care.record.chiefComplaint'),
          child: Text(complaint),
        ),
      _Section(
        title: careText(locale, 'platform.care.record.transcript'),
        subtitle: careText(locale, 'platform.care.record.recordHint'),
        child: session.transcript.isEmpty
            ? Text(careText(locale, 'platform.care.record.transcriptEmpty'),
                style: const TextStyle(color: kMuted))
            : Column(
                children: <Widget>[
                  for (final CareSessionMessage message in session.transcript)
                    _TranscriptRow(
                      locale: locale,
                      message: message,
                      record: record,
                    ),
                ],
              ),
      ),
      _Section(
        title: careText(locale, 'platform.care.record.attachments'),
        child: files.isEmpty
            ? Text(careText(locale, 'platform.care.record.attachmentsEmpty'),
                style: const TextStyle(color: kMuted))
            : _AttachmentStrip(locale: locale, attachments: files),
      ),
    ];
  }

  List<Widget> _aiBody(String locale, MedicalRecord? record) {
    if (record == null) {
      return <Widget>[
        _Notice(text: careText(locale, 'platform.care.record.aiPending')),
      ];
    }
    return <Widget>[
      _Notice(text: careText(locale, 'platform.care.record.aiHint')),
      _Section(
        title: careText(locale, 'platform.care.record.aiTitle'),
        child: Text(record.summary),
      ),
      _Section(
        title: careText(locale, 'platform.care.medical.aiDiagnosis'),
        child: _DiagnosisBlock(
          locale: locale,
          title: careText(locale, 'platform.care.medical.aiDiagnosis'),
          hint: careText(locale, 'platform.care.medical.aiDiagnosisHint'),
          diagnosis: record.aiDiagnosis,
        ),
      ),
    ];
  }

  List<Widget> _doctorBody(String locale, MedicalRecord? record) {
    if (record == null) {
      return <Widget>[
        _Notice(text: careText(locale, 'platform.care.record.doctorPending')),
      ];
    }
    final bool needsReview = record.needsDoctorReview;
    return <Widget>[
      _Section(
        title: careText(locale, 'platform.care.record.confirmationStatus'),
        subtitle: careText(locale, 'platform.care.record.doctorHint'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            CareLevelChip(
              label: careText(
                locale,
                'platform.care.medical.status.${needsReview ? 'awaiting_doctor' : 'confirmed'}',
              ),
              warn: needsReview,
            ),
            if (record.confirmation != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '${careText(locale, 'platform.care.medical.decision.${record.confirmation!.decision}')} · '
                  '${careText(locale, 'platform.care.medical.confirmedBy', params: <String, String>{
                        'doctor': record.confirmation!.doctorLabel,
                        'at': careFormatTime(record.confirmation!.confirmedAt),
                      })}',
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
              ),
          ],
        ),
      ),
      _Section(
        title: careText(locale, 'platform.care.medical.aiDiagnosis'),
        child: _DiagnosisBlock(
          locale: locale,
          title: careText(locale, 'platform.care.medical.aiDiagnosis'),
          hint: careText(locale, 'platform.care.medical.aiDiagnosisHint'),
          diagnosis: record.aiDiagnosis,
        ),
      ),
      _Section(
        title: careText(locale, 'platform.care.medical.doctorDiagnosis'),
        child: record.doctorDiagnosis == null
            ? Text(careText(locale, 'platform.care.medical.noDoctorDiagnosis'),
                style: const TextStyle(color: kMuted))
            : _DiagnosisBlock(
                locale: locale,
                title: careText(locale, 'platform.care.medical.doctorDiagnosis'),
                hint: careText(
                    locale, 'platform.care.medical.doctorDiagnosisHint'),
                diagnosis: record.doctorDiagnosis!,
              ),
      ),
      _Section(
        title: careText(locale, 'platform.care.medical.review'),
        child: _DoctorReviewForm(
          key: ValueKey<String>('review-${record.id}-${record.status}'),
          locale: locale,
          record: record,
          store: widget.medicalRecords,
          primaryDoctorName: widget.primaryDoctorName,
        ),
      ),
    ];
  }

  String _statusLabel(String locale, CareSession session, MedicalRecord? record) {
    final String key = session.isActive
        ? 'active'
        : record == null
            ? 'ended'
            : record.needsDoctorReview
                ? 'awaiting_doctor'
                : 'confirmed';
    return careText(locale, 'platform.care.records.status.$key');
  }

  String _chiefComplaint(CareSession session) {
    for (final CareSessionMessage message in session.transcript) {
      if (message.role == 'patient' && message.text.trim().isNotEmpty) {
        return message.text;
      }
    }
    return '';
  }
}

String _formatDuration(int ms) {
  if (ms <= 0) return '0:00';
  final int total = (ms / 1000).round();
  final int hours = total ~/ 3600;
  final int minutes = (total % 3600) ~/ 60;
  final int seconds = total % 60;
  String two(int value) => value.toString().padLeft(2, '0');
  return hours > 0
      ? '$hours:${two(minutes)}:${two(seconds)}'
      : '$minutes:${two(seconds)}';
}

class _VisitHeader extends StatelessWidget {
  const _VisitHeader({
    required this.locale,
    required this.session,
    required this.record,
  });

  final String locale;
  final CareSession session;
  final MedicalRecord? record;

  @override
  Widget build(BuildContext context) {
    final String status = session.isActive
        ? 'active'
        : record == null
            ? 'ended'
            : record!.needsDoctorReview
                ? 'awaiting_doctor'
                : 'confirmed';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Text(
                  session.title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              CareLevelChip(
                label: careText(locale, 'platform.care.records.status.$status'),
                warn: status == 'awaiting_doctor',
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${session.memberLabel} · ${careFormatTime(session.startedAt)}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
        ],
      ),
    );
  }
}

class _RecordTabs extends StatelessWidget {
  const _RecordTabs({
    required this.locale,
    required this.index,
    required this.onChanged,
  });

  final String locale;
  final int index;
  final ValueChanged<int> onChanged;

  static const List<String> _keys = <String>[
    'platform.care.record.tab.medical',
    'platform.care.record.tab.ai',
    'platform.care.record.tab.doctor',
    'platform.care.record.tab.playback',
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: <Widget>[
          for (int position = 0; position < _keys.length; position += 1)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                    left: position == 0 ? 0 : 3,
                    right: position == _keys.length - 1 ? 0 : 3),
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: () => onChanged(position),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: index == position ? kTechBlue : kSurface,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      careText(locale, _keys[position]),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: index == position ? Colors.white : kMuted,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, this.subtitle, required this.child});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w600, color: kInk),
            ),
            if ((subtitle ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  subtitle!,
                  style: const TextStyle(fontSize: 11, color: kMuted),
                ),
              ),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: kTechBlueSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(text, style: const TextStyle(fontSize: 12, color: kInk)),
    );
  }
}

class _FactRow extends StatelessWidget {
  const _FactRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 96,
            child: Text(label,
                style: const TextStyle(fontSize: 12, color: kMuted)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

class _TranscriptRow extends StatelessWidget {
  const _TranscriptRow({
    required this.locale,
    required this.message,
    required this.record,
  });

  final String locale;
  final CareSessionMessage message;
  final MedicalRecord? record;

  @override
  Widget build(BuildContext context) {
    final List<MedicalAttachment> files = <MedicalAttachment>[
      for (final MedicalAttachment attachment
          in record?.attachments ?? const <MedicalAttachment>[])
        if (message.attachmentIds.contains(attachment.id)) attachment,
    ];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: kSurfaceAlt,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  careText(
                    locale,
                    message.role == 'patient'
                        ? 'platform.care.chat.you'
                        : 'platform.care.chat.doctor',
                  ),
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                '${careText(locale, 'platform.care.record.channel.${message.channel}')} · '
                '${careFormatTime(message.at)}',
                style: const TextStyle(fontSize: 11, color: kMuted),
              ),
            ],
          ),
          if (message.text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(message.text),
            ),
          if (message.level != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: CareLevelChip(
                label: careText(locale, careLevelKey(message.level!)),
                warn: message.level == TriageLevel.emergency ||
                    message.level == TriageLevel.urgent,
              ),
            ),
          if (files.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _AttachmentStrip(locale: locale, attachments: files),
            ),
        ],
      ),
    );
  }
}

class _DiagnosisBlock extends StatelessWidget {
  const _DiagnosisBlock({
    required this.locale,
    required this.title,
    required this.hint,
    required this.diagnosis,
  });

  final String locale;
  final String title;
  final String hint;
  final MedicalDiagnosis diagnosis;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kSurfaceAlt,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  title,
                  style:
                      const TextStyle(fontWeight: FontWeight.w600, color: kInk),
                ),
              ),
              CareLevelChip(
                label: careText(locale, careLevelKey(diagnosis.level)),
                warn: diagnosis.level == TriageLevel.emergency ||
                    diagnosis.level == TriageLevel.urgent,
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(hint, style: const TextStyle(fontSize: 11, color: kMuted)),
          const SizedBox(height: 6),
          Text(
            '${careText(locale, 'platform.care.medical.impression')}: ${diagnosis.impression}',
          ),
          if (diagnosis.conditions.isNotEmpty)
            Text(
              '${careText(locale, 'platform.care.medical.conditions')}: '
              '${diagnosis.conditions.join(' · ')}',
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
          for (final String line in diagnosis.recommendations)
            Text('· $line',
                style: const TextStyle(fontSize: 12, color: kMuted)),
          if ((diagnosis.notes ?? '').isNotEmpty)
            Text(
              '${careText(locale, 'platform.care.medical.notes')}: ${diagnosis.notes}',
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '${(diagnosis.doctorLabel ?? '').isEmpty ? '' : '${diagnosis.doctorLabel} · '}'
              '${careFormatTime(diagnosis.createdAt)}',
              style: const TextStyle(fontSize: 11, color: kMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _AttachmentStrip extends StatelessWidget {
  const _AttachmentStrip({required this.locale, required this.attachments});

  final String locale;
  final List<MedicalAttachment> attachments;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: <Widget>[
        for (final MedicalAttachment attachment in attachments)
          if (attachment.kind == 'image' &&
              (attachment.path ?? '').isNotEmpty &&
              File(attachment.path!).existsSync())
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(attachment.path!),
                width: 72,
                height: 72,
                fit: BoxFit.cover,
              ),
            )
          else
            Chip(
              avatar: Icon(
                attachment.kind == 'video'
                    ? Icons.videocam_outlined
                    : attachment.kind == 'image'
                        ? Icons.image_outlined
                        : Icons.description_outlined,
                size: 16,
              ),
              label: Text(
                '${attachment.name} · '
                '${careText(locale, 'platform.care.medical.attachment.${attachment.kind}')}',
              ),
            ),
      ],
    );
  }
}

class _PlaybackTab extends StatelessWidget {
  const _PlaybackTab({
    required this.locale,
    required this.controller,
  });

  final String locale;
  final CarePlaybackController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (BuildContext context, Widget? _) {
        final List<CarePlaybackItem> items = controller.items;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: <Widget>[
            _Notice(text: careText(locale, 'platform.care.record.playback.hint')),
            _Section(
              title: careText(locale, 'platform.care.record.playback.title'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      FilledButton(
                        onPressed: controller.hasMessages
                            ? () => unawaited(controller.toggle())
                            : null,
                        child: Text(careText(
                          locale,
                          controller.playing
                              ? 'platform.care.record.playback.pause'
                              : controller.finished
                                  ? 'platform.care.record.playback.replay'
                                  : 'platform.care.record.playback.play',
                        )),
                      ),
                      const SizedBox(width: 8),
                      TextButton(
                        onPressed: () => unawaited(controller.stop()),
                        child: Text(careText(
                            locale, 'platform.care.record.playback.stop')),
                      ),
                      const Spacer(),
                      Text(
                        '${controller.spokenCount}/${controller.messageCount}',
                        style: const TextStyle(fontSize: 11, color: kMuted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: controller.progress,
                      minHeight: 4,
                      backgroundColor: kSurfaceAlt,
                      color: kTechBlue,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    controller.playing
                        ? careText(
                            locale, 'platform.care.record.playback.speaking')
                        : controller.finished
                            ? careText(
                                locale, 'platform.care.record.playback.finished')
                            : careText(locale,
                                'platform.care.record.playback.aiVoice'),
                    style: const TextStyle(fontSize: 11, color: kMuted),
                  ),
                  if (controller.unavailable)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        careText(
                            locale, 'platform.care.record.playback.unavailable'),
                        style: const TextStyle(fontSize: 11, color: kMuted),
                      ),
                    ),
                ],
              ),
            ),
            if (items.isEmpty)
              _Notice(
                  text: careText(
                      locale, 'platform.care.record.playback.empty')),
            for (int index = 0; index < items.length; index += 1)
              _PlaybackRow(
                locale: locale,
                item: items[index],
                active: controller.index == index,
                onTap: () => unawaited(controller.playFrom(index)),
              ),
          ],
        );
      },
    );
  }
}

class _PlaybackRow extends StatelessWidget {
  const _PlaybackRow({
    required this.locale,
    required this.item,
    required this.active,
    required this.onTap,
  });

  final String locale;
  final CarePlaybackItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (item.kind == 'call') {
      return Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: kSurface,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: <Widget>[
            CareLevelChip(
              label: careText(
                locale,
                item.callMode == 'video'
                    ? 'platform.care.record.playback.callVideo'
                    : 'platform.care.record.playback.callVoice',
              ),
              warn: false,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '${careFormatTime(item.at)} · ${_formatDuration(item.durationMs)}'
                '${item.open ? ' · ${careText(locale, 'platform.care.record.playback.callOpen')}' : ''}',
                style: const TextStyle(fontSize: 11, color: kMuted),
              ),
            ),
          ],
        ),
      );
    }
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: active ? kTechBlueSoft : kSurfaceAlt,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    careText(
                      locale,
                      item.role == 'patient'
                          ? 'platform.care.record.playback.patient'
                          : 'platform.care.record.playback.doctor',
                    ),
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  '${careText(locale, 'platform.care.record.channel.${item.channel}')} · '
                  '${_formatDuration(item.offsetMs)}',
                  style: const TextStyle(fontSize: 11, color: kMuted),
                ),
              ],
            ),
            if (item.text.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(item.text),
              ),
            if (item.level != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: CareLevelChip(
                  label: careText(locale, careLevelKey(item.level!)),
                  warn: item.level == TriageLevel.emergency ||
                      item.level == TriageLevel.urgent,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DoctorReviewForm extends StatefulWidget {
  const _DoctorReviewForm({
    super.key,
    required this.locale,
    required this.record,
    required this.store,
    required this.primaryDoctorName,
  });

  final String locale;
  final MedicalRecord record;
  final MedicalRecordStore store;
  final String primaryDoctorName;

  @override
  State<_DoctorReviewForm> createState() => _DoctorReviewFormState();
}

class _DoctorReviewFormState extends State<_DoctorReviewForm> {
  late String _mode;
  late final TextEditingController _doctor;
  late final TextEditingController _impression;
  late final TextEditingController _conditions;
  late final TextEditingController _recommendations;
  late final TextEditingController _notes;
  late TriageLevel _level;
  String? _error;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    final MedicalRecord record = widget.record;
    _mode = record.needsDoctorReview ? 'confirm' : 'manual';
    _doctor = TextEditingController(
      text: record.doctorDiagnosis?.doctorLabel ??
          (widget.primaryDoctorName.trim().isEmpty
              ? ''
              : widget.primaryDoctorName),
    );
    _impression = TextEditingController(text: record.aiDiagnosis.impression);
    _conditions = TextEditingController(
      text: record.aiDiagnosis.conditions.join('\n'),
    );
    _recommendations = TextEditingController(
      text: record.aiDiagnosis.recommendations.join('\n'),
    );
    _notes = TextEditingController();
    _level = record.aiDiagnosis.level;
  }

  @override
  void dispose() {
    _doctor.dispose();
    _impression.dispose();
    _conditions.dispose();
    _recommendations.dispose();
    _notes.dispose();
    super.dispose();
  }

  List<String> _split(String value) => value
      .split(RegExp(r'[\n,，]'))
      .map((String entry) => entry.trim())
      .where((String entry) => entry.isNotEmpty)
      .toList(growable: false);

  Future<void> _save() async {
    final String doctorLabel = _doctor.text.trim();
    if (doctorLabel.isEmpty) {
      setState(() => _error =
          careText(widget.locale, 'platform.care.medical.doctorRequired'));
      return;
    }
    final bool needsImpression = _mode == 'amend' || _mode == 'manual';
    if (needsImpression && _impression.text.trim().isEmpty) {
      setState(() => _error =
          careText(widget.locale, 'platform.care.medical.impressionRequired'));
      return;
    }
    final DoctorDiagnosisDraft? own = needsImpression
        ? DoctorDiagnosisDraft(
            doctorLabel: doctorLabel,
            impression: _impression.text,
            conditions: _split(_conditions.text),
            recommendations: _split(_recommendations.text),
            level: _level,
            notes: _notes.text,
          )
        : null;
    try {
      final MedicalRecord next = _mode == 'manual'
          ? addDoctorDiagnosis(widget.record, own!)
          : confirmAiDiagnosis(
              widget.record,
              doctorLabel: doctorLabel,
              decision: _mode == 'amend' ? 'amended' : 'confirmed',
              doctorDiagnosis: own,
            );
      await widget.store.save(next);
      if (!mounted) return;
      setState(() {
        _error = null;
        _saved = true;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saved = false;
        _error = careText(widget.locale, 'platform.care.medical.reviewFailed',
            params: <String, String>{'message': '$error'});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    final bool needsImpression = _mode == 'amend' || _mode == 'manual';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          careText(locale, 'platform.care.medical.reviewHint'),
          style: const TextStyle(fontSize: 11, color: kMuted),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _doctor,
          decoration: InputDecoration(
            labelText: careText(locale, 'platform.care.medical.doctorLabel'),
            hintText:
                careText(locale, 'platform.care.medical.doctorPlaceholder'),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: <Widget>[
            ChoiceChip(
              label: Text(careText(locale, 'platform.care.medical.confirmAi')),
              selected: _mode == 'confirm',
              onSelected: (_) => setState(() => _mode = 'confirm'),
            ),
            ChoiceChip(
              label: Text(careText(locale, 'platform.care.medical.amendAi')),
              selected: _mode == 'amend',
              onSelected: (_) => setState(() => _mode = 'amend'),
            ),
            ChoiceChip(
              label: Text(
                  careText(locale, 'platform.care.medical.addDoctorDiagnosis')),
              selected: _mode == 'manual',
              onSelected: (_) => setState(() => _mode = 'manual'),
            ),
          ],
        ),
        if (needsImpression) ...<Widget>[
          const SizedBox(height: 8),
          TextField(
            controller: _impression,
            decoration: InputDecoration(
              labelText: careText(locale, 'platform.care.medical.impression'),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _conditions,
            decoration: InputDecoration(
              labelText: careText(locale, 'platform.care.medical.conditions'),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _recommendations,
            decoration: InputDecoration(
              labelText:
                  careText(locale, 'platform.care.medical.recommendations'),
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<TriageLevel>(
            initialValue: _level,
            decoration: InputDecoration(
              labelText: careText(locale, 'platform.care.records.level'),
            ),
            items: <DropdownMenuItem<TriageLevel>>[
              for (final TriageLevel level in TriageLevel.values)
                DropdownMenuItem<TriageLevel>(
                  value: level,
                  child: Text(careText(locale, careLevelKey(level))),
                ),
            ],
            onChanged: (TriageLevel? value) {
              if (value != null) setState(() => _level = value);
            },
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _notes,
            decoration: InputDecoration(
              labelText: careText(locale, 'platform.care.medical.notes'),
            ),
          ),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _error!,
              style: TextStyle(
                  color: Theme.of(context).colorScheme.error, fontSize: 12),
            ),
          ),
        if (_saved)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              careText(locale, 'platform.care.medical.reviewSaved'),
              style: const TextStyle(color: kTechBlueStrong, fontSize: 12),
            ),
          ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _save,
            child:
                Text(careText(locale, 'platform.care.medical.saveDiagnosis')),
          ),
        ),
      ],
    );
  }
}
