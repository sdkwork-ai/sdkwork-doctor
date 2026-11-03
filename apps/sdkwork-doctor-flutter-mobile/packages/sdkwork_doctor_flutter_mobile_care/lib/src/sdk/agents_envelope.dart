/// Envelope unwrapping for the generated Agents app SDK.
///
/// The generator emits every operation with an `SdkWorkApiResponse` envelope
/// (`{ code, data, traceId }`) whose payload is either `SdkWorkPageData`
/// (`items` + `pageInfo`) or `SdkWorkResourceData` (`item`). Capability code
/// stays structural about record fields, but the envelope shape is
/// generator-owned and is unwrapped once here.
///
/// Authority: `APP_SDK_INTEGRATION_SPEC.md`, `PAGINATION_SPEC.md`.
library;

/// Narrows an envelope field to a JSON object.
Map<String, dynamic>? careAsMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map<String, dynamic>(
      (Object? key, Object? item) => MapEntry<String, dynamic>(key.toString(), item),
    );
  }
  return null;
}

/// Narrows an envelope field to a JSON array of objects.
List<Map<String, dynamic>> careAsMapList(Object? value) {
  if (value is! List) {
    return const <Map<String, dynamic>>[];
  }
  final List<Map<String, dynamic>> result = <Map<String, dynamic>>[];
  for (final Object? entry in value) {
    final Map<String, dynamic>? map = careAsMap(entry);
    if (map != null) {
      result.add(map);
    }
  }
  return result;
}

/// Reads the single-resource payload of a retrieve/create response.
Map<String, dynamic>? careResourceItem(Object? data) {
  final Map<String, dynamic>? envelope = careAsMap(data);
  if (envelope == null) {
    return null;
  }
  return careAsMap(envelope['item']);
}

/// Reads the paged items of a list response.
List<Map<String, dynamic>> carePageItems(Object? data) {
  final Map<String, dynamic>? envelope = careAsMap(data);
  if (envelope == null) {
    return const <Map<String, dynamic>>[];
  }
  return careAsMapList(envelope['items']);
}
