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
const SLOT_BLOCKS_SHEET_NAME = 'slot_blocks';   // 시트 탭 이름 (관리자 슬롯 차단)
// 신규 예약 알림을 받는 담당자들 (콤마로 구분, MailApp이 다중 수신 처리)
const ADMIN_EMAILS = 'ch275.lee@lge.com, moonsu.seo@lge.com, hj8462.kim@lge.com';
const CC_EMAIL     = 'kang.wonseok@lge.com';  // 참조 수신자 (시스템 동작 모니터링)

// 방문 전 이용 안내 페이지 URL (이용안내 탭으로 직접 이동)
const GUIDE_URL = 'https://thinqreal.com/#page-guide';

// ── 사이트 접근 통제 (이메일 게이트, 4안) ─────────────────────
// 허용 이메일 도메인. 임직원 검증 + 사이트 자체 차단을 동시에 만족.
const AUTH_ALLOWED_DOMAINS = ['lge.com'];
// 인증 코드 유효 시간 / 토큰 유효 기간 / 재요청 쿨다운
const AUTH_CODE_TTL_SEC   = 10 * 60;        // 10분
const AUTH_TOKEN_TTL_DAYS = 30;             // 30일 쿠키
const AUTH_COOLDOWN_SEC   = 60;             // 60초 재요청 방지

// ── 관리자 접근 통제 ─────────────────────────────────────────
// 이 명단의 메일만 관리자 인증·삭제·승인·슬롯 제어를 수행할 수 있다.
// 메인 사이트 게이트(@lge.com 전체)보다 강하게 한정한다.
const AUTH_ADMIN_EMAILS = [
  'kang.wonseok@lge.com',  // 강원석 — 시스템 운영
  'jhs.kim@lge.com',       // 김재훈 팀장
  'ch275.lee@lge.com',     // 이철호 책임
  'moonsu.seo@lge.com',    // 서문수 선임
  'hj8462.kim@lge.com'     // 김현진 선임
];
const AUTH_ADMIN_TOKEN_TTL_DAYS = 7;        // 관리자 토큰은 7일 (메인보다 짧게)

// ── 텔레그램 알림 (담당자 그룹 채팅) ─────────────────────────
// Bot 토큰과 그룹 chat_id는 Script Property에 저장 (코드·리포 미커밋).
//   TELEGRAM_BOT_TOKEN  : @BotFather에서 발급받은 봇 토큰
//   TELEGRAM_CHAT_ID    : 그룹 채팅 ID (보통 음수, 예: -1001234567890)
// 둘 중 하나라도 비어 있으면 알림 단계가 silent skip — 다른 동작에는 영향 없음.
const TELEGRAM_PROP_TOKEN   = 'TELEGRAM_BOT_TOKEN';
const TELEGRAM_PROP_CHAT_ID = 'TELEGRAM_CHAT_ID';

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
    return handleGetBookings(e.parameter.token);
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
  if (type === 'auth_request') {
    return handleAuthRequest(e.parameter.email);
  }
  if (type === 'auth_verify') {
    return handleAuthVerify(e.parameter.email, e.parameter.code);
  }
  if (type === 'admin_auth_request') {
    return handleAdminAuthRequest(e.parameter.email);
  }
  if (type === 'admin_auth_verify') {
    return handleAdminAuthVerify(e.parameter.email, e.parameter.code);
  }
  if (type === 'slot_blocks') {
    return handleGetSlotBlocks(e.parameter.date);
  }
  if (type === 'telegram_test') {
    return handleTelegramTest();
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
  if (!date) return jsonResponse({ bookedSlots: [], pendingCounts: {}, blockedSlots: [] });

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

  // 관리자가 차단한 슬롯을 합류 (운영 사정상 예약 불가)
  const blocked = [];
  try {
    const bSheet = getSlotBlocksSheet();
    const bRows  = bSheet.getDataRange().getValues();
    const bH     = bRows[0];
    const bdi = bH.indexOf('date'), bsi = bH.indexOf('slot');
    for (let i = 1; i < bRows.length; i++) {
      if (normalizeDate(bRows[i][bdi]) === normalizeDate(date)) {
        blocked.push(Number(bRows[i][bsi]));
      }
    }
  } catch (e) { /* slot_blocks 시트 미생성 등은 무시 */ }

  return jsonResponse({ bookedSlots: [...booked], pendingCounts, blockedSlots: blocked });
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
// 개인정보(이름·전화·이메일)를 포함하므로 관리자 토큰 필수.
function handleGetBookings(token) {
  const admin = verifyAdminToken(token);
  if (!admin.ok) {
    return jsonResponse({ error: 'unauthorized', reason: admin.reason || 'invalid_token' });
  }
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
  if (data.type === 'roi_snapshot') return handleNewRoiSnapshot(data);
  // roi_delete는 ROI 툴(별창 포함)에서 호출돼 토큰 경로가 없어 게이트하지 않음 (저위험, §향후 검토)
  if (data.type === 'roi_delete')   return handleDeleteRoiSnapshot(data);

  // ── 관리자 토큰이 필요한 파괴적/운영 작업 ──
  // 클라이언트 화면을 우회해도 백엔드가 토큰을 검증하므로 명단 외 요청은 거부된다.
  if (data.type === 'update' || data.type === 'booking_delete' ||
      data.type === 'slot_block' || data.type === 'slot_unblock') {
    var admin = verifyAdminToken(data.token);
    if (!admin.ok) {
      return jsonResponse({ error: 'unauthorized', reason: admin.reason || 'invalid_token' });
    }
    if (data.type === 'update')         return handleUpdateStatus(data);
    if (data.type === 'booking_delete') return handleDeleteBooking(data, admin.email);
    if (data.type === 'slot_block')     return handleSlotBlock(data, admin.email);
    if (data.type === 'slot_unblock')   return handleSlotUnblock(data);
  }

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
  // 담당자 그룹 텔레그램 알림 (Script Property 미설정 시 자동 skip)
  sendTelegramNewBooking(data, id);

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
  let targetRowData = null;
  let purposeFromSheet = '';
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      targetRow = i + 1; // Sheets는 1-based
      targetRowData = rows[i];
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

  // 담당자 그룹 텔레그램 알림 — 운영 기록용 (확정/거절 모두)
  if (targetRowData) sendTelegramStatusChange(targetRowData, headers, data.status);

  return jsonResponse({ success: true });
}


// 예약 영구 삭제 — id로 행을 찾아 제거. 메일은 발송하지 않음 (테스트·실수 데이터 정리용).
// 관리자 토큰 검증을 통과한 호출만 진입한다(doPost 게이트). byEmail은 감사 로그용.
function handleDeleteBooking(data, byEmail) {
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
//  - 수신자/검색 키는 Script Properties에서 관리 (코드에 키 미노출)
//      MONTHLY_REPORT_TO   : 콤마 구분 수신자 (없으면 발송 스킵)
//      SERPER_API_KEY      : Serper.dev API Key (Google 결과 우회) [1순위]
//      GOOGLE_CSE_ID       : Programmable Search Engine ID (cx)    [폴백]
//      GOOGLE_CSE_KEY      : Custom Search API Key                  [폴백]
//  - 수동 미리보기: GET ?type=monthly_report_preview&month=YYYY-MM
//  - 수동 발송    : GET ?type=monthly_report_send&month=YYYY-MM&confirm=YES
// ============================================================

const MONTHLY_REPORT_QUERY = 'LG전자 ThinQ Real';
const PROP_LAST_SENT_KEY   = 'monthly_report_last_sent_month';

// 방문 목적별 카테고리 색상 — 관리자 페이지 PURPOSE_COLORS와 동기화 (thinqreal_admin.html line 2296)
const PURPOSE_COLORS = {
  '고객/고객사 영업 활동': '#ff9500',
  '내부 R&D · 테스트':    '#3a5035',
  '내부 행사':            '#7f51e4',
  '외부 행사':            '#0a84a3',
  '콘텐츠 제작':           '#cc7000',
  '기타':                 '#8fa889',
};

// ROI 가치 항목별 색상/라벨 — ROI 툴(ThinQ_Real_ROI_Tool.html line 1723-1726)과 동기화
const ROI_VALUE_LABELS = {
  vRnD:          { label: 'R&D 효율화',          color: '#3a5035' },
  vSalesInfra:   { label: '영업 지원 (인프라)',   color: '#8fa889' },
  vSalesContrib: { label: '영업 지원 (기여이익)', color: '#ff9500' },
  vPR:           { label: 'PR 가치',             color: '#af52de' },
};

// QuickChart.io 차트 이미지 URL 생성 — 이메일 클라이언트 호환을 위해 외부 PNG로 렌더
// 함수(formatter 등)는 JSON.stringify가 제거하므로 토큰으로 치환 후 원본 함수 소스로 복원 (JSON5 형식)
function quickChartUrl(config, opts) {
  opts = opts || {};
  const w = opts.w || 600;
  const h = opts.h || 320;
  const bkg = opts.bkg || 'white';

  let counter = 0;
  const fnMap = {};
  const json = JSON.stringify(config, function(key, value) {
    if (typeof value === 'function') {
      const token = '___FN_' + (counter++) + '___';
      fnMap[token] = value.toString();
      return token;
    }
    return value;
  });
  // split+join으로 치환 — replace의 두 번째 인자가 함수 소스 내 $/ 같은 특수 시퀀스로 해석될 위험 차단
  let out = json;
  Object.keys(fnMap).forEach(function(token) {
    out = out.split('"' + token + '"').join(fnMap[token]);
  });

  return 'https://quickchart.io/chart?w=' + w + '&h=' + h + '&bkg=' + encodeURIComponent(bkg) +
    '&c=' + encodeURIComponent(out);
}

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

  // 2) ROI 스냅샷
  //    - roi      : 이번 달에 신규 저장된 스냅샷 (변동 추적용, 현재 메일 본문에선 미사용)
  //    - roiLatest: 보고월 말 시점까지 저장된 시나리오 중 가장 최근의 것 (분석 그래프 기준)
  //                 → 5월 리포트는 5월 31일까지 저장된 시나리오 중 가장 최신을 사용
  const roiSheet = getRoiSheet();
  getOrCreateRoiHeaders(roiSheet);
  const rrows = roiSheet.getDataRange().getValues();
  const rheaders = rrows[0];
  const allRoi = rrows.slice(1).map(row => {
    const obj = {};
    rheaders.forEach((h, j) => {
      let v = row[j];
      if (Object.prototype.toString.call(v) === '[object Date]') v = v.toISOString();
      obj[h] = v == null ? '' : v;
    });
    try { obj.inputs  = JSON.parse(obj.inputs  || '{}'); } catch(err) { obj.inputs  = {}; }
    try { obj.outputs = JSON.parse(obj.outputs || '{}'); } catch(err) { obj.outputs = {}; }
    return obj;
  }).filter(r => r.id);

  const roi = allRoi
    .filter(r => String(r.timestamp).slice(0, 7) === month)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const monthEnd = month + '-31T23:59:59';
  const eligibleRoi = allRoi.filter(r => String(r.timestamp) <= monthEnd)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const roiLatest = eligibleRoi[0] || null;

  // 3) 관련 기사 — 수동 큐레이션 우선, 없으면 Google Custom Search
  const manualItems = getManualArticles(month);
  let articles;
  if (manualItems.length > 0) {
    articles = { items: manualItems, skipReason: '', source: 'manual' };
  } else {
    articles = fetchThinqRealArticles();
    articles.source = articles.provider || 'auto';
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
    roiLatest,
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
  const HEADERS = ['month', 'title', 'url', 'source', 'summary', 'published_at', 'thumbnail'];
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

  // 기존 헤더에 누락된 신규 컬럼만 끝에 추가 (마이그레이션)
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

function getManualArticles(month) {
  const sheet = getArticlesSheet();
  const headers = getOrCreateArticlesHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const hdrRow = rows[0].map(h => String(h || ''));
  const idxMonth   = hdrRow.indexOf('month');
  const idxTitle   = hdrRow.indexOf('title');
  const idxUrl     = hdrRow.indexOf('url');
  const idxSource  = hdrRow.indexOf('source');
  const idxSummary = hdrRow.indexOf('summary');
  const idxPubAt   = hdrRow.indexOf('published_at');
  const idxThumb   = hdrRow.indexOf('thumbnail');
  if (idxMonth < 0 || idxTitle < 0 || idxUrl < 0) return [];

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowMonth = normalizeMonth(row[idxMonth]);
    if (rowMonth !== month) continue;
    const title = String(row[idxTitle] || '').trim();
    const url   = String(row[idxUrl]   || '').trim();
    if (!url) continue;                 // url은 필수

    const origSource  = idxSource  >= 0 ? String(row[idxSource]  || '').trim() : '';
    const origSummary = idxSummary >= 0 ? String(row[idxSummary] || '').trim() : '';
    const origPubAt   = idxPubAt   >= 0 ? formatPublishedDate(row[idxPubAt]) : '';
    const origThumb   = idxThumb   >= 0 ? String(row[idxThumb]   || '').trim() : '';

    const baseItem = {
      title: title,
      link:  url,
      source: origSource,
      snippet: origSummary,
      publishedAt: origPubAt,
      thumbnail: origThumb,
    };

    // title 비어 있으면 URL HTML을 fetch해서 메타 태그에서 자동 추출
    // 담당자가 title을 직접 채워두면 그 의도를 존중하고 fetch 안 함
    const enriched = baseItem.title ? baseItem : enrichArticleFromUrl(baseItem);
    if (!enriched.title) continue;      // 자동 추출도 실패하면 skip

    // 시트의 빈 칸에 추출값을 write-back (담당자가 채운 값은 보존)
    const updates = [];
    if (idxTitle   >= 0 && !title       && enriched.title)       updates.push([idxTitle,   enriched.title]);
    if (idxSource  >= 0 && !origSource  && enriched.source)      updates.push([idxSource,  enriched.source]);
    if (idxSummary >= 0 && !origSummary && enriched.snippet)     updates.push([idxSummary, enriched.snippet]);
    if (idxPubAt   >= 0 && !origPubAt   && enriched.publishedAt) updates.push([idxPubAt,   enriched.publishedAt]);
    if (idxThumb   >= 0 && !origThumb   && enriched.thumbnail)   updates.push([idxThumb,   enriched.thumbnail]);
    if (updates.length) {
      updates.forEach(u => sheet.getRange(i + 1, u[0] + 1).setValue(u[1]));
    }

    items.push(enriched);
  }
  return items;
}

// URL의 HTML을 fetch해서 OpenGraph 메타 태그로 빈 필드 자동 채우기
// 담당자가 이미 채워둔 필드는 보존, 비어 있는 필드만 자동으로 채움
function enrichArticleFromUrl(item) {
  const meta = fetchUrlMeta(item.link);
  if (!meta) {
    // fetch 실패 시 도메인이라도 source로 (마지막 안전망)
    return Object.assign({}, item, {
      title: item.title || item.link,
      source: item.source || extractDomain(item.link),
    });
  }
  return {
    title: item.title || meta.title || item.link,
    link:  item.link,
    source: item.source || meta.source || extractDomain(item.link),
    snippet: item.snippet || truncate(meta.description, 120),
    publishedAt: item.publishedAt || meta.publishedAt || '',
    thumbnail: item.thumbnail || meta.image || '',
  };
}

// 인코딩 감지(헤더 → HTML meta charset → UTF-8 폴백) 후 메타 태그 파싱
// EUC-KR/MS949 사용하는 일부 국내 뉴스 사이트의 한글 깨짐 방지
function fetchUrlMeta(url) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThinQRealBot/1.0; +https://thinqreal.com)',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
      },
    });
    if (resp.getResponseCode() !== 200) return null;

    const blob = resp.getBlob();
    const utf8Text = blob.getDataAsString('UTF-8');

    // 1) Content-Type 헤더에서 charset 찾기
    let charset = '';
    const hdrs = resp.getAllHeaders() || {};
    const ct = String(hdrs['Content-Type'] || hdrs['content-type'] || '');
    const ctMatch = ct.match(/charset\s*=\s*([^\s;]+)/i);
    if (ctMatch) charset = ctMatch[1].toUpperCase().replace(/^["']|["']$/g, '');

    // 2) 헤더에 없으면 HTML meta에서 (ASCII 헤드 부분은 어떤 인코딩이든 정상 노출됨)
    if (!charset) {
      const metaCs = utf8Text.match(/<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9_\-]+)/i);
      if (metaCs) charset = metaCs[1].toUpperCase();
    }

    // 3) 정규화 (Apps Script Blob가 인식하는 이름으로)
    if (/^UTF.?8$/i.test(charset)) charset = 'UTF-8';
    else if (charset === 'CP949' || charset === 'WINDOWS-949') charset = 'MS949';

    // 4) UTF-8이 아니면 원본 바이트를 해당 charset으로 다시 디코딩
    let html;
    if (!charset || charset === 'UTF-8') {
      html = utf8Text;
    } else {
      try {
        html = blob.getDataAsString(charset);
      } catch(e) {
        Logger.log('Unsupported charset ' + charset + ' for ' + url + ' → UTF-8 fallback');
        html = utf8Text;
      }
    }
    return parseMetaTags(html);
  } catch(err) {
    Logger.log('fetchUrlMeta error for ' + url + ': ' + err.message);
    return null;
  }
}

function parseMetaTags(html) {
  const result = { title: '', description: '', source: '', publishedAt: '', image: '' };

  // <title> 폴백
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) result.title = decodeHtmlEntities(titleTag[1]).trim();

  // 모든 <meta> 태그 순회 — property/name 속성과 content 추출
  const metaTags = html.match(/<meta\s+[^>]+>/gi) || [];
  for (let i = 0; i < metaTags.length; i++) {
    const tag = metaTags[i];
    const propM = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contM = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (!propM || !contM) continue;
    const prop = propM[1].toLowerCase();
    const content = decodeHtmlEntities(contM[1]).trim();
    if (!content) continue;

    if (prop === 'og:title') result.title = content;            // OG가 더 정확하면 덮어씀
    else if (prop === 'og:description' || prop === 'description') {
      if (!result.description) result.description = content;
    }
    else if (prop === 'og:site_name') result.source = content;
    else if (prop === 'og:image' || prop === 'twitter:image' || prop === 'twitter:image:src') {
      if (!result.image) result.image = content;
    }
    else if (prop === 'article:published_time' || prop === 'article:published' ||
             prop === 'datepublished' || prop === 'pubdate') {
      result.publishedAt = String(content).slice(0, 10);
    }
  }
  return result;
}

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function extractDomain(url) {
  const m = String(url).match(/^https?:\/\/([^\/]+)/i);
  return m ? m[1].replace(/^www\./, '') : '';
}

function truncate(s, n) {
  if (!s) return '';
  const str = String(s);
  return str.length <= n ? str : (str.slice(0, n - 1) + '…');
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

  // 1순위: Serper.dev (Google 결과 우회, 무료 2,500 calls/월)
  const serperKey = props.getProperty('SERPER_API_KEY');
  if (serperKey) return fetchArticlesViaSerper(serperKey);

  // 2순위: Google Custom Search (폴백 — CSE 정책 해소 시 자동 사용)
  const cx  = props.getProperty('GOOGLE_CSE_ID');
  const key = props.getProperty('GOOGLE_CSE_KEY');
  if (cx && key) return fetchArticlesViaCSE(cx, key);

  return { items: [], skipReason: '기사 검색 API 키 미설정 (Script Properties에 SERPER_API_KEY 또는 GOOGLE_CSE_ID/GOOGLE_CSE_KEY 등록 필요)' };
}

function fetchArticlesViaSerper(apiKey) {
  const payload = {
    q: MONTHLY_REPORT_QUERY,
    gl: 'kr',
    hl: 'ko',
    num: 10,
    tbs: 'qdr:m'   // 최근 1개월
  };
  try {
    const resp = UrlFetchApp.fetch('https://google.serper.dev/news', {
      method: 'post',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      let detail = '';
      try {
        const errBody = JSON.parse(resp.getContentText());
        if (errBody && errBody.message) detail = ' — ' + errBody.message;
      } catch(_) {}
      return { items: [], provider: 'serper', skipReason: 'Serper 응답 코드 ' + resp.getResponseCode() + detail };
    }
    const body = JSON.parse(resp.getContentText());
    const items = (body.news || []).map(it => ({
      title:       it.title    || '',
      link:        it.link     || '',
      source:      it.source   || '',
      snippet:     it.snippet  || '',
      thumbnail:   it.imageUrl || '',
      publishedAt: it.date     || '',
    }));
    return { items, provider: 'serper', skipReason: items.length ? '' : '검색 결과 없음' };
  } catch(err) {
    return { items: [], provider: 'serper', skipReason: 'Serper 호출 오류: ' + err.message };
  }
}

function fetchArticlesViaCSE(cx, key) {
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
      return { items: [], provider: 'cse', skipReason: 'CSE 응답 코드 ' + resp.getResponseCode() + detail };
    }
    const body = JSON.parse(resp.getContentText());
    const items = (body.items || []).map(it => ({
      title:   it.title || '',
      link:    it.link  || '',
      source:  (it.displayLink || '').replace(/^www\./, ''),
      snippet: it.snippet || '',
    }));
    return { items, provider: 'cse', skipReason: items.length ? '' : '검색 결과 없음' };
  } catch(err) {
    return { items: [], provider: 'cse', skipReason: 'CSE 호출 오류: ' + err.message };
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
  if (eok > 0) s += eok.toLocaleString() + '억 ';
  if (man > 0 || eok === 0) s += man.toLocaleString() + '만원';
  else s = s.trim() + '원';
  return (v < 0 ? '-' : '') + s.trim();
}

function prettyRoiLabel(label) {
  const m = String(label || '').match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
  return m ? (m[1] + ' 시나리오') : (label || '(이름 없음)');
}

// ── 임원 요약 한 줄 빌더 (HTML/Text 공용) ──
// asHtml: true → <strong> 강조 포함, false → 평문
function buildExecSummary(d, asHtml) {
  const m = d.monthNum + '월';
  const strong = (s) => asHtml ? '<strong>' + s + '</strong>' : s;
  const esc = (s) => asHtml ? escapeHtml(s) : s;

  // 방문 부분
  let visitPart;
  if (d.kpi.confirmed > 0) {
    visitPart = m + '에는 ' + strong(d.kpi.confirmed + '건의 방문') +
                '(총 ' + strong(d.kpi.visitors + '명') + ')이 진행되었습니다.';
  } else {
    visitPart = m + '에는 확정된 방문이 없었습니다.';
  }

  // ROI 부분 (시나리오 있을 때만)
  let roiPart = '';
  if (d.roiLatest) {
    const o = d.roiLatest.outputs || {};
    const roi5 = Number(o.roi5);
    const bep = o.bepText;
    if (isFinite(roi5)) {
      const sign = roi5 >= 0 ? '+' : '';
      const roi5Txt = sign + roi5.toFixed(1) + '%';
      if (bep) {
        roiPart = ' 최신 시나리오 기준 5년 누적 ROI는 ' + strong(roi5Txt) +
                  ', 회수 기간은 ' + strong(esc(bep)) + '입니다.';
      } else {
        roiPart = ' 최신 시나리오 기준 5년 누적 ROI는 ' + strong(roi5Txt) + '입니다.';
      }
    }
  }

  // 둘 다 없을 때만 전용 안내
  if (d.kpi.confirmed === 0 && !roiPart) {
    return m + '에는 ThinQ Real 운영 활동이 기록되지 않았습니다.';
  }
  return visitPart + roiPart;
}

// ── 텍스트 빌더 ────────────────────────────
function buildMonthlyReportText(d) {
  const L = [];
  L.push(`ThinQ Real ${d.year}년 ${d.monthNum}월 운영 리포트`);
  L.push('');
  L.push('이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.');
  L.push('');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('▶ 요약');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('   ' + buildExecSummary(d, false));
  L.push('');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('📊 핵심 지표');
  L.push('   이번 달 운영 성과의 핵심 지표');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(`   확정 방문        ${d.kpi.confirmed}건`);
  L.push(`   총 방문 인원     ${d.kpi.visitors}명`);
  L.push('');

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('🎯 방문 목적별 분포');
  L.push('   확정된 방문이 어떤 목적으로 진행되었는지의 비중');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const sorted = Object.keys(d.purposeCounts).map(k => [k, d.purposeCounts[k]])
    .sort((a, b) => b[1] - a[1]);
  const tot = sorted.reduce((s, [, v]) => s + v, 0);
  if (!sorted.length) L.push('   (해당 없음)');
  else sorted.forEach(([k, v]) => {
    const pct = tot ? Math.round(v/tot*100) : 0;
    L.push(`   ${k}  —  ${v}건 (${pct}%)`);
  });
  L.push('');

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('📅 방문 이력');
  L.push(`   이번 달 확정된 방문 ${d.confirmed.length}건의 일자별 상세`);
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!d.confirmed.length) {
    L.push('   (이번 달 확정된 방문 없음)');
  } else {
    d.confirmed.forEach(b => {
      const subj = [b.subject, b.clientCompany].filter(Boolean).join(' · ');
      L.push(`   ${b.date}  ·  ${b.purpose || '-'}`);
      L.push(`     ${subj || '-'}`);
      L.push('');
    });
  }

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(`💰 ${d.monthNum}월 ROI 누적 분석 결과`);
  L.push('   저장된 시나리오 기반의 실시간 산출 결과');
  L.push('   (영업 지원·기여 영업 이익은 실제 영업 진행에 따라 매월 갱신됨)');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!d.roiLatest) {
    L.push('   (저장된 ROI 시나리오가 없습니다)');
  } else {
    const o = d.roiLatest.outputs || {};
    const annualValue = Number(o.annualValue) || 0;
    if (annualValue) L.push(`   연간 창출 가치    ${fmtKRWReport(annualValue)}`);
    if (o.bepText)   L.push(`   회수 기간 (BEP)   ${o.bepText}`);
    else if (isFinite(o.bepYears)) L.push(`   회수 기간 (BEP)   ${Number(o.bepYears).toFixed(2)}년`);
    if (isFinite(o.roi3)) L.push(`   3년 누적 ROI      ${(o.roi3 >= 0 ? '+' : '') + Number(o.roi3).toFixed(1)}%  (${fmtKRWReport(o.profit3 || 0)})`);
    if (isFinite(o.roi5)) L.push(`   5년 누적 ROI      ${(o.roi5 >= 0 ? '+' : '') + Number(o.roi5).toFixed(1)}%  (${fmtKRWReport(o.profit5 || 0)})`);
    L.push('');
    L.push(`   기준 시나리오: ${prettyRoiLabel(d.roiLatest.label)}` +
           (d.roiLatest.author ? ` · 작성자 ${d.roiLatest.author}` : ''));
  }

  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('📰 관련 기사');
  L.push(d.articles.source === 'manual'
    ? '   담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : '   Google 검색 결과 기준의 최근 1개월 ThinQ Real 관련 보도');
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
  // ── Outlook 외부 이미지 차단 대응 안내 (헤더 직후, 사내 메일 환경 가독성 보조) ──
  // Outlook 데스크탑은 외부 이미지를 기본 차단해 차트가 깨져 보임 → 보낸 사람 신뢰 또는 이미지 다운로드 안내
  const outlookHintRow =
    '<tr><td style="padding:14px 28px 0;">' +
      '<div style="background:#fff8e6;border:1px solid #f5d57a;border-radius:6px;padding:11px 14px;font-size:12.5px;color:#7a5a00;line-height:1.55;">' +
        '📌 Outlook에서 차트·이미지가 보이지 않나요? <strong>[트러스트 보낸 사람]</strong> 클릭하세요.' +
      '</div>' +
    '</td></tr>';

  // ── 임원 요약 한 줄 (헤더 직후, 30초 안에 운영 상황 파악) ──
  const execSummaryText = buildExecSummary(d, true);
  const execSummaryRow =
    '<tr><td style="padding:18px 28px 0;">' +
      '<div style="background:#f5f7f4;border-left:4px solid #3a5035;padding:18px 22px;border-radius:0 6px 6px 0;">' +
        '<div style="font-size:11px;font-weight:600;color:#3a5035;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">요약</div>' +
        '<div style="font-size:15px;color:#1d1d1f;line-height:1.75;">' + execSummaryText + '</div>' +
      '</div>' +
    '</td></tr>';

  // ── 섹션 헤더 (큰 제목 + 한 줄 설명) ──
  const sectionHeader = (icon, title, description) =>
    '<tr><td style="padding:32px 28px 6px;">' +
      '<div style="font-size:20px;font-weight:700;color:#1d1d1f;line-height:1.3;">' + icon + '&nbsp;&nbsp;' + escapeHtml(title) + '</div>' +
      (description ? '<div style="font-size:13.5px;color:#6e6e73;margin-top:8px;line-height:1.55;">' + escapeHtml(description) + '</div>' : '') +
    '</td></tr>';

  // ── 1) 핵심 지표 (확정 건수 + 방문 인원만, 폰트는 ROI KPI 카드와 통일) ──
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
        '<tr>' +
          kpiCell('확정 방문', d.kpi.confirmed, '건', '#3a5035') +
          kpiCell('총 방문 인원', d.kpi.visitors, '명', '#3a5035') +
        '</tr>' +
      '</table>' +
    '</td></tr>';

  // ── 2) 방문 목적별 분포 (도넛 차트) ──
  // 6개 카테고리를 항상 모두 레전드에 표시 — 0건 카테고리도 존재함을 임원진이 즉시 인지할 수 있도록.
  // 0건 카테고리는 슬라이스 영역이 0이라 자동으로 안 그려지지만 범례 엔트리는 유지됨.
  let purposeBody;
  const purposeKeys = Object.keys(d.purposeCounts);
  const purposeTotal = Object.keys(d.purposeCounts).reduce((s, k) => s + (d.purposeCounts[k] || 0), 0);
  if (purposeTotal === 0) {
    purposeBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">해당 없음</div>';
  } else {
    const canonical = Object.keys(PURPOSE_COLORS);
    const extras = purposeKeys.filter(k => !PURPOSE_COLORS[k] && d.purposeCounts[k] > 0);
    const labels = canonical.concat(extras);
    const values = canonical.map(k => d.purposeCounts[k] || 0).concat(extras.map(k => d.purposeCounts[k]));
    const colors = canonical.map(k => PURPOSE_COLORS[k]).concat(extras.map(() => '#5e7858'));

    const chartUrl = quickChartUrl({
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: '#ffffff' }]
      },
      options: {
        cutoutPercentage: 60,
        legend: {
          position: 'bottom',
          labels: { fontSize: 11, padding: 10, boxWidth: 10, usePointStyle: true }
        },
        plugins: {
          datalabels: {
            color: '#ffffff',
            font: { size: 13, weight: 'bold' },
            anchor: 'center',
            align: 'center',
            formatter: function(value) { return value > 0 ? value + '건' : ''; }
          }
        }
      }
    }, { w: 480, h: 240 });

    purposeBody =
      '<div style="text-align:center;">' +
        '<img src="' + escapeHtml(chartUrl) + '" alt="방문 목적별 분포" style="max-width:100%;width:480px;height:auto;display:inline-block;" />' +
      '</div>' +
      '<div style="font-size:13px;color:#6e6e73;text-align:center;margin-top:6px;">총 ' + purposeTotal + '건 (확정 기준)</div>';
  }

  // ── 3) 방문 이력 (일자 / 목적 / 주제·소속) ──
  let visitsBody;
  if (!d.confirmed.length) {
    visitsBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">이번 달 확정된 방문 없음</div>';
  } else {
    const th = (txt) => '<th align="left" style="font-size:12px;color:#6e6e73;font-weight:600;letter-spacing:0.04em;padding:10px 12px;border-bottom:1px solid #e0e0e0;background:#fafafa;">' + escapeHtml(txt) + '</th>';
    const td = (html, opts) => '<td style="padding:12px;font-size:14px;color:#1d1d1f;border-bottom:1px solid #f2f2f2;vertical-align:top;line-height:1.5;' + ((opts && opts.nowrap) ? 'white-space:nowrap;' : '') + '">' + html + '</td>';
    visitsBody = '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">' +
      '<thead><tr>' + th('일자') + th('목적') + th('주제 및 소속') + '</tr></thead>' +
      '<tbody>' +
        d.confirmed.map(b => {
          const subj = [b.subject, b.clientCompany].filter(Boolean).map(escapeHtml).join(' · ');
          return '<tr>' +
            td(escapeHtml(b.date), { nowrap: true }) +
            td(escapeHtml(b.purpose || '-')) +
            td(subj || '<span style="color:#aeaeb2;">-</span>') +
          '</tr>';
        }).join('') +
      '</tbody>' +
    '</table>';
  }

  // ── 4) ROI 누적 분석 결과 (최근 시나리오 기준) ──
  let roiBody;
  if (!d.roiLatest) {
    roiBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">저장된 ROI 시나리오가 없습니다. ROI 분석 툴에서 시나리오를 저장하면 다음 리포트부터 본 섹션에 분석 결과가 표시됩니다.</div>';
  } else {
    const o = d.roiLatest.outputs || {};
    const annualValue = Number(o.annualValue) || 0;
    const totalCost = Number(o.totalCost) || (annualValue * 3 - (Number(o.profit3) || 0));
    const roi3 = Number(o.roi3);
    const profit3 = Number(o.profit3);

    // ROI KPI 카드 (4개)
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

    // 가치 항목별 비중 도넛 — 4개 항목 모두 항상 표시 (0원인 항목도 레전드 노출)
    // 색상·라벨은 ROI 툴 breakdownChart(ThinQ_Real_ROI_Tool.html line 1720+)와 동기화
    const valItems = Object.keys(ROI_VALUE_LABELS).map(k => ({
      key: k, value: Number(o[k]) || 0,
      label: ROI_VALUE_LABELS[k].label, color: ROI_VALUE_LABELS[k].color
    }));
    const valTotal = valItems.reduce((s, it) => s + it.value, 0);
    let valueCompChart = '';
    if (valTotal > 0) {
      const vUrl = quickChartUrl({
        type: 'doughnut',
        data: {
          labels: valItems.map(it => it.label),
          datasets: [{ data: valItems.map(it => it.value), backgroundColor: valItems.map(it => it.color), borderWidth: 3, borderColor: '#ffffff' }]
        },
        options: {
          cutoutPercentage: 65,
          legend: {
            position: 'bottom',
            labels: { fontSize: 11, padding: 10, boxWidth: 10, usePointStyle: true }
          },
          plugins: {
            datalabels: {
              color: '#ffffff',
              font: { size: 12, weight: 'bold' },
              anchor: 'center',
              align: 'center',
              formatter: function(value) {
                if (!value || value <= 0) return '';
                var a = Math.abs(value);
                if (a >= 1e8) return (a/1e8).toFixed(1).replace(/\.0$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '억';
                if (a >= 1e4) return Math.round(a/1e4).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '만';
                return a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              }
            }
          }
        }
      }, { w: 480, h: 240 });
      valueCompChart = '<img src="' + escapeHtml(vUrl) + '" alt="가치 항목별 비중" style="max-width:100%;width:480px;height:auto;display:block;margin:0 auto;" />';
    }

    // 연도별 누적 손익 라인 차트 — ROI 툴 cumulativeChart(line 1641+) 스타일 그대로
    // 두 시리즈: 누적 손익(채움 영역) + 손익분기선(점선)
    const cumValues = [
      -totalCost,
      -totalCost + annualValue * 1,
      -totalCost + annualValue * 2,
      -totalCost + annualValue * 3,
      -totalCost + annualValue * 4,
      -totalCost + annualValue * 5,
    ];
    const cumUrl = quickChartUrl({
      type: 'line',
      data: {
        labels: ['0년', '1년', '2년', '3년', '4년', '5년'],
        datasets: [
          {
            label: '누적 손익',
            data: cumValues,
            borderColor: '#3a5035',
            backgroundColor: 'rgba(58, 80, 53, 0.08)',
            borderWidth: 2.5,
            fill: true,
            lineTension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: '#3a5035',
            pointBorderColor: 'white',
            pointBorderWidth: 2.5,
          },
          {
            label: '손익분기선',
            data: [0, 0, 0, 0, 0, 0],
            borderColor: '#ff9500',
            borderWidth: 1.5,
            borderDash: [6, 4],
            fill: false,
            pointRadius: 0,
          },
        ],
      },
      options: {
        legend: {
          position: 'bottom',
          labels: { fontSize: 11, boxWidth: 12, padding: 16, usePointStyle: true }
        },
        plugins: {
          datalabels: { display: false }      // 라인 차트엔 데이터 라벨 없음 (Y축으로 충분)
        },
        scales: {
          yAxes: [{
            ticks: {
              fontSize: 10,
              callback: function(v) {
                if (v === 0) return '0';
                var a = Math.abs(v);
                var sign = v < 0 ? '-' : '';
                if (a >= 1e8) return sign + (a/1e8).toFixed(1).replace(/\.0$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '억';
                if (a >= 1e4) return sign + Math.round(a/1e4).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '만';
                return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              }
            },
            gridLines: { color: 'rgba(0,0,0,0.04)' }
          }],
          xAxes: [{
            ticks: { fontSize: 11 },
            gridLines: { display: false }
          }]
        }
      }
    }, { w: 620, h: 280 });
    const cumChart = '<img src="' + escapeHtml(cumUrl) + '" alt="연도별 누적 손익" style="max-width:100%;width:620px;height:auto;display:block;margin:0 auto;" />';

    const scenarioLabel = prettyRoiLabel(d.roiLatest.label) +
      (d.roiLatest.author ? ' · 작성자 ' + escapeHtml(String(d.roiLatest.author)) : '');

    roiBody =
      roiKpiTable +
      '<div style="margin-top:24px;">' +
        '<div style="font-size:14px;font-weight:600;color:#1d1d1f;">가치 항목별 비중</div>' +
        '<div style="font-size:12.5px;color:#6e6e73;margin-top:4px;">연간 창출 가치가 어떤 항목에서 얼마만큼 나오는지를 보여줍니다.</div>' +
      '</div>' +
      '<div style="margin-top:10px;">' + valueCompChart + '</div>' +
      '<div style="margin-top:24px;">' +
        '<div style="font-size:14px;font-weight:600;color:#1d1d1f;">연도별 누적 손익</div>' +
        '<div style="font-size:12.5px;color:#6e6e73;margin-top:4px;">투자 시점부터 5년간 누적 손익 추이입니다. 점선과 만나는 시점이 손익분기점(BEP)입니다.</div>' +
      '</div>' +
      '<div style="margin-top:10px;">' + cumChart + '</div>' +
      '<div style="margin-top:16px;font-size:12px;color:#aeaeb2;text-align:right;">기준 시나리오: ' + scenarioLabel + '</div>';
  }

  // 기사
  let articlesBody;
  if (!d.articles.items.length) {
    articlesBody = '<div style="font-size:13px;color:#aeaeb2;">' + escapeHtml(d.articles.skipReason || '검색 결과 없음') + '</div>';
  } else {
    const THUMB_LIMIT = 5; // 상위 N건만 썸네일 카드, 나머지는 텍스트만 (보도자료 사진 중복 방지·시선 집중)
    articlesBody = d.articles.items.map((it, idx) => {
      const meta = [it.source, it.publishedAt].filter(Boolean).map(escapeHtml).join(' · ');
      const snippetDisplay = truncate(it.snippet, 120); // 표시 시점에서도 한 번 더 컷
      const textCell =
        '<a href="' + escapeHtml(it.link) + '" target="_blank" rel="noopener" style="font-size:14px;color:#3a5035;text-decoration:underline;font-weight:600;">' + escapeHtml(it.title) + '</a>' +
        (meta ? '<div style="font-size:11px;color:#aeaeb2;margin-top:2px;">' + meta + '</div>' : '') +
        (snippetDisplay ? '<div style="font-size:13px;color:#3a3a3c;margin-top:4px;line-height:1.5;">' + escapeHtml(snippetDisplay) + '</div>' : '');
      if (it.thumbnail && idx < THUMB_LIMIT) {
        // 썸네일 있는 경우 — 좌측 이미지 + 우측 텍스트 카드 레이아웃
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
      // 썸네일 없는 경우 — 텍스트만
      return '<div style="padding:12px 0;border-bottom:1px solid #f2f2f2;">' + textCell + '</div>';
    }).join('');
  }

  // 섹션별 한 줄 설명 (임원진 가독성 우선 — 무엇을 보여주는지 즉시 이해)
  const descKpi = '이번 달 운영 성과의 핵심 지표';
  const descPurpose = '확정된 방문이 어떤 목적으로 진행되었는지의 비중';
  const descVisits = '이번 달 확정된 방문 ' + d.confirmed.length + '건의 일자별 상세';
  const descRoi = '저장된 시나리오 기반의 실시간 산출 결과입니다. ' +
                  '특히 영업 지원 · 기여 영업 이익은 실제 영업 진행 상황에 따라 매월 갱신되므로, ' +
                  '본 수치는 작성 시점의 시나리오를 기준으로 한 추정치입니다.';
  const descArticles = d.articles.source === 'manual'
    ? '담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : 'Google 검색 결과 기준의 최근 1개월 ThinQ Real 관련 보도';

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:760px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:28px 28px 24px;">' +
          '<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.75;">ThinQ Real</div>' +
          '<div style="font-size:24px;font-weight:700;margin-top:6px;">' + escapeHtml(d.year + '년 ' + d.monthNum + '월 운영 리포트') + '</div>' +
          '<div style="font-size:14px;opacity:0.88;margin-top:8px;line-height:1.55;">이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.</div>' +
        '</td></tr>' +
        outlookHintRow +
        execSummaryRow +
        sectionHeader('📊', '핵심 지표', descKpi) +
        kpiTable +
        sectionHeader('🎯', '방문 목적별 분포', descPurpose) +
        '<tr><td style="padding:0 28px 16px;">' + purposeBody + '</td></tr>' +
        sectionHeader('📅', '방문 이력', descVisits) +
        '<tr><td style="padding:0 28px 16px;">' + visitsBody + '</td></tr>' +
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
    'subject', 'clientCompany', 'visitors', 'usagePlan', 'expectedEffect', 'purposeKey',
    // 2026-06 개인정보 수집·이용 + 국외 이전 동의 기록 ('Y' = 동의, 동의 시각은 timestamp와 동일)
    'privacyConsent'
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


// ============================================================
//  사이트 접근 통제 — 이메일 게이트 (4안)
//  흐름: 이메일 입력 → 6자리 코드 메일 → 코드 검증 → 30일 토큰
// ============================================================

// 이메일 형식 + 허용 도메인 검증
function isAllowedAuthEmail(email) {
  if (!email) return false;
  var s = String(email).trim().toLowerCase();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)) return false;
  var at = s.lastIndexOf('@');
  if (at < 0) return false;
  var domain = s.slice(at + 1);
  for (var i = 0; i < AUTH_ALLOWED_DOMAINS.length; i++) {
    if (domain === AUTH_ALLOWED_DOMAINS[i]) return true;
  }
  return false;
}

// 인증 코드 요청 — 6자리 코드 생성 + 캐시 저장 + 메일 발송
function handleAuthRequest(email) {
  email = (email || '').trim().toLowerCase();
  if (!isAllowedAuthEmail(email)) {
    return jsonResponse({ ok: false, error: 'invalid_email',
      message: 'LG 임직원 메일(@lge.com)만 입력 가능합니다.' });
  }

  var cache = CacheService.getScriptCache();
  var coolKey = 'auth_cool_' + email;
  if (cache.get(coolKey)) {
    return jsonResponse({ ok: false, error: 'cooldown',
      message: '잠시 후 다시 시도해 주세요. (60초)' });
  }

  // 6자리 코드 — 앞자리 0 허용
  var code = '';
  for (var i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);

  cache.put('auth_code_' + email, code, AUTH_CODE_TTL_SEC);
  cache.put(coolKey, '1', AUTH_COOLDOWN_SEC);

  try {
    MailApp.sendEmail({
      to: email,
      subject: '[ThinQ Real] 사이트 접속 인증 코드',
      body: buildAuthCodeText(code),
      htmlBody: buildAuthCodeHtml(code),
      name: 'ThinQ Real'
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'mail_failed',
      message: '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
  }

  return jsonResponse({ ok: true, ttl: AUTH_CODE_TTL_SEC });
}

// 인증 코드 검증 — 일치 시 30일 서명 토큰 반환
function handleAuthVerify(email, code) {
  email = (email || '').trim().toLowerCase();
  code  = (code  || '').trim();
  if (!isAllowedAuthEmail(email)) {
    return jsonResponse({ ok: false, error: 'invalid_email' });
  }
  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ ok: false, error: 'invalid_code',
      message: '인증 코드는 6자리 숫자입니다.' });
  }

  var cache = CacheService.getScriptCache();
  var stored = cache.get('auth_code_' + email);
  if (!stored) {
    return jsonResponse({ ok: false, error: 'code_expired',
      message: '인증 코드가 만료되었습니다. 다시 요청해 주세요.' });
  }
  if (stored !== code) {
    return jsonResponse({ ok: false, error: 'code_mismatch',
      message: '인증 코드가 일치하지 않습니다.' });
  }

  // 1회용 — 검증 성공 시 코드 즉시 삭제
  cache.remove('auth_code_' + email);

  var exp = Date.now() + AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  var token = signAuthToken(email, exp);
  return jsonResponse({ ok: true, token: token, email: email, exp: exp });
}

// HMAC-SHA256 서명 토큰: base64url(payload).base64url(signature)
// payload = { email, exp, admin } — admin이 true면 관리자 권한 토큰.
function signAuthToken(email, exp, isAdmin) {
  var payload = JSON.stringify({ email: email, exp: exp, admin: !!isAdmin });
  var payloadB64 = base64Url(Utilities.newBlob(payload).getBytes());
  var secret = getAuthSecret();
  var sigBytes = Utilities.computeHmacSha256Signature(payloadB64, secret);
  var sigB64 = base64Url(sigBytes);
  return payloadB64 + '.' + sigB64;
}

// 토큰 서명·만료 검증. 유효하면 { ok:true, email, admin }, 아니면 { ok:false, reason }.
function verifyAuthToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) {
    return { ok: false, reason: 'no_token' };
  }
  var parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  var payloadB64 = parts[0], sigB64 = parts[1];

  // 서명 재계산 후 상수 비교
  var secret = getAuthSecret();
  var expected = base64Url(Utilities.computeHmacSha256Signature(payloadB64, secret));
  if (!constantTimeEquals(expected, sigB64)) return { ok: false, reason: 'bad_signature' };

  var payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch (e) {
    return { ok: false, reason: 'bad_payload' };
  }
  if (!payload || !payload.exp || Number(payload.exp) <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, email: String(payload.email || '').toLowerCase(), admin: !!payload.admin };
}

// 관리자 토큰 검증 — 서명 유효 + admin 플래그 + 명단 포함까지 모두 만족해야 통과.
function verifyAdminToken(token) {
  var v = verifyAuthToken(token);
  if (!v.ok) return v;
  if (!v.admin) return { ok: false, reason: 'not_admin' };
  if (AUTH_ADMIN_EMAILS.map(function(s){ return s.toLowerCase(); }).indexOf(v.email) < 0) {
    return { ok: false, reason: 'not_in_allowlist' };
  }
  return { ok: true, email: v.email };
}

// 타이밍 공격 완화용 상수 시간 비교
function constantTimeEquals(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

// base64url → 문자열
function base64UrlDecodeToString(s) {
  var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
}

function getAuthSecret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AUTH_SECRET');
  if (!s) {
    s = Utilities.getUuid() + '_' + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', s);
  }
  return s;
}

// base64url 인코딩 (URL-safe, padding 제거)
function base64Url(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 인증 코드 메일 — 평문
function buildAuthCodeText(code) {
  return [
    'ThinQ Real 사이트 접속 인증',
    '',
    '인증 코드: ' + code,
    '',
    '이 코드를 사이트 인증 화면에 입력하세요.',
    '코드는 10분간 유효합니다.',
    '',
    '본인이 요청하지 않았다면 이 메일은 무시하세요.',
    '',
    '— ThinQ Real (HS플랫폼사업센터 AI홈솔루션엔지니어링팀)'
  ].join('\n');
}

// 인증 코드 메일 — HTML (인라인 스타일만, Outlook/Gmail 호환)
function buildAuthCodeHtml(code) {
  return '' +
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#f5f5f7;padding:24px 16px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;padding:22px 28px;color:#ffffff;font-size:17px;font-weight:600;">' +
          'ThinQ Real 접속 인증' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:14px;color:#6e6e73;margin-bottom:8px;">아래 6자리 코드를 인증 화면에 입력하세요.</div>' +
          '<div style="font-size:38px;font-weight:700;letter-spacing:8px;color:#1d1d1f;background:#f5f5f7;border-radius:10px;text-align:center;padding:18px 0;margin:8px 0 18px;">' +
            escapeHtml(code) +
          '</div>' +
          '<div style="font-size:13px;color:#6e6e73;line-height:1.55;">' +
            '· 코드는 <strong>10분간</strong> 유효합니다.<br>' +
            '· 본인이 요청하지 않았다면 이 메일은 무시하세요.' +
          '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:14px 28px 22px;border-top:1px solid #e8e8ed;font-size:12px;color:#aeaeb2;">' +
          'ThinQ Real · HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
        '</td></tr>' +
      '</table>' +
    '</div>';
}


// ============================================================
//  관리자 인증 — 이메일 코드 (명단 한정)
//  메인 게이트와 동일한 흐름이나 허용 대상을 AUTH_ADMIN_EMAILS로 한정.
// ============================================================
function isAdminEmail(email) {
  if (!email) return false;
  var s = String(email).trim().toLowerCase();
  return AUTH_ADMIN_EMAILS.map(function(x){ return x.toLowerCase(); }).indexOf(s) >= 0;
}

function handleAdminAuthRequest(email) {
  email = (email || '').trim().toLowerCase();
  if (!isAdminEmail(email)) {
    // 명단에 없는 메일은 "발송됨"과 구분되지 않는 응답으로 열거 공격을 약하게 방지하되,
    // 운영 편의를 위해 명확한 안내를 준다(내부 도구라 열거 위험이 낮음).
    return jsonResponse({ ok: false, error: 'not_admin',
      message: '관리자 권한이 없는 계정입니다. 운영 담당자에게 문의해 주세요.' });
  }

  var cache = CacheService.getScriptCache();
  var coolKey = 'admin_cool_' + email;
  if (cache.get(coolKey)) {
    return jsonResponse({ ok: false, error: 'cooldown', message: '잠시 후 다시 시도해 주세요. (60초)' });
  }

  var code = '';
  for (var i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  cache.put('admin_code_' + email, code, AUTH_CODE_TTL_SEC);
  cache.put(coolKey, '1', AUTH_COOLDOWN_SEC);

  try {
    MailApp.sendEmail({
      to: email,
      subject: '[ThinQ Real] 관리자 페이지 인증 코드',
      body: buildAuthCodeText(code),
      htmlBody: buildAuthCodeHtml(code),
      name: 'ThinQ Real'
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'mail_failed', message: '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  return jsonResponse({ ok: true, ttl: AUTH_CODE_TTL_SEC });
}

function handleAdminAuthVerify(email, code) {
  email = (email || '').trim().toLowerCase();
  code  = (code  || '').trim();
  if (!isAdminEmail(email)) return jsonResponse({ ok: false, error: 'not_admin' });
  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ ok: false, error: 'invalid_code', message: '인증 코드는 6자리 숫자입니다.' });
  }

  var cache = CacheService.getScriptCache();
  var stored = cache.get('admin_code_' + email);
  if (!stored) {
    return jsonResponse({ ok: false, error: 'code_expired', message: '인증 코드가 만료되었습니다. 다시 요청해 주세요.' });
  }
  if (stored !== code) {
    return jsonResponse({ ok: false, error: 'code_mismatch', message: '인증 코드가 일치하지 않습니다.' });
  }
  cache.remove('admin_code_' + email);

  var exp = Date.now() + AUTH_ADMIN_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  var token = signAuthToken(email, exp, true);  // admin 스코프
  return jsonResponse({ ok: true, token: token, email: email, exp: exp });
}


// ============================================================
//  슬롯 제어 — 관리자가 날짜·회차를 "예약 불가"로 잠금
//  bookings와 별개의 slot_blocks 탭에 보관. 메인 예약 페이지의
//  availability 응답에 blockedSlots로 합류해 즉시 반영된다.
// ============================================================
function getSlotBlocksSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SLOT_BLOCKS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SLOT_BLOCKS_SHEET_NAME);
    var HEADERS = ['id', 'date', 'slot', 'timestamp', 'by', 'reason'];
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    var hr = sheet.getRange(1, 1, 1, HEADERS.length);
    hr.setBackground('#3a5035'); hr.setFontColor('#ffffff'); hr.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 슬롯 차단 목록 조회 — date 지정 시 해당 날짜만, 아니면 전체.
// 관리자 페이지가 읽으며(GET, 토큰 없이 차단 현황 자체는 민감정보 아님), 메인 페이지는 availability로 받는다.
function handleGetSlotBlocks(date) {
  var sheet = getSlotBlocksSheet();
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var di = headers.indexOf('date'), si = headers.indexOf('slot');
  var ii = headers.indexOf('id'), bi = headers.indexOf('by'), ri = headers.indexOf('reason'), ti = headers.indexOf('timestamp');
  var out = [];
  for (var r = 1; r < rows.length; r++) {
    var rowDate = normalizeDate(rows[r][di]);
    if (!rowDate) continue;
    if (date && rowDate !== normalizeDate(date)) continue;
    out.push({
      id: String(rows[r][ii] || ''),
      date: rowDate,
      slot: Number(rows[r][si]),
      by: String(rows[r][bi] || ''),
      reason: String(rows[r][ri] || ''),
      timestamp: rows[r][ti] ? String(rows[r][ti]) : ''
    });
  }
  return jsonResponse({ blocks: out });
}

// 슬롯 차단 추가. 이미 같은 date+slot 차단이 있으면 중복 없이 무시.
function handleSlotBlock(data, byEmail) {
  var date = normalizeDate(data.date);
  var slot = Number(data.slot);
  if (!date || !(slot >= 1 && slot <= 3)) {
    return jsonResponse({ error: 'invalid_params' });
  }
  var sheet = getSlotBlocksSheet();
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var di = headers.indexOf('date'), si = headers.indexOf('slot');
  for (var r = 1; r < rows.length; r++) {
    if (normalizeDate(rows[r][di]) === date && Number(rows[r][si]) === slot) {
      return jsonResponse({ success: true, duplicate: true });  // 이미 차단됨
    }
  }
  sheet.appendRow([String(Date.now()), date, slot, new Date().toISOString(), byEmail || '', data.reason || '']);
  return jsonResponse({ success: true });
}

// 슬롯 차단 해제 — id 또는 date+slot으로 매칭되는 행 제거.
function handleSlotUnblock(data) {
  var sheet = getSlotBlocksSheet();
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var ii = headers.indexOf('id'), di = headers.indexOf('date'), si = headers.indexOf('slot');
  var date = data.date ? normalizeDate(data.date) : null;
  var slot = data.slot != null ? Number(data.slot) : null;
  // 뒤에서부터 삭제(행 인덱스 밀림 방지)
  var removed = 0;
  for (var r = rows.length - 1; r >= 1; r--) {
    var match = false;
    if (data.id) {
      match = (String(rows[r][ii]) === String(data.id));
    } else if (date && slot != null) {
      match = (normalizeDate(rows[r][di]) === date && Number(rows[r][si]) === slot);
    }
    if (match) { sheet.deleteRow(r + 1); removed++; }
  }
  return jsonResponse({ success: removed > 0, removed: removed });
}


// ============================================================
//  텔레그램 알림 (담당자 그룹 채팅)
//  - 봇 토큰과 chat_id는 Script Property에서 읽음
//  - 미설정 시 silent skip — 운영에 영향 없음
//  - 실패해도 try/catch로 격리되어 예약 저장/상태 변경에는 영향 없음
//  - 그룹 셋업: @BotFather → 봇 생성 → 그룹에 봇 초대 → 그룹에서 봇에게
//    아무 메시지 1회 → https://api.telegram.org/bot<TOKEN>/getUpdates 에서
//    chat.id 확인 (음수) → Script Property에 등록 후 재배포 (?type=telegram_test 로 확인)
// ============================================================

function getTelegramConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    token:  (props.getProperty(TELEGRAM_PROP_TOKEN)   || '').trim(),
    chatId: (props.getProperty(TELEGRAM_PROP_CHAT_ID) || '').trim()
  };
}

// HTML parse_mode에서 보호해야 하는 문자만 이스케이프 (& < >)
function escapeTelegramHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendTelegramMessage(text) {
  try {
    var cfg = getTelegramConfig();
    if (!cfg.token || !cfg.chatId) {
      Logger.log('[telegram] skip — token or chat_id not set');
      return { ok: false, reason: 'not_configured' };
    }
    var url = 'https://api.telegram.org/bot' + cfg.token + '/sendMessage';
    var payload = {
      chat_id: cfg.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200) {
      Logger.log('[telegram] sent ok');
      return { ok: true };
    }
    Logger.log('[telegram] HTTP ' + code + ' ' + res.getContentText());
    return { ok: false, reason: 'http_' + code, body: res.getContentText() };
  } catch (e) {
    Logger.log('[telegram] error ' + (e && e.message ? e.message : e));
    return { ok: false, reason: 'exception' };
  }
}

// 새 예약 신청 알림 — handleNewBooking에서 호출
function sendTelegramNewBooking(data, id) {
  var e = escapeTelegramHtml;
  var slotLabel = data.slotLabel || (data.slot ? data.slot + '회차' : '');
  var subjLabelMap = {
    'customer':       '고객/고객사',
    'rd':             '프로젝트명',
    'internal-event': '행사명',
    'external-event': '행사명',
    'content':        '촬영명',
    'other':          '제목'
  };
  var subjLabel = subjLabelMap[data.purposeKey] || '제목';
  var subject   = data.subject || data.org || '';
  var company   = data.clientCompany || '';
  var count     = data.count || '';

  var lines = [];
  lines.push('🆕 <b>새 예약 신청</b>');
  lines.push('');
  lines.push('📅 ' + e(data.date) + '  ' + e(slotLabel));
  lines.push('🎯 ' + e(data.purpose));
  if (subject) lines.push('📝 ' + e(subjLabel) + ': ' + e(subject));
  if (company) lines.push('🏢 ' + e(company));
  lines.push('👤 ' + e(data.name) + (count ? '  ·  총 ' + e(count) + '명' : ''));
  if (data.phone) lines.push('☎ ' + e(data.phone));
  lines.push('');
  lines.push('<a href="https://thinqreal.com/thinqreal_admin.html">관리자 페이지에서 승인/거절</a>');

  sendTelegramMessage(lines.join('\n'));
}

// 예약 확정/거절 알림 — handleUpdateStatus에서 호출
//  row: 시트 원본 행 배열, headers: 헤더 배열, status: '확정' | '거절' 등
function sendTelegramStatusChange(row, headers, status) {
  var e = escapeTelegramHtml;
  function get(name) {
    var i = headers.indexOf(name);
    if (i < 0) return '';
    var v = row[i];
    if (Object.prototype.toString.call(v) === '[object Date]') return normalizeDate(v);
    return String(v == null ? '' : v);
  }
  var date      = get('date');
  var slotLabel = get('slotLabel');
  var purpose   = get('purpose');
  var subject   = get('subject') || get('org');
  var name      = get('name');

  var header;
  if (status === '확정')      header = '✅ <b>예약 확정</b>';
  else if (status === '거절') header = '❌ <b>예약 거절</b>';
  else                         header = 'ℹ️ <b>상태 변경</b> — ' + e(status);

  var lines = [];
  lines.push(header);
  lines.push('');
  lines.push('📅 ' + e(date) + '  ' + e(slotLabel));
  if (purpose) lines.push('🎯 ' + e(purpose));
  if (subject) lines.push('📝 ' + e(subject));
  if (name)    lines.push('👤 ' + e(name));

  sendTelegramMessage(lines.join('\n'));
}

// GET ?type=telegram_test — 봇·chat_id 설정 검증 (테스트 메시지 1통 발송)
function handleTelegramTest() {
  var cfg = getTelegramConfig();
  if (!cfg.token || !cfg.chatId) {
    return jsonResponse({ ok: false, reason: 'not_configured',
      hint: 'Script Property TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 확인' });
  }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var res = sendTelegramMessage('🧪 <b>ThinQ Real 텔레그램 연동 테스트</b>\n' + stamp);
  return jsonResponse(res);
}
