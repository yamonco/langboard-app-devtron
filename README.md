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
