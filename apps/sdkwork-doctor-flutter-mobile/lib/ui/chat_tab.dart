import 'package:flutter/material.dart';

import '../agent/care_agent.dart';
import '../family.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';
import 'care_shell.dart';
import 'care_widgets.dart';

/// 对话: the family-doctor conversation.
///
/// The active patient is switchable in place at the top; every completed
/// exchange is recorded against that patient. With no patient file there is
/// nothing to consult for, so sending is disabled and 我的 is linked instead.
class ChatTab extends StatefulWidget {
  const ChatTab({
    super.key,
    required this.locale,
    required this.agent,
    required this.records,
    required this.patients,
    required this.onOpenMe,
  });

  final String locale;
  final CareAgent agent;
  final VisitRecordStore records;
  final PatientProfileStore patients;

  /// Switches the shell to 我的, where patient files are created.
  final VoidCallback onOpenMe;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final TextEditingController _controller = TextEditingController();
  List<CareMessage> _messages = <CareMessage>[];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final String text = _controller.text.trim();
    final PatientProfile? patient = widget.patients.active;
    if (text.isEmpty || _busy || patient == null) return;
    final FamilyMember member = FamilyMember.fromPatient(patient);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final CareMessage reply = await widget.agent.send(text, member);
      await widget.records.add(createVisitRecord(
        member: member,
        symptom: text,
        advice: reply.text,
        level: reply.level,
        mode: widget.agent.mode,
      ));
      if (!mounted) return;
      setState(() {
        _messages = widget.agent.history;
        _controller.clear();
      });
    } on CareAgentException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return AnimatedBuilder(
      animation: widget.patients,
      builder: (BuildContext context, Widget? _) {
        final List<PatientProfile> profiles = widget.patients.profiles;
        final PatientProfile? active = widget.patients.active;
        return Column(
          children: <Widget>[
            if (profiles.isEmpty)
              _NoPatientBanner(locale: locale, onOpenMe: widget.onOpenMe)
            else
              _PatientSwitcher(
                locale: locale,
                profiles: profiles,
                activeId: widget.patients.activeId,
                onSelect: widget.patients.select,
              ),
            if (_messages.isNotEmpty)
              CarePageHeader(
                title: careText(locale, 'platform.care.chat.title'),
                subtitle: careText(
                  locale,
                  'platform.care.chat.subtitle',
                  params: <String, String>{
                    'member': active == null
                        ? careText(locale, 'platform.care.value.unknown')
                        : carePatientLabel(locale, active),
                  },
                ),
                extra: careText(locale, careModeKey(widget.agent.mode)),
              ),
            Expanded(
              child: _messages.isEmpty
                  ? CareChatLanding(
                      locale: locale,
                      onPick: (String suggestion) =>
                          setState(() => _controller.text = suggestion),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _messages.length,
                      itemBuilder: (BuildContext context, int index) {
                        final CareMessage message = _messages[index];
                        return Card(
                          child: ListTile(
                            title: Text(careText(
                              locale,
                              message.isUser
                                  ? 'platform.care.chat.you'
                                  : 'platform.care.chat.doctor',
                            )),
                            subtitle: Text(message.text),
                            trailing: CareLevelChip(
                              label:
                                  careText(locale, careLevelKey(message.level)),
                              warn: message.level == TriageLevel.emergency ||
                                  message.level == TriageLevel.urgent,
                            ),
                          ),
                        );
                      },
                    ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  careText(locale, 'platform.care.chat.error',
                      params: <String, String>{'message': _error!}),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: active != null,
                      decoration: InputDecoration(
                        labelText:
                            careText(locale, 'platform.care.chat.inputLabel'),
                        hintText: careText(locale,
                            'platform.care.chat.placeholder'),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _busy || active == null ? null : _send,
                    child: Text(careText(
                      locale,
                      _busy
                          ? 'platform.care.chat.sending'
                          : 'platform.care.chat.send',
                    )),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Compact active-patient switcher: one chip per patient file.
class _PatientSwitcher extends StatelessWidget {
  const _PatientSwitcher({
    required this.locale,
    required this.profiles,
    required this.activeId,
    required this.onSelect,
  });

  final String locale;
  final List<PatientProfile> profiles;
  final String? activeId;
  final Future<void> Function(String id) onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  careText(locale, 'platform.care.chat.patient'),
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600, color: kInk),
                ),
              ),
              Text(
                careText(locale, 'platform.care.chat.switchPatient'),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (final PatientProfile profile in profiles)
                ChoiceChip(
                  label: Text(carePatientLabel(locale, profile)),
                  selected: profile.id == activeId,
                  onSelected: (_) => onSelect(profile.id),
                ),
            ],
          ),
        ],
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
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Card(
        child: ListTile(
          leading: const Icon(Icons.person_off_outlined, color: kMuted),
          title: Text(careText(locale, 'platform.care.chat.noPatient')),
          subtitle: Text(careText(locale, 'platform.care.profile.empty')),
          trailing: TextButton(
            onPressed: onOpenMe,
            child: Text(careText(locale, 'platform.care.nav.me')),
          ),
        ),
      ),
    );
  }
}
