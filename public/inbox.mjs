import {createSourceInbox as createScopedInbox, filterSignals} from '@langboard/app-panel/inbox';
export const provider = 'devtron';
export const title = { en: 'Deployment history', ko: '배포 이력' };
export const visibleItems = (items, query, outcome, source = provider) => filterSignals(items, source, query, outcome);
export const createSourceInbox = (session, changed, source) => createScopedInbox(session, source, changed);
