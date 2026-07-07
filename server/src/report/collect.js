// 월간 리포트 데이터 수집 — .gs collectMonthlyData 이식 (store 어댑터 기반)
import { getManualArticles, fetchThinqRealArticles } from './articles.js';

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
  };
}
