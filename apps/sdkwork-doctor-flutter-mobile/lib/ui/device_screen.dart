import 'dart:io';

import 'package:flutter/material.dart';

import '../i18n/care_i18n.dart';
import '../theme/doctor_theme.dart';
import 'care_widgets.dart';

/// 设备环境: the local runtime facts this surface can honestly report — the
/// platform, the catalog locale, the conversation transport — plus the privacy
/// statement. No health data is read or shown here.
class DeviceScreen extends StatelessWidget {
  const DeviceScreen({
    super.key,
    required this.locale,
    required this.mode,
  });

  final String locale;
  final String mode;

  Widget _fact(IconData icon, String label) {
    return Row(
      children: <Widget>[
        Icon(icon, size: 18, color: kMuted),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 14, color: kInk),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(careText(locale, 'platform.care.me.device')),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: <Widget>[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    careText(locale, 'platform.care.me.deviceHint'),
                    style: const TextStyle(
                        fontSize: 12, color: kMuted, height: 1.5),
                  ),
                  const SizedBox(height: 14),
                  _fact(Icons.devices_outlined, Platform.operatingSystem),
                  const SizedBox(height: 10),
                  _fact(Icons.translate, locale == 'zh-CN' ? '中文' : 'English'),
                  const SizedBox(height: 10),
                  Row(
                    children: <Widget>[
                      const Icon(Icons.graphic_eq_rounded,
                          size: 18, color: kMuted),
                      const SizedBox(width: 10),
                      CareBadge(
                        label: careText(locale, careModeKey(mode)),
                        neutral: true,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                careText(locale, 'platform.care.privacy.local'),
                style: const TextStyle(fontSize: 12, color: kMuted),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
