import 'package:flutter/material.dart';

import 'agent/care_agent.dart';
import 'bootstrap/sdkwork_tls_trust.dart';
import 'doctors/doctor_directory.dart';
import 'doctors/doctor_selection.dart';
import 'i18n/care_i18n.dart';
import 'patients/patient_store.dart';
import 'records/visit_store.dart';
import 'theme/doctor_theme.dart';
import 'ui/care_shell.dart';
import 'ui/chat_tab.dart';
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
  final DoctorSelectionStore doctors =
      await DoctorSelectionStore.load(SharedPreferencesDoctorSelectionStorage());
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

  /// Forces the starting locale (tests and host overrides); otherwise the
  /// platform locale decides.
  final String? initialLocale;

  @override
  State<DoctorApp> createState() => _DoctorAppState();
}

class _DoctorAppState extends State<DoctorApp> {
  late String _locale;
  late CareAgent _agent;
  late final DoctorDirectory _directory;
  int _consultation = 0;

  @override
  void initState() {
    super.initState();
    _locale = resolveCareLocale(
      widget.initialLocale ??
          WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag(),
    );
    _agent = _newAgent();
    _directory = widget.directory ?? DoctorDirectory(directoryUrl: '');
  }

  CareAgent _newAgent() => createCareAgent(
      agentsApiBaseUrl: _agentsApiBaseUrl, getAccessToken: _hostAccessToken);

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
        patients: widget.patients,
        doctors: widget.doctors,
        directory: _directory,
        consultation: _consultation,
        onNewConsultation: _startNewConsultation,
        onToggleLocale: _toggleLocale,
      ),
    );
  }
}

/// The care shell: a drawer, exactly three destinations (对话 / 医生 / 我的),
/// and a "+" sheet that starts a consultation or opens 看病记录.
class DoctorHome extends StatefulWidget {
  const DoctorHome({
    super.key,
    required this.locale,
    required this.agent,
    required this.records,
    required this.patients,
    required this.doctors,
    required this.directory,
    required this.consultation,
    required this.onNewConsultation,
    required this.onToggleLocale,
  });

  final String locale;
  final CareAgent agent;
  final VisitRecordStore records;
  final PatientProfileStore patients;
  final DoctorSelectionStore doctors;
  final DoctorDirectory directory;
  final int consultation;
  final VoidCallback onNewConsultation;
  final VoidCallback onToggleLocale;

  @override
  State<DoctorHome> createState() => _DoctorHomeState();
}

class _DoctorHomeState extends State<DoctorHome> {
  int _index = 0;
  late final DoctorRosterController _roster;

  static const List<String> _tabLabelKeys = <String>[
    'platform.care.nav.chat',
    'platform.care.nav.doctor',
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

  Future<void> _openRecords() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (BuildContext _) => RecordsScreen(
        locale: widget.locale,
        records: widget.records,
      ),
    ));
  }

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
      await _openRecords();
      return;
    }
    widget.onNewConsultation();
    _openTab(0);
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
      drawer: AnimatedBuilder(
        animation: widget.patients,
        builder: (BuildContext context, Widget? _) => CareDrawer(
          agent: widget.agent,
          index: _index,
          locale: locale,
          patient: widget.patients.active,
          onSelect: (int value) {
            Navigator.of(context).maybePop();
            _openTab(value);
          },
          onToggleLocale: widget.onToggleLocale,
        ),
      ),
      body: IndexedStack(
        index: _index,
        children: <Widget>[
          ChatTab(
            key: ValueKey<int>(widget.consultation),
            locale: locale,
            agent: widget.agent,
            records: widget.records,
            patients: widget.patients,
            onOpenMe: () => _openTab(2),
          ),
          DoctorTab(
            locale: locale,
            agent: widget.agent,
            patients: widget.patients,
            records: widget.records,
            selection: widget.doctors,
            roster: _roster,
          ),
          MeTab(
            locale: locale,
            agentMode: widget.agent.mode,
            records: widget.records,
            patients: widget.patients,
            selection: widget.doctors,
            roster: _roster,
            onOpenDoctors: () => _openTab(1),
            onOpenRecords: _openRecords,
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
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: careText(locale, 'platform.care.nav.me'),
          ),
        ],
      ),
    );
  }
}
