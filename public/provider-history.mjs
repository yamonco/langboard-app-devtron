// Current host-selected resources only. Provider credentials never enter the frame.
export function createProviderHistory(session, changed) {
  let generation = 0;
  let disposed = false;
  let state = { resources: [], items: [], selected: '', nextCursor: null, busy: false, error: '' };
  const supported = session.supportedOperations?.includes('connections.read') === true;
  const current = id => !disposed && !session.signal.aborted && id === generation;
  function publish(patch) { state = { ...state, ...patch }; if (!disposed && !session.signal.aborted) changed(state); }
  async function run(work) {
    const id = ++generation;
    publish({ items: [], busy: true, error: '' });
    try {
      if (!supported) throw new Error('unavailable');
      await work(id);
    } catch (error) {
      if (current(id)) publish({ items: [], error: ['forbidden', 'stale_binding', 'unavailable'].includes(error.message) ? error.message : 'unavailable' });
    } finally { if (current(id)) publish({ busy: false }); }
  }
  async function read(resource, id) {
    const result = await session.request('connections.read', {
      connection_uid: resource.connection_uid, read_key: 'deployments.list',
      input: { resource_uid: resource.resource_uid, access_revision: resource.access_revision, limit: 50 },
    });
    if (!current(id)) return;
    if (!result?.ok) throw new Error(result?.error?.code || 'unavailable');
    const items = result.data?.items;
    if (!Array.isArray(items) || items.length > 50) throw new Error('unavailable');
    const rows = items.map(item => {
      const native = Number.isSafeInteger(item.id) && item.id > 0 && item.workflow_type === 'DEPLOY';
      const helm = Number.isSafeInteger(item.version) && item.version > 0;
      if (native === helm || typeof item.status !== 'string' || item.status.length > 40) throw new Error('unavailable');
      return { id: String(native ? item.id : item.version), status: item.status,
        time: native ? item.finished_on || item.started_on || null : item.deployedAt || null, kind: native ? 'deployment' : 'revision' };
    });
    publish({ items: rows });
  }
  return {
    supported,
    async refresh(cursor = null) {
      if (disposed || session.signal.aborted) return;
      return run(async id => {
        const page = await session.request('resources.list', { cursor });
        if (!current(id)) return;
        if (!Array.isArray(page?.items) || page.items.length > 25) throw new Error('unavailable');
        const resources = page.items.filter(row => row.app_key === 'devtron-panel' && row.resource_type === 'application');
        if (resources.some(row => !/^[A-Za-z0-9]{11}$/.test(row.resource_uid) || !/^[A-Za-z0-9]{11}$/.test(row.connection_uid) || !Number.isSafeInteger(row.access_revision) || row.access_revision < 0)) throw new Error('unavailable');
        const selected = cursor ? '' : state.selected;
        publish({ resources, nextCursor: page.next_cursor || null, selected: resources.some(row => row.resource_uid === selected) ? selected : '' });
        const resource = resources.find(row => row.resource_uid === selected);
        if (resource) await read(resource, id);
      });
    },
    async select(uid) {
      if (disposed || session.signal.aborted) return;
      const resource = state.resources.find(row => row.resource_uid === uid);
      if (!resource) return;
      publish({ selected: uid });
      return run(id => read(resource, id));
    },
    dispose() { disposed = true; generation++; state = { ...state, resources: [], items: [] }; },
  };
}
