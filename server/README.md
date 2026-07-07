# ThinQ Real 서버 (이관 1단계 — Apps Script 대체 단일 컨테이너)

Google Apps Script(`ThinQReal_AppScript.gs`) 전체 기능 + 정적 프론트 서빙을 하나의
도커 컨테이너로 통합한 백엔드. 설계 근거·구조는 `docs/migration/stage1-container-design.md` 참조.

- **런타임**: Node.js 22 + Express (플레인 JS·ESM, 빌드 스텝 없음)
- **API 계약**: `/api?type=…` — 현행 Apps Script와 동일 (`docs/migration/api-contract.md`)
- **저장소**: `STORE_BACKEND` env로 선택 — `memory`(로컬 검증) / `sheets`(운영) / `dynamo`(2단계 스텁)
- **비밀값**: 전부 환경변수 (`.env.example` 참조) — 코드·리포에 없음

## 로컬 실행 (Node 직접)

```bash
cd server
npm install
STORE_BACKEND=memory STORE_SEED=demo npm start
# → http://localhost:8080          (메인 사이트 — 리포 루트의 index.html 서빙)
# → http://localhost:8080/api?type=availability&date=2026-07-10
# → http://localhost:8080/api?type=appliances
# → http://localhost:8080/healthz
```

SMTP 미설정이면 메일은 **콘솔 로그 모드**로 동작(실제 발송 없음) — 인증 코드가
서버 로그에 출력되므로 로그인 흐름을 끝까지 검증할 수 있다.

## 도커 실행

빌드 컨텍스트는 **리포 루트** (정적 파일을 이미지에 함께 넣기 위해):

```bash
docker build -f server/Dockerfile -t thinqreal:local .
cp server/.env.example server/.env   # 값 채우기 (로컬 검증은 기본값으로도 기동)
docker run --rm -p 8080:8080 --env-file server/.env thinqreal:local
```

## 월간 리포트 (CronJob)

같은 이미지에 command만 오버라이드 — K8s CronJob `30 8 * * *` (TZ=Asia/Seoul):

```bash
node src/jobs/monthlyReport.js                 # 마지막 금요일 판정 + 월 중복 가드
node src/jobs/monthlyReport.js --force --month=2026-06   # 강제 발송 (테스트)
```

수동 미리보기/발송은 현행 계약 그대로:
`GET /api?type=monthly_report_preview&month=YYYY-MM` /
`GET /api?type=monthly_report_send&month=YYYY-MM&confirm=YES[&to=…]`

## Sheets 백엔드 전환 (운영 준비물)

1. GCP 프로젝트에서 **서비스 계정** 생성 → JSON 키 발급
2. 대상 스프레드시트를 서비스 계정 이메일에 **편집자**로 공유
   (캘린더 동기화까지 쓰려면 캘린더도 **변경 권한** 공유)
3. env 설정: `STORE_BACKEND=sheets`, `GOOGLE_SERVICE_ACCOUNT_JSON=<JSON 또는 파일경로>`, `SHEET_ID=…`
4. `AUTH_SECRET`에 **현행 Apps Script Script Property 값을 그대로** 입력 → 기존 발급 토큰 무중단

## 프론트 전환 (실제 전환 시점에만)

프론트 3개 HTML의 `SCRIPT_URL` 상수를 `'/api'`로 교체 (같은 오리진 — CORS 소멸).
1단계 로컬 검증 동안 라이브(GitHub Pages + Apps Script)는 그대로 운영.

## 구조

```
src/
├── index.js / app.js / config.js   # 부트스트랩 · Express 조립 · env 단일 소스
├── routes/    get.js post.js       # /api type 디스패치 (POST는 관리자 토큰 게이트)
├── handlers/                       # .gs handle* 1:1 이식
├── auth/      token.js codes.js admins.js   # HMAC 토큰(형식 불변) · 코드 · 명단
├── store/     memory.js sheets/ dynamo/     # 저장소 어댑터 (types.js = 계약)
├── mail/      mailer.js templates/          # SMTP 래퍼 + 메일 빌더 5종
├── notify/    telegram.js teams.js          # 알림 (env 미설정 시 silent skip)
├── calendar/  google.js                     # 캘린더 미러링 (googleapis)
├── report/    collect.js charts.js articles.js send.js  # 월간 리포트 (차트 내부 렌더링)
├── jobs/      monthlyReport.js              # CronJob 엔트리포인트
└── lib/       constants.js dates.js ttlCache.js html.js
```

## 전제 (BE팀 공유)

- **단일 레플리카** — 인증 코드 캐시(인메모리)·시트 쓰기 직렬화(프로세스 내 mutex).
  멀티 레플리카 필요 시 `lib/ttlCache.js`를 Redis로 교체.
- EKS → Google API(Sheets·Calendar)·Serper·Telegram outbound egress 필요.
- 사내 SMTP 스펙 확정 전까지 로컬 검증은 콘솔 로그 모드 또는 MailHog.
