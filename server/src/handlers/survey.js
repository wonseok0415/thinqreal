// 설문 데이터 파이프라인 — .gs handleSurveySubmit/handleGetSurveyData/
// handleSurveyUpdate/handleLedgerUpdate/handleIssueUpdate 이식 (ThinQReal_Survey_DB_Spec).
//
//  - 제출(survey_submit)은 공개 경로 (예약 booking과 동일 — 토큰 불요)
//  - 조회(survey_data)·수정(survey_update)·상태 전환(ledger_update/issue_update)은 관리자 토큰 필수
//  - 삭제(survey/ledger/issue_delete)는 테스트·실수 데이터 정리 전용 (2026-07 추가) —
//    실제 성과 기록은 드롭/기각 상태 전환으로 보존이 원칙. survey_delete는 파생 행 cascade.
import { config } from '../config.js';
import { SURVEY_HEADERS, LEDGER_HEADERS, ISSUE_HEADERS, SEVERITY_PCT } from '../lib/constants.js';
import { normalizeMonth } from '../lib/dates.js';
import { decodeHtmlEntities } from '../lib/html.js';
import { verifyAdminToken } from '../auth/token.js';
import { notifySurvey } from '../notify/index.js';

// 기여 수준 라디오 원문에서 % 파싱 — "…(25%)" → 25. 미매칭 시 공란.
export function parseAttrPct(text) {
  const m = String(text || '').match(/\((\d{1,3})%\)/);
  return m ? Number(m[1]) : '';
}

// ── 설문 제출 (공개 경로 — 토큰 불요) ──────────────────────
export async function handleSurveySubmit(store, data) {
  const track = String(data.track || '');
  if (!['sales', 'media', 'etc'].includes(track)) {
    return { ok: false, error: 'invalid_track' };
  }
  const responseId = String(Date.now());
  const submittedAt = new Date().toISOString();

  const response = {};
  for (const h of SURVEY_HEADERS) {
    if (h === 'response_id') response[h] = responseId;
    else if (h === 'submitted_at') response[h] = submittedAt;
    else if (h === 'raw_json') response[h] = JSON.stringify(data);
    else response[h] = data[h] == null ? '' : String(data[h]);
  }
  await store.survey.appendResponse(response);

  // ── 파생 1: 성과 추적 대장 (성과 연결 응답 시, status=후보) ──
  const ledgerRows = [];
  if (track === 'media' && data.media_link === '특정 캠페인·프로모션과 연결됨') {
    ledgerRows.push({ category: '홍보·광고 마케팅', name: data.media_link_name, scale: data.media_link_size, attr: data.media_link_attr });
  }
  if (track === 'etc' && data.etc_link === '신규 Task·과제') {
    ledgerRows.push({ category: '신규 Task·기타', name: data.etc_link_name, scale: data.etc_link_size, attr: data.etc_link_attr });
  }
  for (let i = 0; i < ledgerRows.length; i++) {
    const r = ledgerRows[i];
    const row = {};
    for (const h of LEDGER_HEADERS) {
      if (h === 'ledger_id') row[h] = responseId + '-L' + (i + 1);
      else if (h === 'response_id') row[h] = responseId;
      else if (h === 'category') row[h] = r.category;
      else if (h === 'project_name') row[h] = r.name || '';
      else if (h === 'expected_scale') row[h] = r.scale || '';
      else if (h === 'attribution_text') row[h] = r.attr || '';
      else if (h === 'attribution_pct') row[h] = parseAttrPct(r.attr);
      else if (h === 'visit_date') row[h] = data.visit_date || '';
      else if (h === 'respondent') row[h] = data.name || '';
      else if (h === 'dept') row[h] = data.dept || '';
      else if (h === 'status') row[h] = '후보';
      else row[h] = '';
    }
    await store.survey.appendLedger(row);
  }

  // ── 파생 2: IoT 이슈 로그 ('발견함' 응답 시, status=등록) ──
  let issueCount = 0;
  if (track === 'etc' && data.iot_defect === '발견함') {
    const row = {};
    for (const h of ISSUE_HEADERS) {
      if (h === 'issue_id') row[h] = responseId + '-I1';
      else if (h === 'response_id') row[h] = responseId;
      else if (h === 'symptom') row[h] = data.iot_defect_detail || '';
      else if (h === 'status') row[h] = '등록';
      else row[h] = '';
    }
    await store.survey.appendIssue(row);
    issueCount = 1;
  }

  // 알림 — 실패해도 제출은 성공 처리 (메일·예약과 동일한 격리 원칙)
  try { await notifySurvey(data, track, ledgerRows.length, issueCount); }
  catch (e) { console.warn('[survey] notify fail: ' + e.message); }

  return { ok: true, response_id: responseId };
}

// ── 설문·대장·이슈 + 방문자·큐레이션·베스트 리뷰어 통합 조회 (관리자 토큰 필수) ──
export async function handleGetSurveyData(store, token) {
  const admin = verifyAdminToken(token);
  if (!admin.ok) {
    return { error: 'unauthorized', reason: admin.reason || 'invalid_token' };
  }
  const [responses, ledger, issues, visitors, insightsRaw, articles, bestRaw] = await Promise.all([
    store.survey.listResponses(),
    store.survey.listLedger(),
    store.survey.listIssues(),
    store.visitors.list(),           // 방문자 현장 설문 (§8-5, 조회 전용)
    store.insights.list(),           // 월간 리포트 큐레이션 (§8-7 5·6)
    store.articles.listAll(),        // 관련 기사 큐레이션
    store.best.list(),               // 베스트 리뷰어 발송 이력 (2026-08-22)
  ]);
  // month 셀 날짜 자동 변환 잔재 흡수 (.gs insightMonthKey와 동일 목적)
  const insights = insightsRaw.map((r) => ({ ...r, month: normalizeMonth(r.month) }));
  const bestReviewers = bestRaw.map((r) => ({ ...r, month: normalizeMonth(r.month) }));
  // 기사 목록 엔티티 소급 힐링 (2026-08-25 이식) — thumbnail은 주소라 디코딩 제외
  const articlesOut = articles.map((a) => ({
    ...a,
    title: decodeHtmlEntities(a.title),
    source: decodeHtmlEntities(a.source),
    summary: decodeHtmlEntities(a.summary || ''),
  }));
  return { responses, ledger, issues, visitors, insights, articles: articlesOut, bestReviewers };
}

// data에서 편집 가능 필드만 추출 (undefined 필드는 건너뜀 — 현행 setValue 조건과 동일)
function pickFields(data, editable) {
  const fields = {};
  for (const f of editable) if (data[f] !== undefined) fields[f] = data[f];
  return fields;
}

// ── 설문 응답 내용 수정 (관리자 토큰 게이트 — 오탈자·내용 정정용) ──
// 불변 필드: response_id·submitted_at·track은 식별/집계 기준, raw_json은 제출 원문 증빙.
// 파생 트리거 3종(media_link/etc_link/iot_defect)도 불변 — 제출 시점에만 대장·이슈 행을
// 생성하므로 사후 변경하면 파생 행과 어긋난다. 연결 오류는 대장 드롭/이슈 기각으로 처리.
const SURVEY_IMMUTABLE = new Set(['response_id', 'submitted_at', 'track', 'raw_json',
  'media_link', 'etc_link', 'iot_defect']);

export async function handleSurveyUpdate(store, data) {
  const editable = SURVEY_HEADERS.filter((f) => !SURVEY_IMMUTABLE.has(f));
  const updated = await store.survey.updateResponse(data.id, pickFields(data, editable));
  return updated ? { ok: true } : { ok: false, error: 'not_found' };
}

// ── 성과 추적 대장 상태 전환 + 내용 수정 (관리자 토큰 게이트) ──
// status: 후보 → 확정(확정 금액·일자·근거 입력) / 드롭(사유). 행 삭제 없음.
// 내용 필드(category~dept)는 오탈자 정정용. attribution_text(라디오 원문)·response_id는 증빙으로 불변.
const LEDGER_EDITABLE = ['status', 'confirmed_amount', 'confirmed_date', 'confirmed_note', 'roi_included',
  'category', 'project_name', 'expected_scale', 'attribution_pct',
  'visit_date', 'respondent', 'dept', 'amount_basis'];

export async function handleLedgerUpdate(store, data) {
  const updated = await store.survey.updateLedger(data.id, pickFields(data, LEDGER_EDITABLE));
  return updated ? { ok: true } : { ok: false, error: 'not_found' };
}

// ── 설문·대장·이슈 영구 삭제 (관리자 토큰 게이트 — 테스트·실수 데이터 정리용) ──
// survey_delete는 응답의 파생 행(대장·이슈, response_id 연결)도 함께 삭제해 고아 행을 막는다.
// 예약 booking_delete와 동일하게 알림(메일·텔레그램)은 발송하지 않는다.
export async function handleSurveyDelete(store, data) {
  const n = await store.survey.removeResponse(data.id);
  if (!n) return { ok: false, error: 'not_found' };
  const ledgerN = await store.survey.removeLedgerByResponse(data.id);
  const issueN = await store.survey.removeIssueByResponse(data.id);
  return { ok: true, deleted: { response: n, ledger: ledgerN, issues: issueN } };
}

export async function handleLedgerDelete(store, data) {
  const n = await store.survey.removeLedger(data.id);
  return n ? { ok: true } : { ok: false, error: 'not_found' };
}

export async function handleIssueDelete(store, data) {
  const n = await store.survey.removeIssue(data.id);
  return n ? { ok: true } : { ok: false, error: 'not_found' };
}

// ── IoT 이슈 상태·속성 부여 (관리자 토큰 게이트) ─────────────
// C_AS 채널 단가는 민감 정보 — 코드·리포에 두지 않고 env SURVEY_CAS_JSON 에만 둔다
// (.gs의 Script Property를 env로 이식). 형식: {"원격":N,"내방":N,"출장":N} (원 단위).
// 미설정 시 est_value 공란 유지 (참고용 표시일 뿐 ROI 미산입이라 무해).
export function computeIssueEstValue(severity, channel, qShip) {
  let cas = null;
  try { cas = config.surveyCasJson ? JSON.parse(config.surveyCasJson) : null; }
  catch { cas = null; }
  if (!cas || !severity || !channel || !qShip) return '';
  const p = SEVERITY_PCT[severity];
  const c = cas[channel];
  if (p == null || c == null) return '';
  return Math.round(p * Number(qShip) * Number(c));
}

const ISSUE_EDITABLE = ['device', 'symptom', 'severity', 'channel', 'q_ship', 'status'];

export async function handleIssueUpdate(store, data) {
  const updated = await store.survey.updateIssue(data.id, pickFields(data, ISSUE_EDITABLE));
  if (!updated) return { ok: false, error: 'not_found' };
  // severity·channel·q_ship 3종 모두 있을 때만 est_value 서버 계산 (참고용·ROI 미산입)
  const est = computeIssueEstValue(updated.severity, updated.channel, updated.q_ship);
  await store.survey.updateIssue(data.id, { est_value: est });
  return { ok: true, est_value: est };
}
