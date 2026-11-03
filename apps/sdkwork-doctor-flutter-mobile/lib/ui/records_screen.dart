import 'package:flutter/material.dart';

import '../i18n/care_i18n.dart';
import '../records/visit_store.dart';
import '../theme/doctor_theme.dart';
import '../triage.dart';
import 'care_widgets.dart';

/// 看病记录: every consultation on this device, newest first.
///
/// It is the third destination of the tab bar, so it renders as tab content with
/// no app bar and no way back; 我的 and the "+" sheet switch to this tab instead
/// of pushing a second copy.
class RecordsScreen extends StatelessWidget {
  const RecordsScreen({
    super.key,
    required this.locale,
    required this.records,
  });

  final String locale;
  final VisitRecordStore records;

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
            CarePageHeader(
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
                        final String modeLabel =
                            careText(locale, careModeKey(record.mode));
                        final String doctorSuffix = record.mode == 'human' &&
                                (record.doctorLabel ?? '').isNotEmpty
                            ? ' · ${record.doctorLabel}'
                            : '';
                        final List<String> siteFacts = <String>[
                          if ((record.doctorHospitalLabel ?? '').isNotEmpty)
                            '${careText(locale, 'platform.care.records.hospital')}: '
                                '${record.doctorHospitalLabel}',
                          if ((record.doctorEmploymentType ?? '').isNotEmpty)
                            '${careText(locale, 'platform.care.records.employment')}: '
                                '${careEmploymentLabel(locale, record.doctorEmploymentType)}',
                        ];
                        return Card(
                          child: ListTile(
                            title: Text(record.symptom),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(record.advice),
                                const SizedBox(height: 4),
                                Text(
                                  '${record.memberLabel} · '
                                  '${careFormatTime(record.recordedAt)} · '
                                  '$modeLabel$doctorSuffix',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                if (siteFacts.isNotEmpty)
                                  Text(
                                    siteFacts.join(' · '),
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                              ],
                            ),
                            trailing: CareLevelChip(
                              label:
                                  careText(locale, careLevelKey(record.level)),
                              warn: record.level == TriageLevel.emergency ||
                                  record.level == TriageLevel.urgent,
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
