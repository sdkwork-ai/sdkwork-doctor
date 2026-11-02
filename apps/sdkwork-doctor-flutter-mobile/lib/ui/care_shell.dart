import 'package:flutter/material.dart';

import '../agent/care_agent.dart';
import '../family.dart';
import '../i18n/care_i18n.dart';
import '../theme/doctor_theme.dart';

/// Shell building blocks shared by the home surface: the chat-first landing, the
/// left drawer, and the "+" action sheet. They mirror the sdkwork-agents home
/// chrome (menu / centered title / single primary action) while keeping the
/// Doctor copy and care-specific actions.
class CareChatLanding extends StatelessWidget {
  const CareChatLanding({super.key, required this.locale, required this.onPick});

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
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
                      shape: const StadiumBorder(),
                      alignment: Alignment.center,
                    ),
                    child: Text(
                      careText(locale, key),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
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

/// Left drawer: identity, block navigation, locale, and the active mode.
class CareDrawer extends StatelessWidget {
  const CareDrawer({
    super.key,
    required this.agent,
    required this.index,
    required this.locale,
    required this.member,
    required this.onSelect,
    required this.onToggleLocale,
  });

  final CareAgent agent;
  final int index;
  final String locale;
  final FamilyMember member;
  final ValueChanged<int> onSelect;
  final VoidCallback onToggleLocale;

  static const List<(IconData, String)> _items = <(IconData, String)>[
    (Icons.chat_bubble_outline, 'platform.care.nav.chat'),
    (Icons.medical_information_outlined, 'platform.care.nav.doctor'),
    (Icons.receipt_long_outlined, 'platform.care.nav.records'),
    (Icons.person_outline, 'platform.care.nav.me'),
  ];

  @override
  Widget build(BuildContext context) {
    final String modeLabel = careText(
      locale,
      agent.mode == 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline',
    );
    return Drawer(
      backgroundColor: kSurface,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
              child: Row(
                children: <Widget>[
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: kTechBlue, borderRadius: BorderRadius.circular(12)),
                    alignment: Alignment.center,
                    child: const Text('D', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        const Text('SDKWork Doctor', style: TextStyle(fontWeight: FontWeight.w600, color: kInk)),
                        Text(member.label, style: const TextStyle(fontSize: 12, color: kMuted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: kTechBlueSoft, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    modeLabel,
                    style: const TextStyle(fontSize: 12, color: kTechBlueStrong, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            for (int i = 0; i < _items.length; i += 1)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                child: ListTile(
                  selected: index == i,
                  selectedTileColor: kTechBlueSoft,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  leading: Icon(_items[i].$1, color: index == i ? kTechBlueStrong : kMuted),
                  title: Text(
                    careText(locale, _items[i].$2),
                    style: TextStyle(
                      color: index == i ? kTechBlueStrong : kInk,
                      fontWeight: index == i ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                  onTap: () => onSelect(i),
                ),
              ),
            const Spacer(),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.translate, color: kMuted),
              title: Text(careText(locale, 'platform.care.language.label')),
              trailing: Text(
                locale == 'zh-CN' ? '中文' : 'English',
                style: const TextStyle(color: kMuted, fontSize: 12),
              ),
              onTap: onToggleLocale,
            ),
            ListTile(
              leading: const Icon(Icons.shield_outlined, color: kMuted),
              title: Text(
                careText(locale, 'platform.care.privacy.local'),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Right-hand "+": start a fresh consultation, or jump to the records block.
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
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: kInk),
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
              label: Text(careText(locale, 'platform.care.action.newConsultation')),
            ),
            const SizedBox(height: 8),
            FilledButton.tonalIcon(
              style: FilledButton.styleFrom(backgroundColor: kSurfaceAlt, foregroundColor: kTechBlueStrong),
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
