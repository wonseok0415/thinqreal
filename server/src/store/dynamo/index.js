// DynamoDB 저장소 — 2단계 스텁.
// PK/SK·GSI 설계는 DB팀 협의와 병행 (decisions-2026-07-06.md §2-⑥, 미결 §4).
// 인터페이스 계약은 ../types.js — listByDate가 date-GSI 쿼리 대응점.

export function createDynamoStore() {
  throw new Error('DynamoDB store는 2단계에서 구현 예정 (STORE_BACKEND=sheets 또는 memory 사용)');
}
