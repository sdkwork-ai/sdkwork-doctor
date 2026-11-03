import 'care_messages.dart';

/// Reads one care string for [locale], falling back to en-US and then the key.
String careText(String locale, String key,
    {Map<String, String> params = const <String, String>{}}) {
  final Map<String, String> primary =
      careMessages[locale] ?? const <String, String>{};
  final Map<String, String> fallback =
      careMessages['en-US'] ?? const <String, String>{};
  String resolved = primary[key] ?? fallback[key] ?? key;
  params.forEach((String name, String value) {
    resolved = resolved.replaceAll('{{$name}}', value);
  });
  return resolved;
}

/// Normalizes a platform locale tag to a catalog locale.
String resolveCareLocale(String? preferred) {
  if (preferred == null || preferred.isEmpty) return 'en-US';
  final String lower = preferred.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en-US';
  return 'en-US';
}

/// Every key the catalog ships, for drift tests.
Set<String> careKeys(String locale) =>
    (careMessages[locale] ?? const <String, String>{}).keys.toSet();
