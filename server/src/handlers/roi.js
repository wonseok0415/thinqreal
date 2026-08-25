// ROI 시나리오 스냅샷 — .gs handleGetRoiSnapshots/handleNewRoiSnapshot/handleDeleteRoiSnapshot 이식.
// ⚠ 현행 계약대로 토큰 미적용 (ROI 툴이 별창으로도 열려 토큰 전달 경로 없음, 저위험).
//   사내 이전 시 SSO 세션 기반 보호 권장 — SSO 연동(2단계)에서 함께 검토.
import { STATE_ROI_PIN_KEY } from '../lib/constants.js';

export async function handleGetRoiSnapshots(store) {
  const raw = await store.roi.list();
  const records = raw.map((r) => {
    const obj = { ...r };
    try { obj.inputs = typeof obj.inputs === 'string' ? JSON.parse(obj.inputs || '{}') : (obj.inputs || {}); } catch { obj.inputs = {}; }
    try { obj.outputs = typeof obj.outputs === 'string' ? JSON.parse(obj.outputs || '{}') : (obj.outputs || {}); } catch { obj.outputs = {}; }
    return obj;
  }).filter((r) => r.id);
  records.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  // 리포트 반영 지정 스냅샷 id (2026-08-24 — 관리자 화면 표시용, id 자체는 비민감)
  let reportPinnedId = '';
  try { reportPinnedId = (await store.state.get(STATE_ROI_PIN_KEY)) || ''; } catch { /* 무시 */ }
  return { records, reportPinnedId };
}

// 리포트 반영 시나리오 지정/해제 (관리자 토큰 — 라우터에서 검증) — id 공란이면 해제(고정 수치 복귀)
export async function handleRoiReportPin(store, data) {
  const id = String(data.id || '').trim();
  if (!id) {
    await store.state.set(STATE_ROI_PIN_KEY, '');
    return { ok: true, pinned: '' };
  }
  const all = await store.roi.list();
  if (!all.some((r) => String(r.id) === id)) return { ok: false, error: 'not_found' };
  await store.state.set(STATE_ROI_PIN_KEY, id);
  return { ok: true, pinned: id };
}

export async function handleNewRoiSnapshot(store, data) {
  const id = String(Date.now());
  await store.roi.append({
    id,
    timestamp: data.timestamp || new Date().toISOString(),
    label: data.label ?? '',
    author: data.author ?? '',
    inputs: JSON.stringify(data.inputs || {}),
    outputs: JSON.stringify(data.outputs || {}),
  });
  return { success: true, id };
}

export async function handleDeleteRoiSnapshot(store, data) {
  const removed = await store.roi.remove(data.id);
  return removed ? { success: true } : { error: 'Record not found' };
}
