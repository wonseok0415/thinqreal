# 1단계 — Apps Script 대체 단일 도커 컨테이너: 코드 구조 설계 (v1 제안)

> 세션: 2026-07-07 이관 전용 세션. `decisions-2026-07-06.md` §5(1단계 작업 정의)의 설계안.
> 상태: **구현 완료 (동일 세션, 2026-07-07)** — 코드는 `server/` 하위, 실행 가이드는 `server/README.md`.
> 구현 중 설계에서 달라진 점은 §8 참조. 참고 문서: api-contract.md · data-schema.md · dependency-inventory.md

## 0. 설계 목표 (decisions §5 재확인)

- Apps Script(`ThinQReal_AppScript.gs`, 3,038줄) 전체 기능 + 정적 프론트 서빙을 **하나의 컨테이너**로.
- 로컬 `docker run`으로 기동·검증 가능한 상태까지가 1단계.
- 데이터는 당분간 **구글 스프레드시트 유지** — 저장소를 어댑터 인터페이스로 분리해 DynamoDB 전환 시 교체만.
- 인증은 **현행 HMAC 토큰 구조 유지**로 시작 (클라이언트 무변경). SSO는 요구사항 확인 후 미들웨어 교체.
- 비밀값은 **환경변수로만** — 코드·리포 미기재.

## 1. 런타임/프레임워크 — Node.js 22 LTS + Express (플레인 JS·ESM)

| 선택 | 결정 | 근거 |
|---|---|---|
| 런타임 | **Node.js 22 LTS** | 현행 백엔드 3,038줄이 전부 JavaScript. 최대 비중인 메일 HTML 빌더(~1,200줄 — confirm/reject/adminAlert/authCode/monthlyReport), HMAC 토큰 서명·검증, 날짜(KST) 로직이 **거의 그대로 이식**됨. 타 언어(Java/Python)는 이 전부를 재작성해야 하고 메일 템플릿 리그레션 위험이 큼. 프론트 3종도 순수 JS라 단일 언어 스택. |
| 프레임워크 | **Express** | 요구가 "정적 파일 서빙 + 단일 엔드포인트 `type` 라우팅"으로 극히 단순 — 프레임워크 기능 요구가 낮아 가장 보편적·문서 많은 것 선택. 직원용 저트래픽이라 성능 프레임워크(Fastify 등) 불필요 (decisions §2-①: 성능 튜닝 부담 적음). |
| 언어 형태 | **플레인 JS (ESM) + JSDoc 타입 주석** | 빌드 스텝 0 → Dockerfile 단순(소스 그대로 실행), .gs 코드 이식 마찰 최소. 타입 안전이 중요한 **저장소 어댑터 인터페이스만 JSDoc `@typedef`로 계약 명시**. (TypeScript 전환은 원하면 2단계 이후 점진 도입 가능) |
| 베이스 이미지 | **`node:22-slim`** (Debian 기반) | 차트 렌더링용 `chartjs-node-canvas`(node-canvas)가 glibc용 prebuilt 바이너리 제공 — alpine(musl)은 네이티브 컴파일 이슈. **한글 차트 라벨** 때문에 이미지에 Noto Sans KR 폰트 포함 필요 (아래 §5). |

### 주요 라이브러리 (외부 의존 최소화)

| 용도 | 라이브러리 | 비고 |
|---|---|---|
| HTTP 서버·정적 서빙 | `express` | |
| Google Sheets | `googleapis` (공식) | 서비스 계정 인증 (§4) |
| 메일(SMTP) | `nodemailer` | HTML+plain 동시 발송 — 현행 `MailApp` 규칙 그대로 |
| 차트 렌더링 | `@napi-rs/canvas` + `chart.js` v4 (구현 시 변경 — §8-1) | QuickChart가 Chart.js 렌더러라 config 이식 용이. 서버에서 PNG 버퍼 생성 → 메일에 `cid:` 인라인 첨부 (외부 유출 0, decisions §2-⑦ 충족) |
| HMAC/base64url | Node 내장 `crypto` | 토큰 형식 유지 → 기존 발급 토큰·클라이언트 그대로 유효 |
| 캘린더 | `googleapis` (calendar v3) | 미러링 엑스트라 — env 미설정 시 silent skip (현행 규칙) |

## 2. 디렉토리 구조 — 이 리포 `server/` 하위

별도 리포 미정이므로 우선 이 리포에서 진행 (`.gs`가 이미 공개 리포에 있어 노출 수준 동일). 사내 GitHub Enterprise 이관 시 `server/` + 정적 파일을 통째로 옮기면 됨.

```
server/
├── Dockerfile              # 빌드 컨텍스트 = 리포 루트 (정적 파일 COPY 위해)
├── README.md               # 로컬 실행 가이드 (docker build/run, env 목록)
├── package.json
├── .env.example            # env 키 목록 (값은 비움 — 비밀값 커밋 금지)
└── src/
    ├── index.js            # 부트스트랩: config 검증 → app 조립 → listen
    ├── app.js              # Express 조립: 정적 서빙(/) + API(/api)
    ├── config.js           # 환경변수 파싱·필수값 검증 (단일 소스)
    ├── routes/
    │   ├── get.js          # GET /api?type=… 15종 디스패치 (doGet 대응)
    │   └── post.js         # POST /api  type 9종 디스패치 (doPost 대응 — 관리자 토큰 게이트 포함)
    ├── handlers/           # type별 핸들러 — .gs의 handle* 함수와 1:1 이식
    │   ├── availability.js #   availability (booked/pending/blocked)
    │   ├── bookings.js     #   bookings 조회 / booking / update / booking_delete / admin_booking_create·edit
    │   ├── roi.js          #   roi_snapshots / roi_snapshot / roi_delete
    │   ├── slotBlocks.js   #   slot_blocks / slot_block / slot_unblock
    │   ├── auth.js         #   auth_request·verify / admin_auth_request·verify
    │   ├── report.js       #   monthly_report_preview / monthly_report_send
    │   ├── appliances.js   #   appliances (APPLIANCES 상수)
    │   └── diagnostics.js  #   mail_status / mail_test / telegram_test / calendar_test
    ├── auth/
    │   ├── token.js        # HMAC-SHA256 서명·검증, 상수시간 비교 (형식 불변)
    │   ├── codes.js        # 6자리 코드 발급·검증·쿨다운·5회 잠금 (TTL 캐시 사용)
    │   └── admins.js       # AUTH_ADMIN_EMAILS / AUTH_TEMP_ADMINS / isTempAdminActive
    ├── store/              # ★ 저장소 어댑터 (§3)
    │   ├── index.js        # 팩토리: STORE_BACKEND env → sheets | dynamo
    │   ├── types.js        # JSDoc @typedef — 인터페이스 계약 (레코드 형태 포함)
    │   ├── memory.js       # 인메모리 구현 (로컬 개발·테스트용, 시트 자격증명 불필요)
    │   ├── sheets/
    │   │   ├── client.js   # googleapis 인증 + 탭 접근 + 헤더 보장(getOrCreateHeaders 이식)
    │   │   ├── bookings.js
    │   │   ├── roi.js
    │   │   ├── slotBlocks.js
    │   │   ├── articles.js
    │   │   └── state.js    # app_state 탭 (Script Properties의 상태값 대체)
    │   └── dynamo/         # 2단계 — 디렉토리·스텁만 (throw 'not implemented')
    ├── mail/
    │   ├── mailer.js       # nodemailer 전송 래퍼 — 발신명 'ThinQ Real' 통일
    │   └── templates/      # .gs 빌더 이식 (인라인 스타일 HTML + plain-text 쌍)
    │       ├── confirm.js  reject.js  adminAlert.js  authCode.js
    │       └── monthlyReport.js
    ├── notify/
    │   ├── teams.js        # MS Teams 워크플로 웹훅 (신규 — env 미설정 시 skip)
    │   └── telegram.js     # 과도기 유지 (env 미설정 시 skip) — Teams 안정화 후 제거
    ├── calendar/
    │   └── google.js       # buildCalendarEvents / syncCalendarUpsert·Delete 이식
    ├── report/
    │   ├── collect.js      # collectMonthlyData (KPI·목적분포·방문이력·ROI·기사)
    │   ├── charts.js       # Chart.js config → PNG 버퍼 (quickChartUrl 대체)
    │   └── articles.js     # 수동 큐레이션 → Serper → CSE 우선순위 + OG 추출·write-back
    ├── jobs/
    │   └── monthlyReport.js # K8s CronJob 엔트리포인트 (동일 이미지, command 오버라이드)
    └── lib/
        ├── dates.js        # KST 정규화(normalizeDate), isLastFridayOfMonth — toISOString 금지 규칙 승계
        ├── ttlCache.js     # 인메모리 TTL 캐시 (CacheService 대체)
        └── constants.js    # SLOT_TIMES / SLOT_LABEL_TEXT / PURPOSE_COLORS / APPLIANCES 등
```

### 정적 서빙 + API 경로 설계

- 컨테이너가 리포 루트의 `index.html` · `thinqreal_admin.html` · `ThinQ_Real_ROI_Tool.html` · `privacy.html` · `images/`를 그대로 서빙 (`express.static`).
- API는 **`/api` 단일 경로**에 현행 `type` 라우팅 그대로 — api-contract.md의 GET 15종 + POST 9종 계약 불변.
- 프론트 수정은 **`SCRIPT_URL` 상수 3곳을 `'/api'` 상대경로로 교체하는 것뿐** (배포 시). 같은 오리진이므로:
  - CORS 문제 자체가 소멸 → 추후 `mode:'no-cors'` 제거하고 응답 확인 방식으로 개선 가능 (1단계에서는 프론트 무변경 원칙 — no-cors 요청도 같은 오리진에서 정상 동작).
  - 단, 1단계 로컬 검증 동안 **라이브 사이트(GitHub Pages + Apps Script)는 그대로 운영** — 프론트의 SCRIPT_URL 교체는 실제 전환 시점(2단계 이후)에 수행. 로컬 검증은 컨테이너가 서빙하는 사본으로 진행.
- `monthly_report_preview`만 예외적으로 `Content-Type: text/html` 반환 (현행 동일).

### Dockerfile 개요

```dockerfile
FROM node:22-slim
# 한글 차트 라벨용 폰트 (chartjs-node-canvas가 시스템 폰트 사용)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
# 정적 프론트 (빌드 컨텍스트 = 리포 루트)
COPY index.html thinqreal_admin.html ThinQ_Real_ROI_Tool.html privacy.html ./public/
COPY images ./public/images
ENV NODE_ENV=production TZ=Asia/Seoul
EXPOSE 8080
CMD ["node", "src/index.js"]
```

- 빌드: `docker build -f server/Dockerfile .` (컨텍스트 = 리포 루트).
- **`TZ=Asia/Seoul` 고정** — 날짜 정규화·회차 시간·마지막 금요일 판정 전부 KST 전제 (현행 스크립트 TZ 규칙 승계).
- CronJob은 **같은 이미지**에 command만 `node src/jobs/monthlyReport.js`로 오버라이드 — 리포트 발송 로직을 HTTP로 노출하지 않고 프로세스로 직접 실행 (수동 발송용 `monthly_report_send` 엔드포인트는 별도 유지).

## 3. 저장소 어댑터 설계

### 원칙

1. **인터페이스는 도메인 연산 단위** — "시트 행 읽기/쓰기"가 아니라 "예약 추가/상태 변경/날짜별 조회". DynamoDB가 자연스럽게 구현할 수 있는 형태로.
2. **레코드 형태는 현행 24컬럼 필드명 그대로** (`id`~`department`, data-schema.md §1) — 핸들러·프론트가 보는 데이터 모양 불변. 값 정규화(날짜 KST 문자열화, slots JSON 등)는 어댑터 내부 책임.
3. **id는 항상 문자열 비교** (현행 규칙 승계).
4. 백엔드 선택은 `STORE_BACKEND` env (`sheets` | `memory` | 추후 `dynamo`) — `store/index.js` 팩토리 한 곳.

### 인터페이스 (JSDoc 계약 — `store/types.js`)

```js
/** @typedef {object} BookingsStore
 *  @property {(id: string) => Promise<Booking|null>} getById
 *  @property {() => Promise<Booking[]>} listAll            // 관리자 표·통계·리포트 집계
 *  @property {(date: string) => Promise<Booking[]>} listByDate  // availability — DynamoDB GSI 대응점
 *  @property {(b: Booking) => Promise<void>} append
 *  @property {(id: string, fields: Partial<Booking>) => Promise<Booking|null>} update
 *                                                          // admin_edit: 편집 가능 필드만 — id·timestamp·privacyConsent 보존은 핸들러 책임
 *  @property {(id: string) => Promise<boolean>} remove
 */
/** @typedef {object} RoiStore        — list() / append(snap) / remove(id) */
/** @typedef {object} SlotBlocksStore — list(date?) / add(block) / removeByDateSlot(date,slot) / removeById(id) */
/** @typedef {object} ArticlesStore   — listByMonth(month) / update(url, fields)  // OG write-back용 */
/** @typedef {object} StateStore      — get(key) / set(key, value)  // monthly_report_last_sent_month 등 */
```

- `listByDate`를 `listAll` 필터로 구현해도 되지만(시트 구현은 실제로 그렇게 함) **인터페이스에 별도 메서드로 분리** — DynamoDB에서 date-GSI 쿼리로 매핑되는 지점을 미리 계약에 반영.
- 월간 리포트의 `YYYY-MM` prefix 집계는 1단계에서 `listAll` 후 필터 (현행과 동일). DynamoDB 전환 시 월 범위 쿼리로 최적화 여지 — 인터페이스 변경 없이 구현 내부에서 처리 가능하도록 소비처를 `listAll` 의존으로 두되, 전환 시 `listByMonth` 추가 검토 (TODO).

### Sheets 구현 (`store/sheets/`)

- **인증: Google 서비스 계정** — JSON 키를 env(`GOOGLE_SERVICE_ACCOUNT_JSON`, 내용 전체 또는 파일 경로)로 주입. **⚠ 운영 준비물: 서비스 계정 생성 + 대상 스프레드시트에 서비스 계정 이메일을 편집자로 공유** (1회, 시트 소유 계정 `kangwonseok0415@gmail.com`에서).
- `getOrCreateHeaders` 이식 — 헤더 24컬럼 보장·자동 append 로직 그대로. 탭 자동 생성(roi_snapshots·slot_blocks·monthly_articles·app_state)도 승계.
- **쓰기 직렬화**: 프로세스 내 간단한 mutex로 쓰기 연산을 순차 실행 — Apps Script의 사실상 단일 스레드 특성을 보존해 행 인덱스 기반 갱신·삭제의 경합 방지. (단일 레플리카 전제 — §6)
- `app_state` 탭 (2컬럼 `key`/`value`, 자동 생성): Script Properties가 담던 **상태값**(`monthly_report_last_sent_month`)의 대체. 설정·비밀값은 env로 가고, 런타임에 변하는 상태만 여기로. DynamoDB 전환 시 단일 테이블 아이템으로 자연 매핑.

### Memory 구현 (`store/memory.js`)

- 시트 자격증명 없이 `docker run` 즉시 기동·엔드포인트 검증 가능하게 하는 로컬 개발·테스트용. 선택적으로 JSON 시드 파일 로드. **1단계 "로컬 실행 가능" 검증의 기본 백엔드** — 시트 연동은 자격증명 준비 후 `STORE_BACKEND=sheets`로 전환 검증.

### TTL 캐시 (CacheService 대체)

- 인증 코드·쿨다운·실패 카운터는 **인메모리 TTL 캐시** (`lib/ttlCache.js`) — 키 패턴·TTL은 data-schema.md §6 그대로.
- **단일 레플리카 전제** (§6). 멀티 레플리카 확장 시 Redis 교체 지점이라는 것을 계약 주석에 명시. 재시작 시 발급 중이던 코드가 소멸하는 것은 허용 (사용자는 재요청하면 됨 — 현행도 20분 TTL).

## 4. 설정·비밀값 — 환경변수 설계 (`.env.example`)

| env | 필수 | 현행 위치 | 비고 |
|---|---|---|---|
| `PORT` | — (기본 8080) | — | |
| `STORE_BACKEND` | — (기본 `memory`) | — | `sheets` \| `memory` |
| `AUTH_SECRET` | ✓ | Script Properties (자동 생성) | **자동 생성 제거, 필수 주입으로 변경** — 컨테이너 재시작마다 새로 생성되면 발급된 토큰이 전부 무효화되기 때문. 현행 Script Properties의 값을 그대로 옮기면 **기존 발급 토큰이 계속 유효** (전환 시 무중단) |
| `SHEET_ID` | sheets 시 ✓ | 코드 상수 | |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | sheets 시 ✓ | (신규) | JSON 내용 또는 파일 경로 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | 메일 기능 시 ✓ | (신규 — MailApp 대체) | 사내 SMTP 정책은 미결(§decisions 4) — 로컬 검증은 MailHog 등 로컬 SMTP로 |
| `ADMIN_ALERT_TO` / `ADMIN_ALERT_CC` | ✓ | 코드 상수 (`ADMIN_EMAILS`/`CC_EMAIL`) | 담당자 3명 + CC |
| `MONTHLY_REPORT_TO` | 리포트 시 ✓ | Script Properties | 콤마 구분 |
| `WIFI_SSID_24G` / `WIFI_SSID_5G` / `WIFI_PASSWORD` / `DOORLOCK_PIN` | 확정메일 시 ✓ | **.gs 하드코딩 (공개 리포!)** | **개선점 — 코드에서 env로 이동.** 확정 메일 빌더가 참조 |
| `TEAMS_WEBHOOK_URL` | — | (신규) | 미설정 시 silent skip |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | — | Script Properties | 과도기 유지, 미설정 시 skip |
| `CALENDAR_ID` | — | Script Properties | 미설정 시 skip. 서비스 계정에 캘린더 쓰기 공유 필요 |
| `SERPER_API_KEY` | — | Script Properties | 미설정 시 CSE 폴백 → 안내문 (현행 우선순위 유지) |
| `GOOGLE_CSE_ID` / `GOOGLE_CSE_KEY` | — | Script Properties | 폴백 보존 |
| `GUIDE_URL` | — (기본 현행값) | 코드 상수 | 도메인 전환 시 env만 교체 |

- 관리자 명단(`AUTH_ADMIN_EMAILS`/`AUTH_TEMP_ADMINS`)은 **코드 상수 유지** (`auth/admins.js`) — 비밀이 아니고(현행 공개 리포에 이미 존재, CLAUDE.md에도 기재), K8s에서 env 변경도 어차피 재배포라 분리 이득 없음. 임시 관리자 만료일 패턴(`YYYY-MM-DDT23:59:59+09:00` KST 파싱)도 그대로 이식.
- `.env.example`에는 키와 설명만 — 값은 절대 커밋하지 않음.

## 5. 기능별 이식 방침 (decisions 대비 1단계 범위)

| 기능 | 1단계 처리 | 비고 |
|---|---|---|
| API 24종 + 인증(HMAC) | **완전 이식** | 계약 불변 — api-contract.md 기준 |
| 메일 빌더 5종 | **완전 이식** (nodemailer) | 인라인 스타일 HTML 규칙·발신명 'ThinQ Real' 유지. 사내 SMTP 세부는 미결이라 SMTP 파라미터만 env로 추상화 |
| 차트 | **내부 렌더링으로 전환** | chartjs-node-canvas + `cid:` 인라인 첨부. 기존 Chart.js config 재사용. 한글 폰트(fonts-noto-cjk) 이미지 포함 |
| 텔레그램 → Teams | **Teams 모듈 신설 + 텔레그램 병존** | 둘 다 env 없으면 skip. 메시지 3종(신규/확정/거절) 동일 포맷. Teams 워크플로 웹훅 URL은 김건우 TL 공유 대기(액션 #6) — 나오기 전까지 스텁으로 두고 로컬은 페이로드 로그로 검증 |
| 캘린더 미러링 | **이식** (googleapis) | 확정=등록/수정=delete+recreate/거절·삭제=제거, 회차별 개별 일정 — 현행 로직 그대로. 서비스 계정 캘린더 공유 필요 |
| 월간 리포트 스케줄 | **CronJob 엔트리포인트 이식** | `isLastFridayOfMonth` + 월 중복 가드(app_state) 그대로. 로컬은 수동 실행으로 검증 |
| 기사 검색·OG 추출 | **이식** | 우선순위(시트 큐레이션→Serper→CSE)·EUC-KR/MS949 재디코딩 포함 (Node `iconv-lite` 또는 내장 TextDecoder) |
| SSO | **범위 밖** | HMAC 유지. `auth/`가 미들웨어로 격리돼 있어 교체 지점 명확 |
| DynamoDB | **범위 밖** (스텁 디렉토리만) | 인터페이스 계약(§3)이 준비물 |

## 6. 전제·리스크 (BE팀 공유 필요)

1. **단일 레플리카 전제** — 인증 코드 캐시가 인메모리, 시트 쓰기 직렬화가 프로세스 내 mutex. 직원용 저트래픽이라 충분하며, HPA/다중 레플리카가 필요해지면 Redis + 분산 락으로 교체 (교체 지점: `lib/ttlCache.js`, `store/sheets/client.js`).
2. **EKS → Google API(Sheets·Calendar) outbound 필요** — 사내망 egress 정책 확인 항목. Serper도 동일 (decisions는 "egress 가능"으로 확인됨).
3. **서비스 계정 준비** — GCP 프로젝트에서 서비스 계정 생성, 시트·캘린더 공유. 시트 소유가 개인 계정인 상태는 DynamoDB 이관 전까지의 과도기로 허용 (decisions §2-⑥).
4. **사내 SMTP 스펙 미결** — 발신 주소 정책·한도 확인 전까지 로컬 SMTP(MailHog)로 검증. 메일 코드는 SMTP 파라미터만 바꾸면 되는 구조.
5. **로컬 검증 중에도 라이브 운영 병행** — 컨테이너 검증이 끝나기 전까지 GitHub Pages + Apps Script 현행 유지. `server/`는 라이브에 영향 없음 (GitHub Pages는 정적 서빙만 하므로 디렉토리 추가 무해).

## 7. 다음 세션으로 넘기는 TODO (범위 밖 기록)

- [x] **구현 착수** — 2026-07-07 동일 세션에서 완료 (§8)
- [ ] **표준 네트워크에서 docker build 정식 검증** — 이 개발 샌드박스는 프록시 정책으로 apt(deb.debian.org)·컨테이너 내 npm이 막혀, 정식 Dockerfile 빌드는 담당자 로컬(또는 사내 빌드 환경)에서 1회 확인 필요. 런타임 자체는 샌드박스에서 컨테이너 기동·엔드포인트 검증 완료 (§8-3)
- [ ] **STORE_BACKEND=sheets 실연동 검증** — 서비스 계정 생성 + 시트 공유 후 (server/README.md 절차)
- [ ] Teams 워크플로 웹훅 URL 수령 후 실제 페이로드 포맷 확정 (김건우 TL, 액션 #6)
- [ ] 서비스 계정 생성 + 시트/캘린더 공유 (운영 1회 작업 — 구현 세션에서 절차 안내)
- [ ] 사내 SMTP 스펙 확인 (발신 주소·표시명 'ThinQ Real' 가능 여부·한도)
- [ ] SSO 요구사항 확인(액션 #4) 후 `auth/` 미들웨어 교체 설계
- [ ] DynamoDB PK/SK·GSI 설계 (DB팀 협의와 병행 — store 인터페이스 §3 기준)
- [ ] 전환 시점에 프론트 `SCRIPT_URL` 3곳 → `/api` 교체 + `no-cors` 제거 검토
- [ ] privacy.html 국외 이전 조항 개정 검토 (데이터가 사내로 완전 이관된 후)

## 8. 구현 결과 (2026-07-07 동일 세션)

`server/` 하위 소스 약 35파일. 설계 §7 순서대로 구현 완료. 실행 방법·구조는 `server/README.md`가 단일 소스.

### 8-1. 설계 대비 변경점

| 항목 | 설계(v1) | 구현 | 이유 |
|---|---|---|---|
| 차트 스택 | chartjs-node-canvas + chart.js | **@napi-rs/canvas + chart.js v4 직접 연동** (`src/report/charts.js`) | chartjs-node-canvas의 `canvas` 의존성은 프리빌드 바이너리를 **GitHub 릴리스에서 다운로드** — 프록시/사내망에서 막히고, 실패 시 cairo 네이티브 빌드로 떨어져 슬림 이미지에서 실패. @napi-rs/canvas는 프리빌드가 **npm 레지스트리 패키지 안에** 있어 npm만 되면 어디서든 설치됨 |
| datalabels 로딩 | (미명시) | 반드시 **ESM 빌드를 직접 import** (`chartjs-plugin-datalabels/dist/….esm.js`) | 기본(main) CJS 빌드는 chart.js를 CJS로 이중 로드 → `instanceof ArcElement` 실패로 도넛 차트 크래시 (이중 패키지 해저드). 코드 주석에도 기록 |
| Dockerfile 베이스 | `node:22-slim` 고정 | `ARG BASE_IMAGE=node:22-slim` | Docker Hub 접근 제한 환경(개발 샌드박스는 `mirror.gcr.io`, 사내는 사내 이미지 저장소)에서 베이스만 교체 가능하게 |
| Outlook 외부 이미지 안내 배너 | (현행 리포트 본문에 존재) | **제거** | 차트가 외부 URL이 아닌 `cid:` 인라인 첨부로 바뀌어 외부 이미지 차단의 영향이 없어짐 |
| 진단 엔드포인트 | 현행 15종 | `teams_test` 1종 추가 (additive) | Teams 웹훅 연동 점검용 — 기존 계약 비파괴 |

### 8-2. 계약 준수 확인 포인트

- GET 15종 + POST 9종 모두 구현, 응답 스키마 현행 유지 (`monthly_report_preview`만 text/html — 현행 동일)
- POST body는 `express.text({type:'*/*'})`로 수신 — 프론트의 `mode:'no-cors'`(text/plain 강제)와 호환
- HMAC 토큰 형식·인증 코드 TTL/쿨다운/5회 잠금 로직 현행 그대로 (기존 AUTH_SECRET 이식 시 발급 토큰 무중단)
- Wi-Fi/도어락은 env로 이동 — **확정 메일 빌더가 config 참조** (.gs의 하드코딩 제거, 리포에 비밀값 0)

### 8-3. 검증 내역 (이 세션에서 실행)

- `node --check` 전 소스 통과, `npm install` 성공 (Node 22.22)
- memory store + 콘솔 메일 모드로 기동 후 curl 검증:
  - `availability` — 확정=마감·대기=카운트·차단 합류 정상 / `bookings` 무토큰 → `unauthorized`
  - 관리자 인증 플로우: 비명단 거부 → 코드 발급(콘솔 로그) → 오코드 실패 카운트 → 정코드 → 토큰 → `bookings` 조회
  - booking POST(text/plain) → 무토큰 update 차단 → 토큰 update(확정, R&D 가전표 메일 확인) → slot_block/unblock → booking_delete
  - ROI 저장/조회, `monthly_report_send` confirm 가드, 진단 4종 not_configured 응답
- 차트 3종(목적 도넛·ROI 가치 도넛·누적 손익 라인) PNG 렌더링 성공, 리포트 미리보기에 data URI 임베드 확인
- **컨테이너 기동 검증**: node:22-slim 기반 이미지로 `docker run` → healthz·availability·정적 index.html·리포트 미리보기 정상. 단, 샌드박스 네트워크 정책(apt·컨테이너 내 npm 차단) 때문에 정식 Dockerfile의 apt/npm 레이어는 표준 네트워크에서 최종 확인 필요 (§7 TODO)

### 8-4. 담당자 검수 피드백 반영 — 리포트 미리보기 글자 깨짐 (커밋 `e3cd1d9`)

담당자가 미리보기 HTML을 파일로 저장해 열었을 때 두 종류의 깨짐 발견 → 원인·수정:

| 증상 | 원인 | 수정 |
|---|---|---|
| Safari에서 본문 전체 모지바케 (Chrome은 정상) | 미리보기가 메일용 `<div>` 조각을 그대로 반환 — HTTP로 볼 땐 응답 헤더가 UTF-8을 알려주지만 **file://로 열면 헤더가 없어** 브라우저가 인코딩을 추측 (Safari가 레거시 한국어 인코딩으로 오추측) | `handlers/report.js` — 미리보기를 `<meta charset="utf-8">` 포함 완전한 HTML 문서로 래핑. 실제 메일은 MIME이 charset을 명시하므로 원래도 무관 |
| 차트 이미지 안 한글만 □ (브라우저 무관) | 차트는 서버에서 PNG로 래스터되므로 **서버에 CJK 폰트가 필요** — 폰트 없는 환경에서 렌더 시 발생 | `report/charts.js` — `registerKoreanFont()` 신설: env `CHART_FONT_PATH` → 도커 fonts-noto-cjk 표준 경로 → 시스템 CJK 스캔 순으로 등록, 미발견 시 경고 로그. Dockerfile에 `CHART_FONT_PATH` 기본값 고정 (이미지에서는 결정적 로딩) |

교훈: 서버 렌더링 산출물(차트 PNG·저장용 HTML)은 **배포 환경의 폰트·인코딩 선언에 의존** — 새 렌더링 산출물 추가 시 이 두 가지를 체크리스트로.

### 8-5. main 병합 + 설문 파이프라인 이식 (2026-07-15)

브랜치 분기 후 main에 추가된 **설문 데이터 파이프라인**(.gs ~350줄: survey_submit·survey_data·survey_update·ledger_update·issue_update + 시트 탭 3종 + 월간 리포트 Phase 5)을 컨테이너에 이식. 병합 규칙: 라이브 파일(HTML 5종·.gs)은 main 채택, `server/`·`docs/migration/`은 브랜치 채택, CLAUDE.md는 양쪽 로그 보존.

| 항목 | 구현 위치 | 비고 |
|---|---|---|
| 상수 (SURVEY/LEDGER/ISSUE_HEADERS·SEVERITY_PCT) | `lib/constants.js` | .gs 배열 그대로 — "새 컬럼은 끝에만" 규칙 주석 포함 |
| SurveyStore 인터페이스 + memory/sheets 구현 | `store/types.js`·`memory.js`·`sheets/index.js` | 행 삭제 연산 없음(명세 §3). 표별 id 컬럼(response_id/ledger_id/issue_id) 공용 헬퍼 |
| 핸들러 5종 | `handlers/survey.js` | 제출=공개, 나머지=관리자 토큰. 파생 규칙(대장 후보·이슈 등록)·attribution_pct 파싱·불변 필드(IMMUTABLE 7종) .gs 동일 |
| est_value 채널 단가 | env `SURVEY_CAS_JSON` | .gs Script Property → env 이식. 미설정 시 공란 (커밋 금지 원칙 유지) |
| 알림 | `notify/` — 텔레그램(.gs 동일) + **Teams 카드 추가** | Teams는 이관 후 메인 채널이라 설문 알림도 카드로 (additive) |
| 월간 리포트 Phase 5 | `report/collect.js`(collectMonthlySurvey) + `mail/templates/monthlyReport.js`(📋 섹션) | try/catch 격리 — 집계 실패가 발송을 막지 않음 |
| 정적 서빙 | `Dockerfile` COPY에 `ThinQ_Real_Visit_Survey.html` 추가 | 컨테이너가 설문 폼도 함께 서빙 |

검증(memory store): 트랙 3종 제출 → 파생 행(대장 2건 % 파싱 50/25·이슈 1건) / 무토큰 차단 / 불변 필드(track) 변경 무시 / 대장 확정(만원) / est_value 더미 단가 계산(0.1×100,000×3,000=30,000,000 정확) / 리포트 📋 섹션 기대값 전부 일치(응답 3·재방문 33%·산입액 3,500만원·이슈 1) / 예약·정적 서빙 회귀 통과.

### 8-6. 사내 K8s 멀티 레플리카 대응 (2026-08-25 — Gitea 원본 확인 후)

Gitea 저장소 원본 검수에서 **HPA min 2 레플리카**가 확인되어(§gitea-repo-contract §10) 단일 레플리카 전제를 코드로 해소:

| 변경 | 파일 | 내용 |
|---|---|---|
| 공유 캐시 | `lib/kvcache.js` (신규) | KVSTORE_ADDR 있으면 Valkey Cluster(`redis` 클라이언트), 없으면 기존 ttlCache 폴백. 키는 `${KVSTORE_PREFIX}:` 접두. 연결 실패 시 경고 후 메모리 강등 |
| 인증 코드 | `auth/codes.js` async 전환 | 발급 pod ≠ 검증 pod여도 동작. 쿨다운·실패 카운트도 공유 |
| 서명 키 공유 | `auth/secret.js` (신규) | AUTH_SECRET env 미주입 시 Valkey get-or-create 공유 키 (SealedSecret 도입 전 임시). env 주입이 항상 우선 |
| 발송 억제 | config `outboundSuppressed` | ENVIRONMENT=kic-st/kic-qa면 메일·텔레그램·Teams 실발송 자동 억제(콘솔/스킵). `OUTBOUND_FORCE_SEND=true`로 해제. kic-op·로컬은 비억제 |
| 메모리 절감 | store/index.js·calendar/google.js | googleapis **동적 import** — memory 백엔드·CALENDAR_ID 미설정 시 미로드 (K8s limit 256Mi 대응) |
| 폰트 | report/charts.js | Alpine `font-noto-cjk` 경로 후보 추가 |

검증: 인증 플로우(발급→오코드 실패카운트→정코드→토큰→쿨다운) 회귀 통과(메모리 경로), ENVIRONMENT=kic-st 부팅 시 억제 로그 3종 확인, 키트 레이아웃(STATIC_DIR=public)으로 기동해 정적 5종·API 서빙 확인. Valkey 실연결은 ST에서 확인(로컬에 Valkey 없음).

**과제 A 키트**: Gitea 원본(Dockerfile·release.yml·deploy) 기준의 적용 완성본 `thinq-real_kit_A.zip` 제작·전달 — alpine Dockerfile(+font), release.yml 테스트 명령 1줄 교체, 병합 package.json(+pg·redis), src 44파일, public/(최신 정적 — original-code는 구버전), KIT-INSTRUCTIONS.md(절차·검증표·ST 동작 특성). 사내 반입 후 절차대로 반영만 하면 됨.

### 8-7. main 재병합 + 신규 기능 전체 이식 (2026-08-25)

라이브 트랙(main)이 병합 기준점(3c8ed88) 이후 126커밋 진행되어 .gs가 3,400→**5,052줄**로 커진 것을 확인 — 문서화된 규칙("전달 전 main 재병합")에 따라 재병합(병합 커밋 e3794e2, CLAUDE.md는 main 신구조 채택 + 이관 로그를 `migration-log.md`로 이전 보존)한 뒤, 신규 ~1,600줄을 컨테이너에 전량 이식했다. 컨테이너 API는 이제 **GET 19종 + POST 29종**.

**이식된 기능 (전부 memory store + 콘솔 메일 모드로 curl 검증 완료)**
- **방문자 현장 설문**: `visitor_submit`(공개·익명)/`visitor_delete` + `visitor_responses` 11컬럼. 정적 6번째 HTML `ThinQ_Real_Visitor_Survey.html` Dockerfile COPY 추가.
- **FieldCheck**: `health_check`(POST, env `FC_API_KEY` fail-closed)/`health_checks`(GET 무인증) + 즉시 알림(FC_IMMEDIATE_ALERT, 현재 꺼짐) + **일일 요약 CronJob** `jobs/fieldcheckSummary.js`(매일 07:40, HTML+평문, 측정 구간 도식 포함).
- **FieldVoice**: `voc_report`(POST, env `FV_API_KEY`, 20KB 상한)/`voc_reports`(GET 관리자 토큰).
- **리포트 큐레이션**: `insight_add/delete/move`(quote 중복 가드·seq 재정렬), `article_add/delete/move`(OG 자동 추출·물리 순서 교환) — ArticlesStore에 listAll/append/remove/move 연산 추가.
- **설문 확장**: SURVEY_HEADERS 42컬럼·LEDGER +`amount_basis`, `survey_delete`(파생 cascade)/`ledger_delete`/`issue_delete`(테스트 정리 전용), `survey_data` 통합 응답 확장(visitors/insights/articles/bestReviewers).
- **베스트 리뷰어**: `best_reviewer_send`(월 3명 한도·재발송 차단·@lge.com 한정·BCC env `BEST_REVIEWER_BCC`, 발송 성공 후 기록) + `best_reviewers` 탭.
- **감사 로그**: `export_log`(이메일은 토큰 payload에서) + `export_log` 탭.
- **ROI pin**: `roi_report_pin` + `roi_snapshots` 응답에 `reportPinnedId` — pin은 app_state 키(`roi_report_snapshot_id`), 지정 없으면 `ROI_FIXED` 폴백.
- **월간 리포트 §8-7 개편판**: 매일 08:30 CronJob이 **첫째 수요일에 전월분** 발송(`isFirstWednesdayOfMonth`+`prevMonthLocal`), 본문 = Executive 3카드(당월+26년 누적+NPS)·사업부별 현황·인사이트/한마디(mdBold)·목적 도넛(내부 렌더 + 막대 폴백)·기사 병합(수동 우선+자동 보충 상한 5, `filterThinqRealItems`, YouTube oEmbed)·ROI 확정 수치. 만족도는 `classifySatisfaction`이 신 0~10 NPS/구 5단계를 **절대 혼합하지 않고** 분리 집계.
- **§8-6 2단계 수동 발송**: 확인 화면 → 일회용 토큰(10분, app_state 저장 — 멀티 레플리카 공유) → 실발송/테스트 발송(`MONTHLY_REPORT_TEST_TO`). 레거시 `confirm=YES`는 발송 없이 안내 화면. `monthly_report_send` 응답이 JSON→**HTML**로 변경됨.
- **설문 초대 자동 발송 CronJob** `jobs/surveyInvite.js`(매일 08:30): 확정+방문일 경과+@lge.com+미발송 → 이메일당 최근 방문 1통, `surveyInviteSentAt`(bookings 25번째 컬럼) 마커로 멱등. `--preview`/`--batch` 모드.
- 신규 탭 store: TableStore 공용 팩토리(memory `makeMemTable` / sheets `makeTable`) — visitors/insights/best/exportLog/health/voc 6종.

**.gs와 의도적으로 다른 점**
- .gs의 자체 PNG 도넛 렌더러(GLYPHS 비트맵·encodePngBytes ~600줄)는 이식하지 않음 — 컨테이너는 기존 chart.js(@napi-rs/canvas) 렌더러 재사용 (같은 목적의 상위 구현).
- Script Properties(발송 토큰·수동 발송 이력·ROI pin) → app_state(store.state)로 — 멀티 레플리카에서도 공유됨.
- `FC_API_KEY`/`FV_API_KEY`/`MONTHLY_REPORT_TEST_TO`/`BEST_REVIEWER_BCC`/`SURVEY_FORM_URL` → env (.env.example 갱신). 도어락 PIN 변경(509067)은 env `DOORLOCK_PIN` 값 교체 사항 — 코드 무관.

### 8-8. 과제 B 구현 — PostgreSQL 어댑터 + 인앱 스케줄러 + 8/26 델타 이식 (2026-09-05)

**① 8/26 라이브 델타 이식**: `article_update`(기사 메타 직접 교정 — ArticlesStore에 `updateMeta` 연산 추가), `decodeHtmlEntities` 16진 엔티티 지원 + 저장분 소급 힐링(getManualArticles 읽기 시점 교정·write-back, survey_data 응답 디코딩), `fetchUrlMeta` 봇 차단 UA 브라우저 재시도(유효 메타 0이면 실패 간주), articles `listAll`에 summary/thumbnail(수정 모달 프리필), FieldCheck 수신자 분리(env `FC_REPORT_EMAILS` — 기본 담당자 3+팀장).

**② 인앱 스케줄러 (`lib/scheduler.js`)** — ⚠ 스펙 대비 변경: K8s CronJob 매니페스트 대신 앱 내부 스케줄러 채택. 이유: release.yml이 deployment.yaml의 이미지 태그만 갱신하므로 CronJob 매니페스트는 릴리스마다 옛 이미지에 고착되고, deploy/ 구조(kustomize·ArgoCD 등록) 수정도 필요해진다. 인앱이면 항상 현재 배포 이미지로 돌고 push 한 번으로 끝. **BE팀 문의 ②(CronJob 등록 방법)는 "불필요해짐"으로 종결 가능.**
- 1분 tick, 5분 발화 창, KST 고정 시각(07:40 FieldCheck 요약 / 08:30 월간 리포트·설문 초대 — Apps Script 트리거와 동일).
- 레플리카 중복 방지: Valkey 일일 락 `kvTryLock`(SET NX EX, TTL 20h — kvcache.js에 신설). 각 잡의 자체 멱등 가드(월 가드·surveyInviteSentAt)와 이중.
- 잡 3종은 `run*Job(store)` 함수로 추출, CLI 직접 실행(`node src/jobs/*.js`)은 `import.meta.url` 가드로 유지. `JOBS_DISABLED=true`로 끔.

**③ PostgreSQL 어댑터 (`store/postgres/`)** — dynamo 스텁 제거·대체. Store 인터페이스 전체 구현.
- 테이블 = 시트 탭 1:1(13종 + app_state), 컬럼명 동일, **전 컬럼 TEXT**(시트 동작 승계 — 핸들러가 이미 전부 변환 수행), `rid BIGSERIAL`이 행 순서 대체, monthly_articles만 `ord BIGINT`(article_move 순서 교환).
- 기동 시 스키마 자동 생성/진화(CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS — ensureHeaders 등가). 읽기 후 JS 정규화(normalizeDate/Month)는 sheets 어댑터와 동일 규칙 유지.
- 접속: env `DB_*` 6종, SSLMODE 'disable'만 ssl off(저장소 샘플 규칙). pg는 동적 import(256Mi 원칙).
- **STORE_BACKEND 자동 감지**: 미지정 시 DB_HOST 있으면 postgres, 없으면 memory — 사내 K8s는 secret이 DB_*를 항상 주입하므로 **deploy 수정 없이 push만으로 영속 저장소 전환**. 명시 지정 우선.

**검증 (로컬 PostgreSQL 16, STORE_BACKEND=postgres 전수 회귀)**: 스키마 자동 생성 14종 / 예약 생명주기(접수→확정→가용성 마감→편집→삭제) / 설문 파이프라인(파생 2종·amount_basis·est_value·cascade 삭제) / 방문자·health(FC키)·voc(FV키+토큰) / 큐레이션(인사이트 move·기사 add/move(ord)/update(16진 디코딩 확인)/delete) / ROI pin(app_state) / export_log / 베스트 리뷰어 재발송 가드 / 리포트 미리보기(PG 데이터·pin 라벨) / 2단계 발송 토큰(app_state 저장 확인) / 잡 CLI 3종 / **재기동 후 데이터 보존·스키마 멱등** / 자동 감지(DB_HOST 유→postgres, 무→memory) / kvTryLock(1회 획득·2회 거부) / memory 백엔드 회귀. 키트 레이아웃(STATIC_DIR=public) 기동 2모드 확인.

**과제 B 키트 v3** (`thinq-real_kit_A_v3.zip`, 스크래치 산출물): src 56파일 + public 6종 최신 + docs/migration + KIT-INSTRUCTIONS v3(적용 5단계·검증표 5항 — postgres 전환·영속성·스케줄러 확인 포함).

### 8-9. 과제 D 설계 — 시트 → PostgreSQL 데이터 이행 (2026-09-15 설계 확정, 키트 v4로 구현 예정)

**목표**: 전환일에 구글 시트 14탭의 실데이터를 OP PostgreSQL로 **1회·무손실·검증 가능**하게 이행한다.

**설계를 결정한 제약**
1. OP DB 수작업 접근은 전용 매체(DB-i/TAAgent)로만 가능 → 적재는 **앱 컨테이너 경유**.
2. 사내 K8s 컨테이너의 Google Sheets API 아웃바운드는 보장 없음(`GOOGLE_SERVICE_ACCOUNT_JSON` 의존) → 컨테이너가 시트를 직접 읽는 방식 **불채택**, 파일 스냅샷 방식.
3. 개인정보(예약자 성명·이메일·방문자 명단·설문 원문) 포함 → 암호 zip 반입, 적재 완료 후 사내 파일 삭제, `export_log`에 이행 이력 기록.

**구조 — 추출(외부) → 적재(사내·앱 경유) → 검증**
- **① 스냅샷 추출 (외부 트랙)**: 14탭 → 탭별 JSON(레코드는 어댑터 필드명 그대로의 평면 객체, `normalizeDate/Month` 규칙 선적용) + `manifest.json`(탭별 행수·id 목록 해시·추출 시각). 암호 zip으로 메일 반입.
- **② 적재 (담당자, 사내 브라우저 — 채택안)**: 관리자 페이지에 「데이터 이행」 패널(숨은 진입) + `POST admin_import`(관리자 토큰 게이트). 탭 단위 청크 업로드 → 서버가 postgres 어댑터의 `insertRow(table, headers, record)` 경로로 삽입(rid = 업로드 순서 = 시트 행 순서 보존, `monthly_articles`는 ord 부여). **dry-run**(건수·충돌만 계산) / **멱등 모드**(같은 id: skip 또는 replace 선택) / 탭 단위 재실행 가능.
  - 채택 이유: 사내 브라우저는 이미 SSO를 통과하므로 별도 예외 경로·curl 불필요, 담당자가 클릭만으로 수행(사내 Claude가 절차 안내). 대안(CLI 잡 + `kubectl cp`)은 pod 파일 반입 권한이 불명확해 보류.
- **③ 검증**: 서버가 적재 후 탭별 행수·id 집합을 manifest와 대조한 리포트 반환(불일치 탭 명시). 담당자는 관리자 페이지 KPI(예약 건수·월별·설문 수)를 라이브 관리자 페이지와 나란히 대조. 설문 `raw_json` 샘플 대조.

**진행 순서**
1. 키트 v4 제작(외부): `admin_import` 핸들러(`handlers/`) + 관리자 이행 패널(`public/thinqreal_admin.html` 컨테이너 전용 분기) + 검증 리포트 + 외부 추출 스크립트(`tools/` — 이미지에 미포함). `api-contract.md`에 `admin_import` 등재.
2. **QA 리허설**: 실데이터 스냅샷을 QA에 적재 → 검증 → replace 모드 재적재로 초기화 (QA는 SSO 뒤·발송 억제라 실데이터 연습 안전).
3. **전환일(D-day)**: T-1 예약 폼 공지(운영 세션 협조) → T-0 라이브 동결(Apps Script 쓰기 차단 플래그 — 운영 세션이 .gs에 추가) → 최종 스냅샷 → OP 적재 → 검증 → 프론트 전환(`thinqreal.com`에 lge.com 안내·리다이렉트, 관리자 북마크 교체) → 구 시트 읽기 전용 보관 → 1주 관찰.

**선행조건**: OP 자원 신청 a~g(브리핑 §3) 완료 · SSO 예외 경로 확정 · **사내 SMTP 확정**(확정 메일 발송 없이는 전환 불가 — BE팀 대기 항목).

**미결 (담당자 판단 대기)**: ⓐ 라이브 동결 시간대·팀 합의(운영 세션 협조 범위) ⓑ 전환 후 `thinqreal.com` 리다이렉트 안내 유지 기간(예: 3개월). 적재 방식(관리자 페이지 업로드)은 2026-09-15 담당자 승인으로 확정.

**⚠ 스펙 대비 변경**: `handoff-to-internal-claude.md` §5 과제 D 원문은 "시트 → PostgreSQL 이행 스크립트"(컨테이너 안 스크립트가 시트를 직접 읽는 전제)였으나, 위 제약 1·2로 **파일 스냅샷 + 관리자 페이지 업로드**로 변경. 앱 계약(`store/types.js`)은 불변 — `admin_import`는 기존 append 경로를 묶어 호출하는 상위 핸들러다.

### 8-10. 하이브리드 에지 설계 — 외부 접점 유지 + 사내 pull 동기화 (2026-09-17 설계, 키트 v4·v5 범위)

**배경**: 사내 인프라는 사내 전용 DNS·SSO로 외부에서 접근 불가(decisions §6-6·§6-7). 외부 호출자 3종(방문객 휴대폰 설문·FieldCheck 장비·FieldVoice)은 사내로 들어올 수 없다.

**구조**
| 흐름 | 외부(현행 유지) | 사내(신규) |
|---|---|---|
| 방문객 설문 | GitHub Pages `ThinQ_Real_Visitor_Survey.html` → Apps Script `visitor_submit` → `visitor_responses` 시트 + 텔레그램(현행) | 스케줄러 잡 `edgeSync`(예: 10분 주기) → Apps Script `survey_data`(관리자 토큰) → visitors 병합 |
| FieldCheck | rig → Apps Script `health_check` → `health_checks` 시트 (rig 설정 무변경) | `health_checks?days=2` pull → 병합 |
| FieldVoice | 파이프라인 → Apps Script `voc_report` (무변경) | `voc_reports?days=2`(관리자 토큰) pull → 병합 |

- **토큰**: 컨테이너가 Apps Script와 **같은 HMAC 서명 방식**(`auth/token.js` 이식)을 쓰므로, env `LEGACY_AUTH_SECRET`(Apps Script의 AUTH_SECRET)만 주입하면 컨테이너가 관리자 토큰을 자체 발급해 `survey_data`·`voc_reports`를 호출할 수 있다 → **.gs 변경 0**. 
- **병합 규칙**: id(response_id·health id·voc id) 기준 멱등 upsert. 사내 관리자 페이지에서의 삭제(`visitor_delete`)는 **delete-through**(같은 토큰으로 Apps Script `visitor_delete` 호출 → 원본도 삭제, 부활 방지).
- **레플리카**: `kvTryLock`으로 잡 중복 방지(스케줄러 기존 패턴).
- **과제 D 관계**: 이행 시 세 탭의 과거분을 1회 적재하고, 이후는 edgeSync가 최신분을 유지. 전환 후에도 이 세 흐름의 원본은 시트(외부)이며 PG는 사내 조회용 미러 — 관리자 페이지·리포트는 PG만 본다.
- **보안 경계**: 인바운드 pull만(사내→외부 GET). 외부에 남는 데이터는 익명 설문·장비 로그·현장 리포트(현행과 동일 위치). 예약·인증·관리자 데이터는 외부로 나가지 않는다.
- **성립 조건·미결**: ① pod 아웃바운드(`egress_check` 실측) — 실패 시 undici `ProxyAgent`로 `HTTPS_PROXY` 경유 ② Apps Script 호출 한도(일 GET 수십 회 — 무해) ③ 텔레그램 알림은 외부(Apps Script)가 계속 담당(중복 방지를 위해 사내 pull은 알림 없음).
- **⚠ 스펙 대비 변경**: decisions §2의 "단일 컨테이너로 완전 대체" 방향 중 **외부 접점 3종은 현행 Google 경로를 존치**하는 것으로 변경 — 사유는 사내 인프라의 외부 비노출(§6-6·§6-7). 대체 불가가 아니라 네트워크 경계 때문이며, 공식 외부 진입점이 생기면 `/pub`로 회귀 가능하도록 `/pub`·SSO 예외를 유지한다.

**구현 (2026-09-17, 키트 v4)**: `jobs/edgeSync.js`(`runEdgeSyncJob`·`deleteLegacyVisitor`·CLI) / `auth/token.js` `signAuthTokenWith(secret, …)` / `config` `legacyAuthSecret`·`legacyAdminEmail`·`edgeSyncEveryMin`(10)·`edgeSyncDays`(3)·`edgeSyncDisabled` / `lib/scheduler.js` 간격 잡(`INTERVAL_JOBS`, 분 단위 슬롯 락) / `handlers/visitors.js` delete-through / GET `edge_sync_now`(ST/QA 토큰 생략). **검증(2서버 통합 — 현행 역할은 컨테이너 자신)**: 1차 동기화 health 1/1·visitors 2/2·voc 1/1 → 2차 추가 0(멱등) → 사내 `visitor_delete` → 원본 감소·`legacyDeleted:true` → 3차 부활 없음 / OP 모드 무토큰 거부 / 스케줄러 "edge-sync 10분 간격" 기동 로그 / CLI. 사내 실측 선행 결과: `egress_check` ok·200·count 45·proxyEnv none (ST, 9/17).
**단계적 사내 검증**: ① `LEGACY_AUTH_SECRET` 없이 배포 → health만 동기화(현행 rig 데이터가 ST DB에 보이면 성립) ② sealed-secret으로 `LEGACY_AUTH_SECRET`(현행 Apps Script Script Property `AUTH_SECRET` 값) 주입 → visitors·voc까지.

### 8-11. 정적 HTML 서빙 시 `SCRIPT_URL` 자동 치환 + ST/QA 인증 코드 peek (2026-09-21, 키트 v4.1)

**발견**: §3의 "프론트 `SCRIPT_URL` 3곳 교체는 전환 시점에" 계획 때문에, 키트로 반입된 `public/`이 라이브 사본 그대로라 **ST/QA/OP가 서빙하는 페이지가 라이브 Apps Script를 호출**하고 있었다. 이 상태로 QA에서 UAT를 하면 운영 시트에 테스트 데이터가 들어가고 담당자에게 실제 알림이 나간다.
**구현**: `lib/htmlRewrite.js` — 정적 미들웨어 앞에서 `.html`(확장자 생략·`/` 포함) 요청을 가로채 `const SCRIPT_URL = 'https://script.google.com/…';` 한 줄을 `'/api'`(`FRONT_API_BASE`)로 치환해 서빙(mtime 캐시, `FRONT_REWRITE=off`로 해제). `public/`은 계속 라이브와 동일 사본 → 정적 동기화는 "복사"만으로 끝나고 전환 시점의 수동 편집 단계가 사라진다. `auth/codes.js` `peekCode` + GET `auth_code_peek`(outboundSuppressed 환경만, OP 404) — 발송 억제 환경에서 LENS 로그 없이 UAT용 인증 코드를 확인.
**검증**: index/admin/확장자 생략/루트 모두 `SCRIPT_URL = '/api'`, `script.google.com` 0건 / privacy(치환 대상 없음) 200 / 없는 파일 404 / QA 모드 `admin_auth_request` → `auth_code_peek` 코드 반환 / OP 모드 peek 404.
**⚠ 스펙 대비 변경**: §3·§7 TODO의 "전환 시점에 프론트 `SCRIPT_URL` 3곳 수동 교체"를 **서빙 시 자동 치환**으로 대체. 이유는 위 발견(사내 환경이 라이브 백엔드를 호출) + 라이브 사본 무수정 유지의 운영 이점. 방문자 설문(`ThinQ_Real_Visitor_Survey.html`)도 컨테이너에서는 `/api`를 향하나, 외부 방문객은 GitHub Pages 사본(하이브리드 에지)을 쓰므로 무관.

### 8-12. 사내 SMTP 적용 — 릴레이(25/무인증) 대응 + 메일 전용 강제 발송 + mail_test 토큰 게이트 (2026-09-27, 키트 v4.4)

**입력**: BE팀 SMTP 가이드(2026-09-23 수령 — 값은 internal-context §2-d): 사내 릴레이 호스트:25, 인증 없음, IP 대신 DNS 이름, 샘플은 평문 SMTP 세션(EHLO → send). 제약: **KIC-QA는 TCP 연결 후 greeting 전에 서버가 끊어 발송 불가**(TCN↔SMTP 방화벽, 해결에 시간 소요), **KIC-ST·KIC-OP는 접수 확인됨**. 결과 판정은 refused_recipients(빈 dict = 접수).
**구현**:
- `config.smtp`에 `ignoreTls`(`SMTP_IGNORE_TLS=true` → STARTTLS 미시도, 가이드 샘플과 동일한 평문 세션) · `rejectUnauthorized`(`SMTP_TLS_REJECT_UNAUTHORIZED`, 기본 false — 사내 자체 서명 허용) · `ehloName`(`SMTP_EHLO_NAME`) · `replyTo`(`MAIL_REPLY_TO`) 추가, 연결·greeting 타임아웃 30초.
- `config.mailForceSend`(`MAIL_FORCE_SEND=true`): 비운영 환경에서 **메일만** 실발송(텔레그램·Teams 억제 유지) — ST에서 SMTP 실측하는 창구. `OUTBOUND_FORCE_SEND`는 전체 해제라 이 용도로 쓰지 않는다.
- `sendMail` 결과에 릴레이 응답(`accepted`/`rejected`/`response`) 동봉 + 로그. `replyTo` 헤더 부착(noreply 발신일 때 담당자 창구).
- `mail_test`: 실발송 환경(OP, 또는 MAIL_FORCE_SEND ST)은 **관리자 토큰 필수**(SSO 뒤라도 아무나 담당자 3인에게 메일을 쏘지 못하게), `to=` 단일 @lge.com 주소 옵션(CC 없음). `mail_status`에 port·ignoreTls·from·replyTo·forceSend 노출.
**검증(로컬, 더미 SMTP 127.0.0.1:1025 평문)**: kic-st + MAIL_FORCE_SEND → `mail_status` smtp 모드 / 무토큰 `unauthorized` / `to=외부주소` `invalid_to` / 토큰+`to=본인` → `accepted:[본인] rejected:[] response:"250 OK"` / kic-qa(강제 없음) → console 모드, 토큰 불필요, 실발송 없음.
**OP 적용 env(비밀 아님 — configmap)**: `SMTP_HOST=<릴레이 DNS>` `SMTP_PORT=25` `SMTP_SECURE=false` `SMTP_IGNORE_TLS=true` `MAIL_FROM=<발신 주소>` `MAIL_REPLY_TO=<담당자 창구>`. USER/PASS 없음.
**미결(BE팀 휴가 후 10/6~)**: ① 발신 주소 정책 — 가이드 샘플은 앱별 noreply 주소(`*-noreply@lge.com`)라 `thinqreal-noreply@lge.com` 형태로 실측(릴레이가 발신을 거부하면 `rejected`/에러로 드러남), 정식 등록 필요 여부 확인 ② 일 발송 한도·첨부 크기(월간 리포트 PNG 인라인) ③ QA 방화벽 해결 시점 — 그 전까지 UAT §9(메일)는 OP 또는 ST(MAIL_FORCE_SEND)에서.
**⚠ 스펙 대비 변경**: §4 env 표의 `SMTP_USER/PASS` 전제(인증 SMTP)를 **무인증 릴레이 기본**으로 전환 — 사유는 가이드. 인증 변수는 남겨 두어 정책 변경 시 재사용.

### 8-13. Valkey TLS(Encryption in transit) 대응 (2026-09-28, 키트 v4.8)

**입력**: DB팀(DBSUPPORT) — 클라우드 영향평가로 OP ElastiCache valkey는 **Encryption in transit(TLS) 활성**으로 생성. 앱 측 수용 가능 여부 문의.
**구현**: `config.kvstore`에 `tls`(`KVSTORE_TLS=true` 또는 주소가 `rediss://`) · `rejectUnauthorized`(`KVSTORE_TLS_REJECT_UNAUTHORIZED`, 기본 true — ElastiCache 인증서는 공인 CA) · `username`/`password`(`KVSTORE_USERNAME`/`KVSTORE_PASSWORD` — AUTH 토큰·RBAC 병행 시, secret) 추가. `lib/kvcache.js`는 `createCluster({ rootNodes:[{url: rediss://…}], defaults:{ socket:{tls, rejectUnauthorized}, username, password } })` — node-redis 문서대로 **클러스터가 알려주는 모든 노드 접속에 `defaults`가 적용**(TLS·자격은 rootNodes가 아니라 defaults에 둬야 함). 미설정 시 기존 평문 `redis://` 그대로 → ST/QA 공용 extapps-kvstore 무영향.
**검증(로컬)**: 문법 통과 / `KVSTORE_ADDR=rediss://` 도달 불가 주소로 기동 → `/healthz` `kv:"connecting"`(기동 차단 없음, 옵션 구성 오류 없음). 실제 TLS 접속은 OP 자원 수령 후 `/healthz` `kv:"shared"`로 실측.
**OP env(g 단계)**: `KVSTORE_ADDR=<configuration endpoint>:<port>` + `KVSTORE_TLS=true`(configmap) / AUTH 토큰이 있으면 `KVSTORE_PASSWORD`(secret). 
**DB팀에 함께 확인할 것**: ① AUTH 토큰·RBAC 사용자도 활성인지(있으면 자격 전달 경로) ② configuration endpoint·포트 ③ 인증서가 Amazon 공인 CA인지(자체 CA면 번들 주입 필요).

### 8-14. 토큰 서명 키 영속화·수렴 — 롤아웃 직후 `bad_signature` 재발 대응 (2026-09-29, 키트 v4.9)

**증상**: OP에서 릴리스 롤아웃 직후 기존 관리자 토큰이 `bad_signature`(9/28·9/29 두 차례). 재로그인하면 잠시 정상.
**원인 후보(둘 다 구조적)**: (a) 서명 키의 유일한 저장소가 Valkey `app:auth-secret`(SET NX, TTL 없음)이라 **공용 kvstore의 축출·재시작으로 키가 사라지면** 새 pod가 새 키를 만들어 기존 토큰 전부 무효 (b) `kvGetOrSet`이 부트 직후 Valkey 연결 실패 시 **조용히 pod별 임시 키를 생성**(폴백)해 pod 간 서명이 어긋남 — 이후 kv 상태는 `shared`로 보여 진단이 안 됨.
**구현**: `auth/secret.js` 재작성 — 우선순위 env → **저장소 `app_state.auth_secret`(영속 원본)** → Valkey `kvGetOrSetShared`(원자적 첫 생성, 연결 실패 시 null — 폴백 생성 금지) → 얻은 값을 app_state에 영속화(read-back으로 경합 수렴) → 임시 키(부트 4회×2초·시도당 5초 상한 후) + 백그라운드 15초 재시도로 얻는 즉시 교체 + 기동 후 60초마다 저장소 값과 대조(재수렴). `index.js`는 store 생성 후 `initSharedAuthSecret(store)`. `/healthz`에 `authSecret: env|db|shared|temp` 노출.
**효과**: 키가 DB에 있으므로 Valkey가 비워져도·롤아웃해도 **토큰이 계속 유효**(90일 TTL 그대로). 임시 키 상태는 healthz로 즉시 보이고 스스로 수렴. SealedSecret으로 `AUTH_SECRET`을 주입하면(env) 이 경로는 자동 우회.
**검증(로컬)**: memory store → `authSecret:"db"` / `AUTH_SECRET` env → `"env"` / Valkey 도달 불가 + memory store → 2초 내 기동·`"db"`(연결 실패가 부트를 막지 않음). 실 Valkey·2 레플리카 수렴은 ST 롤아웃 후 `/healthz` 두 pod 모두 `db` + 기존 토큰 유지로 확인.
**⚠ 스펙 대비 변경**: §8-6의 "서명 키는 Valkey 공유"를 **저장소 영속 + Valkey 중재**로 확장. app_state에 서명 키를 두는 것은 DB 접근 권한이 곧 토큰 위조 권한이 됨을 뜻하나, 동일 DB에 예약·관리자 데이터가 있어 위협 모델이 넓어지지 않음(정식 경로는 여전히 SealedSecret env).

### 8-15. `DB_SCHEMA` — OP Aurora 별도 스키마 대응 (2026-09-29, 키트 v4.11)

**배경**: DB팀이 OP Aurora·valkey 생성과 접속 계정 발급을 완료(9/29 — 값은 사내 전용, 담당자가 사내 Claude에 전달해 internal-context §2-a·§2-b에 기록). 요청서의 "Database Schema" 칸 값이 별도 스키마로 생성됐을 수 있어, 앱이 `CREATE TABLE`을 계정 기본 search_path(보통 public)에 만들면 권한 오류나 엉뚱한 위치 생성이 가능.
**구현**: `config.db.schema`(`DB_SCHEMA`) 지정 시 pg Pool `connect` 이벤트로 모든 커넥션에 `SET search_path TO "<schema>"`, 기동 시 첫 커넥션에서 `current_schema()` 확인 로그(스키마 부재·권한 문제를 기동 단계에서 노출). 미설정 시 동작 불변(ST/QA 공용 DB).
**OP env 확정 목록(절차 g)** — secret(SealedSecret, cert 필요): `DB_HOST`(**Cluster Endpoint의 Writer** — DB팀 안내: 앱은 Cluster Endpoint, DB-i 수동매핑만 Instance Endpoint. Reader 엔드포인트는 미사용) `DB_PORT`(**표준 5432가 아님** — 값은 internal-context §2-a, 반드시 지정) `DB_NAME` `DB_USER`(APP 계정 — Next Spoc 발급 대기) `DB_PASSWORD` / `AUTH_SECRET`(권장 — 있으면 app_state 경로 우회) / `LEGACY_AUTH_SECRET`(하이브리드 에지 2단계). configmap: `DB_SSLMODE=require` `DB_SCHEMA=<스키마명>`(**9/30 확정: DB명과 스키마명이 같은 별도 스키마 — 지정 필요**, 값은 internal-context §2-a) `KVSTORE_ADDR=<Cluster(configuration) endpoint>:6379` `KVSTORE_TLS=true` `KVSTORE_PREFIX=thinq-real` `ADMIN_PAGE_URL=https://thinqreal.lge.com/thinqreal_admin.html`(알림 링크, §8-19). secret 추가: `TEAMS_WEBHOOK_URL`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`(절충안 — 텔레그램은 kic-op에서 비식별 요약 자동). **`KVSTORE_USERNAME`/`KVSTORE_PASSWORD`는 없음** — DB팀 회신(9/30): AUTH·RBAC(User Group) 미사용, 전송 중 암호화만 활성, 서버 인증서는 Amazon 공인 CA(→ `KVSTORE_TLS_REJECT_UNAUTHORIZED` 기본 true 유지). Cluster Mode Enabled(2 nodes/1 shard) — `createCluster` 경로와 일치, 엔드포인트가 `clustercfg.`로 시작. Aurora 17.7 LTS·Single-AZ(템플릿 표준, T-1주 Multi-AZ 요청).
**첫 기동 절차**: APP 계정에 CREATE·ALTER 권한 있음 → 그대로 기동(표 14개 자동 생성). 없음 → `DB_USER/PASSWORD`를 MGR로 1회 기동 → 표 생성 확인(`/healthz backend:postgres`) → APP으로 교체·롤아웃. 이후 컬럼 추가 키트마다 같은 절차.
**선행조건**: ① **DB계정(Next Spoc, 브리핑 §3-d)** — 9/29 확인: DBSUPPORT 티켓은 「DB자원」 범주라 자원 생성까지만이고, APP 계정·권한·**SG 허용**·스키마는 「DB계정」 범주로 별도 창구. 계정과 SG 없이는 값이 있어도 pod가 DB에 닿지 못함. ② OP secret 교체는 SealedSecret 재봉인 → **cert 확보(BE팀, 10/6~)**. 둘 다 끝나기 전엔 OP DB 전환 불가 — 값은 internal-context·55-credentials에 보관만. 위 env 목록의 `DB_USER`는 ①에서 발급되는 APP 계정, `DB_SCHEMA`는 ①의 회신으로 확정.

### 8-16. `db_probe` — pod → RDS·valkey TCP 도달 진단 (2026-09-29, 키트 v4.12)

**배경**: §8-15 선행조건 ①(DB계정·SG 허용)이 끝나도 ②(cert)가 없으면 secret을 넣을 수 없어, "SG가 실제로 pod에 적용됐는가"를 확인할 수단이 없었다. 기존 `egress_check`는 Apps Script 고정. SG 오류는 cert 이후 첫 기동에서야 드러나면 DB팀 왕복이 한 번 더 늘어난다.
**구현**(`handlers/diagnostics.js handleDbProbe`, `routes/get.js`): `net.connect`로 TCP 연결만 열고 즉시 닫는다(인증·프로토콜 없음 → 계정·비밀번호 불필요, configmap·secret 변경 없이 주소창 실측). 대상은 `host=&port=` 지정(**`*.amazonaws.com` 접미사만** — 임의 호스트 스캔 방지) 또는 미지정 시 env의 `DB_HOST:DB_PORT`·`KVSTORE_ADDR`(스킴·자격 제거 후 host:port). 5초 상한. 소켓 에러 코드에 한국어 `hint`(`ETIMEDOUT`=SG 미허용 유력 / `ECONNREFUSED`=포트 / `ENOTFOUND`=DNS·오타 / `EHOSTUNREACH`=라우팅). 호스트 입력은 토큰과 같은 규칙으로 양끝 꺾쇠·따옴표 제거. **응답의 host는 마지막 4레이블만 남기고 마스킹** — 담당자가 결과 JSON을 외부 채팅에 그대로 붙여도 인스턴스명이 새지 않게(사내 식별자 규칙). `clusterCfg`(호스트가 `clustercfg.`로 시작)로 valkey cluster 모드 여부도 함께 판독. 인증 규칙은 `egress_check`와 동일(OP 토큰 필수, ST/QA 생략).
**사용 시점**: Next Spoc(DB계정) 완료 통보 직후 OP에서 RDS 5432·valkey 6379 두 번 호출 → 둘 다 `ok:true`면 cert 이후 첫 기동은 인증·권한 문제만 남는다. `ETIMEDOUT`이면 접속 IP 대역(internal-context §2-c) 재확인 후 DB팀 재요청. 검증(로컬): 허용 외 호스트 거부·포트 검증·env 대상 2종·ECONNREFUSED·ENOTFOUND·연결 성공·OP 무토큰 거부.

### 8-17. 과제 D 구현 — 시트 스냅샷(xlsx) → 저장소 이행 `POST /api/import` + 「데이터 이행」 패널 (2026-09-29, 키트 v5)

**§8-9 설계 대비 확정 사항**
- **입력 = 구글 시트 「파일 → 다운로드 → Microsoft Excel(.xlsx)」 1파일** (13탭 전체, 1행 헤더). §8-9 ①의 "외부 추출 스크립트(탭별 JSON + manifest)"는 **만들지 않는다** — 담당자가 다운로드 한 번으로 끝나고, 현행 `.gs` 변경(운영 세션 협의)도 불필요. manifest 역할은 패널 ① 검사(탭별 행수·고유 id)가 대신한다. Script Properties 2값은 패널 ⑤에서 손입력.
- **적재는 Store 계약 위에서만**: `handlers/importData.js`의 테이블 레지스트리가 13표 각각의 `list/append/remove`를 기존 어댑터 메서드로 묶는다(`bookings.append`·`survey.appendResponse`·`articles.append` 등). 어댑터 수정 없음 → memory/postgres 동일 동작, PG에서는 `insertRow` 경로 그대로(rid = 적재 순서 = 파일 행 순서, articles는 append가 ord 부여).
- **파싱은 서버(exceljs)** — 클라이언트 라이브러리(CDN) 의존을 두지 않기 위해. 새 의존성 `exceljs ^4.4.0`(package.json). 셀 변환 규칙: 숫자→문자열(13자리 id 정수 정확), 날짜 셀→`YYYY-MM-DD`(시각 있으면 ` HH:mm:ss`, exceljs는 UTC 필드가 시트 표시값), 수식→결과, 하이퍼링크→텍스트, 리치텍스트→연결. 날짜·월 컬럼(`date/visit_date/confirmed_date/published_at/month`)은 적재 전 `normalizeDate/Month`.
- **멱등 키** = 표별 id 컬럼, `monthly_articles`만 `month+url`(id 컬럼 없음). `mode=skip`(기본, 재실행 안전) / `replace`(리허설 재적재). 빈 id·파일 내 중복은 건너뛰고 건수로 보고.
- **검증**은 건수 대조를 넘어 id 집합 차이 + 양쪽 있는 행의 컬럼 값 비교(정규화 후) — §8-9 ③의 "raw_json 샘플 대조"를 전 행으로 확장. 초과 행 삭제(`purge_extra`)는 **ST·QA 전용**(kic-op 서버 거부) — OP는 빈 DB에서 시작하므로 초과가 있으면 원인 조사 대상.
- **패널은 서버가 HTML을 직접 서빙**(`GET /api?type=admin_import_page`, `handlers/importPage.js`) — `public/`이나 라이브 `thinqreal_admin.html`에 손대지 않고, GitHub·Gitea의 Dockerfile 차이(정적 파일 복사 방식)에도 영향이 없다. 토큰은 같은 오리진 관리자 페이지의 localStorage 재사용, 모든 호출은 서버 토큰 게이트 재통과. SSO 뒤 `/api`라 사외 비노출, `/pub`에는 마운트하지 않음.
- **본문 상한 40MB**(`express.raw`) — 현행 시트 전체 xlsx는 수 MB 예상. 게이트웨이 상한은 QA 리허설에서 실측(초과 시 413 → 탭을 나눠 두 파일로).

**검증(로컬, memory 백엔드 E2E + Chromium 패널 클릭)**: 페이지 200 / 무토큰 거부 / `/pub/import` 404 / 비xlsx 거부 / inspect(미지 컬럼·빈 id·중복 id·미지 탭 판독) / import skip → 재실행 시 전부 건너뜀 / verify 전 표 일치 / 초과 행 삽입 후 verify `extraInDb:1` → confirm 없이 거부 → `삭제`로 1건 제거 / replace 2건 교체 / state 저장 / 저장값 확인(숫자 id 문자열, Date 셀·"2026. 5. 29." 모두 `YYYY-MM-DD`, ISO timestamp 원문 유지, articles month Date 셀 → `2026-06`). 패널: 검사표 14행·적재·검증 ✓·상태값 저장, 콘솔 오류 없음.

**⚠ 스펙 대비 변경**: §8-9 ① "탭별 JSON + manifest 암호 zip 반입" → xlsx 원본 1파일(암호 zip은 반입 절차의 문제라 담당자가 파일 자체를 암호 zip으로 옮기면 됨, 적재 입력 형식과 무관). §8-9 ② "탭 단위 청크 업로드" → 파일 전체를 매 요청 전송(레플리카 간 상태 공유 불필요, 표 단위 호출은 패널이 순차 수행). §8-9 ② "dry-run" = `inspect`(건수·충돌·헤더 차이). 미결 ⓐⓑ는 그대로.

**남은 것**: QA 리허설(uat-checklist §10) — 게이트웨이 본문 상한·구글 xlsx의 날짜 셀 실제 형식(GAS 자동 변환 잔재) 실측, 큰 탭(`health_checks`) 적재 시간. 전환일 절차는 cutover-plan §2 2·3단계에 반영.

### 8-18. OP 계정 분리 대응 — APP(DML)·MGR(DDL) + 형상 검증 모드 (2026-09-30, 키트 v5.1)

**배경**: Next SPoC 계정 신청 중 DB팀 답변 — 서비스 계정 `thinqreal_APP`에는 **DDL 권한을 부여하지 않음**(표 형상 변경이 서비스 이슈를 낳으므로 DML·조회만이 기본). 형상 변경은 관리자 계정 `thinqreal_MGR`(DB-i 적용 — 사람이 PC에서 접속)로. 컨테이너는 기동 시 `CREATE TABLE IF NOT EXISTS`·`ADD COLUMN IF NOT EXISTS`를 실행하는 설계(§3)였고, PostgreSQL은 IF NOT EXISTS라도 스키마 CREATE 권한·테이블 소유권을 먼저 검사하므로 APP 계정으로는 첫 문장에서 `42501 permission denied`로 기동이 죽는다.
**구현**(`store/postgres/index.js`): `ensureSchema` = ① `applyDdl` 시도 → 성공이면 `schemaMode='ddl'`(ST/QA 소유자 계정, 동작 불변) ② 권한 오류(42501·permission denied·must be owner)면 **형상 검증 모드**: `findSchemaGaps`가 `information_schema.columns`(current_schema)로 상수 대비 테이블 14종·전 컬럼·`monthly_articles.ord`·`app_state` 존재를 대조 → 누락 0이면 `schemaMode='verified'`로 정상 기동, 누락이 있으면 **누락 목록을 담은 오류로 기동 실패**(담당자가 MGR로 `schema-ddl.sql` 또는 델타를 먼저 실행해야 함을 메시지가 말해줌). 권한 외 오류는 종전대로 throw. `/healthz`에 `schema` 필드 추가(`app.js`).
**`docs/migration/schema-ddl.sql`**: 상수에서 생성한 14표 DDL + **APP GRANT**(스키마 USAGE·표 DML·시퀀스 USAGE — `rid BIGSERIAL`의 nextval에 필요) + `ALTER DEFAULT PRIVILEGES`(MGR이 앞으로 만드는 표·시퀀스에 자동 부여) + 델타 절. 치환 2곳(`<스키마명>`·`<APP 계정>`).
**검증(로컬 PostgreSQL 16, 역할 2개 실측)**: ① APP·표 없음 → 기동 실패, 메시지에 누락 14건 ② MGR이 `schema-ddl.sql` 실행 → APP 기동 `schema:"verified"`, `admin_booking_create` INSERT 성공(시퀀스 권한 확인)·조회 일치 ③ 컬럼 1개 삭제 후 APP 기동 → "누락 1건: bookings.applicant" ④ MGR로 기동 → `schema:"ddl"`.
**운영 규칙(gitea-repo-contract에 등재)**: 컬럼·표를 추가하는 키트는 같은 커밋에서 `schema-ddl.sql` 델타를 추가하고, OP 롤아웃 전에 MGR이 델타를 실행. 델타 없이 롤아웃되면 새 pod만 기동 실패하고 롤링 업데이트가 구 pod를 유지하므로 서비스 중단은 없다(단 `/healthz`·Gitea Actions로 감지 필요).
**⚠ 스펙 대비 변경**: §3 "스키마는 기동 시 자동 생성/진화 — 별도 마이그레이션 도구 불필요" → OP에 한해 **MGR 수동 DDL(파일) + 앱 형상 검증**으로 변경. ST/QA는 종전 유지. DB팀 정책이 사유이며, 자동 생성 경로는 코드에 그대로 남아 권한이 있는 환경에서는 여전히 동작한다.

### 8-19. 텔레그램 비식별 요약 모드 — Teams(상세) + 텔레그램(요약) 병행 (2026-10-01 절충안, 키트 v5.2)

**배경**: decisions §⑤는 "텔레그램 → Teams 전환"이었으나, 담당자가 폰 텔레그램으로 즉시 인지하는 운용을 선호. 기술적으로 두 채널 병존은 이미 지원(`notify/index.js`, env 없는 쪽 skip). 걸림돌은 사내 시스템(OP)이 임직원 성명·소속·연락처·주제·고객사를 사외 메신저로 내보내는 모양이 되는 것 → **텔레그램에는 개인정보·사업 정보가 없는 요약만** 보내는 절충안 채택.
**구현**(`config.js`·`notify/telegram.js`): `config.telegram.redact` = `TELEGRAM_REDACT`가 있으면 그 값, 없으면 `ENVIRONMENT==='kic-op'`일 때 true. redact일 때 빌더 3종은 ① 새 예약: 날짜·회차·목적·인원·관리자 링크만 ② 상태 변경: 날짜·회차·목적만(주제·성명 생략) ③ 설문 접수: 트랙·방문일·만족도·파생 건수만(응답자 성명·소속 생략). Teams 카드·메일·관리자 페이지는 종전대로 상세. 관리자 링크는 `ADMIN_PAGE_URL`(기본 thinqreal.com) — **OP configmap에 `ADMIN_PAGE_URL=https://thinqreal.lge.com/thinqreal_admin.html` 필요**(§8-15 configmap 목록 보강).
**검증**: kic-op에서 빌더 3종 출력에 성명·신청자·본부·부서·연락처·주제·고객사 7개 문자열 모두 부재 / kic-st는 종전 상세 유지.
**운영 조건**: pod → api.telegram.org 아웃바운드는 cert 후 `telegram_test`로 실측(차단이면 Teams만). 외부 접점 제출 알림(방문객 설문·FieldCheck·FieldVoice)은 Apps Script가 텔레그램으로 계속 — 방문자 설문은 익명이라 현행 형식 유지.
**⚠ 스펙 대비 변경**: decisions §⑤ "텔레그램 → Teams 웹훅으로 전환" → **병행(텔레그램은 비식별 요약)**. 사유: 담당자 운용 선호 + 개인정보 비노출 조건 충족. 정보보호 점검에서 사외 메신저 전송 자체가 문제되면 `TELEGRAM_*` 미주입으로 즉시 Teams 단독 전환 가능(코드 변경 없음).
