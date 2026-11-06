// 확정 메일 설정 — Wi-Fi SSID 2종·비밀번호·도어락 PIN (키트 v5.9, 2026-11-06)
// 우선순위: 관리자 설정 패널(app_state `mail.<KEY>`) → env(configmap) → '(미설정)'.
// 담당자가 Gitea·Vault 없이 관리자 페이지 안에서 바꿀 수 있게 — CLAUDE.md "반복 운영 작업은 관리자 페이지 안에서 완결" 원칙.
// 값은 현행 .gs buildConfirm*과 동일 의미(확정 메일에만 노출, 페이지 노출 금지).
import { config } from '../config.js';

export const MAIL_SETTING_KEYS = ['WIFI_SSID_24G', 'WIFI_SSID_5G', 'WIFI_PASSWORD', 'DOORLOCK_PIN'];
export const MAIL_SETTING_LABELS = {
  WIFI_SSID_24G: 'Wi-Fi SSID (2.4GHz)',
  WIFI_SSID_5G: 'Wi-Fi SSID (5GHz)',
  WIFI_PASSWORD: 'Wi-Fi 비밀번호',
  DOORLOCK_PIN: '도어락 비밀번호',
};
const STATE_PREFIX = 'mail.';
const UNSET = '(미설정)';
const MAX_LEN = 100;

function envValues() {
  return {
    WIFI_SSID_24G: config.wifi.ssid24,
    WIFI_SSID_5G: config.wifi.ssid5,
    WIFI_PASSWORD: config.wifi.password,
    DOORLOCK_PIN: config.doorlockPin,
  };
}
const isSet = (v) => typeof v === 'string' && v.trim() !== '' && v !== UNSET;

/** 현재 유효값 + 출처(db/env/default). 메일 빌더·패널·미리보기가 공통으로 사용. */
export async function resolveMailSettings(store) {
  const env = envValues();
  const values = {}; const sources = {};
  for (const key of MAIL_SETTING_KEYS) {
    let dbVal = '';
    try { dbVal = store?.state ? await store.state.get(STATE_PREFIX + key) : ''; } catch { dbVal = ''; }
    if (isSet(dbVal)) { values[key] = dbVal; sources[key] = 'db'; }
    else if (isSet(env[key])) { values[key] = env[key]; sources[key] = 'env'; }
    else { values[key] = UNSET; sources[key] = 'default'; }
  }
  return {
    values, sources,
    wifi: { ssid24: values.WIFI_SSID_24G, ssid5: values.WIFI_SSID_5G, password: values.WIFI_PASSWORD },
    doorlockPin: values.DOORLOCK_PIN,
  };
}

export async function getMailSettings(store) {
  const r = await resolveMailSettings(store);
  const env = envValues();
  const envSet = {};
  for (const key of MAIL_SETTING_KEYS) envSet[key] = isSet(env[key]);
  return { ok: true, keys: MAIL_SETTING_KEYS, labels: MAIL_SETTING_LABELS, values: r.values, sources: r.sources, envSet };
}

/** 저장 — body.settings = {KEY: value}. 빈 값은 패널 값 해제(→ env 폴백). 알 수 없는 키는 무시. */
export async function setMailSettings(store, settings, byEmail) {
  if (!settings || typeof settings !== 'object') return { ok: false, error: 'settings_required' };
  const applied = [];
  for (const key of MAIL_SETTING_KEYS) {
    if (!(key in settings)) continue;
    const raw = settings[key] == null ? '' : String(settings[key]).trim();
    if (raw.length > MAX_LEN) return { ok: false, error: 'too_long', key };
    if (/[\r\n]/.test(raw)) return { ok: false, error: 'invalid_chars', key };
    // env 값과 같으면 패널 값으로 저장하지 않는다(출처는 env 유지) — 화면에 미리 채워진 env 값을 그대로 저장했을 때 db 덮어쓰기가 생기지 않게.
    const env = envValues();
    await store.state.set(STATE_PREFIX + key, isSet(env[key]) && raw === env[key] ? '' : raw);
    applied.push(key);
  }
  console.log(`[mail-settings] updated ${applied.join(',') || '(none)'} by ${byEmail || '?'}`);   // 값은 로그에 남기지 않음
  const r = await resolveMailSettings(store);
  return { ok: true, applied, values: r.values, sources: r.sources };
}

/** 미리보기용 샘플 예약 데이터 — 실존 인물·예약 아님. */
export function sampleBookingForPreview() {
  return {
    applicant: '홍길동 책임', name: '홍길동', date: '2026-12-01', slotLabel: '1회차 09:30–11:00',
    purpose: 'R&D 기술 검증', count: '3', org: '플랫폼사업센터', email: 'preview@example.com',
  };
}
