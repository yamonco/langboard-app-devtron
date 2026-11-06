import { createHash } from 'node:crypto';

// Published observation vocabulary; provider status names belong in the adapter.
export const observationOutcomes = Object.freeze({
  queued: 'queued', started: 'running', succeeded: 'success', failed: 'failure', cancelled: 'cancelled',
});
export const signalPolicy = {
  version: 1, resource_types: ['application'],
  event_types: Object.keys(observationOutcomes).map(phase => `deployment.${phase}`),
  outcome_states: { queued: 'queued', running: 'running', success: 'passed', failure: 'failed', cancelled: 'cancelled' },
  commit_mode: 'optional', time_basis: 'provider_occurrence',
};

export class MissingDeploymentTimestamp extends Error {
  constructor() { super('Provider deployment timestamp unavailable'); }
}

/** Immutable provider occurrence; identity is independent of observation time. */
export function createDeploymentObservation({ phase, occurredAt, deploymentId, commitSha = '' }, deploymentTargetId) {
  if (!Object.hasOwn(observationOutcomes, phase)) throw new Error('Unsupported deployment phase');
  if (occurredAt == null || occurredAt === '' || (typeof occurredAt === 'string' && occurredAt.startsWith('0001-01-01'))) {
    throw new MissingDeploymentTimestamp();
  }
  if (typeof occurredAt !== 'string' || occurredAt.length > 40 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt))) {
    throw new Error('Explicit deployment timestamp required');
  }
  const observation = { event_type: `deployment.${phase}`, occurred_at: new Date(occurredAt).toISOString(),
    external_id: deploymentId, outcome: observationOutcomes[phase], commit_sha: commitSha };
  return { ...observation, event_id: createHash('sha256').update(JSON.stringify({ type: 'application', resource: deploymentTargetId, ...observation })).digest('hex') };
}
