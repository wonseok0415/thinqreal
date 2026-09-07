// 인앱 스케줄러 — Apps Script 시간 트리거 대체 (K8s CronJob 없이 앱이 스스로 일일 잡 실행).
//
// CronJob 매니페스트 방식 대신 이 방식을 택한 이유:
//  1. release.yml은 deploy/base/deployment.yaml의 이미지 태그만 갱신 — CronJob 매니페스트를 따로 두면
//     릴리스마다 태그가 뒤처져 "옛 코드로 잡이 도는" 고착이 생긴다. 인앱이면 항상 현재 배포 이미지로 돈다.
//  2. deploy/ 구조(kustomize·ArgoCD 등록) 수정이 전혀 필요 없다 — push 한 번으로 끝.
//
// 멀티 레플리카(HPA min 2) 중복 실행 방지: Valkey 일일 락(kvTryLock — SET NX EX).
// 락을 획득한 레플리카만 실행하고, 같은 날의 다른 레플리카·재시도는 잡을 건너뛴다.
// Valkey 미설정(로컬)은 메모리 락 — 단일 인스턴스 전제라 동작 동일.
//
// 각 잡은 자체 멱등 가드도 이중으로 갖고 있다 (월간 리포트 = app_state 월 가드 /
// 설문 초대 = surveyInviteSentAt 마커 / FieldCheck 요약 = 하루 1회 락만으로 충분).
// ST/QA에서는 outboundSuppressed로 실발송이 억제되므로 매일 돌아도 로그만 남는다.
import { config } from '../config.js';
import { formatDateLocal } from './dates.js';
import { kvTryLock } from './kvcache.js';
import { runMonthlyReportJob } from '../jobs/monthlyReport.js';
import { runSurveyInviteJob } from '../jobs/surveyInvite.js';
import { runFieldcheckSummaryJob } from '../jobs/fieldcheckSummary.js';

// 실행 시각(KST — 프로세스 TZ 전제)은 Apps Script 트리거와 동일
const JOBS = [
  { name: 'fieldcheck-summary', hour: 7, minute: 40, run: runFieldcheckSummaryJob },
  { name: 'monthly-report', hour: 8, minute: 30, run: (store) => runMonthlyReportJob(store, {}) },
  { name: 'survey-invite', hour: 8, minute: 30, run: runSurveyInviteJob },
];

const WINDOW_MIN = 5;         // 목표 시각부터 5분 안에 든 tick만 발화 (재시작 직후 과거 시각 오발화 방지)
const LOCK_TTL_SEC = 20 * 60 * 60; // 일일 락 20시간 — 다음날 같은 시각 전에 자연 만료

function inWindow(now, hour, minute) {
  const target = hour * 60 + minute;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= target && cur < target + WINDOW_MIN;
}

async function tick(store) {
  const now = new Date();
  for (const job of JOBS) {
    if (!inWindow(now, job.hour, job.minute)) continue;
    let locked;
    try {
      locked = await kvTryLock(`job:${job.name}:${formatDateLocal(now)}`, LOCK_TTL_SEC);
    } catch (e) {
      console.warn(`[scheduler] ${job.name} 락 확인 실패 — 이번 tick 건너뜀: ${e.message}`);
      continue;
    }
    if (!locked) continue; // 다른 레플리카가 이미 실행 (또는 오늘 이미 실행)
    console.log(`[scheduler] ${job.name} 실행 (${formatDateLocal(now)} ${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')} KST)`);
    try {
      await job.run(store);
    } catch (e) {
      console.error(`[scheduler] ${job.name} 실행 오류: ${e.message}`);
    }
  }
}

/** 서버 기동 후 호출 — 1분 간격으로 잡 시각 검사. JOBS_DISABLED=true면 호출부에서 생략. */
export function startScheduler(store) {
  const timer = setInterval(() => { tick(store).catch((e) => console.error('[scheduler] tick error: ' + e.message)); }, 60 * 1000);
  timer.unref(); // 스케줄러가 프로세스 종료를 막지 않게
  console.log('[scheduler] 인앱 스케줄러 시작 — ' +
    JOBS.map((j) => `${j.name} ${String(j.hour).padStart(2, '0')}:${String(j.minute).padStart(2, '0')}`).join(' / ') + ' (KST)');
  return timer;
}
