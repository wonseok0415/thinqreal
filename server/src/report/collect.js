// 월간 리포트 데이터 수집 — .gs collectMonthlyData 이식 (store 어댑터 기반)
import { getManualArticles, fetchThinqRealArticles } from './articles.js';

// Phase 5: 설문·성과 월간 집계 — .gs collectMonthlySurvey 이식 (Survey Spec §5-4).
// 응답 수·트랙 분포·재방문율·대장 신규/확정/드롭·확정 산입액 합계(만원)·이슈 등록 건수.
export async function collectMonthlySurvey(store, month) {
  const [responses, ledger, issues] = await Promise.all([
    store.survey.listResponses(),
    store.survey.listLedger(),
    store.survey.listIssues(),
  ]);

  const respMonth = (r) => String(r.visit_date || r.submitted_at || '').slice(0, 7);
  const monthResponses = responses.filter((r) => respMonth(r) === month);

  const tracks = { sales: 0, media: 0, etc: 0 };
  monthResponses.forEach((r) => { if (tracks[r.track] != null) tracks[r.track]++; });

  const answered = monthResponses.filter((r) => r.visit_count);
  const revisit = answered.filter((r) => r.visit_count !== '첫 방문').length;
  const revisitPct = answered.length ? Math.round((revisit / answered.length) * 100) : null;

  // 대장: 신규 = 해당 월 방문(visit_date) 기준 / 확정 = confirmed_date 기준 / 드롭 = 해당 월 신규 중 드롭
  const ledgerNew = ledger.filter((l) => String(l.visit_date || '').slice(0, 7) === month);
  const confirmedRows = ledger.filter((l) =>
    l.status === '확정' && String(l.confirmed_date || '').slice(0, 7) === month);
  const confirmedSum = confirmedRows.reduce((s, l) => s + (Number(l.confirmed_amount) || 0), 0); // 만원
  const droppedNew = ledgerNew.filter((l) => l.status === '드롭').length;

  // 이슈는 출처 응답의 월 기준 — response_id → 응답 월 매핑으로 조인
  const respMonthById = {};
  responses.forEach((r) => { respMonthById[String(r.response_id)] = respMonth(r); });
  const issueCount = issues.filter((x) => respMonthById[String(x.response_id)] === month).length;

  return {
    count: monthResponses.length, tracks,
    revisitPct,
    ledgerNew: ledgerNew.length, ledgerConfirmed: confirmedRows.length,
    ledgerDropped: droppedNew, confirmedSum,
    issueCount,
  };
}

export async function collectMonthlyData(store, month) {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr), monthNum = Number(mStr);

  // 1) 예약 — date 컬럼이 해당 월에 속하는 모든 건
  const all = await store.bookings.listAll();
  const bookings = all.filter((b) => b.date && String(b.date).slice(0, 7) === month);

  const confirmed = bookings.filter((b) => b.status === '확정');
  const rejected = bookings.filter((b) => b.status === '거절');
  const pending = bookings.filter((b) => b.status === '대기중');
  const totalVisitors = confirmed.reduce((sum, b) => sum + (Number(b.count) || 0), 0);

  const purposeCounts = {};
  confirmed.forEach((b) => {
    const k = b.purpose || '기타';
    purposeCounts[k] = (purposeCounts[k] || 0) + 1;
  });

  confirmed.sort((a, b) => {
    const c = String(a.date).localeCompare(String(b.date));
    return c !== 0 ? c : String(a.slotLabel || '').localeCompare(String(b.slotLabel || ''));
  });

  // 2) ROI 스냅샷 — roiLatest: 보고월 말까지 저장된 시나리오 중 가장 최근
  const allRoiRaw = await store.roi.list();
  const allRoi = allRoiRaw.map((r) => {
    const obj = { ...r };
    try { obj.inputs = typeof obj.inputs === 'string' ? JSON.parse(obj.inputs || '{}') : (obj.inputs || {}); } catch { obj.inputs = {}; }
    try { obj.outputs = typeof obj.outputs === 'string' ? JSON.parse(obj.outputs || '{}') : (obj.outputs || {}); } catch { obj.outputs = {}; }
    return obj;
  }).filter((r) => r.id);

  const roi = allRoi
    .filter((r) => String(r.timestamp).slice(0, 7) === month)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const monthEnd = month + '-31T23:59:59';
  const eligibleRoi = allRoi.filter((r) => String(r.timestamp) <= monthEnd)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const roiLatest = eligibleRoi[0] || null;

  // 3) 기사 — 수동 큐레이션 우선, 없으면 자동 검색 (Serper → CSE)
  const manualItems = await getManualArticles(store, month);
  let articles;
  if (manualItems.length > 0) {
    articles = { items: manualItems, skipReason: '', source: 'manual' };
  } else {
    articles = await fetchThinqRealArticles();
    articles.source = articles.provider || 'auto';
  }

  // 4) 설문·성과 지표 (Phase 5) — 집계 실패가 리포트 발송을 막지 않도록 격리
  let survey = null;
  try { survey = await collectMonthlySurvey(store, month); }
  catch (e) { console.warn('[monthly] survey metrics fail: ' + e.message); }

  return {
    month, year, monthNum,
    kpi: {
      total: bookings.length,
      confirmed: confirmed.length,
      rejected: rejected.length,
      pending: pending.length,
      visitors: totalVisitors,
    },
    confirmed, rejected, pending,
    purposeCounts,
    roi,
    roiLatest,
    articles,
    survey,
  };
}
