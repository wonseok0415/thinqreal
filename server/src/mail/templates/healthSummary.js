// FieldCheck 일일 요약 메일 HTML — .gs buildHealthSummaryHtml/buildLatencyDiagramHtml 이식.
// 인라인 스타일만 사용 (Gmail/Outlook은 <style> 블록과 외부 리소스를 제거 — sendGuestMail과 같은 제약).
import { escapeHtml } from '../../lib/html.js';

// 과거 기록 호환 — 초기 버전이 '리그' 용어로 기록한 사유가 시트에 남아 있어 표시 시점에 현재 용어로 변환
// (이미 발생한 기록을 수정하지 않는 편이 이력 추적에 안전).
export function fcNormalizeNote(v) {
  return String(v || '').trim().replace(/리그/g, '점검 장비');
}

// '응답 시작' 측정 구간 도식 — 어느 구간을 잰 값인지 표시 (총 답변 길이로 오해 방지).
// 메일 클라이언트 호환: flex/grid 없이 표 셀 6칸으로 배치.
export function buildLatencyDiagramHtml() {
  const OLIVE = '#3a5035', GRAY = '#6e6e73', LIGHT = '#aeaeb2';

  const step = (n, line1, line2, active) =>
    '<td width="16%" align="center" valign="top" style="padding:0 3px;">' +
      '<div style="width:20px;height:20px;line-height:20px;border-radius:10px;' +
        'background:' + (active ? OLIVE : '#e0e0e5') + ';color:' + (active ? '#ffffff' : GRAY) + ';' +
        'font-size:11px;font-weight:700;margin:0 auto;">' + n + '</div>' +
      '<div style="font-size:10.5px;color:' + (active ? '#1d1d1f' : GRAY) + ';margin-top:6px;line-height:1.5;">' +
        line1 + (line2 ? '<br>' + line2 : '') +
      '</div>' +
    '</td>';

  return (
    '<div style="margin-top:12px;padding:15px 16px 14px;background:#fafafa;border:1px solid #ededed;border-radius:8px;">' +
      '<div style="font-size:11.5px;font-weight:600;color:#1d1d1f;margin-bottom:13px;">' +
        '응답 시작은 이렇게 측정합니다' +
      '</div>' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
        '<tr>' +
          step('1', '“하이 엘지”', '재생', false) +
          step('2', 'ThinQ ON', '“띵”', false) +
          step('3', '1.5초', '대기', false) +
          step('4', '점검 질문', '재생', false) +
          step('5', '녹음 시작', '', true) +
          step('6', 'ThinQ ON이', '말을 시작', true) +
        '</tr>' +
        '<tr>' +
          '<td colspan="4" align="right" style="padding:12px 6px 0 0;font-size:10px;color:' + LIGHT + ';line-height:1.4;">' +
            '질문 재생 끝 = 0ms ▸' +
          '</td>' +
          '<td colspan="2" style="padding:12px 3px 0;">' +
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
              '<tr><td height="4" style="background:' + OLIVE + ';border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr>' +
            '</table>' +
            '<div style="text-align:center;font-size:10.5px;font-weight:600;color:' + OLIVE + ';margin-top:5px;">이 구간</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
      '<div style="margin-top:12px;padding-top:11px;border-top:1px solid #ededed;font-size:10.5px;color:' + GRAY + ';line-height:1.65;">' +
        '질문을 다 말한 순간부터 <strong style="color:#1d1d1f;">답을 시작하기까지</strong> 걸린 시간입니다.<br>' +
        '답변을 끝내기까지의 길이는 포함하지 않으며, 기동어 “띵” 시점 기준도 아닙니다.' +
      '</div>' +
    '</div>'
  );
}

// 일일 요약 HTML — v = { today, total, failCount, levels:[{code,title,items:[{label,rate,pass,total,avgLat}]}],
//                        failures:[{ts,level,label,media,said,note}] }
export function buildHealthSummaryHtml(v) {
  const OLIVE = '#3a5035', RED = '#b3261e', GRAY = '#6e6e73', LIGHT = '#aeaeb2';
  const ok = v.failCount === 0 && v.total > 0;
  const noData = v.total === 0;

  const statusColor = ok ? OLIVE : RED;
  const statusText = noData ? '점검 기록 없음' : (ok ? '전체 정상' : '실패 ' + v.failCount + '건');
  const statusIcon = ok ? '✅' : '⚠';

  // 성공률 막대 — div 중첩 대신 표 셀 폭으로 그린다 (메일 클라이언트 호환)
  const bar = (rate) =>
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;max-width:76px;background:#e8e8ed;border-radius:3px;">' +
      '<tr>' +
        (rate > 0 ? '<td height="6" style="width:' + rate + '%;background:' + (rate === 100 ? OLIVE : RED) + ';border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>' : '') +
        (rate < 100 ? '<td height="6" style="font-size:0;line-height:0;">&nbsp;</td>' : '') +
      '</tr>' +
    '</table>';

  const kpi = (label, value, color) =>
    '<td align="center" style="padding:14px 8px;background:#f5f5f7;border-radius:10px;">' +
      '<div style="font-size:24px;font-weight:600;color:' + color + ';line-height:1.2;">' + value + '</div>' +
      '<div style="font-size:12px;color:' + GRAY + ';margin-top:2px;">' + label + '</div>' +
    '</td>';

  let inner = '';

  if (noData) {
    inner =
      '<div style="padding:18px 20px;background:#fdf3f2;border-left:3px solid ' + RED + ';border-radius:6px;font-size:14px;color:#1d1d1f;line-height:1.7;">' +
        '<strong>최근 24시간 동안 점검 기록이 없습니다.</strong><br>' +
        '점검 장비(노트북)가 꺼져 있거나, 네트워크 문제로 전송이 실패했을 수 있습니다.' +
        '<div style="color:' + GRAY + ';font-size:13px;margin-top:6px;">전송 실패분은 점검 장비의 results.jsonl에 남아 있습니다.</div>' +
      '</div>';
  } else {
    inner =
      '<table role="presentation" cellspacing="8" cellpadding="0" border="0" style="border-collapse:separate;width:100%;margin-bottom:8px;"><tr>' +
        kpi('총 판정', v.total, '#1d1d1f') +
        kpi('성공', v.total - v.failCount, OLIVE) +
        kpi('실패', v.failCount, v.failCount ? RED : LIGHT) +
      '</tr></table>';

    v.levels.forEach((lv) => {
      const hasLat = lv.items.some((it) => it.avgLat !== null);
      const th = 'font-size:11px;color:' + LIGHT + ';font-weight:400;padding:0 0 6px;';
      const head =
        '<tr>' +
          '<td style="' + th + '">시나리오</td>' +
          '<td style="' + th + '"></td>' +
          '<td align="right" style="' + th + '">성공률</td>' +
          '<td align="right" style="' + th + '">' + (hasLat ? '응답 시작' : '') + '</td>' +
        '</tr>';

      const rows = lv.items.map((it) =>
        '<tr>' +
          '<td style="padding:9px 0;font-size:13px;color:#1d1d1f;">' + escapeHtml(it.label) + '</td>' +
          '<td align="right" style="padding:9px 8px;width:76px;">' + bar(it.rate) + '</td>' +
          '<td align="right" style="padding:9px 0;width:82px;font-size:13px;color:' + (it.rate === 100 ? OLIVE : RED) + ';font-weight:600;white-space:nowrap;">' +
            it.rate + '%' +
            '<span style="color:' + LIGHT + ';font-weight:400;font-size:12px;">&nbsp;' + it.pass + '/' + it.total + '</span>' +
          '</td>' +
          '<td align="right" style="padding:9px 0;width:60px;font-size:12px;color:' + GRAY + ';">' +
            (it.avgLat !== null ? it.avgLat + 'ms' : '') + '</td>' +
        '</tr>').join('');

      inner +=
        '<div style="margin-top:22px;font-size:13px;font-weight:600;color:' + OLIVE + ';">' + escapeHtml(lv.title) + '</div>' +
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;margin-top:8px;">' +
          head +
        '</table>' +
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;border-top:1px solid #eeeeee;">' +
          rows +
        '</table>' +
        // 숫자만 있으면 무엇을 잰 값인지 알 수 없으므로 측정 구간을 도식으로 함께 싣는다
        (hasLat ? buildLatencyDiagramHtml() : '');
    });

    if (v.failures.length) {
      const cards = v.failures.map((f) =>
        '<div style="margin-top:8px;padding:12px 14px;background:#fdf3f2;border-left:3px solid ' + RED + ';border-radius:6px;">' +
          '<div style="font-size:13px;color:#1d1d1f;">' +
            '<span style="color:' + GRAY + ';">' + escapeHtml(f.ts) + '</span>&nbsp;&nbsp;' +
            '<span style="display:inline-block;padding:1px 6px;background:' + RED + ';color:#ffffff;border-radius:3px;font-size:11px;font-weight:600;">' + escapeHtml(f.level) + '</span>&nbsp;' +
            '<strong>' + escapeHtml(f.label) + '</strong>' +
          '</div>' +
          (f.said ? '<div style="font-size:13px;color:#1d1d1f;margin-top:5px;">인식: “' + escapeHtml(f.said) + '”</div>' : '') +
          (f.note ? '<div style="font-size:12px;color:' + RED + ';margin-top:5px;">⚠ ' + escapeHtml(f.note) + '</div>' : '') +
          (f.media ? '<div style="font-size:11px;color:' + LIGHT + ';margin-top:5px;font-family:Consolas,Menlo,monospace;word-break:break-all;">' + escapeHtml(f.media) + '</div>' : '') +
        '</div>').join('');

      inner +=
        '<div style="margin-top:24px;font-size:13px;font-weight:600;color:' + RED + ';">실패 상세 (최근순, 최대 10건)</div>' +
        cards +
        '<div style="margin-top:10px;font-size:12px;color:' + GRAY + ';">실패 녹음 파일은 점검 장비의 recordings 폴더에서 확인할 수 있습니다.</div>';

      if (v.failures.some((f) => f.note.indexOf('마이크') >= 0)) {
        inner +=
          '<div style="margin-top:12px;padding:12px 14px;background:#f5f5f7;border-radius:6px;font-size:12px;color:' + GRAY + ';line-height:1.6;">' +
            '※ <strong style="color:#1d1d1f;">“마이크 무입력”</strong>으로 표시된 건은 점검 장비 쪽 문제이며, ThinQ ON 장애가 아닙니다.<br>' +
            '점검 장비에서 <span style="font-family:Consolas,Menlo,monospace;color:#1d1d1f;">python fieldcheck.py --mic-test</span> 로 확인해 주세요.' +
          '</div>';
      }
    }
  }

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:' + statusColor + ';color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real · FieldCheck</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">' + statusIcon + ' ' + escapeHtml(statusText) + '</div>' +
          '<div style="font-size:13px;opacity:0.8;margin-top:2px;">' + escapeHtml(v.today) + ' · 최근 24시간 ThinQ ON 자동 점검 결과</div>' +
        '</td></tr>' +
        '<tr><td style="padding:24px 28px 28px;">' +
          inner +
          '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #eeeeee;font-size:12px;color:' + GRAY + ';line-height:1.6;">' +
            'ThinQ ON Field 자동 점검 시스템이 매일 아침 자동 발송하는 메일입니다.<br>' +
            'HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}
