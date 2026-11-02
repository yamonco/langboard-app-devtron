import { connectPanel } from '/sdk/index.mjs';
import config from './config.mjs';
import { createPanel } from './view.mjs';

const container = document.querySelector('#app');
let unmount;
let session;
function release() { const dispose = unmount; unmount = undefined; dispose?.(); }
try {
  session = await connectPanel({ expectedHostOrigin: config.hostOrigin, onDispose: release });
  const widgets = await session.widgets;
  if (session.signal.aborted) throw new Error('Panel closed');
  if (!widgets?.React || !widgets.Button || !widgets.Badge || !widgets.Input || !widgets.mount) throw new Error('Host widgets unavailable');
  const Panel = createPanel(widgets, session, config);
  unmount = widgets.mount(container, widgets.React.createElement(Panel));
  session.signal.addEventListener('abort', release, { once: true });
} catch (error) { session?.dispose(); release(); container.textContent = error instanceof Error ? error.message : 'Panel unavailable'; }
