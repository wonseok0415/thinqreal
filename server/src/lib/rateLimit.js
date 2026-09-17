// 공개 경로(/pub) 요청 빈도 제한 — 게이트웨이에 rate limit이 없다는 BE팀 답변(2026-09-17)에 따른 앱 측 방어.
// 인메모리 고정 창(IP당 window 내 최대 limit건) — 레플리카별 독립이라 실제 상한은 limit × 레플리카 수.
// /pub의 3종(방문객 설문 1인 1회·점검 장비 수 분 간격·FieldVoice 일 수 건)에는 넉넉한 값이다.
// 키는 게이트웨이가 넘기는 X-Forwarded-For의 첫 IP(없으면 소켓 주소) — 위조 가능하나 단순 폭주 억제가 목적.
const buckets = new Map(); // ip → { count, resetAt }

export function createRateLimiter({ limit = 60, windowSec = 60 } = {}) {
  const windowMs = windowSec * 1000;
  return function rateLimit(req, res, next) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = xff || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, b);
      if (buckets.size > 10000) pruneExpired(now);
    }
    b.count++;
    if (b.count > limit) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
      return res.status(429).json({ error: 'rate_limited' });
    }
    next();
  };
}

function pruneExpired(now) {
  for (const [ip, b] of buckets) if (b.resetAt <= now) buckets.delete(ip);
}

/** 테스트용 — 버킷 초기화 */
export function resetRateLimiter() { buckets.clear(); }
