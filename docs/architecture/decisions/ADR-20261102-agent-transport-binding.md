# ADR-20261102 Agent Transport Binding

Status: proposed
Date: 2026-11-02
Deciders: sdkwork-platform
Related: `APP_SDK_INTEGRATION_SPEC.md`, `SDK_SPEC.md`, `IAM_LOGIN_INTEGRATION_SPEC.md`, `ARCHITECTURE_DECISION_SPEC.md`

## Context

The family-doctor application needs a real agent conversation transport. Today `AgentConversationPort` is implemented only by the offline adapter in `@sdkwork/doctor-common-agent`, and the four surfaces (PC, H5, Flutter, mini program) mirror triage rules instead of calling a hosted agent.

Two candidate integrations were measured:

1. **Sibling workspace binding**: consume `apps/sdkwork-agents-*` packages through `../sdkwork-agents/...` workspace paths.
   - Measured closure: `sdkwork-agents/pnpm-workspace.yaml` declares **63** sibling SDKWork paths and its packages use `catalog:` specifiers that our workspace does not define.
   - Cost: registering the whole closure (or a hand-curated subset) plus a catalog large enough for the closure, then reinstalling. This is a foundation-stack migration, not an adapter.
2. **Published SDK binding**: `@sdkwork/agents-app-sdk` declares only two runtime dependencies (`@sdkwork/sdk-common ^1.0.8`, `@sdkwork/utils ^0.11.0`) and no `workspace:` protocol.
   - Cost: one dependency entry plus the token/base-URL wiring the SDK already expects; no sibling checkout and no catalog expansion.

## Decision

Bind the hosted agent through the **published `@sdkwork/agents-app-sdk`** package, and keep `AgentConversationPort` as the only surface-facing seam.

- `*-core` constructs the generated client from the runtime document (`agentsApiBaseUrl`) and the shared token manager; UI packages never import the SDK.
- The port implementation selection is explicit: hosted when a base URL and credential provider are present, offline `createLocalCareAgent()` otherwise. A silent fallback is forbidden; the selected mode is surfaced in the `Me` tab environment facts.
- Flutter and the mini program bind the same port shape to their own generated clients; the shared `contracts/triage-rules.json` remains the emergency vocabulary, and neither client may bypass it.

## Consequences

- No workspace/catalog expansion; `pnpm install` stays reproducible and offline adapter tests keep running.
- Credential wiring becomes the real dependency: IAM/appbase session plus an access token must exist before hosted chat is exercised end to end. Until then the hosted path is compiled but not runtime-verified.
- A future decision may replace the published binding with a sibling source binding once the fleet adopts a shared catalog; this ADR would then be superseded, not silently edited.

## Verification

- `pnpm typecheck` and `pnpm test` keep the offline adapter and the parity contract green.
- When the hosted adapter lands, add a contract test asserting that an emergency reply from the hosted client still carries `TriageLevel.emergency` and never suppresses the escalation.
