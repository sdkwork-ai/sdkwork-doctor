import { triageSymptoms, type FamilyMember, type TriageResult } from '@sdkwork/doctor-common-doctor';
import type { CareTranslate } from './care-copy';
import { careOfflineAnswer } from './care-copy';
import { offlineCareSummary, type CareSummaryDraft, type CareSummaryInput } from './summary';
import type { AgentConversationPort, ChatMessage } from './types';

function replyForTriage(triage: TriageResult, member: FamilyMember, translate?: CareTranslate): string {
  return careOfflineAnswer(triage.level, member, translate);
}

/** Localization seam of the offline transport. */
export interface LocalCareAgentOptions {
  /** Host i18n translator; absent keeps the English fallback copy. */
  readonly translate?: CareTranslate;
}

/**
 * Offline adapter used by contract tests and by deployments that have no
 * agents API. It applies the shared triage rules before replying, so an
 * emergency message is never softened by conversational text.
 *
 * `summarize` produces the case-record draft deterministically: it states that
 * a doctor must assess the patient instead of inventing a diagnosis.
 */
export function createLocalCareAgent(options: LocalCareAgentOptions = {}): AgentConversationPort {
  const messages: ChatMessage[] = [];
  return {
    mode: 'offline',
    history: () => messages,
    sessionId: () => null,
    async send(input, context) {
      const text = input.trim();
      const attachments = context.attachments ?? [];
      if (!text && attachments.length === 0) {
        throw new Error('message must not be empty');
      }
      const triage = triageSymptoms(text || attachments.map((attachment) => attachment.name).join(' '));
      messages.push({
        id: 'user-' + String(messages.length + 1),
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
        triage,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      const reply: ChatMessage = {
        id: 'assistant-' + String(messages.length + 1),
        role: 'assistant',
        text: replyForTriage(triage, context.member, options.translate),
        createdAt: new Date().toISOString(),
        triage,
      };
      messages.push(reply);
      return reply;
    },
    async summarize(input: CareSummaryInput): Promise<CareSummaryDraft> {
      return offlineCareSummary(input, options.translate);
    },
    reset() {
      messages.length = 0;
    },
  };
}
