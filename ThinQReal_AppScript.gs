// ============================================================
//  ThinQ Real — Google Apps Script
//  역할: 예약 저장 / 가용성 조회 / 승인·거절 처리 + 메일 발송
//
//  배포 방법:
//  1. script.google.com → 새 프로젝트 생성
//  2. 이 코드 전체 붙여넣기
//  3. SHEET_ID를 실제 Google Sheets ID로 교체
//  4. 배포 → 새 배포 → 웹 앱 → 액세스: 모든 사용자 → 배포
//  5. 생성된 URL을 thinqreal.html과 thinqreal_admin.html의
//     SCRIPT_URL 변수에 붙여넣기
// ============================================================

// ── 설정값 ──────────────────────────────────────────────────
const SHEET_ID   = '1-Z158TV46MtSEArir9bW4h4KQ438NCuhb3qaGyOooA0';  // ← Sheets URL의 /d/ 뒤 ID
const SHEET_NAME = 'bookings';               // 시트 탭 이름 (예약)
const ROI_SHEET_NAME = 'roi_snapshots';      // 시트 탭 이름 (ROI 시나리오 이력)
// 신규 예약 알림을 받는 담당자들 (콤마로 구분, MailApp이 다중 수신 처리)
const ADMIN_EMAILS = 'ch275.lee@lge.com, moonsu.seo@lge.com, hj8462.kim@lge.com';
const CC_EMAIL     = 'kang.wonseok@lge.com';  // 참조 수신자 (시스템 동작 모니터링)

// 방문 전 이용 안내 페이지 URL (이용안내 탭으로 직접 이동)
const GUIDE_URL = 'https://wonseok0415.github.io/wonseok-lab/thinqreal/thinqreal.html#page-guide';

// R&D 연구 목적 예약자에게 함께 보내는 구비 가전 리스트 (총 45개)
// [구분, 제품명, 모델명, 제조사]
const APPLIANCES = [
  ['시스템에어컨 (거실)',  '1Way 정온제습(콜드프리) 에어컨 (신제품)', '미출시',           'LG전자'],
  ['시스템에어컨 (침실)',  '1Way 정온제습(콜드프리) 에어컨 (신제품)', '미출시',           'LG전자'],
  ['욕실 환기',           '바스에어시스템 (듀얼배기)',                 'M-X0120BASV',     'LG전자'],
  ['프리미엄 환기',        'LG 프리미엄 환기 PLUS',                    'Z-E0250L2AR',     'LG전자'],
  ['스마트디퓨저 (배기)',  '환기 디퓨저',                              'PVD-R120TD.AKM',  'LG전자'],
  ['스마트디퓨저 (급기)',  '환기 디퓨저',                              'PVD-S120AA.AKM',  'LG전자'],
  ['시스템공청기',         '시스템 공청기',                            '미출시',           'LG전자'],
  ['스탠바이미2',          'LG 스탠바이미2',                           '27LX6TPGAA',      'LG전자'],
  ['TV',                  'LG QNED TV',                              '86QNED90KQA',     'LG전자'],
  ['냉장고',              'LG 오브제컬렉션 무드업',                    'M624GNN0A2',      'LG전자'],
  ['김치냉장고',           'LG 디오스 김치톡톡 무드업',                 'Z331GNN152',      'LG전자'],
  ['와인셀러',             'LG 디오스 오브제컬렉션 와인셀러 (81병)',     'W0812GG',         'LG전자'],
  ['세탁기',              'LG 트롬 AI 오브제컬렉션 워시타워 (세탁 25kg)', 'FA25GJFB',       'LG전자'],
  ['건조기',              'LG 트롬 AI 오브제컬렉션 워시타워 (건조 25kg)', 'RA25GJFB',       'LG전자'],
  ['제습기',              'LG 휘센 오브제컬렉션 제습기',                'DQ235MEGA',       'LG전자'],
  ['공기청정기',           'LG 퓨리케어 AI 오브제컬렉션 360˚ 공기청정기', 'AS355NSNA',      'LG전자'],
  ['하이드로타워',         'LG 퓨리케어 오브제컬렉션 하이드로타워',       'HY705RSUAB',      'LG전자'],
  ['하이드로 에센셜',       'LG 퓨리케어 오브제컬렉션 하이드로 에센셜',    'HY505RWLAH',      'LG전자'],
  ['에어로스피커',         'LG 퓨리케어 AI 오브제컬렉션 에어로스피커',    'AS065SWHA',       'LG전자'],
  ['사운드바',             'LG 사운드바 스위트',                       'H7',              'LG전자'],
  ['정수기',              'LG 퓨리케어 정수기 (듀얼, 냉온정)',         'WU923AS',         'LG전자'],
  ['의류관리기',           'LG 스타일러 오브제컬렉션',                  'SC5GMR52C',       'LG전자'],
  ['안마의자',             'LG 힐링미 오브제컬렉션 안마의자 (아르테UP)',  'MH21RRY',         'LG전자'],
  ['로봇청소기',           '히든스테이션 로봇청소기',                   '미출시',           'LG전자'],
  ['광파오븐',             'LG 디오스 오브제컬렉션 광파오븐',            'MLJ32ERS',        'LG전자'],
  ['인덕션',              'LG 디오스 오브제컬렉션 인덕션 1등급',         'BEI3ANHLE',       'LG전자'],
  ['식기세척기',           'LG 디오스 오브제컬렉션 식기세척기 (열풍+스팀)', 'DFBJ4ES',       'LG전자'],
  ['식물생활가전',         '틔운 오브제컬렉션',                         'L123G1P',         'LG전자'],
  ['스마트수전',           'LG 샤워 스테이션',                          '미출시',           'LG전자'],
  ['ThinQ ON',           'LG AI Home',                              'HMAK4W.AKOR',     'LG전자'],
  ['보이스 컨트롤러',       'LG AI Home',                              'HAAL3W.AKOR',     'LG전자'],
  ['공기질 센서',          'LG 공기질 센서',                           'TMSA2A4W.AKOR',   'LG전자'],
  ['온습도 센서',          'LG 온습도 센서',                           'TMSTAA4W.AKOR',   'LG전자'],
  ['스마트 버튼 (1구)',    'LG 스마트 버튼',                           'TMCB1B4W.AKOR',   'LG전자'],
  ['스마트 버튼 (2구)',    'LG 스마트 버튼',                           'TMCB2B4W.AKOR',   'LG전자'],
  ['도어 센서',           'LG 도어 센서',                             'TMSDAA4W.AKOR',   'LG전자'],
  ['모션 조도 센서',       'LG 모션 조도 센서',                         'TMSMAA4W.AKOR',   'LG전자'],
  ['스마트 플러그',        'LG 스마트 플러그',                          'TMCP114W.AKOR',   'LG전자'],
  ['스마트 도어락',        'LG 스마트 도어락',                          'TZCDP14B.AKOR',   'LG전자'],
  ['전동창호 (분합창)',    'LX 하우시스 전동창호 분합창 (Sliding)',      '미출시',           'LX하우시스'],
  ['전동창호 (주방창)',    'LX 하우시스 전동창호 주방창 (Outward)',      '미출시',           'LX하우시스'],
  ['월패드',              '현대HT 월패드',                            'HNF-I7130',       '현대HT'],
  ['온도조절기',           '시하스 온도조절기',                          '—',               '시하스'],
  ['AP',                 'Unifi U7-Pro-XG',                          'U7-Pro-XG',       'Ubiquiti'],
  ['전동커튼',             '마마바 (Matter over WiFi)',                '—',               '마마바'],
];


// ============================================================
//  GET 요청 처리
//  - ?type=bookings       → 전체 예약 목록 반환 (관리자용)
//  - ?type=availability&date=YYYY-MM-DD → 해당 날짜 마감 슬롯 반환
// ============================================================
function doGet(e) {
  const type = e.parameter.type;

  if (type === 'availability') {
    return handleAvailability(e.parameter.date);
  }
  if (type === 'bookings') {
    return handleGetBookings();
  }
  if (type === 'roi_snapshots') {
    return handleGetRoiSnapshots();
  }
  if (type === 'mail_test') {
    return handleMailTest();
  }
  if (type === 'mail_status') {
    return handleMailStatus();
  }
  if (type === 'appliances') {
    return handleGetAppliances();
  }

  return jsonResponse({ error: 'Unknown type' });
}

// 구비 가전 목록 반환 — APPLIANCES 상수가 메일/관리자 페이지 양쪽에서
// 사용되는 단일 소스가 되도록 노출.
function handleGetAppliances() {
  const items = APPLIANCES.map(r => ({
    category: r[0], name: r[1], model: r[2], maker: r[3]
  }));
  return jsonResponse({ count: items.length, items: items });
}


// ── 가용성 조회 ─────────────────────────────────────────────
// 확정(status = '확정') 된 예약만 마감으로 처리
// 대기중은 마감으로 처리하지 않음 (담당자가 거절할 수 있으므로)
function handleAvailability(date) {
  if (!date) return jsonResponse({ bookedSlots: [] });

  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  const dateIdx   = headers.indexOf('date');
  const slotIdx   = headers.indexOf('slots');
  const statusIdx = headers.indexOf('status');

  const booked = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Sheets가 date 컬럼을 Date 타입으로 자동 변환하는 경우가 있어
    // 비교 전에 양쪽 모두 YYYY-MM-DD 문자열로 정규화한다.
    if (normalizeDate(row[dateIdx]) !== normalizeDate(date)) continue;
    if (row[statusIdx] !== '확정') continue;

    // slots 컬럼은 "[1,2]" 형태의 JSON 문자열로 저장됨
    try {
      const slots = JSON.parse(row[slotIdx]);
      slots.forEach(s => booked.add(Number(s)));
    } catch(err) {
      // 구형 데이터(slot 단일값) 대응
      const singleSlot = headers.indexOf('slot');
      if (singleSlot >= 0 && row[singleSlot]) {
        booked.add(Number(row[singleSlot]));
      }
    }
  }

  return jsonResponse({ bookedSlots: [...booked] });
}

// 날짜 값을 YYYY-MM-DD 문자열로 정규화 (Date 객체·ISO 문자열·일반 문자열 모두 처리)
function normalizeDate(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v);
  if (s.indexOf('T') >= 0) return s.slice(0, 10);
  return s.slice(0, 10);
}


// ── 전체 예약 목록 조회 (관리자) ────────────────────────────
function handleGetBookings() {
  const sheet   = getSheet();
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  const records = rows.slice(1).map((row, i) => {
    const obj = { id: String(i + 1) };
    headers.forEach((h, j) => {
      let v = row[j];
      // Sheets의 자동 타입 변환 정규화: 날짜는 YYYY-MM-DD, 그 외 Date는 ISO
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = (h === 'date') ? normalizeDate(v) : v.toISOString();
      }
      obj[h] = v == null ? '' : v;
    });
    // id를 항상 문자열로 (Sheets가 숫자로 자동 인식해 비교 깨지는 문제 방지)
    if (obj.id != null && obj.id !== '') obj.id = String(obj.id);
    else obj.id = String(i + 1);
    return obj;
  }).filter(r => r.date); // 빈 행 제외

  return jsonResponse({ records });
}


// ============================================================
//  POST 요청 처리
//  - type: 'booking' → 신규 예약 저장 + 담당자 알림 메일
//  - type: 'update'  → 상태 변경 + 예약자 확정/거절 메일
// ============================================================
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(err) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  if (data.type === 'booking') return handleNewBooking(data);
  if (data.type === 'update')  return handleUpdateStatus(data);
  if (data.type === 'roi_snapshot') return handleNewRoiSnapshot(data);
  if (data.type === 'roi_delete')   return handleDeleteRoiSnapshot(data);

  return jsonResponse({ error: 'Unknown type' });
}


// ── 신규 예약 저장 ───────────────────────────────────────────
function handleNewBooking(data) {
  const sheet   = getSheet();
  const headers = getOrCreateHeaders(sheet);

  // 고유 ID 생성 (타임스탬프 기반)
  const id = String(Date.now());

  const row = headers.map(h => {
    if (h === 'id')        return id;
    if (h === 'slots')     return JSON.stringify(data.slots || [data.slot]);
    if (h === 'timestamp') return data.timestamp || new Date().toISOString();
    return data[h] ?? '';
  });

  sheet.appendRow(row);

  // 담당자 알림 메일
  sendAdminAlert(data, id);

  return jsonResponse({ success: true, id });
}


// ── 상태 업데이트 (확정 / 거절) ─────────────────────────────
function handleUpdateStatus(data) {
  const sheet   = getSheet();
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx     = headers.indexOf('id');
  const statusIdx = headers.indexOf('status');
  const purposeIdx = headers.indexOf('purpose');

  let targetRow = -1;
  let purposeFromSheet = '';
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      targetRow = i + 1; // Sheets는 1-based
      if (purposeIdx >= 0) purposeFromSheet = String(rows[i][purposeIdx] || '');
      break;
    }
  }

  if (targetRow < 0) return jsonResponse({ error: 'Record not found' });

  // status 컬럼 값 변경
  sheet.getRange(targetRow, statusIdx + 1).setValue(data.status);

  // 예약자에게 확정/거절 메일 발송 (목적은 sheet에서 읽은 값을 우선 사용)
  if (data.email) {
    const mailData = Object.assign({}, data, { purpose: data.purpose || purposeFromSheet });
    sendGuestMail(mailData);
  }

  return jsonResponse({ success: true });
}


// ============================================================
//  메일 발송
// ============================================================

// 담당자 알림 메일 (신규 예약 접수 시)
function sendAdminAlert(data, id) {
  const slotLabel = data.slotLabel || '';
  const subject   = `[ThinQ Real] 새 예약 신청 — ${data.date} ${slotLabel}`;
  const body = `
새로운 예약 신청이 접수되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  예약 ID : ${id}
  날  짜  : ${data.date}
  회  차  : ${slotLabel}
  이  름  : ${data.name}
  소  속  : ${data.org}
  연락처  : ${data.phone}
  이메일  : ${data.email}
  목  적  : ${data.purpose}
  인  원  : ${data.count}명
  요청사항: ${data.note || '없음'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

관리자 페이지에서 승인 또는 거절해 주세요.
  `.trim();

  try {
    MailApp.sendEmail({ to: ADMIN_EMAILS, cc: CC_EMAIL, subject, body });
    Logger.log('Admin mail sent → ' + ADMIN_EMAILS + ' (CC: ' + CC_EMAIL + ')');
  } catch(err) {
    Logger.log('Admin mail error: ' + err.message);
  }
}

// 구비 가전 — 평문 본문용 (HTML을 못 보는 클라이언트 대비)
function buildAppliancesText() {
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

// 구비 가전 — HTML 본문용 표 (브라우저 폭 변화에도 정렬 유지)
function buildAppliancesHtml() {
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 예약자 확정/거절 메일 — HTML + plain-text 동시 발송
function sendGuestMail(data) {
  const isConfirmed = data.status === '확정';
  const subject = isConfirmed
    ? `[ThinQ Real] 예약이 확정되었습니다 — ${data.date} ${data.slotLabel || ''}`
    : `[ThinQ Real] 예약 신청이 거절되었습니다`;

  const text = isConfirmed ? buildConfirmText(data) : buildRejectText(data);
  const html = isConfirmed ? buildConfirmHtml(data) : buildRejectHtml(data);

  try {
    MailApp.sendEmail({
      to: data.email, cc: CC_EMAIL, subject,
      body: text, htmlBody: html,
    });
    Logger.log('Guest mail sent → ' + data.email + ' (' + data.status + ')');
  } catch(err) {
    Logger.log('Guest mail error: ' + err.message);
  }
}

function buildConfirmText(data) {
  const includeAppliances = (data.purpose || '').indexOf('R&D') >= 0;

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
    `   2.4 GHz : LGE_AI_HOME_2.4G`,
    `   5 GHz   : LGE_AI_HOME`,
    `   비밀번호 : real2026`,
    ``,
    `☎ 문의`,
    `   이철호 책임 연구원 : ch275.lee@lge.com`,
    `   서문수 선임 연구원 : moonsu.seo@lge.com`,
    `   김현진 선임 연구원 : hj8462.kim@lge.com`,
    ``,
    `📖 방문 전 이용 안내`,
    `   ${GUIDE_URL}`,
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

function buildConfirmHtml(data) {
  const includeAppliances = (data.purpose || '').indexOf('R&D') >= 0;
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
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">2.4&nbsp;GHz</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">LGE_AI_HOME_2.4G</td></tr>' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">5&nbsp;GHz</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">LGE_AI_HOME</td></tr>' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">비밀번호</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">real2026</td></tr>' +
      '</table>') +
    infoRow('☎', '문의',
      '<div>이철호 책임 연구원 · <a href="mailto:ch275.lee@lge.com" style="color:#3a5035;text-decoration:none;">ch275.lee@lge.com</a></div>' +
      '<div>서문수 선임 연구원 · <a href="mailto:moonsu.seo@lge.com" style="color:#3a5035;text-decoration:none;">moonsu.seo@lge.com</a></div>' +
      '<div>김현진 선임 연구원 · <a href="mailto:hj8462.kim@lge.com" style="color:#3a5035;text-decoration:none;">hj8462.kim@lge.com</a></div>') +
    infoRow('📖', '방문 안내',
      '<a href="' + GUIDE_URL + '" style="color:#3a5035;font-weight:500;text-decoration:none;">방문 전 이용 안내 페이지 열기 ↗</a>' +
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

function buildRejectText(data) {
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
    `   ${GUIDE_URL}`,
    ``,
    `감사합니다.`,
    `HS플랫폼사업센터 AI홈솔루션엔지니어링팀`,
  ].join('\n');
}

function buildRejectHtml(data) {
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
            '<a href="' + GUIDE_URL + '" style="color:#3a5035;text-decoration:none;font-weight:500;">📖 방문 안내 페이지 열기 ↗</a>' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}

// ============================================================
//  메일 발송 진단 엔드포인트
//  - GET ?type=mail_status → 남은 할당량과 수신자 설정 반환 (메일은 보내지 않음)
//  - GET ?type=mail_test   → ADMIN_EMAILS + CC_EMAIL로 테스트 메일 1통 발송
// ============================================================

function handleMailStatus() {
  let quota = null;
  let quotaErr = null;
  try { quota = MailApp.getRemainingDailyQuota(); }
  catch(err) { quotaErr = err.message; }
  return jsonResponse({
    success: true,
    adminEmails: ADMIN_EMAILS,
    ccEmail: CC_EMAIL,
    remainingDailyQuota: quota,
    quotaError: quotaErr,
  });
}

function handleMailTest() {
  const subject = '[ThinQ Real] 메일 발송 테스트';
  const body = '이 메일이 도착했다면 알림 시스템이 정상 동작 중입니다.\n\n발송 시각: ' + new Date().toISOString();
  try {
    MailApp.sendEmail({ to: ADMIN_EMAILS, cc: CC_EMAIL, subject, body });
    return jsonResponse({
      success: true,
      message: '테스트 메일을 발송했습니다.',
      sentTo: ADMIN_EMAILS,
      cc: CC_EMAIL,
      remainingDailyQuota: MailApp.getRemainingDailyQuota(),
    });
  } catch(err) {
    return jsonResponse({
      success: false,
      error: err.message,
      hint: 'MailApp 권한이 미부여 상태일 가능성이 큽니다. Apps Script 에디터에서 sendAdminAlert 또는 handleMailTest 함수를 한 번 직접 실행해 권한 동의 다이얼로그를 통과해 주세요.',
    });
  }
}

function getSheet() {
  return SpreadsheetApp
    .openById(SHEET_ID)
    .getSheetByName(SHEET_NAME)
    || SpreadsheetApp.openById(SHEET_ID).insertSheet(SHEET_NAME);
}

// ============================================================
//  ROI 시나리오 스냅샷 (이력 관리)
//  - 시트 탭: roi_snapshots
//  - 컬럼: id, timestamp, label, author, inputs(JSON), outputs(JSON)
// ============================================================

function getRoiSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(ROI_SHEET_NAME) || ss.insertSheet(ROI_SHEET_NAME);
}

function getOrCreateRoiHeaders(sheet) {
  const HEADERS = ['id', 'timestamp', 'label', 'author', 'inputs', 'outputs'];
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#3a5035');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return HEADERS;
}

function handleGetRoiSnapshots() {
  const sheet = getRoiSheet();
  getOrCreateRoiHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const records = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j] ?? ''; });
    try { obj.inputs  = JSON.parse(obj.inputs  || '{}'); } catch(err) { obj.inputs  = {}; }
    try { obj.outputs = JSON.parse(obj.outputs || '{}'); } catch(err) { obj.outputs = {}; }
    return obj;
  }).filter(r => r.id);
  // 최신순 정렬 (timestamp 내림차순)
  records.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return jsonResponse({ records });
}

function handleNewRoiSnapshot(data) {
  const sheet = getRoiSheet();
  const headers = getOrCreateRoiHeaders(sheet);
  const id = String(Date.now());
  const row = headers.map(h => {
    if (h === 'id')        return id;
    if (h === 'timestamp') return data.timestamp || new Date().toISOString();
    if (h === 'inputs')    return JSON.stringify(data.inputs  || {});
    if (h === 'outputs')   return JSON.stringify(data.outputs || {});
    return data[h] ?? '';
  });
  sheet.appendRow(row);
  return jsonResponse({ success: true, id });
}

function handleDeleteRoiSnapshot(data) {
  const sheet = getRoiSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ error: 'Record not found' });
}

// 헤더가 없으면 자동 생성
function getOrCreateHeaders(sheet) {
  const HEADERS = [
    'id', 'timestamp', 'date', 'slots', 'slot', 'slotLabel',
    'name', 'org', 'phone', 'email',
    'purpose', 'count', 'note', 'status'
  ];
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    // 헤더 행 스타일
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#3a5035');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return HEADERS;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
