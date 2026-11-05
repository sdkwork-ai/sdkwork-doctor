import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/care/medical_summary.dart';
import 'package:sdkwork_doctor_flutter_mobile/patients/patient_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/medical_record_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

MedicalRecord record({String id = 'case-1'}) {
  return MedicalRecord(
    id: id,
    sessionId: 'session-1',
    memberId: 'member-child',
    memberLabel: 'Xiaoman (child)',
    mode: 'offline',
    startedAt: '2026-11-03T11:00:00.000Z',
    endedAt: '2026-11-03T11:18:00.000Z',
    summary: 'Two turns about a high fever since last night.',
    transcript: <MedicalTranscriptEntry>[
      MedicalTranscriptEntry(
        id: 'entry-1',
        role: 'patient',
        text: 'Child has had a high fever since last night',
        at: '2026-11-03T11:01:00.000Z',
        level: TriageLevel.urgent,
      ),
      MedicalTranscriptEntry(
        id: 'entry-2',
        role: 'assistant',
        text: 'Contact a clinician today.',
        at: '2026-11-03T11:02:00.000Z',
      ),
    ],
    attachments: <MedicalAttachment>[
      createMedicalAttachment(
        name: 'thermometer.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        id: 'attachment-1',
        addedAt: DateTime.utc(2026, 11, 3, 11, 3),
      ),
    ],
    aiDiagnosis: createAiDiagnosis(
      id: 'ai-1',
      impression: 'Febrile child; a same-day clinician review is advised.',
      conditions: <String>['Respiratory infection'],
      recommendations: <String>['Contact a clinician today.'],
      level: TriageLevel.urgent,
      createdAt: DateTime.utc(2026, 11, 3, 11, 18),
    ),
    status: 'awaiting_doctor',
  );
}

void main() {
  test('a new 病历 keeps the AI diagnosis as a draft awaiting the doctor', () {
    final MedicalRecord value = record();
    expect(value.status, 'awaiting_doctor');
    expect(value.needsDoctorReview, isTrue);
    expect(value.aiDiagnosis.source, 'ai');
    expect(value.doctorDiagnosis, isNull);
    expect(value.attachments.single.kind, 'image');
    expect(MedicalRecord.fromJson(value.toJson())?.aiDiagnosis.impression,
        value.aiDiagnosis.impression);
    expect(
        parseMedicalRecords(serializeMedicalRecords(<MedicalRecord>[value]))
            .length,
        1);
  });

  test('accepting the AI diagnosis does not invent a doctor diagnosis', () {
    final MedicalRecord next = confirmAiDiagnosis(
      record(),
      doctorLabel: 'Lin Qinghe',
      decision: 'confirmed',
      confirmedAt: DateTime.utc(2026, 11, 3, 12),
    );
    expect(next.status, 'confirmed');
    expect(next.needsDoctorReview, isFalse);
    expect(next.confirmation!.diagnosisId, next.aiDiagnosis.id);
    expect(next.confirmation!.doctorLabel, 'Lin Qinghe');
    expect(next.doctorDiagnosis, isNull);
    expect(next.aiDiagnosis.impression, record().aiDiagnosis.impression);
  });

  test('amending stores both diagnoses side by side', () {
    final MedicalRecord original = record();
    final MedicalRecord next = confirmAiDiagnosis(
      original,
      doctorLabel: 'Lin Qinghe',
      decision: 'amended',
      doctorDiagnosis: const DoctorDiagnosisDraft(
        doctorLabel: 'Lin Qinghe',
        impression: 'Viral upper respiratory infection; review in 24 hours.',
        conditions: <String>['Viral URI'],
        recommendations: <String>['Hydration'],
        level: TriageLevel.routine,
        notes: 'Penicillin allergy noted.',
      ),
    );
    expect(next.status, 'confirmed');
    expect(next.confirmation!.decision, 'amended');
    expect(next.doctorDiagnosis!.source, 'doctor');
    expect(next.doctorDiagnosis!.basisDiagnosisId, original.aiDiagnosis.id);
    expect(next.confirmation!.doctorDiagnosisId, next.doctorDiagnosis!.id);
    expect(next.aiDiagnosis.impression, original.aiDiagnosis.impression);
    expect(
      () =>
          confirmAiDiagnosis(original, doctorLabel: 'Lin', decision: 'amended'),
      throwsArgumentError,
    );
  });

  test('a doctor may record an independent diagnosis before confirming', () {
    final MedicalRecord next = addDoctorDiagnosis(
      record(),
      const DoctorDiagnosisDraft(
        doctorLabel: 'Su Wanning',
        impression: 'Likely viral illness.',
        level: TriageLevel.routine,
      ),
    );
    expect(next.status, 'awaiting_doctor');
    expect(next.doctorDiagnosis!.doctorLabel, 'Su Wanning');
    expect(next.confirmation, isNull);
  });

  test('the store saves a review in place and notifies', () async {
    final MedicalRecordStore store = MedicalRecordStore.memory();
    int notifications = 0;
    store.addListener(() => notifications += 1);
    await store.add(record());
    expect(store.records.length, 1);
    final MedicalRecord reviewed = confirmAiDiagnosis(
      store.records.single,
      doctorLabel: 'Lin Qinghe',
      decision: 'confirmed',
    );
    await store.save(reviewed);
    expect(store.records.length, 1);
    expect(store.records.single.status, 'confirmed');
    expect(notifications, 2);
    await store.clear();
    expect(store.records, isEmpty);
  });

  test('the offline summary is deterministic and needs a doctor', () {
    final CareSummaryInput input = CareSummaryInput(
      sessionId: 'session-1',
      patientLabel: 'Xiaoman (child)',
      patientFacts: 'Known allergies: penicillin.',
      transcript: <CareSummaryTurn>[
        const CareSummaryTurn(isUser: true, text: 'chest pain for 10 minutes'),
        const CareSummaryTurn(
            isUser: false, text: 'Call local emergency services now.'),
      ],
      startedAt: DateTime.utc(2026, 11, 3, 11),
      endedAt: DateTime.utc(2026, 11, 3, 11, 18),
    );
    final CareSummaryDraft draft = buildOfflineCareSummary('en-US', input);
    expect(draft.source, 'offline');
    expect(draft.diagnosis.level, 'emergency');
    expect(draft.summary, contains('must be reviewed by a doctor'));
    expect(draft.diagnosis.impression, contains('No definitive diagnosis'));
    expect(draft.diagnosis.recommendations, isNotEmpty);

    final CareSummaryDraft zh = buildOfflineCareSummary('zh-CN', input);
    expect(zh.summary, contains('需医生复核'));

    final CareSummaryDraft clamped = clampCareSummary(
      CareSummaryInput(
        sessionId: 'session-2',
        patientLabel: 'Me (self)',
        patientFacts: '',
        transcript: <CareSummaryTurn>[
          const CareSummaryTurn(
              isUser: true, text: 'chest pain for 10 minutes'),
        ],
        startedAt: DateTime.utc(2026, 11, 3, 12),
        endedAt: DateTime.utc(2026, 11, 3, 12, 5),
      ),
      const CareSummaryDraft(
        summary: 'Chest pain discussed.',
        source: 'hosted',
        diagnosis: CareDiagnosisDraft(
          impression: 'Muscular pain.',
          level: 'routine',
        ),
      ),
    );
    expect(clamped.diagnosis.level, 'emergency');
  });

  test('building the 病历 carries the transcript and the attachments', () {
    final CareSummaryInput input = CareSummaryInput(
      sessionId: 'session-1',
      patientLabel: 'Xiaoman (child)',
      patientFacts: '',
      transcript: const <CareSummaryTurn>[
        CareSummaryTurn(isUser: true, text: 'fever'),
      ],
      startedAt: DateTime.utc(2026, 11, 3, 11),
      endedAt: DateTime.utc(2026, 11, 3, 11, 18),
    );
    final MedicalRecord built = buildMedicalRecord(
      patient: PatientProfile(
        id: 'member-child',
        displayName: 'Xiaoman',
        relation: PatientRelation.child,
        birthYear: 2019,
        sex: PatientSex.female,
        allergies: const <String>['penicillin'],
        chronicConditions: const <String>[],
        medications: const <String>[],
      ),
      input: input,
      draft: const CareSummaryDraft(
        summary: 'Fever discussed.',
        source: 'offline',
        diagnosis: CareDiagnosisDraft(
          impression: 'Febrile child; review today.',
          level: 'urgent',
        ),
      ),
      mode: 'offline',
      messages: <CareConversationMessage>[
        CareConversationMessage(id: 'm1', isUser: true, text: 'fever'),
        CareConversationMessage(
            id: 'm2', isUser: false, text: 'Contact a clinician today.'),
      ],
      attachments: <MedicalAttachment>[
        createMedicalAttachment(
            name: 'note.txt', mimeType: 'text/plain', sizeBytes: 5),
      ],
    );
    expect(built.status, 'awaiting_doctor');
    expect(built.transcript.length, 2);
    expect(built.transcript.first.role, 'patient');
    expect(built.attachments.single.kind, 'file');
    expect(built.aiDiagnosis.level, TriageLevel.urgent);
  });
}
