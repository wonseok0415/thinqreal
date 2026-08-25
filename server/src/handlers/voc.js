// FieldVoice 현장 인사이트 (방문 인터뷰 분석 리포트) — .gs handleNewVocReport/GetVocReports 이식.
// - 파이프라인(현장 노트북)이 도슨트의 수동 확인 후 1페이지 요약 리포트를 POST, 관리자 🎙 탭이 GET
// - 저장 원칙: 가명화된 1페이지 요약만 — 원본 음성·전사는 절대 업로드하지 않음
// - 인증: POST = FV_API_KEY (env, fail-closed) / GET = 관리자 토큰 필수
//   (health_checks와 달리 방문객 발화 인용이 포함되므로 무인증 조회 불가)
import { config } from '../config.js';
import { VOC_HEADERS } from '../lib/constants.js';
import { verifyAdminToken } from '../auth/token.js';

export async function handleNewVocReport(store, data) {
  if (!config.fvApiKey || String(data.apiKey || '') !== config.fvApiKey) {
    return { error: 'Unauthorized' };
  }
  // 1페이지 요약만 받는다 — 비정상적으로 큰 본문(전사 전문 오업로드 등)은 거부.
  const md = String(data.report_md || '').trim();
  if (!md) return { error: 'report_md is required' };
  if (md.length > 20000) {
    return { error: 'report too large — 1페이지 요약(report.md)만 업로드하세요' };
  }

  const id = String(Date.now());
  const record = {};
  for (const h of VOC_HEADERS) {
    if (h === 'id') record[h] = id;
    else if (h === 'timestamp') record[h] = data.timestamp || new Date().toISOString();
    else if (h === 'report_md') record[h] = md;
    else record[h] = data[h] != null ? String(data[h]) : '';
  }
  await store.voc.append(record);
  return { success: true, id };
}

export async function handleGetVocReports(store, token, days) {
  const admin = verifyAdminToken(token);
  if (!admin.ok) return { error: 'unauthorized', reason: admin.reason || 'invalid_token' };

  const rows = await store.voc.list();
  let cutoff = null;
  const n = Number(days);
  if (n > 0) cutoff = new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const records = rows.filter((r) => {
    if (!r.id) return false;
    if (!cutoff) return true;
    const t = new Date(r.timestamp);
    return !isNaN(t) && t >= cutoff;
  });
  // 방문일 최신순 (같은 날은 업로드 시각순)
  records.sort((a, b) =>
    String(b.visit_date || b.timestamp).localeCompare(String(a.visit_date || a.timestamp)) ||
    String(b.timestamp).localeCompare(String(a.timestamp)));
  return { records };
}
