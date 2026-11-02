# SDKWork Doctor Documentation

## Audience Routing

| Reader | Read first | Then read |
| --- | --- | --- |
| Product or business | [product/prd/PRD.md](product/prd/PRD.md) | [product/requirements/](product/requirements/) |
| Architect | [architecture/tech/TECH_ARCHITECTURE.md](architecture/tech/TECH_ARCHITECTURE.md) | [architecture/decisions/](architecture/decisions/) |
| Developer | [guides/developer/README.md](guides/developer/README.md) | [engineering/plans/](engineering/plans/) |
| Operator | [guides/operator/README.md](guides/operator/README.md) | [runbooks/](runbooks/) |
| Integrator | [guides/integrator/README.md](guides/integrator/README.md) | repository `specs/` and app `specs/component.spec.json` |
| Agent | [../AGENTS.md](../AGENTS.md) | [INDEX.yaml](INDEX.yaml) |

## Canon Documents

| Document | Path |
| --- | --- |
| Product PRD | [product/prd/PRD.md](product/prd/PRD.md) |
| Technical architecture | [architecture/tech/TECH_ARCHITECTURE.md](architecture/tech/TECH_ARCHITECTURE.md) |

## Documentation Layers

- Working documents: `product/requirements/`, `architecture/decisions/`, `engineering/`.
- Guides: `guides/`.
- Evidence: `runbooks/`, `changelogs/`, `migrations/`, `releases/`.
- Extension: `domains/`.
- Archive: `archive/`.

Active documentation is the Canon pair plus the guides; every other directory holds placeholders until a real document lands. Machine contracts stay in `specs/` and the app manifests rather than being duplicated here.

## Related Specs

- `DOCUMENTATION_SPEC.md`
- `SDKWORK_WORKSPACE_SPEC.md`
- `REQUIREMENTS_SPEC.md`
- `ARCHITECTURE_DECISION_SPEC.md`

## Verification

```bash
node ../sdkwork-specs/tools/check-repository-docs-standard.mjs --root .
```
