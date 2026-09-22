// 정적 HTML 서빙 시 프론트의 API 주소를 컨테이너 자신(/api)으로 치환 — 파일은 라이브(GitHub Pages)와 동일하게 두고,
// 컨테이너가 내보낼 때만 바꾼다. 설계 §8-11: "전환 시점에 SCRIPT_URL 3곳 수동 교체" 계획을 대체 —
// 사내 ST/QA/OP가 라이브 Apps Script를 호출하는 상태(2026-09-21 발견)를 없애고, public/ 을 라이브 사본 그대로 유지한다.
// 치환 대상은 `const SCRIPT_URL = 'https://script.google.com/…';` 한 줄뿐. FRONT_API_BASE 로 기준 경로 조정(기본 /api),
// FRONT_REWRITE=off 면 치환 없이 원본 서빙(현행 백엔드로 붙이는 비교 검증용).
import fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_URL_RE = /const SCRIPT_URL = '(https?:\/\/script\.google\.com\/[^']*)';/;
const cache = new Map(); // abs path → { mtimeMs, body }

export function createHtmlRewrite({ staticDir, apiBase = '/api', enabled = true }) {
  return async function htmlRewrite(req, res, next) {
    if (!enabled || req.method !== 'GET') return next();
    let p = req.path;
    if (p.endsWith('/')) p += 'index.html';
    else if (!path.extname(p)) p += '.html'; // express.static extensions:['html'] 과 동일 규칙
    if (!p.endsWith('.html')) return next();
    const abs = path.join(staticDir, path.normalize(p));
    if (!abs.startsWith(path.resolve(staticDir))) return next();
    try {
      const st = await fs.stat(abs);
      let hit = cache.get(abs);
      if (!hit || hit.mtimeMs !== st.mtimeMs) {
        const raw = await fs.readFile(abs, 'utf8');
        hit = { mtimeMs: st.mtimeMs, body: raw.replace(SCRIPT_URL_RE, `const SCRIPT_URL = '${apiBase}';`) };
        cache.set(abs, hit);
      }
      // 항상 재검증(ETag 304) — 옛 페이지(구글 백엔드 호출본)가 캐시에서 그대로 열리던 함정 차단 (UAT 0-2, 2026-09-22)
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(hit.body);
    } catch {
      next(); // 없는 파일 등은 정적 미들웨어·404로
    }
  };
}
