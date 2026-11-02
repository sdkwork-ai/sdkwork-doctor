import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PATIENT_PROFILE_LIMIT,
  patientProfileCompleteness,
  splitProfileField,
  type FamilyRelation,
  type PatientProfile,
  type PatientProfileStore,
  type Sex,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton } from '@sdkwork/doctor-h5-commons';

const RELATIONS: readonly FamilyRelation[] = ['self', 'spouse', 'child', 'parent', 'other'];
const SEXES: readonly Sex[] = ['female', 'male', 'unspecified'];

interface PatientDraft {
  readonly displayName: string;
  readonly relation: FamilyRelation;
  readonly birthYear: string;
  readonly sex: Sex;
  readonly bloodType: string;
  readonly allergies: string;
  readonly chronicConditions: string;
  readonly medications: string;
  readonly notes: string;
}

function draftFrom(profile: PatientProfile | null): PatientDraft {
  return {
    displayName: profile?.displayName ?? '',
    relation: profile?.relation ?? 'self',
    birthYear: String(profile?.birthYear ?? new Date().getFullYear() - 30),
    sex: profile?.sex ?? 'unspecified',
    bloodType: profile?.bloodType ?? '',
    allergies: (profile?.allergies ?? []).join(', '),
    chronicConditions: (profile?.chronicConditions ?? []).join(', '),
    medications: (profile?.medications ?? []).join(', '),
    notes: profile?.notes ?? '',
  };
}

/** Label for one patient: the localized relation plus the name. */
export function usePatientLabel(): (profile: PatientProfile) => string {
  const { t } = useTranslation();
  return (profile) => t('platform.care.profile.relation.' + profile.relation) + ' · ' + profile.displayName;
}

export interface PatientEditorProps {
  readonly patients: PatientProfileStore;
  /** Null creates a new file; a profile edits it in place. */
  readonly profile: PatientProfile | null;
  readonly onClose: () => void;
}

/** Create/edit form for one patient file. Validation failures stay visible. */
export function PatientEditor({ patients, profile, onClose }: PatientEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PatientDraft>(() => draftFrom(profile));
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<PatientDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    if (!draft.displayName.trim()) {
      setError(t('platform.care.profile.required.name'));
      return;
    }
    const birthYear = Number.parseInt(draft.birthYear, 10);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) {
      setError(t('platform.care.profile.invalid.birthYear'));
      return;
    }
    const input = {
      displayName: draft.displayName,
      relation: draft.relation,
      birthYear,
      sex: draft.sex,
      bloodType: draft.bloodType,
      allergies: splitProfileField(draft.allergies),
      chronicConditions: splitProfileField(draft.chronicConditions),
      medications: splitProfileField(draft.medications),
      notes: draft.notes,
    };
    try {
      if (profile) {
        patients.update(profile.id, input);
      } else {
        patients.add(input);
      }
      setError(null);
      onClose();
    } catch (reason) {
      setError(t('platform.care.profile.failed', { message: reason instanceof Error ? reason.message : String(reason) }));
    }
  };

  return (
    <form
      className="doctor-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {error ? <div className="doctor-error-banner">{error}</div> : null}
      <label className="doctor-field">
        <span>{t('platform.care.profile.field.name')}</span>
        <input value={draft.displayName} onChange={(event) => update({ displayName: event.target.value })} />
      </label>
      <div className="doctor-field-row">
        <label className="doctor-field">
          <span>{t('platform.care.profile.field.relation')}</span>
          <select value={draft.relation} onChange={(event) => update({ relation: event.target.value as FamilyRelation })}>
            {RELATIONS.map((relation) => (
              <option key={relation} value={relation}>{t('platform.care.profile.relation.' + relation)}</option>
            ))}
          </select>
        </label>
        <label className="doctor-field">
          <span>{t('platform.care.profile.field.sex')}</span>
          <select value={draft.sex} onChange={(event) => update({ sex: event.target.value as Sex })}>
            {SEXES.map((sex) => (
              <option key={sex} value={sex}>{t('platform.care.profile.sex.' + sex)}</option>
            ))}
          </select>
        </label>
        <label className="doctor-field">
          <span>{t('platform.care.profile.field.birthYear')}</span>
          <input inputMode="numeric" value={draft.birthYear} onChange={(event) => update({ birthYear: event.target.value })} />
        </label>
        <label className="doctor-field">
          <span>{t('platform.care.profile.field.bloodType')}</span>
          <input value={draft.bloodType} onChange={(event) => update({ bloodType: event.target.value })} />
        </label>
      </div>
      <label className="doctor-field">
        <span>{t('platform.care.profile.field.allergies')}</span>
        <input value={draft.allergies} onChange={(event) => update({ allergies: event.target.value })} />
      </label>
      <label className="doctor-field">
        <span>{t('platform.care.profile.field.conditions')}</span>
        <input value={draft.chronicConditions} onChange={(event) => update({ chronicConditions: event.target.value })} />
      </label>
      <label className="doctor-field">
        <span>{t('platform.care.profile.field.medications')}</span>
        <input value={draft.medications} onChange={(event) => update({ medications: event.target.value })} />
      </label>
      <label className="doctor-field">
        <span>{t('platform.care.profile.field.notes')}</span>
        <textarea rows={2} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} />
      </label>
      <div className="doctor-form-actions">
        <ActionButton tone="primary" onClick={save}>{t('platform.care.profile.save')}</ActionButton>
        <ActionButton onClick={onClose}>{t('platform.care.profile.cancel')}</ActionButton>
      </div>
    </form>
  );
}

export interface PatientPanelProps {
  readonly patients: PatientProfileStore;
}

/**
 * The household's patient files: switch the active patient, edit one, add one,
 * or delete one. Deleting never deletes the visit records recorded for it.
 */
export function PatientPanel({ patients }: PatientPanelProps) {
  const { t } = useTranslation();
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);
  const [editor, setEditor] = useState<{ profile: PatientProfile | null } | null>(null);

  const remove = (profile: PatientProfile) => {
    if (typeof window !== 'undefined' && !window.confirm(t('platform.care.profile.deleteConfirm'))) return;
    patients.remove(profile.id);
  };

  return (
    <div>
      <div className="doctor-panel-head">
        <p className="doctor-check-detail">{t('platform.care.profile.subtitle')}</p>
        <ActionButton
          tone="primary"
          disabled={profiles.length >= PATIENT_PROFILE_LIMIT}
          onClick={() => setEditor({ profile: null })}
        >
          {t('platform.care.profile.add')}
        </ActionButton>
      </div>
      {profiles.length >= PATIENT_PROFILE_LIMIT ? (
        <p className="doctor-check-detail">{t('platform.care.profile.limit', { count: PATIENT_PROFILE_LIMIT })}</p>
      ) : null}
      {profiles.length === 0 ? (
        <p className="doctor-empty">{t('platform.care.profile.empty')}</p>
      ) : (
        <ul className="doctor-card-list">
          {profiles.map((profile) => (
            <li className="doctor-list-card" key={profile.id}>
              <div className="doctor-card-head">
                <div>
                  <h3 className="doctor-check-title">{profile.displayName}</h3>
                  <p className="doctor-check-detail">
                    {t('platform.care.profile.relation.' + profile.relation)} · {profile.birthYear} · {t('platform.care.profile.sex.' + profile.sex)}
                  </p>
                </div>
                {profile.id === activeId ? <span className="doctor-badge" data-status="ok">{t('platform.care.active')}</span> : null}
              </div>
              <p className="doctor-check-summary">{t('platform.care.profile.completeness', { percent: patientProfileCompleteness(profile) })}</p>
              <p className="doctor-check-detail">
                {t('platform.care.profile.field.allergies')}: {profile.allergies.length > 0 ? profile.allergies.join(', ') : t('platform.care.value.none')}
                {' · '}
                {t('platform.care.profile.field.conditions')}: {profile.chronicConditions.length > 0 ? profile.chronicConditions.join(', ') : t('platform.care.value.none')}
              </p>
              <div className="doctor-card-actions">
                {profile.id === activeId ? null : (
                  <ActionButton onClick={() => patients.select(profile.id)}>{t('platform.care.profile.select')}</ActionButton>
                )}
                <ActionButton onClick={() => setEditor({ profile })}>{t('platform.care.profile.edit')}</ActionButton>
                <ActionButton tone="danger" onClick={() => remove(profile)}>{t('platform.care.profile.delete')}</ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editor ? (
        <div className="doctor-editor">
          <PatientEditor
            key={editor.profile?.id ?? 'new'}
            patients={patients}
            profile={editor.profile}
            onClose={() => setEditor(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

export interface PatientSwitcherProps {
  readonly patients: PatientProfileStore;
}

/** Compact active-patient switcher for the chat header. */
export function PatientSwitcher({ patients }: PatientSwitcherProps) {
  const { t } = useTranslation();
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);

  if (profiles.length === 0) {
    return <p className="doctor-empty">{t('platform.care.chat.noPatient')}</p>;
  }
  return (
    <div aria-label={t('platform.care.chat.switchPatient')} className="doctor-chip-row" role="group">
      {profiles.map((profile) => (
        <button
          aria-pressed={profile.id === activeId}
          className="doctor-chip"
          key={profile.id}
          onClick={() => patients.select(profile.id)}
          type="button"
        >
          {profile.displayName}
        </button>
      ))}
    </div>
  );
}