// 월간 리포트 데이터 수집 — .gs collectMonthlyData 이식 (store 어댑터 기반)
// §8-7 개편 (2026-08): Executive(당월+YTD)·사업부별 현황·인사이트/한마디 큐레이션·
// 만족도/NPS(신구 척도 분리)·기사 병합(수동 우선+자동 보충)·ROI 고정 수치+pin.
import { REPORT_ARTICLE_LIMIT, ROI_FIXED, STATE_ROI_PIN_KEY } from '../lib/constants.js';
import { normalizeMonth } from '../lib/dates.js';
import { getManualArticles, fetchThinqRealArticles, filterThinqRealItems } from './articles.js';

// ── 만족도 척도 판별·집계 (§8-7 3-3) ─────────────────────────
// 구 5단계("N - 라벨")와 신 0~10 정수를 **절대 섞어 평균하지 않는다**
export function classifySatisfaction(values) {
  const neu = [], old = [];
  (values || []).forEach((v) => {
    const s = String(v == null ? '' : v).trim();
    if (!s) return;
    if (/^(10|[0-9])$/.test(s)) neu.push(Number(s));
    else {
      const m = s.match(/^([1-5])\s*-/);
      if (m) old.push(Number(m[1]));
    }
  });
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  let nps = null;
  if (neu.length) {
    const promoters = neu.filter((n) => n >= 9).length;
    const detractors = neu.filter((n) => n <= 6).length;
    nps = Math.round(((promoters - detractors) / neu.length) * 100);
  }
  return { newCount: neu.length, newAvg: avg(neu), nps, oldCount: old.length, oldAvg: avg(old) };
}

// 만족도/NPS 표기 문자열 — 혼재 월은 두 줄 병기, 소표본(10건 미만)은 참고치 표기
export function satDisplay(sat) {
  if (!sat || (!sat.newCount && !sat.oldCount)) return '—';
  const parts = [];
  if (sat.newCount) {
    const npsTxt = 'NPS ' + (sat.nps >= 0 ? '+' : '') + sat.nps + ' · 평균 ' + sat.newAvg.toFixed(1) + '/10';
    parts.push(sat.newCount < 10 ? npsTxt + ' (응답 ' + sat.newCount + '건 · 참고치)' : npsTxt + ' · 응답 ' + sat.newCount + '건');
  }
  if (sat.oldCount) parts.push('평균 만족도 ' + sat.oldAvg.toFixed(1) + '/5 (구 척도 · ' + sat.oldCount + '건)');
  return parts.join(' / ');
}

// ── ROI 리포트 반영 수치 (2026-08-24 — 지정 pin 시에만 동적) ──
function toEokStr(millionWon) {   // 백만원 → '2.8억원' (억원 소수 1자리 반올림)
  return (Math.round(millionWon / 10) / 10).toFixed(1) + '억원';
}

function bepTextFromYears(y) {    // 1.31 → '1.31년 (약 1년 4개월)'
  if (!(y > 0)) return null;
  const months = Math.round(y * 12);
  if (!months) return y.toFixed(2) + '년';
  const yy = Math.floor(months / 12), mm = months % 12;
  const approx = (yy ? yy + '년' : '') + (yy && mm ? ' ' : '') + (mm ? mm + '개월' : '');
  return y.toFixed(2) + '년 (약 ' + approx + ')';
}

// 지정 스냅샷 → ROI_FIXED 형 객체 (+basis 출처 라벨). 어떤 실패든 null 반환 → 고정 수치 폴백.
async function resolveReportRoi(store, allRoi) {
  try {
    const id = await store.state.get(STATE_ROI_PIN_KEY);
    if (!id) return null;
    const snap = (allRoi || []).find((r) => String(r.id) === String(id));
    if (!snap) return null;
    const inp = snap.inputs || {}, out = snap.outputs || {};
    const capexM = Number(inp.capex), opexM = Number(inp.opex);
    const roi3 = Number(out.roi3), roi5 = Number(out.roi5);
    const bep = bepTextFromYears(Number(out.bepYears));
    if (!isFinite(capexM) || !isFinite(opexM) || !isFinite(roi3) || !isFinite(roi5) || !bep) return null;
    const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    return {
      capex: toEokStr(capexM), opexYr: toEokStr(opexM) + '/년', totalCost: toEokStr(capexM + opexM),
      bep, roi3: pct(roi3), roi5: pct(roi5),
      basis: '기준: ROI 시나리오 「' + String(snap.label || '무제') + '」 (' + String(snap.timestamp).slice(0, 10) + ' 저장)',
    };
  } catch (e) { console.warn('[monthly] resolveReportRoi fail: ' + e.message); return null; }
}

// Phase 5: 설문·성과 월간 집계 — .gs collectMonthlySurvey 이식 (Survey Spec §5-4).
// 응답 수·트랙 분포·재방문율·대장 신규/확정/드롭·확정 산입액 합계(만원)·이슈 등록 건수.
export async function collectMonthlySurvey(store, month) {
  const [responses, ledger, issues] = await Promise.all([
    store.survey.listResponses(),
    store.survey.listLedger(),
    store.survey.listIssues(),
  ]);
  return buildMonthlySurveyMetrics(store, month, responses, ledger, issues);
}

async function buildMonthlySurveyMetrics(store, month, responses, ledger, issues) {

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

  // §8-7: 방문자 설문 지표 + 만족도/NPS (인솔자·방문자, 혼재 척도 분리 집계)
  let visitor = null, satAll = null, satOperator = null, satVisitor = null;
  try {
    const visitors = (await store.visitors.list())
      .filter((v) => String(v.submitted_at || '').slice(0, 7) === month);
    const opSats = monthResponses.map((r) => r.satisfaction);
    const vSats = visitors.map((v) => v.satisfaction);
    satOperator = classifySatisfaction(opSats);
    satVisitor = classifySatisfaction(vSats);
    satAll = classifySatisfaction(opSats.concat(vSats));
    visitor = {
      count: visitors.length,
      ko: visitors.filter((v) => v.lang === 'KO').length,
      en: visitors.filter((v) => v.lang === 'EN').length,
    };
  } catch (e) { console.warn('[monthly] visitor metrics fail: ' + e.message); }

  return {
    count: monthResponses.length, tracks,
    revisitPct,
    ledgerNew: ledgerNew.length, ledgerConfirmed: confirmedRows.length,
    ledgerDropped: droppedNew, confirmedSum,
    issueCount,
    visitor, satAll, satOperator, satVisitor,
  };
}

export async function collectMonthlyData(store, month) {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr), monthNum = Number(mStr);

  // 1) 예약 — 전 행을 가져온 뒤 당월/YTD로 나눠 쓴다 (§8-7 Executive·사업부 집계)
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

  // 3) 관련 기사 — 수동 큐레이션 우선 배치, 상한(REPORT_ARTICLE_LIMIT) 미달분만 자동 수집으로 보충
  //    (2026-08-03 렌더 리뷰 — 종전 "수동 행 있으면 자동 미호출"에서 병합 방식으로 변경)
  const manualItems = (await getManualArticles(store, month)).slice(0, REPORT_ARTICLE_LIMIT);
  let articles;
  if (manualItems.length >= REPORT_ARTICLE_LIMIT) {
    articles = { items: manualItems, skipReason: '', source: 'manual', manualCount: manualItems.length, autoCount: 0 };
  } else if (manualItems.length > 0) {
    let fill = [];
    try {
      const seen = {};
      manualItems.forEach((it) => { seen[it.link] = true; });
      fill = filterThinqRealItems((await fetchThinqRealArticles()).items)
        .filter((it) => !seen[it.link])
        .slice(0, REPORT_ARTICLE_LIMIT - manualItems.length);
    } catch (e) { console.warn('[monthly] article fill fail: ' + e.message); }
    articles = {
      items: manualItems.concat(fill), skipReason: '',
      source: fill.length ? 'mixed' : 'manual',
      manualCount: manualItems.length, autoCount: fill.length,
    };
  } else {
    articles = await fetchThinqRealArticles();
    articles.source = articles.provider || 'auto';
    articles.items = filterThinqRealItems(articles.items).slice(0, REPORT_ARTICLE_LIMIT);
    articles.manualCount = 0;
    articles.autoCount = articles.items.length;
    if (!articles.items.length && !articles.skipReason) articles.skipReason = '이번 달 ThinQ Real 관련 보도 없음';
  }

  // 4) 설문·성과 지표 (Phase 5 + §8-7 만족도/NPS·방문자 지표) — 집계 실패 격리
  let survey = null;
  try { survey = await collectMonthlySurvey(store, month); }
  catch (e) { console.warn('[monthly] survey metrics fail: ' + e.message); }

  // 5) 26년 누적(YTD) — 1월~보고월 확정 기준 건수·인원 + R&D 사용일수 (§8-7 2·8)
  let ytd = null;
  try {
    const ytdConfirmed = all.filter((b) => {
      const d7 = String(b.date || '').slice(0, 7);
      return d7.slice(0, 4) === yStr && d7 <= month && b.status === '확정';
    });
    const rdDates = {};
    ytdConfirmed.filter((b) => b.purposeKey === 'rd').forEach((b) => { rdDates[String(b.date)] = true; });
    ytd = {
      confirmed: ytdConfirmed.length,
      visitors: ytdConfirmed.reduce((s, b) => s + (Number(b.count) || 0), 0),
      rdDays: Object.keys(rdDates).length,
    };
  } catch (e) { console.warn('[monthly] ytd metrics fail: ' + e.message); }

  // 6) 사업부별 활용 현황 — 확정 기준, 실제 저장된 본부 값 그대로 그룹핑 (건수 내림차순, '기타'는 맨 뒤)
  let divisions = null;
  try {
    const map = {};
    confirmed.forEach((b) => {
      const dv = String(b.division || '').trim() || '기타';
      if (!map[dv]) map[dv] = { name: dv, count: 0, people: 0 };
      map[dv].count += 1;
      map[dv].people += Number(b.count) || 0;
    });
    divisions = Object.values(map).sort((a, b) => (b.count - a.count) || (b.people - a.people));
    const etcIdx = divisions.findIndex((d) => d.name === '기타');
    if (etcIdx >= 0) divisions.push(divisions.splice(etcIdx, 1)[0]);
  } catch (e) { console.warn('[monthly] division metrics fail: ' + e.message); }

  // 7) 핵심 인사이트·인상 깊은 한마디 (monthly_insights 큐레이션 — §8-7 5·6). 행 없으면 블록 생략
  let insights = [], quotes = [];
  try {
    const rowsIns = (await store.insights.list())
      .filter((r) => normalizeMonth(r.month) === month)
      .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
    insights = rowsIns.filter((r) => String(r.type || 'insight') !== 'quote')
      .map((r) => String(r.text || '')).filter(Boolean);
    quotes = rowsIns.filter((r) => String(r.type) === 'quote')
      .map((r) => ({ text: String(r.text || ''), source: String(r.source || '') }))
      .filter((q) => q.text);
  } catch (e) { console.warn('[monthly] insights fail: ' + e.message); }

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
    ytd, divisions, insights, quotes,
    // 관리자가 지정한 시나리오가 있으면 그 수치, 없으면 고정 수치 (2026-08-24 — resolveReportRoi 참조)
    roiFixed: (await resolveReportRoi(store, allRoi)) || ROI_FIXED,
  };
}
