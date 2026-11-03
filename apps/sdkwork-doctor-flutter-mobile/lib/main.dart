import 'dart:async';

import 'package:flutter/material.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import 'agent/care_agent.dart';
import 'bootstrap/sdkwork_tls_trust.dart';
import 'care/voice/care_voice_ports.dart';
import 'care/voice/system_care_voice_ports.dart';
import 'doctors/doctor_directory.dart';
import 'doctors/doctor_selection.dart';
import 'i18n/care_i18n.dart';
import 'patients/patient_store.dart';
import 'records/visit_store.dart';
import 'theme/doctor_theme.dart';
import 'ui/care_call_screen.dart';
import 'ui/care_shell.dart';
import 'ui/chat_tab.dart';
import 'ui/doctor_search_screen.dart';
import 'ui/doctor_tab.dart';
import 'ui/me_tab.dart';
import 'ui/records_screen.dart';

/// Agents API base URL injected by the host build; empty selects the offline
/// adapter. The access token is never a build-time value: a host shell injects
/// it after appbase IAM sign-in through [_hostAccessToken].
const String _agentsApiBaseUrl =
    String.fromEnvironment('AGENTS_API_BASE_URL', defaultValue: '');

/// Deployment doctor-directory document URL.
///
/// The browser surfaces read `careDoctorDirectoryUrl` from their runtime-env
/// document (`apps/sdkwork-doctor-h5/config/browser/runtime-env.*.example.json`
/// and the PC equivalent). That document lives outside this app root and is not
/// compiled into the Flutter binary, so this surface receives the same
/// deployment value through the build-time define it already uses for
/// `AGENTS_API_BASE_URL`: pass
/// `--dart-define=CARE_DOCTOR_DIRECTORY_URL=<url>`. Empty means no directory is
/// configured: the authored fallback roster answers and the 医生 tab says so.
const String _careDoctorDirectoryUrl =
    String.fromEnvironment('CARE_DOCTOR_DIRECTORY_URL', defaultValue: '');

Future<void> main() async {
  // The HTTPS trust layer must be installed before any HTTP client is
  // created, so it runs ahead of binding initialization and services.
  SdkworkTlsTrust.installForApp();

  WidgetsFlutterBinding.ensureInitialized();
  final VisitRecordStore records =
      await VisitRecordStore.load(SharedPreferencesVisitRecordStorage());
  final PatientProfileStore patients =
      await PatientProfileStore.load(SharedPreferencesPatientProfileStorage());
  final DoctorSelectionStore doctors = await DoctorSelectionStore.load(
      SharedPreferencesDoctorSelectionStorage());
  runApp(DoctorApp(
    records: records,
    patients: patients,
    doctors: doctors,
    directory: DoctorDirectory(directoryUrl: _careDoctorDirectoryUrl),
  ));
}

class DoctorApp extends StatefulWidget {
  const DoctorApp({
    super.key,
    required this.records,
    required this.patients,
    required this.doctors,
    this.directory,
    this.conversationService,
    this.voiceEnvironment,
    this.initialLocale,
  });

  /// Device-local consultation history shown by 看病记录.
  final VisitRecordStore records;

  /// Device-local household of patient files; the active one supplies the
  /// conversation facts.
  final PatientProfileStore patients;

  /// Device-local selection of the family's human doctors.
  final DoctorSelectionStore doctors;

  /// Deployment doctor directory; null means no directory is configured and
  /// the authored fallback roster answers.
  final DoctorDirectory? directory;

  /// Conversation transport. Null builds one from the compiled deployment
  /// (hosted when an agents API base URL and an IAM token exist, offline
  /// otherwise); tests inject a local service with in-memory storage.
  final CareConversationService? conversationService;

  /// Voice-call platform ports. Null composes the real device ports
  /// (microphone recognition, text-to-speech, camera); tests inject fakes so no
  /// widget test opens a permission dialog or touches a sensor.
  final CareVoiceCallEnvironment? voiceEnvironment;

  /// Forces the starting locale (tests and host overrides); otherwise the
  /// platform locale decides.
  final String? initialLocale;

  @override
  State<DoctorApp> createState() => _DoctorAppState();
}

class _DoctorAppState extends State<DoctorApp> {
  late String _locale;
  late final DoctorDirectory _directory;
  late final CareConversationsController _conversations;

  @override
  void initState() {
    super.initState();
    _locale = resolveCareLocale(
      widget.initialLocale ??
          WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag(),
    );
    _directory = widget.directory ?? DoctorDirectory(directoryUrl: '');
    final CareConversationService service = widget.conversationService ??
        createCareConversationService(
          agentsApiBaseUrl: _agentsApiBaseUrl,
          getAccessToken: _hostAccessToken,
          locale: () => _locale,
          localSessionTitle:
              careText(_locale, 'platform.care.sessions.defaultTitle'),
        );
    _conversations = CareConversationsController(service: service);
    // Fire and forget: the drawer renders its own loading and failure states.
    unawaited(_conversations.load());
  }

  /// Replaced by the platform host once IAM sign-in exists; null means offline.
  String? _hostAccessToken() => null;

  @override
  void dispose() {
    _conversations.dispose();
    super.dispose();
  }

  void _toggleLocale() {
    setState(() => _locale = _locale == 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SDKWork Doctor',
      theme: buildDoctorTheme(),
      home: DoctorHome(
        locale: _locale,
        conversations: _conversations,
        records: widget.records,
        patients: widget.patients,
        doctors: widget.doctors,
        directory: _directory,
        voiceEnvironment:
            widget.voiceEnvironment ?? const SystemCareVoiceCallEnvironment(),
        onToggleLocale: _toggleLocale,
      ),
    );
  }
}

/// The care shell: a session drawer, exactly four destinations (对话 / 医生 /
/// 看病记录 / 我的), and a "+" sheet that starts a consultation or opens the
/// records tab.
class DoctorHome extends StatefulWidget {
  const DoctorHome({
    super.key,
    required this.locale,
    required this.conversations,
    required this.records,
    required this.patients,
    required this.doctors,
    required this.directory,
    required this.voiceEnvironment,
    required this.onToggleLocale,
  });

  final String locale;
  final CareConversationsController conversations;
  final VisitRecordStore records;
  final PatientProfileStore patients;
  final DoctorSelectionStore doctors;
  final DoctorDirectory directory;
  final CareVoiceCallEnvironment voiceEnvironment;
  final VoidCallback onToggleLocale;

  @override
  State<DoctorHome> createState() => _DoctorHomeState();
}

class _DoctorHomeState extends State<DoctorHome> {
  int _index = 0;
  late final DoctorRosterController _roster;

  /// 医生 navbar state: the selected category tab, and the doctor the search page
  /// returned so the tab expands and scrolls to that card.
  String? _doctorCategory;
  String? _focusDoctorId;
  int _focusNonce = 0;

  static const List<String> _tabLabelKeys = <String>[
    'platform.care.nav.chat',
    'platform.care.nav.doctor',
    'platform.care.nav.records',
    'platform.care.nav.me',
  ];

  @override
  void initState() {
    super.initState();
    _roster = DoctorRosterController(widget.directory);
    _roster.addListener(_pruneSelection);
    _roster.load();
  }

  @override
  void dispose() {
    _roster.removeListener(_pruneSelection);
    _roster.dispose();
    super.dispose();
  }

  /// Drops selected doctor ids that the answered roster no longer carries.
  void _pruneSelection() {
    final DoctorRoster? roster = _roster.roster;
    if (roster == null) return;
    widget.doctors.prune(
      roster.doctors
          .map((DoctorProfile doctor) => doctor.id)
          .toList(growable: false),
    );
  }

  void _openTab(int index) {
    setState(() => _index = index);
  }

  /// Visit records are the third destination, so 我的 and the "+" sheet switch
  /// tabs instead of pushing a second copy of the screen.
  void _openRecords() => _openTab(2);

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
      _openRecords();
      return;
    }
    await widget.conversations.createNew();
    if (!mounted) return;
    _openTab(0);
  }

  /// Opens the WeChat-style doctor search page. The page returns the doctor the
  /// family tapped; the 医生 tab then shows 全部 and expands that doctor's card,
  /// so selection, details, and the consultation form stay in one place.
  Future<void> _openDoctorSearch() async {
    final DoctorRoster? roster = _roster.roster;
    final String? doctorId = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (BuildContext context) => DoctorSearchScreen(
          locale: widget.locale,
          doctors: roster?.doctors ?? const <DoctorProfile>[],
        ),
      ),
    );
    if (!mounted || doctorId == null) return;
    setState(() {
      _doctorCategory = null;
      _focusDoctorId = doctorId;
      _focusNonce += 1;
    });
  }

  /// Voice-call mode of the active care session: the full-screen call owns the
  /// microphone, the speech engine, and the camera, and every spoken turn lands
  /// in the same transcript and 看病记录 as a typed turn.
  Future<void> _openVoiceCall() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (BuildContext routeContext) => CareCallScreen(
          locale: widget.locale,
          patient: widget.patients.active,
          environment: widget.voiceEnvironment,
          conversations: widget.conversations,
          records: widget.records,
        ),
      ),
    );
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
          // Voice call sits left of the "+" so the two chat actions read as
          // "talk" then "new conversation".
          IconButton(
            tooltip: careText(locale, 'platform.care.call.open'),
            icon: const Icon(Icons.graphic_eq_rounded),
            onPressed: _openVoiceCall,
          ),
          IconButton(
            tooltip: careText(locale, 'platform.care.action.newConsultation'),
            icon: const Icon(Icons.add),
            onPressed: _openActions,
          ),
          // 医生 is the searchable directory: the navbar search icon opens the
          // search page, and the category tabs sit in the navbar bottom.
          if (_index == 1)
            IconButton(
              tooltip: careText(locale, 'platform.care.doctors.searchAction'),
              icon: const Icon(Icons.search),
              onPressed: _openDoctorSearch,
            ),
        ],
        bottom: _index == 1
            ? PreferredSize(
                preferredSize: const Size.fromHeight(44),
                child: DoctorCategoryBar(
                  locale: locale,
                  doctors: _roster.roster?.doctors ?? const <DoctorProfile>[],
                  selected: _doctorCategory,
                  onSelected: (String? key) =>
                      setState(() => _doctorCategory = key),
                ),
              )
            : null,
      ),
      drawer: CareSessionsDrawer(
        controller: widget.conversations,
        agentName: 'SDKWork Doctor',
        style: doctorSessionsDrawerStyle,
        translate: (String key,
                {Map<String, String> params = const <String, String>{}}) =>
            careText(locale, key, params: params),
        onSelected: (CareConversationSession session) => _openTab(0),
      ),
      body: IndexedStack(
        index: _index,
        children: <Widget>[
          ChatTab(
            locale: locale,
            conversations: widget.conversations,
            records: widget.records,
            patients: widget.patients,
            onOpenMe: () => _openTab(3),
          ),
          DoctorTab(
            locale: locale,
            mode: widget.conversations.mode,
            patients: widget.patients,
            records: widget.records,
            selection: widget.doctors,
            roster: _roster,
            category: _doctorCategory,
            focusDoctorId: _focusDoctorId,
            focusNonce: _focusNonce,
          ),
          RecordsScreen(
            locale: locale,
            records: widget.records,
          ),
          MeTab(
            locale: locale,
            agentMode: widget.conversations.mode,
            records: widget.records,
            patients: widget.patients,
            selection: widget.doctors,
            roster: _roster,
            onOpenDoctors: () => _openTab(1),
            onOpenRecords: _openRecords,
            onToggleLocale: widget.onToggleLocale,
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _openTab,
        destinations: <NavigationDestination>[
          NavigationDestination(
            icon: const Icon(Icons.chat_bubble_outline),
            selectedIcon: const Icon(Icons.chat_bubble),
            label: careText(locale, 'platform.care.nav.chat'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.medical_information_outlined),
            selectedIcon: const Icon(Icons.medical_information),
            label: careText(locale, 'platform.care.nav.doctor'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long),
            label: careText(locale, 'platform.care.nav.records'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: careText(locale, 'platform.care.nav.me'),
          ),
        ],
      ),
    );
  }
}
