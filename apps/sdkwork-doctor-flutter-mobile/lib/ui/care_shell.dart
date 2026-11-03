import 'package:flutter/material.dart';

import '../i18n/care_i18n.dart';
import '../theme/doctor_theme.dart';

/// Shell building blocks shared by the home surface: the chat-first landing and
/// the "+" action sheet. They mirror the sdkwork-agents home chrome (menu /
/// centered title / single primary action) while keeping the Doctor copy and
/// care-specific actions. The drawer itself is the care package's session list.
class CareChatLanding extends StatelessWidget {
  const CareChatLanding(
      {super.key, required this.locale, required this.onPick});

  final String locale;
  final ValueChanged<String> onPick;

  static const List<String> suggestionKeys = <String>[
    'platform.care.suggest.fever',
    'platform.care.suggest.chestPain',
    'platform.care.suggest.medication',
    'platform.care.suggest.dizziness',
  ];

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              careText(locale, 'platform.care.home.prompt'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: kInk,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              careText(locale, 'platform.care.home.promptHint'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: kMuted, fontSize: 13),
            ),
            const SizedBox(height: 24),
            for (final String key in suggestionKeys)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => onPick(careText(locale, key)),
                    style: TextButton.styleFrom(
                      backgroundColor: kTechBlueSoft,
                      foregroundColor: kTechBlueStrong,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 15),
                      shape: const StadiumBorder(),
                      alignment: Alignment.center,
                    ),
                    child: Text(
                      careText(locale, key),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Right-hand "+": start a fresh consultation, or open 看病记录.
class NewConsultationSheet extends StatelessWidget {
  const NewConsultationSheet({
    super.key,
    required this.locale,
    required this.onNewConsultation,
    required this.onOpenRecords,
  });

  final String locale;
  final VoidCallback onNewConsultation;
  final VoidCallback onOpenRecords;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              careText(locale, 'platform.care.action.newConsultation'),
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600, color: kInk),
            ),
            const SizedBox(height: 6),
            Text(
              careText(locale, 'platform.care.action.newConsultationHint'),
              style: const TextStyle(fontSize: 12, color: kMuted),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onNewConsultation,
              icon: const Icon(Icons.add_comment_outlined),
              label: Text(
                  careText(locale, 'platform.care.action.newConsultation')),
            ),
            const SizedBox(height: 8),
            FilledButton.tonalIcon(
              style: FilledButton.styleFrom(
                  backgroundColor: kSurfaceAlt,
                  foregroundColor: kTechBlueStrong),
              onPressed: onOpenRecords,
              icon: const Icon(Icons.receipt_long_outlined),
              label: Text(careText(locale, 'platform.care.records.title')),
            ),
          ],
        ),
      ),
    );
  }
}
