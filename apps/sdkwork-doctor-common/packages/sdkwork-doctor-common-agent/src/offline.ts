import { triageSymptoms, type FamilyMember, type TriageResult } from '@sdkwork/doctor-common-doctor';
import type { AgentConversationPort, ChatMessage } from './types';

const SAFETY_LINE = 'This is general guidance, not a diagnosis. For emergencies call your local emergency number.';

function replyForTriage(triage: TriageResult, member: FamilyMember): string {
  const who = member.displayName === 'Me' ? 'you' : member.displayName;
  if (triage.level === 'emergency') {
    return 'Emergency red flag detected for ' + who + '. ' + triage.actions.join(' ') + ' ' + SAFETY_LINE;
  }
  if (triage.level === 'urgent') {
    return 'This needs a same-day clinician review for ' + who + '. ' + triage.actions.join(' ') + ' ' + SAFETY_LINE;
  }
  if (triage.level === 'routine') {
    return 'No red flag was found in what you described. ' + triage.actions.join(' ') + ' ' + SAFETY_LINE;
  }
  return 'Tell me the symptom, when it started, and how severe it is. ' + SAFETY_LINE;
}

/**
 * Offline adapter used by contract tests and by deployments that have no
 * agents API. It applies the shared triage rules before replying, so an
 * emergency message is never softened by conversational text.
 */
export function createLocalCareAgent(): AgentConversationPort {
  const messages: ChatMessage[] = [];
  return {
    mode: 'offline',
    history: () => messages,
    async send(input, context) {
      const text = input.trim();
      if (!text) {
        throw new Error('message must not be empty');
      }
      const triage = triageSymptoms(text);
      messages.push({ id: 'user-' + String(messages.length + 1), role: 'user', text, createdAt: new Date().toISOString(), triage });
      const reply: ChatMessage = {
        id: 'assistant-' + String(messages.length + 1),
        role: 'assistant',
        text: replyForTriage(triage, context.member),
        createdAt: new Date().toISOString(),
        triage,
      };
      messages.push(reply);
      return reply;
    },
  };
}
