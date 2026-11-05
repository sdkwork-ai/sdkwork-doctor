import 'package:flutter/material.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

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

/// 医生搜索: the search page the doctor tab's navbar opens.
///
/// The interaction follows the WeChat mobile search page: the search field sits
/// in the app bar and takes focus immediately, a cancel action leaves the page,
/// results appear while typing, and tapping a result opens that doctor's detail
/// page on top of the results.
class DoctorSearchScreen extends StatefulWidget {
  const DoctorSearchScreen({
    super.key,
    required this.locale,
    required this.doctors,
    required this.conversations,
    required this.selection,
    required this.records,
    required this.patients,
    this.onOpenChat,
  });

  final String locale;
  final List<DoctorProfile> doctors;

  /// Conversation controller; a consultation opens a human conversation on it.
  final CareConversationsController conversations;
  final DoctorSelectionStore selection;
  final VisitRecordStore records;
  final PatientProfileStore patients;

  /// Switches the shell to the conversation home after a consultation opens.
  final VoidCallback? onOpenChat;

  @override
  State<DoctorSearchScreen> createState() => _DoctorSearchScreenState();
}

class _DoctorSearchScreenState extends State<DoctorSearchScreen> {
  final TextEditingController _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _cancel() => Navigator.of(context).pop();

  void _open(DoctorProfile doctor) {
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
    final String query = _query.text.trim();
    final List<DoctorProfile> results = query.isEmpty
        ? const <DoctorProfile>[]
        : browseDoctors(
            locale: locale,
            doctors: widget.doctors,
            query: query,
          );
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        centerTitle: false,
        titleSpacing: 12,
        title: TextField(
          controller: _query,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: (String _) => setState(() {}),
          decoration: InputDecoration(
            isDense: true,
            // WeChat keeps the field as a quiet grey pill: the shared theme's
            // blue focus ring would read as a button in the navbar.
            hintText: careText(locale, 'platform.care.doctors.searchAction'),
            prefixIcon: const Icon(Icons.search, size: 20, color: kMuted),
            prefixIconConstraints: const BoxConstraints(minWidth: 38),
            suffixIcon: query.isEmpty
                ? null
                : IconButton(
                    tooltip: careText(locale, 'platform.care.action.cancel'),
                    icon: const Icon(Icons.cancel, size: 18, color: kMuted),
                    onPressed: () => setState(_query.clear),
                  ),
            enabledBorder: const OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
              borderSide: BorderSide.none,
            ),
            focusedBorder: const OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
              borderSide: BorderSide.none,
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: _cancel,
            child: Text(careText(locale, 'platform.care.action.cancel')),
          ),
        ],
      ),
      body: query.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  careText(locale, 'platform.care.doctors.searchHint'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: kMuted),
                ),
              ),
            )
          : results.isEmpty
              ? Center(
                  child: Text(
                    careText(locale, 'platform.care.doctors.noResults'),
                    style: const TextStyle(fontSize: 13, color: kMuted),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.only(top: 4),
                  children: <Widget>[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                      child: Text(
                        careText(
                          locale,
                          'platform.care.doctors.results',
                          params: <String, String>{
                            'count': '${results.length}',
                          },
                        ),
                        style: const TextStyle(fontSize: 12, color: kMuted),
                      ),
                    ),
                    for (final DoctorProfile doctor in results)
                      _SearchResultRow(
                        locale: locale,
                        doctor: doctor,
                        onOpen: () => _open(doctor),
                      ),
                  ],
                ),
    );
  }
}

/// One search hit: portrait, name, the primary practice site, and focus areas.
class _SearchResultRow extends StatelessWidget {
  const _SearchResultRow({
    required this.locale,
    required this.doctor,
    required this.onOpen,
  });

  final String locale;
  final DoctorProfile doctor;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final DoctorAffiliation? site = primaryAffiliation(doctor);
    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: <Widget>[
            CareDoctorAvatar(
              name: doctor.displayName,
              avatarUrl: doctor.avatarUrl,
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
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: kInk,
                          ),
                        ),
                      ),
                      if (doctor.verified) ...<Widget>[
                        const SizedBox(width: 6),
                        CareBadge(
                          label: careText(
                            locale,
                            'platform.care.doctors.verified',
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (site != null) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(
                      careAffiliationSummary(locale, site),
                      style: const TextStyle(fontSize: 12, color: kMuted),
                    ),
                  ],
                  if (doctor.specialties.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(
                      careSpecialtiesLabel(locale, doctor.specialties),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: kMuted),
                    ),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 20, color: kMuted),
          ],
        ),
      ),
    );
  }
}
