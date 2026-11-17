# Source Configuration

`etc/` is the source-controlled deployment and runtime configuration root for the independently deployable surfaces of this repository (`SOURCE_CONFIG_SPEC.md`).

- `sdkwork.deployment.config.json` is the deployment profile index: it binds the two browser surfaces to the supported deployment profiles, lifecycle environments, and runtime targets, and declares every `standalone|cloud` x `development|test|staging|demo|production` profile.
- `topology/` carries the authored topology layers (`base.env`, `platform-profile` and `environments/<environment>` layers, `overrides/<profile-id>.env`) plus the resolved `<deployment-profile>.<environment>.env` profiles that the client env materializer reads. Regenerate the resolved profiles with `node ../sdkwork-specs/tools/materialize-topology-env.mjs --root .`; do not hand-edit them.
- `client-env.materialization.json` declares the repository's public-token carriers (PC, H5, Flutter, mini program).
- `../specs/topology.spec.json` declares the application topology archetype (`application-client-root`: no owned HTTP public ingress) and the platform API gateway cloud host.
- Concrete public browser values live beside each surface in `apps/sdkwork-doctor-*/config/browser/runtime-env.<deployment-profile>.<environment>.example.json`.
- Secrets, tokens, database URLs, and host-local overrides never belong in this directory.

## Client env materialization

`client-env.materialization.json` declares four token carriers and the format each
one materializes:

| Surface | Root | Carrier file |
| --- | --- | --- |
| PC browser | `apps/sdkwork-doctor-pc` | `.env.<deployment-profile>.<environment>` |
| H5 mobile browser | `apps/sdkwork-doctor-h5` | `.env.<deployment-profile>.<environment>` |
| Flutter mobile | `apps/sdkwork-doctor-flutter-mobile` | `env/sdkwork.<profile>.json` |
| WeChat mini program | `apps/sdkwork-doctor-mini-program` | `config/mini-program/runtime-env.<profile>.json` |

The token's `app_id`/`aud` comes from `SDKWORK_DEPLOY_APPLICATION_ID`, never from
a compiled-in literal (`APP_ACCESS_TOKEN_SPEC.md` §3.1.1): the deploy anchor is
owned by the installation, and the registrar writes it into
`etc/topology/overrides/<profile-id>.env` before re-running the materializer.
Materialize or verify the committed profiles with:

```sh
SDKWORK_DEPLOY_APPLICATION_ID=__SDKWORK_DEPLOY_APPLICATION_ID__ \
  node ../sdkwork-specs/tools/materialize-client-env.mjs --root . [--check]
```

The token carries the minimal `iam:self` bootstrap scope, matching
`backend.accessTokenPermissionScope` in `agent.app.config.json`.

The repository manifest `agent.app.config.json` owns identity and release metadata; it is not runtime configuration.
