import { createSourceInbox, visibleItems, title, provider } from './inbox.mjs';
export function createPanel(widgets, session, { signalSources = [provider] } = {}) {
  const sources = [...new Set(signalSources)].filter(value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value));
  if (!sources.length) throw new Error('No declared signal sources');
  const { React, Button, Badge, Input } = widgets;
  const h = React.createElement;
  const ko = session.context.language.startsWith('ko');
  const text = (en, kr) => ko ? kr : en;
  const statusLabel = value => ko ? ({success: '성공', succeeded: '성공', healthy: '정상', failure: '실패', failed: '실패', degraded: '비정상', queued: '대기', running: '진행 중', started: '시작', cancelled: '취소', unknown: '미상', conflict: '근거 충돌'}[value] || value) : value;
  function Panel() {
    const [state, setState] = React.useState({ items: [], nextCursor: null, busy: false, error: '', source: sources[0] });
    const [query, setQuery] = React.useState(typeof session.state?.query === 'string' ? session.state.query : '');
    const [outcome, setOutcome] = React.useState(typeof session.state?.outcome === 'string' ? session.state.outcome : '');
    const [source, setSource] = React.useState(sources.includes(session.state?.source) ? session.state.source : sources[0]);
    const inbox = React.useMemo(() => createSourceInbox(session, setState, source), [source]);
    React.useEffect(() => { void inbox.start(); return () => inbox.dispose(); }, [inbox]);
    function filters(nextQuery, nextOutcome) { setQuery(nextQuery); setOutcome(nextOutcome); session.saveState({ query: nextQuery, outcome: nextOutcome, source }); }
    const current = state.source === source ? state : { items: [], nextCursor: null, busy: true, error: '' };
    const rows = visibleItems(current.items, query, outcome, source);
    const outcomes = [...new Set(current.items.map(item => item.conflict ? 'conflict' : item.outcome || 'unknown'))];
    return h('main', { className: 'flex flex-col gap-3 p-3' },
      h('h1', { className: 'text-lg font-semibold' }, title[ko ? 'ko' : 'en']),
      h('p', { className: 'text-sm' }, text('Authorized inbox observations. Refresh to request current evidence.', '권한이 있는 수신함 기록입니다. 새로고침으로 최신 근거를 요청합니다.')),
      sources.length > 1 && h('label', null, text('Signal source', '시그널 소스'), h('select', { value: source, className: 'select w-full', onChange: e => {
        const next = e.target.value;
        if (!sources.includes(next)) return;
        setSource(next); setOutcome(''); session.saveState({ query, outcome: '', source: next });
      } }, ...sources.map(value => h('option', { key: value, value }, value)))),
      h('label', null, text('Search', '검색'), h(Input, { type: 'search', value: query, onChange: e => filters(e.target.value, outcome), className: 'w-full', placeholder: text('Resource, ID or commit', '리소스, ID 또는 커밋') })),
      h('label', null, text('Status', '상태'), h('select', { value: outcome, onChange: e => filters(query, e.target.value), className: 'select w-full border rounded bg-background text-foreground p-2' }, h('option', { value: '' }, text('All', '전체')), ...outcomes.map(value => h('option', { key: value, value }, statusLabel(value))))),
      h(Button, { disabled: current.busy, onClick: () => void inbox.load() }, text('Refresh', '새로고침')),
      current.busy && h('p', { role: 'status' }, text('Loading…', '불러오는 중…')),
      current.error && h('p', { role: 'alert' }, text('Read failed: ', '조회 실패: ') + current.error),
      !current.busy && !rows.length && h('p', { role: 'status' }, text('No matching inbox records.', '일치하는 수신함 기록이 없습니다.')),
      h('ul', { className: 'flex flex-col gap-3' }, ...rows.map((item, index) => h('li', { key: item.signal_uid || [item.external_id, item.commit_sha, index].join(':'), className: 'border rounded p-3' },
        h('strong', null, item.resource_name || item.external_id),
        h('div', null, h(Badge, { variant: 'secondary' }, item.conflict ? text('Conflicting evidence', '근거 충돌') : statusLabel(item.outcome) || text('Unknown', '미상'))),
        h('p', null, item.event_type + ' · ' + item.external_id),
        item.commit_sha && h('p', null, text('Commit: ', '커밋: ') + item.commit_sha),
        h('p', null, text('Time: ', '시각: ') + String(item.occurred_at ?? '') + ' · ' + (item.time_basis === 'observation' ? text('Observed', '관측') : text('Occurred', '발생')))))),
      current.nextCursor && h(Button, { disabled: current.busy, onClick: () => void inbox.load(true) }, text('Load more', '더 보기')));
  }
  return Panel;
}
