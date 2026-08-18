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
const HEALTH_SHEET_NAME = 'health_checks';      // 시트 탭 이름 (FieldCheck 자동 점검 이력)
// FieldCheck 점검 장비 인증 키 — **Script Property 'FC_API_KEY'에만 둔다** (퍼블릭 리포라 코드 커밋 금지, 2026-07-30 이전).
// 기존 하드코딩 값은 노출된 것으로 간주해 폐기 — Property에는 새 값을 등록하고 점검 장비(fieldcheck/rig config.json
// api_key)와 동시 교체할 것. Property 미설정 시 health_check 접수는 전부 거부된다 (fail-closed).
function getFcApiKey() {
  return PropertiesService.getScriptProperties().getProperty('FC_API_KEY') || '';
}
// FieldCheck 알림 정책
const FC_TEST_MODE = true;        // 테스트 단계: 메일은 CC_EMAIL(강원석)에게만, 텔레그램 발송 안 함. 정식 운영 전환 시 false
const FC_IMMEDIATE_ALERT = false; // 건별 실패 즉시 알림 — 테스트 단계에선 끔 (일일 요약만). 정식 운영 시 true 검토
const FC_SUMMARY_HOUR = 7;        // 일일 요약 메일 발송 시각(시) — setupFieldCheckDailyTrigger() 참조
const FC_SUMMARY_MINUTE = 40;     // 발송 목표 분 — nearMinute은 ±15분 오차(07:25~07:55). 07:00 점검 종료 후·사내 게이트웨이 지연 감안해도 09:00 시연 전 수신
// 판정 단계 표기 (요약 메일에서 단계별로 나눠 집계할 때 사용)
const FC_LEVEL_LABELS = {
  L1: 'L1 응답 감지 — 말을 했는가',
  L2: 'L2 내용 판정 — 질문에 맞는 답을 했는가 (응답한 건 중)',
  L3: 'L3 가전 동작 — 실제로 제어되었는가',
};
// '응답 시작' 지표의 정의. 무엇을 재는 값인지 메일에 함께 싣지 않으면
// 숫자만 보고는 의미를 알 수 없다 (총 답변 길이로 오해하기 쉬움).
const FC_LATENCY_NOTE = '응답 시작 = 점검 질문을 다 말한 순간부터 ThinQ ON이 답을 시작하기까지 걸린 시간입니다. 답변을 끝내기까지의 길이는 포함하지 않습니다.';
// 신규 예약 알림을 받는 담당자들 (콤마로 구분, MailApp이 다중 수신 처리)
const ADMIN_EMAILS = 'ch275.lee@lge.com, moonsu.seo@lge.com, hj8462.kim@lge.com';
const CC_EMAIL     = 'kang.wonseok@lge.com';  // 참조 수신자 (시스템 동작 모니터링)

// 방문 전 이용 안내 페이지 URL (이용안내 탭으로 직접 이동)
const GUIDE_URL = 'https://thinqreal.com/#page-guide';

// ── 사이트 접근 통제 (이메일 게이트, 4안) ─────────────────────
// 허용 이메일 도메인. 임직원 검증 + 사이트 자체 차단을 동시에 만족.
const AUTH_ALLOWED_DOMAINS = ['lge.com'];
// 인증 코드 유효 시간 / 토큰 유효 기간 / 재요청 쿨다운
// 사내 메일 보안 검역으로 외부 발신 메일이 수분~수십분 지연될 수 있어 코드 TTL을 20분으로 둔다.
// 그만큼 무차별 대입 노출 시간이 길어지므로 검증 실패 5회 누적 시 잠금.
const AUTH_CODE_TTL_SEC      = 20 * 60;        // 20분
const AUTH_TOKEN_TTL_DAYS    = 30;             // 30일 쿠키
const AUTH_COOLDOWN_SEC      = 60;             // 60초 재요청 방지
const AUTH_MAX_FAIL_ATTEMPTS = 5;              // 5회 연속 실패 시 잠금
const AUTH_FAIL_WINDOW_SEC   = 20 * 60;        // 잠금 유지 20분 (코드 TTL과 동일)

// ── 관리자 접근 통제 ─────────────────────────────────────────
// 이 명단의 메일만 관리자 인증·삭제·승인·슬롯 제어를 수행할 수 있다.
// 메인 사이트 게이트(@lge.com 전체)보다 강하게 한정한다.
const AUTH_ADMIN_EMAILS = [
  'kang.wonseok@lge.com',  // 강원석 — 시스템 운영
  'jhs.kim@lge.com',       // 김재훈 팀장
  'ch275.lee@lge.com',     // 이철호 책임
  'moonsu.seo@lge.com',    // 서문수 선임
  'hj8462.kim@lge.com',    // 김현진 선임
  'kwangsoo.park@lge.com', // 박광수 책임
  'jason.kwon@lge.com'     // 권영섭 (2026-08-06 추가 — 관리자 페이지 접근용, 담당자 알림 미수신)
];
const AUTH_ADMIN_TOKEN_TTL_DAYS = 90;       // 관리자 토큰 유효 기간 (2026-07-07 7일→90일 연장)

// ── 임시 관리자 (한시적 권한 부여) ──────────────────────────
// 침투 테스트·외부 감사·위탁 점검 등 한시적 관리자 권한이 필요할 때 사용.
// AUTH_ADMIN_EMAILS에 추가하는 대신 만료일을 명시해 자동으로 회수되게 한다.
// 형식: 이메일(소문자) → 만료일 'YYYY-MM-DD' (KST 23:59:59까지 유효, 다음날 00:00부터 자동 거부).
// 토큰이 살아 있어도 verifyAdminToken/isAdminEmail이 만료 후 자동 차단하므로 별도 청소 불필요.
const AUTH_TEMP_ADMINS = {
  'aelim.go@lge.com': '2026-07-03'  // 사내 정보보호팀 침투테스트 (2026-06-29 ~ 07-03)
};

// 임시 관리자 활성 여부 — 등록되어 있고 KST 만료일 23:59:59 이전이면 true
function isTempAdminActive(email) {
  if (!email) return false;
  var key = String(email).trim().toLowerCase();
  var expiry = AUTH_TEMP_ADMINS[key];
  if (!expiry) return false;
  var expiryTs = new Date(expiry + 'T23:59:59+09:00').getTime();
  return Date.now() <= expiryTs;
}

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
  if (type === 'calendar_test') {
    return handleCalendarTest();
  }
  if (type === 'survey_data') {
    return handleGetSurveyData(e.parameter.token);
  }
  if (type === 'health_checks') {
    return handleGetHealthChecks(e.parameter.days);
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
  if (data.type === 'survey_submit') return handleSurveySubmit(data);
  if (data.type === 'visitor_submit') return handleVisitorSubmit(data);   // 방문자 현장 설문 (익명·공개, §8-5)
  if (data.type === 'roi_snapshot') return handleNewRoiSnapshot(data);
  // roi_delete는 ROI 툴(별창 포함)에서 호출돼 토큰 경로가 없어 게이트하지 않음 (저위험, §향후 검토)
  if (data.type === 'roi_delete')   return handleDeleteRoiSnapshot(data);
  // health_check는 점검 장비(무인 기기)가 호출 — 관리자 토큰 대신 FC_API_KEY로 인증
  if (data.type === 'health_check') return handleNewHealthCheck(data);

  // ── 관리자 토큰이 필요한 파괴적/운영 작업 ──
  // 클라이언트 화면을 우회해도 백엔드가 토큰을 검증하므로 명단 외 요청은 거부된다.
  if (data.type === 'update' || data.type === 'booking_delete' ||
      data.type === 'slot_block' || data.type === 'slot_unblock' ||
      data.type === 'admin_booking_create' || data.type === 'admin_booking_edit' ||
      data.type === 'survey_update' || data.type === 'survey_delete' ||
      data.type === 'ledger_update' || data.type === 'ledger_delete' ||
      data.type === 'issue_update' || data.type === 'issue_delete' ||
      data.type === 'visitor_delete' || data.type === 'export_log' ||
      data.type === 'insight_add' || data.type === 'insight_delete' ||
      data.type === 'article_add' || data.type === 'article_delete' ||
      data.type === 'insight_move' || data.type === 'article_move') {
    var admin = verifyAdminToken(data.token);
    if (!admin.ok) {
      return jsonResponse({ error: 'unauthorized', reason: admin.reason || 'invalid_token' });
    }
    if (data.type === 'update')               return handleUpdateStatus(data);
    if (data.type === 'booking_delete')       return handleDeleteBooking(data, admin.email);
    if (data.type === 'slot_block')           return handleSlotBlock(data, admin.email);
    if (data.type === 'slot_unblock')         return handleSlotUnblock(data);
    if (data.type === 'admin_booking_create') return handleAdminCreateBooking(data, admin.email);
    if (data.type === 'admin_booking_edit')   return handleAdminEditBooking(data, admin.email);
    if (data.type === 'survey_update')        return handleSurveyUpdate(data);
    if (data.type === 'survey_delete')        return handleSurveyDelete(data);
    if (data.type === 'ledger_update')        return handleLedgerUpdate(data);
    if (data.type === 'ledger_delete')        return handleLedgerDelete(data);
    if (data.type === 'issue_update')         return handleIssueUpdate(data);
    if (data.type === 'issue_delete')         return handleIssueDelete(data);
    if (data.type === 'visitor_delete')       return handleVisitorDelete(data);
    if (data.type === 'export_log')           return handleExportLog(data, admin.email);
    if (data.type === 'insight_add')          return handleInsightAdd(data);
    if (data.type === 'insight_delete')       return handleInsightDelete(data);
    if (data.type === 'article_add')          return handleArticleAdd(data);
    if (data.type === 'article_delete')       return handleArticleDelete(data);
    if (data.type === 'insight_move')         return handleInsightMove(data);
    if (data.type === 'article_move')         return handleArticleMove(data);
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

  // Google 캘린더 동기화 — 확정이면 일정 등록/갱신, 거절이면 제거 (CALENDAR_ID 미설정 시 skip)
  syncCalendarByStatus(data.id, data.status);

  return jsonResponse({ success: true });
}


// 예약 영구 삭제 — id로 행을 찾아 제거. 메일은 발송하지 않음 (테스트·실수 데이터 정리용).
// 관리자 토큰 검증을 통과한 호출만 진입한다(doPost 게이트). byEmail은 감사 로그용.
function handleDeleteBooking(data, byEmail) {
  // 행을 지우기 전에 캘린더 이벤트부터 제거 (CALENDAR_ID 미설정 시 skip)
  syncCalendarDelete(data.id);

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


// ── 관리자 직접 입력 (이력 백필) ─────────────────────────────
// 시스템 오픈 전 외부 채널로 잡힌 과거 방문 이력을 관리자가 직접 기록한다.
// 알림(담당자 메일·텔레그램)은 발송하지 않는다 — 실제 신규 신청이 아니라 이력 입력이므로.
// 관리자 토큰 검증을 통과한 호출만 진입한다(doPost 게이트). byEmail은 감사 로그용.
function handleAdminCreateBooking(data, byEmail) {
  const sheet   = getSheet();
  const headers = getOrCreateHeaders(sheet);
  // id는 클라이언트가 보낸 값을 우선 사용(낙관적 UI와 동일 id 유지) → 없으면 서버에서 생성
  const id = data.id ? String(data.id) : String(Date.now());
  const slots = normalizeSlotsInput(data.slots, data.slot);

  const row = headers.map(h => {
    if (h === 'id')        return id;
    if (h === 'timestamp') return data.timestamp || new Date().toISOString();
    if (h === 'slots')     return JSON.stringify(slots);
    if (h === 'slot')      return slots.length ? slots[0] : (data.slot ?? '');
    if (h === 'status')    return data.status || '확정';
    return data[h] ?? '';
  });

  sheet.appendRow(row);
  // 확정 이력이면 캘린더에도 등록 (대기중/거절이면 skip)
  if ((data.status || '확정') === '확정') syncCalendarUpsert(id);
  Logger.log('Admin created booking ' + id + ' by ' + byEmail + ' (no notification)');
  return jsonResponse({ success: true, id });
}


// ── 관리자 상세 정보 수정 ───────────────────────────────────
// 고객이 대충 적은 상세를 담당자가 보강·정정한다. 알림 미발송.
// id·timestamp·privacyConsent는 보존하고, 보내온 편집 가능 필드만 갱신한다.
function handleAdminEditBooking(data, byEmail) {
  const sheet   = getSheet();
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx   = headers.indexOf('id');
  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) return jsonResponse({ error: 'Record not found' });

  const setField = (name, value) => {
    const idx = headers.indexOf(name);
    if (idx >= 0) sheet.getRange(targetRow, idx + 1).setValue(value);
  };

  // 회차(slots/slot)는 함께 처리 — slots 또는 slot이 오면 갱신
  if (data.slots !== undefined || data.slot !== undefined) {
    const slots = normalizeSlotsInput(data.slots, data.slot);
    if (slots.length) {
      setField('slots', JSON.stringify(slots));
      setField('slot', slots[0]);
    }
  }

  // 나머지 편집 가능한 필드만 갱신 (undefined는 건너뜀)
  ['date', 'slotLabel', 'name', 'org', 'phone', 'email', 'purpose', 'count', 'note', 'status',
   'subject', 'clientCompany', 'visitors', 'usagePlan', 'expectedEffect', 'purposeKey',
   'division', 'department'
  ].forEach(f => { if (data[f] !== undefined) setField(f, data[f]); });

  // 캘린더 동기화 — 갱신된 행의 최종 상태 기준 (확정이면 등록/갱신, 아니면 제거)
  const after = findBookingRow(data.id);
  if (after) syncCalendarByStatus(data.id, after.obj['status']);

  Logger.log('Admin edited booking ' + data.id + ' by ' + byEmail + ' (no notification)');
  return jsonResponse({ success: true });
}


// 회차 입력 정규화 — slots(배열/JSON 문자열) 또는 slot(단일) → 숫자 배열
function normalizeSlotsInput(slots, slot) {
  let arr = [];
  if (Array.isArray(slots)) arr = slots;
  else if (typeof slots === 'string' && slots) { try { arr = JSON.parse(slots); } catch(e) {} }
  if (!arr.length && slot != null && slot !== '') arr = [slot];
  return arr.map(n => Number(n)).filter(n => !isNaN(n));
}


// ============================================================
//  Google 캘린더 연동 (팀 공유 캘린더)
//  - 확정된 예약을 팀 공유 캘린더에 일정으로 자동 등록한다.
//    (확정 시 등록 / 수정 시 갱신 / 거절·삭제 시 제거 — 항상 실제 현황과 일치)
//  - 캘린더 ID는 Script Property에 저장 (코드 분리). 미설정 시 silent skip.
//      CALENDAR_ID : 대상 캘린더 ID (예: xxxxx@group.calendar.google.com)
//  - 다른 계정의 캘린더를 쓰려면 그 캘린더를 스크립트 소유자 계정
//    (kang.wonseok@lge.com)에 "변경 권한"으로 공유해야 한다.
//  - 캘린더 일정에는 운영 정보만 표기 (방문자 명단·연락처 제외 — 공유 노출 최소화).
// ============================================================
const CALENDAR_PROP_ID = 'CALENDAR_ID';

// 회차 → 시작/종료 시각 (KST, [시, 분]). 슬롯 시간표는 확정값(변경 금지).
const SLOT_TIMES = {
  1: { start: [9, 0],  end: [10, 30] },
  2: { start: [13, 0], end: [14, 30] },
  3: { start: [15, 0], end: [16, 30] },
};
const SLOT_LABEL_TEXT = { 1: '1회차 09:00~10:30', 2: '2회차 13:00~14:30', 3: '3회차 15:00~16:30' };

function getBookingCalendar() {
  const id = PropertiesService.getScriptProperties().getProperty(CALENDAR_PROP_ID);
  if (!id) return null;
  try {
    const cal = CalendarApp.getCalendarById(id);
    if (!cal) Logger.log('Calendar not found / no access: ' + id);
    return cal;
  } catch(e) {
    Logger.log('Calendar open error: ' + e.message);
    return null;
  }
}

// 예약 객체(시트 행 기반) → 캘린더 이벤트 배열 (회차마다 1건).
// 회차 사이에는 재정비·점심 공백이 있어 항상 회차별 개별 일정으로 쪼갠다
// (1·3회차처럼 떨어진 회차를 하나로 묶어 빈 시간까지 점유하는 오류 방지).
function buildCalendarEvents(b) {
  const slots = normalizeSlotsInput(b.slots, b.slot).sort((a, c) => a - c);
  if (!slots.length) return [];
  const dateStr = normalizeDate(b.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  const [y, m, d] = dateStr.split('-').map(Number);

  const purpose = String(b.purpose || '').trim();
  const subject = String(b.subject || b.org || '').trim();
  const title = '[' + (purpose || 'ThinQ Real') + '] ' + (subject || '예약') +
                (b.name ? ' · ' + b.name : '');
  const location = '마곡 LG사이언스파크 W6동 1층';

  return slots.filter(n => SLOT_TIMES[n]).map(n => {
    const t = SLOT_TIMES[n];
    const start = new Date(y, m - 1, d, t.start[0], t.start[1], 0);
    const end   = new Date(y, m - 1, d, t.end[0],   t.end[1],   0);

    // 운영 정보만 — 방문자 명단/연락처(전화·이메일) 제외
    const lines = [];
    if (purpose) lines.push('목적: ' + purpose);
    if (subject) lines.push('주제: ' + subject);
    if (b.clientCompany) lines.push('고객사: ' + b.clientCompany);
    lines.push('회차: ' + (SLOT_LABEL_TEXT[n] || (n + '회차')));
    if (b.count !== '' && b.count != null) lines.push('인원: ' + b.count + '명');
    if (b.name) lines.push('책임자: ' + b.name);
    if (b.usagePlan) { lines.push('', '활용 방안:', String(b.usagePlan)); }
    lines.push('', '— 상세는 관리자 페이지에서 확인', 'https://thinqreal.com/thinqreal_admin.html');

    return { title: title, start: start, end: end,
             options: { description: lines.join('\n'), location: location } };
  });
}

function safeGetEvent(cal, eid) { try { return cal.getEventById(eid); } catch(e) { return null; } }

// calendarEventId 셀 파싱 — 신규(JSON 배열) + 레거시(단일 문자열) 모두 처리
function parseEventIds(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') {
    try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch(e) { return []; }
  }
  return [s];  // 레거시 단일 id
}

// id로 시트 행을 찾아 {sheet, headers, rowNum, obj} 반환 (없으면 null)
function findBookingRow(id) {
  const sheet   = getSheet();
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx   = headers.indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(id)) {
      const obj = {};
      headers.forEach((h, j) => { obj[h] = rows[i][j]; });
      return { sheet, headers, rowNum: i + 1, obj };
    }
  }
  return null;
}

// 확정 예약을 캘린더에 등록/갱신 — 회차별 개별 일정.
// 회차 구성이 바뀌어도 정확히 반영되도록 기존 이벤트를 모두 지우고 새로 만든다(delete+recreate).
// 생성된 이벤트 id 배열을 JSON으로 시트에 write-back.
function syncCalendarUpsert(id) {
  const cal = getBookingCalendar();
  if (!cal) return;
  const found = findBookingRow(id);
  if (!found) return;
  const evIdIdx = found.headers.indexOf('calendarEventId');

  // 1) 기존 이벤트 전부 제거
  const existing = evIdIdx >= 0 ? parseEventIds(found.obj['calendarEventId']) : [];
  existing.forEach(eid => {
    const ev = safeGetEvent(cal, eid);
    if (ev) { try { ev.deleteEvent(); } catch(e) { Logger.log('Cal del(upsert): ' + e.message); } }
  });

  // 2) 회차별로 새 이벤트 생성
  const specs = buildCalendarEvents(found.obj);
  const newIds = [];
  try {
    specs.forEach(ev => {
      const created = cal.createEvent(ev.title, ev.start, ev.end, ev.options);
      newIds.push(created.getId());
    });
  } catch(e) {
    Logger.log('Calendar upsert error: ' + e.message);
  }

  // 3) id 배열 write-back (없으면 빈 값)
  if (evIdIdx >= 0) {
    found.sheet.getRange(found.rowNum, evIdIdx + 1).setValue(newIds.length ? JSON.stringify(newIds) : '');
  }
}

// 예약의 캘린더 이벤트를 모두 제거하고 시트의 eventId를 비운다.
function syncCalendarDelete(id) {
  const cal = getBookingCalendar();
  if (!cal) return;
  const found = findBookingRow(id);
  if (!found) return;
  const evIdIdx = found.headers.indexOf('calendarEventId');
  if (evIdIdx < 0) return;
  const ids = parseEventIds(found.obj['calendarEventId']);
  if (!ids.length) return;
  ids.forEach(eid => {
    const ev = safeGetEvent(cal, eid);
    if (ev) { try { ev.deleteEvent(); } catch(e) { Logger.log('Cal delete: ' + e.message); } }
  });
  found.sheet.getRange(found.rowNum, evIdIdx + 1).setValue('');
}

// 상태에 따른 캘린더 동기화 — 확정이면 등록/갱신, 그 외(대기중·거절)면 제거
function syncCalendarByStatus(id, status) {
  if (String(status) === '확정') syncCalendarUpsert(id);
  else syncCalendarDelete(id);
}


// ============================================================
//  메일 발송
// ============================================================

// 담당자 알림 메일 (신규 예약 접수 시)
// 목적별 1번째 줄(주제) 라벨 매핑
const ADMIN_ALERT_SUBJ_LABELS = {
  'b2b':           '고객사',
  'rd':            '프로젝트명',
  'pr':            '행사명',
  'content':       '촬영명',
  'internal-comm': '행사명',
  'other':         '제목'
};

function sendAdminAlert(data, id) {
  const slotLabel = data.slotLabel || '';
  const subject   = `[ThinQ Real] 새 예약 신청 — ${data.date} ${slotLabel}`;

  const text = buildAdminAlertText(data, id);
  const html = buildAdminAlertHtml(data, id);

  try {
    MailApp.sendEmail({
      to: ADMIN_EMAILS, cc: CC_EMAIL, subject,
      body: text, htmlBody: html,
      name: 'ThinQ Real',
    });
    Logger.log('Admin mail sent → ' + ADMIN_EMAILS + ' (CC: ' + CC_EMAIL + ')');
  } catch(err) {
    Logger.log('Admin mail error: ' + err.message);
  }
}

function buildAdminAlertText(data, id) {
  const subjLabel = ADMIN_ALERT_SUBJ_LABELS[data.purposeKey] || '제목';

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

  return `
새로운 예약 신청이 접수되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  예약 ID : ${id}
  날  짜  : ${data.date}
  회  차  : ${data.slotLabel || ''}
  목  적  : ${data.purpose}
  ${subjLabel.padEnd(7, ' ')}: ${data.subject || data.org || ''}
  책임자  : ${data.name}
  소  속  : ${[data.division, data.department].filter(Boolean).join(' · ')}
  연락처  : ${data.phone}
  이메일  : ${data.email}
  인  원  : ${data.count}명${visitorsLines}

  활용 방안 :
${(data.usagePlan || '').split('\n').map(l => '    ' + l).join('\n')}

  기대 효과 :
${(data.expectedEffect || '').split('\n').map(l => '    ' + l).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

관리자 페이지에서 승인 또는 거절해 주세요.
https://thinqreal.com/thinqreal_admin.html
  `.trim();
}

function buildAdminAlertHtml(data, id) {
  const subjLabel = ADMIN_ALERT_SUBJ_LABELS[data.purposeKey] || '제목';
  const date     = escapeHtml(data.date);
  const slot     = escapeHtml(data.slotLabel || '');
  const purpose  = escapeHtml(data.purpose || '');
  const subjVal  = escapeHtml(data.subject || data.org || '');
  const client   = escapeHtml(data.clientCompany || '');
  const name     = escapeHtml(data.name || '');
  const belong   = escapeHtml([data.division, data.department].filter(Boolean).join(' · '));
  const phone    = escapeHtml(data.phone || '');
  const email    = escapeHtml(data.email || '');
  const count    = escapeHtml(String(data.count || ''));
  const usage    = String(data.usagePlan || '').trim();
  const effect   = String(data.expectedEffect || '').trim();

  // 방문자 명단 HTML
  let visitorsHtml = '';
  try {
    const vs = JSON.parse(data.visitors || '[]');
    if (vs.length) {
      const rows = vs.map((v, i) => {
        const idx = String(i + 1).padStart(2, '0');
        const parts = [v.org, v.name, v.rank].filter(Boolean).map(escapeHtml);
        const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
        return (
          '<tr style="background:' + bg + ';">' +
            '<td style="padding:6px 10px;font-size:12px;color:#aeaeb2;font-variant-numeric:tabular-nums;width:32px;text-align:right;">' + idx + '</td>' +
            '<td style="padding:6px 12px;font-size:13px;color:#1d1d1f;">' + parts.join(' <span style="color:#c7c7cc;">·</span> ') + '</td>' +
          '</tr>'
        );
      }).join('');
      visitorsHtml =
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #eeeeee;border-radius:6px;overflow:hidden;margin-top:6px;">' +
          '<tbody>' + rows + '</tbody>' +
        '</table>';
    }
  } catch(e) {}

  // 다단 텍스트 영역 (활용 방안 / 기대 효과)
  const multiline = (s) => escapeHtml(s).replace(/\n/g, '<br>');
  const blockBox = (text) =>
    '<div style="margin-top:6px;padding:12px 14px;background:#f5f5f7;border-left:3px solid #8fa889;border-radius:4px;font-size:13px;color:#1d1d1f;line-height:1.7;">' +
      (text ? multiline(text) : '<span style="color:#aeaeb2;">(작성된 내용 없음)</span>') +
    '</div>';

  const infoRow = (icon, label, valueHtml) =>
    '<tr>' +
      '<td valign="top" style="padding:14px 12px 14px 0;width:96px;font-size:13px;color:#6e6e73;font-weight:600;white-space:nowrap;">' + icon + '&nbsp;' + label + '</td>' +
      '<td valign="top" style="padding:14px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">' + valueHtml + '</td>' +
    '</tr>';

  let rows =
    infoRow('📅', '일정',
      '<div style="font-size:16px;font-weight:600;color:#3a5035;">' + date + '</div>' +
      '<div style="color:#6e6e73;font-size:13px;">' + slot + '</div>') +
    infoRow('🎯', '목적', purpose) +
    infoRow('📝', subjLabel, subjVal || '<span style="color:#aeaeb2;">—</span>');

  if (client) {
    rows += infoRow('🏢', '고객사', client);
  }

  rows +=
    infoRow('👤', '책임자', name) +
    infoRow('🏛', '소속', belong || '<span style="color:#aeaeb2;">—</span>') +
    infoRow('☎', '연락처',
      '<div>' + phone + '</div>' +
      '<div style="color:#6e6e73;font-size:13px;"><a href="mailto:' + email + '" style="color:#3a5035;text-decoration:none;">' + email + '</a></div>') +
    infoRow('👥', '인원',
      '<div style="font-size:15px;font-weight:600;">' + count + '명</div>' +
      visitorsHtml) +
    infoRow('💡', '활용 방안', blockBox(usage)) +
    infoRow('✨', '기대 효과', blockBox(effect));

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">새 예약 신청이 접수되었습니다</div>' +
          '<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:8px;font-variant-numeric:tabular-nums;">예약 ID · ' + escapeHtml(String(id)) + '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;border-top:1px solid #eeeeee;">' +
            rows +
          '</table>' +
          '<div style="margin-top:28px;text-align:center;">' +
            '<a href="https://thinqreal.com/thinqreal_admin.html" style="display:inline-block;background:#3a5035;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">관리자 페이지에서 승인 / 거절하기 ↗</a>' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
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
      name: 'ThinQ Real',
    });
    Logger.log('Guest mail sent → ' + data.email + ' (' + data.status + ')');
  } catch(err) {
    Logger.log('Guest mail error: ' + err.message);
  }
}

function buildConfirmText(data) {
  const includeAppliances = (data.purpose || '').indexOf('R&D') >= 0;
  const includeWelcomeBoard = /(B2B|홍보)/.test(data.purpose || '');

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
    `   509067`,
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
  const includeWelcomeBoard = /(B2B|홍보)/.test(data.purpose || '');
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
      '<div style="font-family:Consolas,Menlo,monospace;font-size:15px;color:#1d1d1f;letter-spacing:0.04em;">509067</div>') +
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
//  월간 운영 리포트 (매월 첫째 주 수요일 08:30 KST에 전월 리포트 자동 발송 — 2026-07-29 변경)
//  - 트리거 설치는 1회: 스크립트 에디터에서 installMonthlyReportTrigger() 실행
//  - 매일 08:30 시간 트리거가 동작 → 함수 내부에서 "오늘이 이번 달 첫째 수요일인가" 체크 후 전월 리포트 발송
//  - 수신자/검색 키는 Script Properties에서 관리 (코드에 키 미노출)
//      MONTHLY_REPORT_TO   : 콤마 구분 수신자 (없으면 발송 스킵)
//      SERPER_API_KEY      : Serper.dev API Key (Google 결과 우회) [1순위]
//      GOOGLE_CSE_ID       : Programmable Search Engine ID (cx)    [폴백]
//      GOOGLE_CSE_KEY      : Custom Search API Key                  [폴백]
//  - 수동 미리보기: GET ?type=monthly_report_preview&month=YYYY-MM
//  - 수동 발송    : GET ?type=monthly_report_send&month=YYYY-MM&confirm=YES
// ============================================================

// 기사 자동 수집 키워드 — "ThinQ Real" 정확 문구는 보도가 드물어 사실상 LG전자 일반 기사로
// 흘렀던 것을, AI홈 동향 수집 의도를 명확히 하는 키워드로 변경 (2026-07-20).
// 변경 시 기사 섹션 설명문(descArticles·평문)이 이 상수를 참조하므로 자동 동기화됨.
const MONTHLY_REPORT_QUERY = 'LG전자 ThinQ Real';   // 2026-08-04 팀장 리뷰 — ThinQ Real 직접 관련 기사만 (구 'LG전자 AI홈')
const PROP_LAST_SENT_KEY   = 'monthly_report_last_sent_month';

// 방문 목적별 카테고리 색상 — 관리자 페이지 PURPOSE_COLORS와 동기화 (thinqreal_admin.html)
// 2026-07 카테고리 개편: B2B 영업 / R&D / 홍보 / 콘텐츠 제작 / 내부 커뮤니케이션 / 기타
const PURPOSE_COLORS = {
  'B2B 영업':              '#ff9500',
  'R&D':                  '#3a5035',
  '홍보 (프레스투어/마케팅)': '#0a84a3',
  '콘텐츠 제작':            '#cc7000',
  '내부 커뮤니케이션':       '#7f51e4',
  '기타':                  '#8fa889',
};

// ROI 가치 항목별 색상/라벨 — ROI 툴(ThinQ_Real_ROI_Tool.html line 1723-1726)과 동기화
const ROI_VALUE_LABELS = {
  vRnD:          { label: 'R&D 기여 가치',   color: '#3a5035' },
  vSalesInfra:   { label: '영업 기여 가치',  color: '#8fa889' },
  vSalesContrib: { label: '수주 기여 이익',  color: '#ff9500' },
  vPR:           { label: '홍보 노출 가치',  color: '#af52de' },
  vQuality:      { label: '품질 개선 가치',  color: '#1b6ca8' },
};

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
  if (!isFirstWednesdayOfMonth(now)) return;
  const tz = Session.getScriptTimeZone();
  // 전월 리포트 발송 — 문자열 산술로 TZ 안전하게 전월 yyyy-MM 계산
  const y = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const m = Number(Utilities.formatDate(now, tz, 'M'));
  const monthKey = (m === 1 ? (y - 1) : y) + '-' + ('0' + (m === 1 ? 12 : m - 1)).slice(-2);
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_LAST_SENT_KEY) === monthKey) return; // 해당 월 중복 발송 방지
  try {
    const result = sendMonthlyReport({ month: monthKey });
    if (result.sentTo) props.setProperty(PROP_LAST_SENT_KEY, monthKey);
  } catch(err) {
    Logger.log('Monthly report send error: ' + err.message);
  }
}

// 스크립트 TZ 기준 오늘이 이번 달의 첫째 수요일인지 판정 (2026-07-29 — 기존 마지막 금요일에서 변경.
// 전월 데이터가 확정된 뒤 발송하는 구조라 리포트 대상은 전월)
function isFirstWednesdayOfMonth(d) {
  const tz = Session.getScriptTimeZone();
  const dow = Number(Utilities.formatDate(d, tz, 'u')); // 1=Mon ... 7=Sun
  if (dow !== 3) return false;                          // 수요일
  return Number(Utilities.formatDate(d, tz, 'd')) <= 7; // 1~7일 사이의 수요일 = 첫째 수요일
}

// options: { month?: 'YYYY-MM', dryRun?: bool, to?: 'override@a, override@b' }
function sendMonthlyReport(options) {
  options = options || {};
  const tz = Session.getScriptTimeZone();
  const props = PropertiesService.getScriptProperties();
  const month = options.month || Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const to    = options.to    || props.getProperty('MONTHLY_REPORT_TO') || '';

  const data = collectMonthlyData(month);
  // 목적 도넛 내부 렌더링 — 실패해도 발송은 막지 않음 (막대 폴백)
  let donutBytes = null;
  try {
    donutBytes = renderPurposeDonutBytes(data);
    if (donutBytes) data.donutCid = 'purposeDonut';
  } catch (err) { Logger.log('[monthly] donut render fail → bar fallback: ' + err); }
  const text = buildMonthlyReportText(data);
  const html = buildMonthlyReportHtml(data);
  const subject = `[ThinQ Real] ${data.year}년 ${data.monthNum}월 운영 리포트`;

  if (options.dryRun) {
    // 미리보기는 cid를 못 쓰므로 data URI로 치환
    const previewHtml = donutBytes
      ? html.replace(/cid:purposeDonut/g, 'data:image/png;base64,' + Utilities.base64Encode(donutBytes))
      : html;
    return { subject, html: previewHtml, text, data, sentTo: '' };
  }
  if (!to) {
    Logger.log('Monthly report skipped: MONTHLY_REPORT_TO 미설정');
    return { subject, sentTo: '', skipped: 'no recipients' };
  }
  // subjectPrefix('[테스트] ')·noCc는 §8-6 수동/테스트 발송 전용 옵션 — 자동 트리거 경로는 옵션 미전달로 기존 동작 그대로
  const finalSubject = (options.subjectPrefix || '') + subject;
  const mail = {
    to: to, subject: finalSubject,
    body: text, htmlBody: html,
    name: 'ThinQ Real',
  };
  if (donutBytes) mail.inlineImages = { purposeDonut: Utilities.newBlob(donutBytes, 'image/png', 'purpose-donut.png') };
  if (!options.noCc) mail.cc = CC_EMAIL;
  MailApp.sendEmail(mail);
  Logger.log('Monthly report sent → ' + to + ' (' + month + ')');
  return { subject, sentTo: to };
}

// ============================================================
//  §8-7 리포트 개편 (2026-08-03) — 상수·집계 헬퍼
// ============================================================

// 사업부(본부) 고정 목록 — 예약 폼 #fDivision 드롭다운과 동기화 (건수 있는 본부만 표시, 목록 외/공란은 '기타')
// 리포트 기사 상한 — 스크랩 결과 중 상위 N건만 썸네일과 함께 배치 (2026-08-03 렌더 리뷰)
const REPORT_ARTICLE_LIMIT = 5;

// ROI 확정 기준 수치 (2026-08 확정 — 저장 시나리오 의존 폐기, 고정 표기)
// 표기는 소수 1자리 억원 통일 (2026-08-04 팀장 리뷰). ※ 총액 요약·지표만 커밋 가능 — 항목별 실집행 단가는 커밋 금지
const ROI_FIXED = {
  capex: '2.8억원', opexYr: '0.1억원/년', totalCost: '2.9억원',
  bep: '1.31년 (약 1년 4개월)', roi3: '+122.4%', roi5: '+270.7%',
};

// 월간 인사이트·한마디 큐레이션 탭 (§8-7 5·6)
// type: 'insight'(핵심 인사이트) | 'quote'(인상 깊은 한마디 — source: '인솔자'|'방문자')
const INSIGHTS_SHEET_NAME = 'monthly_insights';
const INSIGHTS_HEADERS = ['id', 'month', 'seq', 'type', 'text', 'source', 'created_at'];

// 만족도 척도 판별·집계 (§8-7 3-3) — 구 5단계("N - 라벨")와 신 0~10 정수를 **절대 섞어 평균하지 않는다**
function classifySatisfaction(values) {
  const neu = [], old = [];
  (values || []).forEach(v => {
    const s = String(v == null ? '' : v).trim();
    if (!s) return;
    if (/^(10|[0-9])$/.test(s)) neu.push(Number(s));
    else {
      const m = s.match(/^([1-5])\s*-/);
      if (m) old.push(Number(m[1]));
    }
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  let nps = null;
  if (neu.length) {
    const promoters = neu.filter(n => n >= 9).length;
    const detractors = neu.filter(n => n <= 6).length;
    nps = Math.round((promoters - detractors) / neu.length * 100);
  }
  return { newCount: neu.length, newAvg: avg(neu), nps, oldCount: old.length, oldAvg: avg(old) };
}

// 만족도/NPS 표기 문자열 — 혼재 월은 두 줄 병기, 소표본(10건 미만)은 참고치 표기
function satDisplay(sat) {
  if (!sat || (!sat.newCount && !sat.oldCount)) return '—';
  const parts = [];
  if (sat.newCount) {
    const npsTxt = 'NPS ' + (sat.nps >= 0 ? '+' : '') + sat.nps + ' · 평균 ' + sat.newAvg.toFixed(1) + '/10';
    parts.push(sat.newCount < 10 ? npsTxt + ' (응답 ' + sat.newCount + '건 · 참고치)' : npsTxt + ' · 응답 ' + sat.newCount + '건');
  }
  if (sat.oldCount) parts.push('평균 만족도 ' + sat.oldAvg.toFixed(1) + '/5 (구 척도 · ' + sat.oldCount + '건)');
  return parts.join(' / ');
}


function collectMonthlyData(month) {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr), monthNum = Number(mStr);

  // 1) 예약 — 전 행을 객체화한 뒤 당월/전월/YTD로 나눠 쓴다 (§8-7 Executive·사업부 집계)
  const bookingsSheet = getSheet();
  const brows = bookingsSheet.getDataRange().getValues();
  const bheaders = brows[0];
  const allBookings = brows.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    bheaders.forEach((h, j) => {
      let v = row[j];
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = (h === 'date') ? normalizeDate(v) : v.toISOString();
      }
      obj[h] = v == null ? '' : v;
    });
    return obj;
  }).filter(b => b.date);
  const bookings = allBookings.filter(b => String(b.date).slice(0, 7) === month);

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

  // 3) 관련 기사 — 수동 큐레이션 우선 배치, 상한(5건) 미달분만 자동 수집으로 보충
  //    (2026-08-03 렌더 리뷰 후속 — 종전 "수동 행 있으면 자동 미호출"에서 병합 방식으로 변경)
  const manualItems = getManualArticles(month).slice(0, REPORT_ARTICLE_LIMIT);
  let articles;
  if (manualItems.length >= REPORT_ARTICLE_LIMIT) {
    articles = { items: manualItems, skipReason: '', source: 'manual', manualCount: manualItems.length, autoCount: 0 };
  } else if (manualItems.length > 0) {
    let fill = [];
    try {
      const seen = {};
      manualItems.forEach(it => { seen[it.link] = true; });
      fill = filterThinqRealItems(fetchThinqRealArticles().items).filter(it => !seen[it.link])
        .slice(0, REPORT_ARTICLE_LIMIT - manualItems.length);
    } catch (err) { Logger.log('[monthly] article fill fail: ' + err); }
    articles = { items: manualItems.concat(fill), skipReason: '',
                 source: fill.length ? 'mixed' : 'manual',
                 manualCount: manualItems.length, autoCount: fill.length };
  } else {
    articles = fetchThinqRealArticles();
    articles.source = articles.provider || 'auto';
    articles.items = filterThinqRealItems(articles.items).slice(0, REPORT_ARTICLE_LIMIT);
    articles.manualCount = 0;
    articles.autoCount = articles.items.length;
    if (!articles.items.length && !articles.skipReason) articles.skipReason = '이번 달 ThinQ Real 관련 보도 없음';
  }

  // 4) 설문·성과 지표 (Phase 5 — 설문 파이프라인 월간 집계 + §8-7 만족도/NPS·방문자 지표)
  //    집계 실패가 리포트 발송 자체를 막지 않도록 격리 (텔레그램·캘린더와 동일 원칙)
  let survey = null;
  try { survey = collectMonthlySurvey(month); }
  catch (err) { Logger.log('[monthly] survey metrics fail: ' + err); }

  // 6) 26년 누적(YTD) — 1월~보고월 확정 기준 건수·인원 + R&D 사용일수 (§8-7 2·8)
  let ytd = null;
  try {
    const ytdConfirmed = allBookings.filter(b => {
      const d7 = String(b.date).slice(0, 7);
      return d7.slice(0, 4) === yStr && d7 <= month && b.status === '확정';
    });
    const rdDates = {};
    ytdConfirmed.filter(b => b.purposeKey === 'rd').forEach(b => { rdDates[String(b.date)] = true; });
    ytd = {
      confirmed: ytdConfirmed.length,
      visitors: ytdConfirmed.reduce((s, b) => s + (Number(b.count) || 0), 0),
      rdDays: Object.keys(rdDates).length,
    };
  } catch (err) { Logger.log('[monthly] ytd metrics fail: ' + err); }

  // 7) 사업부별 활용 현황 — 확정 기준 건수/인원, 실제 저장된 본부 값 그대로 그룹핑 (건수 내림차순)
  //    (2026-08-04 팀장 리뷰 — 고정 6본부 목록 폐기: 고객가치혁신부문·홍보담당 등 목록 외 조직이 '기타'로 뭉치던 문제)
  let divisions = null;
  try {
    const map = {};
    confirmed.forEach(b => {
      const dv = String(b.division || '').trim() || '기타';
      if (!map[dv]) map[dv] = { name: dv, count: 0, people: 0 };
      map[dv].count += 1;
      map[dv].people += Number(b.count) || 0;
    });
    divisions = Object.keys(map).map(k => map[k])
      .sort((a, b) => (b.count - a.count) || (b.people - a.people));
    const etcIdx = divisions.findIndex(d => d.name === '기타');
    if (etcIdx >= 0) divisions.push(divisions.splice(etcIdx, 1)[0]);   // '기타'(본부 공란)는 항상 맨 뒤
  } catch (err) { Logger.log('[monthly] division metrics fail: ' + err); }

  // 8) 핵심 인사이트·인상 깊은 한마디 (monthly_insights 큐레이션 — §8-7 5·6). 행 없으면 블록 생략
  let insights = [], quotes = [];
  try {
    const rowsIns = readSheetRecords(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS)
      .filter(r => insightMonthKey(r.month) === month)
      .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
    insights = rowsIns.filter(r => String(r.type || 'insight') !== 'quote').map(r => String(r.text || '')).filter(Boolean);
    quotes = rowsIns.filter(r => String(r.type) === 'quote')
      .map(r => ({ text: String(r.text || ''), source: String(r.source || '') })).filter(q => q.text);
  } catch (err) { Logger.log('[monthly] insights fail: ' + err); }

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
    survey,
    ytd, divisions, insights, quotes,
    roiFixed: ROI_FIXED,
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

// 자동 수집 기사 필터 — ThinQ Real 직접 관련 기사만 (2026-08-04 팀장 리뷰: 무관 기사 제외, 없으면 0건)
function filterThinqRealItems(items) {
  const re = /(thinq\s*real|씽큐\s*리얼)/i;
  return (items || []).filter(it => re.test(String(it.title || '') + ' ' + String(it.snippet || '')));
}

// YouTube URL은 페이지 스크랩 시 영상 정보가 아니라 사이트 일반 소개("YouTube"/"동영상 공유")가
// 잡히므로(SPA·동의 화면), 공개 oEmbed API(제목·채널)와 i.ytimg 공식 썸네일로 우회
function youtubeVideoId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

function fetchYoutubeMeta(url) {
  const id = youtubeVideoId(url);
  if (!id) return null;
  let title = '', author = '';
  try {
    const resp = UrlFetchApp.fetch(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id),
      { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const j = JSON.parse(resp.getContentText());
      title = String(j.title || '');
      author = String(j.author_name || '');
    }
  } catch (err) { Logger.log('fetchYoutubeMeta fail: ' + err); }
  return {
    title: title,
    description: '',
    source: author ? 'YouTube · ' + author : 'YouTube',
    publishedAt: '',
    image: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
  };
}

// **굵게** 마크다운을 <strong>으로 — 인사이트·한마디 강조용 (escapeHtml 이후 적용 전제)
function mdBold(escapedText) {
  return String(escapedText).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// ── 목적 분포 도넛 — 내부 렌더링 (2026-08-04) ─────────────────────
// 이관 결정(decisions-2026-07-06 §⑦ "차트는 내부 렌더링") 준수: 외부 차트 서비스 없이
// Apps Script 안에서 PNG를 직접 생성해 메일에 cid 인라인 첨부 (수신자 측 외부 이미지 로드 없음
// → 차단망·Outlook 기본 차단에서도 표시). 렌더 실패 시 막대 차트 폴백.

// 목적별 분포 목록 — 도넛 슬라이스·범례·막대 폴백이 공유하는 단일 소스 (건수 내림차순, 0건 제외)
function purposeDist(d) {
  const total = Object.keys(d.purposeCounts).reduce((s, k) => s + (d.purposeCounts[k] || 0), 0);
  if (!total) return [];
  return Object.keys(d.purposeCounts).map(k => [k, d.purposeCounts[k] || 0])
    .filter(p => p[1] > 0).sort((a, b) => b[1] - a[1])
    .map(p => ({ label: p[0], count: p[1], pct: Math.round(p[1] / total * 100),
                 color: PURPOSE_COLORS[p[0]] || '#5e7858' }));
}

function hexToRgb(hex) {
  const m = String(hex).replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

// 도넛 PNG 바이트 생성 (GAS 서명 바이트 배열 -128..127 — base64Encode/newBlob에 그대로 사용)
function renderPurposeDonutBytes(d) {
  const dist = purposeDist(d);
  if (!dist.length) return null;
  // "레티나" 방식: PNG는 표시 크기(180px)의 ~2.7배(480px)로 생성 — 메일 클라이언트가 축소하며
  // 추가 안티앨리어싱이 생겨 곡선·숫자가 매끈해짐 (2026-08-04 리뷰: 표시 축소 + 폰트 해상도 개선)
  const W = 480, SS = 2;                 // 출력 480x480, 2x 슈퍼샘플링
  const w = W * SS, cx = w / 2, cy = w / 2;
  const R = w * 0.485, r = w * 0.30;
  const total = dist.reduce((s, x) => s + x.count, 0);
  let acc = 0;
  const bounds = dist.map(x => { acc += x.count / total; return acc; });
  const rgbs = dist.map(x => hexToRgb(x.color));
  const px = new Array(w * w * 3).fill(255);   // 흰 배경
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const dist2 = Math.sqrt(dx * dx + dy * dy);
      if (dist2 < r || dist2 > R) continue;
      let ang = Math.atan2(dx, -dy) / (2 * Math.PI);   // 12시 시작, 시계 방향 0..1
      if (ang < 0) ang += 1;
      let si = 0;
      while (si < bounds.length - 1 && ang >= bounds[si]) si++;
      const c = rgbs[si];
      const o = (y * w + x) * 3;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  // 슬라이스 위 "N건" 라벨 — 흰색 비트맵 폰트 직접 래스터 (5% 미만 슬라이스는 생략, 범례가 보완)
  drawSliceLabels(px, w, cx, cy, (R + r) / 2, dist, total);

  // 다운샘플(SSxSS 평균) → PNG 스캔라인 (행마다 filter 0)
  const raw = [];
  for (let Y = 0; Y < W; Y++) {
    raw.push(0);
    for (let X = 0; X < W; X++) {
      let rs = 0, gs = 0, bs = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((Y * SS + sy) * w + (X * SS + sx)) * 3;
          rs += px[o]; gs += px[o + 1]; bs += px[o + 2];
        }
      }
      const n = SS * SS;
      raw.push(Math.round(rs / n), Math.round(gs / n), Math.round(bs / n));
    }
  }
  return encodePngBytes(raw, W, W);
}

// 도넛 슬라이스 중앙에 건수 숫자 흰색 라벨 — DejaVu Sans Bold를 미리 래스터한 16단계 알파맵을
// 픽셀별 블렌딩으로 찍는다 (구 5x7 비트맵 폰트는 글자꼴 자체가 각져 레티나 축소로도 한계 — 2026-08-04 교체).
// ('건' 글자는 소형 래스터 품질이 떨어져 숫자만 표기 — 단위는 범례("N건")가 담당)
function drawSliceLabels(px, w, cx, cy, midR, dist, total) {
  // DejaVu Sans Bold 숫자 알파맵 (높이 35px·PNG 스케일, 16단계 hex) — 스크립트 생성 데이터
  const GLYPHS = {
    '0': { w: 28, h: 35, d: '00000000159ceffec9510000000000000018effffffffffe81000000000003dffffffffffffffd30000000004effffff' +
           'ffffffffffe400000003effffffffffffffffffe3000000cffffffffffffffffffffc000006ffffffffb4114bfffffff' +
           'f60000efffffffb000000bfffffffe0005ffffffff20000002ffffffff500afffffffb00000000bfffffffa00fffffff' +
           'f7000000007ffffffff03ffffffff4000000004ffffffff36ffffffff1000000002ffffffff68ffffffff0000000000f' +
           'fffffff89fffffffe0000000000efffffffaafffffffd0000000000dfffffffabfffffffd0000000000dfffffffbcfff' +
           'ffffd0000000000dfffffffcbfffffffd0000000000dfffffffbafffffffd0000000000efffffffa9fffffffe0000000' +
           '000efffffffa8ffffffff0000000000ffffffff86ffffffff2000000002ffffffff63ffffffff4000000004ffffffff3' +
           '0ffffffff7000000007ffffffff00afffffffb00000000bfffffffb005ffffffff20000002ffffffff5000efffffffb0' +
           '00000bfffffffe00006ffffffffc4114cffffffff700000cffffffffffffffffffffc0000003effffffffffffffffffe' +
           '300000004ffffffffffffffffff40000000003dffffffffffffffd30000000000018effffffffffe8100000000000000' +
           '159ceffec95100000000' },
    '1': { w: 24, h: 35, d: '0000000000000000000000000000259dffffffff30000000159dffffffffffff30000000cfffffffffffffff30000000' +
           'cfffffffffffffff30000000cfffffffffffffff30000000cfffffffffffffff30000000cfffea62ffffffff30000000' +
           'ba620000ffffffff3000000000000000ffffffff3000000000000000ffffffff3000000000000000ffffffff30000000' +
           '00000000ffffffff3000000000000000ffffffff3000000000000000ffffffff3000000000000000ffffffff30000000' +
           '00000000ffffffff3000000000000000ffffffff3000000000000000ffffffff3000000000000000ffffffff30000000' +
           '00000000ffffffff3000000000000000ffffffff3000000000000000ffffffff3000000000000000ffffffff30000000' +
           '00000000ffffffff3000000000000000ffffffff3000000000000000ffffffff3000000000000000ffffffff30000000' +
           '00000000ffffffff300000009ffffffffffffffffffffffd9ffffffffffffffffffffffd9ffffffffffffffffffffffd' +
           '9ffffffffffffffffffffffd9ffffffffffffffffffffffd9ffffffffffffffffffffffd' },
    '2': { w: 26, h: 35, d: '00001479bdeffedb8400000000038cffffffffffffffd70000004fffffffffffffffffffd300004fffffffffffffffff' +
           'fffe30004fffffffffffffffffffffe2004ffffffffffffffffffffffa004ffffd9521025cffffffffff104ffa400000' +
           '00008fffffffff60492000000000000affffffff900000000000000003ffffffffb00000000000000000ffffffffb000' +
           '00000000000000efffffffb00000000000000001ffffffff800000000000000006ffffffff40000000000000000cffff' +
           'fffd00000000000000008ffffffff60000000000000006ffffffffc0000000000000006ffffffffe2000000000000006' +
           'ffffffffe3000000000000007ffffffffe4000000000000007ffffffffe4000000000000008ffffffffe300000000000' +
           '0009ffffffffe3000000000000009ffffffffd200000000000000affffffffd200000000000000affffffffc10000000' +
           '0000001bffffffffc100000000000001bffffffffc100000000000001cffffffffb1000000000000005fffffffffffff' +
           'fffffffffff05ffffffffffffffffffffffff05ffffffffffffffffffffffff05ffffffffffffffffffffffff05fffff' +
           'fffffffffffffffffff05ffffffffffffffffffffffff0' },
    '3': { w: 26, h: 35, d: '0000037acdefeedb9610000000015aeffffffffffffffb40000007fffffffffffffffffffa100007ffffffffffffffff' +
           'ffffc00007fffffffffffffffffffff80007fffffffffffffffffffffe0007ffd963100249ffffffffff400793000000' +
           '00003effffffff700000000000000006ffffffff800000000000000002ffffffff800000000000000002ffffffff5000' +
           '00000000000006ffffffff20000000000000003efffffffa0000000000001259ffffffffd100000003ffffffffffffff' +
           'fc2000000003fffffffffffffc500000000003ffffffffffffd8200000000003fffffffffffffff91000000003ffffff' +
           'ffffffffffc100000003fffffffffffffffffc0000000000001259efffffffff60000000000000001affffffffc00000' +
           '000000000000cffffffff100000000000000007ffffffff400000000000000005ffffffff500000000000000007fffff' +
           'fff40000000000000000cffffffff2c72000000000001affffffffe0effd9642101248efffffffff90efffffffffffff' +
           'ffffffffff30effffffffffffffffffffff700efffffffffffffffffffff8000efffffffffffffffffffe50000efffff' +
           'ffffffffffffc71000001358abcdeefeedb96200000000' },
    '4': { w: 28, h: 35, d: '00000000000000000000000000000000000000000cfffffffff200000000000000007ffffffffff20000000000000003' +
           'fffffffffff2000000000000000cfffffffffff2000000000000007ffffffffffff200000000000002fffffffffffff2' +
           '0000000000000bfffffffffffff20000000000007fffffdffffffff2000000000002efffff4ffffffff200000000000b' +
           'fffff91ffffffff200000000006fffffd11ffffffff20000000002efffff401ffffffff2000000000bfffff9001fffff' +
           'fff2000000006fffffe1001ffffffff200000001efffff50001ffffffff20000000afffffa00001ffffffff20000005f' +
           'ffffe100001ffffffff2000001efffff6000001ffffffff200000afffffb0000001ffffffff200005fffffe20000001f' +
           'fffffff20000dfffff600000001ffffffff20000effffc000000001ffffffff20000effffffffffffffffffffffffffd' +
           'effffffffffffffffffffffffffdeffffffffffffffffffffffffffdeffffffffffffffffffffffffffdefffffffffff' +
           'fffffffffffffffdeffffffffffffffffffffffffffd000000000000001ffffffff20000000000000000001ffffffff2' +
           '0000000000000000001ffffffff20000000000000000001ffffffff20000000000000000001ffffffff2000000000000' +
           '0000001ffffffff20000' },
    '5': { w: 26, h: 35, d: '0000000000000000000000000002fffffffffffffffffffff60002fffffffffffffffffffff60002ffffffffffffffff' +
           'fffff60002fffffffffffffffffffff60002fffffffffffffffffffff60002fffffffffffffffffffff60002ffffffc0' +
           '000000000000000002ffffffc0000000000000000002ffffffc0000000000000000002ffffffc0000000000000000002' +
           'ffffffc0000000000000000002ffffffd9cefedca62000000002fffffffffffffffffb40000002ffffffffffffffffff' +
           'f9000002ffffffffffffffffffffb00002fffffffffffffffffffffa0002ffffffffffffffffffffff4002fffb752101' +
           '37dfffffffffc002c610000000001afffffffff30000000000000000bffffffff700000000000000003ffffffff90000' +
           '0000000000000efffffffb00000000000000000dfffffffc00000000000000000efffffffb00000000000000004fffff' +
           'fff96810000000000000bffffffff67fe930000000001afffffffff27ffffd95210137dfffffffffb07fffffffffffff' +
           'ffffffffff307ffffffffffffffffffffff7007fffffffffffffffffffff80007fffffffffffffffffffe50000059eff' +
           'ffffffffffffd81000000000269aceefedda7400000000' },
    '6': { w: 28, h: 35, d: '0000000000058bdefedb951000000000000018effffffffffffb500000000006effffffffffffffff5000000009fffff' +
           'fffffffffffff50000000afffffffffffffffffff50000008ffffffffffffffffffff5000003fffffffffd73101259df' +
           'f500000cffffffff600000000003a500005ffffffff5000000000000000000bfffffff80000000000000000002ffffff' +
           'fe10000000000000000006fffffffa00000000000000000009fffffff6017bdefdc8400000000cfffffff48fffffffff' +
           'fd5000000efffffffefffffffffffffa10001fffffffffffffffffffffffb0001ffffffffffffffffffffffff9002fff' +
           'ffffffffffffffffffffff302ffffffffffe72015cffffffffa01ffffffffff3000001dffffffff10fffffffff900000' +
           '005ffffffff40effffffff500000000ffffffff60cffffffff200000000dfffffff709ffffffff200000000cfffffff7' +
           '06ffffffff200000000dfffffff602ffffffff500000000ffffffff400bfffffff900000005ffffffff1005ffffffff3' +
           '000001dfffffffb0000dfffffffe72015cffffffff500004fffffffffffffffffffffc0000009fffffffffffffffffff' +
           'e20000000afffffffffffffffffe30000000008fffffffffffffffc2000000000003bfffffffffffd600000000000000' +
           '037bdefedb8400000000' },
    '7': { w: 26, h: 35, d: '00000000000000000000000000effffffffffffffffffffffff5effffffffffffffffffffffff5efffffffffffffffff' +
           'fffffff5effffffffffffffffffffffff5effffffffffffffffffffffff5effffffffffffffffffffffff20000000000' +
           '000001efffffffa00000000000000006ffffffff30000000000000000dfffffffb00000000000000005ffffffff40000' +
           '000000000000bfffffffd00000000000000003ffffffff60000000000000000afffffffe00000000000000002fffffff' +
           'f700000000000000008fffffffe10000000000000001efffffff900000000000000006ffffffff20000000000000000d' +
           'fffffffa00000000000000004ffffffff40000000000000000bfffffffc00000000000000003ffffffff500000000000' +
           '000009fffffffd00000000000000001ffffffff700000000000000008fffffffe10000000000000000efffffff800000' +
           '000000000006ffffffff20000000000000000dfffffffa00000000000000004ffffffff30000000000000000bfffffff' +
           'b00000000000000003ffffffff500000000000000009fffffffd00000000000000001ffffffff600000000000000007f' +
           'ffffffe10000000000000000efffffff80000000000000' },
    '8': { w: 28, h: 35, d: '0000000269bdeffedb9620000000000004bffffffffffffffb4000000000affffffffffffffffff90000000bffffffff' +
           'ffffffffffffb000007ffffffffffffffffffffff60000dffffffffffffffffffffffd0003fffffffff931139fffffff' +
           'ff3005ffffffff50000005ffffffff5007fffffffd00000000efffffff6006fffffffb00000000cfffffff5003ffffff' +
           'fd00000000efffffff2000dfffffff50000006fffffffc00005ffffffff931139ffffffff4000008ffffffffffffffff' +
           'ffff700000005effffffffffffffffe500000000016dffffffffffffc6000000000004bffffffffffffffb4000000001' +
           'bffffffffffffffffffa1000001dffffffffffffffffffffd10000bfffffffe831137efffffffb0005fffffffe300000' +
           '03efffffff400bfffffff7000000008fffffffa00efffffff2000000003fffffffe02ffffffff0000000001ffffffff1' +
           '3ffffffff0000000001ffffffff22ffffffff2000000003ffffffff10ffffffff7000000008ffffffff00cfffffffe30' +
           '000003efffffffc008ffffffffe730027effffffff8002ffffffffffffffffffffffff20008fffffffffffffffffffff' +
           'f800000affffffffffffffffffffa00000009ffffffffffffffffff90000000003affffffffffffffa30000000000001' +
           '69bdeffedb9610000000' },
    '9': { w: 28, h: 35, d: '0000000048cdefeda720000000000000017efffffffffffa3000000000003dfffffffffffffff70000000005ffffffff' +
           'ffffffffff900000003efffffffffffffffffff7000000dfffffffffffffffffffff200006ffffffffc41027ffffffff' +
           'c0000dfffffffc0000004ffffffff4002ffffffff40000000afffffffa006fffffffe000000006ffffffff108fffffff' +
           'c000000003ffffffff409fffffffb000000003ffffffff709fffffffc000000003ffffffffa08fffffffe000000006ff' +
           'ffffffd06ffffffff30000000affffffffe02ffffffffc0000004ffffffffff00cffffffffc41027effffffffff005ff' +
           'fffffffffffffffffffffff100bffffffffffffffffffffffff0001cffffffffffffffffffffffe00001bfffffffffff' +
           'ffdfffffffd0000006dfffffffffe75fffffffb0000000059cefeda6107fffffff80000000000000000000bfffffff40' +
           '000000000000000002ffffffff10000000000000000009fffffffa0000000000000000006ffffffff400005930000000' +
           '0007ffffffffb000006ffd85210137dfffffffff2000006ffffffffffffffffffff60000006fffffffffffffffffff90' +
           '0000006ffffffffffffffffff8000000006ffffffffffffffffe500000000006cffffffffffffe810000000000000269' +
           'ceefedb8400000000000' },
  };
  const S = 2;   // 알파맵은 PNG(480) 스케일 — 슈퍼샘플 버퍼(960)엔 2x2 블록으로 찍으면 다운샘플이 원본 알파를 그대로 복원
  const stamp = (g, x0, y0) => {
    for (let gy = 0; gy < g.h; gy++) {
      for (let gx = 0; gx < g.w; gx++) {
        const a = parseInt(g.d[gy * g.w + gx], 16) / 15;
        if (!a) continue;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const X = x0 + gx * S + sx, Y = y0 + gy * S + sy;
            if (X < 0 || Y < 0 || X >= w || Y >= w) continue;
            const o = (Y * w + X) * 3;
            px[o] += Math.round((255 - px[o]) * a);
            px[o + 1] += Math.round((255 - px[o + 1]) * a);
            px[o + 2] += Math.round((255 - px[o + 2]) * a);
          }
        }
      }
    }
  };
  const SP = 2 * S;   // 자간 (PNG 스케일 2px)
  let acc = 0;
  dist.forEach(sl => {
    const frac = sl.count / total;
    const mid = (acc + frac / 2) * 2 * Math.PI;
    acc += frac;
    if (frac < 0.05) return;   // 좁은 슬라이스는 생략 — 수치는 범례에 있음
    const lx = cx + Math.sin(mid) * midR;
    const ly = cy - Math.cos(mid) * midR;
    const glyphs = String(sl.count).split('').map(ch => GLYPHS[ch]);
    const wAll = glyphs.reduce((s2, g) => s2 + g.w * S, 0) + (glyphs.length - 1) * SP;
    let x = Math.round(lx - wAll / 2);
    const y = Math.round(ly - glyphs[0].h * S / 2);
    glyphs.forEach(g => { stamp(g, x, y); x += g.w * S + SP; });
  });
}
// 순수 GAS PNG 인코더 — GAS에 deflate API가 없어 zlib 스트림은 Utilities.gzip의
// deflate 페이로드를 추출해 zlib 헤더+adler32로 재포장한다 (gzip 헤더는 FLG 비트별 가변 파싱)
function encodePngBytes(raw, width, height) {
  const toSigned = v => (v > 127 ? v - 256 : v);
  const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable.push(c >>> 0);
  }
  const crc32 = bytes => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  const adler = ((b << 16) | a) >>> 0;

  const gz = Utilities.gzip(Utilities.newBlob(raw.map(toSigned))).getBytes().map(v => v & 255);
  let p = 10;
  const flg = gz[3];
  if (flg & 4) { const xlen = gz[p] | (gz[p + 1] << 8); p += 2 + xlen; }
  if (flg & 8) { while (gz[p++] !== 0) {} }
  if (flg & 16) { while (gz[p++] !== 0) {} }
  if (flg & 2) p += 2;
  const zlibStream = [0x78, 0x9c].concat(gz.slice(p, gz.length - 8), be32(adler));

  const chunk = (type, data) => {
    const t = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
    return be32(data.length).concat(t, data, be32(crc32(t.concat(data))));
  };
  const ihdr = be32(width).concat(be32(height), [8, 2, 0, 0, 0]);   // 8bit RGB
  const png = [137, 80, 78, 71, 13, 10, 26, 10]
    .concat(chunk('IHDR', ihdr), chunk('IDAT', zlibStream), chunk('IEND', []));
  return png.map(toSigned);
}

// URL의 HTML을 fetch해서 OpenGraph 메타 태그로 빈 필드 자동 채우기
// 담당자가 이미 채워둔 필드는 보존, 비어 있는 필드만 자동으로 채움
function enrichArticleFromUrl(item) {
  const meta = fetchYoutubeMeta(item.link) || fetchUrlMeta(item.link);
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
  return String(v).replace(/^'+/, '').slice(0, 7);   // 텍스트 강제용 아포스트로피가 값에 남는 환경 흡수
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
// Executive 3줄 요약 (§8-7 2) — ① 당월 핵심 수치(+MoM) ② 특기 사항(인사이트 첫 줄 재사용) ③ ROI 진척(확정 기준 고정)
// ── 텍스트 빌더 ────────────────────────────
function buildMonthlyReportText(d) {
  const L = [];
  L.push(`ThinQ Real ${d.year}년 ${d.monthNum}월 운영 리포트`);
  L.push('');
  L.push('이번 달 ThinQ Real의 운영 현황과 누적 성과를 안내드립니다.');
  L.push('');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('📊 Executive 요약');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(`   당월 방문 건수   ${d.kpi.confirmed}건` + (d.ytd ? `  (26년 누적 ${d.ytd.confirmed}건)` : ''));
  L.push(`   당월 방문 인원   ${d.kpi.visitors}명` + (d.ytd ? `  (26년 누적 ${d.ytd.visitors}명)` : ''));
  L.push(`   만족도(NPS)      ${d.survey ? satDisplay(d.survey.satAll) : '—'}`);
  L.push('');

  // 사업부별 활용 현황 — 확정 기준, 건수 있는 본부만 (2026-08-03 렌더 리뷰)
  if (d.divisions && d.divisions.length) {
    L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    L.push('🏢 사업부별 활용 현황');
    L.push('   확정 방문 기준 본부별 건수·인원');
    L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const top = d.divisions.reduce((a, c) => (c.count > (a ? a.count : 0) ? c : a), null);
    d.divisions.forEach(dv => {
      const mark = (top && top.count > 0 && dv.name === top.name) ? ' ★' : '';
      L.push(`   ${dv.name}  —  ${dv.count}건 · ${dv.people}명${mark}`);
    });
    L.push('');
  }

  // 핵심 인사이트 — 큐레이션 행 없으면 블록 생략
  if (d.insights && d.insights.length) {
    L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    L.push('💡 핵심 인사이트');
    L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    d.insights.forEach(t => L.push('   • ' + String(t).replace(/\*\*/g, '')));
    L.push('');
  }

  // 인상 깊은 한마디 — 선택 건 없으면 블록 생략
  if (d.quotes && d.quotes.length) {
    L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    L.push('💬 인상 깊은 한마디');
    L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    d.quotes.forEach(q => {
      L.push('   "' + String(q.text).replace(/\*\*/g, '') + '"');
      const label = q.source === '방문자' ? '방문자 (익명)' : (q.source && q.source !== '인솔자' ? q.source : '');
      if (label) L.push('     — ' + label);
      L.push('');
    });
  }

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
  L.push('📰 관련 기사');
  L.push(d.articles.source === 'manual'
    ? '   담당자가 큐레이션한 이번 달 ThinQ Real 관련 보도 ' + d.articles.items.length + '건'
    : d.articles.source === 'mixed'
    ? '   담당자 큐레이션 ' + d.articles.manualCount + '건 + "' + MONTHLY_REPORT_QUERY + '" 자동 수집 ' + d.articles.autoCount + '건'
    : '   "' + MONTHLY_REPORT_QUERY + '" 키워드로 자동 수집한 최근 1개월 언론 보도 (AI홈 시장 동향 포함)');
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

  // ROI 스냅샷 — 최하단, 확정 기준 고정 수치 (§8-7 8. 그래프·저장 시나리오 의존 폐기)
  const rf = d.roiFixed || ROI_FIXED;
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('💰 투자 대비 성과 (ROI) — 확정 기준');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(`   총 투자 ${rf.totalCost} (구축 ${rf.capex} + 운영 ${rf.opexYr})`);
  L.push(`   BEP ${rf.bep} · 3년 ROI ${rf.roi3} · 5년 ROI ${rf.roi5}`);
  L.push('');
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

  // ── 섹션 헤더 (큰 제목 + 한 줄 설명) ──
  const sectionHeader = (icon, title, description) =>
    '<tr><td style="padding:32px 28px 6px;">' +
      '<div style="font-size:20px;font-weight:700;color:#1d1d1f;line-height:1.3;">' + icon + '&nbsp;&nbsp;' + escapeHtml(title) + '</div>' +
      (description ? '<div style="font-size:13.5px;color:#6e6e73;margin-top:8px;line-height:1.55;">' + escapeHtml(description) + '</div>' : '') +
    '</td></tr>';

  // ── 1) Executive 요약 — KPI 3카드 (당월 건수·인원 + MoM / NPS)
  //    (§8-7 2의 26년 누적 카드·요약 3줄은 2026-08-03 렌더 리뷰로 삭제 — 누적 진척은 ROI 스냅샷이 단일 위치)
  // Executive 카드 셀 — 라벨(상) → 값(중) → 보조 줄(하: 누적) (2026-08-04 팀장 리뷰 — MoM 표기 대신 26년 누적)
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
    const divRows = d.divisions.map(dv => {
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
        d.insights.map(t =>
          '<div style="padding:10px 14px;margin-bottom:8px;background:#f5f7f4;border-left:3px solid #3a5035;border-radius:0 6px 6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">' +
            mdBold(escapeHtml(t)) + '</div>').join('') +
      '</td></tr>';
  }
  let quotesRow = '';
  if (d.quotes && d.quotes.length) {
    quotesRow =
      '<tr><td style="padding:0 28px 16px;">' +
        d.quotes.map(q => {
          // 출처: 방문자→익명 표기, 사업부/부서(선택 시 dept 저장)→그대로. 구 '인솔자' 저장분은 라벨 생략 (2026-08-04 팀장 리뷰)
          const label = q.source === '방문자' ? '방문자 (익명)' : (q.source && q.source !== '인솔자' ? q.source : '');
          // 타이포·텍스트 폭은 인사이트 카드와 동일 (14px/1.6, 텍스트 시작 17px = 인사이트 border 3px+패딩 14px — 2026-08-04 통일)
          return '<div style="padding:12px 17px;margin-bottom:8px;background:#fdf9f2;border-radius:8px;">' +
            '<div style="font-size:14px;color:#1d1d1f;line-height:1.6;">&ldquo;' + mdBold(escapeHtml(q.text)) + '&rdquo;</div>' +
            (label ? '<div style="font-size:12px;color:#8e8e93;margin-top:6px;">— ' + escapeHtml(label) + '</div>' : '') +
          '</div>';
        }).join('') +
      '</td></tr>';
  }

  // ── 4) 방문 목적별 분포 (도넛 차트) ──
  // 6개 카테고리를 항상 모두 레전드에 표시 — 0건 카테고리도 존재함을 임원진이 즉시 인지할 수 있도록.
  // 0건 카테고리는 슬라이스 영역이 0이라 자동으로 안 그려지지만 범례 엔트리는 유지됨.
  let purposeBody;
  const purposeKeys = Object.keys(d.purposeCounts);
  const purposeTotal = Object.keys(d.purposeCounts).reduce((s, k) => s + (d.purposeCounts[k] || 0), 0);
  if (purposeTotal === 0) {
    purposeBody = '<div style="font-size:14px;color:#aeaeb2;padding:8px 0;">해당 없음</div>';
  } else if (d.donutCid) {
    // 내부 렌더링 도넛 (cid 인라인 첨부 — 미리보기는 data URI로 치환됨) + HTML 범례
    const dist = purposeDist(d);
    const legend = dist.map(x =>
      '<span style="display:inline-block;margin:3px 9px;font-size:12.5px;color:#3a3a3c;white-space:nowrap;">' +
        '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + x.color + ';margin-right:5px;"></span>' +
        escapeHtml(x.label) + ' <strong>' + x.count + '건</strong> <span style="color:#8e8e93;">(' + x.pct + '%)</span>' +
      '</span>').join('');
    purposeBody =
      '<div style="text-align:center;">' +
        '<img src="cid:' + d.donutCid + '" width="180" alt="방문 목적별 분포" style="width:180px;height:auto;display:inline-block;" />' +
      '</div>' +
      '<div style="text-align:center;margin-top:6px;line-height:1.7;">' + legend + '</div>' +
      '<div style="font-size:13px;color:#6e6e73;text-align:center;margin-top:5px;">총 ' + purposeTotal + '건 (확정 기준)</div>';
  } else {
    // 막대 폴백 — 도넛 렌더 실패 시에도 분포는 항상 표시 (외부 의존 0 공통)
    const dist = purposeDist(d);
    const maxV = dist.length ? dist[0].count : 1;
    const barRows = dist.map(x => {
      const widthPct = Math.max(8, Math.round(x.count / maxV * 100));
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

  // ── 6) ROI 스냅샷 (§8-7 8 — 최하단·확정 기준 고정 수치. 그래프·저장 시나리오 의존 폐기) ──
  const roiBody =
    '<div style="background:#f5f7f4;border-radius:10px;padding:18px 22px;font-size:14px;color:#1d1d1f;line-height:1.9;">' +
      '<div>총 투자 <strong>' + rfx.totalCost + '</strong> (구축 ' + rfx.capex + ' + 운영 ' + rfx.opexYr + ')</div>' +
      '<div>BEP <strong>' + rfx.bep + '</strong> · 3년 ROI <strong>' + rfx.roi3 + '</strong> · 5년 ROI <strong>' + rfx.roi5 + '</strong></div>' +
    '</div>';

  // ── 5) 관련 기사 — REPORT_ARTICLE_LIMIT(5)건, 썸네일 있는 건은 카드형 배치 ──
  let articlesBody;
  if (!d.articles.items.length) {
    articlesBody = '<div style="font-size:13px;color:#aeaeb2;">' + escapeHtml(d.articles.skipReason || '검색 결과 없음') + '</div>';
  } else {
    articlesBody = d.articles.items.map(it => {
      const meta = [it.source, it.publishedAt].filter(Boolean).map(escapeHtml).join(' · ');
      const snippetDisplay = truncate(it.snippet, 120); // 표시 시점에서도 한 번 더 컷
      const textCell =
        '<a href="' + escapeHtml(it.link) + '" target="_blank" rel="noopener" style="font-size:14px;color:#3a5035;text-decoration:underline;font-weight:600;">' + escapeHtml(it.title) + '</a>' +
        (meta ? '<div style="font-size:11px;color:#aeaeb2;margin-top:2px;">' + meta + '</div>' : '') +
        (snippetDisplay ? '<div style="font-size:13px;color:#3a3a3c;margin-top:4px;line-height:1.5;">' + escapeHtml(snippetDisplay) + '</div>' : '');
      if (it.thumbnail) {
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

  // 한글 가독성: Noto Sans KR 웹폰트 시도 (2026-07-15) — 브라우저 미리보기·Apple Mail 등
  // 웹폰트 허용 환경에서만 적용되고, 차단 환경(PC Outlook·Gmail)은 맑은 고딕으로 폴백.
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
        outlookHintRow +
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

// ============================================================
//  §8-6 발송 안전장치 (2026-08-03) — 수동 발송 2단계화 + 자동 발송 건너뛰기
//  - URL 한 번으로 실발송되던 confirm=YES 설계 폐기 (2026-07-27 오클릭 사고 재발 방지)
//  - 자동 발송(첫째 수요일·전월분)은 수동 이력과 무관하게 항상 진행 —
//    monthlyReportTrigger는 변경 금지, 스킵 유도는 PROP_LAST_SENT_KEY 기록으로만 (§2-3 체크박스)
// ============================================================

// 전월 yyyy-MM (수동 발송 확인 화면의 기본 대상 월 — 새 발송 체제의 기본 대상과 일치)
function prevMonthKey() {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const y = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const m = Number(Utilities.formatDate(now, tz, 'M'));
  return (m === 1 ? (y - 1) : y) + '-' + ('0' + (m === 1 ? 12 : m - 1)).slice(-2);
}

// 미리보기 — 상단 고정 배너 부착 (발송 아님을 명시)
function handleMonthlyReportPreview(params) {
  const result = sendMonthlyReport({ month: params.month, dryRun: true });
  const banner =
    '<div style="position:sticky;top:0;z-index:9;background:#fff3cd;border-bottom:2px solid #e0a800;' +
    'padding:12px 20px;font-family:sans-serif;text-align:center;">' +
      '<div style="font-size:15px;font-weight:700;color:#7a5a00;">📄 미리보기 — 이 화면은 발송되지 않습니다</div>' +
      '<div style="font-size:12.5px;color:#7a5a00;margin-top:4px;">대상: ' + escapeHtml(result.data.year + '년 ' + result.data.monthNum + '월분') +
      ' · 실제 발송은 매월 첫째 수요일 08:30 자동 진행 (전월분)</div>' +
    '</div>';
  return HtmlService.createHtmlOutput(banner + result.html).setTitle(result.subject);
}

// 발송 토큰 (일회용, 10분) — Script Properties에 "token|생성ms" 저장
const SEND_TOKEN_TTL_MS = 10 * 60 * 1000;
function issueSendToken(kind, month) {
  const token = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(kind + '_token_' + month, token + '|' + Date.now());
  return token;
}
function consumeSendToken(kind, month, given) {
  const props = PropertiesService.getScriptProperties();
  const key = kind + '_token_' + month;
  const stored = props.getProperty(key);
  if (!stored) return false;
  const [token, ts] = stored.split('|');
  if (token !== String(given || '')) return false;
  if (Date.now() - Number(ts) > SEND_TOKEN_TTL_MS) { props.deleteProperty(key); return false; }
  props.deleteProperty(key);   // 성공 시 즉시 폐기 — 재사용 불가
  return true;
}

function sendSafetyPage(title, bodyHtml) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif;max-width:640px;margin:40px auto;padding:0 16px;">' +
      '<div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:28px;">' +
        '<div style="font-size:19px;font-weight:700;color:#1d1d1f;margin-bottom:14px;">' + title + '</div>' +
        bodyHtml +
      '</div>' +
      '<div style="font-size:11.5px;color:#aeaeb2;margin-top:12px;text-align:center;">ThinQ Real 월간 리포트 발송 안전장치</div>' +
    '</div>'
  ).setTitle('ThinQ Real 리포트 발송');
}

function handleMonthlyReportSend(params) {
  const props = PropertiesService.getScriptProperties();
  const month = params.month || prevMonthKey();
  const to = props.getProperty('MONTHLY_REPORT_TO') || '';
  const selfUrl = ScriptApp.getService().getUrl() + '?type=monthly_report_send&month=' + month;

  // ── 레거시 confirm=YES 폐기 — 발송하지 않고 안내 (구 북마크·공유 URL 전부 무해화) ──
  if (params.confirm === 'YES') {
    return sendSafetyPage('발송 방식이 변경되었습니다',
      '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">confirm=YES 방식은 오클릭 사고 방지를 위해 폐기되었습니다.<br>' +
      '아래 링크로 접속해 <strong>확인 화면</strong>을 거쳐 발송해 주세요.</p>' +
      '<p><a href="' + selfUrl + '" target="_top" style="color:#3a5035;font-weight:600;">발송 확인 화면 열기 →</a></p>');
  }

  // ── Step 2: 전체 발송 실행 (일회용 토큰) ──
  if (params.confirm) {
    if (!consumeSendToken('send', month, params.confirm)) {
      return sendSafetyPage('토큰이 유효하지 않습니다',
        '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">발송 토큰이 만료(10분)됐거나 이미 사용되었습니다.<br>' +
        '<a href="' + selfUrl + '" target="_top" style="color:#3a5035;font-weight:600;">확인 화면에서 다시 시도 →</a></p>');
    }
    const result = sendMonthlyReport({ month: month });
    if (!result.sentTo) {
      return sendSafetyPage('❌ 발송 실패', '<p style="font-size:14px;color:#c0392b;">' +
        escapeHtml(result.skipped || '원인 미상') + ' — Script Properties의 MONTHLY_REPORT_TO를 확인하세요.</p>');
    }
    // 수동 발송 이력 (확인 화면 경고용) — PROP_LAST_SENT_KEY에는 기록하지 않음 (자동 정식본 발송 보장)
    const mkey = 'manual_sent_' + month;
    const prevLog = props.getProperty(mkey);
    props.setProperty(mkey, (prevLog ? prevLog + ';' : '') + new Date().toISOString());
    // §2-3 「이번 달 자동 발송 건너뛰기」 — 체크한 경우에만 예외적으로 가드 키 기록 → 자동 트리거가 해당 월 스킵
    let skipNote;
    if (params.skipauto === '1') {
      props.setProperty(PROP_LAST_SENT_KEY, month);
      skipNote = '이번 달(' + month + '분) <strong>자동 발송은 생략됩니다</strong> — 이 수동 발송본이 정식본이 됩니다.';
    } else {
      skipNote = '다음 달 첫째 수요일의 자동 발송은 정상 진행됩니다.';
    }
    return sendSafetyPage('✅ 발송 완료',
      '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;"><strong>' + escapeHtml(month) + '분</strong> 리포트를 발송했습니다.<br>' +
      '수신: ' + escapeHtml(result.sentTo) + ' (+CC ' + escapeHtml(CC_EMAIL) + ')</p>' +
      '<p style="font-size:13px;color:#6e6e73;line-height:1.7;">' + skipNote + '</p>');
  }

  // ── Step 2': 테스트 발송 실행 ("나만 보는 샘플" — 이력·가드 키 무기록) ──
  if (params.test) {
    if (!consumeSendToken('test', month, params.test)) {
      return sendSafetyPage('토큰이 유효하지 않습니다',
        '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">테스트 토큰이 만료(10분)됐거나 이미 사용되었습니다.<br>' +
        '<a href="' + selfUrl + '" target="_top" style="color:#3a5035;font-weight:600;">확인 화면에서 다시 시도 →</a></p>');
    }
    const testTo = props.getProperty('MONTHLY_REPORT_TEST_TO') || '';
    if (!testTo) {
      return sendSafetyPage('테스트 수신자 미설정',
        '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;">Script Properties에 <strong>MONTHLY_REPORT_TEST_TO</strong>' +
        '(테스트 수신 메일 주소)를 등록한 뒤 다시 시도해 주세요.</p>');
    }
    const result = sendMonthlyReport({ month: month, to: testTo, subjectPrefix: '[테스트] ', noCc: true });
    return sendSafetyPage('✅ 테스트 발송 완료',
      '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;"><strong>' + escapeHtml(testTo) + '</strong>에게만 발송되었습니다 (CC 없음, 제목 [테스트]).<br>' +
      '발송 이력에 기록되지 않으며 자동 발송에도 영향이 없습니다.</p>');
  }

  // ── Step 1: 발송 확인 화면 (여기까지는 발송 0건) ──
  const sendToken = issueSendToken('send', month);
  const testToken = issueSendToken('test', month);
  const autoSent = props.getProperty(PROP_LAST_SENT_KEY) === month;
  const manualLog = props.getProperty('manual_sent_' + month) || '';
  let warn = '';
  if (autoSent || manualLog) {
    const times = [autoSent ? '자동 발송 완료' : '', manualLog ? '수동 ' + manualLog.split(';').map(t => t.slice(0, 16).replace('T', ' ')).join(', ') : '']
      .filter(Boolean).join(' · ');
    warn = '<div style="background:#fdecea;border:1px solid #e57373;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13.5px;color:#b71c1c;line-height:1.6;">' +
      '⚠ <strong>이번 달 이미 발송됨</strong> (' + escapeHtml(times) + ') — 재발송 시 수신자에게 중복 수신됩니다.</div>';
  }
  const recipients = (to ? to : '(MONTHLY_REPORT_TO 미설정)') + ' · CC ' + CC_EMAIL;
  const sendUrl = selfUrl + '&confirm=' + sendToken;
  const testUrl = selfUrl + '&test=' + testToken;
  return sendSafetyPage('📮 ' + month + '분 리포트 발송 확인',
    '<p style="font-size:14px;color:#3a3a3c;line-height:1.7;"><strong>수신자</strong><br>' + escapeHtml(recipients) + '</p>' +
    warn +
    '<p style="font-size:13px;color:#6e6e73;line-height:1.7;">다음 달 첫째 수요일의 자동 발송은 이 수동 발송과 무관하게 정상 진행됩니다.</p>' +
    '<label style="display:block;background:#f5f7f4;border:1px solid #d8ded6;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13.5px;color:#1d1d1f;cursor:pointer;">' +
      '<input type="checkbox" id="skipauto" style="margin-right:8px;">이번 달 자동 발송 건너뛰기' +
      '<div style="font-size:12px;color:#6e6e73;margin-top:4px;margin-left:22px;">체크하면 이번 달 자동 발송이 생략됩니다 (수동 발송본이 정식본이 됩니다).</div>' +
    '</label>' +
    '<div style="margin-top:18px;">' +
      '<a id="sendBtn" href="' + sendUrl + '" target="_top" style="display:inline-block;background:#3a5035;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">전체 발송하기</a>' +
      '<a href="' + testUrl + '" target="_top" style="display:inline-block;margin-left:10px;background:#ffffff;color:#3a5035;border:1.5px solid #3a5035;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">나에게만 테스트 발송</a>' +
    '</div>' +
    '<p style="font-size:11.5px;color:#aeaeb2;margin-top:14px;">발송 버튼은 10분간 유효한 일회용 링크입니다.</p>' +
    '<script>document.getElementById("skipauto").addEventListener("change",function(){' +
      'var a=document.getElementById("sendBtn");var base="' + sendUrl + '";a.href=this.checked?base+"&skipauto=1":base;});' +
    '</scr' + 'ipt>');
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
    'privacyConsent',
    // 2026-06 Google 캘린더 연동 — 확정 예약의 캘린더 이벤트 id (갱신·삭제 추적용)
    'calendarEventId',
    // 2026-07 B2E 전환 — 신청자 소속 (본부 드롭다운 / 부서 직접 입력)
    'division', 'department',
    // 2026-07 방문 후기 설문 요청 메일 발송 기록 (배치 재실행 시 중복 발송 방지)
    'surveyInviteSentAt'
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

  // 무차별 대입 방어 — 5회 연속 실패 시 잠금
  var failKey = 'auth_fail_' + email;
  var failCount = Number(cache.get(failKey) || '0');
  if (failCount >= AUTH_MAX_FAIL_ATTEMPTS) {
    return jsonResponse({ ok: false, error: 'too_many_attempts',
      message: '인증 시도 횟수를 초과했습니다. 잠시 후 새 코드를 요청해 주세요.' });
  }

  var stored = cache.get('auth_code_' + email);
  if (!stored) {
    return jsonResponse({ ok: false, error: 'code_expired',
      message: '인증 코드가 만료되었습니다. 다시 요청해 주세요.' });
  }
  if (stored !== code) {
    cache.put(failKey, String(failCount + 1), AUTH_FAIL_WINDOW_SEC);
    var remaining = AUTH_MAX_FAIL_ATTEMPTS - failCount - 1;
    return jsonResponse({ ok: false, error: 'code_mismatch',
      message: '인증 코드가 일치하지 않습니다.' +
        (remaining > 0 ? ' (남은 시도 ' + remaining + '회)' : ' 새 코드를 요청해 주세요.') });
  }

  // 1회용 — 검증 성공 시 코드와 실패 카운트 모두 삭제
  cache.remove('auth_code_' + email);
  cache.remove(failKey);

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

// 관리자 토큰 검증 — 서명 유효 + admin 플래그 + (영구 명단 OR 활성 임시 권한) 모두 만족해야 통과.
function verifyAdminToken(token) {
  var v = verifyAuthToken(token);
  if (!v.ok) return v;
  if (!v.admin) return { ok: false, reason: 'not_admin' };
  var inPerm = AUTH_ADMIN_EMAILS.map(function(s){ return s.toLowerCase(); }).indexOf(v.email) >= 0;
  if (!inPerm && !isTempAdminActive(v.email)) {
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
    '코드는 20분간 유효합니다.',
    '',
    '※ 사내 메일 보안 검역으로 메일 도착이 지연될 수 있습니다.',
    '   메일이 늦게 도착해도 받으신 코드를 그대로 입력해 주세요.',
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
            '· 코드는 <strong>20분간</strong> 유효합니다.<br>' +
            '· 본인이 요청하지 않았다면 이 메일은 무시하세요.' +
          '</div>' +
          '<div style="margin-top:14px;padding:12px 14px;background:#fafafa;border-left:3px solid #8fa889;border-radius:4px;font-size:12px;color:#6e6e73;line-height:1.6;">' +
            '※ 사내 메일 보안 검역으로 메일 도착이 지연될 수 있습니다. ' +
            '메일이 늦게 도착해도 받으신 코드를 그대로 입력해 주세요.' +
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
  if (AUTH_ADMIN_EMAILS.map(function(x){ return x.toLowerCase(); }).indexOf(s) >= 0) return true;
  return isTempAdminActive(s);
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

  // 무차별 대입 방어 — 5회 연속 실패 시 잠금 (메인 게이트와 동일)
  var failKey = 'admin_fail_' + email;
  var failCount = Number(cache.get(failKey) || '0');
  if (failCount >= AUTH_MAX_FAIL_ATTEMPTS) {
    return jsonResponse({ ok: false, error: 'too_many_attempts',
      message: '인증 시도 횟수를 초과했습니다. 잠시 후 새 코드를 요청해 주세요.' });
  }

  var stored = cache.get('admin_code_' + email);
  if (!stored) {
    return jsonResponse({ ok: false, error: 'code_expired', message: '인증 코드가 만료되었습니다. 다시 요청해 주세요.' });
  }
  if (stored !== code) {
    cache.put(failKey, String(failCount + 1), AUTH_FAIL_WINDOW_SEC);
    var remaining = AUTH_MAX_FAIL_ATTEMPTS - failCount - 1;
    return jsonResponse({ ok: false, error: 'code_mismatch',
      message: '인증 코드가 일치하지 않습니다.' +
        (remaining > 0 ? ' (남은 시도 ' + remaining + '회)' : ' 새 코드를 요청해 주세요.') });
  }
  cache.remove('admin_code_' + email);
  cache.remove(failKey);

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
    'b2b':           '고객사',
    'rd':            '프로젝트명',
    'pr':            '행사명',
    'content':       '촬영명',
    'internal-comm': '행사명',
    'other':         '제목'
  };
  var subjLabel = subjLabelMap[data.purposeKey] || '제목';
  var subject   = data.subject || data.org || '';
  var company   = data.clientCompany || '';
  var count     = data.count || '';
  var belong    = [data.division, data.department].filter(Boolean).join(' · ');

  var lines = [];
  lines.push('🆕 <b>새 예약 신청</b>');
  lines.push('');
  lines.push('📅 ' + e(data.date) + '  ' + e(slotLabel));
  lines.push('🎯 ' + e(data.purpose));
  if (subject) lines.push('📝 ' + e(subjLabel) + ': ' + e(subject));
  if (company) lines.push('🏢 ' + e(company));
  lines.push('👤 ' + e(data.name) + (count ? '  ·  총 ' + e(count) + '명' : ''));
  if (belong) lines.push('🏛 ' + e(belong));
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

// 캘린더 연동 검증 — CALENDAR_ID 설정 + 쓰기 권한 확인용.
// 1시간 뒤 테스트 일정을 만들었다가 즉시 삭제해 실제 생성/삭제 권한까지 점검.
function handleCalendarTest() {
  var id = PropertiesService.getScriptProperties().getProperty(CALENDAR_PROP_ID);
  if (!id) {
    return jsonResponse({ ok: false, reason: 'not_configured',
      hint: 'Script Property CALENDAR_ID 미설정. 대상 캘린더 ID를 등록하세요.' });
  }
  var cal = getBookingCalendar();
  if (!cal) {
    return jsonResponse({ ok: false, reason: 'no_access', calendarId: id,
      hint: '캘린더를 찾을 수 없거나 접근 권한이 없습니다. 그 캘린더를 스크립트 소유자 계정에 "변경 권한"으로 공유했는지 확인하세요.' });
  }
  try {
    var now = new Date();
    var start = new Date(now.getTime() + 60 * 60 * 1000);
    var end   = new Date(now.getTime() + 90 * 60 * 1000);
    var ev = cal.createEvent('🧪 ThinQ Real 캘린더 연동 테스트 (자동 삭제됨)', start, end,
      { description: '연동 점검용 임시 일정입니다. 자동으로 삭제됩니다.' });
    var evId = ev.getId();
    ev.deleteEvent(); // 권한 확인 후 즉시 삭제
    return jsonResponse({ ok: true, calendarId: id, calendarName: cal.getName(), testedEventId: evId });
  } catch(e) {
    return jsonResponse({ ok: false, reason: 'write_failed', calendarId: id,
      hint: '읽기는 되지만 일정 생성에 실패했습니다. 공유 권한이 "변경 권한"(이벤트 변경) 이상인지 확인하세요.',
      error: e.message });
  }
}


// ============================================================
//  [1회성] 방문 목적 카테고리 개편 마이그레이션 (2026-07)
//  구 6종 → 신 6종으로 bookings 시트의 purpose/purposeKey를 일괄 변환.
//  실행 방법: Apps Script 에디터에서 함수 선택 → migratePurposeCategories2026 실행 (1회만).
//  재실행해도 안전 (이미 신 라벨인 행은 건너뜀 — 멱등).
// ============================================================
function migratePurposeCategories2026() {
  // 구 라벨 → [신 라벨, 신 purposeKey]
  var LABEL_MAP = {
    '고객/고객사 영업 활동': ['B2B 영업', 'b2b'],
    '내부 R&D · 테스트':    ['R&D', 'rd'],
    '외부 행사':            ['홍보 (프레스투어/마케팅)', 'pr'],
    '콘텐츠 제작':           ['콘텐츠 제작', 'content'],
    '내부 행사':            ['내부 커뮤니케이션', 'internal-comm'],
    '기타':                 ['기타', 'other'],
    // 백필 이전의 옛 비표준 라벨 안전망
    'B2B 파트너 시연':      ['B2B 영업', 'b2b'],
    'R&D 연구':             ['R&D', 'rd'],
    'Press Tour':           ['홍보 (프레스투어/마케팅)', 'pr']
  };
  // purpose가 비어 있고 구 purposeKey만 있는 행 대비
  var KEY_MAP = {
    'customer': ['B2B 영업', 'b2b'],
    'rd': ['R&D', 'rd'],
    'external-event': ['홍보 (프레스투어/마케팅)', 'pr'],
    'content': ['콘텐츠 제작', 'content'],
    'internal-event': ['내부 커뮤니케이션', 'internal-comm'],
    'other': ['기타', 'other']
  };

  var sheet = getSheet();
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var pIdx = headers.indexOf('purpose');
  var kIdx = headers.indexOf('purposeKey');
  if (pIdx < 0) { Logger.log('purpose 컬럼 없음 — 중단'); return; }

  var changed = 0, skipped = 0;
  for (var i = 1; i < rows.length; i++) {
    var oldLabel = String(rows[i][pIdx] || '').trim();
    var oldKey = kIdx >= 0 ? String(rows[i][kIdx] || '').trim() : '';
    var target = LABEL_MAP[oldLabel] || KEY_MAP[oldKey] || null;
    if (!target) { skipped++; continue; }  // 이미 신 라벨이거나 매핑 불가 — 그대로 둠
    var needLabel = target[0] !== oldLabel;
    var needKey = kIdx >= 0 && target[1] !== oldKey;
    if (!needLabel && !needKey) { skipped++; continue; }
    if (needLabel) sheet.getRange(i + 1, pIdx + 1).setValue(target[0]);
    if (needKey)   sheet.getRange(i + 1, kIdx + 1).setValue(target[1]);
    changed++;
  }
  Logger.log('마이그레이션 완료 — 변환 ' + changed + '건 / 건너뜀 ' + skipped + '건');
}


// ============================================================
//  설문 데이터 파이프라인 (2026-07 — ThinQReal_Survey_DB_Spec.md)
//  - 제출(survey_submit)은 공개 경로 (예약 booking과 동일 — 토큰 불요)
//  - 조회(survey_data)·수정(survey_update)·상태 전환(ledger_update/issue_update)은 관리자 토큰 필수
//  - 행 삭제 엔드포인트는 만들지 않는다 — 드롭·기각도 상태 전환으로만 (명세 §3)
// ============================================================

const SURVEY_SHEET_NAME = 'survey_responses';
const LEDGER_SHEET_NAME = 'performance_ledger';
const ISSUE_SHEET_NAME  = 'iot_issue_log';

// ⚠ 새 컬럼은 반드시 배열 "끝"에만 추가할 것 — handleSurveySubmit이 이 순서대로 appendRow하므로
//   중간 삽입 시 기존 시트 컬럼과 어긋난다. 기존 시트에는 getNamedSheet가 누락 헤더를 끝에 자동 append.
// deal_amount: 계약 체결 딜의 실제 계약 금액 (2026-07 S9 — 선택 입력, 무응답 정상)
// impressive_modes: 인상 깊었던 솔루션 복수 선택 (2026-07 신규 — 콤마 구분 문자열, 공통 문항)
// desired_solutions: 추가 필요·체험 희망 솔루션 주관식 (2026-07 신규 — 선택 입력)
// impressive_reasons: 모드별 인상 깊었던 이유 ("모드명 — 이유; ..." 직렬화, 선택 입력)
const SURVEY_HEADERS = ['response_id','submitted_at','visit_date','dept','name','client','visit_count','track','purpose','deal_stage','deal_size','deal_area','reaction','attr','media_work','media_days','media_alt','media_cost','media_link','media_link_name','media_link_size','media_link_attr','etc_work','etc_days','etc_alt','iot_defect','iot_defect_detail','etc_link','etc_link_name','etc_link_size','etc_link_attr','satisfaction','feedback','raw_json','deal_amount','impressive_modes','desired_solutions','impressive_reasons','adopt_pick','voice_space','iot_connect','ai_barrier'];
const LEDGER_HEADERS = ['ledger_id','response_id','category','project_name','expected_scale','attribution_text','attribution_pct','visit_date','respondent','dept','status','confirmed_amount','confirmed_date','confirmed_note','roi_included'];
const ISSUE_HEADERS  = ['issue_id','response_id','device','symptom','severity','channel','q_ship','status','est_value'];

// 시트 확보 + 헤더 자동 생성 (getRoiSheet/getOrCreateRoiHeaders 패턴)
// 기존 시트에 상수의 새 컬럼이 없으면 끝에 자동 append — bookings getOrCreateHeaders와 동일한 스키마 진화 방식
function getNamedSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const lastCol = sheet.getLastColumn();
  const firstRow = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const paintHeader = range => {
    range.setBackground('#3a5035');
    range.setFontColor('#ffffff');
    range.setFontWeight('bold');
  };
  if (!firstRow.length || !firstRow[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    paintHeader(sheet.getRange(1, 1, 1, headers.length));
    sheet.setFrozenRows(1);
  } else {
    const missing = headers.filter(h => firstRow.indexOf(h) < 0);
    if (missing.length) {
      const start = firstRow.length;
      sheet.getRange(1, start + 1, 1, missing.length).setValues([missing]);
      paintHeader(sheet.getRange(1, start + 1, 1, missing.length));
    }
  }
  return sheet;
}

// 기여 수준 라디오 원문에서 % 파싱 — "…(25%)" → 25. 미매칭 시 공란.
function parseAttrPct(text) {
  const m = String(text || '').match(/\((\d{1,3})%\)/);
  return m ? Number(m[1]) : '';
}

// ── 설문 제출 (공개 경로 — 토큰 불요) ──────────────────────
function handleSurveySubmit(data) {
  const track = String(data.track || '');
  if (['sales', 'media', 'etc'].indexOf(track) < 0) {
    return jsonResponse({ ok: false, error: 'invalid_track' });
  }
  const responseId = String(Date.now());
  const submittedAt = new Date().toISOString();

  const sheet = getNamedSheet(SURVEY_SHEET_NAME, SURVEY_HEADERS);
  sheet.appendRow(SURVEY_HEADERS.map(h => {
    if (h === 'response_id')  return responseId;
    if (h === 'submitted_at') return submittedAt;
    if (h === 'raw_json')     return JSON.stringify(data);
    return data[h] == null ? '' : String(data[h]);
  }));

  // ── 파생 1: 성과 추적 대장 (성과 연결 응답 시, status=후보) ──
  const ledgerRows = [];
  if (track === 'media' && data.media_link === '특정 캠페인·프로모션과 연결됨') {
    ledgerRows.push({ category: '홍보·광고 마케팅', name: data.media_link_name, scale: data.media_link_size, attr: data.media_link_attr });
  }
  if (track === 'etc' && data.etc_link === '신규 Task·과제') {
    ledgerRows.push({ category: '신규 Task·기타', name: data.etc_link_name, scale: data.etc_link_size, attr: data.etc_link_attr });
  }
  if (ledgerRows.length) {
    const ledger = getNamedSheet(LEDGER_SHEET_NAME, LEDGER_HEADERS);
    ledgerRows.forEach((r, i) => {
      ledger.appendRow(LEDGER_HEADERS.map(h => {
        if (h === 'ledger_id')        return responseId + '-L' + (i + 1);
        if (h === 'response_id')      return responseId;
        if (h === 'category')         return r.category;
        if (h === 'project_name')     return r.name || '';
        if (h === 'expected_scale')   return r.scale || '';
        if (h === 'attribution_text') return r.attr || '';
        if (h === 'attribution_pct')  return parseAttrPct(r.attr);
        if (h === 'visit_date')       return data.visit_date || '';
        if (h === 'respondent')       return data.name || '';
        if (h === 'dept')             return data.dept || '';
        if (h === 'status')           return '후보';
        return '';
      }));
    });
  }

  // ── 파생 2: IoT 이슈 로그 ('발견함' 응답 시, status=등록) ──
  let issueCount = 0;
  if (track === 'etc' && data.iot_defect === '발견함') {
    getNamedSheet(ISSUE_SHEET_NAME, ISSUE_HEADERS).appendRow(ISSUE_HEADERS.map(h => {
      if (h === 'issue_id')    return responseId + '-I1';
      if (h === 'response_id') return responseId;
      if (h === 'symptom')     return data.iot_defect_detail || '';
      if (h === 'status')      return '등록';
      return '';
    }));
    issueCount = 1;
  }

  // 텔레그램 알림 — 실패해도 제출은 성공 처리 (메일·예약과 동일한 격리 원칙)
  try { sendTelegramSurvey(data, track, ledgerRows.length, issueCount); }
  catch (err) { Logger.log('[survey] telegram fail: ' + err); }

  return jsonResponse({ ok: true, response_id: responseId });
}

// ── 방문자 현장 설문 (§8-5, 2026-07-27) — 퇴장 직전 QR 익명 응답 ─────
// · 완전 익명: 성명·소속 미수집, 언어 선택(lang)만 기록. 공개 제출 경로 (survey_submit과 동일 지위).
// · 파생 없음 (성과 대장·이슈 로그 미생성) · ROI 미산입 — 용도는 경험 품질 지표 + 운영 설문 8번 블록과의 격차 분석.
// · 저장 value는 언어 무관 한국어 canonical (운영 설문과 컬럼·값 단위 직접 비교 전제).
const VISITOR_SHEET_NAME = 'visitor_responses';
const VISITOR_HEADERS = ['response_id','submitted_at','lang','satisfaction','impressive_modes','adopt_pick','voice_space','iot_connect','ai_barrier','feedback','raw_json'];

function handleVisitorSubmit(data) {
  const responseId = String(Date.now());
  const lang = data.lang === 'en' ? 'EN' : 'KO';
  const sheet = getNamedSheet(VISITOR_SHEET_NAME, VISITOR_HEADERS);
  sheet.appendRow(VISITOR_HEADERS.map(h => {
    if (h === 'response_id')  return responseId;
    if (h === 'submitted_at') return new Date().toISOString();
    if (h === 'lang')         return lang;
    if (h === 'raw_json')     return JSON.stringify(data);
    return data[h] == null ? '' : String(data[h]);
  }));

  // 텔레그램 알림 — 실패해도 제출은 성공 처리 (기존 격리 원칙)
  try {
    sendTelegramMessage('🙋 방문자 설문 접수 [' + lang + '] — 만족도 ' + String(data.satisfaction || '').replace(/[<>&]/g, ''));
  } catch (err) { Logger.log('[visitor] telegram fail: ' + err); }

  return jsonResponse({ ok: true, response_id: responseId });
}

// 방문자 응답 영구 삭제 (관리자 토큰 게이트) — 테스트·실수 정리용.
// 파생 행이 없으므로 cascade 불필요. 수정(edit) 기능은 의도적으로 없음 — 익명 응답 원문 보존 원칙.
function handleVisitorDelete(data) {
  const n = deleteRowsByValue(VISITOR_SHEET_NAME, VISITOR_HEADERS, 'response_id', data.id);
  return jsonResponse(n ? { ok: true } : { ok: false, error: 'not_found' });
}

function sendTelegramSurvey(data, track, ledgerCount, issueCount) {
  var e = escapeTelegramHtml;
  var trackLabel = { sales: 'B2B 영업', media: '콘텐츠·홍보', etc: 'R&D·내부·기타' }[track] || track;
  var lines = [];
  lines.push('📝 <b>설문 접수</b> [' + e(trackLabel) + ']');
  lines.push('');
  lines.push('📅 방문일 ' + e(data.visit_date || '-') + (data.visit_count ? ' · ' + e(data.visit_count) : ''));
  lines.push('👤 ' + e(data.name || '-') + ' (' + e(data.dept || '-') + ')');
  if (data.satisfaction) lines.push('⭐ ' + e(data.satisfaction));
  if (ledgerCount) lines.push('📒 성과 추적 대장 +' + ledgerCount + '건 (후보)');
  if (issueCount)  lines.push('⚠ IoT 이슈 로그 +' + issueCount + '건');
  sendTelegramMessage(lines.join('\n'));
}

// ── 설문·대장·이슈 통합 조회 (관리자 토큰 필수) ─────────────
function handleGetSurveyData(token) {
  const admin = verifyAdminToken(token);
  if (!admin.ok) {
    return jsonResponse({ error: 'unauthorized', reason: admin.reason || 'invalid_token' });
  }
  return jsonResponse({
    responses: readSheetRecords(SURVEY_SHEET_NAME, SURVEY_HEADERS),
    ledger:    readSheetRecords(LEDGER_SHEET_NAME, LEDGER_HEADERS),
    issues:    readSheetRecords(ISSUE_SHEET_NAME, ISSUE_HEADERS),
    visitors:  readSheetRecords(VISITOR_SHEET_NAME, VISITOR_HEADERS),  // 방문자 현장 설문 (§8-5, 조회 전용)
    insights:  readSheetRecords(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS) // 월간 리포트 큐레이션 (§8-7 5·6)
      .map(r => { r.month = insightMonthKey(r.month); return r; }),    // 날짜 자동 변환된 기존 행 복원
    articles:  readArticleRows()                                       // 관련 기사 큐레이션 (렌더 리뷰 후속)
  });
}

// monthly_insights month 셀 정규화 — Sheets가 "2026-07" 문자열을 날짜(해당 월 1일 0시 KST)로 자동
// 변환해 저장하는 경우가 있어, 읽기 시 KST 기준 yyyy-MM으로 되돌린다.
// (readSheetRecords가 Date를 UTC ISO로 바꾸므로 그대로 slice하면 전월로 밀림 — 큐레이션 행 증발 버그의 원인)
function insightMonthKey(v) {
  const s = String(v == null ? '' : v).trim().replace(/^'+/, '');   // 텍스트 강제용 아포스트로피가 값에 남는 환경 흡수
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = (Object.prototype.toString.call(v) === '[object Date]') ? v : new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM');
  return s.slice(0, 7);
}

// month 셀 텍스트 확정 기록 — appendRow의 입력 파싱(날짜 변환·아포스트로피 해석)이 환경에 따라
// 달라 "행이 저장돼도 월 필터에 안 걸리는" 증발 증상이 재발해, 저장 직후 셀 서식을 텍스트(@)로
// 강제하고 값을 다시 쓴다. 읽기 정규화(insightMonthKey/normalizeMonth)와 이중 방어.
function forceMonthTextCell(sheet, row, col, month) {
  try {
    const cell = sheet.getRange(row, col);
    cell.setNumberFormat('@');
    cell.setValue(month);
  } catch (err) { Logger.log('forceMonthTextCell fail: ' + err); }
}

// ── 월간 리포트 큐레이션 (§8-7 5·6 — monthly_insights 탭, 관리자 토큰 게이트) ──
// type='insight'(핵심 인사이트, seq 순 렌더) / type='quote'(인상 깊은 한마디 선택본, source='인솔자'|'방문자')
function handleInsightAdd(data) {
  const sheet = getNamedSheet(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS);
  const month = String(data.month || '');
  if (!/^\d{4}-\d{2}$/.test(month) || !String(data.text || '').trim()) {
    return jsonResponse({ ok: false, error: 'invalid_input' });
  }
  const rows = readSheetRecords(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS);
  // data.type은 라우팅 타입(insight_add)이므로 행 타입은 rowType 필드로 받는다
  const type = String(data.rowType) === 'quote' ? 'quote' : 'insight';
  // 한마디는 체크박스 토글 특성상 같은 문장 중복 저장이 항상 버그 — 가드 (증발 버그 시절 중복 재발 방지)
  if (type === 'quote' && rows.some(r => insightMonthKey(r.month) === month &&
      String(r.type) === 'quote' && String(r.text || '').trim() === String(data.text).trim())) {
    return jsonResponse({ ok: false, error: 'duplicate' });
  }
  const maxSeq = rows.filter(r => insightMonthKey(r.month) === month && String(r.type || 'insight') === type)
    .reduce((mx, r) => Math.max(mx, Number(r.seq) || 0), 0);
  const id = String(Date.now());
  sheet.appendRow([id, "'" + month, maxSeq + 1, type, String(data.text).trim(),
                   String(data.source || ''), new Date().toISOString()]);
  forceMonthTextCell(sheet, sheet.getLastRow(), INSIGHTS_HEADERS.indexOf('month') + 1, month);
  return jsonResponse({ ok: true, id });
}

function handleInsightDelete(data) {
  const n = deleteRowsByValue(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS, 'id', data.id);
  return jsonResponse(n ? { ok: true } : { ok: false, error: 'not_found' });
}

// 큐레이션 항목 순서 조정 (2026-08-04 팀장 리뷰) — 같은 월·타입 그룹을 seq 순으로 세우고
// 대상 항목을 한 칸 이동시킨 뒤 그룹 전체 seq를 1..n으로 재기록 (레거시 중복 seq도 함께 정리)
function handleInsightMove(data) {
  const id = String(data.id || '');
  const dir = data.dir === 'up' ? -1 : 1;
  const rows = readSheetRecords(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS);
  const target = rows.find(r => String(r.id) === id);
  if (!target) return jsonResponse({ ok: false, error: 'not_found' });
  const group = rows.filter(r => insightMonthKey(r.month) === insightMonthKey(target.month) &&
      String(r.type || 'insight') === String(target.type || 'insight'))
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  const idx = group.findIndex(r => String(r.id) === id);
  const to = idx + dir;
  if (to < 0 || to >= group.length) return jsonResponse({ ok: false, error: 'edge' });
  const order = group.map(r => String(r.id));
  order.splice(idx, 1);
  order.splice(to, 0, id);
  const seqById = {};
  order.forEach((rid, i) => { seqById[rid] = i + 1; });
  const sheet = getNamedSheet(INSIGHTS_SHEET_NAME, INSIGHTS_HEADERS);
  const all = sheet.getDataRange().getValues();
  const iId = INSIGHTS_HEADERS.indexOf('id'), iSeq = INSIGHTS_HEADERS.indexOf('seq');
  for (let i = 1; i < all.length; i++) {
    const rid = String(all[i][iId]);
    if (seqById[rid] != null && Number(all[i][iSeq]) !== seqById[rid]) {
      sheet.getRange(i + 1, iSeq + 1).setValue(seqById[rid]);
    }
  }
  return jsonResponse({ ok: true });
}

// 기사 순서 조정 — monthly_articles는 순서 컬럼이 없어(컬럼 구조 불변) 같은 달 이웃 행과 값 전체 교환
function handleArticleMove(data) {
  const month = String(data.month || '');
  const url = String(data.url || '').trim();
  const dir = data.dir === 'up' ? -1 : 1;
  const sheet = getArticlesSheet();
  const headers = getOrCreateArticlesHeaders(sheet);
  const iM = headers.indexOf('month'), iU = headers.indexOf('url');
  const all = sheet.getDataRange().getValues();
  const idxs = [];
  for (let i = 1; i < all.length; i++) {
    if (normalizeMonth(all[i][iM]) === month && String(all[i][iU] || '').trim()) idxs.push(i);
  }
  const pos = idxs.findIndex(i => String(all[i][iU]).trim() === url);
  if (pos < 0) return jsonResponse({ ok: false, error: 'not_found' });
  const npos = pos + dir;
  if (npos < 0 || npos >= idxs.length) return jsonResponse({ ok: false, error: 'edge' });
  const a = idxs[pos], b = idxs[npos];
  const width = headers.length;
  const rowA = all[a].slice(0, width), rowB = all[b].slice(0, width);
  sheet.getRange(a + 1, 1, 1, width).setValues([rowB]);
  sheet.getRange(b + 1, 1, 1, width).setValues([rowA]);
  forceMonthTextCell(sheet, a + 1, iM + 1, normalizeMonth(rowB[iM]));   // 교환 시 재파싱 대비
  forceMonthTextCell(sheet, b + 1, iM + 1, normalizeMonth(rowA[iM]));
  return jsonResponse({ ok: true });
}

// ── 관련 기사 큐레이션 (2026-08-03 렌더 리뷰 후속 — monthly_articles 탭, 관리자 토큰 게이트) ──
// URL만 받아 행 추가 — 제목·출처·요약·썸네일은 메타 태그에서 자동 추출 (실패 시 공란 → 리포트 빌드 때 재시도)
function handleArticleAdd(data) {
  const month = String(data.month || '');
  const url = String(data.url || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !/^https?:\/\//i.test(url)) {
    return jsonResponse({ ok: false, error: 'invalid_input' });
  }
  const sheet = getArticlesSheet();
  const headers = getOrCreateArticlesHeaders(sheet);
  if (readArticleRows().some(r => r.month === month && r.url === url)) {
    return jsonResponse({ ok: false, error: 'duplicate' });
  }
  const it = enrichArticleFromUrl({ title: '', link: url, source: '', snippet: '', publishedAt: '', thumbnail: '' });
  const vals = {
    month: "'" + month,
    title: (it.title && it.title !== url) ? it.title : '', // 추출 실패 시 공란 (다음 읽기에서 재시도)
    url: url,
    source: it.source || '', summary: it.snippet || '',
    published_at: it.publishedAt || '', thumbnail: it.thumbnail || '',
  };
  sheet.appendRow(headers.map(h => (vals[h] != null ? vals[h] : '')));
  forceMonthTextCell(sheet, sheet.getLastRow(), headers.indexOf('month') + 1, month);
  return jsonResponse({ ok: true, title: vals.title });
}

function handleArticleDelete(data) {
  const month = String(data.month || '');
  const url = String(data.url || '').trim();
  const sheet = getArticlesSheet();
  const headers = getOrCreateArticlesHeaders(sheet);
  const iM = headers.indexOf('month'), iU = headers.indexOf('url');
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (normalizeMonth(rows[i][iM]) === month && String(rows[i][iU] || '').trim() === url) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ ok: true });
    }
  }
  return jsonResponse({ ok: false, error: 'not_found' });
}

// 관리자 큐레이션 UI용 기사 행 조회 — 원본 셀에서 직접 읽어 month/published_at을 정규화
// (readSheetRecords는 Date를 UTC ISO로 바꿔 월이 밀리므로 사용하지 않음)
function readArticleRows() {
  const sheet = getArticlesSheet();
  const headers = getOrCreateArticlesHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  const iM = headers.indexOf('month'), iT = headers.indexOf('title'), iU = headers.indexOf('url'),
        iS = headers.indexOf('source'), iP = headers.indexOf('published_at');
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const url = String(rows[i][iU] || '').trim();
    if (!url) continue;
    out.push({
      month: normalizeMonth(rows[i][iM]),
      title: String(rows[i][iT] || '').trim(),
      url: url,
      source: iS >= 0 ? String(rows[i][iS] || '').trim() : '',
      published_at: iP >= 0 ? formatPublishedDate(rows[i][iP]) : '',
    });
  }
  return out;
}

function readSheetRecords(name, headers) {
  const sheet = getNamedSheet(name, headers);
  const rows = sheet.getDataRange().getValues();
  const hs = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    hs.forEach((h, j) => {
      let v = row[j];
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = (h === 'visit_date' || h === 'confirmed_date') ? normalizeDate(v) : v.toISOString();
      }
      obj[h] = v == null ? '' : v;
    });
    return obj;
  }).filter(r => r[hs[0]]);
}

// ── Phase 5: 월간 리포트용 설문·성과 집계 (Survey Spec §5-4) ─────────
// 응답 수·트랙 분포·재방문율·대장 신규/확정/드롭·확정 산입액 합계(만원)·이슈 등록 건수.
// 시트 3종이 아직 없으면 getNamedSheet가 빈 시트를 만들고 전부 0건으로 집계된다.
function collectMonthlySurvey(month) {
  const responses = readSheetRecords(SURVEY_SHEET_NAME, SURVEY_HEADERS);
  const ledger    = readSheetRecords(LEDGER_SHEET_NAME, LEDGER_HEADERS);
  const issues    = readSheetRecords(ISSUE_SHEET_NAME, ISSUE_HEADERS);

  const respMonth = r => String(r.visit_date || r.submitted_at || '').slice(0, 7);
  const monthResponses = responses.filter(r => respMonth(r) === month);

  const tracks = { sales: 0, media: 0, etc: 0 };
  monthResponses.forEach(r => { if (tracks[r.track] != null) tracks[r.track]++; });

  const answered = monthResponses.filter(r => r.visit_count);
  const revisit = answered.filter(r => r.visit_count !== '첫 방문').length;
  const revisitPct = answered.length ? Math.round(revisit / answered.length * 100) : null;

  // 대장: 신규 = 해당 월 방문(visit_date) 기준 / 확정 = confirmed_date 기준 / 드롭 = 해당 월 신규 중 드롭
  const ledgerNew = ledger.filter(l => String(l.visit_date || '').slice(0, 7) === month);
  const confirmedRows = ledger.filter(l =>
    l.status === '확정' && String(l.confirmed_date || '').slice(0, 7) === month);
  const confirmedSum = confirmedRows.reduce((s, l) => s + (Number(l.confirmed_amount) || 0), 0); // 만원
  const droppedNew = ledgerNew.filter(l => l.status === '드롭').length;

  // 이슈는 출처 응답의 월 기준 — response_id → 응답 월 매핑으로 조인
  const respMonthById = {};
  responses.forEach(r => { respMonthById[String(r.response_id)] = respMonth(r); });
  const issueCount = issues.filter(x => respMonthById[String(x.response_id)] === month).length;

  // §8-7: 방문자 설문 지표 + 만족도/NPS (인솔자·방문자, 혼재 척도 분리 집계)
  let visitor = null, satAll = null, satOperator = null, satVisitor = null;
  try {
    const visitors = readSheetRecords(VISITOR_SHEET_NAME, VISITOR_HEADERS)
      .filter(v => String(v.submitted_at || '').slice(0, 7) === month);
    const opSats = monthResponses.map(r => r.satisfaction);
    const vSats = visitors.map(v => v.satisfaction);
    satOperator = classifySatisfaction(opSats);
    satVisitor = classifySatisfaction(vSats);
    satAll = classifySatisfaction(opSats.concat(vSats));
    visitor = {
      count: visitors.length,
      ko: visitors.filter(v => v.lang === 'KO').length,
      en: visitors.filter(v => v.lang === 'EN').length,
    };
  } catch (err) { Logger.log('[monthly] visitor metrics fail: ' + err); }

  return {
    count: monthResponses.length, tracks,
    revisitPct,
    ledgerNew: ledgerNew.length, ledgerConfirmed: confirmedRows.length,
    ledgerDropped: droppedNew, confirmedSum,
    issueCount,
    visitor, satAll, satOperator, satVisitor
  };
}

// ── 설문 응답 내용 수정 (관리자 토큰 게이트 — 오탈자·내용 정정용) ──
// 불변 필드: response_id·submitted_at·track은 식별/집계 기준, raw_json은 제출 원문 증빙.
// 파생 트리거 3종(media_link/etc_link/iot_defect)도 불변 — 제출 시점에만 대장·이슈 행을
// 생성하므로 사후 변경하면 파생 행과 어긋난다. 연결 오류는 대장 드롭/이슈 기각으로 처리.
function handleSurveyUpdate(data) {
  const sheet = getNamedSheet(SURVEY_SHEET_NAME, SURVEY_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('response_id');
  const IMMUTABLE = ['response_id', 'submitted_at', 'track', 'raw_json',
                     'media_link', 'etc_link', 'iot_defect'];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      SURVEY_HEADERS.forEach(f => {
        if (IMMUTABLE.indexOf(f) >= 0) return;
        if (data[f] !== undefined) {
          const col = headers.indexOf(f);
          if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(data[f]);
        }
      });
      return jsonResponse({ ok: true });
    }
  }
  return jsonResponse({ ok: false, error: 'not_found' });
}

// ── 성과 추적 대장 상태 전환 + 내용 수정 (관리자 토큰 게이트 — doPost에서 검증 후 호출) ──
// status: 후보 → 확정(확정 금액·일자·근거 입력) / 드롭(사유). 행 삭제 없음.
// 내용 필드(category~dept)는 오탈자 정정용. attribution_text(라디오 원문)·response_id는 증빙으로 불변.
function handleLedgerUpdate(data) {
  const sheet = getNamedSheet(LEDGER_SHEET_NAME, LEDGER_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('ledger_id');
  const EDITABLE = ['status', 'confirmed_amount', 'confirmed_date', 'confirmed_note', 'roi_included',
                    'category', 'project_name', 'expected_scale', 'attribution_pct',
                    'visit_date', 'respondent', 'dept'];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      EDITABLE.forEach(f => {
        if (data[f] !== undefined) {
          const col = headers.indexOf(f);
          if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(data[f]);
        }
      });
      return jsonResponse({ ok: true });
    }
  }
  return jsonResponse({ ok: false, error: 'not_found' });
}

// ── 설문·대장·이슈 영구 삭제 (관리자 토큰 게이트 — 테스트·실수 데이터 정리용) ──
// 실제 성과 기록은 드롭/기각 상태 전환으로 보존하는 것이 원칙 — 삭제는 테스트 정리에만 사용.
// survey_delete는 응답의 파생 행(대장·이슈, response_id 연결)도 함께 삭제해 고아 행을 막는다.
// 예약 booking_delete와 동일하게 알림(메일·텔레그램)은 발송하지 않는다.
function deleteRowsByValue(sheetName, headers, colName, value) {
  const sheet = getNamedSheet(sheetName, headers);
  const rows = sheet.getDataRange().getValues();
  const idx = rows[0].indexOf(colName);
  let deleted = 0;
  for (let i = rows.length - 1; i >= 1; i--) {   // 아래→위 삭제 — 행 인덱스 어긋남 방지
    if (String(rows[i][idx]) === String(value)) { sheet.deleteRow(i + 1); deleted++; }
  }
  return deleted;
}

function handleSurveyDelete(data) {
  const n = deleteRowsByValue(SURVEY_SHEET_NAME, SURVEY_HEADERS, 'response_id', data.id);
  if (!n) return jsonResponse({ ok: false, error: 'not_found' });
  const ledgerN = deleteRowsByValue(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'response_id', data.id);
  const issueN  = deleteRowsByValue(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'response_id', data.id);
  return jsonResponse({ ok: true, deleted: { response: n, ledger: ledgerN, issues: issueN } });
}

function handleLedgerDelete(data) {
  const n = deleteRowsByValue(LEDGER_SHEET_NAME, LEDGER_HEADERS, 'ledger_id', data.id);
  return jsonResponse(n ? { ok: true } : { ok: false, error: 'not_found' });
}

function handleIssueDelete(data) {
  const n = deleteRowsByValue(ISSUE_SHEET_NAME, ISSUE_HEADERS, 'issue_id', data.id);
  return jsonResponse(n ? { ok: true } : { ok: false, error: 'not_found' });
}

// ── CSV 내보내기 감사 로그 (개인정보보호팀 요구 — 다운로드 사유 기록) ──
// 관리자 이메일은 클라이언트 입력이 아니라 검증된 토큰 payload에서 추출 (위조 방지).
// 파일 비밀번호는 기록하지 않는다 — 사유·시각·행 수만 남긴다.
const EXPORT_LOG_SHEET_NAME = 'export_log';
const EXPORT_LOG_HEADERS = ['id', 'timestamp', 'email', 'reason', 'rowCount'];

function handleExportLog(data, byEmail) {
  const sheet = getNamedSheet(EXPORT_LOG_SHEET_NAME, EXPORT_LOG_HEADERS);
  sheet.appendRow([
    String(Date.now()),
    new Date().toISOString(),
    byEmail,
    String(data.reason || '').slice(0, 500),
    Number(data.rowCount) || 0,
  ]);
  return jsonResponse({ success: true });
}

// ── IoT 이슈 상태·속성 부여 (관리자 토큰 게이트) ─────────────
// C_AS 채널 단가는 민감 정보 — 코드·리포에 두지 않고 Script Property
// SURVEY_CAS_JSON 에만 둔다. 형식: {"원격":1000,"내방":2000,"출장":3000} (예시 — 실제 값은 콘솔에서 입력).
// 미설정 시 est_value 공란 유지 (참고용 표시일 뿐 ROI 미산입이라 무해).
const SEVERITY_PCT = { '높음': 0.5, '가끔': 0.1, '드묾': 0.01 };

function computeIssueEstValue(severity, channel, qShip) {
  let cas = null;
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('SURVEY_CAS_JSON');
    cas = raw ? JSON.parse(raw) : null;
  } catch (err) { cas = null; }
  if (!cas || !severity || !channel || !qShip) return '';
  const p = SEVERITY_PCT[severity];
  const c = cas[channel];
  if (p == null || c == null) return '';
  return Math.round(p * Number(qShip) * Number(c));
}

function handleIssueUpdate(data) {
  const sheet = getNamedSheet(ISSUE_SHEET_NAME, ISSUE_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('issue_id');
  const EDITABLE = ['device', 'symptom', 'severity', 'channel', 'q_ship', 'status'];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      EDITABLE.forEach(f => {
        if (data[f] !== undefined) {
          const col = headers.indexOf(f);
          if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(data[f]);
        }
      });
      // severity·channel·q_ship 3종 모두 있을 때만 est_value 서버 계산 (참고용·ROI 미산입)
      const cur = sheet.getRange(i + 1, 1, 1, headers.length).getValues()[0];
      const get = h => cur[headers.indexOf(h)];
      const est = computeIssueEstValue(get('severity'), get('channel'), get('q_ship'));
      const estCol = headers.indexOf('est_value');
      if (estCol >= 0) sheet.getRange(i + 1, estCol + 1).setValue(est);
      return jsonResponse({ ok: true, est_value: est });
    }
  }
  return jsonResponse({ ok: false, error: 'not_found' });
}

// ============================================================
//  방문 후기 설문 요청 메일 (배치 — 스크립트 에디터에서 직접 실행)
//  - 대상: status=확정 + 방문일 경과 + 이메일 보유 + 미발송 행
//  - 같은 이메일 다건은 가장 최근 방문 1건 기준으로 1통만 발송
//  - 실행 순서: ① previewSurveyInviteTargets() — 명단만 로그 (발송 없음)
//               ② sendSurveyInviteTest()       — 소유자 본인에게 1통 (시트 기록 없음)
//               ③ sendSurveyInviteBatch()      — 실제 발송 + 발송 시각 기록
//  - 발송한 행은 surveyInviteSentAt에 기록 → 재실행해도 중복 발송 없음
//  - 웹 엔드포인트가 아니므로 재배포 불필요 (코드 저장 후 에디터에서 실행)
// ============================================================

const SURVEY_FORM_URL = 'https://thinqreal.com/ThinQ_Real_Visit_Survey.html';

// 설문 링크에 방문일·작성자·소속을 쿼리로 실어 폼이 미리 채우게 한다 (수신자 입력 부담 완화)
function buildSurveyInviteLink(b) {
  const params = [];
  if (b.date) params.push('visit_date=' + encodeURIComponent(b.date));
  if (b.name) params.push('name=' + encodeURIComponent(b.name));
  const dept = ((b.division || '') + ' ' + (b.department || '')).trim();
  if (dept) params.push('dept=' + encodeURIComponent(dept));
  return SURVEY_FORM_URL + (params.length ? '?' + params.join('&') : '');
}

function getSurveyInviteTargets() {
  const sheet = getSheet();
  getOrCreateHeaders(sheet);                       // surveyInviteSentAt 컬럼 보장
  const rows = sheet.getDataRange().getValues();
  const head = rows[0].map(v => String(v || ''));
  const col = h => head.indexOf(h);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const byEmail = {};                              // 이메일 → { latest: 최근 방문 건, rowIndexes: 해당 행들 }
  const excluded = new Set();                      // 허용 도메인 외 이메일 (로그 확인용)
  rows.slice(1).forEach((row, i) => {
    const status = String(row[col('status')] || '').trim();
    const email  = String(row[col('email')]  || '').trim().toLowerCase();
    const date   = normalizeDate(row[col('date')]);
    const sent   = String(row[col('surveyInviteSentAt')] || '').trim();
    if (status !== '확정' || !email || email.indexOf('@') < 0) return;
    // 발송 대상은 임직원(@lge.com)으로 한정 — 사이트 게이트와 동일한 허용 도메인 단일 소스
    if (!AUTH_ALLOWED_DOMAINS.some(d => email.endsWith('@' + d))) { excluded.add(email); return; }
    if (!date || date >= today) return;            // 방문 다음날부터 발송 (아침 자동 발송이 방문 전에 나가는 것 방지)
    if (sent) return;                              // 이미 발송한 행 제외 (재실행 안전)

    const rec = {
      rowIndex: i + 2, email, date,
      name:       String(row[col('name')] || ''),
      slotLabel:  String(row[col('slotLabel')] || ''),
      purpose:    String(row[col('purpose')] || ''),
      subject:    String(row[col('subject')] || row[col('org')] || ''),
      division:   String(row[col('division')] || ''),
      department: String(row[col('department')] || ''),
    };
    const cur = byEmail[email];
    if (!cur) {
      byEmail[email] = { latest: rec, rowIndexes: [rec.rowIndex] };
    } else {
      cur.rowIndexes.push(rec.rowIndex);
      if (rec.date > cur.latest.date) cur.latest = rec;
    }
  });

  if (excluded.size) {
    Logger.log('제외 (@lge.com 외 주소 ' + excluded.size + '건): ' + [...excluded].join(', '));
  }
  return Object.keys(byEmail).map(k => byEmail[k]);
}

// 참조(CC) 수신자 — 관리자 6명 전원 참조는 통수 부담(각자 발송 통수만큼 수신)으로 미채택 (2026-07-19 결정)
const SURVEY_INVITE_CC_BATCH = CC_EMAIL;                       // 1회성 수동 배치: 운영자(강원석)만
const SURVEY_INVITE_CC_AUTO  = ADMIN_EMAILS + ', ' + CC_EMAIL; // 자동 발송: 담당자 3명(이철호·서문수·김현진) + 강원석

// ① 발송 없이 대상자 명단만 로그로 확인 (드라이런)
function previewSurveyInviteTargets() {
  const targets = getSurveyInviteTargets();
  const perMail = 1 + SURVEY_INVITE_CC_BATCH.split(',').length;  // 할당량은 수신자 수 기준
  Logger.log('설문 요청 대상: ' + targets.length + '명 | 수동 배치 통당 수신자 ' + perMail + '명' +
    ' | 필요 할당량 ' + targets.length * perMail + ' / 남은 할당량 ' + MailApp.getRemainingDailyQuota());
  targets.forEach(t => {
    const b = t.latest;
    Logger.log('- ' + b.email + ' | ' + b.date + ' ' + b.slotLabel + ' | ' + b.purpose + ' | ' + b.name +
      (t.rowIndexes.length > 1 ? ' (확정 ' + t.rowIndexes.length + '건 → 1통)' : ''));
  });
  return targets.length;
}

// ② 테스트 발송 — 실제 대상자 첫 건의 데이터로 운영자에게만 발송 (시트 기록 없음)
//    소유자 gmail + 사내 메일(CC_EMAIL) 양쪽으로 보내 Gmail·Outlook 표시를 모두 확인한다.
//    사내 수신은 LG 보안 게이트웨이 스캔 큐를 타므로 수분~수십분 지연될 수 있음.
function sendSurveyInviteTest() {
  const me = Session.getEffectiveUser().getEmail();
  const to = me + ',' + CC_EMAIL;
  const targets = getSurveyInviteTargets();
  const b = targets.length ? targets[0].latest : {
    email: me, date: '2026-07-10', name: '홍길동',
    slotLabel: '2회차 13:00~14:30', purpose: 'R&D', subject: '테스트 방문',
    division: 'HS사업본부', department: 'AI홈솔루션엔지니어링팀',
  };
  MailApp.sendEmail({
    to: to,
    subject: '[테스트] ' + buildSurveyInviteSubject(),
    body: buildSurveyInviteText(b), htmlBody: buildSurveyInviteHtml(b),
    name: 'ThinQ Real',
  });
  Logger.log('테스트 메일 발송 → ' + to +
    (targets.length ? ' (실데이터 사용: ' + b.email + ' 건)' : ' (대상 없음 — 더미 데이터 사용)'));
}

// 공용 발송 코어 — 발송 성공한 이메일의 모든 해당 행에 surveyInviteSentAt 기록
// 메일 할당량은 수신자 수 기준이므로 통당 소모 = 1 + 참조 수.
function sendSurveyInvitesCore(cc, label) {
  const sheet = getSheet();
  const headers = getOrCreateHeaders(sheet);
  const sentCol = headers.indexOf('surveyInviteSentAt') + 1;
  const targets = getSurveyInviteTargets();
  const perMail = 1 + cc.split(',').length;
  const need = targets.length * perMail;
  const quota = MailApp.getRemainingDailyQuota();
  if (!targets.length) { Logger.log('[' + label + '] 발송 대상이 없습니다.'); return 0; }
  if (need > quota) {
    Logger.log('[' + label + '] 중단: 필요 할당량 ' + need + '(대상 ' + targets.length + '명 × 수신자 ' + perMail + '명) > 남은 할당량 ' + quota + '. 다음 날 다시 실행하세요.');
    return 0;
  }

  const now = new Date().toISOString();
  let ok = 0, fail = 0;
  targets.forEach(t => {
    const b = t.latest;
    try {
      MailApp.sendEmail({
        to: b.email, cc: cc, subject: buildSurveyInviteSubject(),
        body: buildSurveyInviteText(b), htmlBody: buildSurveyInviteHtml(b),
        name: 'ThinQ Real',
      });
      t.rowIndexes.forEach(r => sheet.getRange(r, sentCol).setValue(now));
      ok++;
    } catch (err) {
      fail++;
      Logger.log('[' + label + '] 발송 실패: ' + b.email + ' — ' + err.message);
    }
  });
  Logger.log('[' + label + '] 설문 요청 발송 완료: 성공 ' + ok + '통 / 실패 ' + fail + '통');
  return ok;
}

// ③ 실제 발송 (1회성 수동 배치) — 참조: 운영자만
function sendSurveyInviteBatch() {
  sendSurveyInvitesCore(SURVEY_INVITE_CC_BATCH, '수동 배치');
}

// ④ 자동 발송 (매일 08:30경 트리거) — 방문 다음날 아침에 전날까지의 미발송 방문 건 발송.
//    참조: 담당자 3명 + 운영자. 대상이 없는 날은 로그만 남기고 종료.
function surveyInviteTrigger() {
  sendSurveyInvitesCore(SURVEY_INVITE_CC_AUTO, '자동');
}

// 자동 발송 트리거 설치 — 에디터에서 1회 직접 실행 (기존 등록이 있으면 교체)
function installSurveyInviteTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'surveyInviteTrigger') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('surveyInviteTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(30)
    .create();
  return '설문 자동 발송 트리거 설치 완료 (매일 08:30경 — 스크립트 TZ 기준)';
}

function buildSurveyInviteSubject() {
  return '[ThinQ Real] 방문 후기 설문 요청 — 소중한 의견을 들려주세요';
}

function buildSurveyInviteText(b) {
  const link = buildSurveyInviteLink(b);
  return [
    '안녕하세요, ' + (b.name || '') + '님.',
    '',
    'ThinQ Real을 방문해 주셔서 감사합니다.',
    '방문 경험에 대한 짧은 설문을 부탁드립니다. (약 3분 소요)',
    '',
    '📅 방문 정보',
    '   ' + b.date + '  /  ' + (b.slotLabel || ''),
    '   ' + (b.purpose || '') + (b.subject ? ' — ' + b.subject : ''),
    '',
    '📝 설문 작성',
    '   ' + link,
    '   (방문일 등 기본 정보가 미리 채워져 있습니다)',
    '',
    '응답해 주신 내용은 ThinQ Real 운영 개선과 성과 분석에',
    '소중하게 활용됩니다.',
    '',
    '🎁 매월 베스트 리뷰어 세 분을 선정해 소정의 사은품을 드립니다.',
    '',
    '감사합니다.',
    'HS플랫폼사업센터 AI홈솔루션엔지니어링팀',
  ].join('\n');
}

function buildSurveyInviteHtml(b) {
  const name = escapeHtml(b.name || '');
  const date = escapeHtml(b.date || '');
  const slot = escapeHtml(b.slotLabel || '');
  const purpose = escapeHtml(b.purpose || '');
  const subject = escapeHtml(b.subject || '');
  const link = escapeHtml(buildSurveyInviteLink(b));  // & → &amp; (href 속성 안전)

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">방문 후기를 들려주세요</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:15px;color:#1d1d1f;line-height:1.7;margin-bottom:20px;">' +
            '안녕하세요, <strong>' + name + '</strong>님.<br>' +
            'ThinQ Real을 방문해 주셔서 감사합니다.<br>' +
            '방문 경험에 대한 짧은 설문을 부탁드립니다. <span style="color:#6e6e73;">(약 3분 소요)</span>' +
          '</div>' +
          '<div style="padding:16px 18px;background:#f5f5f7;border-radius:8px;font-size:14px;line-height:1.7;">' +
            '<div style="font-weight:600;color:#3a3a3c;margin-bottom:4px;">📅 방문 정보</div>' +
            '<div style="font-size:15px;font-weight:600;color:#3a5035;">' + date + '</div>' +
            '<div style="color:#6e6e73;font-size:13px;">' + slot + '</div>' +
            (purpose ? '<div style="margin-top:4px;color:#1d1d1f;font-size:13px;">' + purpose + (subject ? ' — ' + subject : '') + '</div>' : '') +
          '</div>' +
          '<div style="text-align:center;margin:28px 0 8px;">' +
            '<a href="' + link + '" style="display:inline-block;background:#3a5035;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">설문 작성하기 (약 3분) ↗</a>' +
            '<div style="color:#aeaeb2;font-size:12px;margin-top:8px;">방문일 등 기본 정보가 미리 채워져 있습니다.</div>' +
          '</div>' +
          '<div style="margin-top:20px;padding:14px 18px;background:#fdf7ec;border-radius:8px;font-size:13px;color:#6e5a2e;line-height:1.6;">' +
            '🎁 매월 <strong>베스트 리뷰어 세 분</strong>을 선정해 소정의 사은품을 드립니다. 구체적인 후기일수록 선정 확률이 올라갑니다.' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '응답해 주신 내용은 ThinQ Real 운영 개선과 성과 분석에 소중하게 활용됩니다.<br>' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}


// ============================================================
//  FieldCheck 자동 점검 (ThinQ ON Field 자동 점검 시스템)
//  - 시트 탭: health_checks
//  - 점검 장비(무인 노트북, wonseok-lab/thinqreal/fieldcheck/rig)가
//    결과를 POST, 관리자 페이지가 GET
//  - 인증: 관리자 토큰 경로가 아닌 FC_API_KEY (점검 장비는 무인 기기)
//  - 실패 알림: 담당자 메일 + 텔레그램 (기존 파이프라인 재사용)
// ============================================================

function getHealthSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(HEALTH_SHEET_NAME) || ss.insertSheet(HEALTH_SHEET_NAME);
}

function getOrCreateHealthHeaders(sheet) {
  const HEADERS = ['id', 'timestamp', 'level', 'scenario_id', 'scenario_label',
                   'result', 'latency_ms', 'detail', 'stt_text', 'expected',
                   'media_ref', 'note'];
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

// ── 점검 결과 저장 (+ 실패 시 담당자 알림) ──────────────────
function handleNewHealthCheck(data) {
  const fcKey = getFcApiKey();
  if (!fcKey || String(data.apiKey || '') !== fcKey) {
    return jsonResponse({ error: 'Unauthorized' });
  }

  const sheet = getHealthSheet();
  const headers = getOrCreateHealthHeaders(sheet);
  const id = String(Date.now());
  const row = headers.map(h => {
    if (h === 'id')        return id;
    if (h === 'timestamp') return data.timestamp || new Date().toISOString();
    return data[h] ?? '';
  });
  sheet.appendRow(row);

  // 건별 즉시 알림은 FC_IMMEDIATE_ALERT가 켜진 경우에만
  // (테스트 단계에선 끔 — 일일 요약 메일이 기본 알림 수단)
  let mailed = false;
  if (FC_IMMEDIATE_ALERT && data.result === 'fail' && data.alert) {
    sendHealthAlert(data);
    mailed = true;
  }

  return jsonResponse({ success: true, id, mailed });
}

// ── 점검 이력 조회 (관리자 대시보드용) ──────────────────────
function handleGetHealthChecks(days) {
  const sheet = getHealthSheet();
  getOrCreateHealthHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  let cutoff = null;
  const n = Number(days);
  if (n > 0) cutoff = new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const records = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => {
      let v = row[j];
      if (Object.prototype.toString.call(v) === '[object Date]') v = v.toISOString();
      obj[h] = v == null ? '' : v;
    });
    return obj;
  }).filter(r => {
    if (!r.id) return false;
    if (!cutoff) return true;
    const t = new Date(r.timestamp);
    return !isNaN(t) && t >= cutoff;
  });

  // 최신순 정렬
  records.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return jsonResponse({ records });
}

// ── 점검 실패 즉시 알림 (FC_IMMEDIATE_ALERT가 켜진 경우에만 사용) ──
function sendHealthAlert(data) {
  const label = data.scenario_label || data.scenario_id || '';
  const subject = `[ThinQ Real] ⚠ 자동 점검 실패 — ${label}`;
  const body = `
FieldCheck 자동 점검에서 실패가 감지되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  점검 시각 : ${data.timestamp || ''}
  점검 단계 : ${data.level || 'L1'}
  시나리오  : ${label}
  결과      : 실패 (음성 응답 없음 또는 판정 기준 미달)
  녹음 파일 : ${data.media_ref || '-'} (점검 장비의 recordings 폴더)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ThinQ ON이 점검 발화에 음성으로 응답하지 않았습니다.
현장에서 직접 발화하여 재현 여부를 확인해 주세요.
  `.trim();

  try {
    if (FC_TEST_MODE) {
      MailApp.sendEmail({ to: CC_EMAIL, subject, body });
      Logger.log('Health alert mail sent (test mode) → ' + CC_EMAIL);
    } else {
      MailApp.sendEmail({ to: ADMIN_EMAILS, cc: CC_EMAIL, subject, body });
      Logger.log('Health alert mail sent → ' + ADMIN_EMAILS);
    }
  } catch(err) {
    Logger.log('Health alert mail error: ' + err.message);
  }

  // 텔레그램은 담당자 전원이 있는 그룹이므로 테스트 단계에선 발송하지 않음
  if (!FC_TEST_MODE) {
    const e = escapeTelegramHtml;
    sendTelegramMessage(
      '⚠ <b>ThinQ ON 자동 점검 실패</b>\n' +
      '시나리오: ' + e(label) + '\n' +
      '시각: ' + e(String(data.timestamp || '')) + '\n' +
      '음성 무응답 — 현장 재현 확인 필요'
    );
  }
}

// ── 일일 요약 메일 (매일 아침 1회 — 시간 기반 트리거로 실행) ──
// 최초 1회 setupFieldCheckDailyTrigger()를 에디터에서 직접 실행하면
// 매일 FC_SUMMARY_HOUR:FC_SUMMARY_MINUTE 무렵(±15분) sendFieldCheckDailySummary가 자동 호출된다.
// 시각을 바꾼 뒤에는 이 함수를 에디터에서 한 번 다시 실행해야 기존 트리거가 교체된다.
function setupFieldCheckDailyTrigger() {
  // 중복 트리거 방지 — 같은 핸들러의 기존 트리거 제거 후 재생성
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendFieldCheckDailySummary') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendFieldCheckDailySummary')
    .timeBased().everyDays(1).atHour(FC_SUMMARY_HOUR).nearMinute(FC_SUMMARY_MINUTE).create();
  Logger.log('FieldCheck 일일 요약 트리거 생성 완료 (매일 ' + FC_SUMMARY_HOUR + ':' + FC_SUMMARY_MINUTE + ' 무렵, ±15분)');
}

function sendFieldCheckDailySummary() {
  const sheet = getHealthSheet();
  getOrCreateHealthHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idx = {};
  headers.forEach((h, j) => { idx[h] = j; });

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = rows.slice(1).filter(r => {
    const t = new Date(r[idx.timestamp]);
    return r[idx.id] && !isNaN(t) && t >= cutoff;
  });

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  let subject, body;
  // HTML 메일 구성용 데이터 (예약 확정 메일과 동일하게 평문 + HTML 동시 발송)
  const view = { today: today, total: recent.length, failCount: 0, levels: [], failures: [] };

  if (recent.length === 0) {
    // 기록 없음 = 점검 장비가 안 돌았다는 뜻 — 이것 자체가 이상 신호
    subject = `[ThinQ Real] 자동 점검 일일 요약 (${today}) — ⚠ 점검 기록 없음`;
    body = [
      '최근 24시간 동안 FieldCheck 점검 기록이 없습니다.',
      '',
      '점검 장비(노트북)가 꺼져 있거나, 네트워크 문제로 전송이 실패했을 수 있습니다.',
      '점검 장비 상태를 확인해 주세요. (전송 실패분은 점검 장비의 results.jsonl에 남아 있습니다)',
    ].join('\n');
  } else {
    const fails = recent.filter(r => r[idx.result] === 'fail');

    // 판정 단계(L1/L2/L3)별로 나눠 집계한다. 한 시나리오가 L1(응답 유무)과
    // L2(내용 정확도) 두 건을 남기므로, 섞어 세면 성공률이 왜곡된다.
    const byLevel = {};
    recent.forEach(r => {
      const lv = String(r[idx.level] || 'L1').toUpperCase();
      const key = r[idx.scenario_label] || r[idx.scenario_id] || '(미상)';
      if (!byLevel[lv]) byLevel[lv] = {};
      if (!byLevel[lv][key]) byLevel[lv][key] = { total: 0, fail: 0, latSum: 0, latN: 0 };
      const s = byLevel[lv][key];
      s.total++;
      if (r[idx.result] === 'fail') s.fail++;
      const lat = Number(r[idx.latency_ms]);
      if (lat > 0) { s.latSum += lat; s.latN++; }
    });

    const statusMark = fails.length === 0 ? '✅ 전체 정상' : `⚠ 실패 ${fails.length}건`;
    subject = `[ThinQ Real] 자동 점검 일일 요약 (${today}) — ${statusMark}`;

    const lines = [
      `최근 24시간 ThinQ ON 자동 점검 결과입니다.`,
      '',
      `총 판정 : ${recent.length}건  (성공 ${recent.length - fails.length} / 실패 ${fails.length})`,
    ];

    view.failCount = fails.length;
    Object.keys(byLevel).sort().forEach(lv => {
      lines.push('');
      lines.push(`── ${FC_LEVEL_LABELS[lv] || lv} ──`);
      const group = byLevel[lv];
      const items = [];
      Object.keys(group).forEach(key => {
        const s = group[key];
        const rate = Math.round((s.total - s.fail) / s.total * 100);
        const avgLat = s.latN > 0 ? Math.round(s.latSum / s.latN) : null;
        const latPart = avgLat !== null ? `, 평균 응답 시작 ${avgLat}ms` : '';
        lines.push(`  ${key} : 성공률 ${rate}% (${s.total - s.fail}/${s.total})${latPart}`);
        items.push({ label: key, rate: rate, pass: s.total - s.fail, total: s.total, avgLat: avgLat });
      });
      view.levels.push({ code: lv, title: FC_LEVEL_LABELS[lv] || lv, items: items });
      if (items.some(it => it.avgLat !== null)) {
        // 평문 클라이언트에도 같은 도식을 싣는다 (HTML판과 정보량을 맞춤)
        lines.push('');
        lines.push('  ※ 응답 시작 측정 구간');
        lines.push('     ① "하이 엘지" 재생 → ② ThinQ ON "띵" → ③ 1.5초 대기 → ④ 점검 질문 재생');
        lines.push('                                                      ↓ 재생 끝 = 0ms');
        lines.push('                                                ⑤ 녹음 시작 ─── ⑥ 말 시작');
        lines.push(`     ${FC_LATENCY_NOTE}`);
      }
    });

    if (fails.length > 0) {
      lines.push('');
      lines.push('── 실패 상세 (최근순, 최대 10건) ──');
      fails.slice(-10).reverse().forEach(r => {
        // Sheets가 timestamp를 Date 객체로 자동 변환하는 경우가 있어 양쪽 모두 처리
        const tsv = r[idx.timestamp];
        const ts = (Object.prototype.toString.call(tsv) === '[object Date]')
          ? Utilities.formatDate(tsv, Session.getScriptTimeZone(), 'MM-dd HH:mm')
          : String(tsv).replace('T', ' ').slice(5, 16);
        const lv = String(r[idx.level] || 'L1').toUpperCase();
        lines.push(`  ${ts}  [${lv}] ${r[idx.scenario_label] || r[idx.scenario_id]}  (녹음: ${r[idx.media_ref] || '-'})`);
        // L2 실패는 "무엇을 어떻게 잘못 답했는지"가 원인 파악의 핵심이므로 함께 싣는다
        const said = String(r[idx.stt_text] || '').trim();
        if (said) lines.push(`        인식: "${said.length > 120 ? said.slice(0, 120) + '…' : said}"`);
        // 점검 장비가 원인을 특정한 실패(마이크 무입력 등)는 사유를 그대로 노출한다.
        // 이것이 없으면 점검 장비 설정 문제를 ThinQ ON 장애로 오인하게 된다.
        const note = fcNormalizeNote(r[idx.note]);
        if (note) lines.push(`        ⚠ ${note}`);
        view.failures.push({
          ts: ts, level: lv,
          label: String(r[idx.scenario_label] || r[idx.scenario_id] || ''),
          media: String(r[idx.media_ref] || ''),
          said: said.length > 120 ? said.slice(0, 120) + '…' : said,
          note: note,
        });
      });
      lines.push('');
      lines.push('실패 녹음 파일은 점검 장비의 recordings 폴더에서 확인할 수 있습니다.');
      if (fails.some(r => fcNormalizeNote(r[idx.note]).indexOf('마이크') >= 0)) {
        lines.push('');
        lines.push('※ "마이크 무입력"으로 표시된 건은 점검 장비 쪽 문제이며, ThinQ ON 장애가 아닙니다.');
        lines.push('   점검 장비에서  python fieldcheck.py --mic-test  로 확인해 주세요.');
      }
    }
    body = lines.join('\n');
  }

  const to = FC_TEST_MODE ? CC_EMAIL : ADMIN_EMAILS;
  // 예약 확정 메일과 동일하게 HTML + 평문 동시 발송
  // (HTML 미지원 클라이언트는 평문을 받으므로 정보 손실이 없다)
  const htmlBody = buildHealthSummaryHtml(view);
  try {
    if (FC_TEST_MODE) {
      MailApp.sendEmail({ to: to, subject, body, htmlBody });
    } else {
      MailApp.sendEmail({ to: to, cc: CC_EMAIL, subject, body, htmlBody });
    }
    Logger.log('FieldCheck daily summary sent → ' + to);
  } catch(err) {
    Logger.log('FieldCheck daily summary error: ' + err.message);
  }
}

// ── '응답 시작' 측정 구간 도식 ──────────────────────────────
// 점검 한 회차의 진행 순서를 보여주고, 그중 어느 구간을 잰 값인지 표시한다.
// (숫자만 보면 '답을 마치기까지의 시간'으로 오해하기 쉬움)
// 메일 클라이언트 호환: flex/grid 없이 표 셀 6칸으로 배치
// 과거 기록 호환 — 초기 버전이 '리그'라는 용어로 기록한 사유가 시트에 남아
// 있다. 저장된 값을 고치는 대신 표시 시점에 현재 용어로 바꾼다
// (이미 발생한 기록을 수정하지 않는 편이 이력 추적에 안전하다).
function fcNormalizeNote(v) {
  return String(v || '').trim().replace(/리그/g, '점검 장비');
}

function buildLatencyDiagramHtml() {
  const OLIVE = '#3a5035', GRAY = '#6e6e73', LIGHT = '#aeaeb2';

  const step = function (n, line1, line2, active) {
    return '<td width="16%" align="center" valign="top" style="padding:0 3px;">' +
      '<div style="width:20px;height:20px;line-height:20px;border-radius:10px;' +
        'background:' + (active ? OLIVE : '#e0e0e5') + ';color:' + (active ? '#ffffff' : GRAY) + ';' +
        'font-size:11px;font-weight:700;margin:0 auto;">' + n + '</div>' +
      '<div style="font-size:10.5px;color:' + (active ? '#1d1d1f' : GRAY) + ';margin-top:6px;line-height:1.5;">' +
        line1 + (line2 ? '<br>' + line2 : '') +
      '</div>' +
    '</td>';
  };

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

// ── 일일 요약 HTML (예약 확정 메일과 동일한 디자인 언어) ────
// 인라인 스타일만 사용한다 — Gmail/Outlook은 <style> 블록과 외부 리소스를
// 제거하므로 (기존 sendGuestMail과 같은 제약)
function buildHealthSummaryHtml(v) {
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

    v.levels.forEach(function (lv) {
      const hasLat = lv.items.some(function (it) { return it.avgLat !== null; });
      const th = 'font-size:11px;color:' + LIGHT + ';font-weight:400;padding:0 0 6px;';
      const head =
        '<tr>' +
          '<td style="' + th + '">시나리오</td>' +
          '<td style="' + th + '"></td>' +
          '<td align="right" style="' + th + '">성공률</td>' +
          '<td align="right" style="' + th + '">' + (hasLat ? '응답 시작' : '') + '</td>' +
        '</tr>';

      const rows = lv.items.map(function (it) {
        return '<tr>' +
          '<td style="padding:9px 0;font-size:13px;color:#1d1d1f;">' + escapeHtml(it.label) + '</td>' +
          '<td align="right" style="padding:9px 8px;width:76px;">' + bar(it.rate) + '</td>' +
          '<td align="right" style="padding:9px 0;width:82px;font-size:13px;color:' + (it.rate === 100 ? OLIVE : RED) + ';font-weight:600;white-space:nowrap;">' +
            it.rate + '%' +
            '<span style="color:' + LIGHT + ';font-weight:400;font-size:12px;">&nbsp;' + it.pass + '/' + it.total + '</span>' +
          '</td>' +
          '<td align="right" style="padding:9px 0;width:60px;font-size:12px;color:' + GRAY + ';">' +
            (it.avgLat !== null ? it.avgLat + 'ms' : '') + '</td>' +
        '</tr>';
      }).join('');

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
      const cards = v.failures.map(function (f) {
        return '<div style="margin-top:8px;padding:12px 14px;background:#fdf3f2;border-left:3px solid ' + RED + ';border-radius:6px;">' +
          '<div style="font-size:13px;color:#1d1d1f;">' +
            '<span style="color:' + GRAY + ';">' + escapeHtml(f.ts) + '</span>&nbsp;&nbsp;' +
            '<span style="display:inline-block;padding:1px 6px;background:' + RED + ';color:#ffffff;border-radius:3px;font-size:11px;font-weight:600;">' + escapeHtml(f.level) + '</span>&nbsp;' +
            '<strong>' + escapeHtml(f.label) + '</strong>' +
          '</div>' +
          (f.said ? '<div style="font-size:13px;color:#1d1d1f;margin-top:5px;">인식: “' + escapeHtml(f.said) + '”</div>' : '') +
          (f.note ? '<div style="font-size:12px;color:' + RED + ';margin-top:5px;">⚠ ' + escapeHtml(f.note) + '</div>' : '') +
          (f.media ? '<div style="font-size:11px;color:' + LIGHT + ';margin-top:5px;font-family:Consolas,Menlo,monospace;word-break:break-all;">' + escapeHtml(f.media) + '</div>' : '') +
        '</div>';
      }).join('');

      inner +=
        '<div style="margin-top:24px;font-size:13px;font-weight:600;color:' + RED + ';">실패 상세 (최근순, 최대 10건)</div>' +
        cards +
        '<div style="margin-top:10px;font-size:12px;color:' + GRAY + ';">실패 녹음 파일은 점검 장비의 recordings 폴더에서 확인할 수 있습니다.</div>';

      if (v.failures.some(function (f) { return f.note.indexOf('마이크') >= 0; })) {
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
