// 월간 리포트 큐레이션 (관리자 토큰 게이트 — 라우터에서 검증 후 호출)
// - 인사이트/한마디: monthly_insights 탭 (.gs handleInsightAdd/Delete/Move 이식)
// - 관련 기사: monthly_articles 탭 (.gs handleArticleAdd/Delete/Move 이식)
// month 값 정규화는 normalizeMonth가 흡수 (GAS 시절 날짜 자동 변환·아포스트로피 잔재 포함).
import { normalizeMonth } from '../lib/dates.js';
import { enrichArticleFromUrl } from '../report/articles.js';

const MONTH_RE = /^\d{4}-\d{2}$/;

// ── 인사이트·한마디 (type='insight' | 'quote') ─────────────────
export async function handleInsightAdd(store, data) {
  const month = String(data.month || '');
  if (!MONTH_RE.test(month) || !String(data.text || '').trim()) {
    return { ok: false, error: 'invalid_input' };
  }
  const rows = await store.insights.list();
  // data.type은 라우팅 타입(insight_add)이므로 행 타입은 rowType 필드로 받는다
  const type = String(data.rowType) === 'quote' ? 'quote' : 'insight';
  // 한마디는 체크박스 토글 특성상 같은 문장 중복 저장이 항상 버그 — 가드
  if (type === 'quote' && rows.some((r) => normalizeMonth(r.month) === month &&
      String(r.type) === 'quote' && String(r.text || '').trim() === String(data.text).trim())) {
    return { ok: false, error: 'duplicate' };
  }
  const maxSeq = rows
    .filter((r) => normalizeMonth(r.month) === month && String(r.type || 'insight') === type)
    .reduce((mx, r) => Math.max(mx, Number(r.seq) || 0), 0);
  const id = String(Date.now());
  await store.insights.append({
    id, month, seq: maxSeq + 1, type,
    text: String(data.text).trim(), source: String(data.source || ''),
    created_at: new Date().toISOString(),
  });
  return { ok: true, id };
}

export async function handleInsightDelete(store, data) {
  const n = await store.insights.remove(data.id);
  return n ? { ok: true } : { ok: false, error: 'not_found' };
}

// 같은 월·타입 그룹을 seq 순으로 세우고 대상 항목을 한 칸 이동 → 그룹 전체 seq를 1..n으로 재기록
// (레거시 중복 seq도 함께 정리 — .gs handleInsightMove 동일)
export async function handleInsightMove(store, data) {
  const id = String(data.id || '');
  const dir = data.dir === 'up' ? -1 : 1;
  const rows = await store.insights.list();
  const target = rows.find((r) => String(r.id) === id);
  if (!target) return { ok: false, error: 'not_found' };
  const group = rows
    .filter((r) => normalizeMonth(r.month) === normalizeMonth(target.month) &&
      String(r.type || 'insight') === String(target.type || 'insight'))
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  const idx = group.findIndex((r) => String(r.id) === id);
  const to = idx + dir;
  if (to < 0 || to >= group.length) return { ok: false, error: 'edge' };
  const order = group.map((r) => String(r.id));
  order.splice(idx, 1);
  order.splice(to, 0, id);
  for (let i = 0; i < order.length; i++) {
    const row = group.find((r) => String(r.id) === order[i]);
    if (Number(row.seq) !== i + 1) await store.insights.update(order[i], { seq: i + 1 });
  }
  return { ok: true };
}

// ── 관련 기사 큐레이션 — URL만 받아 행 추가, 제목·출처·요약·썸네일은 메타 태그 자동 추출 ──
export async function handleArticleAdd(store, data) {
  const month = String(data.month || '');
  const url = String(data.url || '').trim();
  if (!MONTH_RE.test(month) || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'invalid_input' };
  }
  const existing = await store.articles.listAll();
  if (existing.some((r) => r.month === month && r.url === url)) {
    return { ok: false, error: 'duplicate' };
  }
  const it = await enrichArticleFromUrl({ title: '', link: url, source: '', snippet: '', publishedAt: '', thumbnail: '' });
  const record = {
    month,
    title: (it.title && it.title !== url) ? it.title : '', // 추출 실패 시 공란 (다음 읽기에서 재시도)
    url,
    source: it.source || '', summary: it.snippet || '',
    published_at: it.publishedAt || '', thumbnail: it.thumbnail || '',
  };
  await store.articles.append(record);
  return { ok: true, title: record.title };
}

export async function handleArticleDelete(store, data) {
  const ok = await store.articles.remove(String(data.month || ''), String(data.url || '').trim());
  return ok ? { ok: true } : { ok: false, error: 'not_found' };
}

export async function handleArticleMove(store, data) {
  return store.articles.move(String(data.month || ''), String(data.url || '').trim(),
    data.dir === 'up' ? 'up' : 'down');
}
