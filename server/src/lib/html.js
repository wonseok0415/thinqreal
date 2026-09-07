// HTML/텍스트 공용 유틸 — .gs 동명 함수 이식

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Telegram HTML parse_mode 이스케이프 — 명세상 & < > 3종만
export function escapeTelegramHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 숫자 엔티티(10·16진) → 문자 우선 변환, &amp;는 마지막(이중 디코딩 방지).
// 16진(&#x27; &#xc744; 등) 미지원이 MTN 제목·Instagram 요약 깨짐의 원인이었음 (2026-08-25 수정 이식)
export function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return m; } })
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return m; } })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function extractDomain(url) {
  const m = String(url).match(/^https?:\/\/([^/]+)/i);
  return m ? m[1].replace(/^www\./, '') : '';
}

export function truncate(s, n) {
  if (!s) return '';
  const str = String(s);
  return str.length <= n ? str : (str.slice(0, n - 1) + '…');
}
