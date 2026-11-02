import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/family.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';

/// Pins the Dart record shape to the shared contract and covers persistence,
/// ordering, de-duplication, and corrupt-storage recovery.
void main() {
  final File schemaFile = File(
    '../sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/visit-record.schema.json',
  );

  Map<String, dynamic> schema() => jsonDecode(schemaFile.readAsStringSync()) as Map<String, dynamic>;

  VisitRecord sample({String id = 'visit-1', String symptom = 'chest pain'}) => createVisitRecord(
        member: demoSelfMember,
        symptom: symptom,
        advice: 'Call local emergency services now.',
        level: TriageLevel.emergency,
        mode: 'offline',
        id: id,
        recordedAt: DateTime.utc(2026, 11, 2, 13, 30),
      );

  test('the Dart record carries exactly the contract fields', () {
    final List<dynamic> required = schema()['required'] as List<dynamic>;
    expect(sample().toJson().keys.toSet(), required.toSet());
    expect(schema()['storageKey'], kVisitRecordsStorageKey);
    expect(schema()['limit'], kVisitRecordLimit);
  });

  test('a record round-trips through JSON and drops unknown modes', () {
    final VisitRecord original = sample();
    final VisitRecord? parsed = VisitRecord.fromJson(jsonDecode(jsonEncode(original.toJson())));
    expect(parsed, isNotNull);
    expect(parsed!.toJson(), original.toJson());

    final Map<String, Object?> broken = Map<String, Object?>.of(original.toJson());
    broken['mode'] = 'pigeon';
    expect(VisitRecord.fromJson(broken), isNull);
  });

  test('records are newest first, de-duplicated by id, and capped', () {
    final VisitRecord first = sample(id: 'a', symptom: 'first');
    final VisitRecord second = sample(id: 'b', symptom: 'second');
    final List<VisitRecord> once = appendVisitRecord(<VisitRecord>[first], second);
    expect(once.map((VisitRecord r) => r.id).toList(), <String>['b', 'a']);

    final List<VisitRecord> replaced = appendVisitRecord(once, sample(id: 'a', symptom: 'updated'));
    expect(replaced.length, 2);
    expect(replaced.first.id, 'a');
    expect(replaced.first.symptom, 'updated');

    final List<VisitRecord> many = <VisitRecord>[
      for (int index = 0; index < 5; index += 1) sample(id: 'id-$index'),
    ];
    expect(appendVisitRecord(many, sample(id: 'new'), limit: 3).length, 3);
  });

  test('the store persists across instances and clears', () async {
    final MemoryVisitRecordStorage storage = MemoryVisitRecordStorage();
    final VisitRecordStore store = await VisitRecordStore.load(storage);
    expect(store.isEmpty, isTrue);

    await store.add(sample());
    expect(store.records.length, 1);

    final VisitRecordStore reloaded = await VisitRecordStore.load(storage);
    expect(reloaded.records.length, 1);
    expect(reloaded.records.first.id, 'visit-1');

    await reloaded.clear();
    final VisitRecordStore afterClear = await VisitRecordStore.load(storage);
    expect(afterClear.isEmpty, isTrue);
  });

  test('corrupt persisted JSON degrades to an empty list instead of throwing', () async {
    final VisitRecordStore store = await VisitRecordStore.load(MemoryVisitRecordStorage('{not json'));
    expect(store.isEmpty, isTrue);
  });

  test('a storage failure falls back to a session store', () async {
    final VisitRecordStore store = await VisitRecordStore.load(_ThrowingStorage());
    expect(store.isEmpty, isTrue);
    await store.add(sample());
    expect(store.records.length, 1);
  });
}

class _ThrowingStorage implements VisitRecordStorage {
  @override
  Future<String?> read() async => throw StateError('storage unavailable');

  @override
  Future<void> write(String value) async => throw StateError('storage unavailable');
}
