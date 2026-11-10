import { createHash } from 'node:crypto';
import { createDeploymentObservation, MissingDeploymentTimestamp } from './deployment-observation.mjs';

export const isNativeId = value => Number.isInteger(value) && value >= 1 && value <= 1_000_000_000;

/** Native application/environment, installed app and external Helm are exclusive selectors. */
export function assertUnambiguousDeploymentScope({ appId, environmentId, installedAppId, helmAppId }) {
  const selected = [appId !== undefined || environmentId !== undefined, installedAppId !== undefined, helmAppId !== undefined];
  if (selected.filter(Boolean).length > 1) throw new Error('Ambiguous deployment scope');
}

/** Explicit external Helm identity; never reinterpret a native tuple as an installed-app ID. */
export function externalHelmScope(helmAppId) {
  const parts = typeof helmAppId === 'string' ? helmAppId.split('|') : [];
  const label = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
  if (parts.length !== 3 || !/^[1-9][0-9]{0,9}$/.test(parts[0]) || !isNativeId(Number(parts[0])) ||
      parts[1].length > 63 || !label.test(parts[1]) || parts[2].length > 53 ||
      !parts[2].split('.').every(part => label.test(part))) throw new Error('Invalid external Helm application identity');
  return { helmAppId, externalId: `helm-release-${createHash('sha256').update(helmAppId).digest('hex')}`, limit: 50 };
}

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
  async function readInventory(endpoint, { query, body } = {}) {
    const url = `${origin}/orchestrator/${endpoint}` + (query ? `?${new URLSearchParams(query)}` : '');
    const response = await request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { token, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DevtronReadError(response.status);
    }
    // One decoded-byte boundary for every native read, including inventory POST.
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
      const payload = await readInventory('app/list', { body: { appNameSearch: search, offset, size } });
      const rows = payload?.result?.appContainers;
      if (payload?.code !== 200 || !Array.isArray(rows) || rows.length > 250) throw new Error('Invalid Devtron application inventory');
      const resources = [];
      for (const row of rows) {
        if (!isNativeId(row?.appId) || typeof row.appName !== 'string' || !row.appName || row.appName.length > 200) {
          throw new Error('Invalid Devtron application inventory');
        }
        const environments = Array.isArray(row.environments) ? row.environments : [];
        if (environments.length > 250 || (row.environments != null && !Array.isArray(row.environments))) {
          throw new Error('Invalid Devtron application inventory');
        }
        for (const environment of environments) {
          if (!isNativeId(environment?.environmentId) || typeof environment.environmentName !== 'string' ||
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
    async readDeployments({ appId, environmentId, installedAppId, helmAppId, limit = 50 }) {
      assertUnambiguousDeploymentScope({ appId, environmentId, installedAppId, helmAppId });
      if (helmAppId !== undefined) {
        externalHelmScope(helmAppId);
        const payload = await readInventory('application/deployment-history', { query: [['appId', helmAppId]] });
        // Unlinked external releases have no installedAppInfo. The native API
        // authorizes the exact tuple selector; its history does not echo it.
        const rows = payload?.result?.deploymentHistory;
        if (payload?.code !== 200 || !Array.isArray(rows) || rows.length > 250) throw new Error('Invalid Devtron Helm deployment inventory');
        return rows.map(row => ({ ...row, kind: 'helm', helmAppId }));
      }
      if (installedAppId !== undefined) {
        if (!isNativeId(installedAppId)) throw new Error('Invalid installed application scope');
        const payload = await readInventory('application/deployment-history', { query: [['installedAppId', installedAppId]] });
        const result = payload?.result;
        if (payload?.code !== 200 || result?.installedAppInfo?.installedAppId !== installedAppId ||
            !Array.isArray(result.deploymentHistory) || result.deploymentHistory.length > 250) {
          throw new Error('Invalid Devtron Helm deployment inventory');
        }
        return result.deploymentHistory.map(row => ({ ...row, kind: 'helm', installedAppId }));
      }
      if (!isNativeId(appId) || !isNativeId(environmentId) || !Number.isInteger(limit) || limit < 1 || limit > 250) {
        throw new Error('Invalid deployment scope');
      }
      const payload = await readInventory('resource/history/deployment/cd-pipeline/v1', { query: [
        ['filterCriteria', `application/devtron-application|id|${appId}`],
        ['filterCriteria', `environment|id|${environmentId}`],
        ['offset', 0],
        ['limit', limit],
      ] });
      const rows = payload?.result?.cdWorkflows;
      if (payload?.code !== 200 || !Array.isArray(rows) || rows.length > 250) throw new Error('Invalid Devtron deployment inventory');
      return rows;
    },
  };
}


export class UnreportableDeploymentStatus extends Error {
  constructor() { super('Provider deployment outcome unavailable'); }
}

const phaseFromStatus = (status, started) => {
  if (['progressing', 'running'].includes(status)) return started ? 'started' : 'queued';
  const phases = { succeeded: 'succeeded', healthy: 'succeeded', failed: 'failed', degraded: 'failed', cancelled: 'cancelled' };
  if (!Object.hasOwn(phases, status)) throw new Error(`Unsupported deployment status: ${status || 'missing'}`);
  return phases[status];
};
const commitFromTriggers = row => {
  for (const trigger of Object.values(row?.gitTriggers ?? {})) {
    if (typeof trigger?.Commit === 'string' && /^[0-9a-f]{40}$/i.test(trigger.Commit)) return trigger.Commit.toLowerCase();
  }
  return '';
};

/** Translate DevTron snapshots once; never expose provider payloads to the panel. */
export function deploymentObservationFromProvider(row, target) {
  if (row?.kind === 'helm') {
    const external = row.helmAppId !== undefined;
    const release = external ? externalHelmScope(row.helmAppId).externalId : row.installedAppId;
    if (!Number.isInteger(row.version) || row.version < 1 ||
        (external ? row.helmAppId !== target.helmAppId || release !== target.externalId :
          !Number.isInteger(release) || release < 1 || release !== target.installedAppId)) {
      throw new Error('Invalid Helm deployment identity');
    }
    const { seconds, nanos = 0 } = row.deployedAt || {};
    const epoch = Number(seconds);
    if (!Number.isSafeInteger(epoch) || epoch <= 0 || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) {
      throw new MissingDeploymentTimestamp();
    }
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    if (external && ['superseded', 'uninstalled', 'uninstalling', 'unknown'].includes(status)) throw new UnreportableDeploymentStatus();
    const pending = external && ['pending-install', 'pending-upgrade', 'pending-rollback'].includes(status);
    const phase = pending ? 'started' : external && status === 'deployed' ? 'succeeded' : phaseFromStatus(status, false);
    const occurredAt = !pending && ['queued', 'started'].includes(phase) ? undefined : new Date(epoch * 1000 + Math.floor(nanos / 1e6)).toISOString();
    return createDeploymentObservation({ phase, occurredAt, deploymentId: `helm-${release}-revision-${row.version}` }, target.externalId);
  }
  if (!Number.isInteger(row?.id) || row?.workflow_type !== 'DEPLOY') throw new Error('Invalid deployment identity');
  const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
  const phase = phaseFromStatus(status, !!row.started_on);
  return createDeploymentObservation({ phase, occurredAt: ['queued', 'started'].includes(phase) ? row.started_on : row.finished_on,
    deploymentId: `wfr-${row.id}`, commitSha: commitFromTriggers(row) }, target.externalId);
}
