import 'package:flutter/material.dart';

import '../care/attachment_picker.dart';
import '../i18n/care_i18n.dart';
import '../theme/doctor_theme.dart';

/// Keys and copy of the composer's attachment popup.
///
/// The popup answers one question — where does this attachment come from — so
/// every test can address the three choices by key instead of by translated
/// label.
class CareAttachmentSheet extends StatelessWidget {
  const CareAttachmentSheet({super.key, required this.locale});

  final String locale;

  /// Root key of the popup, so a test can tell it apart from the sheet chrome.
  static const Key sheetKey = Key('care-attachment-sheet');

  static const Key cameraKey = Key('care-attachment-camera');
  static const Key mediaKey = Key('care-attachment-media');
  static const Key filesKey = Key('care-attachment-files');

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Semantics(
          container: true,
          namesRoute: true,
          label: careText(locale, 'platform.care.chat.attach'),
          child: Column(
            key: sheetKey,
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // The sheet's own drag affordance, in the chrome's ink rather than
              // the light canvas ink the theme would pick on navy.
              Center(
                child: Container(
                  width: 32,
                  height: 4,
                  margin: const EdgeInsets.only(top: 10, bottom: 14),
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _tile(
                      context,
                      key: cameraKey,
                      icon: Icons.photo_camera_outlined,
                      label: careText(locale, 'platform.care.chat.attachCamera'),
                      source: CareAttachmentSource.camera,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _tile(
                      context,
                      key: mediaKey,
                      icon: Icons.photo_library_outlined,
                      label: careText(locale, 'platform.care.chat.attachMedia'),
                      source: CareAttachmentSource.media,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _tile(
                      context,
                      key: filesKey,
                      icon: Icons.attach_file_rounded,
                      label: careText(locale, 'platform.care.chat.attachFile'),
                      source: CareAttachmentSource.files,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// One equal-width choice: icon above label, the whole tile tappable.
  Widget _tile(
    BuildContext context, {
    required Key key,
    required IconData icon,
    required String label,
    required CareAttachmentSource source,
  }) {
    return Material(
      color: Colors.white.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        key: key,
        borderRadius: BorderRadius.circular(16),
        // The caller closes the sheet with the chosen source.
        onTap: () => Navigator.of(context).pop(source),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 26, color: kChromeInk),
              const SizedBox(height: 10),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: kChromeInk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Opens the composer's "+" popup and resolves to the chosen source.
///
/// Returns null when the patient dismissed the popup without choosing, so the
/// caller opens no system picker in that case.
Future<CareAttachmentSource?> showCareAttachmentSheet({
  required BuildContext context,
  required String locale,
}) {
  return showModalBottomSheet<CareAttachmentSource>(
    context: context,
    // The sheet draws its own drag handle so it stays legible on the dark
    // chrome colour; the route handle would follow the light theme's ink.
    showDragHandle: false,
    // Dark navy, like the shell's own "+" menu: the popup belongs to the
    // chrome, not to the light transcript under it.
    backgroundColor: kChromeNavy,
    barrierColor: Colors.black.withValues(alpha: 0.45),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (BuildContext sheetContext) =>
        CareAttachmentSheet(locale: locale),
  );
}
