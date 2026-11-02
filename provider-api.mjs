const positiveInt = value => Number.isInteger(value) && value >= 1 && value <= 1_000_000_000;

/** Safe diagnostics: never include URLs, response bodies or credentials. */
export class DevtronReadError extends Error {
  constructor(status) {
    const reason = status === 401 ? 'authentication_required' : status === 403 ? 'access_denied' :
      status === 429 ? 'rate_limited' : status >= 500 ? 'provider_unavailable' : 'request_rejected';
    super(`Devtron read failed: ${reason} (HTTP ${status})`);
    this.name = 'DevtronReadError';
    this.code = reason;
    this.status = status;
  }
}

/** Read-only official Deployment History API. Server configuration supplies the origin and token. */
export function devtronApi({ origin, token }, request = fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin || typeof token !== 'string' || token.length < 8 || token.length > 4096) {
    throw new Error('Exact HTTPS origin and API token required');
  }
  async function get(endpoint, params = []) {
    // Overload: object params select the bounded JSON POST contract.
    return params && !Array.isArray(params) ? post(endpoint, params) : rawGet(endpoint, params);
  }
  async function rawGet(endpoint, params = []) {
    const response = await request(`${origin}/orchestrator/${endpoint}?${new URLSearchParams(params)}`, {
      method: 'GET', headers: { token, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DevtronReadError(response.status);
    }
    // Bound decoded bytes, not only row counts or Content-Length.
    const reader = response.body.getReader(); let bytes = 0; const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 1048576) throw new Error('Devtron response exceeds byte limit');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function post(endpoint, body) {
    const response = await request(`${origin}/orchestrator/${endpoint}`, {
      method: 'POST', headers: { token, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DevtronReadError(response.status);
    }
    const reader = response.body.getReader(); let bytes = 0; const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 1048576) throw new Error('Devtron response exceeds byte limit');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  return {
    /** Bounded generic discovery: flattened app-environment resources. */
    async listApplications({ search = '', offset = 0, size = 50 } = {}) {
      if (typeof search !== 'string' || search.length > 200) throw new Error('Invalid application search');
      if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000_000 ||
          !Number.isInteger(size) || size < 1 || size > 250) throw new Error('Invalid application page');
      const payload = await get('app/list', { appNameSearch: search, offset, size });
      const rows = payload?.result?.appContainers;
      if (payload?.code !== 200 || !Array.isArray(rows)) throw new Error('Invalid Devtron application inventory');
      const resources = [];
      for (const row of rows.slice(0, 250)) {
        if (!positiveInt(row?.appId) || typeof row.appName !== 'string' || !row.appName || row.appName.length > 200) {
          throw new Error('Invalid Devtron application inventory');
        }
        const environments = Array.isArray(row.environments) ? row.environments : [];
        for (const environment of environments.slice(0, 250)) {
          if (!positiveInt(environment?.environmentId) || typeof environment.environmentName !== 'string' ||
              !environment.environmentName || environment.environmentName.length > 200) {
            throw new Error('Invalid Devtron application inventory');
          }
          resources.push({ appId: row.appId, appName: row.appName,
            environmentId: environment.environmentId, environmentName: environment.environmentName });
        }
      }
      return { total: typeof payload.result.appCount === 'number' ? payload.result.appCount : resources.length, resources };
    },
    /** filterCriteria selects the exact Devtron application and environment scope. */
    async readDeployments({ appId, environmentId, limit = 50 }) {
      if (!positiveInt(appId) || !positiveInt(environmentId) || !Number.isInteger(limit) || limit < 1 || limit > 250) {
        throw new Error('Invalid deployment scope');
      }
      const payload = await get('resource/history/deployment/cd-pipeline/v1', [
        ['filterCriteria', `application/devtron-application|id|${appId}`],
        ['filterCriteria', `environment|id|${environmentId}`],
        ['offset', 0],
        ['limit', limit],
      ]);
      const rows = payload?.result?.cdWorkflows;
      if (payload?.code !== 200 || !Array.isArray(rows)) throw new Error('Invalid Devtron deployment inventory');
      return rows;
    },
  };
}
