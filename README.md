# Langboard App — DevTron

Separately packaged Langboard app using only the public Langboard SDK/API. The
app owns DevTron deployment-history normalization. Langboard owns policy,
storage, authorization and replay.

Install the official app package in Langboard and connect it to your existing
DevTron instance. Langboard serves the packaged panel; a separate panel server,
container, Helm release or public panel URL is not required for this path.
See [installation and API observation](docs/installation.md) for the separate
connection, resource selection and signal-publication steps.

Reads use the official DevTron Deployment History API:

- `GET {origin}/orchestrator/resource/history/deployment/cd-pipeline/v1`
- exact `application/devtron-application|id|{appId}` and `environment|id|{environmentId}`
  filter criteria
- `token` header authentication
- bounded responses and bounded signal batches

An administrator explicitly registers the packaged manifest. An authorized
organization manager connects the app and issues a short-lived credential. Each
board manager explicitly consents and selects exact resources. `observe`
publishes one signed observation using a separately scoped app credential.
Supply caller-owned authenticated sessions through the SDK transport; retain
credentials in your secret manager and never print or commit them.

Signals, inbox triage and app-owned cards are separate. This app does not
create cards automatically, enable transitions, request execution, claim card
ownership, or perform provider mutations. Archive retains external DevTron
state. Local unit tests do not prove deployed canary/provider acceptance.

## Generic discovery

The app is instance-generic: a configured HTTPS DevTron origin and an authorized
read-only API token discover applications and environments through the native
API, then one explicitly selected deployment target produces signals. The
instance must expose the native routes and response contracts documented below;
this is not a claim of compatibility with every DevTron version or custom fork.

```sh
DEVTRON_READ_TOKEN=... LANGBOARD_APP_TOKEN=... node observation.mjs discover config.json [SEARCH]
```

Build a validated observation config from an explicit selection; credentials
stay in environment variables and never enter the file:

```sh
DEVTRON_ORIGIN=https://devtron.example LANGBOARD_HOST_ORIGIN=https://host.example \
  node observation.mjs init 1064 146 > config.json
```

Discovery is read-only: `POST /orchestrator/app/list` with bounded pages.
Observation reads the selected scope's deployment history only.

## Development

```sh
npm ci
npm test
```

A host-served signal-publishing package needs no external panel service or tenant
URL. The organization and each board still approve the declared publishing
capability; the observer uses its separately scoped app credential:

```sh
npm run package -- --publish-signals dist/app.zip
```

The optional workflow-card profile retains its explicit external HTTPS binding:

```sh
PUBLIC_URL=https://devtron-panel.example npm run package -- --workflow-cards
```

Supplying `PUBLIC_URL` for a publishing package retains that explicit external
trust target. Without it, the static package declares no external data origins.
The default package remains read-only.

## Panel preview

Langboard serves the official package. This app has no container image or Helm
release to deploy. For local panel development only, `node server.mjs
--publish-signals` previews the static assets; it does not collect DevTron data.
Validate the installation artifact with the SDK packaging command above.

## Product boundary and portability

This repository owns the integration product, SDK packages, provider adapter,
manifest and tests. It has no runtime
dependency on a company control plane, private API, custom scheduler or executor.
The standard installation uses the Langboard-hosted package and the existing
DevTron API. No separate panel deployment is required.

Any supported Langboard instance and HTTPS DevTron instance can be supplied through
configuration. The adapter discovers applications/environments from the selected
DevTron instance; no company-specific app IDs or board IDs are compiled into it.
Provider tokens remain in the operator-owned observer process. The panel uses
Langboard's SDK and authorization, with exact host-origin framing.

Employee login, identity-provider configuration, registry and build-cache setup,
build infrastructure, and deployment orchestration belong to the installation.
The app does not require a particular SSO provider, secret manager, registry,
cluster layout, or company control plane. Use an existing Kubernetes Secret or
another operator-managed credential source to supply the observer's environment;
neither choice adds a product dependency. Tenant URLs, resource selections and
secret references stay in installation configuration outside this repository.

If an installation exposes a different API contract, report that incompatibility
explicitly. Shared adapter changes must follow a native DevTron contract and be
tested with synthetic instance data; do not add tenant-name checks, fixed resource
IDs, private API fallbacks or authentication bypasses.

## Native Helm application observations

For an app installed through DevTron's Chart Store, select its exact native
`installedAppId` rather than a CI/CD pipeline identity:

```sh
DEVTRON_ORIGIN=https://devtron.example LANGBOARD_HOST_ORIGIN=https://host.example \
  node observation.mjs init-helm 17 > config.json
```

The adapter reads `GET /orchestrator/application/deployment-history?installedAppId=17`,
checks the returned installed-app identity, and uses the provider history version
and returned `deployedAt` as evidence. A DevTron-managed history version can differ
from the physical Helm release revision; treat it as an opaque provider identity. It does not equate a successful Helm release with healthy
Pods. Provider user names, values, messages and image lists are omitted from signals.
Add the Langboard board/resource/revision bindings obtained through authorized SDK
registration and board consent before running `observe`; initialization does not
create or authorize those bindings.

See [official installation and observation acceptance](docs/installation.md) for
the host setup, exact configuration fields, receipt checks and explicit recovery.

## External Helm release observations

Releases discovered by DevTron can exist without a Chart Store installation.
Select their native `clusterId|namespace|releaseName` identity explicitly:

```sh
DEVTRON_ORIGIN=https://devtron.example LANGBOARD_HOST_ORIGIN=https://host.example \
  node observation.mjs init-external-helm '7|team-a|sample' > config.json
```

This mode reads the official
`GET /orchestrator/application/deployment-history?appId=...` route. It never
converts the tuple into a numeric `installedAppId`. Use the generated opaque
`scope.externalId` when selecting the Langboard resource; different namespaces
and releases have different stable identities. Board consent and a scoped
provider credential are still required.

The upstream handler authorizes the selected tuple. History for an unlinked
external release does not include `installedAppInfo` or echo the release identity;
the adapter binds events to the exact configured query rather than claiming an
independent response identity check. See the pinned
[selector and authorization handler](https://github.com/devtron-labs/devtron/blob/58f2ae2ba25d8ba54a1b3d02ba91923cfe0adf8d/api/appStore/deployment/CommonDeploymentRestHandler.go)
and [history response construction](https://github.com/devtron-labs/devtron/blob/58f2ae2ba25d8ba54a1b3d02ba91923cfe0adf8d/pkg/appStore/installedApp/service/AppStoreDeploymentService.go).

For an unlinked external release, the upstream [Helm history adapter](https://github.com/devtron-labs/kubelink/blob/1859c74af205f28d8306cb1d4180f53d4ff56218/pkg/service/helmApplicationService/helmAppService.go)
returns Helm release status and `LastDeployed`. A Helm `deployed` status is
deployment evidence, not Pod-health proof. Linked releases may return managed
history versions and statuses instead; neither the version nor timestamp is
claimed to be an independently verified Helm revision or readiness result. Pending
operations use the provider timestamp. `superseded`, `uninstalled`, `uninstalling`
and `unknown` do not preserve the original deployment outcome and are reported
as `provider_outcome_unavailable` rather than invented successes. Provider values,
user names, messages and image lists remain outside the published signals.

## Release version contract

`package.json` is the single app-version source for every declaration profile.
The official catalog accepts a release tag only when its version (without the
leading `v`) matches `manifest.json` → `declaration.version`. Archive
`package_version` is a format version and does not replace this check.

Set the app version with `npm version <version> --no-git-tag-version`, commit it,
and use the publishing ZIP from the successful CI for that exact source. Publish
under `v<package.json version>`. Do not reuse an older publishing ZIP under a new
tag, even when the observer change leaves panel code and capabilities unchanged.
The package test verifies declaration and app-version agreement.

## Code ownership

See [deployment observation boundaries and vocabulary](docs/architecture.md) for the model, adapter, publication, panel and test owners. Run `npm test`; no custom test profile is required.
