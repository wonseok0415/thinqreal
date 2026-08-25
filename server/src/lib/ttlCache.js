// 인메모리 TTL 캐시 — Apps Script CacheService 대체.
// 인증 코드·쿨다운·실패 카운터용 (키 패턴·TTL은 data-schema.md §6 그대로).
//
// ⚠ 단일 레플리카 전제. 멀티 레플리카 확장 시 이 모듈을 Redis 구현으로 교체
//   (인터페이스 get/put/remove는 그대로 유지). 재시작 시 발급 중이던 코드는
//   소멸하지만 사용자는 재요청하면 되므로 허용.

const store = new Map(); // key → { value, expiresAt }

function sweep() {
  const now = Date.now();
  for (const [k, e] of store) {
    if (e.expiresAt <= now) store.delete(k);
  }
}
setInterval(sweep, 60 * 1000).unref();

export const cache = {
  /** @returns {string|null} */
  get(key) {
    const e = store.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { store.delete(key); return null; }
    return e.value;
  },
  put(key, value, ttlSec) {
    store.set(key, { value: String(value), expiresAt: Date.now() + ttlSec * 1000 });
  },
  remove(key) {
    store.delete(key);
  },
};
