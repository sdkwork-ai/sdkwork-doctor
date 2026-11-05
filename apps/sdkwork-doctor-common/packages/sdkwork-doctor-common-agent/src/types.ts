import type { FamilyMember, MedicalAttachment, TriageResult } from '@sdkwork/doctor-common-doctor';
import type { CareAgentMode } from './mode';
import type { CareSummaryDraft, CareSummaryInput } from './summary';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly createdAt: string;
  readonly triage?: TriageResult;
  /** Files the patient attached to this turn; the bytes stay on the device. */
  readonly attachments?: readonly MedicalAttachment[];
}

export interface AgentTurnContext {
  readonly member: FamilyMember;
  readonly attachments?: readonly MedicalAttachment[];
}

/**
 * The single conversation seam every surface consumes. PC/H5 bind it to the
 * hosted sdkwork-agents app API; Flutter and mini program bind the same port to
 * their own clients. UI code never constructs a transport.
 *
 * `mode` is observable so no surface can silently claim a hosted conversation
 * while the offline adapter answers (ADR-20261102, specs/agent-integration.contract.json).
 *
 * `summarize` is how a patient ends a conversation: the same agent writes the
 * case record, and its diagnosis stays a draft until a doctor confirms it.
 */
export interface AgentConversationPort {
  readonly mode: CareAgentMode;
  readonly send: (input: string, context: AgentTurnContext) => Promise<ChatMessage>;
  readonly history: () => readonly ChatMessage[];
  /** Hosted session id once established; `null` for the offline adapter. */
  readonly sessionId: () => string | null;
  readonly summarize: (input: CareSummaryInput) => Promise<CareSummaryDraft>;
  /** Drops the transcript and, on the hosted transport, starts a new session. */
  readonly reset: () => void;
}

/** A configured conversation runtime: the selected mode plus its port. */
export interface CareAgentRuntime {
  readonly mode: CareAgentMode;
  readonly port: AgentConversationPort;
}
