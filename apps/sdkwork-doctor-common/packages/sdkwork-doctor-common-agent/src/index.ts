export type { ChatMessage, ChatRole, AgentTurnContext, AgentConversationPort, CareAgentRuntime } from './types';
export { createLocalCareAgent } from './offline';
export {
  CARE_SUMMARY_SYSTEM_PROMPT,
  buildCareSummaryRequest,
  careTranscriptLevel,
  offlineCareSummary,
  parseCareSummaryReply,
} from './summary';
export type {
  CareDiagnosisDraft,
  CareSummaryAttachment,
  CareSummaryDraft,
  CareSummaryInput,
  CareSummaryTurn,
} from './summary';
export {
  createHostedCareAgent,
  buildFamilyDoctorSystemPrompt,
  composeSafeReply,
  resolveReplyTriage,
  FAMILY_DOCTOR_AGENT_ID,
  CareAgentTransportError,
  CareAgentAuthError,
  CareAgentHttpError,
  CareAgentContractError,
  CareAgentTurnFailedError,
} from './hosted';
export type {
  CareAgentAccessTokenPort,
  CareAgentFetch,
  CareAgentHttpResponse,
  CareAgentRequestInit,
  HostedCareAgentOptions,
} from './hosted';
export { createCareAgentRuntime } from './runtime';
export type { CreateCareAgentRuntimeOptions } from './runtime';
export {
  careComposeHostedReply,
  careDescribePrompt,
  careEmergencyLead,
  careEmergencyLeadFor,
  careNoRedFlag,
  careOfflineAnswer,
  careSafetyLine,
  careTriageActions,
  careUrgentLeadFor,
  careWhoLabel,
  careWhoSelf,
} from './care-copy';
export type { CareTranslate } from './care-copy';
export {
  CARE_AGENTS_API_PREFIX,
  CARE_AGENT_SESSION_KIND,
  CARE_AGENT_TURN_MODE,
  CARE_AGENT_ASSISTANT_ITEM_KIND,
  CARE_AGENT_NON_ANSWER_ITEM_KINDS,
  CARE_AGENT_STREAM_QUERY,
  careAgentsSessionsPath,
  careAgentsTurnPath,
  resolveCareAgentsBaseUrl,
} from './contract';
export type {
  CareAgentApiEnvelope,
  CareAgentCreateSessionRequest,
  CareAgentCreateTurnRequest,
  CareAgentEntrySurface,
  CareAgentProblemDetail,
  CareAgentSessionItem,
  CareAgentSessionRecord,
  CareAgentTurnExecutionItem,
  CareAgentTurnRecord,
  CareAgentTurnStreamFrame,
} from './contract';
export { careFingerprint, canonicalTurnPayload, careSessionPayloadHash, careTurnPayloadHash } from './fingerprint';
export {
  CARE_AGENT_CATALOG_PAGE_SIZE,
  CARE_AGENT_CATALOG_PATH,
  createCareAgentCatalog,
  findCareAgent,
} from './catalog';
export type {
  CareAgentCatalogPort,
  CareAgentHttpGet,
  CareAgentSummary,
  CreateCareAgentCatalogOptions,
} from './catalog';
export * from './mode';
