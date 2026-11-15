# Packaged panel and optional legacy observation

This guide uses the public Langboard SDK and native host APIs. Supply your own
Langboard and DevTron HTTPS origins. Keep tenant settings and credentials outside
this repository. A compatible deployed host is required; an SDK version or a
passing package test alone does not establish compatibility.

## Installation boundary

Use the existing DevTron service. Install the official package in Langboard;
Langboard hosts its panel assets. No separate container, Helm release or panel
service is part of this installation.

Published release `v0.3.4` displays observations already published to Langboard.
This development branch adds a current-resource history view but remains
unreleased pending its official SDK update and installed-host acceptance. The pinned SDK's inbound
connection establishes host identity and permissions, not an outbound DevTron
REST proxy. Package installation alone therefore does not establish working
provider collection.

Standard installation uses the host's supported provider-connection and read
capabilities. [SDK #7](https://github.com/Langboard/sdk/pull/7) and
[host #248](https://github.com/Langboard/langboard/pull/248) are merged; #248 is
management discovery, not panel dispatch. The integrated host implements the
separate panel dispatch described below. The published app still uses its old
SDK and signal-only panel. The direct-read implementation on this branch needs
the corrected official SDK artifacts before release.
Do not require users to deploy, schedule or operate an observer to complete
standard installation.

The remaining connection, credential and observation steps describe an explicit
optional legacy publication path. Its one-shot CLI reads the selected DevTron
resource and publishes through the public SDK from an existing authorized
environment. Choosing that compatibility path does not complete acceptance of
observer-free provider reads and must not become a hidden installation dependency.

## Host-managed read migration

Use the native contracts rather than adding a panel server or a generic HTTP
proxy:

- The SDK session advertises `supportedOperations`. Call `connections.read`
  only when explicitly advertised. The input is
  `{ connection_uid, read_key: "deployments.list", input: { resource_uid, access_revision, limit } }`.
  Resource identities and current access revisions come from `resources.list`,
  not fixed instance configuration or cached permission assumptions.
- The host resolves the existing connection credential, accepts only its
  registered provider read, and checks current app, board, actor, resource,
  connection and secret authority before dispatch and again before returning.
  The frame receives bounded deployment metadata. It never receives a token,
  secret reference, URL, method or request headers.
- A successful response is `{ ok: true, data: { items } }`. A denied, stale or
  unavailable read must clear the displayed provider results. Do not silently
  substitute legacy observations as if they were a current provider response,
  automatically retry, or grant resource access from the panel.
- Verify native-CD, installed-Helm and external-Helm selections separately.
  Their deployment identities differ. Deployment success alone does not prove
  application health.

The source contracts are the
[SDK connection-read contract](https://github.com/Langboard/sdk/blob/e5b343384e4e1f5c6c1ff5ea84ae5476a814e788/docs/connection-reads.md),
[host dispatcher](https://github.com/Langboard/langboard/blob/966b8f17f67b12460d4419c4c70aa0f4787cb03f/src/api/langboard/apps/ConnectionReads.py)
and [Devtron response projection](https://github.com/Langboard/langboard/blob/966b8f17f67b12460d4419c4c70aa0f4787cb03f/src/api/langboard/apps/DevtronRead.py).
A deployed host must advertise support and authorize the actual selected resource;
a source reference or candidate SDK alone is insufficient.

The official panel candidate `0.2.8-rc.3` exports `dist/index.mjs`, while the
current app-server `0.1.6` packager copies the old root `index.mjs` directly.
Resolve that shared SDK packaging incompatibility through the SDK before
updating this app's lockfile. Do not repack the candidate, copy its internals
into this app, or add a separate observer as a workaround. Keep the existing
package usable until the corrected official artifacts and installed-consumer
packaging checks are available.

## Install the reviewed package

An authorized Langboard administrator selects DevTron in the official app catalog
and installs the reviewed release. Record its release tag, package digest and
native app revision. If the catalog entry is unavailable, catalog delivery is
incomplete. Stop this installation path until the host provides it.

For a reproducible installation, select an explicit reviewed release tag rather
than an unrecorded latest release. The native catalog key is `devtron-panel`.
The host exposes the following router-relative operations; use the API mount
published by your deployed host instead of assuming a prefix:

| Operation | Native route and input |
| --- | --- |
| Find the official entry | `GET /apps/catalog?key=devtron-panel` with an authorized user session |
| Inspect installed definitions | `GET /settings/apps/packages` with an administrator session |
| Install a reviewed release | `POST /settings/apps/packages/official/devtron-panel/install` with the reviewed `tag` and current `expected_revision` when updating an existing definition |

Read back the installed definition and its official package provenance before
proceeding. A locally uploaded ZIP does not establish official-catalog provenance.
Do not retry an installation whose outcome is unknown; inspect the installed
definition first. Record the returned app revision, not a revision copied from
another instance or computed from a different package.

The corresponding host contracts are
[AppPackageSettingsApi](https://github.com/Langboard/langboard/blob/da78bb1abd810f9932f7fe90b45071db9a0c1f13/src/api/langboard/routes/settings/AppPackageSettingsApi.py)
and [AppInboundConnectionApi](https://github.com/Langboard/langboard/blob/da78bb1abd810f9932f7fe90b45071db9a0c1f13/src/api/langboard/routes/settings/AppInboundConnectionApi.py).
These source references document the API contract; confirm that your deployed
host provides it before attempting installation.

The portable publishing package declares `panels.render`, `signals.read` and
`signals.publish`. It contains a host-served panel and needs no external panel
service or tenant URL. It does not include the observer or any credentials.
Installing a package does not approve a board, select a resource or start an
observation. Optional workflow-card capabilities are outside this guide.

## Connect and approve one exact resource

Use an authorized user session for host configuration, separate from the app
credential used for publication. The native host owns all permission checks.

1. Inspect the installed declaration and current app revision. An authorized
   connection owner creates or selects an inbound connection for `devtron-panel`
   through the native app settings. The native creation contract is
   `POST /settings/apps/registry/devtron-panel/inbound-connections`, with the
   current `app_revision` and, when applicable, the exact `organization_uid`.
   Read existing connections first; do not create another after an unknown result.
2. The board manager reviews and grants the three declared capabilities for the
   intended board. The Python SDK exposes `AppManager.prepare_consent` and
   `AppManager.set_consent`, using the current app and binding revisions.
   Consent applies only to the reviewed board and declaration.
   Native `POST /board/{board_uid}/settings/apps/devtron-panel/consent` prepares
   consent using `app_revision`. Native `PUT` to the same route applies the
   reviewed capabilities with the returned `app_revision`, `binding_uid` and
   `expected_revision`. A conflict requires a fresh read and review.
3. Discover or independently verify the exact DevTron application/environment or
   Helm installed-app identity using a suitably scoped read-only DevTron token.
   Select one `application` resource on the inbound connection through the native
   board settings. Its external ID must match the observer: `app-1064-env-146`
   for application 1064/environment 146, or `helm-app-17` for installed app 17.
   These numbers are examples, not defaults.
4. Read the native resource snapshot after selection. The native route is
   `GET /board/{board_uid}/settings/apps/devtron-panel/inbound-connections/{connection_uid}/resources`.
   Preserve the returned app revision, binding revision and selected resource UID.
   Re-read after any consent or selection change; old revisions do not grant access.
5. The connection owner explicitly issues a short-lived native app credential.
   The Python SDK provides `ConnectionCredentials.issue(connection_uid,
   expires_in_seconds=3600)` on a user-authenticated transport. Store its secret
   directly in your secret manager. Do not print the response or put the secret in
   the panel, configuration file, shell history, package or source control.

The generic inbound connection routes are native host contracts; they are not
provider discovery endpoints. DevTron discovery and history normalization remain
in this app's observer. The app credential cannot configure consent or impersonate
the human connection owner.

## Configure the observer

Initialize a non-secret configuration with one explicit selection:

```sh
DEVTRON_ORIGIN=https://devtron.example LANGBOARD_HOST_ORIGIN=https://host.example \
  node observation.mjs init-helm 17 > config.json
```

For a CI/CD pipeline use `init 1064 146` instead. Complete `config.json` using the
current native resource snapshot:

| Configuration field | Source |
| --- | --- |
| `hostOrigin` | Exact authorized Langboard HTTPS API origin |
| `providerOrigin` | Exact authorized DevTron HTTPS origin |
| `scope.installedAppId` | Explicit Chart Store installed-app selection; omit for a pipeline or external Helm release |
| `scope.helmAppId` | External Helm tuple `clusterId\|namespace\|releaseName`; mutually exclusive with pipeline and installed-app IDs |
| `scope.appId`, `scope.environmentId` | Explicit pipeline selection; omit for Helm |
| `scope.externalId` | Exact external ID selected on the native inbound resource |
| `scope.boardUID` | Intended Langboard board UID |
| `scope.resourceUID` | Selected native resource UID |
| `scope.appRevision` | Current native `app_revision` |
| `scope.bindingRevision` | Current native `binding_revision` |
| `scope.limit` | Bounded provider page size; initializer uses 50 |

The observer's `hostOrigin` (initialized from `LANGBOARD_HOST_ORIGIN`) targets the
Langboard API. Obtain that origin from your deployed host's documentation; it can
differ from the web UI origin. For optional external panel hosting only, the
standalone panel server's `HOST_ORIGIN` instead
identifies the web UI allowed to embed the panel. Supply each origin explicitly
for your installation; do not assume that an API request can use the UI address.

Inject `DEVTRON_READ_TOKEN` and `LANGBOARD_APP_TOKEN` through your approved secret
manager into the observer environment. Use a DevTron read-only credential scoped
to the selected resource, not a break-glass administrator credential. The panel
does not need either token. Install the locked dependencies with `npm ci` on the
approved observer execution system; the release ZIP is the panel package only.

## Observe and verify native receipts

Run once with a new durable batch path on persistent operator-owned storage:

```sh
node observation.mjs observe config.json observation.json
```

The SDK saves the normalized envelopes before sending them. Each successful
publication must return a native `signal_uid` and boolean `duplicate`. An HTTP
success without that receipt is an unknown outcome. Retain the file and reconcile
host state before an explicit resend:

```sh
node observation.mjs resend config.json observation.json
```

Recovery uses the saved envelopes. Do not replace the file by observing again
after an unknown outcome. Do not retarget a pending file to another origin, board,
resource or revision. The SDK rejects changed mappings. An ordinary new
observation also needs a new file; it does not overwrite an existing batch.

For acceptance, read the published signal in the authorized board inbox, confirm
its selected resource and deployment identity, and open the DevTron panel under
the same board permission. Explicitly resending an accepted envelope should return
the same signal identity with `duplicate: true`, without another inbox entry.
Test only the selected deployment evidence; a successful provider deployment record does not
prove Pod health. Package installation, provider read access, signal receipt and
authenticated panel display are separate acceptance results.

Retain non-secret release/source identities, native revisions, signal receipts and
the exercised checks. Revoke a temporary app credential after the test through
`ConnectionCredentials.revoke(connection_uid, credential_uid)`. Keep any batch
whose publication is still unknown for explicit reconciliation.


External Helm releases use `observation.mjs init-external-helm` as documented in
[the README](../README.md#external-helm-release-observations). Select the exact
`scope.externalId` emitted by initialization in the board resource settings.
This identity is distinct from both `helm-app-17` and a pipeline app/environment
identity. Existing release and namespace ownership are unchanged by observation.
