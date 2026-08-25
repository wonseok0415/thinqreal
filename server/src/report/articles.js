// 월간 리포트 기사 수집 — 우선순위: 시트 수동 큐레이션 → Serper → CSE → 안내문 (현행 유지).
// OG 메타 자동 추출 + 빈 칸 시트 write-back, EUC-KR/MS949 재디코딩 포함.
import iconv from 'iconv-lite';
import { config } from '../config.js';
import { MONTHLY_REPORT_QUERY } from '../lib/constants.js';
import { decodeHtmlEntities, extractDomain, truncate } from '../lib/html.js';

// ── URL 메타 추출 ────────────────────────────────────────────
async function fetchUrlMeta(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThinQRealBot/1.0; +https://thinqreal.com)',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status !== 200) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const utf8Text = buf.toString('utf8');

    // charset 감지: Content-Type 헤더 → HTML meta → UTF-8 폴백
    let charset = '';
    const ct = res.headers.get('content-type') || '';
    const ctMatch = ct.match(/charset\s*=\s*([^\s;]+)/i);
    if (ctMatch) charset = ctMatch[1].toUpperCase().replace(/^["']|["']$/g, '');
    if (!charset) {
      const metaCs = utf8Text.match(/<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9_\-]+)/i);
      if (metaCs) charset = metaCs[1].toUpperCase();
    }
    if (/^UTF.?8$/i.test(charset)) charset = 'UTF-8';
    else if (charset === 'CP949' || charset === 'WINDOWS-949') charset = 'MS949';

    let html = utf8Text;
    if (charset && charset !== 'UTF-8') {
      const encName = charset === 'MS949' ? 'cp949' : charset.toLowerCase();
      if (iconv.encodingExists(encName)) html = iconv.decode(buf, encName);
      else console.warn(`[articles] unsupported charset ${charset} for ${url} → UTF-8 fallback`);
    }
    return parseMetaTags(html);
  } catch (e) {
    console.warn(`[articles] fetchUrlMeta error for ${url}: ${e.message}`);
    return null;
  }
}

function parseMetaTags(html) {
  const result = { title: '', description: '', source: '', publishedAt: '', image: '' };

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) result.title = decodeHtmlEntities(titleTag[1]).trim();

  const metaTags = html.match(/<meta\s+[^>]+>/gi) || [];
  for (const tag of metaTags) {
    const propM = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contM = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (!propM || !contM) continue;
    const prop = propM[1].toLowerCase();
    const content = decodeHtmlEntities(contM[1]).trim();
    if (!content) continue;

    if (prop === 'og:title') result.title = content;
    else if (prop === 'og:description' || prop === 'description') {
      if (!result.description) result.description = content;
    } else if (prop === 'og:site_name') result.source = content;
    else if (prop === 'og:image' || prop === 'twitter:image' || prop === 'twitter:image:src') {
      if (!result.image) result.image = content;
    } else if (prop === 'article:published_time' || prop === 'article:published' ||
               prop === 'datepublished' || prop === 'pubdate') {
      result.publishedAt = String(content).slice(0, 10);
    }
  }
  return result;
}

// 자동 수집 기사 필터 — ThinQ Real 직접 관련 기사만 (2026-08-04 팀장 리뷰: 무관 기사 제외, 없으면 0건)
export function filterThinqRealItems(items) {
  const re = /(thinq\s*real|씽큐\s*리얼)/i;
  return (items || []).filter((it) => re.test(String(it.title || '') + ' ' + String(it.snippet || '')));
}

// YouTube URL은 페이지 스크랩 시 영상 정보가 아니라 사이트 일반 소개("YouTube"/"동영상 공유")가
// 잡히므로(SPA·동의 화면), 공개 oEmbed API(제목·채널)와 i.ytimg 공식 썸네일로 우회
function youtubeVideoId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

async function fetchYoutubeMeta(url) {
  const id = youtubeVideoId(url);
  if (!id) return null;
  let title = '', author = '';
  try {
    const res = await fetch(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id),
      { signal: AbortSignal.timeout(10000) });
    if (res.status === 200) {
      const j = await res.json();
      title = String(j.title || '');
      author = String(j.author_name || '');
    }
  } catch (e) { console.warn('[articles] fetchYoutubeMeta fail: ' + e.message); }
  return {
    title,
    description: '',
    source: author ? 'YouTube · ' + author : 'YouTube',
    publishedAt: '',
    image: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
  };
}

export async function enrichArticleFromUrl(item) {
  const meta = (await fetchYoutubeMeta(item.link)) || (await fetchUrlMeta(item.link));
  if (!meta) {
    return { ...item, title: item.title || item.link, source: item.source || extractDomain(item.link) };
  }
  return {
    title: item.title || meta.title || item.link,
    link: item.link,
    source: item.source || meta.source || extractDomain(item.link),
    snippet: item.snippet || truncate(meta.description, 120),
    publishedAt: item.publishedAt || meta.publishedAt || '',
    thumbnail: item.thumbnail || meta.image || '',
  };
}

// ── 시트 수동 큐레이션 (담당자가 title을 채웠으면 그 의도 존중 — fetch 안 함) ──
export async function getManualArticles(store, month) {
  let rows;
  try {
    rows = await store.articles.listByMonth(month);
  } catch (e) {
    console.warn('[articles] manual read error: ' + e.message);
    return [];
  }
  const items = [];
  for (const row of rows) {
    const title = String(row.title || '').trim();
    const url = String(row.url || '').trim();
    if (!url) continue;

    const baseItem = {
      title,
      link: url,
      source: String(row.source || '').trim(),
      snippet: String(row.summary || '').trim(),
      publishedAt: String(row.published_at || '').trim(),
      thumbnail: String(row.thumbnail || '').trim(),
    };
    const enriched = baseItem.title ? baseItem : await enrichArticleFromUrl(baseItem);
    if (!enriched.title) continue;

    // 빈 칸 write-back (담당자가 채운 값은 보존)
    const wb = {};
    if (!title && enriched.title) wb.title = enriched.title;
    if (!baseItem.source && enriched.source) wb.source = enriched.source;
    if (!baseItem.snippet && enriched.snippet) wb.summary = enriched.snippet;
    if (!baseItem.publishedAt && enriched.publishedAt) wb.published_at = enriched.publishedAt;
    if (!baseItem.thumbnail && enriched.thumbnail) wb.thumbnail = enriched.thumbnail;
    if (Object.keys(wb).length && row.rowRef != null) {
      try { await store.articles.update(row.rowRef, wb); }
      catch (e) { console.warn('[articles] write-back skip: ' + e.message); }
    }
    items.push(enriched);
  }
  return items;
}

// ── 자동 검색: Serper(1순위) → CSE(폴백) ─────────────────────
export async function fetchThinqRealArticles() {
  if (config.serperApiKey) return fetchArticlesViaSerper(config.serperApiKey);
  if (config.cse.id && config.cse.key) return fetchArticlesViaCSE(config.cse.id, config.cse.key);
  return { items: [], skipReason: '기사 검색 API 키 미설정 (env SERPER_API_KEY 또는 GOOGLE_CSE_ID/GOOGLE_CSE_KEY 등록 필요)' };
}

async function fetchArticlesViaSerper(apiKey) {
  try {
    const res = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: MONTHLY_REPORT_QUERY, gl: 'kr', hl: 'ko', num: 10, tbs: 'qdr:m' }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status !== 200) {
      let detail = '';
      try { const errBody = await res.json(); if (errBody?.message) detail = ' — ' + errBody.message; } catch { /* 무시 */ }
      return { items: [], provider: 'serper', skipReason: 'Serper 응답 코드 ' + res.status + detail };
    }
    const body = await res.json();
    const items = (body.news || []).map((it) => ({
      title: it.title || '',
      link: it.link || '',
      source: it.source || '',
      snippet: it.snippet || '',
      thumbnail: it.imageUrl || '',
      publishedAt: it.date || '',
    }));
    return { items, provider: 'serper', skipReason: items.length ? '' : '검색 결과 없음' };
  } catch (e) {
    return { items: [], provider: 'serper', skipReason: 'Serper 호출 오류: ' + e.message };
  }
}

async function fetchArticlesViaCSE(cx, key) {
  const url = 'https://www.googleapis.com/customsearch/v1'
    + '?q=' + encodeURIComponent(MONTHLY_REPORT_QUERY)
    + '&cx=' + encodeURIComponent(cx)
    + '&key=' + encodeURIComponent(key)
    + '&num=10&dateRestrict=m1&hl=ko&gl=kr';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.status !== 200) {
      let detail = '';
      try { const errBody = await res.json(); if (errBody?.error?.message) detail = ' — ' + errBody.error.message; } catch { /* 무시 */ }
      return { items: [], provider: 'cse', skipReason: 'CSE 응답 코드 ' + res.status + detail };
    }
    const body = await res.json();
    const items = (body.items || []).map((it) => ({
      title: it.title || '',
      link: it.link || '',
      source: (it.displayLink || '').replace(/^www\./, ''),
      snippet: it.snippet || '',
    }));
    return { items, provider: 'cse', skipReason: items.length ? '' : '검색 결과 없음' };
  } catch (e) {
    return { items: [], provider: 'cse', skipReason: 'CSE 호출 오류: ' + e.message };
  }
}
