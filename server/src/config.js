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
// 로컬 dev는 임시 생성 허용(경고) — 재시작 시 발급 토큰이 무효화됨을 감수.
let authSecret = env('AUTH_SECRET');
if (!authSecret) {
  if (isProd) {
    console.error('[config] AUTH_SECRET 미설정 — production에서는 필수입니다. 기동을 중단합니다.');
    process.exit(1);
  }
  authSecret = crypto.randomUUID() + '_' + crypto.randomUUID();
  console.warn('[config] AUTH_SECRET 미설정 → 임시 키 생성 (재시작 시 발급 토큰 전부 무효화됨. dev 전용)');
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

  guideUrl: env('GUIDE_URL', 'https://thinqreal.com/#page-guide'),
  adminPageUrl: env('ADMIN_PAGE_URL', 'https://thinqreal.com/thinqreal_admin.html'),
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
