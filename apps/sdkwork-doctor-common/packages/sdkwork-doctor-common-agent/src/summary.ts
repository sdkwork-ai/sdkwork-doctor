/**
 * Conversation → 病历 summarization.
 *
 * The patient ends the conversation; the agent turns the transcript into a
 * written case summary and a tentative AI diagnosis. That diagnosis is always a
 * draft for a human doctor, so the contract deliberately separates `summary`
 * (what was said) from `diagnosis` (a direction to review) and clamps the level
 * to the deterministic triage floor instead of trusting the model downwards.
 */
import { triageSymptoms, type FamilyMember, type TriageLevel } from '@sdkwork/doctor-common-doctor';
import { careTriageActions, type CareTranslate } from './care-copy';

/** One rendered turn handed to the summarizer. */
export interface CareSummaryTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

/** Attachment named in the summary request; the bytes stay on the device. */
export interface CareSummaryAttachment {
  readonly name: string;
  readonly kind: string;
}

export interface CareSummaryInput {
  readonly member: FamilyMember;
  readonly transcript: readonly CareSummaryTurn[];
  readonly attachments?: readonly CareSummaryAttachment[];
  readonly startedAt?: string;
  readonly endedAt?: string;
}

/** The AI's tentative diagnostic direction; never final on its own. */
export interface CareDiagnosisDraft {
  readonly impression: string;
  readonly conditions: readonly string[];
  readonly recommendations: readonly string[];
  readonly level: TriageLevel;
  readonly notes?: string;
}

export interface CareSummaryDraft {
  readonly summary: string;
  readonly diagnosis: CareDiagnosisDraft;
  /** Which transport produced the draft; the record keeps this. */
  readonly source: 'hosted' | 'offline';
}

const TRIAGE_RANK: Readonly<Record<TriageLevel, number>> = Object.freeze({
  'self-care': 0,
  routine: 1,
  urgent: 2,
  emergency: 3,
});

const LEVELS: readonly TriageLevel[] = Object.freeze(['emergency', 'urgent', 'routine', 'self-care']);

function isTriageLevel(value: unknown): value is TriageLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/** Highest triage level found across the patient's own turns. */
export function careTranscriptLevel(transcript: readonly CareSummaryTurn[]): TriageLevel {
  let level: TriageLevel = 'self-care';
  for (const turn of transcript) {
    if (turn.role !== 'user') continue;
    const candidate = triageSymptoms(turn.text).level;
    if (TRIAGE_RANK[candidate] > TRIAGE_RANK[level]) level = candidate;
  }
  return level;
}

/** Prompt system instruction: a scribe for the reviewing doctor, never a final word. */
export const CARE_SUMMARY_SYSTEM_PROMPT = [
  'You write the case record of a family-doctor conversation for the attending human doctor to review.',
  'Return exactly one JSON object and nothing else, with these keys:',
  '{"summary": string, "impression": string, "conditions": string[], "recommendations": string[], "level": "emergency" | "urgent" | "routine" | "self-care"}.',
  'The impression is a tentative diagnostic direction, never a certainty; the human doctor confirms or corrects it.',
  'Keep every string in the language the patient used.',
].join(' ');

/** Renders the transcript and the patient facts into one summarization request. */
export function buildCareSummaryRequest(input: CareSummaryInput): string {
  const member = input.member;
  const allergies = member.allergies.length > 0 ? member.allergies.join(', ') : 'none recorded';
  const conditions = member.chronicConditions.length > 0 ? member.chronicConditions.join(', ') : 'none recorded';
  const medications = member.medications.length > 0 ? member.medications.join(', ') : 'none recorded';
  const attachments = (input.attachments ?? [])
    .map((attachment) => attachment.name + ' (' + attachment.kind + ')')
    .join(', ');
  const lines = [
    'Patient: ' + member.displayName + ' (' + member.relation + ', born ' + String(member.birthYear) + ').',
    'Known allergies: ' + allergies + '. Chronic conditions: ' + conditions + '. Current medications: ' + medications + '.',
    attachments ? 'Attachments: ' + attachments + '.' : 'Attachments: none.',
    'Conversation:',
    ...input.transcript.map((turn) => (turn.role === 'user' ? 'Patient: ' : 'Doctor: ') + turn.text),
  ];
  return lines.join('\n');
}

/** Strips a Markdown fence and keeps the outermost JSON object. */
function jsonCandidate(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return text.slice(start, end + 1);
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Parses the agent's JSON answer. The model may lower the urgency, so the
 * deterministic transcript level is applied as a floor, never as a ceiling.
 */
export function parseCareSummaryReply(raw: string, input: CareSummaryInput): CareSummaryDraft | null {
  const candidate = jsonCandidate(raw);
  if (!candidate) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const value = parsed as Record<string, unknown>;
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const impression = typeof value.impression === 'string' ? value.impression.trim() : '';
  if (!summary || !impression) return null;
  const floor = careTranscriptLevel(input.transcript);
  const modelLevel = isTriageLevel(value.level) ? value.level : 'routine';
  const level = TRIAGE_RANK[modelLevel] >= TRIAGE_RANK[floor] ? modelLevel : floor;
  const notes = typeof value.notes === 'string' ? value.notes.trim() : '';
  return Object.freeze({
    summary,
    source: 'hosted',
    diagnosis: Object.freeze({
      impression,
      conditions: Object.freeze(textArray(value.conditions)),
      recommendations: Object.freeze(textArray(value.recommendations)),
      level,
      ...(notes ? { notes } : {}),
    }),
  });
}

function translated(
  translate: CareTranslate | undefined,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string | null {
  if (!translate) return null;
  const value = translate(key, params);
  return typeof value === 'string' && value.trim().length > 0 && value !== key ? value : null;
}

/**
 * Deterministic on-device summary used when no agents deployment answers. It
 * never invents a diagnosis: the impression states plainly that a doctor must
 * assess the patient, and the recommendations come from the shared triage rules.
 */
export function offlineCareSummary(input: CareSummaryInput, translate?: CareTranslate): CareSummaryDraft {
  const patientTurns = input.transcript.filter((turn) => turn.role === 'user' && turn.text.trim().length > 0);
  const level = careTranscriptLevel(input.transcript);
  const rawComplaint = patientTurns[0]?.text.trim() ?? '';
  const complaint = rawComplaint.length > 120 ? rawComplaint.slice(0, 117) + '...' : rawComplaint;
  const levelLabel = translated(translate, 'platform.care.level.' + level) ?? level;
  const summary = translated(translate, 'platform.care.medical.summaryOffline', {
    count: String(patientTurns.length),
    complaint: complaint || (translated(translate, 'platform.care.value.none') ?? 'none recorded'),
    level: levelLabel,
  }) ?? (
    'The conversation had ' + String(patientTurns.length) + ' patient messages. Main complaint: ' +
    (complaint || 'none recorded') + '. Triage level: ' + levelLabel +
    '. This summary is generated on the device and must be reviewed by a doctor.'
  );
  const impression = translated(translate, 'platform.care.medical.offlineImpression', {
    complaint: complaint || (translated(translate, 'platform.care.value.none') ?? 'none recorded'),
  }) ?? (
    'Tentative direction from the conversation: ' + (complaint || 'no symptom text') +
    '. No definitive diagnosis was made offline; the attending doctor must confirm or amend it.'
  );
  const condition = translated(translate, 'platform.care.medical.offlineCondition') ??
    'Needs clinician assessment with history and examination';
  return Object.freeze({
    summary,
    source: 'offline',
    diagnosis: Object.freeze({
      impression,
      conditions: Object.freeze([condition]),
      recommendations: Object.freeze(careTriageActions(level, translate)),
      level,
    }),
  });
}
