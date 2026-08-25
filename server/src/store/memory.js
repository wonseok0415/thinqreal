// 인메모리 저장소 — 로컬 개발·검증용 (시트 자격증명 불필요, docker run 즉시 기동).
// 프로세스 종료 시 데이터 소멸. STORE_SEED=demo면 데모 예약 2건 포함.
import { normalizeDate } from '../lib/dates.js';

function demoSeed() {
  const today = new Date();
  const d = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
  const date = normalizeDate(d);
  return [
    {
      id: '1779900000901', timestamp: new Date().toISOString(), date,
      slots: '[2]', slot: 2, slotLabel: '2회차 13:00~14:30',
      name: '홍길동', org: '데모 고객사', phone: '010-0000-0000', email: 'demo@lge.com',
      purpose: 'B2B 영업', count: 5, note: '', status: '대기중',
      subject: '데모 고객사', clientCompany: '데모 고객사',
      visitors: '[{"org":"데모","name":"홍길동","rank":"책임"}]',
      usagePlan: '데모 활용 방안', expectedEffect: '데모 기대 효과', purposeKey: 'b2b',
      privacyConsent: 'Y', calendarEventId: '', division: 'HS사업본부', department: '데모팀',
    },
    {
      id: '1779900000902', timestamp: new Date().toISOString(), date,
      slots: '[1]', slot: 1, slotLabel: '1회차 09:00~10:30',
      name: '김연구', org: '데모 프로젝트', phone: '010-1111-1111', email: 'demo2@lge.com',
      purpose: 'R&D', count: 3, note: '', status: '확정',
      subject: '데모 프로젝트', clientCompany: '',
      visitors: '[]', usagePlan: '', expectedEffect: '', purposeKey: 'rd',
      privacyConsent: 'Y', calendarEventId: '', division: 'CTO부문', department: '데모연구소',
    },
  ];
}

// 신규 탭 공용 팩토리 — idField 기준 list/append/update/remove (TableStore 계약)
function makeMemTable(rows, idField) {
  return {
    async list() { return rows.map((r) => ({ ...r })); },
    async append(record) { rows.push({ ...record }); },
    async update(id, fields) {
      const row = rows.find((r) => String(r[idField]) === String(id));
      if (!row) return null;
      Object.assign(row, fields);
      return { ...row };
    },
    async remove(id) {
      let removed = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][idField]) === String(id)) { rows.splice(i, 1); removed++; }
      }
      return removed;
    },
  };
}

function removeByField(rows, field, value) {
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][field]) === String(value)) { rows.splice(i, 1); removed++; }
  }
  return removed;
}

/** @returns {import('./types.js').Store} */
export function createMemoryStore({ seed } = {}) {
  const bookings = seed === 'demo' ? demoSeed() : [];
  const roi = [];
  const slotBlocks = [];
  const articles = [];
  const state = new Map();
  const surveyResponses = [];
  const surveyLedger = [];
  const surveyIssues = [];
  const visitorRows = [];
  const insightRows = [];
  const bestRows = [];
  const exportLogRows = [];
  const healthRows = [];
  const vocRows = [];

  return {
    backend: 'memory',
    bookings: {
      async getById(id) {
        return bookings.find((b) => String(b.id) === String(id)) || null;
      },
      async listAll() {
        return bookings.map((b) => ({ ...b }));
      },
      async listByDate(date) {
        const target = normalizeDate(date);
        return bookings.filter((b) => normalizeDate(b.date) === target).map((b) => ({ ...b }));
      },
      async append(b) {
        bookings.push({ ...b });
      },
      async update(id, fields) {
        const row = bookings.find((b) => String(b.id) === String(id));
        if (!row) return null;
        Object.assign(row, fields);
        return { ...row };
      },
      async remove(id) {
        const i = bookings.findIndex((b) => String(b.id) === String(id));
        if (i < 0) return false;
        bookings.splice(i, 1);
        return true;
      },
    },
    roi: {
      async list() { return roi.map((r) => ({ ...r })); },
      async append(snap) { roi.push({ ...snap }); },
      async remove(id) {
        const i = roi.findIndex((r) => String(r.id) === String(id));
        if (i < 0) return false;
        roi.splice(i, 1);
        return true;
      },
    },
    slotBlocks: {
      async list(date) {
        const target = date ? normalizeDate(date) : null;
        return slotBlocks
          .filter((b) => !target || normalizeDate(b.date) === target)
          .map((b) => ({ ...b }));
      },
      async add(block) { slotBlocks.push({ ...block }); },
      async removeByDateSlot(date, slot) {
        const target = normalizeDate(date);
        let removed = 0;
        for (let i = slotBlocks.length - 1; i >= 0; i--) {
          if (normalizeDate(slotBlocks[i].date) === target && Number(slotBlocks[i].slot) === Number(slot)) {
            slotBlocks.splice(i, 1); removed++;
          }
        }
        return removed;
      },
      async removeById(id) {
        let removed = 0;
        for (let i = slotBlocks.length - 1; i >= 0; i--) {
          if (String(slotBlocks[i].id) === String(id)) { slotBlocks.splice(i, 1); removed++; }
        }
        return removed;
      },
    },
    articles: {
      async listByMonth(month) {
        // rowRef는 전체 배열 기준 인덱스 (update가 그대로 참조)
        return articles
          .map((a, i) => ({ ...a, rowRef: i }))
          .filter((a) => a.month === month && String(a.url || '').trim());
      },
      async listAll() {
        return articles
          .filter((a) => String(a.url || '').trim())
          .map((a) => ({
            month: a.month, title: String(a.title || '').trim(), url: String(a.url || '').trim(),
            source: String(a.source || '').trim(), published_at: String(a.published_at || '').trim(),
          }));
      },
      async update(rowRef, fields) {
        if (articles[rowRef]) Object.assign(articles[rowRef], fields);
      },
      async append(record) { articles.push({ ...record }); },
      async remove(month, url) {
        const i = articles.findIndex((a) => a.month === month && String(a.url || '').trim() === url);
        if (i < 0) return false;
        articles.splice(i, 1);
        return true;
      },
      // 같은 달 이웃 행과 저장 순서 교환 (.gs handleArticleMove — 순서 컬럼 없이 물리 순서로 관리)
      async move(month, url, dir) {
        const idxs = [];
        articles.forEach((a, i) => {
          if (a.month === month && String(a.url || '').trim()) idxs.push(i);
        });
        const pos = idxs.findIndex((i) => String(articles[i].url).trim() === url);
        if (pos < 0) return { ok: false, error: 'not_found' };
        const npos = pos + (dir === 'up' ? -1 : 1);
        if (npos < 0 || npos >= idxs.length) return { ok: false, error: 'edge' };
        const a = idxs[pos], b = idxs[npos];
        [articles[a], articles[b]] = [articles[b], articles[a]];
        return { ok: true };
      },
    },
    visitors: makeMemTable(visitorRows, 'response_id'),
    insights: makeMemTable(insightRows, 'id'),
    best: makeMemTable(bestRows, 'id'),
    exportLog: makeMemTable(exportLogRows, 'id'),
    health: makeMemTable(healthRows, 'id'),
    voc: makeMemTable(vocRows, 'id'),
    state: {
      async get(key) { return state.get(key) || ''; },
      async set(key, value) { state.set(key, String(value)); },
    },
    survey: {
      async listResponses() { return surveyResponses.map((r) => ({ ...r })); },
      async listLedger() { return surveyLedger.map((r) => ({ ...r })); },
      async listIssues() { return surveyIssues.map((r) => ({ ...r })); },
      async appendResponse(r) { surveyResponses.push({ ...r }); },
      async appendLedger(r) { surveyLedger.push({ ...r }); },
      async appendIssue(r) { surveyIssues.push({ ...r }); },
      async updateResponse(id, fields) {
        const row = surveyResponses.find((r) => String(r.response_id) === String(id));
        if (!row) return null;
        Object.assign(row, fields);
        return { ...row };
      },
      async updateLedger(id, fields) {
        const row = surveyLedger.find((r) => String(r.ledger_id) === String(id));
        if (!row) return null;
        Object.assign(row, fields);
        return { ...row };
      },
      async updateIssue(id, fields) {
        const row = surveyIssues.find((r) => String(r.issue_id) === String(id));
        if (!row) return null;
        Object.assign(row, fields);
        return { ...row };
      },
      // 삭제 — 테스트·실수 데이터 정리 전용 (.gs deleteRowsByValue 이식)
      async removeResponse(id) { return removeByField(surveyResponses, 'response_id', id); },
      async removeLedgerByResponse(responseId) { return removeByField(surveyLedger, 'response_id', responseId); },
      async removeIssueByResponse(responseId) { return removeByField(surveyIssues, 'response_id', responseId); },
      async removeLedger(id) { return removeByField(surveyLedger, 'ledger_id', id); },
      async removeIssue(id) { return removeByField(surveyIssues, 'issue_id', id); },
    },
  };
}
