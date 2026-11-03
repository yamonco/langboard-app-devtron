import { createHash } from 'node:crypto';
import { signalPublisher } from '@langboard/app-server';

export const signalPolicy = {
  version: 1, resource_types: ['application'],
  event_types: ['deployment.queued', 'deployment.started', 'deployment.succeeded', 'deployment.failed', 'deployment.cancelled'],
  outcome_states: { queued: 'queued', running: 'running', success: 'passed', failure: 'failed', cancelled: 'cancelled' },
  commit_mode: 'optional', time_basis: 'provider_occurrence',
};

export class MissingDeploymentTimestamp extends Error {
  constructor() { super('Provider deployment timestamp unavailable'); }
}

const commitOf = row => {
  const values = Object.values(row?.gitTriggers ?? {});
  for (const trigger of values) {
    const commit = trigger?.Commit;
    if (typeof commit === 'string' && /^[0-9a-f]{40}$/i.test(commit)) return commit.toLowerCase();
  }
  return '';
};

export function normalizeDeployment(row, scope) {
  if (row?.kind === 'helm') {
    if (!Number.isInteger(row.version) || row.version < 1 || row.installedAppId !== scope.installedAppId) {
      throw new Error('Invalid Helm deployment identity');
    }
    const { seconds, nanos = 0 } = row.deployedAt || {};
    const epoch = Number(seconds);
    if (!Number.isSafeInteger(epoch) || epoch <= 0 || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) {
      throw new MissingDeploymentTimestamp();
    }
    const evidence = normalizeDeployment({ id: row.version, workflow_type: 'DEPLOY',
      status: row.status, finished_on: new Date(epoch * 1000 + Math.floor(nanos / 1e6)).toISOString() }, scope);
    const { event_id, ...fields } = evidence;
    fields.external_id = `helm-${row.installedAppId}-revision-${row.version}`;
    return { ...fields, event_id: createHash('sha256').update(JSON.stringify({ type: 'application', resource: scope.externalId, ...fields })).digest('hex') };
  }
  if (!Number.isInteger(row?.id) || row?.workflow_type !== 'DEPLOY') throw new Error('Invalid deployment identity');
  const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
  let event, outcome, timestamp;
  if (['progressing', 'running'].includes(status)) {
    event = row.started_on ? 'started' : 'queued'; outcome = row.started_on ? 'running' : 'queued'; timestamp = row.started_on;
  } else {
    const terminal = { succeeded: ['succeeded', 'success'], healthy: ['succeeded', 'success'], failed: ['failed', 'failure'], degraded: ['failed', 'failure'], cancelled: ['cancelled', 'cancelled'] };
    if (!Object.hasOwn(terminal, status)) throw new Error(`Unsupported deployment status: ${status || 'missing'}`);
    [event, outcome] = terminal[status]; timestamp = row.finished_on;
  }
  if (timestamp == null || timestamp === '' || timestamp.startsWith('0001-01-01')) throw new MissingDeploymentTimestamp();
  if (typeof timestamp !== 'string' || timestamp.length > 40 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error('Explicit deployment timestamp required');
  const evidence = { event_type: 'deployment.' + event, occurred_at: new Date(timestamp).toISOString(),
    external_id: `wfr-${row.id}`, outcome, commit_sha: commitOf(row) };
  return { ...evidence, event_id: createHash('sha256').update(JSON.stringify({ type: 'application', resource: scope.externalId, ...evidence })).digest('hex') };
}

/** Persist the bounded batch first. Recovery reuses saved envelopes, never re-reads. */
export async function refreshDeployments({ api, scope, host, saveEnvelopes }, request = fetch) {
  const rows = await api.readDeployments(scope);
  if (!Array.isArray(rows) || rows.length > 250) throw new Error('Invalid or oversized deployment inventory');
  const normalized = [], unreported = [];
  for (const row of rows) {
    try { normalized.push(normalizeDeployment(row, scope)); }
    catch (error) {
      if (!(error instanceof MissingDeploymentTimestamp)) throw error;
      unreported.push({ deployment_id: row?.id, reason: 'provider_timestamp_missing' });
    }
  }
  normalized.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.event_id.localeCompare(a.event_id));
  const envelopes = normalized.slice(0, 25).map(evidence => ({ version: 1, board_uid: scope.boardUID,
    resource_uid: scope.resourceUID, app_revision: scope.appRevision, binding_revision: scope.bindingRevision, ...evidence }));
  await saveEnvelopes(envelopes);
  const publish = signalPublisher(host, request), receipts = [];
  for (const envelope of envelopes) receipts.push(await publish(envelope));
  return { receipts, truncated: normalized.length > 25, limit: 25, unreported };
}
