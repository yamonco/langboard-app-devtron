# Deployment observation boundary

This integration has one supporting context: deployment observation. DevTron owns deployments and their occurrence times. Langboard owns board consent, resource access, signal storage, duplicate detection and panel authorization. This app translates and publishes evidence; it never becomes a deployment controller.

## Ubiquitous language

| Term | Meaning and owner |
| --- | --- |
| Deployment target | One explicitly selected native application/environment, installed application, or external Helm release. Provider identifiers are interpreted only by the DevTron adapter. |
| Deployment observation | An immutable outcome at a provider occurrence time, with a stable event identity. The pure model owns this meaning. |
| Signal envelope | A deployment observation bound to the current Langboard board, resource and consent revisions. The publisher composes this contract. |
| Publication receipt | Langboard's acceptance and duplicate result. Sending a request alone is not acceptance. |
| Recovery batch | The exact envelopes saved before publication. Explicit recovery resends these envelopes without re-reading the provider. |
| Deployment history | The authorized projection shown by the panel; it has no provider credential or deployment write authority. |

## Dependency direction

`DevTron snapshot -> provider-api.mjs -> deployment-observation.mjs`

`signals.mjs -> provider adapter + observation model + official publishing SDK`

`observation.mjs -> publication command + official durable signal store`

`server.mjs -> observation contract + static panel assets`

The model imports only the standard cryptographic primitive for its deterministic identity. Provider statuses, response wrappers and Helm identity semantics stay in the adapter. The publisher owns bounded batches and save-before-publish ordering. The panel uses the host's widgets and SDK; it does not reconstruct authorization or deployment outcomes.

## Repository and authority roles

The upstream SDK owns the published contract and host widgets; its vendored release artifacts and lockfile remain the contract inputs. This independent app owns the observation implementation and its small panel projection. The caller's deployment repository owns tenant values, immutable image promotion and secret references. No infrastructure control-plane implementation or tenant credentials are embedded here. The established SDK app layout is preserved instead of manufacturing empty layers or duplicating the SDK into new repositories.

`vibe-project.json` records allowed source imports and test ownership. Colocated tests run through Node's native discovery. The Vibe Carving project gate checks the full map when that tooling is available. Public CI has no private tooling dependency: its Node tests also inspect the pure model with Node's native module parser. This map is an implementation map, not an approval to move another system's authority.

## Compatibility and recovery

Existing CLI modes, configuration keys, SDK declarations, capabilities and event IDs remain unchanged. `normalizeDeployment` and `refreshDeployments` remain exported compatibility names from `signals.mjs`; implementation names are `deploymentObservationFromProvider` and `publishDeploymentObservations`. Provider interpretation itself has one owner. Legacy `wfr-` and `helm-...-revision-...` identifiers remain opaque lineage. A provider history version is not asserted to be the physical Helm revision.

Missing occurrence time and unreportable outcomes remain explicit omissions; no clock or success is invented. Provider HTTP failures retain bounded, credential-free diagnostics. GET history and read-only POST discovery share the same decoded-byte limit and redirect refusal. Board access, observer credential issuance and actual signal acceptance remain separate native operations.

## Native asset-packaging constraint

The pinned server SDK 0.1.6 copies every file below `public/` and exposes no asset-exclusion option. `panel-view.test.mjs` therefore mirrors `public/view.mjs`, and `signal-inbox.test.mjs` mirrors `public/inbox.mjs`, at the nearest non-published root. `vibe-project.json` machine-maps these exact subjects. All other tests remain beside their source. The package acceptance test rejects test files in the resulting ZIP. Remove this mirror constraint only when a pinned upstream packaging API excludes colocated tests; do not fork the SDK or copy its packager into this app.

## Read-only diagnosis and lifecycle

The panel's GET/HEAD routes and manifest are the read-only runtime diagnosis surface. `observation.mjs discover` validates and reads a bounded native inventory without writing the recovery batch or publishing a signal. Credential values are never included in the output.

The app creates no test cloud resources and has no production deletion command. Tests own disposable local temporary directories and remove them at teardown. Recovery batches belong to the caller and must not be reaped before publication is reconciled. Observation tests supply occurrence timestamps directly; no production clock or provider event is fabricated.
