// Express 앱 조립 — 정적 프론트(/) + API(/api) 단일 프로세스 (단일 컨테이너 통합)
import express from 'express';
import { config } from './config.js';
import { createGetRouter } from './routes/get.js';
import { createPostRouter, PUB_TYPES } from './routes/post.js';

export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');

  // CORS — Apps Script Web App과 동일하게 교차 출처 GET 허용 (전환 과도기에
  // GitHub Pages 프론트가 이 API를 가리켜도 동작). 최종 상태는 같은 오리진이라 무의미해짐.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // K8s liveness/readiness
  app.get('/healthz', (req, res) => res.json({ ok: true, backend: store.backend }));

  // API — 단일 경로 + type 라우팅 (api-contract.md 계약 불변)
  app.use('/api', createGetRouter(store));
  app.use('/api', createPostRouter(store));

  // 공개 전용 API — 사내 SSO 예외 경로. POST + PUB_TYPES 3종만, 그 외(GET 포함) 404.
  // 같은 type은 /api로도 계속 동작한다 (SSO 뒤 페이지에서의 호출 호환).
  app.use('/pub', createPostRouter(store, { onlyTypes: PUB_TYPES }));
  app.all('/pub', (req, res) => res.status(404).json({ error: 'not_found' }));

  // 정적 프론트 — index.html·thinqreal_admin.html·ROI 툴·privacy·images
  app.use(express.static(config.staticDir, { extensions: ['html'] }));

  // 에러 핸들러 — 스택은 로그로만, 응답은 현행 스타일의 JSON
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[app] error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
