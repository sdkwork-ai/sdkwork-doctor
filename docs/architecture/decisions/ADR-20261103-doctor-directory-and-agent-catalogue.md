# ADR-20261103 — Doctor Directory As Deployment Content, And The Agent Catalogue

Status: accepted
Date: 2026-11-03
Owner: sdkwork-platform
Applies to: `apps/sdkwork-doctor-*`, `specs/doctor-directory.contract.json`, `specs/agents-app-api.contract.json`

## Context

The product needs two capabilities the earlier release did not have:

1. The 医生 tab must let a family choose **real human doctors** and start a
   human consultation. The family doctor is a person, not the agent.
2. The app should use more of the **sdkwork-agents** capability surface than one
   session plus one turn, and should be able to say whether the managed
   family-doctor agent exists in the current deployment.

There is no doctor or hospital service in this workspace, and the sdkwork-agents
app API has no human-handoff or clinician resource. Doctor owns no HTTP API
authority (`agent.app.config.json#backend.apiSurfaces` is empty). Fabricating
clinician identities inside the client would be dishonest; inventing a new
first-party doctor API would cross an API_SPEC boundary that this change is not
authorised to cross.

## Decision

### 1. The human-doctor roster is deployment content

A deployment binds a doctor-directory **document URL** through the public runtime
document key `careDoctorDirectoryUrl`. The document is plain JSON (schemaVersion 2) conforming to
`specs/doctor-directory.contract.json`. The client performs one `GET`, sends no
credentials, and treats the response as data:

- a valid document yields `source: 'directory'` and the operator's real roster;
- an empty URL, a failed request, or a document with no valid clinician yields
  the authored fallback roster at
  `contracts/doctor-roster.json` with `source: 'catalog'`;
- every surface renders the source badge, so a fallback never masquerades as a
  live directory.

The fallback roster carries `verified: false`. A directory entry may set
`verified: true`, meaning the operator vouched for it. The UI shows verified vs
unverified per clinician.

This keeps the app free of a new API surface (no app-api path, no envelope, no
token) while still connecting real clinicians through deployment configuration
that an operator controls. If a first-party doctor service is added later, it is
proposed as an app-api change under `API_SPEC.md` and replaces the document, not
the port.

### 2. Employment is an affiliation; the hospital is Appbase reference data

A doctor is a person (`DoctorProfile`), never a job. Each employment or practice
relationship is a `DoctorAffiliation` naming:

- `organizationId` — the Appbase organization unit that employs or contracts the
  clinician: the IAM/org scope that owns departments, staff roles, and
  permissions;
- `hospitalCode` — the Appbase `med_hospital` natural key. The hospital
  directory, grade, ownership, and the department catalog are Appbase medical
  reference data (`med_hospital`, `med_department`), not company records;
- `departmentCode` / `department`, `title`, `employmentType`
  (`full_time | part_time | contract | visiting`), `primary`,
  `acceptingNewPatients`, per-site `availability` and `channels`, and `since`.

`company` is **not** the clinical employer. `sdkwork-company` is the
enterprise/recruitment center with its own permission family
(`company.profiles.*`). A hospital may have a company record for procurement or a
commercial contract, but that record owns no clinical employment. An affiliation
may carry `companyId` only for that commercial relationship.

Consequences: one clinician can be full-time at a hospital and part-time at a
community clinic; the family chooses the site for a consultation; and the visit
record snapshots `doctorOrganizationId`, `doctorHospitalLabel`, and
`doctorEmploymentType` so the history stays accurate after the roster changes. A
pre-affiliation directory document is migrated into one primary full-time
affiliation instead of losing its doctors.
### 3. Selection is device-local

`specs/doctor-directory.contract.json#selection` pins the rules: up to five
selected doctors, the first selected becomes primary, the primary is always one
of the selected, removing the primary promotes the next, and pruning drops ids
that are no longer in the roster. The store is per-client (`localStorage`,
`SharedPreferences`/mini program storage) under
`sdkwork.doctor.doctor-selection.v1`, exactly like visit records.

### 4. The agent catalogue is a status probe, not a list UI

`agents.list` (`GET /app/v3/api/ai/agents`, operation pinned in
`specs/agents-app-api.contract.json`) is read once through the core-owned
`createCareAgentCatalog` port. The app uses it to show whether the pinned
`agent.family-doctor` agent is present and its status, in the 医生 and 我的 tabs.
It sends `page=1&page_size=20` and renders no paginated list, so this is not a
list/search feature under `PAGINATION_SPEC.md`; the query still uses the API's
offset mode so a later paginated catalogue UI can extend it without a contract
change.

Offline mode answers with an empty catalogue and performs no network call, so
the observable-mode rule (ADR-20261102) still holds.

## Alternatives Rejected

- **Hard-code a roster in each client.** Rejected: it makes "real human doctors"
  fictional and cannot be operated.
- **Add a doctor app-api now.** Rejected for this change: it requires an API
  authority, envelope, operation matrix, and validators that no service backs
  yet. The document contract is the narrowest honest seam.
- **Import sdkwork-agents UI packages.** Rejected: the sibling app packages are
  private workspace members, not published component packages; a cross-checkout
  import would violate the workspace-member protocol. The reuse surface is the
  block catalogue, the port shapes, and the pinned wire contract.

## Consequences

- Operators gain a single, documented knob (`careDoctorDirectoryUrl`) to publish
  real doctors without shipping a client change.
- The doctor tab is never empty: it degrades to the authored roster and says so.
- One more contract test (`tests/doctor-directory.test.mjs`) and one parity test
  keep the four clients' rosters and selection rules identical.
- The fallback roster is product copy, not real appointments: it carries
  `verified: false` and placeholder `care.sdkwork.com` channel links until a
  deployment binds a directory.
