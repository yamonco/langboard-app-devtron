import { signalPublisher } from '@langboard/app-server';
import { deploymentObservationFromProvider, UnreportableDeploymentStatus } from './provider-api.mjs';
import { MissingDeploymentTimestamp } from './deployment-observation.mjs';

// Preserve the existing module API while keeping provider translation at its owner.
export { deploymentObservationFromProvider as normalizeDeployment, UnreportableDeploymentStatus } from './provider-api.mjs';
export { signalPolicy, MissingDeploymentTimestamp } from './deployment-observation.mjs';

/** Persist the bounded batch first. Recovery reuses saved envelopes, never re-reads. */
export async function publishDeploymentObservations({ api, scope, host, saveEnvelopes }, request = fetch) {
  const rows = await api.readDeployments(scope);
  if (!Array.isArray(rows) || rows.length > 250) throw new Error('Invalid or oversized deployment inventory');
  const observations = [], unreported = [];
  for (const row of rows) {
    try { observations.push(deploymentObservationFromProvider(row, scope)); }
    catch (error) {
      if (!(error instanceof MissingDeploymentTimestamp) && !(error instanceof UnreportableDeploymentStatus)) throw error;
      unreported.push({ deployment_id: row?.id ?? row?.version,
        reason: error instanceof MissingDeploymentTimestamp ? 'provider_timestamp_missing' : 'provider_outcome_unavailable' });
    }
  }
  observations.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.event_id.localeCompare(a.event_id));
  const envelopes = observations.slice(0, 25).map(evidence => ({ version: 1, board_uid: scope.boardUID,
    resource_uid: scope.resourceUID, app_revision: scope.appRevision, binding_revision: scope.bindingRevision, ...evidence }));
  await saveEnvelopes(envelopes);
  const publish = signalPublisher(host, request), receipts = [];
  for (const envelope of envelopes) receipts.push(await publish(envelope));
  return { receipts, truncated: observations.length > 25, limit: 25, unreported };
}

export { publishDeploymentObservations as refreshDeployments };
