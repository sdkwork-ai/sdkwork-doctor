import 'package:flutter/material.dart';

import '../agent/care_agent.dart' show kFamilyDoctorAgentId;
import '../doctors/doctor_browse.dart';
import '../doctors/doctor_directory.dart';
import '../doctors/doctor_labels.dart';
import '../doctors/doctor_selection.dart';
import '../family.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';

/// The category strip the doctor tab puts in the navbar (AppBar bottom).
///
/// It is 全部 plus one tab per department the published roster actually
/// practises in, so a deployment document adds its own category without a code
/// change. The tab scrolls horizontally like the WeChat mobile service tabs and
/// keeps the active one underlined in tech blue.
class DoctorCategoryBar extends StatelessWidget {
  const DoctorCategoryBar({
    super.key,
    required this.locale,
    required this.doctors,
    required this.selected,
    required this.onSelected,
  });

  final String locale;
  final List<DoctorProfile> doctors;

  /// Selected category key; `null` is 全部.
  final String? selected;

  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final List<String> keys = doctorCategoryKeys(doctors);
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        children: <Widget>[
          _CategoryTab(
            label: careText(locale, 'platform.care.doctors.category.all'),
            selected: selected == null,
            onTap: () => onSelected(null),
          ),
          for (final String key in keys)
            _CategoryTab(
              label: doctorCategoryLabel(locale, doctors, key),
              selected: selected == key,
              onTap: () => onSelected(key),
            ),
        ],
      ),
    );
  }
}

class _CategoryTab extends StatelessWidget {
  const _CategoryTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? kTechBlueStrong : kMuted,
              ),
            ),
            const SizedBox(height: 6),
            Container(
              height: 3,
              width: 18,
              decoration: BoxDecoration(
                color: selected ? kTechBlue : Colors.transparent,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 医生: the deployment's doctor directory, the AI family-doctor status, and the
/// family's selected human doctors.
///
/// Search and the category tabs live in the navbar (`main.dart`), not in this
/// page: tapping the navbar search icon opens [DoctorSearchScreen], and the
/// category the navbar selected filters this list. A family selects one or more
/// doctors and names a primary doctor; a human consultation is started from one
/// practice site's configured channel and is always recorded against the active
/// patient with `mode: 'human'`, naming the organization, site, and engagement
/// that was used.
class DoctorTab extends StatefulWidget {
  const DoctorTab({
    super.key,
    required this.locale,
    required this.mode,
    required this.patients,
    required this.records,
    required this.selection,
    required this.roster,
    this.category,
    this.focusDoctorId,
    this.focusNonce = 0,
  });

  final String locale;

  /// Conversation mode of the care agent (`hosted` or `offline`), owned by the
  /// session controller and shown on the AI card.
  final String mode;
  final PatientProfileStore patients;
  final VisitRecordStore records;
  final DoctorSelectionStore selection;

  /// The roster the shell loaded once for every tab that shows doctors.
  final DoctorRosterController roster;

  /// Category key chosen in the navbar; `null` means 全部.
  final String? category;

  /// Doctor the search page returned, expanded and scrolled into view.
  final String? focusDoctorId;

  /// Bumped by the shell on every search result so the same doctor can be
  /// focused twice in a row.
  final int focusNonce;

  @override
  State<DoctorTab> createState() => _DoctorTabState();
}

class _DoctorTabState extends State<DoctorTab> {
  late final Listenable _listenable;
  final TextEditingController _reason = TextEditingController();

  /// The practice site chosen per doctor; absent means the primary affiliation.
  final Map<String, String> _chosenOrganization = <String, String>{};

  /// One key per directory card so a search result can be scrolled into view.
  final Map<String, GlobalKey> _cardKeys = <String, GlobalKey>{};

  String? _expandedId;
  String? _notice;
  String? _error;

  @override
  void initState() {
    super.initState();
    _listenable = Listenable.merge(<Listenable>[
      widget.roster,
      widget.selection,
      widget.patients,
    ]);
    _expandedId = widget.focusDoctorId;
    if (widget.focusDoctorId != null) _revealLater(widget.focusDoctorId);
  }

  @override
  void didUpdateWidget(covariant DoctorTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusNonce != oldWidget.focusNonce &&
        widget.focusDoctorId != null) {
      setState(() => _expandedId = widget.focusDoctorId);
      _revealLater(widget.focusDoctorId);
    }
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  String get _locale => widget.locale;

  GlobalKey _cardKey(String doctorId) =>
      _cardKeys.putIfAbsent(doctorId, () => GlobalKey());

  /// Scrolls the focused doctor card into view after the list rebuilt.
  void _revealLater(String? doctorId) {
    if (doctorId == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final BuildContext? card = _cardKeys[doctorId]?.currentContext;
      if (card == null) return;
      Scrollable.ensureVisible(
        card,
        duration: const Duration(milliseconds: 250),
        alignment: 0.08,
      );
    });
  }

  DoctorAffiliation? _siteFor(DoctorProfile doctor) {
    final String? chosen = _chosenOrganization[doctor.id];
    if (chosen == null) return primaryAffiliation(doctor);
    return affiliationByOrganization(doctor, chosen) ??
        primaryAffiliation(doctor);
  }

  Future<void> _startConsultation(DoctorProfile doctor) async {
    final DoctorAffiliation? affiliation = _siteFor(doctor);
    final String reason = _reason.text.trim();
    final DoctorChannel? channel = preferredDoctorChannel(affiliation);
    final PatientProfile? patient = widget.patients.active;
    setState(() {
      _notice = null;
      _error = null;
    });
    if (reason.isEmpty) {
      setState(() => _error =
          careText(_locale, 'platform.care.doctors.consultReasonRequired'));
      return;
    }
    if (affiliation == null || channel == null) {
      setState(
          () => _error = careText(_locale, 'platform.care.doctors.noChannel'));
      return;
    }
    if (patient == null) {
      setState(
          () => _error = careText(_locale, 'platform.care.chat.noPatient'));
      return;
    }
    // The channel cannot be opened from this app: the Flutter surface ships no
    // url_launcher (adding a dependency is out of scope here), so the started
    // consultation is recorded and confirmed while `channel.target` stays the
    // host's to launch.
    final String started = careText(
      _locale,
      'platform.care.doctors.consultStarted',
      params: <String, String>{'doctor': doctor.displayName},
    );
    try {
      await widget.records.add(createHumanVisitRecord(
        member: FamilyMember.fromPatient(patient),
        reason: reason,
        advice: started,
        doctorId: doctor.id,
        doctorLabel:
            '${doctor.displayName} · ${careDepartmentLabel(_locale, affiliation)}',
        doctorOrganizationId: affiliation.organizationId,
        doctorHospitalLabel: careHospitalLabel(_locale, affiliation),
        doctorEmploymentType: affiliation.employmentType.wireName,
      ));
      if (!mounted) return;
      setState(() {
        _notice = started;
        _reason.clear();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = careText(
            _locale,
            'platform.care.doctors.consultFailed',
            params: <String, String>{'message': '$error'},
          ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final String locale = _locale;
    return AnimatedBuilder(
      animation: _listenable,
      builder: (BuildContext context, Widget? _) {
        final DoctorRoster? roster = widget.roster.roster;
        final DoctorSelectionState selection = widget.selection.state;
        final List<DoctorProfile> selected = roster == null
            ? const <DoctorProfile>[]
            : resolveSelectedDoctors(roster, selection);
        final PatientProfile? active = widget.patients.active;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            // The directory leads: the navbar carries the title, the search
            // entry, and the category tabs; the AI and family-doctor summaries
            // follow it.
            _DirectoryCard(
              locale: locale,
              roster: roster,
              loading: widget.roster.loading,
              selection: selection,
              category: widget.category,
              expandedId: _expandedId,
              reasonController: _reason,
              notice: _notice,
              error: _error,
              siteFor: _siteFor,
              cardKey: _cardKey,
              onChooseAffiliation: (String doctorId, String organizationId) =>
                  setState(
                      () => _chosenOrganization[doctorId] = organizationId),
              onToggleSelect: widget.selection.toggle,
              onSetPrimary: widget.selection.setPrimary,
              onToggleDetail: (String id) =>
                  setState(() => _expandedId = _expandedId == id ? null : id),
              onConsult: _startConsultation,
            ),
            _AiDoctorCard(locale: locale, mode: widget.mode),
            _MyDoctorsCard(
              locale: locale,
              selected: selected,
              primaryId: selection.primaryId,
              activePatientLabel:
                  active == null ? null : carePatientLabel(locale, active),
              onSetPrimary: widget.selection.setPrimary,
              onDeselect: widget.selection.deselect,
            ),
          ],
        );
      },
    );
  }
}

class _AiDoctorCard extends StatelessWidget {
  const _AiDoctorCard({required this.locale, required this.mode});

  final String locale;
  final String mode;

  @override
  Widget build(BuildContext context) {
    final bool hosted = mode == 'hosted';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    careText(locale, 'platform.care.doctors.ai'),
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600, color: kInk),
                  ),
                ),
                CareBadge(
                  label: careText(
                    locale,
                    hosted
                        ? 'platform.care.doctors.aiHosted'
                        : 'platform.care.doctors.aiOffline',
                  ),
                  neutral: !hosted,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              careText(locale, 'platform.care.doctors.aiHint'),
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
            const SizedBox(height: 8),
            Text(
              kFamilyDoctorAgentId,
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _MyDoctorsCard extends StatelessWidget {
  const _MyDoctorsCard({
    required this.locale,
    required this.selected,
    required this.primaryId,
    required this.activePatientLabel,
    required this.onSetPrimary,
    required this.onDeselect,
  });

  final String locale;
  final List<DoctorProfile> selected;
  final String? primaryId;
  final String? activePatientLabel;
  final Future<void> Function(String id) onSetPrimary;
  final Future<void> Function(String id) onDeselect;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              careText(locale, 'platform.care.doctors.mine'),
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600, color: kInk),
            ),
            const SizedBox(height: 4),
            Text(
              careText(locale, 'platform.care.doctors.chooseHint'),
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
            const SizedBox(height: 8),
            if (selected.isEmpty)
              Text(
                careText(locale, 'platform.care.doctors.none'),
                style: const TextStyle(color: kMuted),
              )
            else
              for (final DoctorProfile doctor in selected)
                _MineRow(
                  locale: locale,
                  doctor: doctor,
                  primary: doctor.id == primaryId,
                  onSetPrimary: () => onSetPrimary(doctor.id),
                  onDeselect: () => onDeselect(doctor.id),
                ),
            if (activePatientLabel != null && selected.isNotEmpty)
              Text(
                '${careText(locale, 'platform.care.doctors.primary')}: '
                '$activePatientLabel',
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
          ],
        ),
      ),
    );
  }
}

class _MineRow extends StatelessWidget {
  const _MineRow({
    required this.locale,
    required this.doctor,
    required this.primary,
    required this.onSetPrimary,
    required this.onDeselect,
  });

  final String locale;
  final DoctorProfile doctor;
  final bool primary;
  final VoidCallback onSetPrimary;
  final VoidCallback onDeselect;

  @override
  Widget build(BuildContext context) {
    final DoctorAffiliation? site = primaryAffiliation(doctor);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          CareDoctorAvatar(
            name: doctor.displayName,
            avatarUrl: doctor.avatarUrl,
            size: 44,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Flexible(
                      child: Text(
                        doctor.displayName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: kInk,
                        ),
                      ),
                    ),
                    if (primary) ...<Widget>[
                      const SizedBox(width: 8),
                      CareBadge(
                        label:
                            careText(locale, 'platform.care.doctors.primary'),
                      ),
                    ],
                  ],
                ),
                if (site != null) ...<Widget>[
                  Text(
                    careAffiliationSummary(locale, site),
                    style: const TextStyle(fontSize: 12, color: kMuted),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: <Widget>[
                      CareBadge(
                        label: careText(
                            locale, careEmploymentKey(site.employmentType)),
                        neutral: true,
                      ),
                      if (!site.acceptingNewPatients)
                        CareBadge(
                          label: careText(
                              locale, 'platform.care.doctors.notAccepting'),
                          warn: true,
                        ),
                      if (doctor.affiliations.length > 1)
                        CareBadge(
                          label: careText(
                            locale,
                            'platform.care.doctors.otherAffiliations',
                            params: <String, String>{
                              'count': '${doctor.affiliations.length - 1}',
                            },
                          ),
                          neutral: true,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (!primary)
            TextButton(
              onPressed: onSetPrimary,
              child: Text(careText(locale, 'platform.care.doctors.setPrimary')),
            ),
          IconButton(
            tooltip: careText(locale, 'platform.care.doctors.clear'),
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: onDeselect,
          ),
        ],
      ),
    );
  }
}

class _DirectoryCard extends StatefulWidget {
  const _DirectoryCard({
    required this.locale,
    required this.roster,
    required this.loading,
    required this.selection,
    required this.category,
    required this.expandedId,
    required this.reasonController,
    required this.notice,
    required this.error,
    required this.siteFor,
    required this.cardKey,
    required this.onChooseAffiliation,
    required this.onToggleSelect,
    required this.onSetPrimary,
    required this.onToggleDetail,
    required this.onConsult,
  });

  final String locale;
  final DoctorRoster? roster;
  final bool loading;
  final DoctorSelectionState selection;
  final String? category;
  final String? expandedId;
  final TextEditingController reasonController;
  final String? notice;
  final String? error;
  final DoctorAffiliation? Function(DoctorProfile doctor) siteFor;
  final GlobalKey Function(String doctorId) cardKey;
  final void Function(String doctorId, String organizationId)
      onChooseAffiliation;
  final Future<void> Function(String id) onToggleSelect;
  final Future<void> Function(String id) onSetPrimary;
  final ValueChanged<String> onToggleDetail;
  final Future<void> Function(DoctorProfile doctor) onConsult;

  @override
  State<_DirectoryCard> createState() => _DirectoryCardState();
}

/// The directory card: the roster filtered by the navbar category. Search is a
/// navbar action that opens its own page, so this card no longer carries a
/// search field or a second category strip.
class _DirectoryCardState extends State<_DirectoryCard> {
  List<DoctorProfile> get _doctors =>
      widget.roster?.doctors ?? const <DoctorProfile>[];

  @override
  Widget build(BuildContext context) {
    final List<DoctorProfile> doctors = _doctors;
    final bool fromDirectory =
        widget.roster?.source == DoctorRosterSource.directory;
    final List<DoctorProfile> visible = browseDoctors(
      locale: widget.locale,
      doctors: doctors,
      category: widget.category,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              careText(widget.locale, 'platform.care.doctors.directory'),
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600, color: kInk),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: <Widget>[
                CareBadge(
                  label: careText(
                    widget.locale,
                    fromDirectory
                        ? 'platform.care.doctors.source.directory'
                        : 'platform.care.doctors.source.catalog',
                  ),
                  neutral: !fromDirectory,
                ),
                Text(
                  careText(
                    widget.locale,
                    'platform.care.doctors.count',
                    params: <String, String>{
                      'count': '${widget.selection.selectedIds.length}',
                    },
                  ),
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
                Text(
                  careText(
                    widget.locale,
                    'platform.care.doctors.limit',
                    params: <String, String>{'count': '$kDoctorSelectionLimit'},
                  ),
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
              ],
            ),
            if (widget.notice != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  widget.notice!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: kTechBlueStrong,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            if (widget.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  widget.error!,
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ),
            const SizedBox(height: 8),
            if (widget.loading && doctors.isEmpty)
              Text(
                careText(widget.locale, 'platform.care.doctors.loading'),
                style: const TextStyle(color: kMuted),
              )
            else if (doctors.isEmpty)
              Text(
                careText(widget.locale, 'platform.care.doctors.empty'),
                style: const TextStyle(color: kMuted),
              )
            else ...<Widget>[
              Text(
                careText(
                  widget.locale,
                  'platform.care.doctors.results',
                  params: <String, String>{'count': '${visible.length}'},
                ),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
              const SizedBox(height: 6),
              if (visible.isEmpty)
                Text(
                  careText(widget.locale, 'platform.care.doctors.noResults'),
                  style: const TextStyle(color: kMuted),
                )
              else
                for (final DoctorProfile doctor in visible)
                  _DoctorCard(
                    key: widget.cardKey(doctor.id),
                    locale: widget.locale,
                    doctor: doctor,
                    site: widget.siteFor(doctor),
                    selected: widget.selection.isSelected(doctor.id),
                    primary: widget.selection.primaryId == doctor.id,
                    selectionFull: widget.selection.selectedIds.length >=
                        kDoctorSelectionLimit,
                    expanded: widget.expandedId == doctor.id,
                    reasonController: widget.reasonController,
                    onChooseAffiliation: (String organizationId) =>
                        widget.onChooseAffiliation(doctor.id, organizationId),
                    onToggleSelect: () => widget.onToggleSelect(doctor.id),
                    onSetPrimary: () => widget.onSetPrimary(doctor.id),
                    onToggleDetail: () => widget.onToggleDetail(doctor.id),
                    onConsult: () => widget.onConsult(doctor),
                  ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DoctorCard extends StatelessWidget {
  const _DoctorCard({
    super.key,
    required this.locale,
    required this.doctor,
    required this.site,
    required this.selected,
    required this.primary,
    required this.selectionFull,
    required this.expanded,
    required this.reasonController,
    required this.onChooseAffiliation,
    required this.onToggleSelect,
    required this.onSetPrimary,
    required this.onToggleDetail,
    required this.onConsult,
  });

  final String locale;
  final DoctorProfile doctor;

  /// The practice site this card describes and would consult at.
  final DoctorAffiliation? site;
  final bool selected;
  final bool primary;
  final bool selectionFull;
  final bool expanded;
  final TextEditingController reasonController;
  final ValueChanged<String> onChooseAffiliation;
  final VoidCallback onToggleSelect;
  final VoidCallback onSetPrimary;
  final VoidCallback onToggleDetail;
  final VoidCallback onConsult;

  @override
  Widget build(BuildContext context) {
    final DoctorChannel? channel = preferredDoctorChannel(site);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kCanvas,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              CareDoctorAvatar(
                name: doctor.displayName,
                avatarUrl: doctor.avatarUrl,
                size: 48,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      doctor.displayName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: kInk,
                      ),
                    ),
                    if (site != null)
                      Text(
                        '${careTitleLabel(locale, site!)} · '
                        '${careDepartmentLabel(locale, site!)} · '
                        '${careHospitalLabel(locale, site!)}',
                        style: const TextStyle(fontSize: 12, color: kMuted),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  CareBadge(
                    label: careText(
                      locale,
                      doctor.verified
                          ? 'platform.care.doctors.verified'
                          : 'platform.care.doctors.unverified',
                    ),
                    neutral: !doctor.verified,
                  ),
                  const SizedBox(height: 4),
                  if (site != null)
                    CareBadge(
                      label: careText(
                        locale,
                        site!.acceptingNewPatients
                            ? 'platform.care.doctors.accepting'
                            : 'platform.care.doctors.notAccepting',
                      ),
                      warn: !site!.acceptingNewPatients,
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: <Widget>[
              if (site != null)
                CareBadge(
                  label:
                      careText(locale, careEmploymentKey(site!.employmentType)),
                  neutral: true,
                ),
              if (doctor.affiliations.length > 1)
                CareBadge(
                  label: careText(
                    locale,
                    'platform.care.doctors.otherAffiliations',
                    params: <String, String>{
                      'count': '${doctor.affiliations.length - 1}',
                    },
                  ),
                  neutral: true,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${careText(locale, 'platform.care.doctors.specialties')}: '
            '${careSpecialtiesLabel(locale, doctor.specialties)}',
            style: const TextStyle(fontSize: 12, color: kInk),
          ),
          const SizedBox(height: 4),
          Text(
            '${careText(locale, 'platform.care.doctors.experience', params: <String, String>{
                  'count': '${doctor.yearsOfExperience}'
                })}'
            ' · ${careText(locale, 'platform.care.doctors.languages')}: '
            '${careListLabel(locale, doctor.languages)}'
            ' · ${careText(locale, 'platform.care.doctors.availability')}: '
            '${careAvailabilityLabel(locale, site)}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              FilledButton.tonal(
                style: FilledButton.styleFrom(
                  backgroundColor: kSurfaceAlt,
                  foregroundColor: kTechBlueStrong,
                  elevation: 0,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                ),
                onPressed: !selected && selectionFull ? null : onToggleSelect,
                child: Text(careText(
                  locale,
                  selected
                      ? 'platform.care.doctors.selected'
                      : 'platform.care.doctors.select',
                )),
              ),
              if (selected && !primary)
                TextButton(
                  onPressed: onSetPrimary,
                  child: Text(
                      careText(locale, 'platform.care.doctors.setPrimary')),
                ),
              TextButton(
                onPressed: onToggleDetail,
                child: Text(careText(locale, 'platform.care.doctors.detail')),
              ),
            ],
          ),
          if (expanded) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              doctor.bio,
              style: const TextStyle(fontSize: 12, color: kInk),
            ),
            const SizedBox(height: 12),
            Text(
              careText(locale, 'platform.care.doctors.affiliations'),
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: kInk,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              careText(locale, 'platform.care.doctors.affiliationsHint'),
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
            const SizedBox(height: 8),
            for (final DoctorAffiliation affiliation in doctor.affiliations)
              _AffiliationTile(
                locale: locale,
                affiliation: affiliation,
                chosen: site != null &&
                    affiliation.organizationId == site!.organizationId,
                onChoose: () => onChooseAffiliation(affiliation.organizationId),
              ),
            const SizedBox(height: 8),
            Text(
              channel == null
                  ? careText(locale, 'platform.care.doctors.noChannel')
                  : careText(
                      locale,
                      'platform.care.doctors.consultHint',
                      params: <String, String>{
                        'doctor': doctor.displayName,
                        'channel':
                            careText(locale, careChannelLabelKey(channel.kind)),
                      },
                    ),
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: reasonController,
              minLines: 1,
              maxLines: 3,
              decoration: InputDecoration(
                labelText:
                    careText(locale, 'platform.care.doctors.consultReason'),
                hintText:
                    careText(locale, 'platform.care.doctors.consultReason'),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: channel == null ? null : onConsult,
              child: Text(careText(locale, 'platform.care.doctors.consult')),
            ),
          ],
        ],
      ),
    );
  }
}

/// One practice site inside the expanded doctor detail. Choosing it makes the
/// consultation use that site's channels, organization, and engagement.
class _AffiliationTile extends StatelessWidget {
  const _AffiliationTile({
    required this.locale,
    required this.affiliation,
    required this.chosen,
    required this.onChoose,
  });

  final String locale;
  final DoctorAffiliation affiliation;
  final bool chosen;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: chosen ? kTechBlueSoft : kSurface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  careHospitalLabel(locale, affiliation),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: kInk,
                  ),
                ),
              ),
              CareBadge(
                label: careText(
                    locale, careEmploymentKey(affiliation.employmentType)),
                neutral: true,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${careTitleLabel(locale, affiliation)} · '
            '${careDepartmentLabel(locale, affiliation)}',
            style: const TextStyle(fontSize: 12, color: kInk),
          ),
          Text(
            '${careText(locale, 'platform.care.doctors.organization')}: '
            '${affiliation.organizationId}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          Text(
            '${careText(locale, 'platform.care.doctors.hospitalCode')}: '
            '${affiliation.hospitalCode}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          Text(
            '${careText(locale, 'platform.care.doctors.availability')}: '
            '${careAvailabilityLabel(locale, affiliation)}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          if (affiliation.since.isNotEmpty)
            Text(
              careText(
                locale,
                'platform.care.doctors.since',
                params: <String, String>{'since': affiliation.since},
              ),
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
          const SizedBox(height: 6),
          ChoiceChip(
            label: Text(
                careText(locale, 'platform.care.doctors.chooseAffiliation')),
            selected: chosen,
            onSelected: (_) => onChoose(),
          ),
        ],
      ),
    );
  }
}
