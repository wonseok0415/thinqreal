// 하이브리드 에지 동기화 — 외부 접점 3종(방문객 익명 설문·FieldCheck·FieldVoice)은 현행 공개 인프라
// (GitHub Pages + Apps Script + 시트)에 그대로 두고, 사내 컨테이너가 주기적으로 pull해 PG에 병합한다.
// 배경·설계: stage1-container-design.md §8-10, decisions §6-6·§6-7 (사내 인프라는 사외 비노출).
//
// - 방향은 사내 → 외부 GET뿐 (사내 데이터는 나가지 않음). 알림(텔레그램)은 외부(Apps Script)가 계속 담당.
// - 멱등: id(response_id / id) 기준으로 없는 행만 append. 세 데이터 모두 불변 레코드라 update 없음.
// - 인증: 컨테이너가 Apps Script와 같은 HMAC 방식이므로 LEGACY_AUTH_SECRET으로 관리자 토큰을 자체 발급
//   (payload email은 현행 AUTH_ADMIN_EMAILS에 있는 주소여야 함 — LEGACY_ADMIN_EMAIL). .gs 변경 0.
// - LEGACY_AUTH_SECRET이 없으면 토큰이 필요 없는 health_checks만 동기화한다.
//
// 수동 실행: node src/jobs/edgeSync.js  (스케줄러는 EDGE_SYNC_EVERY_MIN 간격, 관리자 GET edge_sync_now로도 즉시 실행)
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { signAuthTokenWith } from '../auth/token.js';
import { VISITOR_HEADERS, HEALTH_HEADERS, VOC_HEADERS } from '../lib/constants.js';
import { getStore } from '../store/index.js';

const FETCH_TIMEOUT_MS = 15000;

function legacyAdminToken() {
  if (!config.legacyAuthSecret) return null;
  return signAuthTokenWith(config.legacyAuthSecret, config.legacyAdminEmail, Date.now() + 10 * 60 * 1000, true);
}

async function fetchLegacy(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(config.legacyScriptUrl + '?' + qs, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`legacy 응답이 JSON이 아님 (HTTP ${r.status})`); }
  if (json && json.error) throw new Error(`legacy 오류: ${json.error}${json.reason ? ' (' + json.reason + ')' : ''}`);
  return json;
}

/** 헤더에 있는 필드만 문자열로 추려 저장 형태로 맞춘다 (외부 응답의 여분 필드 무시) */
function pickRow(row, headers) {
  const out = {};
  for (const h of headers) out[h] = row[h] == null ? '' : (typeof row[h] === 'string' ? row[h] : String(row[h]));
  return out;
}

async function mergeInto(table, idField, headers, incoming) {
  const existing = new Set((await table.list()).map((r) => String(r[idField])));
  let added = 0;
  for (const raw of incoming) {
    const id = String(raw?.[idField] ?? '');
    if (!id || existing.has(id)) continue;
    await table.append(pickRow(raw, headers));
    existing.add(id);
    added++;
  }
  return { fetched: incoming.length, added };
}

/** 한 번 동기화 — 결과 요약 반환 (스케줄러·관리자 GET·CLI 공용) */
export async function runEdgeSyncJob(store) {
  if (!config.legacyScriptUrl) return { skipped: 'no_legacy_url' };
  const days = String(config.edgeSyncDays);
  const result = { health: null, visitors: null, voc: null, errors: [] };

  // ① FieldCheck 점검 이력 — 현행 GET은 무인증
  try {
    const j = await fetchLegacy({ type: 'health_checks', days });
    result.health = await mergeInto(store.health, 'id', HEALTH_HEADERS, Array.isArray(j.records) ? j.records : []);
  } catch (e) { result.errors.push('health: ' + e.message); }

  const token = legacyAdminToken();
  if (!token) {
    result.errors.push('visitors/voc: LEGACY_AUTH_SECRET 미설정 — 건너뜀');
  } else {
    // ② 방문객 익명 설문 — survey_data(관리자 토큰)의 visitors만 사용
    try {
      const j = await fetchLegacy({ type: 'survey_data', token });
      result.visitors = await mergeInto(store.visitors, 'response_id', VISITOR_HEADERS, Array.isArray(j.visitors) ? j.visitors : []);
    } catch (e) { result.errors.push('visitors: ' + e.message); }
    // ③ FieldVoice 리포트 — 관리자 토큰
    try {
      const j = await fetchLegacy({ type: 'voc_reports', days, token });
      result.voc = await mergeInto(store.voc, 'id', VOC_HEADERS, Array.isArray(j.records) ? j.records : []);
    } catch (e) { result.errors.push('voc: ' + e.message); }
  }

  const fmt = (r) => (r ? `${r.added}/${r.fetched}` : '-');
  console.log(`[edge-sync] health ${fmt(result.health)} / visitors ${fmt(result.visitors)} / voc ${fmt(result.voc)}` +
    (result.errors.length ? ` / 오류: ${result.errors.join('; ')}` : ''));
  return result;
}

/** 관리자 화면 삭제의 delete-through — 원본(Apps Script)도 지워야 다음 pull에서 부활하지 않는다 */
export async function deleteLegacyVisitor(id) {
  const token = legacyAdminToken();
  if (!token || !config.legacyScriptUrl) return { skipped: true };
  try {
    const r = await fetch(config.legacyScriptUrl, {
      method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'visitor_delete', id: String(id), token }),
    });
    let json = null;
    try { json = JSON.parse(await r.text()); } catch { /* Apps Script는 리다이렉트 후 JSON — 파싱 실패 시 상태만 */ }
    const ok = !!(json && json.ok);
    if (!ok) console.warn(`[edge-sync] 원본 visitor_delete 실패 (id=${id}): ${json ? JSON.stringify(json) : 'HTTP ' + r.status}`);
    return { ok, remote: json };
  } catch (e) {
    console.warn(`[edge-sync] 원본 visitor_delete 호출 오류 (id=${id}): ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// CLI 직접 실행 시에만 동작
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const store = await getStore();
    const r = await runEdgeSyncJob(store);
    console.log(JSON.stringify(r));
  })().then(() => process.exit(0), (e) => { console.error('[edge-sync] error:', e); process.exit(1); });
}
