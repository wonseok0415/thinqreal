// 예약자 확정/거절 메일 — .gs buildConfirmText/Html · buildRejectText/Html 이식.
// Wi-Fi·도어락 등 민감 정보는 메일에만 (페이지 노출 금지). 값은 env(config)에서 —
// .gs 하드코딩(공개 리포 노출)을 env로 옮긴 개선점.
import { escapeHtml } from '../../lib/html.js';
import { config } from '../../config.js';
import { buildAppliancesText, buildAppliancesHtml } from './appliances.js';

const includeAppliancesFor = (purpose) => (purpose || '').indexOf('R&D') >= 0;
const includeWelcomeBoardFor = (purpose) => /(B2B|홍보)/.test(purpose || '');

export function buildConfirmText(data) {
  const includeAppliances = includeAppliancesFor(data.purpose);
  const includeWelcomeBoard = includeWelcomeBoardFor(data.purpose);
  const { wifi, doorlockPin } = config;

  const sections = [
    `안녕하세요, ${data.name}님.`,
    ``,
    `ThinQ Real 방문 예약이 확정되었습니다.`,
    ``,
    `📅 일정`,
    `   ${data.date}  /  ${data.slotLabel || ''}`,
    ``,
    `📍 위치`,
    `   마곡 LG사이언스파크 W6동 1층`,
    `   보안게이트 출구 앞 / 주차장 엘리베이터 앞`,
    `   (보안게이트 밖에 위치해 별도 보안 절차 없이 방문 가능)`,
    ``,
    `📶 무선 인터넷`,
    `   2.4 GHz : ${wifi.ssid24}`,
    `   5 GHz   : ${wifi.ssid5}`,
    `   비밀번호 : ${wifi.password}`,
    ``,
    `🔐 도어락 비밀번호`,
    `   ${doorlockPin}`,
    ``,
    `🅿 주차 안내`,
    `   지하주차 : SP Portal (portal.lgsp.co.kr) → Support → 주차`,
    `              → 전용건물 방문자 주차에서 사전 신청`,
    `   지상주차 (VIP·프레스투어 등) : 방문 목적·고객을 명시한`,
    `              신청 양식을 작성해 마곡주차관리자`,
    `              (mgparking@lge.com)에게 메일로 신청`,
    `   (양식·지상주차 위치는 이용 안내 페이지의 주차 안내 참조)`,
    ``,
    // 웰컴 보드 — VIP·프레스 대응용이라 B2B 영업·홍보 목적 확정 건에만 안내
    ...(includeWelcomeBoard ? [
      `🖥 웰컴 보드`,
      `   건물 1층 사이니지(W4쪽·W6동쪽)를 환영 문구용 웰컴보드로`,
      `   활용할 수 있습니다. 사진(3840×2160)과 신청 양식을`,
      `   박형기 책임 (Kuwait.park@lge.com),`,
      `   마곡운영지원센터 (mgoc@lge.com)로 송부해 주세요.`,
      ``,
    ] : []),
    `☎ 문의`,
    `   이철호 책임 연구원 : ch275.lee@lge.com`,
    `   서문수 선임 연구원 : moonsu.seo@lge.com`,
    `   김현진 선임 연구원 : hj8462.kim@lge.com`,
    ``,
    `📖 방문 전 이용 안내`,
    `   ${config.guideUrl}`,
    `   (운영 시간 · 유의사항 · 주차 등 자세한 내용 확인)`,
  ];

  if (includeAppliances) {
    sections.push('');
    sections.push('────────────────────────────────────────');
    sections.push('');
    sections.push(buildAppliancesText());
    sections.push('');
    sections.push('   ※ 연구 목적의 방문에 도움이 되시도록 구비 가전 정보를');
    sections.push('     함께 안내드립니다. (R&D 연구 목적 예약자에 한해 발송)');
  }

  sections.push('');
  sections.push('감사합니다.');
  sections.push('HS플랫폼사업센터 AI홈솔루션엔지니어링팀');

  return sections.join('\n');
}

export function buildConfirmHtml(data) {
  const includeAppliances = includeAppliancesFor(data.purpose);
  const includeWelcomeBoard = includeWelcomeBoardFor(data.purpose);
  const { wifi, doorlockPin } = config;
  const name = escapeHtml(data.name);
  const date = escapeHtml(data.date);
  const slot = escapeHtml(data.slotLabel || '');

  const infoRow = (icon, label, valueHtml) =>
    '<tr>' +
      '<td valign="top" style="padding:14px 12px 14px 0;width:88px;font-size:13px;color:#6e6e73;font-weight:600;white-space:nowrap;">' + icon + '&nbsp;' + label + '</td>' +
      '<td valign="top" style="padding:14px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">' + valueHtml + '</td>' +
    '</tr>';

  const rows =
    infoRow('📅', '일정',
      '<div style="font-size:16px;font-weight:600;color:#3a5035;">' + date + '</div>' +
      '<div style="color:#6e6e73;font-size:13px;">' + slot + '</div>') +
    infoRow('📍', '위치',
      '마곡 LG사이언스파크 W6동 1층' +
      '<div style="color:#6e6e73;font-size:13px;">보안게이트 출구 앞 / 주차장 엘리베이터 앞</div>' +
      '<div style="color:#aeaeb2;font-size:12px;margin-top:2px;">보안게이트 밖에 위치해 별도 보안 절차 없이 방문 가능</div>') +
    infoRow('📶', '무선 인터넷',
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">2.4&nbsp;GHz</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">' + escapeHtml(wifi.ssid24) + '</td></tr>' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">5&nbsp;GHz</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">' + escapeHtml(wifi.ssid5) + '</td></tr>' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">비밀번호</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">' + escapeHtml(wifi.password) + '</td></tr>' +
      '</table>') +
    infoRow('🔐', '도어락 비밀번호',
      '<div style="font-family:Consolas,Menlo,monospace;font-size:15px;color:#1d1d1f;letter-spacing:0.04em;">' + escapeHtml(doorlockPin) + '</div>') +
    infoRow('🅿', '주차',
      '<div><strong style="font-size:13px;">지하주차</strong> · SP Portal(portal.lgsp.co.kr) → Support → 주차 → 전용건물 방문자 주차에서 사전 신청</div>' +
      '<div style="margin-top:4px;"><strong style="font-size:13px;">지상주차 (VIP·프레스투어 등)</strong> · 방문 목적·고객을 명시한 신청 양식을 마곡주차관리자 <a href="mailto:mgparking@lge.com" style="color:#3a5035;text-decoration:none;">mgparking@lge.com</a> 으로 메일 신청</div>' +
      '<div style="color:#aeaeb2;font-size:12px;margin-top:2px;">신청 양식과 지상주차 위치 약도는 방문 안내 페이지의 주차 안내를 참조해 주세요.</div>') +
    (includeWelcomeBoard
      ? infoRow('🖥', '웰컴 보드',
          '건물 1층 사이니지(W4쪽·W6동쪽)를 환영 문구용 웰컴보드로 활용할 수 있습니다.' +
          '<div style="color:#6e6e73;font-size:13px;margin-top:2px;">사진(3840×2160)과 신청 양식을 박형기 책임 <a href="mailto:Kuwait.park@lge.com" style="color:#3a5035;text-decoration:none;">Kuwait.park@lge.com</a> · 마곡운영지원센터 <a href="mailto:mgoc@lge.com" style="color:#3a5035;text-decoration:none;">mgoc@lge.com</a> 로 송부해 주세요.</div>')
      : '') +
    infoRow('☎', '문의',
      '<div>이철호 책임 연구원 · <a href="mailto:ch275.lee@lge.com" style="color:#3a5035;text-decoration:none;">ch275.lee@lge.com</a></div>' +
      '<div>서문수 선임 연구원 · <a href="mailto:moonsu.seo@lge.com" style="color:#3a5035;text-decoration:none;">moonsu.seo@lge.com</a></div>' +
      '<div>김현진 선임 연구원 · <a href="mailto:hj8462.kim@lge.com" style="color:#3a5035;text-decoration:none;">hj8462.kim@lge.com</a></div>') +
    infoRow('📖', '방문 안내',
      '<a href="' + config.guideUrl + '" style="color:#3a5035;font-weight:500;text-decoration:none;">방문 전 이용 안내 페이지 열기 ↗</a>' +
      '<div style="color:#6e6e73;font-size:12px;margin-top:2px;">운영 시간 · 유의사항 · 주차 등 자세한 내용</div>');

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">예약이 확정되었습니다</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:15px;color:#1d1d1f;margin-bottom:20px;">안녕하세요, <strong>' + name + '</strong>님.<br>요청하신 ThinQ Real 방문 예약이 확정되었습니다.</div>' +
          '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;border-top:1px solid #eeeeee;">' +
            rows +
          '</table>' +
          (includeAppliances ? buildAppliancesHtml() : '') +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}

export function buildRejectText(data) {
  return [
    `안녕하세요, ${data.name}님.`,
    ``,
    `아쉽게도 요청하신 일정(${data.date} ${data.slotLabel || ''})에`,
    `ThinQ Real 방문 예약이 어렵게 되었습니다.`,
    ``,
    `다른 일정으로 다시 신청해 주시거나, 아래 담당자에게 문의해 주세요.`,
    ``,
    `☎ 문의`,
    `   이철호 책임 연구원 : ch275.lee@lge.com`,
    `   서문수 선임 연구원 : moonsu.seo@lge.com`,
    `   김현진 선임 연구원 : hj8462.kim@lge.com`,
    ``,
    `📖 방문 안내`,
    `   ${config.guideUrl}`,
    ``,
    `감사합니다.`,
    `HS플랫폼사업센터 AI홈솔루션엔지니어링팀`,
  ].join('\n');
}

export function buildRejectHtml(data) {
  const name = escapeHtml(data.name);
  const date = escapeHtml(data.date);
  const slot = escapeHtml(data.slotLabel || '');
  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#6e6e73;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">예약 신청이 거절되었습니다</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:15px;color:#1d1d1f;line-height:1.7;">' +
            '안녕하세요, <strong>' + name + '</strong>님.<br>' +
            '아쉽게도 요청하신 일정(<strong>' + date + ' ' + slot + '</strong>)에 ThinQ Real 방문 예약이 어렵게 되었습니다.' +
          '</div>' +
          '<div style="margin-top:16px;font-size:14px;color:#3a3a3c;">다른 일정으로 다시 신청해 주시거나, 아래 담당자에게 문의해 주세요.</div>' +
          '<div style="margin-top:24px;padding:16px 18px;background:#f5f5f7;border-radius:8px;font-size:13px;line-height:1.8;">' +
            '<div style="font-weight:600;color:#3a3a3c;margin-bottom:6px;">☎ 문의</div>' +
            '<div>이철호 책임 연구원 · <a href="mailto:ch275.lee@lge.com" style="color:#3a5035;text-decoration:none;">ch275.lee@lge.com</a></div>' +
            '<div>서문수 선임 연구원 · <a href="mailto:moonsu.seo@lge.com" style="color:#3a5035;text-decoration:none;">moonsu.seo@lge.com</a></div>' +
            '<div>김현진 선임 연구원 · <a href="mailto:hj8462.kim@lge.com" style="color:#3a5035;text-decoration:none;">hj8462.kim@lge.com</a></div>' +
          '</div>' +
          '<div style="margin-top:18px;font-size:13px;">' +
            '<a href="' + config.guideUrl + '" style="color:#3a5035;text-decoration:none;font-weight:500;">📖 방문 안내 페이지 열기 ↗</a>' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}
