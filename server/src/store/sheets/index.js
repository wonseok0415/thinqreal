// Google Sheets 저장소 구현 — store 인터페이스 5종 (types.js 계약).
// 레코드 형태는 현행 24컬럼 필드명 그대로. date 정규화는 여기(어댑터)의 책임.
import {
  SHEET_NAME, ROI_SHEET_NAME, ARTICLES_SHEET_NAME, SLOT_BLOCKS_SHEET_NAME, STATE_SHEET_NAME,
  BOOKING_HEADERS, ROI_HEADERS, ARTICLES_HEADERS, SLOT_BLOCKS_HEADERS, STATE_HEADERS,
  SURVEY_SHEET_NAME, LEDGER_SHEET_NAME, ISSUE_SHEET_NAME,
  SURVEY_HEADERS, LEDGER_HEADERS, ISSUE_HEADERS,
  VISITOR_SHEET_NAME, VISITOR_HEADERS, INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS,
  BEST_SHEET_NAME, BEST_HEADERS, EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS,
  HEALTH_SHEET_NAME, HEALTH_HEADERS, VOC_SHEET_NAME, VOC_HEADERS,
} from '../../lib/constants.js';
import { normalizeDate, normalizeMonth, formatPublishedDate } from '../../lib/dates.js';
import { SheetsClient } from './client.js';

function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, j) => {
    let v = row[j];
    if (h === 'date') v = normalizeDate(v);
    obj[h] = v == null ? '' : v;
  });
  if (obj.id != null && obj.id !== '') obj.id = String(obj.id);
  return obj;
}

function objToRow(headers, obj) {
  return headers.map((h) => (obj[h] == null ? '' : obj[h]));
}

/** @returns {import('../types.js').Store} */
export function createSheetsStore({ serviceAccount, sheetId }) {
  const client = new SheetsClient(serviceAccount, sheetId);

  // 탭별 {headers, rows(objects), rowNums} 스냅샷 읽기
  async function readTable(title, HEADERS) {
    const headers = await client.ensureHeaders(title, HEADERS);
    const rows = await client.readAll(title);
    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = rowToObj(headers, rows[i]);
      obj._rowNum = i + 1; // 1-based 시트 행 번호 (어댑터 내부 전용)
      records.push(obj);
    }
    return { headers, records };
  }

  function strip(obj) {
    if (!obj) return obj;
    const { _rowNum, ...rest } = obj;
    return rest;
  }

  async function findById(title, HEADERS, id) {
    const { headers, records } = await readTable(title, HEADERS);
    const found = records.find((r) => String(r.id) === String(id)) || null;
    return { headers, found };
  }

  // idField 일치 행 전부 삭제 — 아래→위 순서 (행 인덱스 어긋남 방지, .gs deleteRowsByValue 이식)
  async function removeRowsByValue(title, HEADERS, field, value) {
    const { records } = await readTable(title, HEADERS);
    const matches = records
      .filter((r) => String(r[field]) === String(value))
      .sort((a, b) => b._rowNum - a._rowNum);
    for (const m of matches) await client.deleteRow(title, m._rowNum);
    return matches.length;
  }

  // 신규 탭 공용 팩토리 — idField 기준 list/append/update/remove (TableStore 계약).
  // month/visit_date류 정규화는 핸들러 책임 (appendRow가 RAW라 GAS식 날짜 자동 변환 미발생 —
  // 단 기존에 GAS가 만든 행의 변환값은 남아 있으므로 읽기 정규화는 유지 필요).
  function makeTable(title, HEADERS, idField) {
    return {
      async list() {
        const { records } = await readTable(title, HEADERS);
        return records.filter((r) => String(r[idField] ?? '').trim()).map(strip);
      },
      async append(record) {
        const headers = await client.ensureHeaders(title, HEADERS);
        await client.appendRow(title, objToRow(headers, record));
      },
      async update(id, fields) {
        const { headers, records } = await readTable(title, HEADERS);
        const found = records.find((r) => String(r[idField]) === String(id)) || null;
        if (!found) return null;
        const updates = [];
        for (const [k, v] of Object.entries(fields)) {
          const col = headers.indexOf(k);
          if (col >= 0) updates.push({ rowNum: found._rowNum, colIndex: col, value: v == null ? '' : v });
        }
        await client.updateCells(title, updates);
        return strip({ ...found, ...fields });
      },
      async remove(id) { return removeRowsByValue(title, HEADERS, idField, id); },
    };
  }

  return {
    backend: 'sheets',
    bookings: {
      async getById(id) {
        const { found } = await findById(SHEET_NAME, BOOKING_HEADERS, id);
        return strip(found);
      },
      async listAll() {
        const { records } = await readTable(SHEET_NAME, BOOKING_HEADERS);
        return records.filter((r) => r.date).map(strip);
      },
      async listByDate(date) {
        const target = normalizeDate(date);
        const { records } = await readTable(SHEET_NAME, BOOKING_HEADERS);
        return records.filter((r) => normalizeDate(r.date) === target).map(strip);
      },
      async append(b) {
        const headers = await client.ensureHeaders(SHEET_NAME, BOOKING_HEADERS);
        await client.appendRow(SHEET_NAME, objToRow(headers, b));
      },
      async update(id, fields) {
        const { headers, found } = await findById(SHEET_NAME, BOOKING_HEADERS, id);
        if (!found) return null;
        const updates = [];
        for (const [k, v] of Object.entries(fields)) {
          const col = headers.indexOf(k);
          if (col >= 0) updates.push({ rowNum: found._rowNum, colIndex: col, value: v == null ? '' : v });
        }
        await client.updateCells(SHEET_NAME, updates);
        return strip({ ...found, ...fields });
      },
      async remove(id) {
        const { found } = await findById(SHEET_NAME, BOOKING_HEADERS, id);
        if (!found) return false;
        await client.deleteRow(SHEET_NAME, found._rowNum);
        return true;
      },
    },

    roi: {
      async list() {
        const { records } = await readTable(ROI_SHEET_NAME, ROI_HEADERS);
        return records.filter((r) => r.id).map(strip);
      },
      async append(snap) {
        const headers = await client.ensureHeaders(ROI_SHEET_NAME, ROI_HEADERS);
        await client.appendRow(ROI_SHEET_NAME, objToRow(headers, snap));
      },
      async remove(id) {
        const { found } = await findById(ROI_SHEET_NAME, ROI_HEADERS, id);
        if (!found) return false;
        await client.deleteRow(ROI_SHEET_NAME, found._rowNum);
        return true;
      },
    },

    slotBlocks: {
      async list(date) {
        const target = date ? normalizeDate(date) : null;
        const { records } = await readTable(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS);
        return records
          .map((r) => ({ ...r, date: normalizeDate(r.date), slot: Number(r.slot) }))
          .filter((r) => r.date && (!target || r.date === target))
          .map(strip);
      },
      async add(block) {
        const headers = await client.ensureHeaders(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS);
        await client.appendRow(SLOT_BLOCKS_SHEET_NAME, objToRow(headers, block));
      },
      async removeByDateSlot(date, slot) {
        const target = normalizeDate(date);
        const { records } = await readTable(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS);
        // 뒤에서부터 삭제 (행 인덱스 밀림 방지 — 현행 로직 동일)
        const matches = records
          .filter((r) => normalizeDate(r.date) === target && Number(r.slot) === Number(slot))
          .sort((a, b) => b._rowNum - a._rowNum);
        for (const m of matches) await client.deleteRow(SLOT_BLOCKS_SHEET_NAME, m._rowNum);
        return matches.length;
      },
      async removeById(id) {
        const { records } = await readTable(SLOT_BLOCKS_SHEET_NAME, SLOT_BLOCKS_HEADERS);
        const matches = records
          .filter((r) => String(r.id) === String(id))
          .sort((a, b) => b._rowNum - a._rowNum);
        for (const m of matches) await client.deleteRow(SLOT_BLOCKS_SHEET_NAME, m._rowNum);
        return matches.length;
      },
    },

    articles: {
      async listByMonth(month) {
        const { records } = await readTable(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        return records
          .map((r) => ({
            ...r,
            month: normalizeMonth(r.month),
            published_at: formatPublishedDate(r.published_at),
            rowRef: r._rowNum,
          }))
          .filter((r) => r.month === month && String(r.url || '').trim())
          .map(strip);
      },
      async update(rowRef, fields) {
        const headers = await client.ensureHeaders(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        const updates = [];
        for (const [k, v] of Object.entries(fields)) {
          const col = headers.indexOf(k);
          if (col >= 0) updates.push({ rowNum: rowRef, colIndex: col, value: v == null ? '' : v });
        }
        await client.updateCells(ARTICLES_SHEET_NAME, updates);
      },
      // 관리자 큐레이션 UI용 — 전 행 조회 (month/published_at 정규화, .gs readArticleRows 이식)
      // summary·thumbnail은 수정 모달 프리필용 (2026-08-26). 엔티티 디코딩은 핸들러 책임.
      async listAll() {
        const { records } = await readTable(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        return records
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
      // 기사 메타 직접 교정 (article_update) — month+url이 행 정체성이라 이 둘은 수정 불가
      async updateMeta(month, url, fields) {
        const { headers, records } = await readTable(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        const found = records.find((r) =>
          normalizeMonth(r.month) === month && String(r.url || '').trim() === url);
        if (!found) return false;
        const updates = [];
        for (const [k, v] of Object.entries(fields)) {
          const col = headers.indexOf(k);
          if (col >= 0) updates.push({ rowNum: found._rowNum, colIndex: col, value: v == null ? '' : v });
        }
        await client.updateCells(ARTICLES_SHEET_NAME, updates);
        return true;
      },
      async append(record) {
        const headers = await client.ensureHeaders(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        await client.appendRow(ARTICLES_SHEET_NAME, objToRow(headers, record));
      },
      async remove(month, url) {
        const { records } = await readTable(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        const found = records.slice().reverse().find((r) =>
          normalizeMonth(r.month) === month && String(r.url || '').trim() === url);
        if (!found) return false;
        await client.deleteRow(ARTICLES_SHEET_NAME, found._rowNum);
        return true;
      },
      // 같은 달 이웃 행과 값 전체 교환 (.gs handleArticleMove — 순서 컬럼 없이 물리 행 순서로 관리)
      async move(month, url, dir) {
        const { headers, records } = await readTable(ARTICLES_SHEET_NAME, ARTICLES_HEADERS);
        const monthRows = records.filter((r) => normalizeMonth(r.month) === month && String(r.url || '').trim());
        const pos = monthRows.findIndex((r) => String(r.url).trim() === url);
        if (pos < 0) return { ok: false, error: 'not_found' };
        const npos = pos + (dir === 'up' ? -1 : 1);
        if (npos < 0 || npos >= monthRows.length) return { ok: false, error: 'edge' };
        const a = monthRows[pos], b = monthRows[npos];
        const updates = [];
        headers.forEach((h, col) => {
          updates.push({ rowNum: a._rowNum, colIndex: col, value: b[h] == null ? '' : b[h] });
          updates.push({ rowNum: b._rowNum, colIndex: col, value: a[h] == null ? '' : a[h] });
        });
        await client.updateCells(ARTICLES_SHEET_NAME, updates);
        return { ok: true };
      },
    },

    visitors: makeTable(VISITOR_SHEET_NAME, VISITOR_HEADERS, 'response_id'),
    insights: makeTable(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS, 'id'),
    best: makeTable(BEST_SHEET_NAME, BEST_HEADERS, 'id'),
    exportLog: makeTable(EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS, 'id'),
    health: makeTable(HEALTH_SHEET_NAME, HEALTH_HEADERS, 'id'),
    voc: makeTable(VOC_SHEET_NAME, VOC_HEADERS, 'id'),

    // 설문 파이프라인 탭 3종 — 행 삭제 연산 없음 (드롭·기각도 상태 전환만, 명세 §3)
    survey: (() => {
      // 표별 id 컬럼이 다르다 (response_id/ledger_id/issue_id) — 공용 헬퍼로 처리
      const DATE_FIELDS = ['visit_date', 'confirmed_date']; // .gs readSheetRecords와 동일 정규화 대상
      async function listTable(title, HEADERS, idField) {
        const { records } = await readTable(title, HEADERS);
        return records
          .filter((r) => String(r[idField] ?? '').trim())
          .map((r) => {
            const out = { ...r };
            for (const f of DATE_FIELDS) if (out[f]) out[f] = normalizeDate(out[f]);
            return strip(out);
          });
      }
      async function appendTo(title, HEADERS, record) {
        const headers = await client.ensureHeaders(title, HEADERS);
        await client.appendRow(title, objToRow(headers, record));
      }
      async function updateIn(title, HEADERS, idField, id, fields) {
        const { headers, records } = await readTable(title, HEADERS);
        const found = records.find((r) => String(r[idField]) === String(id)) || null;
        if (!found) return null;
        const updates = [];
        for (const [k, v] of Object.entries(fields)) {
          const col = headers.indexOf(k);
          if (col >= 0) updates.push({ rowNum: found._rowNum, colIndex: col, value: v == null ? '' : v });
        }
        await client.updateCells(title, updates);
        return strip({ ...found, ...fields });
      }
      return {
        listResponses: () => listTable(SURVEY_SHEET_NAME, SURVEY_HEADERS, 'response_id'),
        listLedger: () => listTable(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'ledger_id'),
        listIssues: () => listTable(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'issue_id'),
        appendResponse: (r) => appendTo(SURVEY_SHEET_NAME, SURVEY_HEADERS, r),
        appendLedger: (r) => appendTo(LEDGER_SHEET_NAME, LEDGER_HEADERS, r),
        appendIssue: (r) => appendTo(ISSUE_SHEET_NAME, ISSUE_HEADERS, r),
        updateResponse: (id, fields) => updateIn(SURVEY_SHEET_NAME, SURVEY_HEADERS, 'response_id', id, fields),
        updateLedger: (id, fields) => updateIn(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'ledger_id', id, fields),
        updateIssue: (id, fields) => updateIn(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'issue_id', id, fields),
        // 삭제 — 테스트·실수 데이터 정리 전용 (.gs deleteRowsByValue 이식)
        removeResponse: (id) => removeRowsByValue(SURVEY_SHEET_NAME, SURVEY_HEADERS, 'response_id', id),
        removeLedgerByResponse: (rid) => removeRowsByValue(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'response_id', rid),
        removeIssueByResponse: (rid) => removeRowsByValue(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'response_id', rid),
        removeLedger: (id) => removeRowsByValue(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'ledger_id', id),
        removeIssue: (id) => removeRowsByValue(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'issue_id', id),
      };
    })(),

    // Script Properties의 런타임 상태값 대체 — app_state 탭 (key/value)
    state: {
      async get(key) {
        const { records } = await readTable(STATE_SHEET_NAME, STATE_HEADERS);
        const found = records.find((r) => String(r.key) === key);
        return found ? String(found.value ?? '') : '';
      },
      async set(key, value) {
        const headers = await client.ensureHeaders(STATE_SHEET_NAME, STATE_HEADERS);
        const { records } = await readTable(STATE_SHEET_NAME, STATE_HEADERS);
        const found = records.find((r) => String(r.key) === key);
        if (found) {
          const col = headers.indexOf('value');
          await client.updateCells(STATE_SHEET_NAME, [{ rowNum: found._rowNum, colIndex: col, value: String(value) }]);
        } else {
          await client.appendRow(STATE_SHEET_NAME, objToRow(headers, { key, value: String(value) }));
        }
      },
    },
  };
}
