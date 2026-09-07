// FieldCheck 자동 점검 (ThinQ ON Field 자동 점검 시스템) — .gs handleNewHealthCheck/GetHealthChecks 이식.
// - 점검 장비(무인 노트북)가 POST, 관리자 페이지가 GET (조회는 무인증 — 비민감 점검 결과)
// - 인증: 관리자 토큰 경로가 아닌 FC_API_KEY (env — 미설정 시 접수 전부 거부, fail-closed)
// - 실패 즉시 알림은 FC_IMMEDIATE_ALERT가 켜진 경우에만 (테스트 단계에선 일일 요약이 기본)
import { config } from '../config.js';
import { HEALTH_HEADERS, FC_TEST_MODE, FC_IMMEDIATE_ALERT } from '../lib/constants.js';
import { sendMail } from '../mail/mailer.js';
import { sendTelegramMessage } from '../notify/telegram.js';
import { escapeTelegramHtml } from '../lib/html.js';

export async function handleNewHealthCheck(store, data) {
  if (!config.fcApiKey || String(data.apiKey || '') !== config.fcApiKey) {
    return { error: 'Unauthorized' };
  }
  const id = String(Date.now());
  const record = {};
  for (const h of HEALTH_HEADERS) {
    if (h === 'id') record[h] = id;
    else if (h === 'timestamp') record[h] = data.timestamp || new Date().toISOString();
    else record[h] = data[h] ?? '';
  }
  await store.health.append(record);

  let mailed = false;
  if (FC_IMMEDIATE_ALERT && data.result === 'fail' && data.alert) {
    await sendHealthAlert(data);
    mailed = true;
  }
  return { success: true, id, mailed };
}

export async function handleGetHealthChecks(store, days) {
  const rows = await store.health.list();
  let cutoff = null;
  const n = Number(days);
  if (n > 0) cutoff = new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const records = rows.filter((r) => {
    if (!r.id) return false;
    if (!cutoff) return true;
    const t = new Date(r.timestamp);
    return !isNaN(t) && t >= cutoff;
  });
  records.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return { records };
}

// ── 점검 실패 즉시 알림 (FC_IMMEDIATE_ALERT가 켜진 경우에만 사용) ──
async function sendHealthAlert(data) {
  const label = data.scenario_label || data.scenario_id || '';
  const subject = `[ThinQ Real] ⚠ 자동 점검 실패 — ${label}`;
  const body = [
    'FieldCheck 자동 점검에서 실패가 감지되었습니다.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `  점검 시각 : ${data.timestamp || ''}`,
    `  점검 단계 : ${data.level || 'L1'}`,
    `  시나리오  : ${label}`,
    '  결과      : 실패 (음성 응답 없음 또는 판정 기준 미달)',
    `  녹음 파일 : ${data.media_ref || '-'} (점검 장비의 recordings 폴더)`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'ThinQ ON이 점검 발화에 음성으로 응답하지 않았습니다.',
    '현장에서 직접 발화하여 재현 여부를 확인해 주세요.',
  ].join('\n');

  try {
    if (FC_TEST_MODE) await sendMail({ to: config.adminAlertCc, subject, text: body });
    else await sendMail({ to: config.fcReportTo, cc: config.adminAlertCc, subject, text: body });
  } catch (e) { console.warn('[health] alert mail error: ' + e.message); }

  // 텔레그램은 담당자 전원이 있는 그룹이므로 테스트 단계에선 발송하지 않음
  if (!FC_TEST_MODE) {
    const e = escapeTelegramHtml;
    await sendTelegramMessage(
      '⚠ <b>ThinQ ON 자동 점검 실패</b>\n' +
      '시나리오: ' + e(label) + '\n' +
      '시각: ' + e(String(data.timestamp || '')) + '\n' +
      '음성 무응답 — 현장 재현 확인 필요');
  }
}
