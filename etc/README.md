# Source Configuration

`etc/` is the source-controlled deployment and runtime configuration root for the independently deployable surfaces of this repository (`SOURCE_CONFIG_SPEC.md`).

- `sdkwork.deployment.config.json` binds both browser surfaces to the supported deployment profiles, lifecycle environments, and runtime targets.
- Concrete public browser values live beside each surface in `apps/sdkwork-doctor-*/config/browser/runtime-env.<deployment-profile>.<environment>.example.json`.
- Secrets, tokens, database URLs, and host-local overrides never belong in this directory.

The repository manifest `agent.app.config.json` owns identity and release metadata; it is not runtime configuration.
