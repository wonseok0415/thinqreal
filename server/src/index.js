// 부트스트랩 — config 검증 → 공유 AUTH_SECRET 초기화 → store 선택 → app 기동 → 스케줄러
import { config } from './config.js';
import { initSharedAuthSecret } from './auth/secret.js';
import { getStore } from './store/index.js';
import { createApp } from './app.js';
import { startScheduler } from './lib/scheduler.js';

const store = await getStore();
await initSharedAuthSecret(store); // 서명 키: env → 저장소 app_state(영속) → Valkey(원자적 생성) → 임시(백그라운드 수렴) (auth/secret.js)
const app = createApp(store);

app.listen(config.port, () => {
  console.log(`[server] ThinQ Real backend listening on :${config.port}`);
  console.log(`[server] static dir = ${config.staticDir}`);
  console.log(`[server] store = ${store.backend}, TZ = ${process.env.TZ}` +
    (config.environment ? `, ENVIRONMENT = ${config.environment}` : '') +
    (config.outboundSuppressed ? ' (비운영 환경 — 외부 발송 억제)' : ''));
});

// 일일 잡 스케줄러 — Apps Script 시간 트리거 대체 (레플리카 간 중복은 Valkey 일일 락으로 방지)
if (!config.jobsDisabled) startScheduler(store);
else console.log('[server] JOBS_DISABLED=true — 인앱 스케줄러 꺼짐');
