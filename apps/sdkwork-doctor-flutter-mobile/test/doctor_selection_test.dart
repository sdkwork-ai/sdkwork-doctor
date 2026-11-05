import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_directory.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_selection.dart';

/// Covers the selection rules shared by every surface: the first doctor picked
/// becomes primary, demoting the primary promotes the next one, the cap holds,
/// and ids that leave the roster are pruned.
void main() {
  test('the first doctor selected becomes primary', () async {
    final DoctorSelectionStore store = DoctorSelectionStore.memory();
    expect(store.selectedIds, isEmpty);
    expect(store.primaryId, isNull);

    await store.select('a');
    expect(store.selectedIds, <String>['a']);
    expect(store.primaryId, 'a');

    await store.select('b');
    expect(store.selectedIds, <String>['a', 'b']);
    expect(store.primaryId, 'a',
        reason: 'a later selection does not steal primary');

    await store.setPrimary('b');
    expect(store.primaryId, 'b');

    await store.deselect('b');
    expect(store.selectedIds, <String>['a']);
    expect(store.primaryId, 'a',
        reason: 'demoting the primary promotes the next selected doctor');

    await store.deselect('a');
    expect(store.selectedIds, isEmpty);
    expect(store.primaryId, isNull);
  });

  test('toggle adds and removes one doctor', () async {
    final DoctorSelectionStore store = DoctorSelectionStore.memory();
    await store.toggle('a');
    expect(store.isSelected('a'), isTrue);
    await store.toggle('a');
    expect(store.isSelected('a'), isFalse);
  });

  test('the cap holds and unknown ids are pruned', () async {
    final DoctorSelectionStore store = DoctorSelectionStore.memory();
    for (final String id in <String>['a', 'b', 'c', 'd', 'e', 'f']) {
      await store.select(id);
    }
    expect(store.selectedIds, hasLength(kDoctorSelectionLimit));
    expect(store.selectedIds.contains('f'), isFalse);

    await store.prune(<String>['a', 'c', 'zzz']);
    expect(store.selectedIds, <String>['a', 'c']);
    expect(store.primaryId, 'a');

    await store.prune(<String>['c']);
    expect(store.selectedIds, <String>['c']);
    expect(store.primaryId, 'c',
        reason: 'pruning the primary promotes the first survivor');

    await store.clear();
    expect(store.selectedIds, isEmpty);
    expect(store.primaryId, isNull);
    expect(store.isSelected('c'), isFalse);
  });

  test('setPrimary selects a doctor that was not selected yet', () async {
    final DoctorSelectionStore store = DoctorSelectionStore.memory();
    await store.select('a');
    await store.setPrimary('b');
    expect(store.selectedIds, <String>['a', 'b']);
    expect(store.primaryId, 'b');
  });

  test('the selection persists and repairs a primary that is not selected',
      () async {
    final MemoryDoctorSelectionStorage storage = MemoryDoctorSelectionStorage();
    final DoctorSelectionStore store = await DoctorSelectionStore.load(storage);
    await store.select('doctor-lin-qinghe');
    await store.select('doctor-su-wanning');

    final DoctorSelectionStore reloaded =
        await DoctorSelectionStore.load(storage);
    expect(reloaded.selectedIds,
        <String>['doctor-lin-qinghe', 'doctor-su-wanning']);
    expect(reloaded.primaryId, 'doctor-lin-qinghe');

    final DoctorSelectionState repaired = parseDoctorSelection(
      <String, Object?>{
        'selectedIds': <String>['a', 'b'],
        'primaryId': 'zzz',
      },
    );
    expect(repaired.primaryId, 'a');
    expect(parseDoctorSelection('{not json').selectedIds, isEmpty);
    expect(parseDoctorSelection('').primaryId, isNull);
  });

  test('the stored document keeps the pinned shape', () async {
    final DoctorSelectionStore store = DoctorSelectionStore.memory();
    await store.select('a');
    await store.setPrimary('a');
    final Map<String, dynamic> document = jsonDecode(
      serializeDoctorSelection(store.state),
    ) as Map<String, dynamic>;
    expect(
        document.keys.toSet(), <String>{'version', 'selectedIds', 'primaryId'});
    expect(document['version'], 1);
    expect(document['selectedIds'], <String>['a']);
    expect(document['primaryId'], 'a');
    expect(kDoctorSelectionStorageKey, 'sdkwork.doctor.doctor-selection.v1');
    expect(kDoctorSelectionLimit, 5);
  });

  test('resolving keeps selection order and the primary', () {
    const DoctorRoster roster = kCatalogDoctorRoster;
    final String first = roster.doctors[0].id;
    final String second = roster.doctors[1].id;
    final DoctorSelectionState selection = parseDoctorSelection(
      <String, Object?>{
        'selectedIds': <String>[second, 'gone', first],
        'primaryId': second,
      },
    );
    expect(
      resolveSelectedDoctors(roster, selection)
          .map((DoctorProfile doctor) => doctor.id)
          .toList(growable: false),
      <String>[second, first],
    );
    expect(resolvePrimaryDoctor(roster, selection)?.id, second);
    expect(
      resolvePrimaryDoctor(roster, const DoctorSelectionState()),
      isNull,
    );
  });

  test(
      'mutations notify listeners and a storage failure keeps the session copy',
      () async {
    final DoctorSelectionStore store = await DoctorSelectionStore.load(
      _ThrowingSelectionStorage(),
      fallback: MemoryDoctorSelectionStorage(),
    );
    int notifications = 0;
    store.addListener(() => notifications += 1);
    await store.select('a');
    expect(notifications, 1);
    await store.select('a');
    expect(notifications, 1, reason: 'a no-op does not notify');
    await store.setPrimary('a');
    expect(notifications, 1,
        reason: 'making the same doctor primary is a no-op');
  });
}

class _ThrowingSelectionStorage implements DoctorSelectionStorage {
  @override
  Future<String?> read() async => throw StateError('storage unavailable');

  @override
  Future<void> write(String value) async =>
      throw StateError('storage unavailable');
}
