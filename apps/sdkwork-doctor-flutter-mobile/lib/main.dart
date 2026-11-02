import 'package:flutter/material.dart';

import 'agent/care_agent.dart';
import 'family.dart';
import 'i18n/care_i18n.dart';
import 'triage.dart';

/// Agents API base URL injected by the host build; empty selects the offline
/// adapter. The access token is never a build-time value: a host shell injects
/// it after appbase IAM sign-in through [_hostAccessToken].
const String _agentsApiBaseUrl = String.fromEnvironment('AGENTS_API_BASE_URL', defaultValue: '');

void main() => runApp(const DoctorApp());

class DoctorApp extends StatefulWidget {
  const DoctorApp({super.key, this.initialLocale});

  /// Forces the starting locale (tests and host overrides); otherwise the
  /// platform locale decides.
  final String? initialLocale;

  @override
  State<DoctorApp> createState() => _DoctorAppState();
}

class _DoctorAppState extends State<DoctorApp> {
  late String _locale;
  late CareAgent _agent;

  @override
  void initState() {
    super.initState();
    _locale = resolveCareLocale(
      widget.initialLocale ?? WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag(),
    );
    _agent = createCareAgent(agentsApiBaseUrl: _agentsApiBaseUrl, getAccessToken: _hostAccessToken);
  }

  /// Replaced by the platform host once IAM sign-in exists; null means offline.
  String? _hostAccessToken() => null;

  void _toggleLocale() {
    setState(() => _locale = _locale == 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SDKWork Doctor',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      home: DoctorHome(
        locale: _locale,
        agent: _agent,
        onToggleLocale: _toggleLocale,
      ),
    );
  }
}

class DoctorHome extends StatefulWidget {
  const DoctorHome({
    super.key,
    required this.locale,
    required this.agent,
    required this.onToggleLocale,
  });

  final String locale;
  final CareAgent agent;
  final VoidCallback onToggleLocale;

  @override
  State<DoctorHome> createState() => _DoctorHomeState();
}

class _DoctorHomeState extends State<DoctorHome> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return Scaffold(
      appBar: AppBar(
        title: const Text('SDKWork Doctor'),
        actions: <Widget>[
          IconButton(
            tooltip: careText(locale, 'platform.care.me.title'),
            icon: const Icon(Icons.translate),
            onPressed: widget.onToggleLocale,
          ),
        ],
      ),
      body: IndexedStack(
        index: _index,
        children: <Widget>[
          ChatTab(locale: locale, agent: widget.agent, member: demoSelfMember),
          DoctorTab(locale: locale, member: demoSelfMember),
          MeTab(locale: locale, agent: widget.agent, member: demoSelfMember),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (int value) => setState(() => _index = value),
        destinations: <NavigationDestination>[
          NavigationDestination(
            icon: const Icon(Icons.chat_bubble_outline),
            label: careText(locale, 'platform.care.nav.chat'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.medical_information_outlined),
            label: careText(locale, 'platform.care.doctor.title'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            label: careText(locale, 'platform.care.me.title'),
          ),
        ],
      ),
    );
  }
}

String _levelKey(TriageLevel level) {
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

/// Page heading shared by the three tabs, so every tab states what it is and
/// which conversation mode is answering.
class _PageHeader extends StatelessWidget {
  const _PageHeader({required this.title, required this.subtitle, this.extra});

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

class ChatTab extends StatefulWidget {
  const ChatTab({super.key, required this.locale, required this.agent, required this.member});

  final String locale;
  final CareAgent agent;
  final FamilyMember member;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final TextEditingController _controller = TextEditingController();
  List<CareMessage> _messages = <CareMessage>[];
  bool _busy = false;
  String? _error;

  Future<void> _send() async {
    final String text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.agent.send(text, widget.member);
      setState(() {
        _messages = widget.agent.history;
        _controller.clear();
      });
    } on CareAgentException catch (error) {
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return Column(
      children: <Widget>[
        _PageHeader(
          title: careText(locale, 'platform.care.chat.title'),
          subtitle: careText(locale, 'platform.care.chat.subtitle', params: <String, String>{
            'member': widget.member.label,
          }),
          extra: careText(
            locale,
            widget.agent.mode == 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline',
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _messages.isEmpty ? 1 : _messages.length,
            itemBuilder: (BuildContext context, int index) {
              if (_messages.isEmpty) {
                return Card(
                  child: ListTile(
                    title: Text(careText(locale, 'platform.care.chat.panel')),
                    subtitle: Text(careText(locale, 'platform.care.chat.empty')),
                  ),
                );
              }
              final CareMessage message = _messages[index];
              return Card(
                child: ListTile(
                  title: Text(careText(
                    locale,
                    message.isUser ? 'platform.care.chat.you' : 'platform.care.chat.doctor',
                  )),
                  subtitle: Text(message.text),
                  trailing: Chip(label: Text(careText(locale, _levelKey(message.level)))),
                ),
              );
            },
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              careText(locale, 'platform.care.chat.error', params: <String, String>{'message': _error!}),
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
                  decoration: InputDecoration(
                    labelText: careText(locale, 'platform.care.chat.inputLabel'),
                    hintText: careText(locale, 'platform.care.chat.placeholder'),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _busy ? null : _send,
                child: Text(careText(
                  locale,
                  _busy ? 'platform.care.chat.sending' : 'platform.care.chat.send',
                )),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class DoctorTab extends StatelessWidget {
  const DoctorTab({super.key, required this.locale, required this.member});

  final String locale;
  final FamilyMember member;

  String _join(List<String> values) => values.isEmpty ? careText(locale, 'platform.care.value.none') : values.join(', ');

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _PageHeader(
          title: careText(locale, 'platform.care.doctor.title'),
          subtitle: careText(locale, 'platform.care.doctor.subtitle'),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.doctor.panel')),
                  subtitle: Text(member.label),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.fact.allergies')),
                  subtitle: Text(_join(member.allergies)),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.fact.conditions')),
                  subtitle: Text(_join(member.chronicConditions)),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.fact.medications')),
                  subtitle: Text(_join(member.medications)),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.doctor.actions')),
                  subtitle: Text(careText(locale, 'platform.care.doctor.actionsHint')),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class MeTab extends StatelessWidget {
  const MeTab({super.key, required this.locale, required this.agent, required this.member});

  final String locale;
  final CareAgent agent;
  final FamilyMember member;

  @override
  Widget build(BuildContext context) {
    final bool complete = member.allergies.isNotEmpty || member.chronicConditions.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _PageHeader(
          title: careText(locale, 'platform.care.me.title'),
          subtitle: careText(locale, 'platform.care.me.subtitle'),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              Card(
                child: ListTile(
                  title: Text(member.label),
                  subtitle: Text(
                    '${careText(locale, 'platform.care.me.completeness')}: '
                    '${careText(locale, complete ? 'platform.care.me.completenessInProgress' : 'platform.care.me.completenessNeedsReview')}',
                  ),
                  trailing: Chip(label: Text(careText(locale, 'platform.care.active'))),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.me.mode')),
                  subtitle: Text(careText(
                    locale,
                    agent.mode == 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline',
                  )),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(careText(locale, 'platform.care.me.device')),
                  subtitle: Text(careText(locale, 'platform.care.me.deviceHint')),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
