// 구비 가전 목록 — APPLIANCES 상수의 단일 소스 노출 (메일 첨부·관리자 탭 공용)
import { APPLIANCES } from '../lib/constants.js';

export function handleGetAppliances() {
  const items = APPLIANCES.map((r) => ({ category: r[0], name: r[1], model: r[2], maker: r[3] }));
  return { count: items.length, items };
}
