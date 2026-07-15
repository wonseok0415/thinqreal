// 도메인 상수 — ThinQReal_AppScript.gs에서 이식. 비밀값은 여기 두지 않는다(env).

// 시트 탭 이름 (변경 금지 — 현행 시트와 일치)
export const SHEET_NAME = 'bookings';
export const ROI_SHEET_NAME = 'roi_snapshots';
export const ARTICLES_SHEET_NAME = 'monthly_articles';
export const SLOT_BLOCKS_SHEET_NAME = 'slot_blocks';
export const STATE_SHEET_NAME = 'app_state'; // Script Properties의 상태값 대체 (신규)

// bookings 24컬럼 — getOrCreateHeaders의 HEADERS 배열 그대로 (단일 소스)
export const BOOKING_HEADERS = [
  'id', 'timestamp', 'date', 'slots', 'slot', 'slotLabel',
  'name', 'org', 'phone', 'email',
  'purpose', 'count', 'note', 'status',
  'subject', 'clientCompany', 'visitors', 'usagePlan', 'expectedEffect', 'purposeKey',
  'privacyConsent',
  'calendarEventId',
  'division', 'department',
];
export const ROI_HEADERS = ['id', 'timestamp', 'label', 'author', 'inputs', 'outputs'];
export const ARTICLES_HEADERS = ['month', 'title', 'url', 'source', 'summary', 'published_at', 'thumbnail'];
export const SLOT_BLOCKS_HEADERS = ['id', 'date', 'slot', 'timestamp', 'by', 'reason'];
export const STATE_HEADERS = ['key', 'value'];

// ── 설문 데이터 파이프라인 (2026-07 — ThinQReal_Survey_DB_Spec) ──────────
// 탭 3종 — 컬럼 단일 소스는 .gs와 동일한 이 상수 배열 (api-contract.md §4.5)
export const SURVEY_SHEET_NAME = 'survey_responses';
export const LEDGER_SHEET_NAME = 'performance_ledger';
export const ISSUE_SHEET_NAME = 'iot_issue_log';

// ⚠ 새 컬럼은 반드시 배열 "끝"에만 추가할 것 — 제출이 이 순서대로 append하므로
//   중간 삽입 시 기존 시트 컬럼과 어긋난다 (기존 시트엔 누락 헤더 끝 자동 append).
export const SURVEY_HEADERS = ['response_id', 'submitted_at', 'visit_date', 'dept', 'name', 'client', 'visit_count', 'track', 'purpose', 'deal_stage', 'deal_size', 'deal_area', 'reaction', 'attr', 'media_work', 'media_days', 'media_alt', 'media_cost', 'media_link', 'media_link_name', 'media_link_size', 'media_link_attr', 'etc_work', 'etc_days', 'etc_alt', 'iot_defect', 'iot_defect_detail', 'etc_link', 'etc_link_name', 'etc_link_size', 'etc_link_attr', 'satisfaction', 'feedback', 'raw_json', 'deal_amount'];
export const LEDGER_HEADERS = ['ledger_id', 'response_id', 'category', 'project_name', 'expected_scale', 'attribution_text', 'attribution_pct', 'visit_date', 'respondent', 'dept', 'status', 'confirmed_amount', 'confirmed_date', 'confirmed_note', 'roi_included'];
export const ISSUE_HEADERS = ['issue_id', 'response_id', 'device', 'symptom', 'severity', 'channel', 'q_ship', 'status', 'est_value'];

// 이슈 est_value 계산 — severity 라벨 → 발생 확률 (참고용, ROI 미산입)
export const SEVERITY_PCT = { '높음': 0.5, '가끔': 0.1, '드묾': 0.01 };

// ── 사이트 접근 통제 ─────────────────────────────────────────
export const AUTH_ALLOWED_DOMAINS = ['lge.com'];
export const AUTH_CODE_TTL_SEC = 20 * 60;      // 20분 (사내 메일 검역 지연 대응)
export const AUTH_TOKEN_TTL_DAYS = 30;
export const AUTH_COOLDOWN_SEC = 60;
export const AUTH_MAX_FAIL_ATTEMPTS = 5;
export const AUTH_FAIL_WINDOW_SEC = 20 * 60;
export const AUTH_ADMIN_TOKEN_TTL_DAYS = 90;   // 2026-07-07 7일→90일 연장

// ── 관리자 명단 (비밀 아님 — 현행 공개 리포와 동일 노출 수준) ──
export const AUTH_ADMIN_EMAILS = [
  'kang.wonseok@lge.com',  // 강원석 — 시스템 운영
  'jhs.kim@lge.com',       // 김재훈 팀장
  'ch275.lee@lge.com',     // 이철호 책임
  'moonsu.seo@lge.com',    // 서문수 선임
  'hj8462.kim@lge.com',    // 김현진 선임
  'kwangsoo.park@lge.com', // 박광수 책임
];

// 임시 관리자 — 이메일(소문자) → 만료일 'YYYY-MM-DD' (KST 23:59:59까지 유효)
export const AUTH_TEMP_ADMINS = {
  'aelim.go@lge.com': '2026-07-03', // 사내 정보보호팀 침투테스트 (2026-06-29 ~ 07-03)
};

// ── 회차 시간표 (확정, 변경 금지) ─────────────────────────────
export const SLOT_TIMES = {
  1: { start: [9, 0], end: [10, 30] },
  2: { start: [13, 0], end: [14, 30] },
  3: { start: [15, 0], end: [16, 30] },
};
export const SLOT_LABEL_TEXT = { 1: '1회차 09:00~10:30', 2: '2회차 13:00~14:30', 3: '3회차 15:00~16:30' };

// ── 목적별 1번째 줄(주제) 라벨 — index.html PURPOSE_CONFIG와 동기화 ──
export const SUBJ_LABELS = {
  'b2b': '고객사',
  'rd': '프로젝트명',
  'pr': '행사명',
  'content': '촬영명',
  'internal-comm': '행사명',
  'other': '제목',
};

// ── 통계/리포트 색상 — thinqreal_admin.html PURPOSE_COLORS와 동기화 ──
export const PURPOSE_COLORS = {
  'B2B 영업': '#ff9500',
  'R&D': '#3a5035',
  '홍보 (프레스투어/마케팅)': '#0a84a3',
  '콘텐츠 제작': '#cc7000',
  '내부 커뮤니케이션': '#7f51e4',
  '기타': '#8fa889',
};

// ROI 가치 항목 — ThinQ_Real_ROI_Tool.html collectOutputs 키와 동기화
export const ROI_VALUE_LABELS = {
  vRnD: { label: 'R&D 효율화', color: '#3a5035' },
  vSalesInfra: { label: '영업 지원 (인프라)', color: '#8fa889' },
  vSalesContrib: { label: '영업 지원 (기여이익)', color: '#ff9500' },
  vPR: { label: 'PR 가치', color: '#af52de' },
};

export const MONTHLY_REPORT_QUERY = 'LG전자 ThinQ Real';
export const STATE_LAST_SENT_KEY = 'monthly_report_last_sent_month';

// R&D 연구 목적 예약자에게 함께 보내는 구비 가전 리스트 (총 45개)
// [구분, 제품명, 모델명, 제조사] — PDF 슬라이드 7 순서 유지 (재정렬 금지)
export const APPLIANCES = [
  ['시스템에어컨 (거실)', '1Way 정온제습(콜드프리) 에어컨 (신제품)', '미출시', 'LG전자'],
  ['시스템에어컨 (침실)', '1Way 정온제습(콜드프리) 에어컨 (신제품)', '미출시', 'LG전자'],
  ['욕실 환기', '바스에어시스템 (듀얼배기)', 'M-X0120BASV', 'LG전자'],
  ['프리미엄 환기', 'LG 프리미엄 환기 PLUS', 'Z-E0250L2AR', 'LG전자'],
  ['스마트디퓨저 (배기)', '환기 디퓨저', 'PVD-R120TD.AKM', 'LG전자'],
  ['스마트디퓨저 (급기)', '환기 디퓨저', 'PVD-S120AA.AKM', 'LG전자'],
  ['시스템공청기', '시스템 공청기', '미출시', 'LG전자'],
  ['스탠바이미2', 'LG 스탠바이미2', '27LX6TPGAA', 'LG전자'],
  ['TV', 'LG QNED TV', '86QNED90KQA', 'LG전자'],
  ['냉장고', 'LG 오브제컬렉션 무드업', 'M624GNN0A2', 'LG전자'],
  ['김치냉장고', 'LG 디오스 김치톡톡 무드업', 'Z331GNN152', 'LG전자'],
  ['와인셀러', 'LG 디오스 오브제컬렉션 와인셀러 (81병)', 'W0812GG', 'LG전자'],
  ['세탁기', 'LG 트롬 AI 오브제컬렉션 워시타워 (세탁 25kg)', 'FA25GJFB', 'LG전자'],
  ['건조기', 'LG 트롬 AI 오브제컬렉션 워시타워 (건조 25kg)', 'RA25GJFB', 'LG전자'],
  ['제습기', 'LG 휘센 오브제컬렉션 제습기', 'DQ235MEGA', 'LG전자'],
  ['공기청정기', 'LG 퓨리케어 AI 오브제컬렉션 360˚ 공기청정기', 'AS355NSNA', 'LG전자'],
  ['하이드로타워', 'LG 퓨리케어 오브제컬렉션 하이드로타워', 'HY705RSUAB', 'LG전자'],
  ['하이드로 에센셜', 'LG 퓨리케어 오브제컬렉션 하이드로 에센셜', 'HY505RWLAH', 'LG전자'],
  ['에어로스피커', 'LG 퓨리케어 AI 오브제컬렉션 에어로스피커', 'AS065SWHA', 'LG전자'],
  ['사운드바', 'LG 사운드바 스위트', 'H7', 'LG전자'],
  ['정수기', 'LG 퓨리케어 정수기 (듀얼, 냉온정)', 'WU923AS', 'LG전자'],
  ['의류관리기', 'LG 스타일러 오브제컬렉션', 'SC5GMR52C', 'LG전자'],
  ['안마의자', 'LG 힐링미 오브제컬렉션 안마의자 (아르테UP)', 'MH21RRY', 'LG전자'],
  ['로봇청소기', '히든스테이션 로봇청소기', '미출시', 'LG전자'],
  ['광파오븐', 'LG 디오스 오브제컬렉션 광파오븐', 'MLJ32ERS', 'LG전자'],
  ['인덕션', 'LG 디오스 오브제컬렉션 인덕션 1등급', 'BEI3ANHLE', 'LG전자'],
  ['식기세척기', 'LG 디오스 오브제컬렉션 식기세척기 (열풍+스팀)', 'DFBJ4ES', 'LG전자'],
  ['식물생활가전', '틔운 오브제컬렉션', 'L123G1P', 'LG전자'],
  ['스마트수전', 'LG 샤워 스테이션', '미출시', 'LG전자'],
  ['ThinQ ON', 'LG AI Home', 'HMAK4W.AKOR', 'LG전자'],
  ['보이스 컨트롤러', 'LG AI Home', 'HAAL3W.AKOR', 'LG전자'],
  ['공기질 센서', 'LG 공기질 센서', 'TMSA2A4W.AKOR', 'LG전자'],
  ['온습도 센서', 'LG 온습도 센서', 'TMSTAA4W.AKOR', 'LG전자'],
  ['스마트 버튼 (1구)', 'LG 스마트 버튼', 'TMCB1B4W.AKOR', 'LG전자'],
  ['스마트 버튼 (2구)', 'LG 스마트 버튼', 'TMCB2B4W.AKOR', 'LG전자'],
  ['도어 센서', 'LG 도어 센서', 'TMSDAA4W.AKOR', 'LG전자'],
  ['모션 조도 센서', 'LG 모션 조도 센서', 'TMSMAA4W.AKOR', 'LG전자'],
  ['스마트 플러그', 'LG 스마트 플러그', 'TMCP114W.AKOR', 'LG전자'],
  ['스마트 도어락', 'LG 스마트 도어락', 'TZCDP14B.AKOR', 'LG전자'],
  ['전동창호 (분합창)', 'LX 하우시스 전동창호 분합창 (Sliding)', '미출시', 'LX하우시스'],
  ['전동창호 (주방창)', 'LX 하우시스 전동창호 주방창 (Outward)', '미출시', 'LX하우시스'],
  ['월패드', '현대HT 월패드', 'HNF-I7130', '현대HT'],
  ['온도조절기', '시하스 온도조절기', '—', '시하스'],
  ['AP', 'Unifi U7-Pro-XG', 'U7-Pro-XG', 'Ubiquiti'],
  ['전동커튼', '마마바 (Matter over WiFi)', '—', '마마바'],
];
