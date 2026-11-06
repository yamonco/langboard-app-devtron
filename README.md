# Langboard App — DevTron

Separately packaged Langboard app using only the public Langboard SDK/API. The
app owns DevTron deployment-history normalization. Langboard owns policy,
storage, authorization and replay.

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

The app is instance-generic: any HTTPS DevTron origin plus a read-only API
token discovers applications and environments, then one selected
application-environment scope produces signals.

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
npm run manifest
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

## Container delivery

The root `Dockerfile` packages the existing panel server with locked SDK packages
and a digest-pinned Node 22 image. The process runs as the unprivileged `node`
user on port 8780. Set `HOST_ORIGIN` to the exact Langboard HTTPS origin and
`PUBLIC_URL` to the panel's HTTPS origin in the tenant deployment. The default
container command enables the signal-publishing manifest profile.

Build the Dockerfile with your organization's image pipeline and deploy its
verified immutable digest through your DevTron tenant delivery path. A container build alone does not establish panel registration, board consent,
provider connectivity, or signal acceptance. `/manifest.json` supports unauthenticated
GET/HEAD and can be used for the container's HTTP readiness probe. Provider and
Langboard observation credentials belong in the separately scoped observer process;
the panel container does not need those credentials.

`deploy/chart` supplies the portable Deployment and ClusterIP Service for a native
Helm deployment through DevTron or an existing GitOps owner. The caller supplies an
immutable verified image digest, its source revision, the exact Langboard HTTPS
`hostOrigin` and the panel HTTPS `publicUrl`. No company URL is a chart default. For a private registry, supply standard
`imagePullSecrets` entries referencing existing tenant-managed Secrets.
`deploy/examples/values.yaml` is a synthetic render fixture. Keep real tenant
bindings in your deployment system, outside this public source repository.
The platform supplies the HTTPS route; host registration and board consent remain
Langboard-native operations.
The panel runs with a read-only filesystem, no Kubernetes token and bounded resources.
It requires no provider or Langboard observation credentials. DevTron visibility,
host registration and board consent remain separate acceptance steps.


## Product boundary and portability

This repository owns the integration product, SDK packages, provider adapter,
manifest, tests, container recipe and portable deployment chart. It has no runtime
dependency on a company control plane, private API, custom scheduler or executor.
Use your normal image build and deployment services with the standard Dockerfile
and Helm chart.

Any supported Langboard instance and HTTPS DevTron instance can be supplied through
configuration. The adapter discovers applications/environments from the selected
DevTron instance; no company-specific app IDs or board IDs are compiled into it.
Provider tokens remain in the operator-owned observer process. The panel uses
Langboard's SDK and authorization, with exact host-origin framing.

Render a portable fixture with:

```sh
helm template devtron-panel deploy/chart -f deploy/examples/values.yaml
```

 Native Helm/DevTron deployment uses explicit tenant values without importing
product implementation into an infrastructure control-plane repository.

## Native Helm application observations

For an app installed through DevTron's Chart Store, select its exact native
`installedAppId` rather than a CI/CD pipeline identity:

```sh
DEVTRON_ORIGIN=https://devtron.example LANGBOARD_HOST_ORIGIN=https://host.example \
  node observation.mjs init-helm 17 > config.json
```

The adapter reads `GET /orchestrator/application/deployment-history?installedAppId=17`,
checks the returned installed-app identity, and uses Helm revision and provider
`deployedAt` as evidence. It does not equate a successful Helm release with healthy
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

The upstream [Helm history adapter](https://github.com/devtron-labs/kubelink/blob/1859c74af205f28d8306cb1d4180f53d4ff56218/pkg/service/helmApplicationService/helmAppService.go)
returns Helm release status and `LastDeployed`. A Helm `deployed` status is
deployment evidence, not Pod-health proof. Pending
operations use the provider timestamp. `superseded`, `uninstalled`, `uninstalling`
and `unknown` do not preserve the original deployment outcome and are reported
as `provider_outcome_unavailable` rather than invented successes. Provider values,
user names, messages and image lists remain outside the published signals.
