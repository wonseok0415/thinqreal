// 월간 리포트 CronJob 엔트리포인트 — Apps Script 시간 트리거 대체.
// K8s CronJob: 매일 08:30 KST (`30 8 * * *`, TZ=Asia/Seoul)에 같은 이미지로
//   command: ["node", "src/jobs/monthlyReport.js"] 실행.
// 동작 (2026-07-29 개편): 오늘이 이번 달 첫째 수요일이면 **전월분** 리포트 발송
//   (전월 데이터가 확정된 뒤 발송하는 구조). 월 중복 가드 — app_state의 STATE_LAST_SENT_KEY.
//   수동 발송(§8-6)에서 "자동 발송 건너뛰기"를 체크한 달도 이 가드 키로 스킵된다.
//
// 수동 실행:
//   node src/jobs/monthlyReport.js                → 트리거 로직 그대로 (첫째 수요일 판정 포함)
//   node src/jobs/monthlyReport.js --force        → 판정·중복 가드 무시하고 즉시 발송
//   node src/jobs/monthlyReport.js --month=2026-06 → 대상 월 지정
import { getStore } from '../store/index.js';
import { isFirstWednesdayOfMonth, prevMonthLocal } from '../lib/dates.js';
import { STATE_LAST_SENT_KEY } from '../lib/constants.js';
import { sendMonthlyReport } from '../report/send.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const monthArg = (args.find((a) => a.startsWith('--month=')) || '').split('=')[1] || '';

async function main() {
  const now = new Date();
  const monthKey = monthArg || prevMonthLocal(now); // 전월분 발송
  const store = await getStore();

  if (!force) {
    if (!isFirstWednesdayOfMonth(now)) {
      console.log('[report-job] 오늘은 첫째 수요일이 아님 — skip');
      return;
    }
    const lastSent = await store.state.get(STATE_LAST_SENT_KEY);
    if (lastSent === monthKey) {
      console.log(`[report-job] ${monthKey} 이미 발송됨 — skip (중복 가드)`);
      return;
    }
  }

  const result = await sendMonthlyReport(store, { month: monthKey });
  if (result.sentTo) {
    await store.state.set(STATE_LAST_SENT_KEY, monthKey);
    console.log(`[report-job] 발송 완료 → ${result.sentTo} (${monthKey})`);
  } else {
    console.log(`[report-job] 미발송: ${result.skipped || result.error || 'unknown'}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error('[report-job] error:', e); process.exit(1); },
);
