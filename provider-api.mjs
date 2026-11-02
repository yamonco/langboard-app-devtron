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
  return {
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
