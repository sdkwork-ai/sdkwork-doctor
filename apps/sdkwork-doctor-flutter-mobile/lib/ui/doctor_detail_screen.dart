import 'package:flutter/material.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../doctors/doctor_directory.dart';
import '../doctors/doctor_labels.dart';
import '../doctors/doctor_selection.dart';
import '../family.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';

/// 医生详情: everything about one clinician, opened from the directory card or
/// from a search result.
///
/// The directory stays a browse surface: this page owns the portrait and
/// credentials, the focus areas, the practice sites with their own consulting
/// hours, the channels the family can actually use, and the consultation form.
/// Selection state is read from the shared [DoctorSelectionStore], so marking a
/// doctor primary here is the same act as in the list.
class DoctorDetailScreen extends StatefulWidget {
  const DoctorDetailScreen({
    super.key,
    required this.locale,
    required this.doctor,
    required this.conversations,
    required this.selection,
    required this.records,
    required this.patients,
    this.onStarted,
  });

  final String locale;
  final DoctorProfile doctor;

  /// Conversation controller; a consultation opens a human conversation on it.
  final CareConversationsController conversations;
  final DoctorSelectionStore selection;
  final VisitRecordStore records;
  final PatientProfileStore patients;

  /// Navigates to the conversation home after the consultation was opened.
  final VoidCallback? onStarted;

  @override
  State<DoctorDetailScreen> createState() => _DoctorDetailScreenState();
}

class _DoctorDetailScreenState extends State<DoctorDetailScreen> {
  /// Practice site this consultation would use; the primary affiliation first.
  late String _organizationId;
  String? _notice;
  String? _error;

  DoctorProfile get _doctor => widget.doctor;
  String get _locale => widget.locale;

  @override
  void initState() {
    super.initState();
    _organizationId = primaryAffiliation(_doctor)?.organizationId ?? '';
  }

  DoctorAffiliation? get _site =>
      affiliationByOrganization(_doctor, _organizationId) ??
      primaryAffiliation(_doctor);

  void _chooseSite(DoctorAffiliation affiliation) {
    setState(() {
      _organizationId = affiliation.organizationId;
      _error = null;
    });
  }

  Future<void> _toggleSelection() async {
    if (!widget.selection.isSelected(_doctor.id) &&
        widget.selection.selectedIds.length >= kDoctorSelectionLimit) {
      setState(() => _error = careText(
            _locale,
            'platform.care.doctors.limit',
            params: <String, String>{'count': '$kDoctorSelectionLimit'},
          ));
      return;
    }
    await widget.selection.toggle(_doctor.id);
  }

  Future<void> _setPrimary() => widget.selection.setPrimary(_doctor.id);

  /// The consultation sheet. It returns the chosen site and the reason, and the
  /// page records the visit so every entry point shares one write path.
  String? _activePatientLabel() {
    final PatientProfile? patient = widget.patients.active;
    return patient == null ? null : carePatientLabel(_locale, patient);
  }

  Future<void> _openConsultSheet() async {
    final _ConsultRequest? request =
        await showModalBottomSheet<_ConsultRequest>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: kSurface,
      builder: (BuildContext sheetContext) => _ConsultSheet(
        locale: _locale,
        doctor: _doctor,
        initialOrganizationId: _organizationId,
        activePatientLabel: _activePatientLabel(),
      ),
    );
    if (request == null || !mounted) return;
    setState(() {
      _organizationId = request.organizationId;
      _error = null;
    });
    await _recordConsultation(request);
  }

  Future<void> _recordConsultation(_ConsultRequest request) async {
    final DoctorAffiliation? site = affiliationByOrganization(
          _doctor,
          request.organizationId,
        ) ??
        _site;
    final PatientProfile? patient = widget.patients.active;
    if (site == null) {
      setState(
          () => _error = careText(_locale, 'platform.care.doctors.noChannel'));
      return;
    }
    if (patient == null) {
      setState(
          () => _error = careText(_locale, 'platform.care.chat.noPatient'));
      return;
    }
    final String started = careText(
      _locale,
      'platform.care.doctors.consultStarted',
      params: <String, String>{'doctor': _doctor.displayName},
    );
    try {
      // The consultation is a conversation: open the session addressed to this
      // doctor, then land on the conversation home.
      await widget.conversations.startHumanConsultation(
        doctor: CareConversationDoctor.human(
          id: _doctor.id,
          displayName: _doctor.displayName,
          department: careDepartmentLabel(_locale, site),
        ),
        memberLabel: carePatientLabel(_locale, patient),
        reason: request.reason,
      );
      await widget.records.add(createHumanVisitRecord(
        member: FamilyMember.fromPatient(patient),
        reason: request.reason,
        advice: started,
        doctorId: _doctor.id,
        doctorLabel:
            '${_doctor.displayName} · ${careDepartmentLabel(_locale, site)}',
        doctorOrganizationId: site.organizationId,
        doctorHospitalLabel: careHospitalLabel(_locale, site),
        doctorEmploymentType: site.employmentType.wireName,
      ));
      if (!mounted) return;
      setState(() {
        _notice = started;
        _error = null;
      });
      widget.onStarted?.call();
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
      animation: widget.selection,
      builder: (BuildContext context, Widget? _) {
        final bool selected = widget.selection.isSelected(_doctor.id);
        final bool primary = widget.selection.primaryId == _doctor.id;
        final DoctorAffiliation? site = _site;
        final DoctorChannel? channel = preferredDoctorChannel(site);
        return Scaffold(
          appBar: AppBar(
            centerTitle: true,
            title: Text(careText(locale, 'platform.care.doctors.detail')),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: <Widget>[
              if (_notice != null) _banner(_notice!, warn: false),
              if (_error != null) _banner(_error!, warn: true),
              _header(locale, primary: primary, site: site),
              const SizedBox(height: 20),
              if (_doctor.bio.isNotEmpty) ...<Widget>[
                _sectionTitle(careText(locale, 'platform.care.doctors.about')),
                const SizedBox(height: 6),
                Text(
                  _doctor.bio,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.55,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 20),
              ],
              if (_doctor.specialties.isNotEmpty) ...<Widget>[
                _sectionTitle(
                  careText(locale, 'platform.care.doctors.specialties'),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    for (final String specialty in _doctor.specialties)
                      CareBadge(
                        label: careSpecialtyLabel(locale, specialty),
                        neutral: true,
                      ),
                  ],
                ),
                const SizedBox(height: 20),
              ],
              _sectionTitle(
                careText(locale, 'platform.care.doctors.affiliations'),
              ),
              const SizedBox(height: 4),
              Text(
                careText(locale, 'platform.care.doctors.affiliationsHint'),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
              const SizedBox(height: 10),
              for (final DoctorAffiliation affiliation in _doctor.affiliations)
                _SiteCard(
                  locale: locale,
                  affiliation: affiliation,
                  chosen: site != null &&
                      affiliation.organizationId == site.organizationId,
                  onChoose: () => _chooseSite(affiliation),
                ),
              const SizedBox(height: 8),
              _channelNote(locale, site, channel),
            ],
          ),
          bottomNavigationBar: _actionBar(
            locale: locale,
            selected: selected,
            primary: primary,
            channel: channel,
          ),
        );
      },
    );
  }

  Widget _header(
    String locale, {
    required bool primary,
    required DoctorAffiliation? site,
  }) {
    final String? title = site == null ? null : careTitleLabel(locale, site);
    final String? department =
        site == null ? null : careDepartmentLabel(locale, site);
    final String role = <String>[
      if (title != null && title.isNotEmpty) title,
      if (department != null && department.isNotEmpty) department,
    ].join(' · ');
    return Column(
      children: <Widget>[
        CareDoctorAvatar(
          name: _doctor.displayName,
          avatarUrl: _doctor.avatarUrl,
          size: 92,
        ),
        const SizedBox(height: 12),
        Text(
          _doctor.displayName,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: kInk,
          ),
        ),
        if (role.isNotEmpty) ...<Widget>[
          const SizedBox(height: 4),
          Text(
            role,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: kMuted),
          ),
        ],
        if (site != null) ...<Widget>[
          const SizedBox(height: 2),
          Text(
            careHospitalLabel(locale, site),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: kMuted),
          ),
        ],
        const SizedBox(height: 10),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: <Widget>[
            if (primary)
              CareBadge(
                  label: careText(locale, 'platform.care.doctors.primary')),
            CareBadge(
              label: careText(
                locale,
                _doctor.verified
                    ? 'platform.care.doctors.verified'
                    : 'platform.care.doctors.unverified',
              ),
              neutral: !_doctor.verified,
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
                label: careText(locale, careEmploymentKey(site.employmentType)),
                neutral: true,
              ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          '${careText(locale, 'platform.care.doctors.experience', params: <String, String>{
                'count': '${_doctor.yearsOfExperience}'
              })}'
          ' · ${careText(locale, 'platform.care.doctors.languages')}: '
          '${careListLabel(locale, _doctor.languages)}',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: kMuted),
        ),
      ],
    );
  }

  Widget _channelNote(
    String locale,
    DoctorAffiliation? site,
    DoctorChannel? channel,
  ) {
    if (site == null || channel == null) {
      return Text(
        careText(locale, 'platform.care.doctors.noChannel'),
        style: const TextStyle(fontSize: 12, color: kMuted),
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(_channelIcon(channel.kind), size: 18, color: kTechBlueStrong),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            careText(
              locale,
              'platform.care.doctors.consultHint',
              params: <String, String>{
                'doctor': _doctor.displayName,
                'channel': careText(locale, careChannelLabelKey(channel.kind)),
              },
            ),
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
        ),
      ],
    );
  }

  Widget _actionBar({
    required String locale,
    required bool selected,
    required bool primary,
    required DoctorChannel? channel,
  }) {
    final bool full =
        widget.selection.selectedIds.length >= kDoctorSelectionLimit;
    final Widget secondary;
    if (!selected) {
      secondary = FilledButton.tonal(
        key: const Key('doctor-detail-select'),
        style: FilledButton.styleFrom(
          backgroundColor: kSurfaceAlt,
          foregroundColor: kTechBlueStrong,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        ),
        onPressed: full ? null : _toggleSelection,
        child: Text(careText(locale, 'platform.care.doctors.select')),
      );
    } else if (!primary) {
      secondary = FilledButton.tonal(
        key: const Key('doctor-detail-primary'),
        style: FilledButton.styleFrom(
          backgroundColor: kSurfaceAlt,
          foregroundColor: kTechBlueStrong,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        ),
        onPressed: _setPrimary,
        child: Text(careText(locale, 'platform.care.doctors.setPrimary')),
      );
    } else {
      secondary = FilledButton.tonal(
        style: FilledButton.styleFrom(
          backgroundColor: kSurfaceAlt,
          foregroundColor: kMuted,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        ),
        onPressed: null,
        child: Text(careText(locale, 'platform.care.doctors.selected')),
      );
    }
    return Container(
      color: kSurface,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          children: <Widget>[
            secondary,
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                key: const Key('doctor-detail-consult'),
                onPressed: _openConsultSheet,
                child: Text(
                  careText(locale, 'platform.care.doctors.consult'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _banner(String text, {required bool warn}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: warn ? const Color(0xFFFFF4E0) : kTechBlueSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: warn ? const Color(0xFFB26A00) : kTechBlueStrong,
        ),
      ),
    );
  }

  Widget _sectionTitle(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: kInk,
        ),
      );
}

IconData _channelIcon(DoctorChannelKind kind) {
  switch (kind) {
    case DoctorChannelKind.video:
      return Icons.videocam_outlined;
    case DoctorChannelKind.phone:
      return Icons.call_outlined;
    case DoctorChannelKind.messaging:
      return Icons.chat_bubble_outline;
    case DoctorChannelKind.clinic:
      return Icons.local_hospital_outlined;
  }
}

/// One practice site, selectable. The chosen site decides the organization,
/// hospital, and channel a consultation is recorded against.
class _SiteCard extends StatelessWidget {
  const _SiteCard({
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: chosen ? kTechBlueSoft : kSurface,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onChoose,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        careHospitalLabel(locale, affiliation),
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: kInk,
                        ),
                      ),
                    ),
                    if (chosen) ...<Widget>[
                      const Icon(Icons.check_circle,
                          size: 20, color: kTechBlue),
                      const SizedBox(width: 6),
                    ],
                    CareBadge(
                      label: careText(
                        locale,
                        careEmploymentKey(affiliation.employmentType),
                      ),
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
                const SizedBox(height: 2),
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
                const SizedBox(height: 4),
                Text(
                  <String>[
                    affiliation.organizationId,
                    if (affiliation.hospitalCode.isNotEmpty)
                      affiliation.hospitalCode,
                  ].join(' · '),
                  style: const TextStyle(fontSize: 11, color: kMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// What the consultation sheet returns.
class _ConsultRequest {
  const _ConsultRequest({required this.organizationId, required this.reason});

  final String organizationId;
  final String reason;
}

/// The consultation form. It only collects the site and the reason; the detail
/// page validates the patient and the channel and writes the visit record.
class _ConsultSheet extends StatefulWidget {
  const _ConsultSheet({
    required this.locale,
    required this.doctor,
    required this.initialOrganizationId,
    required this.activePatientLabel,
  });

  final String locale;
  final DoctorProfile doctor;
  final String initialOrganizationId;

  /// The patient the consultation would be recorded against, or null.
  final String? activePatientLabel;

  @override
  State<_ConsultSheet> createState() => _ConsultSheetState();
}

class _ConsultSheetState extends State<_ConsultSheet> {
  final TextEditingController _reason = TextEditingController();
  late String _organizationId = widget.initialOrganizationId;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  DoctorAffiliation? get _site =>
      affiliationByOrganization(widget.doctor, _organizationId) ??
      primaryAffiliation(widget.doctor);

  void _submit() {
    final String reason = _reason.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = careText(
            widget.locale,
            'platform.care.doctors.consultReasonRequired',
          ));
      return;
    }
    final DoctorAffiliation? site = _site;
    if (site == null) {
      setState(() => _error = careText(
            widget.locale,
            'platform.care.doctors.detail',
          ));
      return;
    }
    Navigator.of(context).pop(_ConsultRequest(
      organizationId: site.organizationId,
      reason: reason,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    final DoctorAffiliation? site = _site;
    final DoctorChannel? channel = preferredDoctorChannel(site);
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        bottom: 20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            careText(locale, 'platform.care.doctors.consultSheet'),
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: kInk,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            site == null
                ? widget.doctor.displayName
                : '${widget.doctor.displayName} · ${careHospitalLabel(locale, site)}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          if (widget.doctor.affiliations.length > 1) ...<Widget>[
            const SizedBox(height: 12),
            Text(
              careText(locale, 'platform.care.doctors.chooseAffiliation'),
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: kInk,
              ),
            ),
            const SizedBox(height: 4),
            for (final DoctorAffiliation affiliation
                in widget.doctor.affiliations)
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => setState(
                    () => _organizationId = affiliation.organizationId),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: <Widget>[
                      Icon(
                        affiliation.organizationId == _organizationId
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                        size: 18,
                        color: affiliation.organizationId == _organizationId
                            ? kTechBlue
                            : kMuted,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          careHospitalLabel(locale, affiliation),
                          style: const TextStyle(fontSize: 13, color: kInk),
                        ),
                      ),
                      CareBadge(
                        label: careText(
                          locale,
                          careEmploymentKey(affiliation.employmentType),
                        ),
                        neutral: true,
                      ),
                    ],
                  ),
                ),
              ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            minLines: 2,
            maxLines: 4,
            autofocus: true,
            decoration: InputDecoration(
              labelText:
                  careText(locale, 'platform.care.doctors.consultReason'),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            channel == null
                ? careText(locale, 'platform.care.doctors.noChannel')
                : careText(
                    locale,
                    'platform.care.doctors.consultHint',
                    params: <String, String>{
                      'doctor': widget.doctor.displayName,
                      'channel':
                          careText(locale, careChannelLabelKey(channel.kind)),
                    },
                  ),
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          const SizedBox(height: 4),
          Text(
            widget.activePatientLabel == null
                ? careText(locale, 'platform.care.chat.noPatient')
                : '${careText(locale, 'platform.care.chat.patient')}: '
                    '${widget.activePatientLabel}',
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                _error!,
                style: const TextStyle(fontSize: 12, color: kDanger),
              ),
            ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('doctor-consult-submit'),
              onPressed:
                  widget.activePatientLabel == null ? null : _submit,
              child: Text(careText(locale, 'platform.care.doctors.consult')),
            ),
          ),
        ],
      ),
    );
  }
}
