// 환경변수 파싱·검증 — 설정의 단일 소스. 비밀값은 전부 여기(env)로만 들어온다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 날짜·회차·마지막 금요일 판정 전부 KST 전제 (현행 스크립트 TZ 규칙 승계)
process.env.TZ = process.env.TZ || 'Asia/Seoul';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');       // server/
const repoRoot = path.resolve(serverRoot, '..');        // 리포 루트 (로컬 dev에서 정적 서빙)

const env = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const isProd = env('NODE_ENV') === 'production';

// AUTH_SECRET — 자동 생성 제거(재시작마다 토큰 전체 무효화 방지): production은 필수 주입.
// 예외: KVSTORE_ADDR(Valkey)가 있으면 부트 시 전 레플리카가 공유하는 키를 Valkey에서
// get-or-create 한다 (auth/secret.js — 사내 SealedSecret 절차 확정 전 임시 경로).
// 로컬 dev는 임시 생성 허용(경고) — 재시작 시 발급 토큰이 무효화됨을 감수.
let authSecret = env('AUTH_SECRET');
if (!authSecret) {
  if (isProd && !env('KVSTORE_ADDR')) {
    console.error('[config] AUTH_SECRET 미설정 — production에서는 필수입니다 (KVSTORE_ADDR 공유 경로도 없음). 기동을 중단합니다.');
    process.exit(1);
  }
  authSecret = crypto.randomUUID() + '_' + crypto.randomUUID();
  if (!env('KVSTORE_ADDR')) {
    console.warn('[config] AUTH_SECRET 미설정 → 임시 키 생성 (재시작 시 발급 토큰 전부 무효화됨. dev 전용)');
  }
}

// 정적 프론트 디렉토리: env 우선 → server/public(도커) → 리포 루트(로컬 dev)
function resolveStaticDir() {
  const fromEnv = env('STATIC_DIR');
  if (fromEnv) return path.resolve(fromEnv);
  const pub = path.join(serverRoot, 'public');
  if (fs.existsSync(path.join(pub, 'index.html'))) return pub;
  if (fs.existsSync(path.join(repoRoot, 'index.html'))) return repoRoot;
  return pub;
}

export const config = {
  isProd,
  port: Number(env('PORT', '8080')),
  staticDir: resolveStaticDir(),

  storeBackend: env('STORE_BACKEND', 'memory'), // memory | sheets | dynamo(2단계)
  storeSeed: env('STORE_SEED'),

  // ── 사내 K8s(TCN) 배포 환경 — gitea-repo-contract.md §4의 기본 제공 env ──
  // ENVIRONMENT: kic-st(개발)/kic-qa(검증)/kic-op(운영). 미설정 = 로컬/독립 컨테이너.
  environment: env('ENVIRONMENT'),
  // Valkey(KVStore) — HPA 멀티 레플리카(min 2)에서 인증 코드·공유 상태를 레플리카 간 공유.
  // 미설정 시 프로세스 메모리 폴백(단일 인스턴스 전용). 키는 반드시 `${prefix}:` 접두.
  kvstore: {
    addr: env('KVSTORE_ADDR'),
    prefix: env('KVSTORE_PREFIX', 'thinq-real'),
  },
  // 비운영 환경(kic-st/kic-qa)에서는 실제 외부 발송(메일·텔레그램·Teams)을 억제 — kic-op만 실발송.
  // ENVIRONMENT 미설정(로컬)은 억제하지 않음(SMTP 미설정이면 어차피 콘솔 모드). OUTBOUND_FORCE_SEND=true로 해제.
  outboundSuppressed: (() => {
    const e = env('ENVIRONMENT');
    if (!e || e === 'kic-op') return false;
    return env('OUTBOUND_FORCE_SEND') !== 'true';
  })(),

  authSecret,

  sheetId: env('SHEET_ID', '1-Z158TV46MtSEArir9bW4h4KQ438NCuhb3qaGyOooA0'),
  googleServiceAccountJson: env('GOOGLE_SERVICE_ACCOUNT_JSON'), // 파일 경로 또는 JSON 문자열
  calendarId: env('CALENDAR_ID'),

  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE') === 'true',
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', 'thinqreal@example.com'),
  },
  adminAlertTo: env('ADMIN_ALERT_TO', 'ch275.lee@lge.com, moonsu.seo@lge.com, hj8462.kim@lge.com'),
  adminAlertCc: env('ADMIN_ALERT_CC', 'kang.wonseok@lge.com'),
  monthlyReportTo: env('MONTHLY_REPORT_TO'),
  // 월간 리포트 "나에게만 테스트 발송" 수신자 (§8-6 2단계 발송 — 미설정 시 테스트 버튼 안내만)
  monthlyReportTestTo: env('MONTHLY_REPORT_TEST_TO'),
  // 베스트 리뷰어 축하 메일 숨은 참조 — 담당자 3명 + 팀장 + 운영자 (2026-08-22 운영자 결정)
  bestReviewerBcc: env('BEST_REVIEWER_BCC',
    'ch275.lee@lge.com, moonsu.seo@lge.com, hj8462.kim@lge.com, jhs.kim@lge.com, kang.wonseok@lge.com'),

  // 확정 메일 민감 정보 — 코드/리포에 두지 않는다 (.gs 하드코딩에서 env로 이동)
  wifi: {
    ssid24: env('WIFI_SSID_24G', '(미설정)'),
    ssid5: env('WIFI_SSID_5G', '(미설정)'),
    password: env('WIFI_PASSWORD', '(미설정)'),
  },
  doorlockPin: env('DOORLOCK_PIN', '(미설정)'),

  teamsWebhookUrl: env('TEAMS_WEBHOOK_URL'),
  telegram: {
    token: env('TELEGRAM_BOT_TOKEN'),
    chatId: env('TELEGRAM_CHAT_ID'),
  },

  serperApiKey: env('SERPER_API_KEY'),
  cse: { id: env('GOOGLE_CSE_ID'), key: env('GOOGLE_CSE_KEY') },

  // 설문 이슈 est_value 계산용 CS 채널 단가 — 민감 정보 (.gs Script Property SURVEY_CAS_JSON 이식).
  // 형식: {"원격":N,"내방":N,"출장":N} (원 단위). 미설정 시 est_value 공란 (참고용·ROI 미산입이라 무해).
  surveyCasJson: env('SURVEY_CAS_JSON'),

  // FieldCheck 점검 장비 인증 키 — .gs Script Property FC_API_KEY 이식. 미설정 시 접수 전부 거부 (fail-closed)
  fcApiKey: env('FC_API_KEY'),
  // FieldVoice 업로드 인증 키 — 동일 원칙 (fail-closed)
  fvApiKey: env('FV_API_KEY'),

  guideUrl: env('GUIDE_URL', 'https://thinqreal.com/#page-guide'),
  adminPageUrl: env('ADMIN_PAGE_URL', 'https://thinqreal.com/thinqreal_admin.html'),
  surveyFormUrl: env('SURVEY_FORM_URL', 'https://thinqreal.com/ThinQ_Real_Visit_Survey.html'),
};

// 서비스 계정 JSON 로드 (경로 또는 인라인 JSON). sheets 백엔드·캘린더에서 사용.
export function loadServiceAccount() {
  const raw = config.googleServiceAccountJson;
  if (!raw) return null;
  try {
    const text = raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    console.error('[config] GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패: ' + e.message);
    return null;
  }
}
