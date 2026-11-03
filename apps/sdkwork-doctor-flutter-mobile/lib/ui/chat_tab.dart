import 'package:flutter/material.dart';
import 'package:sdkwork_chat_composer_flutter/sdkwork_chat_composer_flutter.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../agent/care_agent.dart';
import '../family.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';
import '../triage_copy.dart';
import 'care_shell.dart';
import 'care_widgets.dart';

/// 对话: the family-doctor conversation of the active care session.
///
/// The transcript and every send belong to the session the drawer selected; the
/// active patient is switchable in place at the top and every completed exchange
/// is recorded against that patient. With no patient file there is nothing to
/// consult for, so sending is disabled and 我的 is linked instead.
class ChatTab extends StatefulWidget {
  const ChatTab({
    super.key,
    required this.locale,
    required this.conversations,
    required this.records,
    required this.patients,
    required this.onOpenMe,
  });

  final String locale;
  final CareConversationsController conversations;
  final VisitRecordStore records;
  final PatientProfileStore patients;

  /// Switches the shell to 我的, where patient files are created.
  final VoidCallback onOpenMe;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send(String draft) async {
    final String text = draft.trim();
    final PatientProfile? patient = widget.patients.active;
    if (text.isEmpty || patient == null || widget.conversations.sending) {
      return;
    }
    final FamilyMember member = FamilyMember.fromPatient(patient);
    final String? reply = await widget.conversations.send(
      text,
      systemPrompt: buildFamilyDoctorSystemPrompt(member),
      // The offline transport already answers with its own actions and safety
      // line; only the hosted answer needs the care reply policy applied.
      decorate: widget.conversations.mode == 'hosted'
          ? (String raw) => composeCareReply(
              widget.locale, resolveReplyLevel(text, raw), raw, member)
          : null,
    );
    if (!mounted || reply == null) {
      return;
    }
    await widget.records.add(createVisitRecord(
      member: member,
      symptom: text,
      advice: reply,
      level: resolveReplyLevel(text, reply),
      mode: widget.conversations.mode,
    ));
    if (!mounted) {
      return;
    }
    setState(_controller.clear);
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return AnimatedBuilder(
      animation: Listenable.merge(
        <Listenable>[widget.patients, widget.conversations],
      ),
      builder: (BuildContext context, Widget? _) {
        final List<PatientProfile> profiles = widget.patients.profiles;
        final PatientProfile? active = widget.patients.active;
        final List<CareConversationMessage> messages = widget.conversations.messages;
        final String? error = widget.conversations.error;
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
            if (messages.isNotEmpty)
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
                extra: careText(locale, careModeKey(widget.conversations.mode)),
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
                      padding: const EdgeInsets.all(16),
                      itemCount: messages.length,
                      itemBuilder: (BuildContext context, int index) {
                        final CareConversationMessage message = messages[index];
                        // The doctor bubble carries the urgency of the exchange:
                        // the user's text sets the floor and a red flag inside
                        // the answer can only raise it.
                        final TriageLevel level = message.isUser
                            ? triageSymptoms(message.text).level
                            : resolveReplyLevel(
                                _lastUserBefore(messages, index), message.text);
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
                              label: careText(locale, careLevelKey(level)),
                              warn: level == TriageLevel.emergency ||
                                  level == TriageLevel.urgent,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: SdkworkChatComposer(
                busy: widget.conversations.sending,
                controller: _controller,
                elevation: false,
                enabled: active != null,
                labels: SdkworkChatComposerLabels(
                  attach: careText(locale, 'platform.care.chat.attach'),
                  busy: careText(locale, 'platform.care.chat.sending'),
                  inputLabel: careText(locale, 'platform.care.chat.inputLabel'),
                  mode: careText(locale, 'platform.care.me.mode'),
                  placeholder: active == null
                      ? careText(locale, 'platform.care.chat.noPatient')
                      : careText(locale, 'platform.care.chat.placeholder'),
                  send: careText(locale, 'platform.care.chat.send'),
                  voice: careText(locale, 'platform.care.chat.voice'),
                ),
                mode: active == null
                    ? null
                    : SdkworkChatComposerMode(
                        label: careText(
                          locale,
                          careModeKey(widget.conversations.mode),
                        ),
                      ),
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
