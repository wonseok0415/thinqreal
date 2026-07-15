// Google Sheets 저장소 구현 — store 인터페이스 5종 (types.js 계약).
// 레코드 형태는 현행 24컬럼 필드명 그대로. date 정규화는 여기(어댑터)의 책임.
import {
  SHEET_NAME, ROI_SHEET_NAME, ARTICLES_SHEET_NAME, SLOT_BLOCKS_SHEET_NAME, STATE_SHEET_NAME,
  BOOKING_HEADERS, ROI_HEADERS, ARTICLES_HEADERS, SLOT_BLOCKS_HEADERS, STATE_HEADERS,
  SURVEY_SHEET_NAME, LEDGER_SHEET_NAME, ISSUE_SHEET_NAME,
  SURVEY_HEADERS, LEDGER_HEADERS, ISSUE_HEADERS,
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
    },

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
