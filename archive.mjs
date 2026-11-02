// A card is a record, not the deployed service itself.
export const cardLifecycle = {
  deployment: { archive: { mode: 'retain', description: 'Retain deployment and logs; do not stop, redeploy or delete the service.' }, restore: 'retain_external_state' },
};

export function archiveDeployment() {
  return { state: 'retained', external_action: 'none' };
}
