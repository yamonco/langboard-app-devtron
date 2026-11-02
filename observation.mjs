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

/** Generic discovery without a saved batch: read-only application-environment listing. */
export async function runDiscovery(config, credentials, { search = '', offset = 0, size = 50 } = {}, request = fetch) {
  const api = devtronApi({ origin: config.providerOrigin, token: credentials.providerToken }, request);
  return api.listApplications({ search, offset, size });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, configPath, outputPath, extra] = process.argv.slice(2);
  if (!['observe', 'resend', 'discover'].includes(mode) || !configPath || (mode !== 'discover' && !outputPath) || extra) {
    console.error('Usage: observation.mjs observe|resend CONFIG FILE | discover CONFIG [SEARCH]'); process.exitCode = 2;
  } else {
    try {
      const file = await readFile(configPath);
      if (file.length > 16384) throw new Error('Configuration exceeds limit');
      const config = JSON.parse(file);
      const credentials = { hostToken: process.env.LANGBOARD_APP_TOKEN, providerToken: process.env.DEVTRON_READ_TOKEN };
      if (mode === 'discover') {
        const result = await runDiscovery(config, credentials, { search: outputPath || '' });
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        const result = await runObservation({ path: outputPath, config, resend: mode === 'resend', credentials });
        process.stdout.write(JSON.stringify({ ...result, receipts: result.receipts.map(({ signal_uid, duplicate }) => ({ signal_uid, duplicate })) }) + '\n');
      }
    } catch (error) {
      if (error instanceof DevtronReadError) console.error(error.message);
      console.error('Operation failed; inspect provider and host state before an explicit retry.'); process.exitCode = 1; }
  }
}
