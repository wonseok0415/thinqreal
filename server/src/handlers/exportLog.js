// CSV 내보내기 감사 로그 (개인정보보호팀 요구 — 다운로드 사유 기록). .gs handleExportLog 이식.
// 관리자 이메일은 클라이언트 입력이 아니라 검증된 토큰 payload에서 추출 (위조 방지).
// 파일 비밀번호는 기록하지 않는다 — 사유·시각·행 수만 남긴다.
export async function handleExportLog(store, data, byEmail) {
  await store.exportLog.append({
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    email: byEmail,
    reason: String(data.reason || '').slice(0, 500),
    rowCount: Number(data.rowCount) || 0,
  });
  return { success: true };
}
