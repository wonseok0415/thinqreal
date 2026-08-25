// 부트스트랩 — config 검증 → 공유 AUTH_SECRET 초기화 → store 선택 → app 기동
import { config } from './config.js';
import { initSharedAuthSecret } from './auth/secret.js';
import { getStore } from './store/index.js';
import { createApp } from './app.js';

await initSharedAuthSecret(); // KVSTORE_ADDR 있으면 전 레플리카 공유 서명 키 확보 (auth/secret.js)
const store = await getStore();
const app = createApp(store);

app.listen(config.port, () => {
  console.log(`[server] ThinQ Real backend listening on :${config.port}`);
  console.log(`[server] static dir = ${config.staticDir}`);
  console.log(`[server] store = ${store.backend}, TZ = ${process.env.TZ}` +
    (config.environment ? `, ENVIRONMENT = ${config.environment}` : '') +
    (config.outboundSuppressed ? ' (비운영 환경 — 외부 발송 억제)' : ''));
});
