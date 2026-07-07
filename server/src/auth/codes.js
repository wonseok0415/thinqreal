// 6자리 인증 코드 발급·검증 — 쿨다운·5회 잠금 포함 (CacheService 키 패턴·TTL 그대로).
// kind: 'auth'(메인 게이트) | 'admin'(관리자) — 캐시 키 분리 (auth_code_ / admin_code_)
import crypto from 'node:crypto';
import { cache } from '../lib/ttlCache.js';
import {
  AUTH_CODE_TTL_SEC, AUTH_COOLDOWN_SEC, AUTH_MAX_FAIL_ATTEMPTS, AUTH_FAIL_WINDOW_SEC,
  AUTH_ALLOWED_DOMAINS,
} from '../lib/constants.js';

export function isAllowedAuthEmail(email) {
  if (!email) return false;
  const s = String(email).trim().toLowerCase();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)) return false;
  const at = s.lastIndexOf('@');
  if (at < 0) return false;
  return AUTH_ALLOWED_DOMAINS.includes(s.slice(at + 1));
}

/** 쿨다운 확인 후 코드 발급. 쿨다운 중이면 null 반환. */
export function issueCode(email, kind) {
  const coolKey = `${kind}_cool_${email}`;
  if (cache.get(coolKey)) return null;
  // 6자리 코드 — 앞자리 0 허용, CSPRNG 사용
  let code = '';
  for (let i = 0; i < 6; i++) code += crypto.randomInt(10);
  cache.put(`${kind}_code_${email}`, code, AUTH_CODE_TTL_SEC);
  cache.put(coolKey, '1', AUTH_COOLDOWN_SEC);
  return code;
}

/** 코드 검증. 성공 시 {ok:true}, 실패 시 {ok:false, error, message} */
export function verifyCode(email, code, kind) {
  const failKey = `${kind}_fail_${email}`;
  const failCount = Number(cache.get(failKey) || '0');
  if (failCount >= AUTH_MAX_FAIL_ATTEMPTS) {
    return { ok: false, error: 'too_many_attempts', message: '인증 시도 횟수를 초과했습니다. 잠시 후 새 코드를 요청해 주세요.' };
  }

  const stored = cache.get(`${kind}_code_${email}`);
  if (!stored) {
    return { ok: false, error: 'code_expired', message: '인증 코드가 만료되었습니다. 다시 요청해 주세요.' };
  }
  if (stored !== code) {
    cache.put(failKey, String(failCount + 1), AUTH_FAIL_WINDOW_SEC);
    const remaining = AUTH_MAX_FAIL_ATTEMPTS - failCount - 1;
    return {
      ok: false, error: 'code_mismatch',
      message: '인증 코드가 일치하지 않습니다.' + (remaining > 0 ? ` (남은 시도 ${remaining}회)` : ' 새 코드를 요청해 주세요.'),
    };
  }

  // 1회용 — 검증 성공 시 코드와 실패 카운트 모두 삭제
  cache.remove(`${kind}_code_${email}`);
  cache.remove(failKey);
  return { ok: true };
}
