import { cardLifecycle } from './archive.mjs';
import { signalPolicy } from './signals.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const { version: appVersion } = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
export function configuration(env = process.env) {
  const host = new URL(env.HOST_ORIGIN || 'http://127.0.0.1:5173');
  if (!['http:', 'https:'].includes(host.protocol) || host.origin !== (env.HOST_ORIGIN || 'http://127.0.0.1:5173')) throw new Error('HOST_ORIGIN must be an exact HTTP(S) origin');
  const publicUrl = new URL(env.PUBLIC_URL || 'https://panel.example');
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.hash || publicUrl.search || publicUrl.pathname !== '/') throw new Error('PUBLIC_URL must be an HTTPS origin');
  return { hostOrigin: host.origin, publicUrl: publicUrl.origin };
}
export function declaration(config, { workflowCards = false, publishSignals = false } = {}) {
  const manifest = { schema_version: 1, key: 'devtron-panel', version: appVersion, name: 'DevTron Panel', description: 'Deployment history from the authorized Langboard signal inbox.', capabilities: ['panels.render', 'signals.read'], signal_sources: ['devtron'], resource_types: ['application'], panel: { url: config.publicUrl + '/', name: 'DevTron', icon: 'devtron' } };
  if (!workflowCards && !publishSignals) return manifest;
  return { ...manifest, schema_version: 2,
    capabilities: [...manifest.capabilities, ...(workflowCards ? ['cards.read', 'cards.create'] : []), ...(publishSignals ? ['signals.publish'] : [])],
    ...(workflowCards ? { card_lifecycle: cardLifecycle } : {}),
    ...(publishSignals ? { signal_policy: signalPolicy, signal_sources: [...manifest.signal_sources, manifest.key] } : {}),
    trust: { authentication_origins: [], mcp_origins: [], data_origins: [config.publicUrl] },
  };
}
export function panelServer(config = configuration(), { workflowCards = false, publishSignals = false } = {}) {
  const manifest = declaration(config, { workflowCards, publishSignals });
  const paths = new Map([
    ['/', ['public/index.html', 'text/html; charset=utf-8']],
    ['/panel.mjs', ['public/panel.mjs', 'text/javascript; charset=utf-8']],
    ['/view.mjs', ['public/view.mjs', 'text/javascript; charset=utf-8']],
    ['/inbox.mjs', ['public/inbox.mjs', 'text/javascript; charset=utf-8']],
    ['/sdk/inbox.mjs', ['node_modules/@langboard/app-panel/inbox.mjs', 'text/javascript; charset=utf-8']],
    ['/sdk/index.mjs', ['node_modules/@langboard/app-panel/index.mjs', 'text/javascript; charset=utf-8']],
  ]);
  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' ${config.hostOrigin} 'sha256-CW3/9VurNRsEoVwLSHTwxtl+RqJNXNV9uGC0faKjHdQ='; style-src 'self' ${config.hostOrigin}; connect-src 'none'; img-src 'self' data:; font-src ${config.hostOrigin}; frame-ancestors ${config.hostOrigin}; base-uri 'none'; form-action 'none'`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let body, type;
    if (req.url === '/config.mjs') { body = `export default ${JSON.stringify({hostOrigin: config.hostOrigin, signalSources: manifest.signal_sources})};`; type = 'text/javascript; charset=utf-8'; }
    else if (req.url === '/manifest.json') { body = JSON.stringify(manifest); type = 'application/json'; }
    else {
      const asset = paths.get(req.url);
      if (!asset) { res.writeHead(404); res.end('Not found'); return; }
      try { body = await readFile(resolve(root, asset[0])); type = asset[1]; }
      catch { res.writeHead(503); res.end('Asset unavailable; run npm ci'); return; }
    }
    res.writeHead(200, { 'Content-Type': type }); res.end(req.method === 'HEAD' ? undefined : body);
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = configuration();
  const profile = { workflowCards: process.argv.includes("--workflow-cards"), publishSignals: process.argv.includes("--publish-signals") };
  if (process.argv.includes('--manifest')) process.stdout.write(JSON.stringify(declaration(config, profile), null, 2) + '\n');
  else panelServer(config, profile).listen(Number(process.env.PORT || 8780), process.env.HOST || '127.0.0.1', () => console.log('DevTron panel listening'));
}
