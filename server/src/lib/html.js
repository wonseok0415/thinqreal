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

export function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
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
