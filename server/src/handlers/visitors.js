// 방문자 현장 설문 (§8-5, 2026-07-27) — 퇴장 직전 QR 익명 응답. .gs handleVisitorSubmit/Delete 이식.
// · 완전 익명: 성명·소속 미수집, 언어 선택(lang)만 기록. 공개 제출 경로 (survey_submit과 동일 지위).
// · 파생 없음 (성과 대장·이슈 로그 미생성) · ROI 미산입.
// · 저장 value는 언어 무관 한국어 canonical (운영 설문과 컬럼·값 단위 직접 비교 전제).
import { VISITOR_HEADERS } from '../lib/constants.js';
import { sendTelegramMessage } from '../notify/telegram.js';

export async function handleVisitorSubmit(store, data) {
  const responseId = String(Date.now());
  const lang = data.lang === 'en' ? 'EN' : 'KO';
  const record = {};
  for (const h of VISITOR_HEADERS) {
    if (h === 'response_id') record[h] = responseId;
    else if (h === 'submitted_at') record[h] = new Date().toISOString();
    else if (h === 'lang') record[h] = lang;
    else if (h === 'raw_json') record[h] = JSON.stringify(data);
    else record[h] = data[h] == null ? '' : String(data[h]);
  }
  await store.visitors.append(record);

  // 텔레그램 알림 — 실패해도 제출은 성공 처리 (기존 격리 원칙)
  try {
    await sendTelegramMessage('🙋 방문자 설문 접수 [' + lang + '] — 만족도 ' +
      String(data.satisfaction || '').replace(/[<>&]/g, ''));
  } catch (e) { console.warn('[visitor] telegram fail: ' + e.message); }

  return { ok: true, response_id: responseId };
}

// 방문자 응답 영구 삭제 (관리자 토큰 게이트) — 테스트·실수 정리용.
// 파생 행이 없으므로 cascade 불필요. 수정(edit) 기능은 의도적으로 없음 — 익명 응답 원문 보존 원칙.
export async function handleVisitorDelete(store, data) {
  const n = await store.visitors.remove(data.id);
  return n ? { ok: true } : { ok: false, error: 'not_found' };
}
