import 'package:flutter/material.dart';

import '../i18n/care_i18n.dart';
import '../theme/doctor_theme.dart';

/// Shell building blocks shared by the home surface: the chat-first landing and
/// the "+" action menu. They mirror the sdkwork-agents home chrome (menu /
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

/// One destination of the right-hand "+" menu.
enum CareShellAction {
  /// Starts a fresh care consultation.
  newConsultation,

  /// Opens 看病记录 as the records tab.
  records,

  /// Opens the 扫一扫 QR scanner.
  scan,
}

/// Right-hand "+": a WeChat-style dropdown anchored under the plus.
///
/// A tap opens a compact dark menu with one row per destination instead of a
/// bottom sheet, so the choices appear under the button that opened them.
class CareActionMenu extends StatelessWidget {
  const CareActionMenu({
    super.key,
    required this.locale,
    required this.onSelected,
  });

  /// Catalog locale of the menu labels.
  final String locale;

  /// Receives the row the user tapped, after the menu closes.
  final ValueChanged<CareShellAction> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<CareShellAction>(
      tooltip: careText(locale, 'platform.care.action.more'),
      icon: const Icon(Icons.add),
      position: PopupMenuPosition.under,
      offset: const Offset(0, 4),
      color: kChromeNavy,
      elevation: 8,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      onSelected: onSelected,
      itemBuilder: (BuildContext context) => <PopupMenuEntry<CareShellAction>>[
        _item(CareShellAction.newConsultation, Icons.add_comment_outlined,
            'platform.care.action.newConsultation'),
        _item(CareShellAction.records, Icons.receipt_long_outlined,
            'platform.care.records.title'),
        const PopupMenuDivider(height: 1, color: Colors.white12),
        _item(CareShellAction.scan, Icons.qr_code_scanner,
            'platform.care.action.scan'),
      ],
    );
  }

  PopupMenuItem<CareShellAction> _item(
      CareShellAction action, IconData icon, String labelKey) {
    return PopupMenuItem<CareShellAction>(
      value: action,
      height: 48,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 20, color: kChromeInk),
          const SizedBox(width: 12),
          Text(
            careText(locale, labelKey),
            style: const TextStyle(
              color: kChromeInk,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
