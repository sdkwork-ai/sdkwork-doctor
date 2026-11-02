import type { FamilyMember, TriageResult } from '@sdkwork/doctor-common-doctor';
import type { CareAgentMode } from './mode';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly createdAt: string;
  readonly triage?: TriageResult;
}

export interface AgentTurnContext {
  readonly member: FamilyMember;
}

/**
 * The single conversation seam every surface consumes. PC/H5 bind it to the
 * hosted sdkwork-agents app API; Flutter and mini program bind the same port to
 * their own clients. UI code never constructs a transport.
 *
 * `mode` is observable so no surface can silently claim a hosted conversation
 * while the offline adapter answers (ADR-20261102, specs/agent-integration.contract.json).
 */
export interface AgentConversationPort {
  readonly mode: CareAgentMode;
  readonly send: (input: string, context: AgentTurnContext) => Promise<ChatMessage>;
  readonly history: () => readonly ChatMessage[];
}

/** A configured conversation runtime: the selected mode plus its port. */
export interface CareAgentRuntime {
  readonly mode: CareAgentMode;
  readonly port: AgentConversationPort;
}
