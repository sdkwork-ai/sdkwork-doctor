# Repository Guidelines

## SDKWORK Soul

Read `../sdkwork-specs/SOUL.md` before executing tasks in this repository. Specs before memory, dictionary before context, stop on ambiguity, evidence before completion.

## SDKWORK Standards

Canonical SDKWORK specs path from this repository:

- `../sdkwork-specs/README.md`
- `../sdkwork-specs/SOUL.md`
- `../sdkwork-specs/AGENTS_SPEC.md`
- `../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`
- `../sdkwork-specs/REPOSITORY_BASELINE_SPEC.md`

Do not copy root standard bodies into this repository. If these relative paths do not resolve, stop and report the broken workspace layout.

## Application Identity

Read `agent.app.config.json` for application identity, registration, release metadata, install packages, and app-owned capabilities. Read `etc/sdkwork.deployment.config.json` for deployment profile bindings. Public runtime values live in each surface's `config/browser/runtime-env.<deployment-profile>.<environment>.example.json`; the app manifest is not runtime configuration authority.

## Local Dictionary Structure

- `AGENTS.md`: this agent entrypoint.
- `CLAUDE.md`, `GEMINI.md`, `CODEX.md`: tool compatibility shims that point here.
- `agent.app.config.json`: application identity and release surfaces.
- `.sdkwork/`: local skills, plugins, and workspace metadata; `local/` is ignored.
- `specs/`: repository-wide machine contracts.
- `apps/sdkwork-doctor-pc/`, `apps/sdkwork-doctor-h5/`: the browser application roots.
- `apps/sdkwork-doctor-common/`: cross-surface TypeScript contracts.
- `etc/`: source deployment configuration.
- `assets/`: store and catalog media roots.
- `scripts/`: repository development, clean, and verification entrypoints.
- `docs/`: Canon documentation.

## Documentation Canon

- [docs/README.md](docs/README.md)
- [docs/product/prd/PRD.md](docs/product/prd/PRD.md)
- [docs/architecture/tech/TECH_ARCHITECTURE.md](docs/architecture/tech/TECH_ARCHITECTURE.md)

## Spec Resolution Order

1. This `AGENTS.md`, then the nearest application-root `AGENTS.md` under `apps/`.
2. `agent.app.config.json` and `etc/sdkwork.deployment.config.json`.
3. `specs/README.md`, then the nearest module `specs/component.spec.json`.
4. `.sdkwork/README.md`, skills, and plugins when relevant.
5. `../sdkwork-specs/README.md` and only the task-specific root specs.
6. Implementation files.

Loading is dynamic and progressive: agents read this entrypoint, the nearest application `AGENTS.md`, and the identity/spec files first, then only the root specs the current task requires, and reach implementation files last. Language-specific specs are on-demand: load only the touched language and framework spec.

## Required Specs By Task Type

- Agent/workflow changes: `SOUL.md`, `AGENTS_SPEC.md`, `SDKWORK_WORKSPACE_SPEC.md`.
- Any code change: `CODE_STYLE_SPEC.md`, `NAMING_SPEC.md`, plus the touched language spec.
- TypeScript/Node: `TYPESCRIPT_CODE_SPEC.md`.
- PC renderer: `APP_PC_ARCHITECTURE_SPEC.md`, `APP_PC_REACT_UI_SPEC.md`.
- H5 renderer: `APP_H5_ARCHITECTURE_SPEC.md`, `APP_MOBILE_REACT_UI_SPEC.md`, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` for shared client changes.
- Frontend/UI: `FRONTEND_CODE_SPEC.md`, `FRONTEND_SPEC.md`, `UI_ARCHITECTURE_SPEC.md`.
- Runtime env, base URLs, or deployment profiles: `APP_RUNTIME_ENV_SPEC.md`, `BROWSER_RUNTIME_ENV_SPEC.md`, `CONFIG_SPEC.md`, `SOURCE_CONFIG_SPEC.md`.
- App identity, release, or packaging: `APP_MANIFEST_SPEC.md`, `APP_ASSETS_SPEC.md`, `RELEASE_SPEC.md`.
- API or SDK additions: `API_SPEC.md`, `SDK_SPEC.md`, `SDK_WORKSPACE_GENERATION_SPEC.md`, `TEST_SPEC.md`.
- List/search pagination: `PAGINATION_SPEC.md`, verified with `node ../sdkwork-specs/tools/check-pagination.mjs --workspace ..`.
- Commands or packaging: `PNPM_SCRIPT_SPEC.md` for the root command contract and `GITHUB_WORKFLOW_SPEC.md` for packaging workflow changes.

## Code Style Rules

Read `CODE_STYLE_SPEC.md` and `NAMING_SPEC.md` before code changes. Prefer strict types, explicit package exports, colocated contract tests, and existing package boundaries. Public package entrypoints are declared in `package.json#exports` and mirrored in `specs/component.spec.json#contracts.publicExports`. Build scripts, development runners, and `pnpm clean` follow `CODE_STYLE_SPEC.md` §7: clean removes only reproducible output and never git-tracked source.

## Build, Test, and Verification

- `pnpm install`
- `pnpm typecheck`
- `pnpm test`
- `pnpm check` — typecheck, tests, and the canonical specs validators in `scripts/verify-specs.mjs`.
- `pnpm verify` — `check` plus both browser builds.
- `pnpm build:pc` / `pnpm build:h5` — single-surface builds.

Record the exact commands and their output before reporting completion.

Root script names and their delegation rules follow `PNPM_SCRIPT_SPEC.md`; `pnpm check:specs` runs the canonical validators. Packaging and release workflow changes follow `GITHUB_WORKFLOW_SPEC.md` before any `.github/workflows` file is added.

## Agent Execution Rules

Keep business behavior in capability packages; `src/` is bootstrap and route composition only. UI packages never construct SDK clients, raw HTTP calls, or credential headers — the core package owns SDK ports. Do not deep-import another package's `src/`. Do not hand-edit generated SDK output. Stay within the owning package and update its `component.spec.json` when public exports or ports change.

## App SDK Consumer Imports

No generated HTTP SDK family is wired yet. When one is added it must be imported through the scoped composed facade (`@sdkwork/<application-code>-app-sdk`, and `@sdkwork/<application-code>-backend-sdk` only for `backend-admin` packages), never through generator transport package names, and the import is constructed in the core package only. Authority: `APP_SDK_INTEGRATION_SPEC.md` §9.

## HTTP API Response Envelope

SDKWork Doctor currently owns no HTTP API surface. When one is added, every `app-api`, `backend-api`, and SDKWork-owned business `open-api` operation follows `API_SPEC.md` §4.5, §14, and §15: `SdkWorkApiResponse` success envelopes with numeric `code: 0` and `traceId`, numeric `ProblemDetail` errors over HTTP 4xx/5xx, `data.item`/`data.items`+`data.pageInfo` payloads, and the standard operation matrix. Verify with `check-api-operation-patterns.mjs` and `check-api-response-envelope.mjs`.

## Human Review Rules

Request human review before changing public naming, package boundaries, runtime-env document shape, deployment profile behavior, or security/auth behavior; before deleting data, files, or release artifacts; and before making an exception to any SDKWork standard. Surface unresolved spec paths and open architectural decisions instead of guessing.

<!-- SDKWORK-DESTRUCTIVE-OPERATION-STANDARD: v1 -->
## Destructive Operation Safety

Authority: `../sdkwork-specs/DESTRUCTIVE_OPERATION_SPEC.md`.

Deletion must be explicit, enumerated, and reviewable. Deleting by pattern instead of by named
path is forbidden. Wildcards are for read-only commands only.

- `git rm -r`, `git rm` over a directory or pattern, and `git clean -f`/`-fd`/`-fdx` are
  FORBIDDEN. A recursive `git rm` stages many deletions in one index transaction; if the process
  is interrupted (SIGTERM, timeout, sandbox kill, crash) entries are already gone from disk while
  the index is only half-written, which is silent non-atomic mass data loss.
- Delete tracked files with `rm <exact/path>` on each named path, let `git status --short`
  record the `D` entries, then stage only the enumerated paths. Commit the deletion separately
  from functional changes.
- Shell and script deletion by wildcard is FORBIDDEN: `rm -rf`/`rm -r`/`rm -f` with
  `*`/`**`/`?`/`[...]`/brace expansion, `find ... -delete`, `find ... -exec rm`,
  `find ... | xargs rm`, `for f in *; do rm ...`, `del /S /Q`, `rd /S /Q`,
  `Remove-Item -Recurse -Force` on a glob, `shutil.rmtree`, `fs.rm(dir, { recursive: true })`,
  and `rimraf` over a glob.
- A deletion MUST NOT be combined in one shell invocation with a build, install, network, or
  publish step, and MUST NOT derive its targets from an unvalidated argument, environment
  variable, or configuration value.
- Permitted narrow deletion: `rm <exact/path>`; a short literal path list owned by the tool that
  declares it; the module's own generated artifacts through its owning tool
  (`pnpm clean`, `cargo clean`) per `CODE_STYLE_SPEC.md` §7; and
  `git restore --worktree --source=HEAD -- <exact paths>`.
- Required sequence before any deletion: enumerate exact paths; confirm every path resolves inside
  the active repository or module root; classify tracked/generated/cached/unknown; prefer `rm`
  plus tracked `git status`; delete in batches of 20 or fewer with a status check between
  batches; report the removed paths and the authorizing decision.
- Request explicit human confirmation before deleting any git-tracked path, any directory tree,
  any path resolving outside the active repository root, or more than 20 paths.
- Recovery after an accidental mass deletion: clear a stale `.git/index.lock`, write the path
  list to a file INSIDE the repository (never `/tmp` on Windows, where the Git Bash path space
  and the native tool path space disagree), and run a single
  `git restore --worktree --pathspec-from-file=<repo-relative-list>`. Never loop one
  version-control call per path; the same termination cause interrupts the loop part-way.

Verification (from the repository root):

```bash
node ../sdkwork-specs/tools/sync-agent-destructive-operation-standard.mjs --root . --check
```
<!-- /SDKWORK-DESTRUCTIVE-OPERATION-STANDARD: v1 -->

<!-- SDKWORK-ROLLBACK-RESTRICTION-STANDARD: v1 -->
## Rollback Restriction And Fix-Forward Discipline

Authority: `../sdkwork-specs/ROLLBACK_RESTRICTION_SPEC.md`.

Errors are fixed forward. Version-control history is never rewound to make an error disappear.

- A rollback is any operation that moves a ref, resets the index or the working tree to an earlier
  state, discards uncommitted or committed work, or rewrites published history. It is FORBIDDEN as
  the remedy for a defect — a build failure, a type error, a lint failure, a failing test, a merge
  conflict, a runtime regression, a bad refactor, or an unclear diff. Repair forward instead, by
  adding, editing, or restoring content through a new commit.
- FORBIDDEN by an agent or a human-issued command: `git reset --hard` in any form;
  `git reset --merge`/`--keep`; `git reset <ref>` that discards staged or working-tree content;
  `git checkout -f`, `git switch -f`, `git restore --source=<ref> --worktree .`;
  `git revert` as a reflex error remedy; `git stash drop`/`clear` and `git stash pop` over a
  conflict; `git branch -D` on a branch with unmerged work; `git update-ref -d` and direct
  `.git/refs/` edits; `git reflog expire`, `git gc --prune=now`, `git prune`;
  `git commit --amend` over a pushed commit; `git rebase`, `git rebase -i`, `git rebase --onto`;
  `git filter-branch`; `git push --force`, `git push --force-with-lease`, and
  `git push --delete`.
- A rollback is never inferred from context or tone. "Fix it", "it's broken", "this is a mess",
  "start over", "just revert it", and "退回" are not rollback instructions. If the intent is
  ambiguous, STOP and ask — including whether the instruction means to discard work or to restore
  lost work, because that distinction decides the permissible operation.
- Discarding work requires a separate, explicit, human-issued instruction that names the operation,
  the target ref, the discarded span, and the reason, and that acknowledges the loss. The
  authorization must be quoted in the commit message. A standing authorization is not accepted.
- Recovery is ADDITIVE: `git restore --worktree --source=<ref> -- <exact paths>`, or
  `git checkout <good-ref> --pathspec-from-file=<repo-relative-list>` with the list written inside
  the repository. The pathspec must be an explicit enumerated list — never a directory, glob, brace
  expansion, or the repository root — and a restore is never combined with a build, install,
  publish, or commit step in the same shell invocation.
- Before a bulk restore: commit any local modification as a checkpoint; create a backup branch AND a
  tag AND a patch file and verify they point at the pre-restore state; produce a written
  three-snapshot blob comparison (damaged revision vs its parent vs the candidate older snapshot)
  that separates REPLACED files from files the damaged revision legitimately AUTHORED; restore the
  relative complement, not the whole tree; and keep the files the damaged revision added.
- Never treat a local tracking ref as evidence about a remote. Confirm with
  `git ls-remote <remote> <branch>` and record the returned object id.
- After a restore, verify by content hash rather than by reading files, re-run the gates that cover
  the restored surface, and classify each remaining failure as caused-by-the-restore or
  pre-existing. A pre-existing claim must be proven by showing the same failure at the prior
  revision with `git show <ref>:<path>`, not reasoned about. Fix forward. Never un-restore.
- Never bypass a hook, signature, or gate with `--force`, `--no-verify`, or `--no-gpg-sign` to
  land a repair.

Verification (from the repository root):

```bash
node ../sdkwork-specs/tools/sync-agent-rollback-restriction-standard.mjs --root . --check
```
<!-- /SDKWORK-ROLLBACK-RESTRICTION-STANDARD: v1 -->

<!-- SDKWORK-MAIN-BRANCH-STANDARD: v1 -->
## Main-Branch Development

Authority: `../sdkwork-specs/REPOSITORY_BASELINE_SPEC.md` section 1.

Development happens on `main`. Everything authored in this repository is committed onto `main`.

- A working tree that receives authored content MUST have `main` checked out as its current branch
  for the whole time that work is in progress. Commit onto `main` directly; do not commit onto a
  branch a later merge is expected to bring in.
- A detached HEAD MUST NOT be used as a development venue. A commit created while HEAD is detached
  from every branch is reachable only through the reflog — absent from every branch history, from a
  fresh `git clone` of this repository, and from every other working tree — so the work it carries
  is one `git gc` away from being unrecoverable. Do not check out a bare commit, a tag, or an older
  ref in order to "get a clean starting point" and commit there.
- A side branch MUST NOT be used as a development venue either. There is no long-lived feature,
  release, maintenance, or personal branch, and this repository MUST NOT accumulate local commits
  that `main` cannot reach: making them findable would then depend on a merge that may never happen.
- A checkout off `main` is legitimate only while it stays read-only — a dependency or SDK pinned to
  an explicit commit, a release artifact checkout, or a bisect. No authored change is committed there.
- A working tree found detached, or on a branch other than `main`, with work in it is a STOP, not a
  cleanup. Do not move refs, do not rewrite history, and do not discard the commits. Report the
  branch, the commits, and the state, and let a human decide: moving commits onto `main` and
  discarding work are both governed by `../sdkwork-specs/DESTRUCTIVE_OPERATION_SPEC.md` and
  `../sdkwork-specs/ROLLBACK_RESTRICTION_SPEC.md`.

Verification (from the repository root):

```bash
node ../sdkwork-specs/tools/audit-repository-baseline.mjs --root . --only branch-main
node ../sdkwork-specs/tools/sync-agent-main-branch-standard.mjs --root . --check
```

The first fails when the current branch is anything other than `main`, and reports a detached HEAD
as `detached`. The second fails when this block is out of date.
<!-- /SDKWORK-MAIN-BRANCH-STANDARD: v1 -->

<!-- SDKWORK-NAMING-STANDARD: v1 -->
## Rust Naming And Dependency Declaration

Authority: `../sdkwork-specs/NAMING_SPEC.md` section 3.1 and section 3.2.

Two identifier planes exist in every Rust crate and they MUST NOT be mixed: the package plane
(Cargo, filesystem, lock file) uses kebab-case, and the crate plane (lib target, modules, source
imports) uses snake_case.

- `[package].name`, the crate directory, `[features]` keys, and `[[bin]].name` use kebab-case.
- `[lib].name`, module files, module directories, and Rust imports use snake_case.
- A crate whose `[package].name` contains a hyphen SHOULD declare `[lib].name` explicitly
  (default: package name with every `-` replaced by `_`). A shorter lib name is allowed only
  when declared explicitly and used consistently by every consumer.
- Cargo dependency keys, `[workspace.dependencies]` keys, and `Cargo.lock` entries use the
  dependency package name. Use `package = "..."` when an alias is required.
- Every external crate referenced by `src/` MUST be declared in that crate's `[dependencies]`.
  Test-only crates belong in `[dev-dependencies]`; `build.rs` crates belong in
  `[build-dependencies]`.
- Never delete a dependency line, and never demote one from `[dependencies]` to
  `[dev-dependencies]`, while `src/` still imports it. Verify manifest cleanups with the
  command below before committing them.
- Regenerate and commit `Cargo.lock` in the same change as any dependency table edit.

Verification:

```bash
node ../sdkwork-specs/tools/check-rust-crate-naming-standard.mjs --root .
```
<!-- /SDKWORK-NAMING-STANDARD: v1 -->

<!-- SDKWORK-SDK-GENERATION-STANDARD: v1 -->
## Generated SDK Output Is Generator-Owned

Authority: `../sdkwork-specs/SDK_SPEC.md` and `../sdkwork-specs/SDK_WORKSPACE_GENERATION_SPEC.md`.

Everything generated under `sdks/` — `generated/server-openapi/` trees, generated language
workspaces, `dist/` build output, generated `sdkwork-sdk.json`, generated
`.sdkwork/sdkwork-generator-*` reports, and standardizer-synced OpenAPI snapshots — is produced by
the canonical SDK generator `../sdkwork-sdk-generator/bin/sdkgen.js` (`@sdkwork/sdk-generator`).

- Do not hand-edit generated SDK files, including type definitions, dist bundles, and generated
  package metadata. Manual edits are overwritten by the next generation run and break
  reproducibility and contract audits.
- When generated or compiled SDK output does not meet a contract or standard, fix the upstream
  source — authored API contract, route manifest, OpenAPI authority, derived `*.sdkgen.*` input,
  generator profile, or `custom/` runtime build scripts — then regenerate through the standard
  generation command. Do not patch generated output in place.
- Remove stale generated files by re-running the family generation command, which owns cleanup of
  disappeared routes and models; do not hand-prune generated trees.
- The only approved handwritten surfaces are `custom/` roots inside generated workspaces and
  authored `composed/` facades outside `generated/server-openapi`.

Verification:

```bash
node ../sdkwork-specs/tools/sync-agent-sdk-generation-standard.mjs --root . --check
```
<!-- /SDKWORK-SDK-GENERATION-STANDARD: v1 -->
