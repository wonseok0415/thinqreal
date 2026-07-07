// 부트스트랩 — config 검증 → store 선택 → app 기동
import { config } from './config.js';
import { getStore } from './store/index.js';
import { createApp } from './app.js';

const store = getStore();
const app = createApp(store);

app.listen(config.port, () => {
  console.log(`[server] ThinQ Real backend listening on :${config.port}`);
  console.log(`[server] static dir = ${config.staticDir}`);
  console.log(`[server] store = ${store.backend}, TZ = ${process.env.TZ}`);
});
