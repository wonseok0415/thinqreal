// 방문 후기 설문 요청 자동 발송 — .gs surveyInviteTrigger/sendSurveyInvitesCore 이식.
// K8s CronJob: 매일 08:30 KST (`30 8 * * *`, TZ=Asia/Seoul)
//   command: ["node", "src/jobs/surveyInvite.js"]
//
// 동작: status=확정 + 방문일 경과(방문 다음날부터) + 이메일 보유(@lge.com 한정) + 미발송 행에
//   설문 요청 메일 1통. 같은 이메일 다건은 가장 최근 방문 1건 기준으로 1통만.
//   발송한 행은 bookings.surveyInviteSentAt에 기록 → 재실행해도 중복 발송 없음 (멱등).
//
// 수동 실행:
//   node src/jobs/surveyInvite.js --preview   → 발송 없이 대상자 명단만 로그 (드라이런)
//   node src/jobs/surveyInvite.js             → 자동 발송 (CC: 담당자 3명 + 운영자)
//   node src/jobs/surveyInvite.js --batch     → 1회성 수동 배치 (CC: 운영자만)
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { AUTH_ALLOWED_DOMAINS } from '../lib/constants.js';
import { formatDateLocal, normalizeDate } from '../lib/dates.js';
import { getStore } from '../store/index.js';
import { sendMail } from '../mail/mailer.js';
import {
  buildSurveyInviteSubject, buildSurveyInviteText, buildSurveyInviteHtml,
} from '../mail/templates/surveyInvite.js';

// 참조(CC) 수신자 — 관리자 전원 참조는 통수 부담으로 미채택 (2026-07-19 결정)
const CC_BATCH = () => config.adminAlertCc;                                  // 수동 배치: 운영자만
const CC_AUTO = () => config.adminAlertTo + ', ' + config.adminAlertCc;      // 자동: 담당자 3명 + 운영자

export async function getSurveyInviteTargets(store) {
  const rows = await store.bookings.listAll();
  const today = formatDateLocal(new Date());
  const byEmail = {};
  const excluded = new Set();

  for (const b of rows) {
    const status = String(b.status || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const date = normalizeDate(b.date);
    const sent = String(b.surveyInviteSentAt || '').trim();
    if (status !== '확정' || !email || email.indexOf('@') < 0) continue;
    // 발송 대상은 임직원(@lge.com)으로 한정 — 사이트 게이트와 동일한 허용 도메인 단일 소스
    if (!AUTH_ALLOWED_DOMAINS.some((d) => email.endsWith('@' + d))) { excluded.add(email); continue; }
    if (!date || date >= today) continue; // 방문 다음날부터 발송 (방문 전 발송 방지)
    if (sent) continue;                   // 이미 발송한 행 제외 (재실행 안전)

    const rec = {
      id: String(b.id), email, date,
      name: String(b.name || ''),
      slotLabel: String(b.slotLabel || ''),
      purpose: String(b.purpose || ''),
      subject: String(b.subject || b.org || ''),
      division: String(b.division || ''),
      department: String(b.department || ''),
    };
    const cur = byEmail[email];
    if (!cur) byEmail[email] = { latest: rec, ids: [rec.id] };
    else {
      cur.ids.push(rec.id);
      if (rec.date > cur.latest.date) cur.latest = rec;
    }
  }
  if (excluded.size) {
    console.log('[survey-invite] 제외 (@lge.com 외 주소 ' + excluded.size + '건): ' + [...excluded].join(', '));
  }
  return Object.values(byEmail);
}

async function sendSurveyInvitesCore(store, cc, label) {
  const targets = await getSurveyInviteTargets(store);
  if (!targets.length) { console.log(`[survey-invite] [${label}] 발송 대상이 없습니다.`); return 0; }

  const now = new Date().toISOString();
  let ok = 0, fail = 0;
  for (const t of targets) {
    const b = t.latest;
    const result = await sendMail({
      to: b.email, cc,
      subject: buildSurveyInviteSubject(),
      text: buildSurveyInviteText(b), html: buildSurveyInviteHtml(b),
    });
    if (result.ok) {
      // 발송 성공한 이메일의 모든 해당 행에 surveyInviteSentAt 기록
      for (const id of t.ids) await store.bookings.update(id, { surveyInviteSentAt: now });
      ok++;
    } else {
      fail++;
      console.warn(`[survey-invite] [${label}] 발송 실패: ${b.email} — ${result.error}`);
    }
  }
  console.log(`[survey-invite] [${label}] 설문 요청 발송 완료: 성공 ${ok}통 / 실패 ${fail}통`);
  return ok;
}

/** 자동 발송 (매일 08:30) — 인앱 스케줄러(lib/scheduler.js)와 CLI가 공유 */
export async function runSurveyInviteJob(store) {
  return sendSurveyInvitesCore(store, CC_AUTO(), '자동');
}

// CLI 직접 실행 시에만 동작 (스케줄러가 import할 때는 실행 안 함)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  (async () => {
    const store = await getStore();
    if (args.includes('--preview')) {
      const targets = await getSurveyInviteTargets(store);
      console.log('[survey-invite] 설문 요청 대상: ' + targets.length + '명');
      targets.forEach((t) => {
        const b = t.latest;
        console.log('- ' + b.email + ' | ' + b.date + ' ' + b.slotLabel + ' | ' + b.purpose + ' | ' + b.name +
          (t.ids.length > 1 ? ' (확정 ' + t.ids.length + '건 → 1통)' : ''));
      });
      return;
    }
    if (args.includes('--batch')) await sendSurveyInvitesCore(store, CC_BATCH(), '수동 배치');
    else await runSurveyInviteJob(store);
  })().then(
    () => process.exit(0),
    (e) => { console.error('[survey-invite] error:', e); process.exit(1); },
  );
}
