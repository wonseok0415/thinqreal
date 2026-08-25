// 월간 운영 리포트 본문 빌더 — .gs buildMonthlyReportText/Html 이식 (§8-7 개편판, 2026-08).
// 구성: Executive 요약(당월+YTD+NPS) → 사업부별 현황 → 인사이트/한마디 → 목적 분포(도넛) →
//       관련 기사(수동+자동 병합, 상한 5) → ROI 확정 기준 수치(+pin) → 푸터.
// 차트는 QuickChart URL 대신 서버 렌더링 이미지 참조(chartSrc 리졸버):
//   메일 = cid: 첨부 / 브라우저 미리보기 = data: URI. (decisions §2-⑦ — 외부 유출 0)
//   렌더 실패(chartSrc가 null) 시 막대 폴백 — 분포는 항상 표시.
import { escapeHtml, truncate } from '../../lib/html.js';
import { PURPOSE_COLORS, ROI_FIXED, MONTHLY_REPORT_QUERY } from '../../lib/constants.js';
import { satDisplay } from '../../report/collect.js';

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

// **굵게** 마크다운을 <strong>으로 — 인사이트·한마디 강조용 (escapeHtml 이후 적용 전제)
export function mdBold(escapedText) {
  return String(escapedText).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// 목적별 분포 목록 — 도넛 범례·막대 폴백이 공유하는 단일 소스 (건수 내림차순, 0건 제외)
export function purposeDist(d) {
  const total = Object.keys(d.purposeCounts).reduce((s, k) => s + (d.purposeCounts[k] || 0), 0);
  if (!total) return [];
  return Object.keys(d.purposeCounts).map((k) => [k, d.purposeCounts[k] || 0])
    .filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1])
    .map((p) => ({
      label: p[0], count: p[1], pct: Math.round((p[1] / total) * 100),
      color: PURPOSE_COLORS[p[0]] || '#5e7858',
    }));
}

// ── 텍스트 빌더 ────────────────────────────
export function buildMonthlyReportText(d) {
  const L = [];
  const bar = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  L.push(`ThinQ Real ${d.year}년 ${d.monthNum}월 운영 리포트`);
  L.push('');
  L.push('이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.');
  L.push('');
  L.push(bar);
  L.push('📊 Executive 요약');
  L.push(bar);
  L.push(`   당월 방문 건수   ${d.kpi.confirmed}건` + (d.ytd ? `  (26년 누적 ${d.ytd.confirmed}건)` : ''));
  L.push(`   당월 방문 인원   ${d.kpi.visitors}명` + (d.ytd ? `  (26년 누적 ${d.ytd.visitors}명)` : ''));
  L.push(`   만족도(NPS)      ${d.survey ? satDisplay(d.survey.satAll) : '—'}`);
  L.push('');

  if (d.divisions && d.divisions.length) {
    L.push(bar);
    L.push('🏢 사업부별 활용 현황');
    L.push('   확정 방문 기준 본부별 건수·인원');
    L.push(bar);
    const top = d.divisions.reduce((a, c) => (c.count > (a ? a.count : 0) ? c : a), null);
    d.divisions.forEach((dv) => {
      const mark = (top && top.count > 0 && dv.name === top.name) ? ' ★' : '';
      L.push(`   ${dv.name}  —  ${dv.count}건 · ${dv.people}명${mark}`);
    });
    L.push('');
  }

  if (d.insights && d.insights.length) {
    L.push(bar);
    L.push('💡 핵심 인사이트');
    L.push(bar);
    d.insights.forEach((t) => L.push('   • ' + String(t).replace(/\*\*/g, '')));
    L.push('');
  }

  if (d.quotes && d.quotes.length) {
    L.push(bar);
    L.push('💬 인상 깊은 한마디');
    L.push(bar);
    d.quotes.forEach((q) => {
      L.push('   "' + String(q.text).replace(/\*\*/g, '') + '"');
      const label = q.source === '방문자' ? '방문자 (익명)' : (q.source && q.source !== '인솔자' ? q.source : '');
      if (label) L.push('     — ' + label);
      L.push('');
    });
  }

  L.push(bar);
  L.push('🎯 방문 목적별 분포');
  L.push('   확정된 방문이 어떤 목적으로 진행되었는지의 비중');
  L.push(bar);
  const sorted = Object.keys(d.purposeCounts).map((k) => [k, d.purposeCounts[k]])
    .sort((a, b) => b[1] - a[1]);
  const tot = sorted.reduce((s, [, v]) => s + v, 0);
  if (!sorted.length) L.push('   (해당 없음)');
  else sorted.forEach(([k, v]) => {
    const pct = tot ? Math.round((v / tot) * 100) : 0;
    L.push(`   ${k}  —  ${v}건 (${pct}%)`);
  });
  L.push('');

  L.push(bar);
  L.push('📰 관련 기사');
  L.push(d.articles.source === 'manual'
    ? '   담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : d.articles.source === 'mixed'
      ? '   담당자 큐레이션 ' + d.articles.manualCount + '건 + "' + MONTHLY_REPORT_QUERY + '" 자동 수집 ' + d.articles.autoCount + '건'
      : '   "' + MONTHLY_REPORT_QUERY + '" 키워드로 자동 수집한 최근 1개월 언론 보도 (AI홈 시장 동향 포함)');
  L.push(bar);
  if (!d.articles.items.length) {
    L.push('   (' + (d.articles.skipReason || '검색 결과 없음') + ')');
  } else {
    d.articles.items.forEach((it) => {
      L.push(`   • ${it.title}`);
      if (it.source || it.publishedAt) {
        const meta = [it.source, it.publishedAt].filter(Boolean).join(' · ');
        L.push(`     ${meta}`);
      }
      if (it.snippet) L.push(`     ${it.snippet}`);
      L.push(`     ${it.link}`);
      L.push('');
    });
  }

  // ROI — 최하단, 확정 기준 수치 (§8-7 8. 그래프·저장 시나리오 의존 폐기, pin 지정 시만 동적)
  const rf = d.roiFixed || ROI_FIXED;
  L.push(bar);
  L.push('💰 투자 대비 성과 (ROI) — 확정 기준');
  L.push(bar);
  L.push(`   총 투자 ${rf.totalCost} (구축 ${rf.capex} + 운영 ${rf.opexYr})`);
  L.push(`   BEP ${rf.bep} · 3년 ROI ${rf.roi3} · 5년 ROI ${rf.roi5}`);
  if (rf.basis) L.push(`   ${rf.basis}`);
  L.push('');
  L.push('');
  L.push('감사합니다.');
  L.push('HS플랫폼사업센터 AI홈솔루션엔지니어링팀');
  return L.join('\n');
}

// ── HTML 빌더 ──────────────────────────────
// chartSrc(name): 'purpose' → 이미지 src (cid:/data:) 또는 null(막대 폴백)
export function buildMonthlyReportHtml(d, chartSrc = () => null) {
  const sectionHeader = (icon, title, description) =>
    '<tr><td style="padding:32px 28px 6px;">' +
      '<div style="font-size:20px;font-weight:700;color:#1d1d1f;line-height:1.3;">' + icon + '&nbsp;&nbsp;' + escapeHtml(title) + '</div>' +
      (description ? '<div style="font-size:13.5px;color:#6e6e73;margin-top:8px;line-height:1.55;">' + escapeHtml(description) + '</div>' : '') +
    '</td></tr>';

  // ── 1) Executive 요약 — KPI 3카드 (당월 건수·인원 + 26년 누적 / NPS)
  const execCell = (label, value, unit, sub) =>
    '<td valign="top" align="center" style="padding:16px 8px;background:#f5f5f7;border-radius:10px;">' +
      '<div style="font-size:12px;color:#6e6e73;font-weight:500;">' + escapeHtml(label) + '</div>' +
      '<div style="line-height:1.1;margin-top:7px;">' +
        '<span style="font-size:21px;font-weight:700;color:#3a5035;">' + escapeHtml(String(value)) + '</span>' +
        (unit ? '<span style="font-size:12px;font-weight:500;color:#3a5035;margin-left:3px;">' + escapeHtml(unit) + '</span>' : '') +
      '</div>' +
      (sub ? '<div style="font-size:11px;color:#6e6e73;margin-top:6px;line-height:1.4;">' + escapeHtml(sub) + '</div>' : '') +
    '</td>';
  // 만족도 카드 — NPS(-100~+100)는 부호 병기가 관례라 양수도 '+' 표기. 구 척도만 있는 월은 라벨 자체를 전환
  const satAll = d.survey ? d.survey.satAll : null;
  let satCardValue = '—', satCardUnit = '', satCardSub = '', satCardLabel = 'NPS (추천 지수)';
  if (satAll && satAll.newCount) {
    satCardValue = (satAll.nps >= 0 ? '+' : '') + satAll.nps;
    satCardSub = '평균 ' + satAll.newAvg.toFixed(1) + '/10 · ' + satAll.newCount + '건' + (satAll.newCount < 10 ? ' (참고치)' : '');
  } else if (satAll && satAll.oldCount) {
    satCardValue = satAll.oldAvg.toFixed(1);
    satCardUnit = '/5';
    satCardLabel = '만족도 (구 척도)';
    satCardSub = '응답 ' + satAll.oldCount + '건';
  }
  const rfx = d.roiFixed || ROI_FIXED;
  const kpiTable =
    '<tr><td style="padding:0 28px 16px;">' +
      '<table role="presentation" cellspacing="10" cellpadding="0" border="0" style="border-collapse:separate;width:100%;">' +
        '<tr>' +
          execCell('당월 방문 건수', d.kpi.confirmed, '건', d.ytd ? '26년 누적 ' + d.ytd.confirmed + '건' : '') +
          execCell('당월 방문 인원', d.kpi.visitors, '명', d.ytd ? '26년 누적 ' + d.ytd.visitors + '명' : '') +
          execCell(satCardLabel, satCardValue, satCardUnit, satCardSub) +
        '</tr>' +
      '</table>' +
    '</td></tr>';

  // ── 2) 사업부별 활용 현황 — 확정 기준, 건수 있는 본부만 표시, 상위 본부 강조 ──
  let divisionsRow = '';
  if (d.divisions && d.divisions.length) {
    const top = d.divisions.reduce((a, c) => (c.count > (a ? a.count : 0) ? c : a), null);
    const divRows = d.divisions.map((dv) => {
      const isTop = top && top.count > 0 && dv.name === top.name;
      return '<tr>' +
        '<td style="padding:9px 12px;font-size:13.5px;color:#1d1d1f;border-bottom:1px solid #f2f2f2;' + (isTop ? 'font-weight:700;' : '') + '">' +
          (isTop ? '★ ' : '') + escapeHtml(dv.name) + '</td>' +
        '<td align="right" style="padding:9px 12px;font-size:13.5px;color:' + (dv.count ? '#1d1d1f' : '#aeaeb2') + ';border-bottom:1px solid #f2f2f2;' + (isTop ? 'font-weight:700;' : '') + '">' +
          dv.count + '건</td>' +
        '<td align="right" style="padding:9px 12px;font-size:13.5px;color:' + (dv.people ? '#1d1d1f' : '#aeaeb2') + ';border-bottom:1px solid #f2f2f2;' + (isTop ? 'font-weight:700;' : '') + '">' +
          dv.people + '명</td>' +
      '</tr>';
    }).join('');
    divisionsRow =
      '<tr><td style="padding:0 28px 16px;">' +
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
          '<thead><tr>' +
            '<th align="left" style="font-size:12px;color:#6e6e73;font-weight:600;padding:8px 12px;border-bottom:1px solid #e0e0e0;background:#fafafa;">본부</th>' +
            '<th align="right" style="font-size:12px;color:#6e6e73;font-weight:600;padding:8px 12px;border-bottom:1px solid #e0e0e0;background:#fafafa;">건수</th>' +
            '<th align="right" style="font-size:12px;color:#6e6e73;font-weight:600;padding:8px 12px;border-bottom:1px solid #e0e0e0;background:#fafafa;">인원</th>' +
          '</tr></thead><tbody>' + divRows + '</tbody>' +
        '</table>' +
      '</td></tr>';
  }

  // ── 3) 핵심 인사이트 · 인상 깊은 한마디 (§8-7 5·6) — 큐레이션 없으면 블록 전체 생략 ──
  let insightsRow = '';
  if (d.insights && d.insights.length) {
    insightsRow =
      '<tr><td style="padding:0 28px 16px;">' +
        d.insights.map((t) =>
          '<div style="padding:10px 14px;margin-bottom:8px;background:#f5f7f4;border-left:3px solid #3a5035;border-radius:0 6px 6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">' +
            mdBold(escapeHtml(t)) + '</div>').join('') +
      '</td></tr>';
  }
  let quotesRow = '';
  if (d.quotes && d.quotes.length) {
    quotesRow =
      '<tr><td style="padding:0 28px 16px;">' +
        d.quotes.map((q) => {
          // 출처: 방문자→익명 표기, 사업부/부서→그대로. 구 '인솔자' 저장분은 라벨 생략 (2026-08-04 팀장 리뷰)
          const label = q.source === '방문자' ? '방문자 (익명)' : (q.source && q.source !== '인솔자' ? q.source : '');
          return '<div style="padding:12px 17px;margin-bottom:8px;background:#fdf9f2;border-radius:8px;">' +
            '<div style="font-size:14px;color:#1d1d1f;line-height:1.6;">&ldquo;' + mdBold(escapeHtml(q.text)) + '&rdquo;</div>' +
            (label ? '<div style="font-size:12px;color:#8e8e93;margin-top:6px;">— ' + escapeHtml(label) + '</div>' : '') +
          '</div>';
        }).join('') +
      '</td></tr>';
  }

  // ── 4) 방문 목적별 분포 — 도넛(내부 렌더링) 또는 막대 폴백 ──
  let purposeBody;
  const purposeTotal = Object.keys(d.purposeCounts).reduce((s, k) => s + (d.purposeCounts[k] || 0), 0);
  const donutSrc = purposeTotal > 0 ? chartSrc('purpose') : null;
  if (purposeTotal === 0) {
    purposeBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">해당 없음</div>';
  } else if (donutSrc) {
    const dist = purposeDist(d);
    const legend = dist.map((x) =>
      '<span style="display:inline-block;margin:3px 9px;font-size:12.5px;color:#3a3a3c;white-space:nowrap;">' +
        '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + x.color + ';margin-right:5px;"></span>' +
        escapeHtml(x.label) + ' <strong>' + x.count + '건</strong> <span style="color:#8e8e93;">(' + x.pct + '%)</span>' +
      '</span>').join('');
    purposeBody =
      '<div style="text-align:center;">' +
        '<img src="' + donutSrc + '" width="180" alt="방문 목적별 분포" style="width:180px;height:auto;display:inline-block;" />' +
      '</div>' +
      '<div style="text-align:center;margin-top:6px;line-height:1.7;">' + legend + '</div>' +
      '<div style="font-size:13px;color:#6e6e73;text-align:center;margin-top:5px;">총 ' + purposeTotal + '건 (확정 기준)</div>';
  } else {
    // 막대 폴백 — 도넛 렌더 실패 시에도 분포는 항상 표시
    const dist = purposeDist(d);
    const maxV = dist.length ? dist[0].count : 1;
    const barRows = dist.map((x) => {
      const widthPct = Math.max(8, Math.round((x.count / maxV) * 100));
      return '<tr>' +
        '<td style="padding:5px 10px 5px 0;font-size:12.5px;color:#3a3a3c;white-space:nowrap;text-align:right;width:168px;">' + escapeHtml(x.label) + '</td>' +
        '<td style="padding:5px 0;">' +
          '<div style="background:' + x.color + ';width:' + widthPct + '%;min-width:36px;border-radius:4px;color:#ffffff;font-size:11.5px;font-weight:700;padding:3px 8px;white-space:nowrap;box-sizing:border-box;">' + x.count + '건</div>' +
        '</td>' +
        '<td style="padding:5px 0 5px 8px;font-size:12px;color:#8e8e93;white-space:nowrap;width:40px;">' + x.pct + '%</td>' +
      '</tr>';
    }).join('');
    purposeBody =
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' + barRows + '</table>' +
      '<div style="font-size:13px;color:#6e6e73;text-align:center;margin-top:8px;">총 ' + purposeTotal + '건 (확정 기준)</div>';
  }

  // ── 5) 관련 기사 — 상한 5건, 썸네일 있는 건은 카드형 배치 ──
  let articlesBody;
  if (!d.articles.items.length) {
    articlesBody = '<div style="font-size:13px;color:#aeaeb2;">' + escapeHtml(d.articles.skipReason || '검색 결과 없음') + '</div>';
  } else {
    articlesBody = d.articles.items.map((it) => {
      const meta = [it.source, it.publishedAt].filter(Boolean).map(escapeHtml).join(' · ');
      const snippetDisplay = truncate(it.snippet, 120); // 표시 시점에서도 한 번 더 컷
      const textCell =
        '<a href="' + escapeHtml(it.link) + '" target="_blank" rel="noopener" style="font-size:14px;color:#3a5035;text-decoration:underline;font-weight:600;">' + escapeHtml(it.title) + '</a>' +
        (meta ? '<div style="font-size:11px;color:#aeaeb2;margin-top:2px;">' + meta + '</div>' : '') +
        (snippetDisplay ? '<div style="font-size:13px;color:#3a3a3c;margin-top:4px;line-height:1.5;">' + escapeHtml(snippetDisplay) + '</div>' : '');
      if (it.thumbnail) {
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

  // ── 6) ROI — 최하단·확정 기준 수치 (그래프·저장 시나리오 의존 폐기, pin 지정 시만 동적) ──
  const roiBody =
    '<div style="background:#f5f7f4;border-radius:10px;padding:18px 22px;font-size:14px;color:#1d1d1f;line-height:1.9;">' +
      '<div>총 투자 <strong>' + rfx.totalCost + '</strong> (구축 ' + rfx.capex + ' + 운영 ' + rfx.opexYr + ')</div>' +
      '<div>BEP <strong>' + rfx.bep + '</strong> · 3년 ROI <strong>' + rfx.roi3 + '</strong> · 5년 ROI <strong>' + rfx.roi5 + '</strong></div>' +
      (rfx.basis ? '<div style="font-size:11.5px;color:#8e8e93;margin-top:6px;">' + escapeHtml(rfx.basis) + '</div>' : '') +
    '</div>';

  // 섹션별 한 줄 설명 (임원진 가독성 우선 — 무엇을 보여주는지 즉시 이해)
  const descKpi = '이번 달 핵심 성과와 26년 누적';
  const descDivisions = '확정 방문 기준 본부별 활용 현황 (★ 최다 활용)';
  const descInsights = '이번 달 운영에서 주목할 핵심 사항';
  const descQuotes = '이번 달 설문에서 수집된 방문 경험의 목소리';
  const descPurpose = '확정된 방문이 어떤 목적으로 진행되었는지의 비중';
  const descRoi = '구축·운영 총투자와 회수 지표 (확정 기준)';
  const descArticles = d.articles.source === 'manual'
    ? '담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : d.articles.source === 'mixed'
      ? '담당자 큐레이션 ' + d.articles.manualCount + '건 + "' + MONTHLY_REPORT_QUERY + '" 키워드 자동 수집 ' + d.articles.autoCount + '건'
      : '"' + MONTHLY_REPORT_QUERY + '" 키워드로 자동 수집한 최근 1개월 언론 보도 — ThinQ Real 직접 보도 외에 AI홈 시장 동향 기사가 포함될 수 있습니다.';

  // 한글 가독성: Noto Sans KR 웹폰트 시도 — 허용 환경에서만 적용, 차단 환경은 맑은 고딕 폴백.
  // "<style> 블록 금지" 규칙의 의도적 예외 — @import가 무시돼도 인라인 스타일이 그대로 살아있어 무해.
  return (
    '<style>@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap");</style>' +
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:\'Noto Sans KR\',\'Malgun Gothic\',\'Apple SD Gothic Neo\',-apple-system,BlinkMacSystemFont,sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:760px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:28px 28px 24px;">' +
          '<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.75;">ThinQ Real</div>' +
          '<div style="font-size:24px;font-weight:700;margin-top:6px;">' + escapeHtml(d.year + '년 ' + d.monthNum + '월 운영 리포트') + '</div>' +
          '<div style="font-size:14px;opacity:0.88;margin-top:8px;line-height:1.55;">이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.</div>' +
        '</td></tr>' +
        sectionHeader('📊', 'Executive 요약', descKpi) +
        kpiTable +
        (divisionsRow ? sectionHeader('🏢', '사업부별 활용 현황', descDivisions) + divisionsRow : '') +
        (insightsRow ? sectionHeader('💡', '핵심 인사이트', descInsights) + insightsRow : '') +
        (quotesRow ? sectionHeader('💬', '인상 깊은 한마디', descQuotes) + quotesRow : '') +
        sectionHeader('🎯', '방문 목적별 분포', descPurpose) +
        '<tr><td style="padding:0 28px 16px;">' + purposeBody + '</td></tr>' +
        sectionHeader('📰', '관련 기사', descArticles) +
        '<tr><td style="padding:0 28px 24px;">' + articlesBody + '</td></tr>' +
        sectionHeader('💰', '투자 대비 성과 (ROI)', descRoi) +
        '<tr><td style="padding:0 28px 24px;">' + roiBody + '</td></tr>' +
        '<tr><td style="padding:28px;border-top:1px solid #eeeeee;font-size:15px;color:#3a3a3c;line-height:1.65;">' +
          '<div style="font-weight:600;color:#1d1d1f;margin-bottom:4px;">감사합니다.</div>' +
          '<div style="color:#6e6e73;">HS플랫폼사업센터 AI홈솔루션엔지니어링팀</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}
