import { createProviderHistory } from './provider-history.mjs';

export function createProviderPanel(widgets, session, { LegacyPanel } = {}) {
  const { React, Button, Badge } = widgets;
  const h = React.createElement;
  const ko = session.context.language.startsWith('ko');
  const text = (en, kr) => ko ? kr : en;
  function History() {
    const [state, setState] = React.useState({ resources: [], items: [], selected: '', nextCursor: null, busy: false, error: '' });
    const history = React.useMemo(() => createProviderHistory(session, setState), []);
    React.useEffect(() => { void history.refresh(); return () => history.dispose(); }, [history]);
    const errors = {
      forbidden: text('Access was denied. Review the connection and resource permissions in Langboard.', '접근이 거절됐습니다. 랭보드에서 연결과 리소스 권한을 확인하세요.'),
      stale_binding: text('The resource selection changed. Refresh to read its current permissions.', '리소스 선택이 변경됐습니다. 새로고침으로 현재 권한을 확인하세요.'),
      unavailable: text('Deployment history is unavailable. Check the connection and refresh.', '배포 이력을 불러올 수 없습니다. 연결을 확인한 뒤 새로고침하세요.'),
    };
    const timestamp = item => {
      const value = typeof item.time === 'string' ? Date.parse(item.time) : Number(item.time?.seconds) * 1000;
      return Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? new Date(value).toISOString() : text('Time unavailable', '시각 미상');
    };
    return h('section', { className: 'flex flex-col gap-3', 'aria-label': text('Current provider history', '현재 배포 이력') },
      h('p', null, text('Select an authorized resource to read its deployment history. Deployment status does not establish application health.', '권한이 있는 리소스를 선택하면 배포 이력을 조회합니다. 배포 상태만으로 앱의 정상 동작을 판단하지 않습니다.')),
      !history.supported && h('p', { role: 'status' }, text('This host does not provide connected deployment reads for this panel.', '이 호스트는 이 패널의 연결된 배포 조회를 지원하지 않습니다.')),
      history.supported && h(Button, { disabled: state.busy, onClick: () => void history.refresh() }, text('Refresh', '새로고침')),
      state.error && h('p', { role: 'alert' }, errors[state.error] || errors.unavailable),
      state.busy && h('p', { role: 'status' }, text('Loading…', '불러오는 중…')),
      history.supported && !state.busy && !state.error && !state.resources.length && h('p', { role: 'status' }, text('No selected resources. Configure the connection and resource selection in Langboard.', '선택된 리소스가 없습니다. 랭보드에서 연결과 리소스 선택을 설정하세요.')),
      h('ul', { className: 'list', 'aria-label': text('Resources', '리소스') }, ...state.resources.map(resource => h('li', { className: 'list-row', key: resource.resource_uid },
        h(Button, { disabled: state.busy, 'aria-pressed': state.selected === resource.resource_uid, onClick: () => void history.select(resource.resource_uid) }, resource.name || resource.external_resource_id)))),
      state.nextCursor && h(Button, { disabled: state.busy, onClick: () => void history.refresh(state.nextCursor) }, text('Next resources', '다음 리소스')),
      !state.busy && !state.error && state.selected && !state.items.length && h('p', { role: 'status' }, text('No deployment records returned for this resource.', '이 리소스에서 반환된 배포 기록이 없습니다.')),
      h('ul', { className: 'list', 'aria-label': text('Deployment records', '배포 기록') }, ...state.items.map(item => h('li', { className: 'list-row', key: item.kind + ':' + item.id },
        h('strong', null, (item.kind === 'revision' ? text('Revision ', '리비전 ') : text('Deployment ', '배포 ')) + item.id),
        h(Badge, { variant: 'secondary' }, item.status), h('time', null, timestamp(item))))));
  }
  return function ProviderPanel() {
    const [legacy, setLegacy] = React.useState(false);
    return h('main', { className: 'flex flex-col gap-3 p-3' },
      h('h1', { className: 'text-lg font-semibold' }, text('Deployment history', '배포 이력')),
      LegacyPanel && h(Button, { onClick: () => setLegacy(!legacy) }, legacy ? text('Current provider history', '현재 배포 이력') : text('Published observations', '발행된 관측 기록')),
      legacy ? h(React.Fragment, null, h('p', { role: 'status' }, text('Published observations are retained evidence, not a current provider read.', '발행된 관측 기록은 보존된 근거이며 현재 배포 조회 결과가 아닙니다.')), h(LegacyPanel)) : h(History));
  };
}
