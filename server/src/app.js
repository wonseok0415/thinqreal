// Express 앱 조립 — 정적 프론트(/) + API(/api) 단일 프로세스 (단일 컨테이너 통합)
import express from 'express';
import { config } from './config.js';
import { createGetRouter } from './routes/get.js';
import { createPostRouter, PUB_TYPES } from './routes/post.js';
import { createRateLimiter } from './lib/rateLimit.js';
import { createHtmlRewrite } from './lib/htmlRewrite.js';
import { kvStatus } from './lib/kvcache.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 실행 중인 릴리스 번호 — "이 pod가 새 이미지로 떴는가"를 브라우저에서 확인.
// 우선순위: env APP_VERSION(이미지 빌드 시 주입 가능) → npm_package_version → package.json 후보 경로 3곳
// (사내 이미지의 파일 배치가 설계 §2 Dockerfile과 다를 수 있어 후보를 넓힘 — 2026-09-28 OP/ST 'unknown' 실측)
function resolveAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  if (process.env.npm_package_version) return process.env.npm_package_version;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', 'package.json'),          // src/app.js → ../package.json (설계 레이아웃)
    path.join(process.cwd(), 'package.json'),       // WORKDIR 기준
    path.join(here, 'package.json'),                // src 안에 함께 복사된 경우
    '/app/package.json',
  ];
  for (const p of candidates) {
    try {
      const v = JSON.parse(fs.readFileSync(p, 'utf8')).version;
      if (v) return v;
    } catch { /* 다음 후보 */ }
  }
  return 'unknown';
}
const appVersion = resolveAppVersion();

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

  // API·진단 응답은 어디에도 저장 금지 — 사내 게이트웨이/프록시/브라우저가 GET JSON을 재사용하면
  // 인증 코드 조회(auth_code_peek)·가용 슬롯 등이 옛 값으로 보인다 (2026-09-22 로그인 불일치 진단에서 추가).
  app.use(['/api', '/pub', '/healthz'], (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // K8s liveness/readiness
  // kv: shared 여야 멀티 레플리카에서 인증 코드·토큰 서명 키가 pod 간 공유된다 (degraded/memory면 로그인이 pod에 따라 어긋남)
  // version·env: 릴리스가 실제로 이 환경에 롤아웃됐는지(configmap만 바꾸면 pod는 재시작되지 않음 — 2026-09-28 OP SMTP env 미반영 진단)
  app.get('/healthz', (req, res) => res.json({
    ok: true, backend: store.backend, kv: kvStatus(), pod: os.hostname(), version: appVersion, env: config.environment || 'local',
  }));

  // API — 단일 경로 + type 라우팅 (api-contract.md 계약 불변)
  app.use('/api', createGetRouter(store));
  app.use('/api', createPostRouter(store));

  // 공개 전용 API — 사내 SSO 예외 경로. POST + PUB_TYPES 3종만, 그 외(GET 포함) 404.
  // 같은 type은 /api로도 계속 동작한다 (SSO 뒤 페이지에서의 호출 호환).
  // 게이트웨이에 rate limit이 없으므로(BE팀 2026-09-17) 예외 경로는 앱이 빈도 제한 — IP당 분당 PUB_RATE_LIMIT건
  app.use('/pub', createRateLimiter({ limit: config.pubRateLimit, windowSec: 60 }));
  app.use('/pub', createPostRouter(store, { onlyTypes: PUB_TYPES }));
  app.all('/pub', (req, res) => res.status(404).json({ error: 'not_found' }));

  // 정적 프론트 — index.html·thinqreal_admin.html·ROI 툴·privacy·images
  // HTML은 서빙 시 SCRIPT_URL을 /api로 치환(lib/htmlRewrite.js) — public/은 라이브 사본 그대로 유지
  app.use(createHtmlRewrite({ staticDir: config.staticDir, apiBase: config.frontApiBase, enabled: config.frontRewrite }));
  app.use(express.static(config.staticDir, { extensions: ['html'] }));

  // 에러 핸들러 — 스택은 로그로만, 응답은 현행 스타일의 JSON
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[app] error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
