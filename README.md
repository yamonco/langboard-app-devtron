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

Optional workflow-card and signal-publishing profiles require a separately
deployed HTTPS `PUBLIC_URL`:

```sh
PUBLIC_URL=https://devtron-panel.example npm run package -- --workflow-cards
PUBLIC_URL=https://devtron-panel.example npm run package -- --publish-signals dist/app.zip
```

## Container delivery

The root `Dockerfile` packages the existing panel server with locked SDK packages
and a digest-pinned Node 22 image. The process runs as the unprivileged `node`
user on port 8780. Set `HOST_ORIGIN` to the exact Langboard HTTPS origin and
`PUBLIC_URL` to the panel's HTTPS origin in the tenant deployment. The default
container command enables the signal-publishing manifest profile.

Build this Dockerfile through the company's approved BuildPlane project profile.
Deploy the resulting verified image digest through the DevTron tenant delivery
path. A container build alone does not establish panel registration, board consent,
provider connectivity, or signal acceptance. `/manifest.json` supports unauthenticated
GET/HEAD and can be used for the container's HTTP readiness probe. Provider and
Langboard observation credentials belong in the separately scoped observer process;
the panel container does not need those credentials.

`deploy/chart` supplies the portable Deployment and ClusterIP Service for a native
Helm deployment through DevTron or an existing GitOps owner. The caller supplies an
immutable verified image digest, its source revision, the exact Langboard HTTPS
`hostOrigin` and the panel HTTPS `publicUrl`. No company URL is a chart default.
`deploy/examples/values.yaml` is a synthetic render fixture. The explicit company
binding belongs to `deploy/tenants/yamon.yaml` in this independent repository.
The platform supplies the HTTPS route; host registration and board consent remain
Langboard-native operations.
The panel runs with a read-only filesystem, no Kubernetes token and bounded resources.
It requires no provider or Langboard observation credentials. DevTron visibility,
host registration and board consent remain separate acceptance steps.


## Product boundary and portability

This repository owns the integration product, SDK packages, provider adapter,
manifest, tests, image and deployment chart. FractalOps does not contain its app
code, provider mappings, host policy, app-specific Argo project or release values.
The owning organization may use its normal image CI; that is a build service,
not a runtime dependency or an additional application authority.

Any supported Langboard instance and HTTPS DevTron instance can be supplied through
configuration. The adapter discovers applications/environments from the selected
DevTron instance; no company-specific app IDs or board IDs are compiled into it.
Provider tokens remain in the operator-owned observer process. The panel uses
Langboard's SDK and authorization, with exact host-origin framing.

Render a portable fixture with:

```sh
helm template devtron-panel deploy/chart -f deploy/examples/values.yaml
```

 Select `deploy/tenants/yamon.yaml` explicitly only
for the company deployment. Native Helm/DevTron deployment of that chart does not
require adding product-specific resources to the FractalOps repository.
