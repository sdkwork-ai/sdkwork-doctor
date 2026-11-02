import { useTranslation } from 'react-i18next';
import type { DoctorCheckOutcome } from '@sdkwork/doctor-common-diagnostics';
import { StatusBadge, formatDuration } from '@sdkwork/doctor-h5-commons';

export function CheckList({ outcomes, showDetails }: { outcomes: readonly DoctorCheckOutcome[]; showDetails?: boolean }) {
  const { t } = useTranslation();
  if (outcomes.length === 0) {
    return <p className="doctor-card-body">{t('platform.diagnostics.list.empty')}</p>;
  }
  return (
    <ul className="doctor-check-list">
      {outcomes.map((outcome) => (
        <li className="doctor-check" key={outcome.checkId}>
          <div>
            <h3 className="doctor-check-title">{outcome.titleKey ? t(outcome.titleKey) : outcome.title}</h3>
            <p className="doctor-check-summary">
              {outcome.messageKey ? t(outcome.messageKey, outcome.messageParams) : outcome.summary}
            </p>
          </div>
          <StatusBadge label={t('platform.diagnostics.status.' + outcome.status)} status={outcome.status} />
          <div className="doctor-check-meta">{outcome.checkId} · {formatDuration(outcome.durationMs)}</div>
          {showDetails && outcome.details && outcome.details.length > 0 ? (
            <ul className="doctor-check-details">
              {outcome.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          ) : null}
          {showDetails && (outcome.hintKey || outcome.hint) ? (
            <p className="doctor-check-summary">
              {t('platform.diagnostics.list.fix', { hint: outcome.hintKey ? t(outcome.hintKey) : outcome.hint })}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
