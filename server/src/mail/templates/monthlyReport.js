// 월간 운영 리포트 본문 빌더 — .gs buildMonthlyReportText/Html 이식.
// 차트는 QuickChart URL 대신 서버 렌더링 이미지 참조(chartSrc 리졸버):
//   메일 = cid: 첨부 / 브라우저 미리보기 = data: URI. (decisions §2-⑦ — 외부 유출 0)
import { escapeHtml, truncate } from '../../lib/html.js';
import { PURPOSE_COLORS } from '../../lib/constants.js';

export function fmtKRWReport(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0원';
  const abs = Math.abs(v);
  const eok = Math.floor(abs / 1e8);
  const man = Math.floor((abs % 1e8) / 1e4);
  let s = '';
  if (eok > 0) s += eok.toLocaleString() + '억 ';
  if (man > 0 || eok === 0) s += man.toLocaleString() + '만원';
  else s = s.trim() + '원';
  return (v < 0 ? '-' : '') + s.trim();
}

export function prettyRoiLabel(label) {
  const m = String(label || '').match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
  return m ? (m[1] + ' 시나리오') : (label || '(이름 없음)');
}

// 임원 요약 한 줄 (HTML/Text 공용)
function buildExecSummary(d, asHtml) {
  const m = d.monthNum + '월';
  const strong = (s) => (asHtml ? '<strong>' + s + '</strong>' : s);
  const esc = (s) => (asHtml ? escapeHtml(s) : s);

  let visitPart;
  if (d.kpi.confirmed > 0) {
    visitPart = m + '에는 ' + strong(d.kpi.confirmed + '건의 방문') +
                '(총 ' + strong(d.kpi.visitors + '명') + ')이 진행되었습니다.';
  } else {
    visitPart = m + '에는 확정된 방문이 없었습니다.';
  }

  let roiPart = '';
  if (d.roiLatest) {
    const o = d.roiLatest.outputs || {};
    const roi5 = Number(o.roi5);
    const bep = o.bepText;
    if (isFinite(roi5)) {
      const sign = roi5 >= 0 ? '+' : '';
      const roi5Txt = sign + roi5.toFixed(1) + '%';
      roiPart = bep
        ? ' 최신 시나리오 기준 5년 누적 ROI는 ' + strong(roi5Txt) + ', 회수 기간은 ' + strong(esc(bep)) + '입니다.'
        : ' 최신 시나리오 기준 5년 누적 ROI는 ' + strong(roi5Txt) + '입니다.';
    }
  }

  if (d.kpi.confirmed === 0 && !roiPart) {
    return m + '에는 ThinQ Real 운영 활동이 기록되지 않았습니다.';
  }
  return visitPart + roiPart;
}

// ── 텍스트 빌더 ────────────────────────────
export function buildMonthlyReportText(d) {
  const L = [];
  const BAR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  L.push(`ThinQ Real ${d.year}년 ${d.monthNum}월 운영 리포트`);
  L.push('');
  L.push('이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.');
  L.push('');
  L.push(BAR); L.push('▶ 요약'); L.push(BAR);
  L.push('   ' + buildExecSummary(d, false));
  L.push('');
  L.push(BAR); L.push('📊 핵심 지표'); L.push('   이번 달 운영 성과의 핵심 지표'); L.push(BAR);
  L.push(`   확정 방문        ${d.kpi.confirmed}건`);
  L.push(`   총 방문 인원     ${d.kpi.visitors}명`);
  L.push('');

  L.push(BAR); L.push('🎯 방문 목적별 분포'); L.push('   확정된 방문이 어떤 목적으로 진행되었는지의 비중'); L.push(BAR);
  const sorted = Object.keys(d.purposeCounts).map((k) => [k, d.purposeCounts[k]]).sort((a, b) => b[1] - a[1]);
  const tot = sorted.reduce((s, [, v]) => s + v, 0);
  if (!sorted.length) L.push('   (해당 없음)');
  else sorted.forEach(([k, v]) => {
    const pct = tot ? Math.round((v / tot) * 100) : 0;
    L.push(`   ${k}  —  ${v}건 (${pct}%)`);
  });
  L.push('');

  // 임원 가독성: 핵심 이력(B2B 영업·홍보)만 상세, 나머지는 건수 요약 (2026-07-05 결정)
  const keyVisitsT = d.confirmed.filter((b) => /(B2B|홍보)/.test(String(b.purpose || '')));
  const otherCountT = d.confirmed.length - keyVisitsT.length;
  L.push(BAR); L.push('📅 방문 이력');
  L.push(`   이번 달 확정 방문 중 핵심 이력(B2B 영업 · 홍보) ${keyVisitsT.length}건`);
  L.push(BAR);
  if (!keyVisitsT.length) {
    L.push('   (이번 달 B2B 영업·홍보 방문 없음' + (otherCountT ? ` — 그 외 목적 ${otherCountT}건` : '') + ')');
  } else {
    [['B2B 영업', /B2B/], ['홍보 (프레스투어/마케팅)', /홍보/]].forEach((pair) => {
      const rows = keyVisitsT.filter((b) => pair[1].test(String(b.purpose || '')));
      if (!rows.length) return;
      L.push(`   ■ ${pair[0]}  —  ${rows.length}건`);
      rows.forEach((b) => {
        // b2b는 subject=clientCompany로 저장되므로 중복 제거 후 표시
        const subj = [...new Set([b.subject, b.clientCompany].filter(Boolean))].join(' · ');
        L.push(`     ${b.date}  ·  ${subj || '-'}`);
      });
      L.push('');
    });
    if (otherCountT) {
      L.push(`   ※ 그 외 목적(R&D·콘텐츠 제작·내부 커뮤니케이션 등) ${otherCountT}건은 생략`);
      L.push('     (전체 내역은 관리자 페이지에서 확인 가능)');
    }
  }

  // 설문·성과 지표 (Phase 5)
  if (d.survey) {
    const s = d.survey;
    L.push(BAR);
    L.push('📋 설문·성과 지표');
    L.push('   방문 후기 설문 기반 지표 (확정 산입액 = 이번 달 대장 확정 합계)');
    L.push(BAR);
    L.push(`   설문 응답        ${s.count}건 (영업 ${s.tracks.sales} · 콘텐츠 ${s.tracks.media} · 기타 ${s.tracks.etc})`);
    L.push(`   재방문 응답률    ${s.revisitPct == null ? '—' : s.revisitPct + '%'}`);
    L.push(`   성과 추적 대장   신규 ${s.ledgerNew}건 · 확정 ${s.ledgerConfirmed}건 · 드롭 ${s.ledgerDropped}건`);
    L.push(`   월 확정 산입액   ${Number(s.confirmedSum).toLocaleString()}만원`);
    L.push(`   IoT 이슈 등록    ${s.issueCount}건`);
    L.push('');
  }

  L.push(BAR);
  L.push(`💰 ${d.monthNum}월 ROI 누적 분석 결과`);
  L.push('   저장된 시나리오 기반의 실시간 산출 결과');
  L.push('   (영업 지원·기여 영업 이익은 실제 영업 진행에 따라 매월 갱신됨)');
  L.push(BAR);
  if (!d.roiLatest) {
    L.push('   (저장된 ROI 시나리오가 없습니다)');
  } else {
    const o = d.roiLatest.outputs || {};
    const annualValue = Number(o.annualValue) || 0;
    if (annualValue) L.push(`   연간 창출 가치    ${fmtKRWReport(annualValue)}`);
    if (o.bepText) L.push(`   회수 기간 (BEP)   ${o.bepText}`);
    else if (isFinite(o.bepYears)) L.push(`   회수 기간 (BEP)   ${Number(o.bepYears).toFixed(2)}년`);
    if (isFinite(o.roi3)) L.push(`   3년 누적 ROI      ${(o.roi3 >= 0 ? '+' : '') + Number(o.roi3).toFixed(1)}%  (${fmtKRWReport(o.profit3 || 0)})`);
    if (isFinite(o.roi5)) L.push(`   5년 누적 ROI      ${(o.roi5 >= 0 ? '+' : '') + Number(o.roi5).toFixed(1)}%  (${fmtKRWReport(o.profit5 || 0)})`);
    L.push('');
    L.push(`   기준 시나리오: ${prettyRoiLabel(d.roiLatest.label)}` + (d.roiLatest.author ? ` · 작성자 ${d.roiLatest.author}` : ''));
  }

  L.push(BAR);
  L.push('📰 관련 기사');
  L.push(d.articles.source === 'manual'
    ? '   담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : '   Google 검색 결과 기준의 최근 1개월 ThinQ Real 관련 보도');
  L.push(BAR);
  if (!d.articles.items.length) {
    L.push('   (' + (d.articles.skipReason || '검색 결과 없음') + ')');
  } else {
    d.articles.items.forEach((it) => {
      L.push(`   • ${it.title}`);
      if (it.source || it.publishedAt) L.push(`     ${[it.source, it.publishedAt].filter(Boolean).join(' · ')}`);
      if (it.snippet) L.push(`     ${it.snippet}`);
      L.push(`     ${it.link}`);
      L.push('');
    });
  }

  L.push('');
  L.push('감사합니다.');
  L.push('HS플랫폼사업센터 AI홈솔루션엔지니어링팀');
  return L.join('\n');
}

// ── HTML 빌더 ──────────────────────────────
// chartSrc(name): 'purpose' | 'roiValue' | 'cumulative' → <img src> 값 (cid:/data:) 또는 null
export function buildMonthlyReportHtml(d, chartSrc = () => null) {
  const execSummaryRow =
    '<tr><td style="padding:18px 28px 0;">' +
      '<div style="background:#f5f7f4;border-left:4px solid #3a5035;padding:18px 22px;border-radius:0 6px 6px 0;">' +
        '<div style="font-size:11px;font-weight:600;color:#3a5035;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">요약</div>' +
        '<div style="font-size:15px;color:#1d1d1f;line-height:1.75;">' + buildExecSummary(d, true) + '</div>' +
      '</div>' +
    '</td></tr>';

  const sectionHeader = (icon, title, description) =>
    '<tr><td style="padding:32px 28px 6px;">' +
      '<div style="font-size:20px;font-weight:700;color:#1d1d1f;line-height:1.3;">' + icon + '&nbsp;&nbsp;' + escapeHtml(title) + '</div>' +
      (description ? '<div style="font-size:13.5px;color:#6e6e73;margin-top:8px;line-height:1.55;">' + escapeHtml(description) + '</div>' : '') +
    '</td></tr>';

  // ── 1) 핵심 지표 ──
  const kpiCell = (label, value, unit, accent) =>
    '<td valign="top" align="center" style="padding:18px 10px;background:#f5f5f7;border-radius:10px;">' +
      '<div style="line-height:1.1;">' +
        '<span style="font-size:22px;font-weight:700;color:' + (accent || '#1d1d1f') + ';">' + escapeHtml(String(value)) + '</span>' +
        '<span style="font-size:13px;font-weight:500;color:' + (accent || '#1d1d1f') + ';margin-left:4px;">' + escapeHtml(unit) + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:#6e6e73;margin-top:8px;font-weight:500;">' + escapeHtml(label) + '</div>' +
    '</td>';

  const kpiTable =
    '<tr><td style="padding:0 28px 16px;">' +
      '<table role="presentation" cellspacing="14" cellpadding="0" border="0" style="border-collapse:separate;width:100%;">' +
        '<tr>' + kpiCell('확정 방문', d.kpi.confirmed, '건', '#3a5035') + kpiCell('총 방문 인원', d.kpi.visitors, '명', '#3a5035') + '</tr>' +
      '</table>' +
    '</td></tr>';

  // ── 2) 방문 목적별 분포 (도넛 — 서버 렌더링 이미지) ──
  let purposeBody;
  const purposeTotal = Object.keys(d.purposeCounts).reduce((s, k) => s + (d.purposeCounts[k] || 0), 0);
  if (purposeTotal === 0) {
    purposeBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">해당 없음</div>';
  } else {
    const src = chartSrc('purpose');
    const img = src
      ? '<div style="text-align:center;"><img src="' + escapeHtml(src) + '" alt="방문 목적별 분포" width="480" style="max-width:100%;width:480px;height:auto;display:inline-block;" /></div>'
      : buildPurposeFallbackBars(d.purposeCounts);
    purposeBody = img +
      '<div style="font-size:13px;color:#6e6e73;text-align:center;margin-top:6px;">총 ' + purposeTotal + '건 (확정 기준)</div>';
  }

  // ── 3) 방문 이력 (핵심 이력만 — B2B 영업·홍보) ──
  const keyVisits = d.confirmed.filter((b) => /(B2B|홍보)/.test(String(b.purpose || '')));
  const otherCount = d.confirmed.length - keyVisits.length;
  let visitsBody;
  if (!keyVisits.length) {
    visitsBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">이번 달 B2B 영업·홍보 방문 없음' +
      (otherCount ? ' <span style="font-size:12px;">(그 외 목적 ' + otherCount + '건)</span>' : '') + '</div>';
  } else {
    const th = (txt) => '<th align="left" style="font-size:12px;color:#6e6e73;font-weight:600;letter-spacing:0.04em;padding:10px 12px;border-bottom:1px solid #e0e0e0;background:#fafafa;">' + escapeHtml(txt) + '</th>';
    const td = (html, opts) => '<td style="padding:12px;font-size:14px;color:#1d1d1f;border-bottom:1px solid #f2f2f2;vertical-align:top;line-height:1.5;' + ((opts && opts.nowrap) ? 'white-space:nowrap;' : '') + '">' + html + '</td>';
    const visitGroups = [
      { label: 'B2B 영업', re: /B2B/, col: '고객사' },
      { label: '홍보 (프레스투어/마케팅)', re: /홍보/, col: '행사명' },
    ];
    visitsBody = visitGroups.map((g, gi) => {
      const rows = keyVisits.filter((b) => g.re.test(String(b.purpose || '')));
      if (!rows.length) return '';
      const color = PURPOSE_COLORS[g.label] || '#8fa889';
      return (
        '<div style="margin:' + (gi === 0 ? '2px' : '18px') + ' 0 6px;font-size:14px;font-weight:600;color:#1d1d1f;">' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:7px;"></span>' +
          escapeHtml(g.label) +
          ' <span style="color:#8e8e93;font-weight:500;font-size:13px;">· ' + rows.length + '건</span>' +
        '</div>' +
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
          '<thead><tr>' + th('일자') + th(g.col) + '</tr></thead>' +
          '<tbody>' +
            rows.map((b) => {
              const subj = [...new Set([b.subject, b.clientCompany].filter(Boolean))].map(escapeHtml).join(' · ');
              return '<tr>' + td(escapeHtml(b.date), { nowrap: true }) + td(subj || '<span style="color:#aeaeb2;">-</span>') + '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>'
      );
    }).join('') +
    (otherCount
      ? '<div style="font-size:12px;color:#aeaeb2;margin-top:10px;">그 외 목적(R&amp;D · 콘텐츠 제작 · 내부 커뮤니케이션 등) ' + otherCount + '건은 생략 — 전체 내역은 관리자 페이지에서 확인할 수 있습니다.</div>'
      : '');
  }

  // ── 4) ROI 누적 분석 결과 ──
  let roiBody;
  if (!d.roiLatest) {
    roiBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">저장된 ROI 시나리오가 없습니다. ROI 분석 툴에서 시나리오를 저장하면 다음 리포트부터 본 섹션에 분석 결과가 표시됩니다.</div>';
  } else {
    const o = d.roiLatest.outputs || {};
    const annualValue = Number(o.annualValue) || 0;
    const roi3 = Number(o.roi3);
    const profit3 = Number(o.profit3);

    const roiKpi = (label, value, sub, color) =>
      '<td valign="top" align="center" style="padding:18px 10px;background:#f5f5f7;border-radius:10px;">' +
        '<div style="font-size:22px;font-weight:700;color:' + (color || '#3a5035') + ';line-height:1.1;">' + escapeHtml(value) + '</div>' +
        (sub ? '<div style="font-size:11px;color:#6e6e73;margin-top:4px;">' + escapeHtml(sub) + '</div>' : '') +
        '<div style="font-size:12px;color:#6e6e73;margin-top:8px;font-weight:500;">' + escapeHtml(label) + '</div>' +
      '</td>';
    const bepDisplay = o.bepText || (isFinite(o.bepYears) ? Number(o.bepYears).toFixed(2) + '년' : '—');
    const roi3Display = isFinite(roi3) ? ((roi3 >= 0 ? '+' : '') + roi3.toFixed(1) + '%') : '—';
    const roi5Display = isFinite(o.roi5) ? ((Number(o.roi5) >= 0 ? '+' : '') + Number(o.roi5).toFixed(1) + '%') : '—';
    const roiKpiTable =
      '<table role="presentation" cellspacing="10" cellpadding="0" border="0" style="border-collapse:separate;width:100%;">' +
        '<tr>' +
          roiKpi('연간 창출 가치', fmtKRWReport(annualValue), null, '#3a5035') +
          roiKpi('회수 기간 (BEP)', bepDisplay, null, '#3a5035') +
          roiKpi('3년 누적 ROI', roi3Display, isFinite(profit3) ? fmtKRWReport(profit3) : null, '#3a5035') +
          roiKpi('5년 누적 ROI', roi5Display, isFinite(o.profit5) ? fmtKRWReport(Number(o.profit5)) : null, '#3a5035') +
        '</tr>' +
      '</table>';

    const vSrc = chartSrc('roiValue');
    const valueCompChart = vSrc
      ? '<img src="' + escapeHtml(vSrc) + '" alt="가치 항목별 비중" width="480" style="max-width:100%;width:480px;height:auto;display:block;margin:0 auto;" />'
      : '';
    const cSrc = chartSrc('cumulative');
    const cumChart = cSrc
      ? '<img src="' + escapeHtml(cSrc) + '" alt="연도별 누적 손익" width="620" style="max-width:100%;width:620px;height:auto;display:block;margin:0 auto;" />'
      : '';

    const scenarioLabel = prettyRoiLabel(d.roiLatest.label) +
      (d.roiLatest.author ? ' · 작성자 ' + escapeHtml(String(d.roiLatest.author)) : '');

    roiBody =
      roiKpiTable +
      (valueCompChart
        ? '<div style="margin-top:24px;">' +
            '<div style="font-size:14px;font-weight:600;color:#1d1d1f;">가치 항목별 비중</div>' +
            '<div style="font-size:12.5px;color:#6e6e73;margin-top:4px;">연간 창출 가치가 어떤 항목에서 얼마만큼 나오는지를 보여줍니다.</div>' +
          '</div>' +
          '<div style="margin-top:10px;">' + valueCompChart + '</div>'
        : '') +
      (cumChart
        ? '<div style="margin-top:24px;">' +
            '<div style="font-size:14px;font-weight:600;color:#1d1d1f;">연도별 누적 손익</div>' +
            '<div style="font-size:12.5px;color:#6e6e73;margin-top:4px;">투자 시점부터 5년간 누적 손익 추이입니다. 점선과 만나는 시점이 손익분기점(BEP)입니다.</div>' +
          '</div>' +
          '<div style="margin-top:10px;">' + cumChart + '</div>'
        : '') +
      '<div style="margin-top:16px;font-size:12px;color:#aeaeb2;text-align:right;">기준 시나리오: ' + scenarioLabel + '</div>';
  }

  // ── 5) 기사 ──
  let articlesBody;
  if (!d.articles.items.length) {
    articlesBody = '<div style="font-size:13px;color:#aeaeb2;">' + escapeHtml(d.articles.skipReason || '검색 결과 없음') + '</div>';
  } else {
    const THUMB_LIMIT = 5; // 상위 N건만 썸네일 카드 (보도자료 사진 중복 방지·시선 집중)
    articlesBody = d.articles.items.map((it, idx) => {
      const meta = [it.source, it.publishedAt].filter(Boolean).map(escapeHtml).join(' · ');
      const snippetDisplay = truncate(it.snippet, 120);
      const textCell =
        '<a href="' + escapeHtml(it.link) + '" target="_blank" rel="noopener" style="font-size:14px;color:#3a5035;text-decoration:underline;font-weight:600;">' + escapeHtml(it.title) + '</a>' +
        (meta ? '<div style="font-size:11px;color:#aeaeb2;margin-top:2px;">' + meta + '</div>' : '') +
        (snippetDisplay ? '<div style="font-size:13px;color:#3a3a3c;margin-top:4px;line-height:1.5;">' + escapeHtml(snippetDisplay) + '</div>' : '');
      if (it.thumbnail && idx < THUMB_LIMIT) {
        return (
          '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;padding:12px 0;border-bottom:1px solid #f2f2f2;">' +
            '<tr>' +
              '<td valign="top" style="width:120px;padding-right:14px;">' +
                '<a href="' + escapeHtml(it.link) + '" target="_blank" rel="noopener" style="text-decoration:none;display:block;">' +
                  '<img src="' + escapeHtml(it.thumbnail) + '" alt="" width="120" style="width:120px;height:80px;object-fit:cover;border-radius:6px;border:0;display:block;" />' +
                '</a>' +
              '</td>' +
              '<td valign="top">' + textCell + '</td>' +
            '</tr>' +
          '</table>'
        );
      }
      return '<div style="padding:12px 0;border-bottom:1px solid #f2f2f2;">' + textCell + '</div>';
    }).join('');
  }

  // ── 5.5) 설문·성과 지표 (Phase 5 — 방문 후기 설문 파이프라인 월간 집계) ──
  const chip = (label, value) =>
    '<span style="display:inline-block;margin:0 8px 6px 0;padding:5px 10px;background:#f5f5f7;border-radius:999px;font-size:12px;color:#1d1d1f;">' +
      '<span style="color:#6e6e73;">' + escapeHtml(label) + '</span>&nbsp;<strong>' + escapeHtml(String(value)) + '</strong>' +
    '</span>';
  let surveyKpiRow = '', surveyChipsRow = '';
  if (d.survey) {
    const s = d.survey;
    surveyKpiRow =
      '<tr><td style="padding:0 28px 8px;">' +
        '<table role="presentation" cellspacing="14" cellpadding="0" border="0" style="border-collapse:separate;width:100%;">' +
          '<tr>' +
            kpiCell('설문 응답', s.count, '건', '#3a5035') +
            kpiCell('재방문 응답률', s.revisitPct == null ? '—' : s.revisitPct, s.revisitPct == null ? '' : '%', '#3a5035') +
            kpiCell('월 확정 산입액', Number(s.confirmedSum).toLocaleString(), '만원', '#3a5035') +
            kpiCell('IoT 이슈 등록', s.issueCount, '건', '#3a5035') +
          '</tr>' +
        '</table>' +
      '</td></tr>';
    surveyChipsRow =
      '<tr><td style="padding:0 28px 16px;">' +
        chip('트랙 분포', '영업 ' + s.tracks.sales + ' · 콘텐츠 ' + s.tracks.media + ' · 기타 ' + s.tracks.etc) +
        chip('성과 대장', '신규 ' + s.ledgerNew + ' · 확정 ' + s.ledgerConfirmed + ' · 드롭 ' + s.ledgerDropped) +
      '</td></tr>';
  }

  const descKpi = '이번 달 운영 성과의 핵심 지표';
  const descPurpose = '확정된 방문이 어떤 목적으로 진행되었는지의 비중';
  const descVisits = '이번 달 확정 방문 중 핵심 이력(B2B 영업 · 홍보) ' + keyVisits.length + '건의 일자별 상세';
  const descRoi = '저장된 시나리오 기반의 실시간 산출 결과입니다. ' +
                  '특히 영업 지원 · 기여 영업 이익은 실제 영업 진행 상황에 따라 매월 갱신되므로, ' +
                  '본 수치는 작성 시점의 시나리오를 기준으로 한 추정치입니다.';
  const descArticles = d.articles.source === 'manual'
    ? '담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : 'Google 검색 결과 기준의 최근 1개월 ThinQ Real 관련 보도';
  const descSurvey = '방문 후기 설문 기반 지표 — 월 확정 산입액은 성과 추적 대장에서 이번 달 확정 처리된 금액의 합계입니다.';

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:760px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:28px 28px 24px;">' +
          '<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.75;">ThinQ Real</div>' +
          '<div style="font-size:24px;font-weight:700;margin-top:6px;">' + escapeHtml(d.year + '년 ' + d.monthNum + '월 운영 리포트') + '</div>' +
          '<div style="font-size:14px;opacity:0.88;margin-top:8px;line-height:1.55;">이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.</div>' +
        '</td></tr>' +
        execSummaryRow +
        sectionHeader('📊', '핵심 지표', descKpi) +
        kpiTable +
        sectionHeader('🎯', '방문 목적별 분포', descPurpose) +
        '<tr><td style="padding:0 28px 16px;">' + purposeBody + '</td></tr>' +
        sectionHeader('📅', '방문 이력', descVisits) +
        '<tr><td style="padding:0 28px 16px;">' + visitsBody + '</td></tr>' +
        (d.survey ? sectionHeader('📋', '설문·성과 지표', descSurvey) + surveyKpiRow + surveyChipsRow : '') +
        sectionHeader('💰', d.monthNum + '월 ROI 누적 분석 결과', descRoi) +
        '<tr><td style="padding:0 28px 16px;">' + roiBody + '</td></tr>' +
        sectionHeader('📰', '관련 기사', descArticles) +
        '<tr><td style="padding:0 28px 24px;">' + articlesBody + '</td></tr>' +
        '<tr><td style="padding:28px;border-top:1px solid #eeeeee;font-size:15px;color:#3a3a3c;line-height:1.65;">' +
          '<div style="font-weight:600;color:#1d1d1f;margin-bottom:4px;">감사합니다.</div>' +
          '<div style="color:#6e6e73;">HS플랫폼사업센터 AI홈솔루션엔지니어링팀</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}

// 차트 렌더러가 없을 때의 폴백 — 목적별 분포를 HTML 가로 막대로 (메일에서도 안전)
function buildPurposeFallbackBars(purposeCounts) {
  const entries = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1]);
  const tot = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return '<div>' + entries.map(([k, v]) => {
    const pct = Math.round((v / tot) * 100);
    const color = PURPOSE_COLORS[k] || '#5e7858';
    return (
      '<div style="margin:6px 0;font-size:13px;color:#1d1d1f;">' +
        escapeHtml(k) + ' <span style="color:#6e6e73;">· ' + v + '건 (' + pct + '%)</span>' +
        '<div style="background:#f2f2f2;border-radius:4px;height:8px;margin-top:3px;">' +
          '<div style="background:' + color + ';border-radius:4px;height:8px;width:' + pct + '%;"></div>' +
        '</div>' +
      '</div>'
    );
  }).join('') + '</div>';
}
