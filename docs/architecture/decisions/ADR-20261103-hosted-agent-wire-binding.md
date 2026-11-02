# ADR-20261103 Hosted Agent Wire Binding

Status: accepted
Date: 2026-11-02
Deciders: sdkwork-platform
Supersedes: `ADR-20261102-agent-transport-binding.md` (SDK choice only; the port seam and mode rule stand)
Related: `APP_SDK_INTEGRATION_SPEC.md`, `SDK_SPEC.md`, `IAM_LOGIN_INTEGRATION_SPEC.md`, `ARCHITECTURE_DECISION_SPEC.md`, `specs/agents-app-api.contract.json`

## Context

`ADR-20261102` chose to bind hosted conversation through the published
`@sdkwork/agents-app-sdk` package. When the binding was implemented, that
package was not installable in this workspace:

- it is not in the registry cache and no other workspace member has it installed;
- it lives in the sibling `sdkwork-agents` checkout, and a `file:`/`link:` sibling
  dependency is forbidden by the workspace federation rule;
- adding it needs a registry publish or a shared catalog, which is a
  foundation change rather than an adapter.

At the same time the exact contract the client needs is available and stable in
that checkout: the app OpenAPI declares `agents.sessions.create` and
`agents.turns.stream`, the SDKWork success envelope, the SSE frames, and the
`assistant_output` item kind. The product requirement is a working family-doctor
conversation on four clients, not a dependency on one packaging choice.

## Decision

Bind the hosted port to the **documented sdkwork-agents app API wire contract**,
implemented inside the core-owned adapters, and pin the slice this application
depends on:

- `@sdkwork/doctor-common-agent` owns the TypeScript wire adapter
  (`createHostedCareAgent`): path builders, envelope unwrapping, `ProblemDetail`
  mapping, SSE parsing, idempotency fields, and the never-soften rule.
- Each client keeps its own transport behind the same port shape: PC/H5 through
  the core package, Flutter through `lib/agent/care_agent.dart`, the mini program
  through `src/lib/agent.js`. Every client sends the same fields and reads the
  same item kind.
- `specs/agents-app-api.contract.json` records the dependency: two operations,
  the required request fields, the enum values, the envelope, and the stream
  frames. `tests/agents-upstream-contract.test.mjs` compares it with the
  upstream OpenAPI and fails when upstream moves.
- The idempotency fingerprint is a frozen cross-runtime digest
  (`contracts/care-fingerprint-vectors.json`), not a per-client invention.

This is not a second SDK: no generated transport package, no new dependency, and
no sibling workspace member. The adapter is a port implementation whose authority
is the pinned upstream contract.

## Consequences

- `pnpm install` stays offline and reproducible; the four clients build without
  the sibling checkout present.
- The client owns envelope, error, and SSE mapping, so upstream drift is caught by
  a contract test rather than at runtime.
- The transport is verified end to end against an in-process conformance server
  that implements the pinned envelope, streaming frames, and problem responses.
  A live deployment transcript still needs a provisioned agents service plus an
  IAM token, which this workspace does not have.
- When a scoped composed facade (`@sdkwork/doctor-app-sdk`) is generated, the
  adapter is replaced inside the core package and the port shape does not change.

## Verification

```bash
pnpm typecheck
pnpm test        # includes hosted-agent-transport and agents-upstream-contract
pnpm check       # plus canonical specs validators
flutter analyze && flutter test
```
