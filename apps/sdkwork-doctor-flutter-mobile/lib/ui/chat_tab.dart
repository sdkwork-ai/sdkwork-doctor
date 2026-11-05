import 'package:flutter/material.dart';
import 'package:sdkwork_chat_composer_flutter/sdkwork_chat_composer_flutter.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../care/attachment_picker.dart';
import '../care/care_exchange.dart';
import '../care/medical_summary.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/care_session_store.dart';
import '../records/medical_record_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';
import 'attachment_sheet.dart';
import 'care_shell.dart';
import 'care_widgets.dart';

/// 对话: the family-doctor conversation of the active care session.
///
/// The transcript and every send belong to the session the drawer selected; the
/// active patient is switchable in place at the top and every completed exchange
/// is recorded against that patient. Above the transcript the patient ends the
/// conversation, which asks the agent for a 病历 the human doctor can diagnose.
/// Files, images, and videos may be attached and travel with the record. With no
/// patient file there is nothing to consult for, so sending is disabled and 我的
/// is linked instead.
class ChatTab extends StatefulWidget {
  const ChatTab({
    super.key,
    required this.locale,
    required this.conversations,
    required this.records,
    required this.medicalRecords,
    required this.careSessions,
    required this.patients,
    required this.attachmentPicker,
    required this.onOpenMe,
  });

  final String locale;
  final CareConversationsController conversations;
  final VisitRecordStore records;
  final MedicalRecordStore medicalRecords;
  final CareSessionStore careSessions;
  final PatientProfileStore patients;
  final CareAttachmentPicker attachmentPicker;

  /// Switches the shell to 我的, where patient files are created.
  final VoidCallback onOpenMe;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final TextEditingController _controller = TextEditingController();

  /// Files not yet sent with a turn.
  List<MedicalAttachment> _pending = <MedicalAttachment>[];

  /// Every file attached during the open session, including the sent ones; this
  /// is what the generated 病历 carries.
  List<MedicalAttachment> _sessionAttachments = <MedicalAttachment>[];

  /// The open 看病记录 session; set on the first turn of the visit.
  String? _sessionId;
  DateTime _startedAt = DateTime.now();
  bool _ending = false;
  String? _notice;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final PatientProfile? patient = widget.patients.active;
    if (patient == null || _ending) {
      return;
    }
    // "+" opens the popup first: a photo captured now, the photo/video library,
    // or the file browser. Dismissing the popup must not open a system picker.
    final CareAttachmentSource? source = await showCareAttachmentSheet(
      context: context,
      locale: widget.locale,
    );
    if (source == null || !mounted) {
      return;
    }
    try {
      final List<MedicalAttachment> picked =
          await widget.attachmentPicker.pick(source);
      if (!mounted || picked.isEmpty) {
        return;
      }
      setState(() {
        _pending = <MedicalAttachment>[..._pending, ...picked];
        _sessionAttachments = <MedicalAttachment>[
          ..._sessionAttachments,
          ...picked
        ];
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _notice = careText(widget.locale, 'platform.care.chat.attachmentFailed',
            params: <String, String>{'name': '', 'message': '$error'});
      });
    }
  }

  void _removePending(MedicalAttachment attachment) {
    setState(() {
      _pending = _pending
          .where((MedicalAttachment entry) => entry.id != attachment.id)
          .toList(growable: false);
      _sessionAttachments = _sessionAttachments
          .where((MedicalAttachment entry) => entry.id != attachment.id)
          .toList(growable: false);
    });
  }

  Future<void> _send(String draft) async {
    final PatientProfile? patient = widget.patients.active;
    if (draft.trim().isEmpty ||
        patient == null ||
        widget.conversations.sending ||
        _ending) {
      return;
    }
    // A human consultation has no app-side assistant: the turn is stored for
    // the doctor and the reply arrives from the doctor's own surface.
    if (widget.conversations.activeIsHuman) {
      await widget.conversations.sendPatientMessage(draft.trim());
      if (!mounted) return;
      setState(() {
        _controller.clear();
        _pending = <MedicalAttachment>[];
        _notice = null;
      });
      return;
    }
    final String attachmentNote = _pending.isEmpty
        ? ''
        : '\n\n${_pending.map((MedicalAttachment attachment) => '[${careText(widget.locale, 'platform.care.medical.attachment.${attachment.kind}')}] ${attachment.name}').join('\n')}';
    final String content = '${draft.trim()}$attachmentNote';
    final String? reply = await sendCareExchange(
      locale: widget.locale,
      conversations: widget.conversations,
      records: widget.records,
      patient: patient,
      text: content,
    );
    if (!mounted || reply == null) {
      return;
    }
    // One 看病记录 per visit: the typed exchange joins the open session.
    final CareSession session = await widget.careSessions.ensureActive(
      patient: patient,
      mode: widget.conversations.mode,
      sessionId: widget.conversations.activeSessionId,
    );
    _sessionId = session.id;
    await widget.careSessions.appendMessage(
      session.id,
      role: 'patient',
      text: content,
      channel: 'text',
      level: triageSymptoms(draft).level,
      attachmentIds: _pending
          .map((MedicalAttachment attachment) => attachment.id)
          .toList(growable: false),
    );
    await widget.careSessions.appendMessage(
      session.id,
      role: 'assistant',
      text: reply,
      channel: 'text',
    );
    if (!mounted) return;
    setState(() {
      _controller.clear();
      _pending = <MedicalAttachment>[];
      _notice = null;
    });
  }

  /// The end action of a human consultation: it closes the conversation without
  /// inventing a 病历, because no agent summary of a human conversation exists.
  Future<void> _endHumanConversation() async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(careText(widget.locale, 'platform.care.medical.session')),
        content: Text(careText(widget.locale, 'platform.care.chat.humanEnd')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(careText(widget.locale, 'platform.care.action.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(careText(widget.locale, 'platform.care.chat.humanEnd')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.conversations.endActiveHumanConsultation();
  }

  Future<void> _endConversation() async {
    final PatientProfile? patient = widget.patients.active;
    final List<CareConversationMessage> messages =
        widget.conversations.messages;
    final String? sessionId = widget.conversations.activeSessionId;
    if (patient == null || messages.isEmpty || _ending || sessionId == null) {
      return;
    }
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(careText(widget.locale, 'platform.care.medical.session')),
        content: Text(
          '${careText(widget.locale, 'platform.care.medical.endConfirm')}\n\n'
          '${careText(
            widget.locale,
            'platform.care.medical.sessionMeta',
            params: <String, String>{
              'messages': '${messages.length}',
              'attachments': '${_sessionAttachments.length}',
            },
          )}',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(careText(widget.locale, 'platform.care.action.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
                careText(widget.locale, 'platform.care.medical.endAction')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }
    setState(() {
      _ending = true;
      _notice = null;
    });
    final CareSession? open = widget.careSessions.findActive(patient.id) ??
        (_sessionId == null ? null : widget.careSessions.find(_sessionId!));
    final DateTime startedAt = open == null
        ? _startedAt
        : (DateTime.tryParse(open.startedAt) ?? _startedAt);
    final DateTime endedAt = DateTime.now();
    final CareSummaryInput input = CareSummaryInput(
      sessionId: open?.id ?? sessionId,
      patientLabel: carePatientLabel(widget.locale, patient),
      patientFacts: carePatientFacts(patient),
      transcript: messages
          .map((CareConversationMessage message) => CareSummaryTurn(
                isUser: message.isUser,
                text: message.text,
              ))
          .toList(growable: false),
      attachmentNames: _sessionAttachments
          .map((MedicalAttachment attachment) =>
              '${attachment.name} (${attachment.kind})')
          .toList(growable: false),
      startedAt: startedAt,
      endedAt: endedAt,
    );
    try {
      final CareSummaryDraft draft = await summarizeCareConversation(
        locale: widget.locale,
        service: widget.conversations.service,
        input: input,
      );
      final MedicalRecord record = buildMedicalRecord(
        patient: patient,
        input: input,
        draft: draft,
        mode: widget.conversations.mode,
        messages: messages,
        attachments: _sessionAttachments,
      );
      await widget.medicalRecords.add(record);
      if (open != null) {
        await widget.careSessions.end(
          open.id,
          medicalRecordId: record.id,
          endedAt: endedAt,
        );
      }
      _sessionId = null;
      await widget.conversations.createNew();
      if (!mounted) return;
      setState(() {
        _ending = false;
        _pending = <MedicalAttachment>[];
        _sessionAttachments = <MedicalAttachment>[];
        _startedAt = DateTime.now();
        _notice =
            '${careText(widget.locale, 'platform.care.medical.generated')} '
            '${careText(widget.locale, 'platform.care.medical.generatedHint')}';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _ending = false;
        _notice = careText(widget.locale, 'platform.care.medical.failed',
            params: <String, String>{'message': '$error'});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return AnimatedBuilder(
      animation: Listenable.merge(
        <Listenable>[
          widget.patients,
          widget.conversations,
          widget.medicalRecords,
          widget.careSessions,
        ],
      ),
      builder: (BuildContext context, Widget? _) {
        final List<PatientProfile> profiles = widget.patients.profiles;
        final PatientProfile? active = widget.patients.active;
        final List<CareConversationMessage> messages =
            widget.conversations.messages;
        final String? error = widget.conversations.error;
        final String modeLabel =
            careText(locale, careModeKey(widget.conversations.mode));
        final CareConversationSession? activeSession =
            widget.conversations.activeSession;
        final bool human = activeSession?.isHuman ?? false;
        final String doctorName =
            activeSession?.doctor.displayName.trim() ?? '';
        final bool humanActive = activeSession?.isActive ?? true;
        return Column(
          children: <Widget>[
            if (profiles.isEmpty)
              _NoPatientBanner(locale: locale, onOpenMe: widget.onOpenMe)
            else
              // One compact strip: patient files and the end-of-visit action.
              // The old patient card + session card + page header cost ~250dp
              // before the transcript, which is what the chat is for.
              _ChatHeader(
                locale: locale,
                profiles: profiles,
                activeId: widget.patients.activeId,
                onSelect: widget.patients.select,
                showEnd: messages.isNotEmpty,
                ending: _ending,
                endLabel: human
                    ? 'platform.care.chat.humanEnd'
                    : 'platform.care.medical.endShort',
                onEnd: human ? _endHumanConversation : _endConversation,
              ),
            if (human)
              _HumanDoctorStrip(
                locale: locale,
                doctorName: doctorName,
                department: activeSession?.doctor.department ?? '',
                avatarUrl: '',
                memberLabel: activeSession?.memberLabel ?? '',
                active: humanActive,
                waiting: activeSession?.awaitingDoctor ?? false,
              ),
            if (_notice != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.info_outline_rounded,
                        size: 14, color: kTechBlueStrong),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _notice!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12, color: kTechBlueStrong),
                      ),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: messages.isEmpty
                  ? widget.conversations.loadingMessages
                      ? const Center(child: CircularProgressIndicator())
                      : CareChatLanding(
                          locale: locale,
                          onPick: (String suggestion) =>
                              setState(() => _controller.text = suggestion),
                        )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      itemCount: messages.length,
                      itemBuilder: (BuildContext context, int index) {
                        final CareConversationMessage message = messages[index];
                        // The doctor bubble carries the urgency of the exchange:
                        // the user's text sets the floor and a red flag inside
                        // the answer can only raise it. A human doctor's reply is
                        // not the agent's text, so only the patient's own turn
                        // carries the deterministic level there.
                        final TriageLevel? level = message.isUser
                            ? triageSymptoms(message.text).level
                            : human
                                ? null
                                : resolveReplyLevel(
                                    _lastUserBefore(messages, index),
                                    message.text);
                        final String author = message.isUser
                            ? careText(locale, 'platform.care.chat.you')
                            : human
                                ? (doctorName.isEmpty
                                    ? careText(
                                        locale, 'platform.care.chat.doctor')
                                    : doctorName)
                                : careText(
                                    locale, 'platform.care.chat.doctor');
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Row(
                                  children: <Widget>[
                                    Flexible(
                                      child: Text(
                                        author,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: kMuted,
                                        ),
                                      ),
                                    ),
                                    const Spacer(),
                                    if (level != null)
                                      CareLevelChip(
                                        label: careText(
                                            locale, careLevelKey(level)),
                                        warn:
                                            level == TriageLevel.emergency ||
                                                level == TriageLevel.urgent,
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  message.text,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.45,
                                    color: kInk,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  careText(locale, 'platform.care.chat.error',
                      params: <String, String>{'message': error}),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (_pending.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    for (final MedicalAttachment attachment in _pending)
                      InputChip(
                        label: Text(
                          '${attachment.name} · ${careAttachmentSize(attachment.sizeBytes)}',
                        ),
                        deleteButtonTooltipMessage: careText(
                            locale, 'platform.care.chat.removeAttachment'),
                        onDeleted: () => _removePending(attachment),
                      ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: SdkworkChatComposer(
                busy: widget.conversations.sending || _ending,
                controller: _controller,
                elevation: false,
                enabled: active != null && !_ending && (!human || humanActive),
                labels: SdkworkChatComposerLabels(
                  attach: careText(locale, 'platform.care.chat.attach'),
                  busy: careText(locale, 'platform.care.chat.sending'),
                  inputLabel: careText(locale, 'platform.care.chat.inputLabel'),
                  mode: careText(locale, 'platform.care.me.mode'),
                  placeholder: active == null
                      ? careText(locale, 'platform.care.chat.noPatient')
                      : human
                          ? careText(
                              locale, 'platform.care.chat.humanPlaceholder',
                              params: <String, String>{
                                'doctor': doctorName.isEmpty
                                    ? careText(
                                        locale, 'platform.care.chat.doctor')
                                    : doctorName,
                              })
                          : careText(locale, 'platform.care.chat.placeholder'),
                  send: careText(locale, 'platform.care.chat.send'),
                  voice: careText(locale, 'platform.care.chat.voice'),
                ),
                mode: active == null
                    ? null
                    : SdkworkChatComposerMode(
                        label: human
                            ? careText(locale, 'platform.care.mode.human')
                            : modeLabel,
                      ),
                onAttach: active == null || _ending || human ? null : _attach,
                onSend: _send,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Text of the user message that precedes [index], or '' when there is none.
String _lastUserBefore(List<CareConversationMessage> messages, int index) {
  for (int cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor].isUser) {
      return messages[cursor].text;
    }
  }
  return '';
}

/// One-line chat chrome: the patient files, and the end-of-visit action.
///
/// The chip row scrolls horizontally so a large household never pushes the
/// transcript down, and the end action stays a compact text button instead of a
/// full-width card — the conversation is the page.
class _ChatHeader extends StatelessWidget {
  const _ChatHeader({
    required this.locale,
    required this.profiles,
    required this.activeId,
    required this.onSelect,
    required this.showEnd,
    required this.ending,
    required this.endLabel,
    required this.onEnd,
  });

  final String locale;
  final List<PatientProfile> profiles;
  final String? activeId;
  final Future<void> Function(String id) onSelect;
  final bool showEnd;
  final bool ending;

  /// Catalog key of the end action: the AI visit creates a 病历, a human
  /// consultation is only closed.
  final String endLabel;
  final VoidCallback onEnd;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 6, 0),
      child: Row(
        children: <Widget>[
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: <Widget>[
                  for (final PatientProfile profile in profiles)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(carePatientLabel(locale, profile)),
                        selected: profile.id == activeId,
                        onSelected: (_) => onSelect(profile.id),
                        visualDensity: VisualDensity.compact,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        labelPadding: const EdgeInsets.symmetric(horizontal: 4),
                        labelStyle: const TextStyle(fontSize: 12),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (showEnd)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: ending
                  ? const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 10),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : TextButton.icon(
                      onPressed: onEnd,
                      icon: const Icon(Icons.task_alt_rounded, size: 16),
                      label: Text(
                        careText(locale, endLabel),
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        minimumSize: const Size(0, 36),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
            ),
        ],
      ),
    );
  }
}

/// Who the human consultation is with, and whether the family is waiting on a
/// reply. Sits under the patient strip so the transcript never starts blind.
class _HumanDoctorStrip extends StatelessWidget {
  const _HumanDoctorStrip({
    required this.locale,
    required this.doctorName,
    required this.department,
    required this.avatarUrl,
    required this.memberLabel,
    required this.active,
    required this.waiting,
  });

  final String locale;
  final String doctorName;
  final String department;
  final String avatarUrl;
  final String memberLabel;
  final bool active;
  final bool waiting;

  @override
  Widget build(BuildContext context) {
    final String name = doctorName.trim().isEmpty
        ? careText(locale, 'platform.care.chat.doctor')
        : doctorName.trim();
    final String meta = <String>[
      if (department.trim().isNotEmpty) department.trim(),
      if (memberLabel.trim().isNotEmpty) memberLabel.trim(),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: kSurfaceAlt,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: <Widget>[
            CareDoctorAvatar(name: name, avatarUrl: avatarUrl, size: 34),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: kInk,
                    ),
                  ),
                  if (meta.isNotEmpty)
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: kMuted),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            CareBadge(
              label: careText(locale, 'platform.care.chat.humanBadge'),
            ),
            const SizedBox(width: 6),
            CareBadge(
              label: careText(
                locale,
                !active
                    ? 'platform.care.sessions.ended'
                    : waiting
                        ? 'platform.care.sessions.waiting'
                        : 'platform.care.sessions.replied',
              ),
              warn: active && waiting,
              neutral: !active,
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown when the household has no patient file: sending is disabled and the
/// only useful action is creating one in 我的.
class _NoPatientBanner extends StatelessWidget {
  const _NoPatientBanner({required this.locale, required this.onOpenMe});

  final String locale;
  final VoidCallback onOpenMe;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 10, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
        decoration: BoxDecoration(
          color: kSurfaceAlt,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: <Widget>[
            const Icon(Icons.person_off_outlined, size: 16, color: kMuted),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                careText(locale, 'platform.care.chat.noPatient'),
                style: const TextStyle(fontSize: 12, color: kInk),
              ),
            ),
            TextButton(
              onPressed: onOpenMe,
              style: TextButton.styleFrom(
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                careText(locale, 'platform.care.nav.me'),
                style:
                    const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
