import 'package:flutter/material.dart';

import 'agent/care_agent.dart';
import 'bootstrap/sdkwork_tls_trust.dart';
import 'family.dart';
import 'i18n/care_i18n.dart';
import 'records/visit_store.dart';
import 'theme/doctor_theme.dart';
import 'triage.dart';
import 'ui/care_shell.dart';

/// Agents API base URL injected by the host build; empty selects the offline
/// adapter. The access token is never a build-time value: a host shell injects
/// it after appbase IAM sign-in through [_hostAccessToken].
const String _agentsApiBaseUrl = String.fromEnvironment('AGENTS_API_BASE_URL', defaultValue: '');

Future<void> main() async {
  // The HTTPS trust layer must be installed before any HTTP client is
  // created, so it runs ahead of binding initialization and services.
  SdkworkTlsTrust.installForApp();

  WidgetsFlutterBinding.ensureInitialized();
  final VisitRecordStore records = await VisitRecordStore.load(SharedPreferencesVisitRecordStorage());
  runApp(DoctorApp(records: records));
}

class DoctorApp extends StatefulWidget {
  const DoctorApp({super.key, required this.records, this.initialLocale});

  /// Device-local consultation history shared by the chat and records tabs.
  final VisitRecordStore records;

  /// Forces the starting locale (tests and host overrides); otherwise the
  /// platform locale decides.
  final String? initialLocale;

  @override
  State<DoctorApp> createState() => _DoctorAppState();
}

class _DoctorAppState extends State<DoctorApp> {
  late String _locale;
  late CareAgent _agent;
  int _consultation = 0;

  @override
  void initState() {
    super.initState();
    _locale = resolveCareLocale(
      widget.initialLocale ?? WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag(),
    );
    _agent = _newAgent();
  }

  CareAgent _newAgent() =>
      createCareAgent(agentsApiBaseUrl: _agentsApiBaseUrl, getAccessToken: _hostAccessToken);

  /// Replaced by the platform host once IAM sign-in exists; null means offline.
  String? _hostAccessToken() => null;

  void _toggleLocale() {
    setState(() => _locale = _locale == 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  /// Starts a fresh consultation: a new agent instance and an empty transcript.
  /// Visit records are owned by the store and survive this action.
  void _startNewConsultation() {
    setState(() {
      _agent = _newAgent();
      _consultation += 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SDKWork Doctor',
      theme: buildDoctorTheme(),
      home: DoctorHome(
        locale: _locale,
        agent: _agent,
        records: widget.records,
        consultation: _consultation,
        onNewConsultation: _startNewConsultation,
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
    required this.records,
    required this.consultation,
    required this.onNewConsultation,
    required this.onToggleLocale,
  });

  final String locale;
  final CareAgent agent;
  final VisitRecordStore records;
  final int consultation;
  final VoidCallback onNewConsultation;
  final VoidCallback onToggleLocale;

  @override
  State<DoctorHome> createState() => _DoctorHomeState();
}

class _DoctorHomeState extends State<DoctorHome> {
  int _index = 0;

  static const List<String> _tabLabelKeys = <String>[
    'platform.care.nav.chat',
    'platform.care.nav.doctor',
    'platform.care.nav.records',
    'platform.care.nav.me',
  ];

  Future<void> _openActions() async {
    final String? action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: kSurface,
      builder: (BuildContext sheetContext) => NewConsultationSheet(
        locale: widget.locale,
        onNewConsultation: () => Navigator.pop(sheetContext, 'new'),
        onOpenRecords: () => Navigator.pop(sheetContext, 'records'),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'records') {
      setState(() => _index = 2);
      return;
    }
    widget.onNewConsultation();
    setState(() => _index = 0);
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        leading: Builder(
          builder: (BuildContext buttonContext) => IconButton(
            tooltip: careText(locale, 'platform.care.nav.menu'),
            icon: const Icon(Icons.menu),
            onPressed: () => Scaffold.of(buttonContext).openDrawer(),
          ),
        ),
        title: Text(careText(locale, _tabLabelKeys[_index])),
        actions: <Widget>[
          IconButton(
            tooltip: careText(locale, 'platform.care.action.newConsultation'),
            icon: const Icon(Icons.add),
            onPressed: _openActions,
          ),
        ],
      ),
      drawer: CareDrawer(
        agent: widget.agent,
        index: _index,
        locale: locale,
        member: demoSelfMember,
        onSelect: (int value) {
          Navigator.of(context).maybePop();
          setState(() => _index = value);
        },
        onToggleLocale: widget.onToggleLocale,
      ),
      body: IndexedStack(
        index: _index,
        children: <Widget>[
          ChatTab(
            key: ValueKey<int>(widget.consultation),
            locale: locale,
            agent: widget.agent,
            records: widget.records,
            member: demoSelfMember,
          ),
          DoctorTab(locale: locale, member: demoSelfMember),
          RecordsTab(locale: locale, records: widget.records),
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
            label: careText(locale, 'platform.care.nav.doctor'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            label: careText(locale, 'platform.care.nav.records'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            label: careText(locale, 'platform.care.nav.me'),
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

/// Flat level pill: emergency and urgent keep the warm semantic tone, every
/// other level uses the tech-blue tone. No border, no elevation.
class _LevelChip extends StatelessWidget {
  const _LevelChip({required this.label, required this.warn});

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

class ChatTab extends StatefulWidget {
  const ChatTab({
    super.key,
    required this.locale,
    required this.agent,
    required this.records,
    required this.member,
  });

  final String locale;
  final CareAgent agent;
  final VisitRecordStore records;
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
      final CareMessage reply = await widget.agent.send(text, widget.member);
      await widget.records.add(createVisitRecord(
        member: widget.member,
        symptom: text,
        advice: reply.text,
        level: reply.level,
        mode: widget.agent.mode,
      ));
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
        // The landing owns the first screen, mirroring the sdkwork-agents home.
        // Once a consultation starts, the page header carries the member and mode.
        if (_messages.isNotEmpty)
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
          child: _messages.isEmpty
              ? CareChatLanding(
                  locale: locale,
                  onPick: (String suggestion) => setState(() => _controller.text = suggestion),
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
                          message.isUser ? 'platform.care.chat.you' : 'platform.care.chat.doctor',
                        )),
                        subtitle: Text(message.text),
                        trailing: _LevelChip(
                          label: careText(locale, _levelKey(message.level)),
                          warn: message.level == TriageLevel.emergency || message.level == TriageLevel.urgent,
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

class RecordsTab extends StatelessWidget {
  const RecordsTab({super.key, required this.locale, required this.records});

  final String locale;
  final VisitRecordStore records;

  String _formatTime(String iso) {
    final DateTime? value = DateTime.tryParse(iso);
    if (value == null) return iso;
    final DateTime local = value.toLocal();
    String two(int part) => part.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
  }

  Future<void> _confirmClear(BuildContext context) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(careText(locale, 'platform.care.records.title')),
        content: Text(careText(locale, 'platform.care.records.clearConfirm')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(careText(locale, 'platform.care.records.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(careText(locale, 'platform.care.records.clear')),
          ),
        ],
      ),
    );
    if (confirmed == true) await records.clear();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: records,
      builder: (BuildContext context, Widget? _) {
        final List<VisitRecord> items = records.records;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            _PageHeader(
              title: careText(locale, 'platform.care.records.title'),
              subtitle: careText(locale, 'platform.care.records.subtitle'),
              extra: careText(
                locale,
                'platform.care.records.count',
                params: <String, String>{'count': '${items.length}'},
              ),
            ),
            Expanded(
              child: items.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        careText(locale, 'platform.care.records.empty'),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length,
                      itemBuilder: (BuildContext context, int index) {
                        final VisitRecord record = items[index];
                        return Card(
                          child: ListTile(
                            title: Text(record.symptom),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(record.advice),
                                const SizedBox(height: 4),
                                Text(
                                  '${record.memberLabel} · ${_formatTime(record.recordedAt)} · '
                                  '${careText(locale, record.mode == 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline')}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                            trailing: _LevelChip(
                              label: careText(locale, _levelKey(record.level)),
                              warn: record.level == TriageLevel.emergency || record.level == TriageLevel.urgent,
                            ),
                          ),
                        );
                      },
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.tonal(
                style: FilledButton.styleFrom(
                  backgroundColor: kSurfaceAlt,
                  foregroundColor: kTechBlueStrong,
                  elevation: 0,
                ),
                onPressed: items.isEmpty ? null : () => _confirmClear(context),
                child: Text(careText(locale, 'platform.care.records.clear')),
              ),
            ),
          ],
        );
      },
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
