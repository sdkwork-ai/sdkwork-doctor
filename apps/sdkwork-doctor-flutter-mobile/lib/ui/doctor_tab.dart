import 'package:flutter/material.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../agent/care_agent.dart' show kFamilyDoctorAgentId;
import '../doctors/doctor_browse.dart';
import '../doctors/doctor_directory.dart';
import '../doctors/doctor_labels.dart';
import '../doctors/doctor_selection.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';
import 'doctor_detail_screen.dart';

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
/// The tab is a browse surface. Search lives in the navbar and opens
/// [DoctorSearchScreen]; a card opens [DoctorDetailScreen]. Every fact and every
/// action about one clinician (sites, hours, channels, selection, the
/// consultation form) belongs to the detail page, so nothing expands inside a
/// list row.
class DoctorTab extends StatefulWidget {
  const DoctorTab({
    super.key,
    required this.locale,
    required this.conversations,
    required this.mode,
    required this.patients,
    required this.records,
    required this.selection,
    required this.roster,
    this.category,
    this.onOpenChat,
  });

  final String locale;

  /// Conversation controller; a consultation opens a human conversation on it.
  final CareConversationsController conversations;

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

  /// Switches the shell to the conversation home after a consultation opens.
  final VoidCallback? onOpenChat;

  @override
  State<DoctorTab> createState() => _DoctorTabState();
}

class _DoctorTabState extends State<DoctorTab> {
  late final Listenable _listenable;

  @override
  void initState() {
    super.initState();
    _listenable = Listenable.merge(<Listenable>[
      widget.roster,
      widget.selection,
      widget.patients,
    ]);
  }

  void _openDoctor(DoctorProfile doctor) {
    final NavigatorState navigator = Navigator.of(context);
    navigator.push<void>(MaterialPageRoute<void>(
      builder: (BuildContext context) => DoctorDetailScreen(
        locale: widget.locale,
        doctor: doctor,
        conversations: widget.conversations,
        selection: widget.selection,
        records: widget.records,
        patients: widget.patients,
        onStarted: () {
          navigator.popUntil((Route<void> route) => route.isFirst);
          widget.onOpenChat?.call();
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
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
            _DirectoryCard(
              locale: locale,
              roster: roster,
              loading: widget.roster.loading,
              selection: selection,
              category: widget.category,
              onOpen: _openDoctor,
              onToggleSelect: widget.selection.toggle,
              onSetPrimary: widget.selection.setPrimary,
            ),
            _AiDoctorCard(locale: locale, mode: widget.mode),
            _MyDoctorsCard(
              locale: locale,
              selected: selected,
              primaryId: selection.primaryId,
              activePatientLabel:
                  active == null ? null : carePatientLabel(locale, active),
              onOpen: _openDoctor,
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
    required this.onOpen,
    required this.onSetPrimary,
    required this.onDeselect,
  });

  final String locale;
  final List<DoctorProfile> selected;
  final String? primaryId;
  final String? activePatientLabel;
  final ValueChanged<DoctorProfile> onOpen;
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
                  onOpen: () => onOpen(doctor),
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
    required this.onOpen,
    required this.onSetPrimary,
    required this.onDeselect,
  });

  final String locale;
  final DoctorProfile doctor;
  final bool primary;
  final VoidCallback onOpen;
  final VoidCallback onSetPrimary;
  final VoidCallback onDeselect;

  @override
  Widget build(BuildContext context) {
    final DoctorAffiliation? site = primaryAffiliation(doctor);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
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
                          label: careText(
                            locale,
                            'platform.care.doctors.primary',
                          ),
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
                child:
                    Text(careText(locale, 'platform.care.doctors.setPrimary')),
              ),
            IconButton(
              tooltip: careText(locale, 'platform.care.doctors.clear'),
              icon: const Icon(Icons.remove_circle_outline),
              onPressed: onDeselect,
            ),
          ],
        ),
      ),
    );
  }
}

class _DirectoryCard extends StatelessWidget {
  const _DirectoryCard({
    required this.locale,
    required this.roster,
    required this.loading,
    required this.selection,
    required this.category,
    required this.onOpen,
    required this.onToggleSelect,
    required this.onSetPrimary,
  });

  final String locale;
  final DoctorRoster? roster;
  final bool loading;
  final DoctorSelectionState selection;
  final String? category;
  final ValueChanged<DoctorProfile> onOpen;
  final Future<void> Function(String id) onToggleSelect;
  final Future<void> Function(String id) onSetPrimary;

  @override
  Widget build(BuildContext context) {
    final List<DoctorProfile> doctors =
        roster?.doctors ?? const <DoctorProfile>[];
    final bool fromDirectory = roster?.source == DoctorRosterSource.directory;
    final List<DoctorProfile> visible = browseDoctors(
      locale: locale,
      doctors: doctors,
      category: category,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              careText(locale, 'platform.care.doctors.directory'),
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
                    locale,
                    fromDirectory
                        ? 'platform.care.doctors.source.directory'
                        : 'platform.care.doctors.source.catalog',
                  ),
                  neutral: !fromDirectory,
                ),
                Text(
                  careText(
                    locale,
                    'platform.care.doctors.count',
                    params: <String, String>{
                      'count': '${selection.selectedIds.length}',
                    },
                  ),
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
                Text(
                  careText(
                    locale,
                    'platform.care.doctors.limit',
                    params: <String, String>{'count': '$kDoctorSelectionLimit'},
                  ),
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (loading && doctors.isEmpty)
              Text(
                careText(locale, 'platform.care.doctors.loading'),
                style: const TextStyle(color: kMuted),
              )
            else if (doctors.isEmpty)
              Text(
                careText(locale, 'platform.care.doctors.empty'),
                style: const TextStyle(color: kMuted),
              )
            else ...<Widget>[
              Text(
                careText(
                  locale,
                  'platform.care.doctors.results',
                  params: <String, String>{'count': '${visible.length}'},
                ),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
              const SizedBox(height: 8),
              if (visible.isEmpty)
                Text(
                  careText(locale, 'platform.care.doctors.noResults'),
                  style: const TextStyle(color: kMuted),
                )
              else
                for (final DoctorProfile doctor in visible)
                  _DoctorCard(
                    key: Key('doctor-card-${doctor.id}'),
                    locale: locale,
                    doctor: doctor,
                    selected: selection.isSelected(doctor.id),
                    primary: selection.primaryId == doctor.id,
                    selectionFull:
                        selection.selectedIds.length >= kDoctorSelectionLimit,
                    onOpen: () => onOpen(doctor),
                    onToggleSelect: () => onToggleSelect(doctor.id),
                    onSetPrimary: () => onSetPrimary(doctor.id),
                  ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One clinician in the directory. Tapping the card opens the detail page; the
/// card itself only carries the facts a family scans for (portrait, rank, site,
/// focus, availability) and the selection shortcut.
class _DoctorCard extends StatelessWidget {
  const _DoctorCard({
    super.key,
    required this.locale,
    required this.doctor,
    required this.selected,
    required this.primary,
    required this.selectionFull,
    required this.onOpen,
    required this.onToggleSelect,
    required this.onSetPrimary,
  });

  final String locale;
  final DoctorProfile doctor;
  final bool selected;
  final bool primary;
  final bool selectionFull;
  final VoidCallback onOpen;
  final VoidCallback onToggleSelect;
  final VoidCallback onSetPrimary;

  @override
  Widget build(BuildContext context) {
    final DoctorAffiliation? site = primaryAffiliation(doctor);
    final String availability = careAvailabilityLabel(locale, site);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: kCanvas,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    CareDoctorAvatar(
                      name: doctor.displayName,
                      avatarUrl: doctor.avatarUrl,
                      size: 60,
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
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: kInk,
                                  ),
                                ),
                              ),
                              if (primary) ...<Widget>[
                                const SizedBox(width: 8),
                                CareBadge(
                                  label: careText(
                                    locale,
                                    'platform.care.doctors.primary',
                                  ),
                                ),
                              ],
                            ],
                          ),
                          if (site != null) ...<Widget>[
                            const SizedBox(height: 2),
                            Text(
                              '${careTitleLabel(locale, site)} · '
                              '${careDepartmentLabel(locale, site)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: kMuted,
                              ),
                            ),
                            Text(
                              careHospitalLabel(locale, site),
                              style: const TextStyle(
                                fontSize: 12,
                                color: kMuted,
                              ),
                            ),
                          ],
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
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
                              if (site != null)
                                CareBadge(
                                  label: careText(
                                    locale,
                                    site.acceptingNewPatients
                                        ? 'platform.care.doctors.accepting'
                                        : 'platform.care.doctors.notAccepting',
                                  ),
                                  warn: !site.acceptingNewPatients,
                                ),
                              if (site != null)
                                CareBadge(
                                  label: careText(
                                    locale,
                                    careEmploymentKey(site.employmentType),
                                  ),
                                  neutral: true,
                                ),
                              if (doctor.affiliations.length > 1)
                                CareBadge(
                                  label: careText(
                                    locale,
                                    'platform.care.doctors.otherAffiliations',
                                    params: <String, String>{
                                      'count':
                                          '${doctor.affiliations.length - 1}',
                                    },
                                  ),
                                  neutral: true,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, size: 22, color: kMuted),
                  ],
                ),
                if (doctor.specialties.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 10),
                  Text(
                    '${careText(locale, 'platform.care.doctors.specialties')}: '
                    '${careSpecialtiesLabel(locale, doctor.specialties)}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: kInk),
                  ),
                ],
                if (site != null) ...<Widget>[
                  const SizedBox(height: 4),
                  Text(
                    '${careText(locale, 'platform.care.doctors.availability')}: '
                    '$availability',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: kMuted),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        '${careText(locale, 'platform.care.doctors.experience', params: <String, String>{
                              'count': '${doctor.yearsOfExperience}'
                            })}'
                        ' · ${careListLabel(locale, doctor.languages)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: kMuted),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.tonal(
                      style: FilledButton.styleFrom(
                        backgroundColor: kSurfaceAlt,
                        foregroundColor: kTechBlueStrong,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        textStyle: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      onPressed:
                          !selected && selectionFull ? null : onToggleSelect,
                      child: Text(careText(
                        locale,
                        selected
                            ? 'platform.care.doctors.selected'
                            : 'platform.care.doctors.select',
                      )),
                    ),
                    if (selected && !primary) ...<Widget>[
                      const SizedBox(width: 4),
                      TextButton(
                        style: TextButton.styleFrom(
                          minimumSize: Size.zero,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 6),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          textStyle: const TextStyle(fontSize: 12),
                        ),
                        onPressed: onSetPrimary,
                        child: Text(
                          careText(locale, 'platform.care.doctors.setPrimary'),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
