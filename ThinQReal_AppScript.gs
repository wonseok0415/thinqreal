// ============================================================
//  ThinQ Real — Google Apps Script
//  역할: 예약 저장 / 가용성 조회 / 승인·거절 처리 + 메일 발송
//
//  배포 방법:
//  1. script.google.com → 새 프로젝트 생성
//  2. 이 코드 전체 붙여넣기
//  3. SHEET_ID를 실제 Google Sheets ID로 교체
//  4. 배포 → 새 배포 → 웹 앱 → 액세스: 모든 사용자 → 배포
//  5. 생성된 URL을 index.html과 thinqreal_admin.html의
//     SCRIPT_URL 변수에 붙여넣기
// ============================================================

// ── 설정값 ──────────────────────────────────────────────────
const SHEET_ID   = '1-Z158TV46MtSEArir9bW4h4KQ438NCuhb3qaGyOooA0';  // ← Sheets URL의 /d/ 뒤 ID
const SHEET_NAME = 'bookings';               // 시트 탭 이름 (예약)
const ROI_SHEET_NAME = 'roi_snapshots';      // 시트 탭 이름 (ROI 시나리오 이력)
const ARTICLES_SHEET_NAME = 'monthly_articles'; // 시트 탭 이름 (월간 리포트 수동 큐레이션 기사)
// 신규 예약 알림을 받는 담당자들 (콤마로 구분, MailApp이 다중 수신 처리)
const ADMIN_EMAILS = 'ch275.lee@lge.com, moonsu.seo@lge.com, hj8462.kim@lge.com';
const CC_EMAIL     = 'kang.wonseok@lge.com';  // 참조 수신자 (시스템 동작 모니터링)

// 방문 전 이용 안내 페이지 URL (이용안내 탭으로 직접 이동)
const GUIDE_URL = 'https://thinqreal.com/#page-guide';

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
  if (type === 'monthly_report_preview') {
    return handleMonthlyReportPreview(e.parameter);
  }
  if (type === 'monthly_report_send') {
    return handleMonthlyReportSend(e.parameter);
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
// 대기중은 마감으로 처리하지 않되, 회차별 대기 건수를 별도로 반환해
// 메인 페이지에서 "N팀 예약 중" 안내로 노출할 수 있게 한다.
function handleAvailability(date) {
  if (!date) return jsonResponse({ bookedSlots: [], pendingCounts: {} });

  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  const dateIdx   = headers.indexOf('date');
  const slotIdx   = headers.indexOf('slots');
  const statusIdx = headers.indexOf('status');

  const booked = new Set();
  const pendingCounts = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Sheets가 date 컬럼을 Date 타입으로 자동 변환하는 경우가 있어
    // 비교 전에 양쪽 모두 YYYY-MM-DD 문자열로 정규화한다.
    if (normalizeDate(row[dateIdx]) !== normalizeDate(date)) continue;

    const status = row[statusIdx];
    if (status !== '확정' && status !== '대기중') continue;

    // slots 컬럼은 "[1,2]" 형태의 JSON 문자열로 저장됨
    let slots = [];
    try {
      slots = JSON.parse(row[slotIdx]);
    } catch(err) {
      // 구형 데이터(slot 단일값) 대응
      const singleSlot = headers.indexOf('slot');
      if (singleSlot >= 0 && row[singleSlot]) {
        slots = [Number(row[singleSlot])];
      }
    }

    slots.forEach(s => {
      const n = Number(s);
      if (status === '확정') {
        booked.add(n);
      } else {
        pendingCounts[n] = (pendingCounts[n] || 0) + 1;
      }
    });
  }

  return jsonResponse({ bookedSlots: [...booked], pendingCounts });
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
  if (data.type === 'booking_delete') return handleDeleteBooking(data);
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


// 예약 영구 삭제 — id로 행을 찾아 제거. 메일은 발송하지 않음 (테스트·실수 데이터 정리용).
function handleDeleteBooking(data) {
  const sheet   = getSheet();
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx   = headers.indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      sheet.deleteRow(i + 1); // Sheets는 1-based
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ error: 'Record not found' });
}


// ============================================================
//  메일 발송
// ============================================================

// 담당자 알림 메일 (신규 예약 접수 시)
function sendAdminAlert(data, id) {
  const slotLabel = data.slotLabel || '';
  const subject   = `[ThinQ Real] 새 예약 신청 — ${data.date} ${slotLabel}`;

  // 방문자 명단 정리
  let visitorsLines = '';
  try {
    const vs = JSON.parse(data.visitors || '[]');
    if (vs.length) {
      visitorsLines = '\n  방문자  :\n' + vs.map((v, i) => {
        const parts = [v.org, v.name, v.rank].filter(Boolean).join(' / ');
        return '            ' + String(i + 1).padStart(2, ' ') + '. ' + parts;
      }).join('\n');
    }
  } catch(e) {}

  // 목적별 1번째 줄 라벨
  const subjLabelMap = {
    'customer':       '고객/고객사',
    'rd':             '프로젝트명',
    'internal-event': '행사명',
    'external-event': '행사명',
    'content':        '촬영명',
    'other':          '제목'
  };
  const subjLabel = subjLabelMap[data.purposeKey] || '제목';

  const body = `
새로운 예약 신청이 접수되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  예약 ID : ${id}
  날  짜  : ${data.date}
  회  차  : ${slotLabel}
  목  적  : ${data.purpose}
  ${subjLabel.padEnd(7, ' ')}: ${data.subject || data.org || ''}
  책임자  : ${data.name}
  연락처  : ${data.phone}
  이메일  : ${data.email}
  인  원  : ${data.count}명${visitorsLines}

  활용 방안 :
${(data.usagePlan || '').split('\n').map(l => '    ' + l).join('\n')}

  기대 효과 :
${(data.expectedEffect || '').split('\n').map(l => '    ' + l).join('\n')}
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
    `   2.4 GHz : ThinQ_REAL_2.4G`,
    `   5 GHz   : ThinQ_REAL`,
    `   비밀번호 : real2026`,
    ``,
    `🔐 도어락 비밀번호`,
    `   56720275`,
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
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">2.4&nbsp;GHz</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">ThinQ_REAL_2.4G</td></tr>' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">5&nbsp;GHz</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">ThinQ_REAL</td></tr>' +
        '<tr><td style="padding:2px 16px 2px 0;color:#6e6e73;font-size:13px;">비밀번호</td><td style="padding:2px 0;font-family:Consolas,Menlo,monospace;font-size:13px;color:#1d1d1f;">real2026</td></tr>' +
      '</table>') +
    infoRow('🔐', '도어락 비밀번호',
      '<div style="font-family:Consolas,Menlo,monospace;font-size:15px;color:#1d1d1f;letter-spacing:0.04em;">56720275</div>') +
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
//  월간 운영 리포트 (매월 마지막 금요일 08:30 KST 자동 발송)
//  - 트리거 설치는 1회: 스크립트 에디터에서 installMonthlyReportTrigger() 실행
//  - 매일 08:30 시간 트리거가 동작 → 함수 내부에서 "오늘이 이번 달 마지막 금요일인가" 체크
//  - 수신자/CSE 키는 Script Properties에서 관리 (코드에 키 미노출)
//      MONTHLY_REPORT_TO   : 콤마 구분 수신자 (없으면 발송 스킵)
//      GOOGLE_CSE_ID       : Programmable Search Engine ID (cx)  [선택]
//      GOOGLE_CSE_KEY      : Custom Search API Key                [선택]
//  - 수동 미리보기: GET ?type=monthly_report_preview&month=YYYY-MM
//  - 수동 발송    : GET ?type=monthly_report_send&month=YYYY-MM&confirm=YES
// ============================================================

const MONTHLY_REPORT_QUERY = 'LG전자 ThinQ Real';
const PROP_LAST_SENT_KEY   = 'monthly_report_last_sent_month';

function installMonthlyReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'monthlyReportTrigger') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('monthlyReportTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(30)
    .create();
  return '월간 리포트 트리거 설치 완료 (매일 08:30 — 스크립트 TZ 기준)';
}

function monthlyReportTrigger() {
  const now = new Date();
  if (!isLastFridayOfMonth(now)) return;
  const monthKey = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_LAST_SENT_KEY) === monthKey) return; // 이번 달 중복 발송 방지
  try {
    const result = sendMonthlyReport({ month: monthKey });
    if (result.sentTo) props.setProperty(PROP_LAST_SENT_KEY, monthKey);
  } catch(err) {
    Logger.log('Monthly report send error: ' + err.message);
  }
}

// 스크립트 TZ 기준 오늘이 이번 달의 마지막 금요일인지 판정
function isLastFridayOfMonth(d) {
  const tz = Session.getScriptTimeZone();
  const dow = Number(Utilities.formatDate(d, tz, 'u')); // 1=Mon ... 7=Sun
  if (dow !== 5) return false;
  const next = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisMonth = Utilities.formatDate(d,    tz, 'MM');
  const nextMonth = Utilities.formatDate(next, tz, 'MM');
  return nextMonth !== thisMonth;
}

// options: { month?: 'YYYY-MM', dryRun?: bool, to?: 'override@a, override@b' }
function sendMonthlyReport(options) {
  options = options || {};
  const tz = Session.getScriptTimeZone();
  const props = PropertiesService.getScriptProperties();
  const month = options.month || Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const to    = options.to    || props.getProperty('MONTHLY_REPORT_TO') || '';

  const data = collectMonthlyData(month);
  const text = buildMonthlyReportText(data);
  const html = buildMonthlyReportHtml(data);
  const subject = `[ThinQ Real] ${data.year}년 ${data.monthNum}월 운영 리포트`;

  if (options.dryRun) return { subject, html, text, data, sentTo: '' };
  if (!to) {
    Logger.log('Monthly report skipped: MONTHLY_REPORT_TO 미설정');
    return { subject, sentTo: '', skipped: 'no recipients' };
  }
  MailApp.sendEmail({
    to: to, cc: CC_EMAIL, subject: subject,
    body: text, htmlBody: html,
    name: 'ThinQ Real',
  });
  Logger.log('Monthly report sent → ' + to + ' (' + month + ')');
  return { subject, sentTo: to };
}

function collectMonthlyData(month) {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr), monthNum = Number(mStr);

  // 1) 예약 (date 컬럼이 해당 월에 속하는 모든 건)
  const bookingsSheet = getSheet();
  const brows = bookingsSheet.getDataRange().getValues();
  const bheaders = brows[0];
  const bookings = brows.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    bheaders.forEach((h, j) => {
      let v = row[j];
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = (h === 'date') ? normalizeDate(v) : v.toISOString();
      }
      obj[h] = v == null ? '' : v;
    });
    return obj;
  }).filter(b => b.date && String(b.date).slice(0, 7) === month);

  const confirmed = bookings.filter(b => b.status === '확정');
  const rejected  = bookings.filter(b => b.status === '거절');
  const pending   = bookings.filter(b => b.status === '대기중');
  const totalVisitors = confirmed.reduce((sum, b) => sum + (Number(b.count) || 0), 0);

  const purposeCounts = {};
  confirmed.forEach(b => {
    const k = b.purpose || '기타';
    purposeCounts[k] = (purposeCounts[k] || 0) + 1;
  });

  confirmed.sort((a, b) => {
    const c = String(a.date).localeCompare(String(b.date));
    return c !== 0 ? c : String(a.slotLabel || '').localeCompare(String(b.slotLabel || ''));
  });

  // 2) ROI 스냅샷 (timestamp가 해당 월에 속하는 모든 건)
  const roiSheet = getRoiSheet();
  getOrCreateRoiHeaders(roiSheet);
  const rrows = roiSheet.getDataRange().getValues();
  const rheaders = rrows[0];
  const roi = rrows.slice(1).map(row => {
    const obj = {};
    rheaders.forEach((h, j) => {
      let v = row[j];
      if (Object.prototype.toString.call(v) === '[object Date]') v = v.toISOString();
      obj[h] = v == null ? '' : v;
    });
    try { obj.inputs  = JSON.parse(obj.inputs  || '{}'); } catch(err) { obj.inputs  = {}; }
    try { obj.outputs = JSON.parse(obj.outputs || '{}'); } catch(err) { obj.outputs = {}; }
    return obj;
  }).filter(r => r.id && String(r.timestamp).slice(0, 7) === month)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  // 3) 관련 기사 — 수동 큐레이션 우선, 없으면 Google Custom Search
  const manualItems = getManualArticles(month);
  let articles;
  if (manualItems.length > 0) {
    articles = { items: manualItems, skipReason: '', source: 'manual' };
  } else {
    articles = fetchThinqRealArticles();
    articles.source = 'cse';
  }

  return {
    month, year, monthNum,
    kpi: {
      total: bookings.length,
      confirmed: confirmed.length,
      rejected: rejected.length,
      pending: pending.length,
      visitors: totalVisitors,
    },
    confirmed, rejected, pending,
    purposeCounts,
    roi,
    articles,
  };
}

// 시트 탭 monthly_articles에서 이번 달 수동 큐레이션 기사 읽기
// 담당자가 발송 전에 시트에 행을 추가해두면 메일 본문에 자동 포함됨
function getArticlesSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(ARTICLES_SHEET_NAME) || ss.insertSheet(ARTICLES_SHEET_NAME);
}

function getOrCreateArticlesHeaders(sheet) {
  const HEADERS = ['month', 'title', 'url', 'source', 'summary', 'published_at'];
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

function getManualArticles(month) {
  const sheet = getArticlesSheet();
  getOrCreateArticlesHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || ''));
  const idxMonth   = headers.indexOf('month');
  const idxTitle   = headers.indexOf('title');
  const idxUrl     = headers.indexOf('url');
  const idxSource  = headers.indexOf('source');
  const idxSummary = headers.indexOf('summary');
  const idxPubAt   = headers.indexOf('published_at');
  if (idxMonth < 0 || idxTitle < 0 || idxUrl < 0) return [];

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowMonth = normalizeMonth(row[idxMonth]);
    if (rowMonth !== month) continue;
    const title = String(row[idxTitle] || '').trim();
    const url   = String(row[idxUrl]   || '').trim();
    if (!title || !url) continue;
    items.push({
      title: title,
      link:  url,
      source: idxSource  >= 0 ? String(row[idxSource]  || '').trim() : '',
      snippet: idxSummary >= 0 ? String(row[idxSummary] || '').trim() : '',
      publishedAt: idxPubAt >= 0 ? formatPublishedDate(row[idxPubAt]) : '',
    });
  }
  return items;
}

// 셀 값이 Date 객체이거나 YYYY-MM-DD 형식 문자열이거나 비어 있을 때를 모두 처리
function normalizeMonth(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return String(v).slice(0, 7);
}

function formatPublishedDate(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

function fetchThinqRealArticles() {
  const props = PropertiesService.getScriptProperties();
  const cx  = props.getProperty('GOOGLE_CSE_ID');
  const key = props.getProperty('GOOGLE_CSE_KEY');
  if (!cx || !key) {
    return { items: [], skipReason: 'Google Custom Search 키 미설정 (Script Properties에 GOOGLE_CSE_ID / GOOGLE_CSE_KEY 등록 필요)' };
  }
  const url = 'https://www.googleapis.com/customsearch/v1'
    + '?q=' + encodeURIComponent(MONTHLY_REPORT_QUERY)
    + '&cx=' + encodeURIComponent(cx)
    + '&key=' + encodeURIComponent(key)
    + '&num=10&dateRestrict=m1&hl=ko&gl=kr';
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      let detail = '';
      try {
        const errBody = JSON.parse(resp.getContentText());
        if (errBody && errBody.error && errBody.error.message) detail = ' — ' + errBody.error.message;
      } catch(_) {}
      return { items: [], skipReason: 'CSE 응답 코드 ' + resp.getResponseCode() + detail };
    }
    const body = JSON.parse(resp.getContentText());
    const items = (body.items || []).map(it => ({
      title:   it.title || '',
      link:    it.link  || '',
      source:  (it.displayLink || '').replace(/^www\./, ''),
      snippet: it.snippet || '',
    }));
    return { items, skipReason: items.length ? '' : '검색 결과 없음' };
  } catch(err) {
    return { items: [], skipReason: 'CSE 호출 오류: ' + err.message };
  }
}

// ROI outputs 객체 → 표시용 KPI 추출 (ROI 툴의 collectOutputs 키 기준)
function roiKpiLine(o) {
  if (!o || typeof o !== 'object') return '';
  const parts = [];
  if (o.annualValue != null) parts.push('연간가치 ' + fmtKRWReport(o.annualValue));
  if (o.bepText) parts.push('BEP ' + o.bepText);
  else if (o.bepYears != null && isFinite(o.bepYears)) parts.push('BEP ' + Number(o.bepYears).toFixed(2) + '년');
  if (o.roi3 != null && isFinite(o.roi3)) parts.push('3년 ROI ' + (o.roi3 >= 0 ? '+' : '') + Number(o.roi3).toFixed(1) + '%');
  if (o.roi5 != null && isFinite(o.roi5)) parts.push('5년 ROI ' + (o.roi5 >= 0 ? '+' : '') + Number(o.roi5).toFixed(1) + '%');
  return parts.join('  ·  ');
}

function fmtKRWReport(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0원';
  const abs = Math.abs(v);
  const eok = Math.floor(abs / 1e8);
  const man = Math.floor((abs % 1e8) / 1e4);
  let s = '';
  if (eok > 0) s += eok + '억 ';
  if (man > 0 || eok === 0) s += man.toLocaleString() + '만원';
  else s = s.trim() + '원';
  return (v < 0 ? '-' : '') + s.trim();
}

function prettyRoiLabel(label) {
  const m = String(label || '').match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
  return m ? (m[1] + ' 시나리오') : (label || '(이름 없음)');
}

// ── 텍스트 빌더 ────────────────────────────
function buildMonthlyReportText(d) {
  const L = [];
  L.push(`ThinQ Real ${d.year}년 ${d.monthNum}월 운영 리포트`);
  L.push('');
  L.push('이번 달 ThinQ Real 운영 결과를 안내드립니다.');
  L.push('');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('📊 핵심 지표');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(`   총 예약 신청     ${d.kpi.total}건`);
  L.push(`   확정             ${d.kpi.confirmed}건`);
  L.push(`   거절             ${d.kpi.rejected}건`);
  L.push(`   대기중           ${d.kpi.pending}건`);
  L.push(`   총 방문 인원     ${d.kpi.visitors}명 (확정 기준)`);
  L.push('');

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('🎯 방문 목적별 분포 (확정 기준)');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const sorted = Object.keys(d.purposeCounts).map(k => [k, d.purposeCounts[k]])
    .sort((a, b) => b[1] - a[1]);
  if (!sorted.length) L.push('   (해당 없음)');
  else sorted.forEach(([k, v]) => L.push(`   ${k}  —  ${v}건`));
  L.push('');

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('📅 방문 이력 (확정)');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!d.confirmed.length) {
    L.push('   (이번 달 확정된 방문 없음)');
  } else {
    d.confirmed.forEach(b => {
      L.push(`   ${b.date}  ${b.slotLabel || ''}`);
      L.push(`     목적: ${b.purpose || '-'}`);
      if (b.subject || b.org) L.push(`     주제: ${b.subject || b.org}`);
      if (b.clientCompany) L.push(`     소속: ${b.clientCompany}`);
      L.push(`     책임자: ${b.name || '-'} · ${Number(b.count) || 1}명`);
      L.push('');
    });
  }

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('💰 ROI 신규 스냅샷');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!d.roi.length) {
    L.push('   (이번 달 저장된 스냅샷 없음)');
  } else {
    d.roi.forEach(r => {
      L.push(`   • ${prettyRoiLabel(r.label)}`);
      if (r.author) L.push(`     작성자: ${r.author}`);
      const kpi = roiKpiLine(r.outputs);
      if (kpi) L.push(`     ${kpi}`);
      L.push('');
    });
  }

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(d.articles.source === 'manual'
    ? '📰 관련 기사 (담당자 큐레이션)'
    : '📰 관련 기사 (Google "LG전자 ThinQ Real" 검색, 최근 1개월)');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!d.articles.items.length) {
    L.push('   (' + (d.articles.skipReason || '검색 결과 없음') + ')');
  } else {
    d.articles.items.forEach(it => {
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

  L.push('');
  L.push('감사합니다.');
  L.push('HS플랫폼사업센터 AI홈솔루션엔지니어링팀');
  return L.join('\n');
}

// ── HTML 빌더 ──────────────────────────────
function buildMonthlyReportHtml(d) {
  const sectionHeader = (icon, title, sub) =>
    '<tr><td style="padding:24px 28px 8px;">' +
      '<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6e6e73;font-weight:600;">' + icon + '&nbsp;&nbsp;' + escapeHtml(title) + '</div>' +
      (sub ? '<div style="font-size:12px;color:#aeaeb2;margin-top:2px;">' + escapeHtml(sub) + '</div>' : '') +
    '</td></tr>';

  const kpiCell = (label, value, accent) =>
    '<td valign="top" align="center" style="padding:14px 8px;background:#f5f5f7;border-radius:10px;">' +
      '<div style="font-size:22px;font-weight:600;color:' + (accent || '#1d1d1f') + ';line-height:1.1;">' + escapeHtml(String(value)) + '</div>' +
      '<div style="font-size:11px;color:#6e6e73;margin-top:6px;letter-spacing:0.04em;">' + escapeHtml(label) + '</div>' +
    '</td>';

  const kpiTable =
    '<tr><td style="padding:0 28px 8px;">' +
      '<table role="presentation" cellspacing="8" cellpadding="0" border="0" style="border-collapse:separate;width:100%;">' +
        '<tr>' +
          kpiCell('총 신청', d.kpi.total + '건') +
          kpiCell('확정', d.kpi.confirmed + '건', '#3a5035') +
          kpiCell('거절', d.kpi.rejected + '건', '#6e6e73') +
          kpiCell('방문 인원', d.kpi.visitors + '명', '#3a5035') +
        '</tr>' +
      '</table>' +
    '</td></tr>';

  // 목적별 분포
  const purposeRows = Object.keys(d.purposeCounts)
    .map(k => [k, d.purposeCounts[k]])
    .sort((a, b) => b[1] - a[1]);
  let purposeBody;
  if (!purposeRows.length) {
    purposeBody = '<div style="font-size:13px;color:#aeaeb2;">해당 없음</div>';
  } else {
    const max = Math.max.apply(null, purposeRows.map(r => r[1]));
    purposeBody = '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
      purposeRows.map(([k, v]) => {
        const pct = Math.max(6, Math.round((v / max) * 100));
        return '<tr>' +
          '<td style="padding:6px 12px 6px 0;font-size:13px;color:#1d1d1f;white-space:nowrap;width:1%;">' + escapeHtml(k) + '</td>' +
          '<td style="padding:6px 8px;">' +
            '<div style="background:#eef0e9;border-radius:4px;height:8px;width:100%;">' +
              '<div style="background:#3a5035;height:8px;width:' + pct + '%;border-radius:4px;"></div>' +
            '</div>' +
          '</td>' +
          '<td style="padding:6px 0 6px 8px;font-size:13px;color:#1d1d1f;font-variant-numeric:tabular-nums;white-space:nowrap;width:1%;">' + v + '건</td>' +
        '</tr>';
      }).join('') +
    '</table>';
  }

  // 방문 이력 테이블
  let visitsBody;
  if (!d.confirmed.length) {
    visitsBody = '<div style="font-size:13px;color:#aeaeb2;">이번 달 확정된 방문 없음</div>';
  } else {
    const th = (txt) => '<th align="left" style="font-size:11px;color:#6e6e73;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;padding:8px 10px;border-bottom:1px solid #eeeeee;background:#fafafa;">' + escapeHtml(txt) + '</th>';
    const td = (html, opts) => '<td style="padding:10px;font-size:13px;color:#1d1d1f;border-bottom:1px solid #f2f2f2;vertical-align:top;' + ((opts && opts.nowrap) ? 'white-space:nowrap;' : '') + '">' + html + '</td>';
    visitsBody = '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
      '<thead><tr>' + th('일자') + th('회차') + th('목적') + th('주제 · 소속') + th('책임자') + th('인원') + '</tr></thead>' +
      '<tbody>' +
        d.confirmed.map(b => {
          const subjLines = [];
          if (b.subject) subjLines.push(escapeHtml(b.subject));
          if (b.clientCompany) subjLines.push('<span style="color:#aeaeb2;font-size:12px;">' + escapeHtml(b.clientCompany) + '</span>');
          const subjHtml = subjLines.length ? subjLines.join('<br>') : '<span style="color:#aeaeb2;">-</span>';
          return '<tr>' +
            td(escapeHtml(b.date), { nowrap: true }) +
            td(escapeHtml(b.slotLabel || ''), { nowrap: true }) +
            td(escapeHtml(b.purpose || '-')) +
            td(subjHtml) +
            td(escapeHtml(b.name || '-')) +
            td((Number(b.count) || 1) + '명', { nowrap: true }) +
          '</tr>';
        }).join('') +
      '</tbody>' +
    '</table>';
  }

  // ROI 스냅샷
  let roiBody;
  if (!d.roi.length) {
    roiBody = '<div style="font-size:13px;color:#aeaeb2;">이번 달 저장된 스냅샷 없음</div>';
  } else {
    roiBody = d.roi.map(r => {
      const o = r.outputs || {};
      const chips = [];
      if (o.annualValue != null) chips.push(roiChip('연간가치', fmtKRWReport(o.annualValue)));
      if (o.bepText) chips.push(roiChip('BEP', o.bepText));
      else if (o.bepYears != null && isFinite(o.bepYears)) chips.push(roiChip('BEP', Number(o.bepYears).toFixed(2) + '년'));
      if (o.roi3 != null && isFinite(o.roi3)) chips.push(roiChip('3년 ROI', (o.roi3 >= 0 ? '+' : '') + Number(o.roi3).toFixed(1) + '%'));
      if (o.roi5 != null && isFinite(o.roi5)) chips.push(roiChip('5년 ROI', (o.roi5 >= 0 ? '+' : '') + Number(o.roi5).toFixed(1) + '%'));
      return '<div style="border:1px solid #eeeeee;border-radius:10px;padding:14px 16px;margin-bottom:10px;">' +
        '<div style="font-size:14px;font-weight:600;color:#1d1d1f;">' + escapeHtml(prettyRoiLabel(r.label)) + '</div>' +
        (r.author ? '<div style="font-size:12px;color:#6e6e73;margin-top:2px;">작성자: ' + escapeHtml(String(r.author)) + '</div>' : '') +
        (chips.length ? '<div style="margin-top:10px;">' + chips.join('') + '</div>' : '') +
      '</div>';
    }).join('');
  }

  // 기사
  let articlesBody;
  if (!d.articles.items.length) {
    articlesBody = '<div style="font-size:13px;color:#aeaeb2;">' + escapeHtml(d.articles.skipReason || '검색 결과 없음') + '</div>';
  } else {
    articlesBody = d.articles.items.map(it => {
      const meta = [it.source, it.publishedAt].filter(Boolean).map(escapeHtml).join(' · ');
      return (
        '<div style="padding:12px 0;border-bottom:1px solid #f2f2f2;">' +
          '<a href="' + escapeHtml(it.link) + '" style="font-size:14px;color:#3a5035;text-decoration:none;font-weight:600;">' + escapeHtml(it.title) + '</a>' +
          (meta ? '<div style="font-size:11px;color:#aeaeb2;margin-top:2px;">' + meta + '</div>' : '') +
          (it.snippet ? '<div style="font-size:13px;color:#3a3a3c;margin-top:4px;line-height:1.5;">' + escapeHtml(it.snippet) + '</div>' : '') +
        '</div>'
      );
    }).join('');
  }

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:760px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">' + escapeHtml(d.year + '년 ' + d.monthNum + '월 운영 리포트') + '</div>' +
          '<div style="font-size:13px;opacity:0.85;margin-top:6px;">이번 달 ThinQ Real 운영 결과를 안내드립니다.</div>' +
        '</td></tr>' +
        sectionHeader('📊', '핵심 지표', null) +
        kpiTable +
        sectionHeader('🎯', '방문 목적별 분포', '확정 기준') +
        '<tr><td style="padding:0 28px 16px;">' + purposeBody + '</td></tr>' +
        sectionHeader('📅', '방문 이력', '확정 ' + d.confirmed.length + '건') +
        '<tr><td style="padding:0 28px 16px;">' + visitsBody + '</td></tr>' +
        sectionHeader('💰', 'ROI 신규 스냅샷', '이번 달 저장 ' + d.roi.length + '건') +
        '<tr><td style="padding:0 28px 16px;">' + roiBody + '</td></tr>' +
        sectionHeader('📰', '관련 기사', d.articles.source === 'manual'
          ? '담당자 큐레이션 · ' + d.articles.items.length + '건'
          : 'Google "LG전자 ThinQ Real" · 최근 1개월') +
        '<tr><td style="padding:0 28px 24px;">' + articlesBody + '</td></tr>' +
        '<tr><td style="padding:20px 28px 28px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
          '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}

function roiChip(label, value) {
  return '<span style="display:inline-block;margin:0 8px 6px 0;padding:5px 10px;background:#f5f5f7;border-radius:999px;font-size:12px;color:#1d1d1f;">' +
    '<span style="color:#6e6e73;">' + escapeHtml(label) + '</span>&nbsp;<strong>' + escapeHtml(String(value)) + '</strong>' +
  '</span>';
}

// 미리보기 / 수동 발송 엔드포인트
function handleMonthlyReportPreview(params) {
  const result = sendMonthlyReport({ month: params.month, dryRun: true });
  return HtmlService.createHtmlOutput(result.html).setTitle(result.subject);
}

function handleMonthlyReportSend(params) {
  if (params.confirm !== 'YES') {
    // 확인 가드 — 실수 발송 방지
    const result = sendMonthlyReport({ month: params.month, dryRun: true });
    return jsonResponse({
      success: false,
      hint: '실제 발송하려면 동일 URL에 &confirm=YES 를 추가하세요.',
      previewSubject: result.subject,
    });
  }
  const result = sendMonthlyReport({ month: params.month, to: params.to });
  return jsonResponse({ success: true, subject: result.subject, sentTo: result.sentTo || '(skipped)' });
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

// 헤더가 없으면 자동 생성. 이미 있다면 신규 컬럼만 추가 (마이그레이션 지원).
function getOrCreateHeaders(sheet) {
  const HEADERS = [
    'id', 'timestamp', 'date', 'slots', 'slot', 'slotLabel',
    'name', 'org', 'phone', 'email',
    'purpose', 'count', 'note', 'status',
    // 2026-05 폼 상세화로 추가된 컬럼
    'subject', 'clientCompany', 'visitors', 'usagePlan', 'expectedEffect', 'purposeKey'
  ];
  const lastCol  = Math.max(sheet.getLastColumn(), 1);
  const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (!firstRow[0]) {
    // 빈 시트 — 헤더 전체 작성
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#3a5035');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    return HEADERS;
  }

  // 기존 헤더에 누락된 신규 컬럼만 끝에 추가
  const existing = firstRow.map(v => String(v || ''));
  const missing  = HEADERS.filter(h => existing.indexOf(h) < 0);
  if (missing.length) {
    const startCol = existing.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    const newRange = sheet.getRange(1, startCol, 1, missing.length);
    newRange.setBackground('#3a5035');
    newRange.setFontColor('#ffffff');
    newRange.setFontWeight('bold');
    return existing.concat(missing);
  }
  return existing;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
