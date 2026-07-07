// Google Sheets 저장소 구현 — store 인터페이스 5종 (types.js 계약).
// 레코드 형태는 현행 24컬럼 필드명 그대로. date 정규화는 여기(어댑터)의 책임.
import {
  SHEET_NAME, ROI_SHEET_NAME, ARTICLES_SHEET_NAME, SLOT_BLOCKS_SHEET_NAME, STATE_SHEET_NAME,
  BOOKING_HEADERS, ROI_HEADERS, ARTICLES_HEADERS, SLOT_BLOCKS_HEADERS, STATE_HEADERS,
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
