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

/** @returns {import('./types.js').Store} */
export function createMemoryStore({ seed } = {}) {
  const bookings = seed === 'demo' ? demoSeed() : [];
  const roi = [];
  const slotBlocks = [];
  const articles = [];
  const state = new Map();

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
        return articles.filter((a) => a.month === month).map((a, i) => ({ ...a, rowRef: i }));
      },
      async update(rowRef, fields) {
        if (articles[rowRef]) Object.assign(articles[rowRef], fields);
      },
    },
    state: {
      async get(key) { return state.get(key) || ''; },
      async set(key, value) { state.set(key, String(value)); },
    },
  };
}
