// 과제 D — 시트 스냅샷(xlsx) → 저장소 이행 (설계 §8-9·§8-17, 키트 v5, 2026-09-29)
//
// 입력: 구글 시트 「파일 → 다운로드 → Microsoft Excel(.xlsx)」 한 파일 (탭 = 테이블, 1행 = 헤더).
// 적재는 저장소 어댑터의 기존 append/remove 경로만 묶어 호출한다 (Store 계약 불변 — §8-9 ⚠).
// 모든 동작은 관리자 토큰 게이트 뒤(routes/post.js /api/import). 레플리카 간 상태 공유 없음 — 요청마다 파일을 다시 받는다.
//
// action:
//   inspect      파일 판독만 — 탭↔테이블 매칭, 헤더 차이, id 통계(빈 id·파일 내 중복·DB 기존 겹침). 쓰기 없음.
//   import       tables(쉼표)·mode(skip|replace) — skip: DB에 없는 id만 append / replace: 같은 id 삭제 후 append. 표별 결과 + export_log 기록.
//   verify       DB ↔ 파일 대조 — 건수, 파일에만 있는 id, DB에만 있는 id, 양쪽 있는 행의 컬럼 값 불일치(정규화 후 비교).
//   purge_extra  DB에만 있는 id 삭제 (QA 리허설 초기화용). confirm='삭제' 필수, kic-op에서는 거부.
//   state        app_state 키/값 설정 — body JSON {pairs:[{key,value}]} (Script Properties 이식: 마지막 발송 월·ROI pin).
import { config } from '../config.js';
import {
  SHEET_NAME, ROI_SHEET_NAME, ARTICLES_SHEET_NAME, SLOT_BLOCKS_SHEET_NAME, STATE_SHEET_NAME,
  BOOKING_HEADERS, ROI_HEADERS, ARTICLES_HEADERS, SLOT_BLOCKS_HEADERS,
  SURVEY_SHEET_NAME, LEDGER_SHEET_NAME, ISSUE_SHEET_NAME, SURVEY_HEADERS, LEDGER_HEADERS, ISSUE_HEADERS,
  VISITOR_SHEET_NAME, VISITOR_HEADERS, INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS,
  BEST_SHEET_NAME, BEST_HEADERS, EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS,
  HEALTH_SHEET_NAME, HEALTH_HEADERS, VOC_SHEET_NAME, VOC_HEADERS,
  STATE_LAST_SENT_KEY, STATE_ROI_PIN_KEY,
} from '../lib/constants.js';
import { normalizeDate, normalizeMonth } from '../lib/dates.js';

const LIST_LIMIT = 50;      // 보고에 나열하는 id 상한 (전체 건수는 별도)
const MISMATCH_LIMIT = 20;  // 값 불일치 행 나열 상한
const DATE_COLS = new Set(['date', 'visit_date', 'confirmed_date', 'published_at']); // 비교 시 normalizeDate
const MONTH_COLS = new Set(['month']);

// 테이블 레지스트리 — 저장소 인터페이스 위에 list/append/remove를 균일화. key(r) = 멱등 기준.
function registry(store) {
  const simple = (name, headers, idField, t) => ({
    name, headers, idField,
    key: (r) => String(r[idField] ?? '').trim(),
    list: () => t.list(),
    append: (r) => t.append(r),
    remove: (r) => t.remove(r[idField]),
  });
  return {
    [SHEET_NAME]: {
      name: SHEET_NAME, headers: BOOKING_HEADERS, idField: 'id',
      key: (r) => String(r.id ?? '').trim(),
      list: () => store.bookings.listAll(),
      append: (r) => store.bookings.append(r),
      remove: (r) => store.bookings.remove(r.id),
    },
    [ROI_SHEET_NAME]: simple(ROI_SHEET_NAME, ROI_HEADERS, 'id', store.roi),
    [SLOT_BLOCKS_SHEET_NAME]: {
      name: SLOT_BLOCKS_SHEET_NAME, headers: SLOT_BLOCKS_HEADERS, idField: 'id',
      key: (r) => String(r.id ?? '').trim(),
      list: () => store.slotBlocks.list(),
      append: (r) => store.slotBlocks.add(r),
      remove: (r) => store.slotBlocks.removeById(r.id),
    },
    [ARTICLES_SHEET_NAME]: {
      name: ARTICLES_SHEET_NAME, headers: ARTICLES_HEADERS, idField: 'month+url',
      key: (r) => (String(r.url ?? '').trim() ? normalizeMonth(r.month) + '|' + String(r.url).trim() : ''),
      list: () => store.articles.listAll(),
      append: (r) => store.articles.append({ ...r, month: normalizeMonth(r.month) }),
      remove: (r) => store.articles.remove(normalizeMonth(r.month), String(r.url).trim()),
    },
    [SURVEY_SHEET_NAME]: {
      name: SURVEY_SHEET_NAME, headers: SURVEY_HEADERS, idField: 'response_id',
      key: (r) => String(r.response_id ?? '').trim(),
      list: () => store.survey.listResponses(),
      append: (r) => store.survey.appendResponse(r),
      remove: (r) => store.survey.removeResponse(r.response_id),
    },
    [LEDGER_SHEET_NAME]: {
      name: LEDGER_SHEET_NAME, headers: LEDGER_HEADERS, idField: 'ledger_id',
      key: (r) => String(r.ledger_id ?? '').trim(),
      list: () => store.survey.listLedger(),
      append: (r) => store.survey.appendLedger(r),
      remove: (r) => store.survey.removeLedger(r.ledger_id),
    },
    [ISSUE_SHEET_NAME]: {
      name: ISSUE_SHEET_NAME, headers: ISSUE_HEADERS, idField: 'issue_id',
      key: (r) => String(r.issue_id ?? '').trim(),
      list: () => store.survey.listIssues(),
      append: (r) => store.survey.appendIssue(r),
      remove: (r) => store.survey.removeIssue(r.issue_id),
    },
    [VISITOR_SHEET_NAME]: simple(VISITOR_SHEET_NAME, VISITOR_HEADERS, 'response_id', store.visitors),
    [INSIGHTS_SHEET_NAME]: simple(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS, 'id', store.insights),
    [BEST_SHEET_NAME]: simple(BEST_SHEET_NAME, BEST_HEADERS, 'id', store.best),
    [EXPORT_LOG_SHEET_NAME]: simple(EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS, 'id', store.exportLog),
    [HEALTH_SHEET_NAME]: simple(HEALTH_SHEET_NAME, HEALTH_HEADERS, 'id', store.health),
    [VOC_SHEET_NAME]: simple(VOC_SHEET_NAME, VOC_HEADERS, 'id', store.voc),
  };
}
export const IMPORT_TABLES = [
  SHEET_NAME, ROI_SHEET_NAME, SLOT_BLOCKS_SHEET_NAME, ARTICLES_SHEET_NAME,
  SURVEY_SHEET_NAME, LEDGER_SHEET_NAME, ISSUE_SHEET_NAME, VISITOR_SHEET_NAME,
  INSIGHTS_SHEET_NAME, BEST_SHEET_NAME, EXPORT_LOG_SHEET_NAME, HEALTH_SHEET_NAME, VOC_SHEET_NAME,
];
export const STATE_KEYS = [STATE_LAST_SENT_KEY, STATE_ROI_PIN_KEY];

// ── xlsx 판독 ──────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
// exceljs는 날짜 셀을 UTC 기준 Date로 만든다(시트의 표시 시각 = UTC 필드). 시트 문자열로 되돌릴 때 UTC 필드를 쓴다.
function cellDateToString(d) {
  const ymd = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const h = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds();
  return (h || m || s) ? `${ymd} ${pad2(h)}:${pad2(m)}:${pad2(s)}` : ymd;
}
export function cellToString(v) {
  if (v == null) return '';
  if (v instanceof Date) return cellDateToString(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v); // 13자리 id도 정수라 정확
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text != null) return cellToString(v.text);      // hyperlink
    if (v.result != null) return cellToString(v.result);  // formula
    if (v.error) return '';
    return String(v);
  }
  return String(v);
}

/** @returns {Promise<{sheets: Record<string,{headers:string[], rows:object[]}>}>} */
export async function parseWorkbook(buffer) {
  const { default: ExcelJS } = await import('exceljs'); // 이행 요청 때만 로드
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = {};
  wb.eachSheet((ws) => {
    const headerRow = ws.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => { headers[col - 1] = cellToString(cell.value).trim(); });
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const obj = {};
      let any = false;
      for (let c = 0; c < headers.length; c++) {
        if (!headers[c]) continue;
        const s = cellToString(row.getCell(c + 1).value);
        obj[headers[c]] = s;
        if (s !== '') any = true;
      }
      if (any) rows.push(obj);
    });
    sheets[ws.name.trim()] = { headers: headers.filter(Boolean), rows };
  });
  return { sheets };
}

// ── 공통 ──────────────────────────────────────────────
function norm(col, v) {
  const s = v == null ? '' : String(v).trim();
  if (DATE_COLS.has(col)) return normalizeDate(s);
  if (MONTH_COLS.has(col)) return normalizeMonth(s);
  return s;
}
function pick(headers, r) { // 파일 행 → 상수 헤더 순서의 레코드 (미지 컬럼 제거, 누락 컬럼 '', 날짜·월 컬럼은 정규화 선적용 — §8-9 ①)
  const o = {};
  for (const h of headers) o[h] = (DATE_COLS.has(h) || MONTH_COLS.has(h)) ? norm(h, r[h]) : (r[h] == null ? '' : String(r[h]));
  return o;
}
function parseTables(param, all) {
  const s = String(param || '').trim();
  const list = s ? s.split(',').map((t) => t.trim()).filter(Boolean) : all;
  const unknown = list.filter((t) => !all.includes(t));
  return { list: list.filter((t) => all.includes(t)), unknown };
}
async function existingKeys(t) {
  const rows = await t.list();
  const map = new Map();
  for (const r of rows) { const k = t.key(r); if (k) map.set(k, r); }
  return map;
}
function fileStats(t, sheet) {
  const keys = sheet.rows.map((r) => t.key(r));
  const seen = new Set(); let dup = 0, empty = 0;
  for (const k of keys) { if (!k) empty++; else if (seen.has(k)) dup++; else seen.add(k); }
  return { keys, uniq: seen, emptyId: empty, dupInFile: dup };
}

// ── actions ──────────────────────────────────────────────
export async function inspectSnapshot(store, buffer) {
  const reg = registry(store);
  const { sheets } = await parseWorkbook(buffer);
  const tables = [];
  for (const name of IMPORT_TABLES) {
    const t = reg[name]; const sheet = sheets[name];
    if (!sheet) { tables.push({ table: name, inFile: false }); continue; }
    const st = fileStats(t, sheet);
    const db = await existingKeys(t);
    let overlap = 0; for (const k of st.uniq) if (db.has(k)) overlap++;
    tables.push({
      table: name, inFile: true, idField: t.idField, rows: sheet.rows.length,
      headerMissing: t.headers.filter((h) => !sheet.headers.includes(h)),
      headerUnknown: sheet.headers.filter((h) => !t.headers.includes(h)),
      emptyId: st.emptyId, dupInFile: st.dupInFile, uniqueIds: st.uniq.size,
      dbRows: db.size, overlap, newIds: st.uniq.size - overlap,
    });
  }
  const unknownSheets = Object.keys(sheets).filter((n) => !IMPORT_TABLES.includes(n));
  const state = {};
  for (const k of STATE_KEYS) state[k] = await store.state.get(k);
  return { ok: true, backend: store.backend, env: config.environment || 'local', tables, unknownSheets, state };
}

export async function importSnapshot(store, buffer, { tables, mode }, byEmail) {
  const reg = registry(store);
  const m = mode === 'replace' ? 'replace' : 'skip';
  const sel = parseTables(tables, IMPORT_TABLES);
  if (sel.unknown.length) return { ok: false, error: 'unknown_table', unknown: sel.unknown };
  const { sheets } = await parseWorkbook(buffer);
  const results = []; let totalInserted = 0;
  for (const name of sel.list) {
    const t = reg[name]; const sheet = sheets[name];
    if (!sheet) { results.push({ table: name, inFile: false, inserted: 0, replaced: 0, skipped: 0, emptyId: 0 }); continue; }
    const db = await existingKeys(t);
    const done = new Set();
    let inserted = 0, replaced = 0, skipped = 0, emptyId = 0, dupInFile = 0;
    const errors = [];
    for (let i = 0; i < sheet.rows.length; i++) {
      const raw = sheet.rows[i]; const k = t.key(raw);
      if (!k) { emptyId++; continue; }
      if (done.has(k)) { dupInFile++; continue; } // 파일 안 중복은 첫 행만
      done.add(k);
      const rec = pick(t.headers, raw);
      try {
        if (db.has(k)) {
          if (m === 'skip') { skipped++; continue; }
          await t.remove(raw); await t.append(rec); replaced++;
        } else { await t.append(rec); inserted++; }
      } catch (e) {
        errors.push({ row: i + 2, id: k, error: String(e?.message || e) });
        if (errors.length >= 10) break;
      }
    }
    totalInserted += inserted + replaced;
    results.push({ table: name, inFile: true, rows: sheet.rows.length, inserted, replaced, skipped, emptyId, dupInFile, errors });
  }
  const summary = results.filter((r) => r.inFile).map((r) => `${r.table}(+${r.inserted}${r.replaced ? ` ↺${r.replaced}` : ''}${r.skipped ? ` =${r.skipped}` : ''})`).join(' ');
  await store.exportLog.append({
    id: String(Date.now()), timestamp: new Date().toISOString(), email: byEmail,
    reason: `[데이터 이행] mode=${m} ${summary}`.slice(0, 500), rowCount: totalInserted,
  });
  return { ok: true, mode: m, results, totalInserted };
}

export async function verifySnapshot(store, buffer, { tables }) {
  const reg = registry(store);
  const sel = parseTables(tables, IMPORT_TABLES);
  if (sel.unknown.length) return { ok: false, error: 'unknown_table', unknown: sel.unknown };
  const { sheets } = await parseWorkbook(buffer);
  const results = [];
  for (const name of sel.list) {
    const t = reg[name]; const sheet = sheets[name];
    if (!sheet) { results.push({ table: name, inFile: false }); continue; }
    const db = await existingKeys(t);
    const fileMap = new Map();
    for (const r of sheet.rows) { const k = t.key(r); if (k && !fileMap.has(k)) fileMap.set(k, r); }
    const missingInDb = [], extraInDb = [], mismatches = [];
    let mismatchCount = 0;
    for (const [k, fr] of fileMap) {
      const dr = db.get(k);
      if (!dr) { missingInDb.push(k); continue; }
      for (const h of t.headers) {
        if (norm(h, fr[h]) !== norm(h, dr[h])) {
          mismatchCount++;
          if (mismatches.length < MISMATCH_LIMIT) mismatches.push({ id: k, field: h, file: String(fr[h] ?? '').slice(0, 80), db: String(dr[h] ?? '').slice(0, 80) });
          break; // 행당 첫 불일치만
        }
      }
    }
    for (const k of db.keys()) if (!fileMap.has(k)) extraInDb.push(k);
    results.push({
      table: name, inFile: true, fileRows: fileMap.size, dbRows: db.size,
      missingInDb: missingInDb.length, missingInDbIds: missingInDb.slice(0, LIST_LIMIT),
      extraInDb: extraInDb.length, extraInDbIds: extraInDb.slice(0, LIST_LIMIT),
      mismatchRows: mismatchCount, mismatches,
      match: missingInDb.length === 0 && extraInDb.length === 0 && mismatchCount === 0,
    });
  }
  return { ok: true, allMatch: results.every((r) => !r.inFile || r.match), results };
}

export async function purgeExtra(store, buffer, { tables, confirm }) {
  if (config.environment === 'kic-op') return { ok: false, error: 'forbidden_in_op', hint: '운영 DB의 초과 행은 삭제하지 않고 원인을 확인한다' };
  if (String(confirm || '') !== '삭제') return { ok: false, error: 'confirm_required', hint: "confirm='삭제'" };
  const reg = registry(store);
  const sel = parseTables(tables, IMPORT_TABLES);
  if (sel.unknown.length) return { ok: false, error: 'unknown_table', unknown: sel.unknown };
  const { sheets } = await parseWorkbook(buffer);
  const results = [];
  for (const name of sel.list) {
    const t = reg[name]; const sheet = sheets[name];
    if (!sheet) { results.push({ table: name, inFile: false, removed: 0 }); continue; }
    const fileKeys = new Set(sheet.rows.map((r) => t.key(r)).filter(Boolean));
    const db = await existingKeys(t);
    let removed = 0;
    for (const [k, r] of db) if (!fileKeys.has(k)) { await t.remove(r); removed++; }
    results.push({ table: name, inFile: true, removed });
  }
  return { ok: true, results };
}

export async function setState(store, pairs) {
  if (!Array.isArray(pairs)) return { ok: false, error: 'pairs_required' };
  const applied = [];
  for (const p of pairs) {
    const key = String(p?.key || '').trim();
    if (!key || key.length > 100) continue;
    await store.state.set(key, String(p.value ?? ''));
    applied.push(key);
  }
  const state = {};
  for (const k of new Set([...STATE_KEYS, ...applied])) state[k] = await store.state.get(k);
  return { ok: true, applied, state };
}

// 라우터 진입점 — query: action, tables, mode, confirm / body: xlsx 바이트(state는 JSON 텍스트)
export async function handleImport(store, action, query, body, byEmail) {
  const a = String(action || '').trim();
  if (a === 'state') {
    let data; try { data = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '')); } catch { return { ok: false, error: 'invalid_json' }; }
    return setState(store, data?.pairs);
  }
  if (!Buffer.isBuffer(body) || body.length < 100) return { ok: false, error: 'file_required', hint: 'xlsx 파일을 body로 보낸다' };
  if (body[0] !== 0x50 || body[1] !== 0x4b) return { ok: false, error: 'not_xlsx', hint: '구글 시트 → 파일 → 다운로드 → Microsoft Excel(.xlsx)' };
  try {
    if (a === 'inspect') return await inspectSnapshot(store, body);
    if (a === 'import') return await importSnapshot(store, body, query, byEmail);
    if (a === 'verify') return await verifySnapshot(store, body, query);
    if (a === 'purge_extra') return await purgeExtra(store, body, query);
  } catch (e) {
    console.error('[import] failed:', e);
    return { ok: false, error: 'import_failed', message: String(e?.message || e) };
  }
  return { ok: false, error: 'unknown_action', actions: ['inspect', 'import', 'verify', 'purge_extra', 'state'] };
}

export { STATE_SHEET_NAME };
