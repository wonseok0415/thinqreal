// PostgreSQL 저장소 구현 — 과제 B (사내 K8s 제공 DB). Store 인터페이스 전체(types.js 계약).
//
// 설계 원칙:
//  - 테이블 = 시트 탭 1:1, 컬럼명 = 시트 헤더 그대로 (data-schema.md가 단일 소스).
//    전 컬럼 TEXT — 시트가 문자열 저장소였고 핸들러가 전부 String/Number 변환을 이미 수행하므로
//    타입을 얹지 않는 것이 이식 리스크가 가장 낮다 (수치 검색·집계는 앱 레벨, 저트래픽 전제).
//  - `rid BIGSERIAL PK`가 시트의 "행 순서"를 대체 (조회 ORDER BY rid = append 순서).
//    monthly_articles만 `ord BIGINT` 추가 — article_move(이웃과 순서 교환)용.
//  - 스키마는 기동 시 자동 생성/진화 (CREATE TABLE IF NOT EXISTS + 누락 컬럼 ADD) —
//    시트 어댑터의 ensureHeaders와 같은 역할. 별도 마이그레이션 도구 불필요.
//  - 읽기 후 JS 필터(normalizeDate/normalizeMonth)는 sheets 어댑터와 동일 동작 유지 —
//    GAS 시절 날짜 자동 변환 잔재까지 같은 규칙으로 흡수한다.
//  - 접속: env DB_HOST/PORT/NAME/USER/PASSWORD/DB_SSLMODE (저장소 샘플과 동일 —
//    SSLMODE 'disable'만 ssl off, 그 외 rejectUnauthorized:false).
import { config } from '../../config.js';
import {
  SHEET_NAME, ROI_SHEET_NAME, ARTICLES_SHEET_NAME, SLOT_BLOCKS_SHEET_NAME, STATE_SHEET_NAME,
  BOOKING_HEADERS, ROI_HEADERS, ARTICLES_HEADERS, SLOT_BLOCKS_HEADERS,
  SURVEY_SHEET_NAME, LEDGER_SHEET_NAME, ISSUE_SHEET_NAME,
  SURVEY_HEADERS, LEDGER_HEADERS, ISSUE_HEADERS,
  VISITOR_SHEET_NAME, VISITOR_HEADERS, INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS,
  BEST_SHEET_NAME, BEST_HEADERS, EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS,
  HEALTH_SHEET_NAME, HEALTH_HEADERS, VOC_SHEET_NAME, VOC_HEADERS,
} from '../../lib/constants.js';
import { normalizeDate, normalizeMonth, formatPublishedDate } from '../../lib/dates.js';

const q = (ident) => `"${ident}"`; // 컬럼명 전부 따옴표 — count/org 등 예약어 충돌 방지

// 탭명 → 테이블명 (동일 — 소문자·언더스코어라 그대로 안전. bookings 등)
const TABLES = [
  [SHEET_NAME, BOOKING_HEADERS],
  [ROI_SHEET_NAME, ROI_HEADERS],
  [SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS],
  [ARTICLES_SHEET_NAME, ARTICLES_HEADERS],
  [SURVEY_SHEET_NAME, SURVEY_HEADERS],
  [LEDGER_SHEET_NAME, LEDGER_HEADERS],
  [ISSUE_SHEET_NAME, ISSUE_HEADERS],
  [VISITOR_SHEET_NAME, VISITOR_HEADERS],
  [INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS],
  [BEST_SHEET_NAME, BEST_HEADERS],
  [EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS],
  [HEALTH_SHEET_NAME, HEALTH_HEADERS],
  [VOC_SHEET_NAME, VOC_HEADERS],
];

async function ensureSchema(pool) {
  for (const [table, headers] of TABLES) {
    const cols = headers.map((h) => `${q(h)} TEXT`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS ${q(table)} (rid BIGSERIAL PRIMARY KEY, ${cols})`);
    // 스키마 진화 — 상수 배열에 새 컬럼이 추가되면 기존 테이블 끝에 자동 추가 (ensureHeaders와 동일 역할)
    for (const h of headers) {
      await pool.query(`ALTER TABLE ${q(table)} ADD COLUMN IF NOT EXISTS ${q(h)} TEXT`);
    }
  }
  await pool.query(`ALTER TABLE ${q(ARTICLES_SHEET_NAME)} ADD COLUMN IF NOT EXISTS ord BIGINT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q(STATE_SHEET_NAME)} ("key" TEXT PRIMARY KEY, "value" TEXT)`);
}

const sv = (v) => (v == null ? '' : String(v)); // 저장은 전부 문자열 (시트 동작 승계)

function rowToObj(headers, row, { withRid = false } = {}) {
  const obj = {};
  for (const h of headers) {
    let v = row[h];
    if (h === 'date') v = normalizeDate(v);
    obj[h] = v == null ? '' : v;
  }
  if (withRid) obj._rid = Number(row.rid);
  return obj;
}

/** @returns {Promise<import('../types.js').Store>} */
export async function createPostgresStore() {
  const { default: pg } = await import('pg'); // 동적 import — memory 백엔드 기동 시 미로드
  const pool = new pg.Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.sslmode === 'disable' ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  await ensureSchema(pool);
  console.log('[store:postgres] 스키마 확인 완료 (테이블 ' + (TABLES.length + 1) + '종)');

  async function listRows(table, headers, opts) {
    const res = await pool.query(`SELECT * FROM ${q(table)} ORDER BY rid`);
    return res.rows.map((r) => rowToObj(headers, r, opts));
  }

  async function insertRow(table, headers, record, extra = {}) {
    const cols = [...headers.map(q), ...Object.keys(extra).map(q)];
    const vals = [...headers.map((h) => sv(record[h])), ...Object.values(extra)];
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`INSERT INTO ${q(table)} (${cols.join(', ')}) VALUES (${ph})`, vals);
  }

  // idField 기준 갱신 — 갱신 후 레코드 반환 (없으면 null). fields의 미지 컬럼은 무시.
  async function updateByField(table, headers, idField, id, fields) {
    const entries = Object.entries(fields).filter(([k]) => headers.includes(k));
    if (!entries.length) {
      const res = await pool.query(`SELECT * FROM ${q(table)} WHERE ${q(idField)} = $1 ORDER BY rid LIMIT 1`, [sv(id)]);
      return res.rows[0] ? rowToObj(headers, res.rows[0]) : null;
    }
    const sets = entries.map(([k], i) => `${q(k)} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => sv(v));
    const res = await pool.query(
      `UPDATE ${q(table)} SET ${sets} WHERE ${q(idField)} = $${entries.length + 1} RETURNING *`,
      [...vals, sv(id)]);
    return res.rows[0] ? rowToObj(headers, res.rows[0]) : null;
  }

  async function removeByField(table, idField, value) {
    const res = await pool.query(`DELETE FROM ${q(table)} WHERE ${q(idField)} = $1`, [sv(value)]);
    return res.rowCount;
  }

  // 신규 탭 공용 (TableStore 계약 — memory makeMemTable/sheets makeTable과 동일 의미)
  function makeTable(table, headers, idField) {
    return {
      list: () => listRows(table, headers).then((rows) => rows.filter((r) => String(r[idField] ?? '').trim())),
      append: (record) => insertRow(table, headers, record),
      update: (id, fields) => updateByField(table, headers, idField, id, fields),
      remove: (id) => removeByField(table, idField, id),
    };
  }

  const DATE_FIELDS = ['visit_date', 'confirmed_date']; // 설문 계열 읽기 정규화 (sheets 어댑터와 동일)
  async function listSurveyTable(table, headers, idField) {
    const rows = await listRows(table, headers);
    return rows
      .filter((r) => String(r[idField] ?? '').trim())
      .map((r) => {
        const out = { ...r };
        for (const f of DATE_FIELDS) if (out[f]) out[f] = normalizeDate(out[f]);
        return out;
      });
  }

  return {
    backend: 'postgres',

    bookings: {
      async getById(id) {
        const res = await pool.query(`SELECT * FROM ${q(SHEET_NAME)} WHERE "id" = $1 ORDER BY rid LIMIT 1`, [sv(id)]);
        return res.rows[0] ? rowToObj(BOOKING_HEADERS, res.rows[0]) : null;
      },
      async listAll() {
        return (await listRows(SHEET_NAME, BOOKING_HEADERS)).filter((r) => r.date);
      },
      async listByDate(date) {
        const target = normalizeDate(date);
        return (await listRows(SHEET_NAME, BOOKING_HEADERS)).filter((r) => normalizeDate(r.date) === target);
      },
      append: (b) => insertRow(SHEET_NAME, BOOKING_HEADERS, b),
      update: (id, fields) => updateByField(SHEET_NAME, BOOKING_HEADERS, 'id', id, fields),
      remove: async (id) => (await removeByField(SHEET_NAME, 'id', id)) > 0,
    },

    roi: {
      list: () => listRows(ROI_SHEET_NAME, ROI_HEADERS).then((rows) => rows.filter((r) => r.id)),
      append: (snap) => insertRow(ROI_SHEET_NAME, ROI_HEADERS, snap),
      remove: async (id) => (await removeByField(ROI_SHEET_NAME, 'id', id)) > 0,
    },

    slotBlocks: {
      async list(date) {
        const target = date ? normalizeDate(date) : null;
        return (await listRows(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS))
          .map((r) => ({ ...r, date: normalizeDate(r.date), slot: Number(r.slot) }))
          .filter((r) => r.date && (!target || r.date === target));
      },
      add: (block) => insertRow(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS, block),
      async removeByDateSlot(date, slot) {
        const target = normalizeDate(date);
        const rows = await listRows(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS, { withRid: true });
        const matches = rows.filter((r) => normalizeDate(r.date) === target && Number(r.slot) === Number(slot));
        for (const m of matches) await pool.query(`DELETE FROM ${q(SLOT_BLOCKS_SHEET_NAME)} WHERE rid = $1`, [m._rid]);
        return matches.length;
      },
      removeById: (id) => removeByField(SLOT_BLOCKS_SHEET_NAME, 'id', id),
    },

    articles: (() => {
      // ord 미설정 행(과거 데이터 이행분)은 rid로 보정해 정렬 안정화
      const ordOf = (r) => (r.ord != null && r.ord !== '' ? Number(r.ord) : Number(r._rid));
      async function listWithRid() {
        const res = await pool.query(`SELECT * FROM ${q(ARTICLES_SHEET_NAME)} ORDER BY rid`);
        return res.rows.map((r) => {
          const obj = rowToObj(ARTICLES_HEADERS, r, { withRid: true });
          obj.ord = r.ord;
          return obj;
        }).sort((a, b) => ordOf(a) - ordOf(b) || a._rid - b._rid);
      }
      return {
        async listByMonth(month) {
          return (await listWithRid())
            .filter((r) => normalizeMonth(r.month) === month && String(r.url || '').trim())
            .map((r) => ({
              ...r,
              month: normalizeMonth(r.month),
              published_at: formatPublishedDate(r.published_at),
              rowRef: r._rid, // write-back용 참조 = rid
            }));
        },
        async update(rowRef, fields) {
          const entries = Object.entries(fields).filter(([k]) => ARTICLES_HEADERS.includes(k));
          if (!entries.length) return;
          const sets = entries.map(([k], i) => `${q(k)} = $${i + 1}`).join(', ');
          await pool.query(`UPDATE ${q(ARTICLES_SHEET_NAME)} SET ${sets} WHERE rid = $${entries.length + 1}`,
            [...entries.map(([, v]) => sv(v)), rowRef]);
        },
        async listAll() {
          return (await listWithRid())
            .filter((r) => String(r.url || '').trim())
            .map((r) => ({
              month: normalizeMonth(r.month),
              title: String(r.title || '').trim(),
              url: String(r.url || '').trim(),
              source: String(r.source || '').trim(),
              published_at: formatPublishedDate(r.published_at),
              summary: String(r.summary || '').trim(),
              thumbnail: String(r.thumbnail || '').trim(),
            }));
        },
        async append(record) {
          await insertRow(ARTICLES_SHEET_NAME, ARTICLES_HEADERS, record, { ord: Date.now() });
        },
        async remove(month, url) {
          const rows = await listWithRid();
          const found = rows.find((r) => normalizeMonth(r.month) === month && String(r.url || '').trim() === url);
          if (!found) return false;
          await pool.query(`DELETE FROM ${q(ARTICLES_SHEET_NAME)} WHERE rid = $1`, [found._rid]);
          return true;
        },
        async move(month, url, dir) {
          const monthRows = (await listWithRid())
            .filter((r) => normalizeMonth(r.month) === month && String(r.url || '').trim());
          const pos = monthRows.findIndex((r) => String(r.url).trim() === url);
          if (pos < 0) return { ok: false, error: 'not_found' };
          const npos = pos + (dir === 'up' ? -1 : 1);
          if (npos < 0 || npos >= monthRows.length) return { ok: false, error: 'edge' };
          const a = monthRows[pos], b = monthRows[npos];
          // ord 값 교환 (미설정이면 rid를 초기값으로)
          await pool.query(`UPDATE ${q(ARTICLES_SHEET_NAME)} SET ord = $1 WHERE rid = $2`, [ordOf(b), a._rid]);
          await pool.query(`UPDATE ${q(ARTICLES_SHEET_NAME)} SET ord = $1 WHERE rid = $2`, [ordOf(a), b._rid]);
          return { ok: true };
        },
        async updateMeta(month, url, fields) {
          const rows = await listWithRid();
          const found = rows.find((r) => normalizeMonth(r.month) === month && String(r.url || '').trim() === url);
          if (!found) return false;
          const entries = Object.entries(fields).filter(([k]) => ARTICLES_HEADERS.includes(k));
          if (entries.length) {
            const sets = entries.map(([k], i) => `${q(k)} = $${i + 1}`).join(', ');
            await pool.query(`UPDATE ${q(ARTICLES_SHEET_NAME)} SET ${sets} WHERE rid = $${entries.length + 1}`,
              [...entries.map(([, v]) => sv(v)), found._rid]);
          }
          return true;
        },
      };
    })(),

    state: {
      async get(key) {
        const res = await pool.query(`SELECT "value" FROM ${q(STATE_SHEET_NAME)} WHERE "key" = $1`, [key]);
        return res.rows[0] ? String(res.rows[0].value ?? '') : '';
      },
      async set(key, value) {
        await pool.query(
          `INSERT INTO ${q(STATE_SHEET_NAME)} ("key", "value") VALUES ($1, $2)
           ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`,
          [key, String(value)]);
      },
    },

    survey: {
      listResponses: () => listSurveyTable(SURVEY_SHEET_NAME, SURVEY_HEADERS, 'response_id'),
      listLedger: () => listSurveyTable(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'ledger_id'),
      listIssues: () => listSurveyTable(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'issue_id'),
      appendResponse: (r) => insertRow(SURVEY_SHEET_NAME, SURVEY_HEADERS, r),
      appendLedger: (r) => insertRow(LEDGER_SHEET_NAME, LEDGER_HEADERS, r),
      appendIssue: (r) => insertRow(ISSUE_SHEET_NAME, ISSUE_HEADERS, r),
      updateResponse: (id, fields) => updateByField(SURVEY_SHEET_NAME, SURVEY_HEADERS, 'response_id', id, fields),
      updateLedger: (id, fields) => updateByField(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'ledger_id', id, fields),
      updateIssue: (id, fields) => updateByField(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'issue_id', id, fields),
      // 삭제 — 테스트·실수 데이터 정리 전용 (cascade는 핸들러 책임 — memory/sheets와 동일 계약)
      removeResponse: (id) => removeByField(SURVEY_SHEET_NAME, 'response_id', id),
      removeLedgerByResponse: (rid) => removeByField(LEDGER_SHEET_NAME, 'response_id', rid),
      removeIssueByResponse: (rid) => removeByField(ISSUE_SHEET_NAME, 'response_id', rid),
      removeLedger: (id) => removeByField(LEDGER_SHEET_NAME, 'ledger_id', id),
      removeIssue: (id) => removeByField(ISSUE_SHEET_NAME, 'issue_id', id),
    },

    visitors: makeTable(VISITOR_SHEET_NAME, VISITOR_HEADERS, 'response_id'),
    insights: makeTable(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS, 'id'),
    best: makeTable(BEST_SHEET_NAME, BEST_HEADERS, 'id'),
    exportLog: makeTable(EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS, 'id'),
    health: makeTable(HEALTH_SHEET_NAME, HEALTH_HEADERS, 'id'),
    voc: makeTable(VOC_SHEET_NAME, VOC_HEADERS, 'id'),
  };
}
