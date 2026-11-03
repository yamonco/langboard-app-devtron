import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { signalPublisher, signalStore } from '@langboard/app-server';
import { devtronApi, DevtronReadError } from './provider-api.mjs';
import { refreshDeployments } from './signals.mjs';

/** Operator-owned mapping, bounded read batch, explicit durable recovery only. */
export async function runObservation({ path, config, credentials, resend = false }, request = fetch) {
  const host = { origin: config.hostOrigin, token: credentials.hostToken };
  const publish = signalPublisher(host, request);
  const store = signalStore(path, { origin: config.hostOrigin, providerOrigin: config.providerOrigin, ...config.scope });
  if (resend) {
    const receipts = [];
    for (const envelope of await store.load()) receipts.push(await publish(envelope));
    return { receipts };
  }
  return refreshDeployments({ api: devtronApi({ origin: config.providerOrigin, token: credentials.providerToken }, request),
    scope: config.scope, host, saveEnvelopes: envelopes => store.save(envelopes) }, request);
}

/** Operator-owned observation config from explicit selection. Tokens stay in the environment. */
export function buildConfig(env = process.env, { appId, environmentId, installedAppId } = {}) {
  const positiveInt = value => Number.isInteger(value) && value >= 1 && value <= 1_000_000_000;
  if (installedAppId !== undefined ? !positiveInt(installedAppId) : (!positiveInt(appId) || !positiveInt(environmentId))) throw new Error('Invalid application-environment selection');
  const origin = new URL(env.DEVTRON_ORIGIN || '');
  if (origin.protocol !== 'https:' || origin.origin !== (env.DEVTRON_ORIGIN || '')) throw new Error('DEVTRON_ORIGIN must be an exact HTTPS origin');
  const host = new URL(env.LANGBOARD_HOST_ORIGIN || '');
  if (!['http:', 'https:'].includes(host.protocol) || host.origin !== (env.LANGBOARD_HOST_ORIGIN || '')) throw new Error('LANGBOARD_HOST_ORIGIN must be an exact HTTP(S) origin');
  return { hostOrigin: host.origin, providerOrigin: origin.origin,
    scope: installedAppId !== undefined ? { installedAppId, externalId: `helm-app-${installedAppId}`, limit: 50 } : { appId, environmentId, externalId: `app-${appId}-env-${environmentId}`, limit: 50 } };
}

/** Generic discovery without a saved batch: read-only application-environment listing. */
export async function runDiscovery(config, credentials, { search = '', offset = 0, size = 50 } = {}, request = fetch) {
  const api = devtronApi({ origin: config.providerOrigin, token: credentials.providerToken }, request);
  return api.listApplications({ search, offset, size });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, configPath, outputPath, extra] = process.argv.slice(2);
  if (!['observe', 'resend', 'discover', 'init', 'init-helm'].includes(mode) || !configPath || (mode !== 'discover' && mode !== 'init' && mode !== 'init-helm' && !outputPath) || extra) {
    console.error('Usage: observation.mjs observe|resend CONFIG FILE | discover CONFIG [SEARCH] | init APP_ID ENV_ID | init-helm INSTALLED_APP_ID'); process.exitCode = 2;
  } else {
    try {
      const credentials = { hostToken: process.env.LANGBOARD_APP_TOKEN, providerToken: process.env.DEVTRON_READ_TOKEN };
      if (mode === 'init' || mode === 'init-helm') {
        const appId = Number(configPath), environmentId = Number(outputPath);
        const result = buildConfig(process.env, mode === 'init-helm' ? { installedAppId: appId } : { appId, environmentId });
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
      const file = await readFile(configPath);
      if (file.length > 16384) throw new Error('Configuration exceeds limit');
      const config = JSON.parse(file);
      if (mode === 'discover') {
        const result = await runDiscovery(config, credentials, { search: outputPath || '' });
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        const result = await runObservation({ path: outputPath, config, resend: mode === 'resend', credentials });
        process.stdout.write(JSON.stringify({ ...result, receipts: result.receipts.map(({ signal_uid, duplicate }) => ({ signal_uid, duplicate })) }) + '\n');
      }
      }
    } catch (error) {
      if (error instanceof DevtronReadError) console.error(error.message);
      console.error('Operation failed; inspect provider and host state before an explicit retry.'); process.exitCode = 1; }
  }
}
