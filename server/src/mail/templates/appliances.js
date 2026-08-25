// 구비 가전 표 — R&D 목적 확정 메일 첨부용 (.gs buildAppliancesText/Html 이식)
import { APPLIANCES } from '../../lib/constants.js';
import { escapeHtml } from '../../lib/html.js';

export function buildAppliancesText() {
  const lines = APPLIANCES.map((row, i) => {
    const idx = String(i + 1).padStart(2, '0');
    return `   ${idx}. ${row[0]}  /  ${row[1]}  /  ${row[2]}  /  ${row[3]}`;
  });
  return [
    '📦 구비 가전 및 품목 (총 ' + APPLIANCES.length + '개)',
    '   (구분  /  제품명  /  모델명  /  제조사)',
    '',
  ].concat(lines).join('\n');
}

export function buildAppliancesHtml() {
  const rows = APPLIANCES.map((r, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
    const idx = String(i + 1).padStart(2, '0');
    return (
      '<tr style="background:' + bg + ';">' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:12px;color:#aeaeb2;text-align:right;width:36px;font-variant-numeric:tabular-nums;">' + idx + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#1d1d1f;font-weight:500;white-space:nowrap;">' + escapeHtml(r[0]) + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#3a3a3c;">' + escapeHtml(r[1]) + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #eeeeee;font-size:12px;color:#6e6e73;font-family:Consolas,Menlo,monospace;white-space:nowrap;">' + escapeHtml(r[2]) + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #eeeeee;font-size:12px;color:#6e6e73;white-space:nowrap;">' + escapeHtml(r[3]) + '</td>' +
      '</tr>'
    );
  }).join('');

  return (
    '<div style="margin-top:24px;">' +
      '<div style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:6px;">📦 구비 가전 및 품목 <span style="color:#6e6e73;font-weight:400;">(총 ' + APPLIANCES.length + '개)</span></div>' +
      '<div style="font-size:12px;color:#6e6e73;margin-bottom:12px;">리스트 품목 외 연구원들의 개인 장비·물품들이 있으므로 위치 변경이나 분실에 유의해 주세요.</div>' +
      '<div style="overflow-x:auto;">' +
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;min-width:520px;border:1px solid #eeeeee;border-radius:6px;overflow:hidden;">' +
          '<thead>' +
            '<tr style="background:#f5f5f7;">' +
              '<th style="padding:10px;border-bottom:1px solid #e8e8ed;font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.04em;text-align:right;width:36px;">#</th>' +
              '<th style="padding:10px 12px;border-bottom:1px solid #e8e8ed;font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">구분</th>' +
              '<th style="padding:10px 12px;border-bottom:1px solid #e8e8ed;font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">제품명</th>' +
              '<th style="padding:10px 12px;border-bottom:1px solid #e8e8ed;font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">모델명</th>' +
              '<th style="padding:10px 12px;border-bottom:1px solid #e8e8ed;font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">제조사</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="margin-top:10px;padding:10px 12px;background:#f5f5f7;border-left:3px solid #8fa889;border-radius:4px;font-size:12px;color:#6e6e73;line-height:1.55;">' +
        '연구 목적의 방문에 도움이 되시도록 구비 가전 정보를 함께 안내드립니다. (R&amp;D 연구 목적으로 예약하신 분께만 발송됩니다.)' +
      '</div>' +
    '</div>'
  );
}
