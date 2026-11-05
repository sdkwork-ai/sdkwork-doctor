import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDoctorDiagnosis,
  confirmAiDiagnosis,
  medicalRecordNeedsDoctorReview,
  resolvePrimaryDoctor,
  type DoctorRoster,
  type DoctorSelectionStore,
  type MedicalAttachmentStore,
  type MedicalDiagnosis,
  type MedicalRecord,
  type MedicalRecordStore,
  type TriageLevel,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, Panel } from '@sdkwork/doctor-pc-commons';

import { AttachmentList } from './attachments';

/** Splits a textarea of conditions or recommendations into rows. */
export function splitDiagnosisList(value: string): string[] {
  return value
    .split(/[\n,，]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const LEVELS: readonly TriageLevel[] = Object.freeze(['emergency', 'urgent', 'routine', 'self-care']);

export function DiagnosisBlock({
  title,
  hint,
  diagnosis,
}: {
  readonly title: string;
  readonly hint: string;
  readonly diagnosis: MedicalDiagnosis;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="doctor-diagnosis">
      <div className="doctor-inline-badges">
        <h3 className="doctor-check-title">{title}</h3>
        <span className="doctor-badge" data-status={diagnosis.level === 'emergency' || diagnosis.level === 'urgent' ? 'warn' : 'ok'}>
          {t('platform.care.level.' + diagnosis.level)}
        </span>
      </div>
      <p className="doctor-check-detail">{hint}</p>
      <p className="doctor-check-summary">{diagnosis.impression}</p>
      {diagnosis.conditions.length > 0 ? (
        <p className="doctor-check-detail">
          {t('platform.care.medical.conditions')}: {diagnosis.conditions.join(' · ')}
        </p>
      ) : null}
      {diagnosis.recommendations.length > 0 ? (
        <ul className="doctor-check-list">
          {diagnosis.recommendations.map((entry) => (
            <li className="doctor-check-detail" key={entry}>{entry}</li>
          ))}
        </ul>
      ) : null}
      {diagnosis.notes ? <p className="doctor-check-detail">{t('platform.care.medical.notes')}: {diagnosis.notes}</p> : null}
      <p className="doctor-check-detail">
        {diagnosis.doctorLabel ? diagnosis.doctorLabel + ' · ' : ''}
        {new Date(diagnosis.createdAt).toLocaleString(i18n.language)}
      </p>
    </div>
  );
}

type ReviewMode = 'confirm' | 'amend' | 'manual';

export function DoctorReviewForm({
  record,
  store,
  primaryDoctorName,
  initialMode,
}: {
  readonly record: MedicalRecord;
  readonly store: MedicalRecordStore;
  readonly primaryDoctorName: string;
  readonly initialMode: ReviewMode;
}) {
  const { t } = useTranslation();
  const [doctorLabel, setDoctorLabel] = useState(primaryDoctorName);
  const [mode, setMode] = useState<ReviewMode>(initialMode);
  const [impression, setImpression] = useState(record.aiDiagnosis.impression);
  const [conditions, setConditions] = useState(record.aiDiagnosis.conditions.join('\n'));
  const [recommendations, setRecommendations] = useState(record.aiDiagnosis.recommendations.join('\n'));
  const [level, setLevel] = useState<TriageLevel>(record.aiDiagnosis.level);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDoctorLabel((current) => (current.trim() ? current : primaryDoctorName));
  }, [primaryDoctorName]);

  const needsImpression = mode === 'amend' || mode === 'manual';

  const submit = () => {
    setError(null);
    setSaved(false);
    const label = doctorLabel.trim();
    if (!label) {
      setError(t('platform.care.medical.doctorRequired'));
      return;
    }
    if (needsImpression && !impression.trim()) {
      setError(t('platform.care.medical.impressionRequired'));
      return;
    }
    const at = new Date().toISOString();
    try {
      let next: MedicalRecord;
      if (mode === 'manual') {
        next = addDoctorDiagnosis(record, {
          doctorLabel: label,
          impression,
          conditions: splitDiagnosisList(conditions),
          recommendations: splitDiagnosisList(recommendations),
          level,
          notes,
          createdAt: at,
        });
      } else if (mode === 'amend') {
        next = confirmAiDiagnosis(record, {
          doctorLabel: label,
          decision: 'amended',
          confirmedAt: at,
          doctorDiagnosis: {
            doctorLabel: label,
            impression,
            conditions: splitDiagnosisList(conditions),
            recommendations: splitDiagnosisList(recommendations),
            level,
            notes,
            createdAt: at,
          },
        });
      } else {
        next = confirmAiDiagnosis(record, {
          doctorLabel: label,
          decision: 'confirmed',
          confirmedAt: at,
        });
      }
      store.save(next);
      setSaved(true);
      setNotes('');
    } catch (reason) {
      setError(t('platform.care.medical.reviewFailed', {
        message: reason instanceof Error ? reason.message : String(reason),
      }));
    }
  };

  return (
    <div className="doctor-review">
      <h3 className="doctor-check-title">{t('platform.care.medical.review')}</h3>
      <p className="doctor-check-detail">{t('platform.care.medical.reviewHint')}</p>
      <label className="doctor-field">
        <span>{t('platform.care.medical.doctorLabel')}</span>
        <input
          className="doctor-input"
          onChange={(event) => setDoctorLabel(event.target.value)}
          placeholder={t('platform.care.medical.doctorPlaceholder')}
          value={doctorLabel}
        />
      </label>
      <div className="doctor-field-row">
        <label className="doctor-affiliation">
          <input checked={mode === 'confirm'} name={'review-' + record.id} onChange={() => setMode('confirm')} type="radio" />
          <span>{t('platform.care.medical.confirmAi')}</span>
        </label>
        <label className="doctor-affiliation">
          <input checked={mode === 'amend'} name={'review-' + record.id} onChange={() => setMode('amend')} type="radio" />
          <span>{t('platform.care.medical.amendAi')}</span>
        </label>
        <label className="doctor-affiliation">
          <input checked={mode === 'manual'} name={'review-' + record.id} onChange={() => setMode('manual')} type="radio" />
          <span>{t('platform.care.medical.addDoctorDiagnosis')}</span>
        </label>
      </div>
      {needsImpression ? (
        <>
          <label className="doctor-field">
            <span>{t('platform.care.medical.impression')}</span>
            <textarea
              className="doctor-textarea"
              onChange={(event) => setImpression(event.target.value)}
              rows={2}
              value={impression}
            />
          </label>
          <label className="doctor-field">
            <span>{t('platform.care.medical.conditions')}</span>
            <textarea
              className="doctor-textarea"
              onChange={(event) => setConditions(event.target.value)}
              rows={2}
              value={conditions}
            />
          </label>
          <label className="doctor-field">
            <span>{t('platform.care.medical.recommendations')}</span>
            <textarea
              className="doctor-textarea"
              onChange={(event) => setRecommendations(event.target.value)}
              rows={2}
              value={recommendations}
            />
          </label>
          <label className="doctor-field">
            <span>{t('platform.care.records.level')}</span>
            <select className="doctor-input" onChange={(event) => setLevel(event.target.value as TriageLevel)} value={level}>
              {LEVELS.map((entry) => (
                <option key={entry} value={entry}>{t('platform.care.level.' + entry)}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {needsImpression ? (
        <label className="doctor-field">
          <span>{t('platform.care.medical.notes')}</span>
          <textarea className="doctor-textarea" onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />
        </label>
      ) : null}
      {error ? <div className="doctor-error-banner">{error}</div> : null}
      {saved ? <div className="doctor-notice">{t('platform.care.medical.reviewSaved')}</div> : null}
      <div className="doctor-form-actions">
        <ActionButton tone="primary" onClick={submit}>{t('platform.care.medical.saveDiagnosis')}</ActionButton>
      </div>
    </div>
  );
}

function MedicalRecordCard({
  record,
  store,
  attachmentStore,
  primaryDoctorName,
}: {
  readonly record: MedicalRecord;
  readonly store: MedicalRecordStore;
  readonly attachmentStore: MedicalAttachmentStore;
  readonly primaryDoctorName: string;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const needsReview = medicalRecordNeedsDoctorReview(record);
  const statusKey = needsReview ? 'awaiting_doctor' : 'confirmed';

  return (
    <div className="doctor-list-card doctor-medical-card">
      <div className="doctor-card-head">
        <div className="doctor-card-copy">
          <h3 className="doctor-check-title">{record.memberLabel}</h3>
          <p className="doctor-check-detail">
            {t('platform.care.medical.endedAt')}: {new Date(record.endedAt).toLocaleString(i18n.language)}
            {' · '}
            {t(record.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline')}
          </p>
          <p className="doctor-check-summary">{record.aiDiagnosis.impression}</p>
        </div>
        <span className="doctor-badge" data-status={needsReview ? 'warn' : 'ok'}>
          {t('platform.care.medical.status.' + statusKey)}
        </span>
      </div>
      <div className="doctor-card-actions">
        <ActionButton onClick={() => setExpanded((current) => !current)}>
          {expanded ? t('platform.care.medical.hide') : t('platform.care.medical.view')}
        </ActionButton>
        {needsReview ? null : (
          <ActionButton onClick={() => { setReviewOpen(true); setExpanded(true); }}>
            {t('platform.care.medical.addDoctorDiagnosis')}
          </ActionButton>
        )}
      </div>
      {expanded ? (
        <div className="doctor-editor">
          <div className="doctor-diagnosis">
            <h3 className="doctor-check-title">{t('platform.care.medical.summary')}</h3>
            <p className="doctor-check-summary">{record.summary}</p>
          </div>

          <DiagnosisBlock
            diagnosis={record.aiDiagnosis}
            hint={t('platform.care.medical.aiDiagnosisHint')}
            title={t('platform.care.medical.aiDiagnosis')}
          />

          {record.doctorDiagnosis ? (
            <DiagnosisBlock
              diagnosis={record.doctorDiagnosis}
              hint={t('platform.care.medical.doctorDiagnosisHint')}
              title={t('platform.care.medical.doctorDiagnosis')}
            />
          ) : (
            <p className="doctor-empty">{t('platform.care.medical.noDoctorDiagnosis')}</p>
          )}

          {record.confirmation ? (
            <p className="doctor-check-detail">
              {t('platform.care.medical.decision.' + record.confirmation.decision)}
              {' · '}
              {t('platform.care.medical.confirmedBy', {
                doctor: record.confirmation.doctorLabel,
                at: new Date(record.confirmation.confirmedAt).toLocaleString(i18n.language),
              })}
            </p>
          ) : null}

          {record.attachments.length > 0 ? (
            <div>
              <h3 className="doctor-check-title">{t('platform.care.medical.attachments')}</h3>
              <AttachmentList attachments={record.attachments} store={attachmentStore} />
            </div>
          ) : null}

          <div>
            <h3 className="doctor-check-title">{t('platform.care.medical.transcript')}</h3>
            <ul className="doctor-check-list">
              {record.transcript.map((entry) => (
                <li className="doctor-check" key={entry.id}>
                  <div>
                    <h4 className="doctor-check-title">
                      {entry.role === 'patient' ? t('platform.care.chat.you') : t('platform.care.chat.doctor')}
                    </h4>
                    {entry.text ? <p className="doctor-check-summary">{entry.text}</p> : null}
                    {entry.attachmentIds && entry.attachmentIds.length > 0 ? (
                      <AttachmentList
                        attachments={record.attachments.filter((attachment) => entry.attachmentIds?.includes(attachment.id))}
                        store={attachmentStore}
                      />
                    ) : null}
                  </div>
                  {entry.level ? (
                    <span className="doctor-badge" data-status={entry.level === 'emergency' || entry.level === 'urgent' ? 'warn' : 'ok'}>
                      {t('platform.care.level.' + entry.level)}
                    </span>
                  ) : <span />}
                </li>
              ))}
            </ul>
          </div>

          {needsReview || reviewOpen ? (
            <DoctorReviewForm
              initialMode={needsReview ? 'confirm' : 'manual'}
              primaryDoctorName={primaryDoctorName}
              record={record}
              store={store}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 病历 list with both diagnosis records and the doctor confirmation form. */
export function MedicalRecordsSection({
  records,
  attachments,
  roster,
  selection,
}: {
  readonly records: MedicalRecordStore;
  readonly attachments: MedicalAttachmentStore;
  readonly roster: DoctorRoster | null;
  readonly selection: DoctorSelectionStore;
}) {
  const { t } = useTranslation();
  const items = useSyncExternalStore(records.subscribe, records.list, records.list);
  const selectionState = useSyncExternalStore(selection.subscribe, selection.state, selection.state);
  const primary = roster ? resolvePrimaryDoctor(roster, selectionState) : null;
  const primaryDoctorName = primary?.displayName ?? '';
  const pending = items.filter(medicalRecordNeedsDoctorReview).length;

  const clear = () => {
    if (items.length === 0) return;
    if (typeof window === 'undefined' || window.confirm(t('platform.care.medical.clearConfirm'))) {
      records.clear();
      void attachments.clear();
    }
  };

  return (
    <Panel title={t('platform.care.medical.title')} description={t('platform.care.medical.subtitle')}>
      <div className="doctor-inline-badges">
        <span className="doctor-badge" data-status="ok">{t('platform.care.medical.count', { count: items.length })}</span>
        {pending > 0 ? (
          <span className="doctor-badge" data-status="warn">
            {t('platform.care.medical.awaitingReviewCount', { count: pending })}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="doctor-empty">{t('platform.care.medical.empty')}</p>
      ) : (
        <ul className="doctor-card-list">
          {items.map((record) => (
            <li key={record.id}>
              <MedicalRecordCard
                attachmentStore={attachments}
                primaryDoctorName={primaryDoctorName}
                record={record}
                store={records}
              />
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 12 }}>
        <ActionButton disabled={items.length === 0} onClick={clear}>{t('platform.care.medical.clear')}</ActionButton>
      </div>
    </Panel>
  );
}
