# @sdkwork/doctor-common-diagnostics

Framework-neutral diagnostics contract shared by the SDKWork Doctor PC and H5 renderers.

- `src/types.ts` -check, result, and report contracts.
- `src/checks/` -one file per diagnostic check; checks receive a `DoctorRuntimeContext` and never reach into a UI framework.
- `src/registry.ts` -ordered check catalog.
- `src/runner.ts` -sequential runner with a per-check timeout and a typed failure result.

The package is browser-safe and has no runtime dependency. UI surfaces own presentation only.
