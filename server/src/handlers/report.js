// 월간 리포트 미리보기 / §8-6 2단계 수동 발송 — .gs handleMonthlyReportPreview/handleMonthlyReportSend 이식.
// - URL 한 번으로 실발송되던 confirm=YES 설계 폐기 (2026-07-27 오클릭 사고 재발 방지)
// - Step 1 확인 화면 → 일회용 토큰(10분) 링크로 Step 2 실발송 / 테스트 발송
// - 자동 발송(첫째 수요일·전월분)은 수동 이력과 무관하게 항상 진행 — 스킵은 skipauto 체크 시
//   STATE_LAST_SENT_KEY 기록으로만
// 토큰·이력은 app_state(store.state)에 저장 — 멀티 레플리카에서도 공유됨.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { STATE_LAST_SENT_KEY } from '../lib/constants.js';
import { escapeHtml } from '../lib/html.js';
import { sendMonthlyReport } from '../report/send.js';

// 전월 yyyy-MM (KST — 프로세스 TZ 전제) — 새 발송 체제의 기본 대상 월
export function prevMonthKey(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1; // 1~12
  return (m === 1 ? y - 1 : y) + '-' + String(m === 1 ? 12 : m - 1).padStart(2, '0');
}

/** HTML 본문 반환 (메일 미발송) — 상단 고정 배너로 발송 아님을 명시.
 *  <meta charset> 포함 완전한 문서로 감싼다 (file://로 열면 인코딩 오추측 — Safari 한글 깨짐). */
export async function handleMonthlyReportPreview(store, params) {
  const result = await sendMonthlyReport(store, { month: params.month, dryRun: true });
  const banner =
    '<div style="position:sticky;top:0;z-index:9;background:#fff3cd;border-bottom:2px solid #e0a800;' +
    'padding:12px 20px;font-family:sans-serif;text-align:center;">' +
      '<div style="font-size:15px;font-weight:700;color:#7a5a00;">📄 미리보기 — 이 화면은 발송되지 않습니다</div>' +
      '<div style="font-size:12.5px;color:#7a5a00;margin-top:4px;">대상: ' + escapeHtml(result.data.year + '년 ' + result.data.monthNum + '월분') +
      ' · 실제 발송은 매월 첫째 수요일 08:30 자동 진행 (전월분)</div>' +
    '</div>';
  const html =
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(result.subject) + '</title></head><body style="margin:0;">' +
    banner + result.html +
    '</body></html>';
  return { html, subject: result.subject };
}

// ── 발송 토큰 (일회용, 10분) — app_state에 "token|생성ms" 저장 ──
const SEND_TOKEN_TTL_MS = 10 * 60 * 1000;

async function issueSendToken(store, kind, month) {
  const token = crypto.randomUUID().replace(/-/g, '');
  await store.state.set(kind + '_token_' + month, token + '|' + Date.now());
  return token;
}

async function consumeSendToken(store, kind, month, given) {
  const key = kind + '_token_' + month;
  const stored = await store.state.get(key);
  if (!stored) return false;
  const [token, ts] = stored.split('|');
  if (token !== String(given || '')) return false;
  if (Date.now() - Number(ts) > SEND_TOKEN_TTL_MS) { await store.state.set(key, ''); return false; }
  await store.state.set(key, ''); // 성공 시 즉시 폐기 — 재사용 불가
  return true;
}

function safetyPage(title, bodyHtml) {
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>ThinQ Real 리포트 발송</title></head><body style="margin:0;background:#f5f5f7;">' +
    '<div style="font-family:\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif;max-width:640px;margin:40px auto;padding:0 16px;">' +
      '<div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:28px;">' +
        '<div style="font-size:19px;font-weight:700;color:#1d1d1f;margin-bottom:14px;">' + title + '</div>' +
        bodyHtml +
      '</div>' +
      '<div style="font-size:11.5px;color:#aeaeb2;margin-top:12px;text-align:center;">ThinQ Real 월간 리포트 발송 안전장치</div>' +
    '</div></body></html>';
}

/** §8-6 2단계 발송 — { html } 반환 (라우트가 text/html로 응답) */
export async function handleMonthlyReportSend(store, params) {
  const month = params.month || prevMonthKey();
  const to = config.monthlyReportTo || '';
  const selfUrl = '/api?type=monthly_report_send&month=' + month;

  // ── 레거시 confirm=YES 폐기 — 발송하지 않고 안내 (구 북마크·공유 URL 전부 무해화) ──
  if (params.confirm === 'YES') {
    return { html: safetyPage('발송 방식이 변경되었습니다',
      '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">confirm=YES 방식은 오클릭 사고 방지를 위해 폐기되었습니다.<br>' +
      '아래 링크로 접속해 <strong>확인 화면</strong>을 거쳐 발송해 주세요.</p>' +
      '<p><a href="' + selfUrl + '" target="_top" style="color:#3a5035;font-weight:600;">발송 확인 화면 열기 →</a></p>') };
  }

  // ── Step 2: 전체 발송 실행 (일회용 토큰) ──
  if (params.confirm) {
    if (!(await consumeSendToken(store, 'send', month, params.confirm))) {
      return { html: safetyPage('토큰이 유효하지 않습니다',
        '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">발송 토큰이 만료(10분)됐거나 이미 사용되었습니다.<br>' +
        '<a href="' + selfUrl + '" target="_top" style="color:#3a5035;font-weight:600;">확인 화면에서 다시 시도 →</a></p>') };
    }
    const result = await sendMonthlyReport(store, { month });
    if (!result.sentTo) {
      return { html: safetyPage('❌ 발송 실패', '<p style="font-size:14px;color:#c0392b;">' +
        escapeHtml(result.skipped || result.error || '원인 미상') + ' — env MONTHLY_REPORT_TO를 확인하세요.</p>') };
    }
    // 수동 발송 이력 (확인 화면 경고용) — STATE_LAST_SENT_KEY에는 기록하지 않음 (자동 정식본 발송 보장)
    const mkey = 'manual_sent_' + month;
    const prevLog = await store.state.get(mkey);
    await store.state.set(mkey, (prevLog ? prevLog + ';' : '') + new Date().toISOString());
    // 「이번 달 자동 발송 건너뛰기」 — 체크한 경우에만 예외적으로 가드 키 기록 → 자동 트리거가 해당 월 스킵
    let skipNote;
    if (params.skipauto === '1') {
      await store.state.set(STATE_LAST_SENT_KEY, month);
      skipNote = '이번 달(' + month + '분) <strong>자동 발송은 생략됩니다</strong> — 이 수동 발송본이 정식본이 됩니다.';
    } else {
      skipNote = '다음 달 첫째 수요일의 자동 발송은 정상 진행됩니다.';
    }
    return { html: safetyPage('✅ 발송 완료',
      '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;"><strong>' + escapeHtml(month) + '분</strong> 리포트를 발송했습니다.<br>' +
      '수신: ' + escapeHtml(result.sentTo) + ' (+CC ' + escapeHtml(config.adminAlertCc) + ')</p>' +
      '<p style="font-size:13px;color:#6e6e73;line-height:1.7;">' + skipNote + '</p>') };
  }

  // ── Step 2': 테스트 발송 실행 ("나만 보는 샘플" — 이력·가드 키 무기록) ──
  if (params.test) {
    if (!(await consumeSendToken(store, 'test', month, params.test))) {
      return { html: safetyPage('토큰이 유효하지 않습니다',
        '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">테스트 토큰이 만료(10분)됐거나 이미 사용되었습니다.<br>' +
        '<a href="' + selfUrl + '" target="_top" style="color:#3a5035;font-weight:600;">확인 화면에서 다시 시도 →</a></p>') };
    }
    const testTo = config.monthlyReportTestTo || '';
    if (!testTo) {
      return { html: safetyPage('테스트 수신자 미설정',
        '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">env <strong>MONTHLY_REPORT_TEST_TO</strong>' +
        '(테스트 수신 메일 주소)를 등록한 뒤 다시 시도해 주세요.</p>') };
    }
    const result = await sendMonthlyReport(store, { month, to: testTo, subjectPrefix: '[테스트] ', noCc: true });
    return { html: safetyPage('✅ 테스트 발송 완료',
      '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;"><strong>' + escapeHtml(testTo) + '</strong>에게만 발송되었습니다 (CC 없음, 제목 [테스트]).<br>' +
      '발송 이력에 기록되지 않으며 자동 발송에도 영향이 없습니다.</p>') };
  }

  // ── Step 1: 발송 확인 화면 (여기까지는 발송 0건) ──
  const sendToken = await issueSendToken(store, 'send', month);
  const testToken = await issueSendToken(store, 'test', month);
  const autoSent = (await store.state.get(STATE_LAST_SENT_KEY)) === month;
  const manualLog = (await store.state.get('manual_sent_' + month)) || '';
  let warn = '';
  if (autoSent || manualLog) {
    const times = [autoSent ? '자동 발송 완료' : '',
      manualLog ? '수동 ' + manualLog.split(';').map((t) => t.slice(0, 16).replace('T', ' ')).join(', ') : '']
      .filter(Boolean).join(' · ');
    warn = '<div style="background:#fdecea;border:1px solid #e57373;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13.5px;color:#b71c1c;line-height:1.6;">' +
      '⚠ <strong>이번 달 이미 발송됨</strong> (' + escapeHtml(times) + ') — 재발송 시 수신자에게 중복 수신됩니다.</div>';
  }
  const recipients = (to || '(MONTHLY_REPORT_TO 미설정)') + ' · CC ' + config.adminAlertCc;
  const sendUrl = selfUrl + '&confirm=' + sendToken;
  const testUrl = selfUrl + '&test=' + testToken;
  return { html: safetyPage('📮 ' + month + '분 리포트 발송 확인',
    '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;"><strong>수신자</strong><br>' + escapeHtml(recipients) + '</p>' +
    warn +
    '<p style="font-size:13px;color:#6e6e73;line-height:1.7;">다음 달 첫째 수요일의 자동 발송은 이 수동 발송과 무관하게 정상 진행됩니다.</p>' +
    '<label style="display:block;background:#f5f7f4;border:1px solid #d8ded6;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13.5px;color:#1d1d1f;cursor:pointer;">' +
      '<input type="checkbox" id="skipauto" style="margin-right:8px;">이번 달 자동 발송 건너뛰기' +
      '<div style="font-size:12px;color:#6e6e73;margin-top:4px;margin-left:22px;">체크하면 이번 달 자동 발송이 생략됩니다 (수동 발송본이 정식본이 됩니다).</div>' +
    '</label>' +
    '<div style="margin-top:18px;">' +
      '<a id="sendBtn" href="' + sendUrl + '" target="_top" style="display:inline-block;background:#3a5035;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">전체 발송하기</a>' +
      '<a href="' + testUrl + '" target="_top" style="display:inline-block;margin-left:10px;background:#ffffff;color:#3a5035;border:1.5px solid #3a5035;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">나에게만 테스트 발송</a>' +
    '</div>' +
    '<p style="font-size:11.5px;color:#aeaeb2;margin-top:14px;">발송 버튼은 10분간 유효한 일회용 링크입니다.</p>' +
    '<script>document.getElementById("skipauto").addEventListener("change",function(){' +
      'var a=document.getElementById("sendBtn");var base="' + sendUrl + '";a.href=this.checked?base+"&skipauto=1":base;});' +
    '</scr' + 'ipt>') };
}
