# Applications

## Primary App Surface

`sdkwork-doctor-pc` is the primary large-screen surface; `sdkwork-doctor-h5` is the phone-first surface of the same Adaptive Web product. Together they satisfy the required browser PC+H5 pair from `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`: mobile clients fall back to H5, desktop clients fall back to PC.

## Directory Index

| Root | Architecture | Standard | Purpose |
| --- | --- | --- | --- |
| `sdkwork-doctor-common/` | shared | `APPLICATION_SPEC.md`, `MODULE_SPEC.md` | Cross-surface TypeScript contracts. Currently `packages/sdkwork-doctor-common-diagnostics`: check vocabulary, default catalog, registry, and runner. Not a runnable surface. |
| `sdkwork-doctor-pc/` | PC browser (+ future desktop/tablet hosts) | `APP_PC_ARCHITECTURE_SPEC.md` | PC renderer: sidebar shell, overview/checks/environment pages, runtime-env documents, `dist/standalone/<env>` and `dist/cloud/<env>` builds. |
| `sdkwork-doctor-h5/` | H5 mobile browser (+ future Capacitor host) | `APP_H5_ARCHITECTURE_SPEC.md` | Phone-first renderer: app bar, bottom tabs, safe-area layout, same diagnostics catalog, runtime-env documents. |
| `sdkwork-doctor-mini-program/` | WeChat mini program | `MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md` | Three-tab projection (`conversation`, `doctor`, `profile`) with the same route identity as PC/H5. |

Each application root owns `AGENTS.md`, `.sdkwork/`, `specs/component.spec.json`, `tests/`, and its `config/browser/` runtime-env examples. No native host package exists yet; when one is added it lands inside the owning surface root as `packages/sdkwork-doctor-<surface>-tauri`, `-electron`, `-capacitor`, or as the H5 Capacitor package.

## Verification

```bash
pnpm --dir apps/sdkwork-doctor-pc typecheck
pnpm --dir apps/sdkwork-doctor-h5 typecheck
pnpm --dir apps/sdkwork-doctor-pc build
pnpm --dir apps/sdkwork-doctor-h5 build
node ../sdkwork-specs/tools/check-apps-directory-index.mjs --root ..
```

Authority: `SDKWORK_WORKSPACE_SPEC.md` section 1.1, `DOCUMENTATION_SPEC.md` section 3.3, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`.
