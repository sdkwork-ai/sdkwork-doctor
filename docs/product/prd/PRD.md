# SDKWork Doctor PRD

Status: draft
Owner: sdkwork-platform
Application: doctor
Updated: 2026-11-02
Specs: REQUIREMENTS_SPEC.md, DOCUMENTATION_SPEC.md

## 1. Background And Problem

SDKWork applications are Adaptive Web clients that run in many places: local development servers, standalone deployments, the cloud gateway, desktop shells, and mobile hosts. When a surface misbehaves, the cause is frequently environmental rather than product logic — a stale runtime profile, a blocked storage API, a locale mismatch, a skewed device clock, a plain-HTTP origin, a missing runtime-env document, or an API base URL that points at the wrong deployment profile.

Diagnosing those conditions today means opening browser devtools and checking each fact by hand, often through several conversations between an application developer, an operator, and a support engineer. The facts are cheap to collect but expensive to agree on, and support reports rarely include them.

## 2. Target Users

- **Application developers** verifying a new surface or a deployment-profile change before handing it to review.
- **Operators and support engineers** triaging a report from a deployed environment without remote access to the user's browser.
- **QA engineers** turning a "works on my machine" report into a reproducible environment record.

## 3. Goals And Non-Goals

Goals:

- Collect the environment facts that decide whether a SDKWork browser surface can bootstrap, in one place, in under a few seconds.
- Explain each finding in plain language with one actionable next step.
- Report a per-check status that a developer or operator can quote in an issue.
- Keep every check local: no diagnostic data leaves the browser.

Non-goals:

- Replacing application logs, metrics, or traces; Doctor reports on the client environment, not on backend health.
- Remote inspection of a user's device; the user runs the surface and reads the result.
- Automatic remediation. Doctor recommends; it does not rewrite configuration.
- Testing product features. Doctor checks the runtime substrate those features depend on.

## 4. Scope

In scope for the first release:

- Runtime profile and lifecycle environment consistency.
- Browser capability and secure-context checks.
- Local persistence availability.
- Locale metadata consistency.
- Clock sanity and timezone availability.
- API base-URL presence and transport safety.
- Runtime-env document reachability.

Out of scope for the first release:

- Authenticated checks that require an appbase IAM session.
- Backend API health probes.
- Desktop and mobile native host capability checks.
- Result export or sharing.

## 5. User Scenarios

1. A developer changes a surface to `cloud.development` and the page fails to load data. Doctor shows the runtime profile and API base URLs, proving whether the cloud document was served.
2. A support engineer asks a user to open Doctor. The user reads "Attention: the page is not a secure context" and the reproduction turns out to be a plain-HTTP staging host.
3. QA reports that dates render in the wrong language. Doctor shows the document language and navigator language disagree, pointing at the locale bootstrap.
4. A release candidate fails only on one laptop. Doctor shows the device clock is two years stale, explaining rejected tokens.

## 6. Success Metrics

- Time from "open Doctor" to "environment record in hand" under 30 seconds.
- At least one actionable hint on every non-healthy result.
- Zero network requests that carry user data or credentials.
- Every reported check maps to a documented standard or a documented product decision.

## 7. Phases

| Phase | Scope |
| --- | --- |
| P0 (this scaffold) | Shared check catalog, runner, PC and H5 surfaces, runtime-env documents, contract tests. |
| P1 | Appbase IAM session integration, authenticated checks, result copy/export. |
| P2 | Desktop and mobile host capability checks; native diagnostics bundle. |
| P3 | Optional backend probe checks through the generated app SDK. |

## 8. Linked Requirements

Requirements are recorded under `docs/product/requirements/` before implementation. Until then, the machine contracts in `apps/sdkwork-doctor-*/specs/component.spec.json` and the check catalog in `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-diagnostics/` are the authoritative scope.

## 9. Open Questions

- Should Doctor report a stable report id so support tickets can reference a specific run?
- Which checks require an authenticated session, and should they be visually separated from anonymous checks?
- Is a shareable, redacted report export required before P2, or is copy-to-clipboard sufficient?
- Should the catalog be extensible by dependency modules (for example Drive upload checks) through a plugin port?
