/**
 * Localized care copy for the conversation transports.
 *
 * The triage *level* vocabulary belongs to `@sdkwork/doctor-common-doctor`; the
 * words belong to the shared care catalog (`contracts/care-messages.json`), so
 * the PC, H5, mini program, and Flutter roots say the same thing in both
 * locales. A host injects its i18n translator; without one every helper falls
 * back to the English literals these transports shipped before, which keeps
 * fixtures and headless contract tests unchanged.
 */
import type { FamilyMember, TriageLevel } from '@sdkwork/doctor-common-doctor';

/** Catalog translator; `params` are interpolated into `{{name}}` placeholders. */
export type CareTranslate = (
  key: string,
  params?: Readonly<Record<string, string | number>>,
) => string;

const ACTION_KEYS: Readonly<Record<TriageLevel, readonly string[]>> = Object.freeze({
  emergency: Object.freeze(['emergency.call', 'emergency.doNotDrive', 'emergency.stay']),
  urgent: Object.freeze(['urgent.contact', 'urgent.record', 'urgent.seek']),
  routine: Object.freeze(['routine.monitor', 'routine.book']),
  'self-care': Object.freeze(['self-care.describe']),
});

const ACTION_FALLBACK: Readonly<Record<TriageLevel, readonly string[]>> = Object.freeze({
  emergency: Object.freeze([
    'Call local emergency services now.',
    'Do not drive yourself.',
    'Stay with the person until help arrives.',
  ]),
  urgent: Object.freeze([
    'Contact a clinician today.',
    'Record temperature and fluid intake.',
    'Seek emergency care if breathing or consciousness changes.',
  ]),
  routine: Object.freeze([
    'Monitor for 24-48 hours.',
    'Book a routine consultation if symptoms persist or worsen.',
  ]),
  'self-care': Object.freeze(['Describe the symptom, its onset, and its severity.']),
});

const EMERGENCY_LEAD_EN =
  'Emergency red flag detected. Call local emergency services now. Do not drive yourself. Stay with the person until help arrives.';
const URGENT_LEAD_EN = 'This needs a same-day clinician review.';
const SAFETY_EN = 'This is general guidance, not a diagnosis. For emergencies call your local emergency number.';
const NO_RED_FLAG_EN = 'No red flag was found in what you described.';
const DESCRIBE_EN = 'Tell me the symptom, when it started, and how severe it is.';
const WHO_SELF_EN = 'you';

function text(
  translate: CareTranslate | undefined,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string | null {
  if (!translate) return null;
  const value = translate(key, params);
  return typeof value === 'string' && value.trim().length > 0 && value !== key ? value : null;
}

/** Actions for one triage level in the active locale. */
export function careTriageActions(level: TriageLevel, translate?: CareTranslate): string[] {
  const keys = ACTION_KEYS[level];
  if (!translate) return [...ACTION_FALLBACK[level]];
  const resolved = keys
    .map((key) => text(translate, 'platform.care.triage.action.' + key))
    .filter((value): value is string => value !== null);
  return resolved.length === keys.length ? resolved : [...ACTION_FALLBACK[level]];
}

export function careSafetyLine(translate?: CareTranslate): string {
  return text(translate, 'platform.care.chat.safetyLine') ?? SAFETY_EN;
}

export function careEmergencyLead(translate?: CareTranslate): string {
  return text(translate, 'platform.care.chat.emergencyLead') ?? EMERGENCY_LEAD_EN;
}

export function careNoRedFlag(translate?: CareTranslate): string {
  return text(translate, 'platform.care.chat.noRedFlag') ?? NO_RED_FLAG_EN;
}

export function careDescribePrompt(translate?: CareTranslate): string {
  return text(translate, 'platform.care.triage.reply.describePrompt') ?? DESCRIBE_EN;
}

/** Pronoun used when the household's active patient is the device owner. */
export function careWhoSelf(translate?: CareTranslate): string {
  return text(translate, 'platform.care.triage.whoSelf') ?? WHO_SELF_EN;
}

export function careWhoLabel(member: FamilyMember, translate?: CareTranslate): string {
  const name = String(member.displayName ?? '');
  if (!name || name === 'Me') return careWhoSelf(translate);
  return name;
}

export function careEmergencyLeadFor(who: string, translate?: CareTranslate): string {
  return text(translate, 'platform.care.triage.lead.emergencyFor', { who }) ??
    'Emergency red flag detected for ' + who + '.';
}

export function careUrgentLeadFor(who: string, translate?: CareTranslate): string {
  return text(translate, 'platform.care.triage.lead.urgentFor', { who }) ?? URGENT_LEAD_EN + ' for ' + who + '.';
}

/** Offline answer: the level's own actions plus the safety line. */
export function careOfflineAnswer(
  level: TriageLevel,
  member: FamilyMember,
  translate?: CareTranslate,
): string {
  const who = careWhoLabel(member, translate);
  const safety = careSafetyLine(translate);
  if (level === 'emergency') {
    return careEmergencyLeadFor(who, translate) + ' ' + careTriageActions(level, translate).join(' ') + ' ' + safety;
  }
  if (level === 'urgent') {
    return careUrgentLeadFor(who, translate) + ' ' + careTriageActions(level, translate).join(' ') + ' ' + safety;
  }
  if (level === 'routine') {
    return careNoRedFlag(translate) + ' ' + careTriageActions(level, translate).join(' ') + ' ' + safety;
  }
  return careDescribePrompt(translate) + ' ' + safety;
}

/** Hosted answer: escalation guidance leads, the agent's words are kept after it. */
export function careComposeHostedReply(
  level: TriageLevel,
  replyText: string,
  member: FamilyMember,
  translate?: CareTranslate,
): string {
  const who = careWhoLabel(member, translate);
  const safety = careSafetyLine(translate);
  const body = replyText.includes(safety) ? replyText : replyText + ' ' + safety;
  if (level === 'emergency') return careEmergencyLead(translate) + ' (' + who + ') ' + body;
  if (level === 'urgent') {
    return careUrgentLeadFor(who, translate) + ' ' + careTriageActions(level, translate).join(' ') + ' ' + body;
  }
  return body;
}
