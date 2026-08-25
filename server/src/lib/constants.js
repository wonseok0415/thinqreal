// 도메인 상수 — ThinQReal_AppScript.gs에서 이식. 비밀값은 여기 두지 않는다(env).

// 시트 탭 이름 (변경 금지 — 현행 시트와 일치)
export const SHEET_NAME = 'bookings';
export const ROI_SHEET_NAME = 'roi_snapshots';
export const ARTICLES_SHEET_NAME = 'monthly_articles';
export const SLOT_BLOCKS_SHEET_NAME = 'slot_blocks';
export const STATE_SHEET_NAME = 'app_state'; // Script Properties의 상태값 대체 (신규)

// bookings 25컬럼 — getOrCreateHeaders의 HEADERS 배열 그대로 (단일 소스)
export const BOOKING_HEADERS = [
  'id', 'timestamp', 'date', 'slots', 'slot', 'slotLabel',
  'name', 'org', 'phone', 'email',
  'purpose', 'count', 'note', 'status',
  'subject', 'clientCompany', 'visitors', 'usagePlan', 'expectedEffect', 'purposeKey',
  'privacyConsent',
  'calendarEventId',
  'division', 'department',
  // 2026-07 방문 후기 설문 요청 메일 발송 기록 (배치 재실행 시 중복 발송 방지)
  'surveyInviteSentAt',
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
// 42컬럼 (2026-07~08 확장: deal_amount + 설문 8번 블록 7종)
export const SURVEY_HEADERS = ['response_id', 'submitted_at', 'visit_date', 'dept', 'name', 'client', 'visit_count', 'track', 'purpose', 'deal_stage', 'deal_size', 'deal_area', 'reaction', 'attr', 'media_work', 'media_days', 'media_alt', 'media_cost', 'media_link', 'media_link_name', 'media_link_size', 'media_link_attr', 'etc_work', 'etc_days', 'etc_alt', 'iot_defect', 'iot_defect_detail', 'etc_link', 'etc_link_name', 'etc_link_size', 'etc_link_attr', 'satisfaction', 'feedback', 'raw_json', 'deal_amount', 'impressive_modes', 'desired_solutions', 'impressive_reasons', 'adopt_pick', 'voice_space', 'iot_connect', 'ai_barrier'];
export const LEDGER_HEADERS = ['ledger_id', 'response_id', 'category', 'project_name', 'expected_scale', 'attribution_text', 'attribution_pct', 'visit_date', 'respondent', 'dept', 'status', 'confirmed_amount', 'confirmed_date', 'confirmed_note', 'roi_included', 'amount_basis'];
export const ISSUE_HEADERS = ['issue_id', 'response_id', 'device', 'symptom', 'severity', 'channel', 'q_ship', 'status', 'est_value'];

// ── 방문자 현장 설문 (§8-5 — 퇴장 직전 QR 익명 응답, 파생 없음·ROI 미산입) ──
export const VISITOR_SHEET_NAME = 'visitor_responses';
export const VISITOR_HEADERS = ['response_id', 'submitted_at', 'lang', 'satisfaction', 'impressive_modes', 'adopt_pick', 'voice_space', 'iot_connect', 'ai_barrier', 'feedback', 'raw_json'];

// ── 월간 리포트 큐레이션 (§8-7 5·6) — type: 'insight'(핵심 인사이트) | 'quote'(인상 깊은 한마디) ──
export const INSIGHTS_SHEET_NAME = 'monthly_insights';
export const INSIGHTS_HEADERS = ['id', 'month', 'seq', 'type', 'text', 'source', 'created_at'];

// ── 베스트 리뷰어 사은품 발송 (2026-08-22) — 축하 메일만, 기프티콘은 별도 채널 ──
export const BEST_SHEET_NAME = 'best_reviewers';
export const BEST_HEADERS = ['id', 'month', 'response_id', 'name', 'dept', 'email', 'visit_date', 'product', 'sent_at', 'sent_by'];
export const BEST_MONTHLY_LIMIT = 3;   // 월 발송 한도 — 공지 문구('세 분')와 세트
export const BEST_DEFAULT_PRODUCT = '스타벅스 아이스 카페 아메리카노 T 2잔'; // 계절별 변경은 발송 화면 입력값으로

// ── CSV 내보내기 감사 로그 (개인정보보호팀 요구 — 사유·시각·행 수만, 파일 비밀번호 미기록) ──
export const EXPORT_LOG_SHEET_NAME = 'export_log';
export const EXPORT_LOG_HEADERS = ['id', 'timestamp', 'email', 'reason', 'rowCount'];

// ── FieldCheck 자동 점검 (health_checks — 점검 장비가 POST, 관리자 페이지가 GET) ──
export const HEALTH_SHEET_NAME = 'health_checks';
export const HEALTH_HEADERS = ['id', 'timestamp', 'level', 'scenario_id', 'scenario_label',
  'result', 'latency_ms', 'detail', 'stt_text', 'expected', 'media_ref', 'note'];
// 알림 정책 — 테스트 단계: 메일은 운영자(CC)에게만, 텔레그램 미발송. 정식 운영 전환 시 false
export const FC_TEST_MODE = true;
export const FC_IMMEDIATE_ALERT = false; // 건별 실패 즉시 알림 — 테스트 단계에선 끔 (일일 요약만)
export const FC_LEVEL_LABELS = {
  L1: 'L1 응답 감지 — 말을 했는가',
  L2: 'L2 내용 판정 — 질문에 맞는 답을 했는가 (응답한 건 중)',
  L3: 'L3 가전 동작 — 실제로 제어되었는가',
};
export const FC_LATENCY_NOTE = '응답 시작 = 점검 질문을 다 말한 순간부터 ThinQ ON이 답을 시작하기까지 걸린 시간입니다. 답변을 끝내기까지의 길이는 포함하지 않습니다.';

// ── FieldVoice 현장 인사이트 (voc_reports — 가명화 1페이지 요약만, 원본 음성·전사 금지) ──
export const VOC_SHEET_NAME = 'voc_reports';
export const VOC_HEADERS = ['id', 'timestamp', 'visit_date', 'session_id', 'purpose',
  'one_liner', 'report_md', 'consent', 'author'];

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
  'jason.kwon@lge.com',    // 권영섭 (2026-08-18 추가 — 관리자 페이지 접근용, 담당자 알림 미수신)
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
  vRnD: { label: 'R&D 기여 가치', color: '#3a5035' },
  vSalesInfra: { label: '영업 기여 가치', color: '#8fa889' },
  vSalesContrib: { label: '수주 기여 이익', color: '#ff9500' },
  vPR: { label: '홍보 노출 가치', color: '#af52de' },
  vQuality: { label: '품질 개선 가치', color: '#1b6ca8' },
};

export const MONTHLY_REPORT_QUERY = 'LG전자 ThinQ Real'; // 2026-08-04 팀장 리뷰 — ThinQ Real 직접 관련 기사만
export const STATE_LAST_SENT_KEY = 'monthly_report_last_sent_month';
// 리포트 기사 상한 — 수동 큐레이션 우선 배치, 미달분만 자동 수집으로 보충 (2026-08-03 렌더 리뷰)
export const REPORT_ARTICLE_LIMIT = 5;

// ROI 확정 기준 수치 (2026-08 확정 — 저장 시나리오 의존 폐기, 고정 표기)
// ※ 총액 요약·지표만 커밋 가능 — 항목별 실집행 단가는 커밋 금지 (§6.5)
export const ROI_FIXED = {
  capex: '2.8억원', opexYr: '0.1억원/년', totalCost: '2.9억원',
  bep: '1.31년 (약 1년 4개월)', roi3: '+122.4%', roi5: '+270.7%',
};
// 리포트 ROI 동적 반영 pin (2026-08-24) — .gs Script Property를 app_state 키로 이식.
// ⚠ roi_snapshot 저장은 공개 경로라 「최신 스냅샷 자동 참조」 금지 — 지정·해제는 관리자 토큰 POST로만.
export const STATE_ROI_PIN_KEY = 'roi_report_snapshot_id';

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
