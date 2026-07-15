# ThinQ Real 사내 이관 — 1단계 진행 상태 보고 (2026-07-09)

> 대상: 개발팀 (김건우 TL · 박현정 책임/BE) · 강원석 책임
> 근거 문서: `decisions-2026-07-06.md`(확정 방향) · `stage1-container-design.md`(설계+구현 상세)
> 이 문서는 현재 진행 상태 요약 — 코드/실행 상세는 `server/README.md`, 설계 근거는 `stage1-container-design.md` §8을 참조.

> **📌 2026-07-15 갱신**: 이관 브랜치에 main을 병합해 최신화(설문 폼·ROI v4.6·설문 파이프라인 반영)했고, main에 추가된 **설문 데이터 파이프라인**(엔드포인트 5종 + 시트 탭 3종 + 월간 리포트 설문 지표)을 컨테이너에도 이식 완료. 이제 컨테이너 API는 **GET 16종 + POST 13종** (`survey_data` / `survey_submit`·`survey_update`·`ledger_update`·`issue_update` 추가). 채널 단가는 env `SURVEY_CAS_JSON`. 상세: `stage1-container-design.md` §8-5.

---

## 1. 1단계 작업 정의 및 완료 상태

**작업 정의** (decisions §5): "Google Apps Script를 대체하는 **단일 도커 컨테이너** 형태로 코드 구조를 수정하고, **로컬에서 도커 이미지로 실행 가능**하도록."

| 항목 | 상태 | 비고 |
|------|------|------|
| Apps Script(3,038줄) 전체 기능 이식 | ✅ 완료 | `server/` 하위 ~40개 소스 파일 |
| 정적 프론트 서빙 통합 (단일 컨테이너) | ✅ 완료 | 컨테이너가 index/admin/ROI/privacy + images 함께 서빙 |
| 엔드포인트 계약 유지 (GET 15 + POST 9) | ✅ 완료 | 응답 스키마 현행 그대로, `teams_test` 1종만 추가 |
| 저장소 어댑터 분리 (시트→DynamoDB 교체 가능) | ✅ 완료 | 인터페이스 5종 + `STORE_BACKEND` env 팩토리 |
| 비밀값 환경변수화 (코드·리포 미기재) | ✅ 완료 | Wi-Fi PW·도어락 PIN도 .gs 하드코딩 제거 |
| 로컬 `docker run` 기동·엔드포인트 검증 | ✅ 완료 | memory store + 콘솔 메일 모드로 전 플로우 확인 |
| 정식 `docker build` (apt·npm 레이어) 검증 | ⏳ 개발팀 확인 필요 | 개발 샌드박스 네트워크 정책으로 미확인 — 아래 §4 |

**결론: 1단계 코드화 및 로컬 실행은 완료.** 남은 것은 표준 네트워크에서의 `docker build` 1회 확인뿐(런타임은 이미 검증됨).

---

## 2. 산출물 (개발팀 제공 대상)

핵심 산출물은 **`server/` 디렉토리 전체**입니다. 문서(md)는 설계·계약 자료이고, 실행 코드는 `server/`에 있습니다.

```
server/
├── package.json / package-lock.json   # 의존성 (express·googleapis·nodemailer·iconv-lite
│                                       #   + optional: @napi-rs/canvas·chart.js·datalabels)
├── Dockerfile                          # 단일 컨테이너 (빌드 컨텍스트 = 리포 루트)
├── .env.example                        # 전체 환경변수 키 문서 (값은 비움 — 비밀값 0)
├── README.md                           # 로컬/도커 실행법, sheets 전환 절차, 구조도
└── src/
    ├── index.js / app.js               # 부트스트랩 + Express 조립
    ├── config.js                       # 환경변수 단일 소스 (필수값 검증)
    ├── routes/{get,post}.js            # /api 단일 경로 + type 라우팅, 관리자 토큰 게이트
    ├── handlers/                       # 엔드포인트별 핸들러 (bookings/auth/roi/report/...)
    ├── auth/                           # HMAC 토큰 서명·검증, 6자리 코드, 임시 관리자
    ├── store/                          # 어댑터: memory / sheets / dynamo(스텁) + 팩토리
    ├── mail/                           # nodemailer 래퍼 + 템플릿 5종 (confirm/reject/alert/...)
    ├── report/                         # 월간 리포트: 데이터 수집 + 차트 서버 렌더링 + 발송
    ├── notify/                         # Teams(신규) + telegram(과도기 병존)
    ├── calendar/                       # Google Calendar 미러링 (googleapis v3)
    ├── jobs/monthlyReport.js           # CronJob 엔트리포인트 (K8s에서 command 오버라이드)
    └── lib/                            # 상수(24컬럼 헤더·슬롯·색상) · KST 날짜 · TTL 캐시 · html
```

**⚠ 현재 이 코드는 `claude/magical-babbage-y98vkf` 브랜치에만 있고 main에 미머지 상태입니다.**
개발팀이 접근하려면 아래 중 하나가 필요합니다 (강원석 책임이 결정·수행):
1. 해당 브랜치를 그대로 clone/checkout 하도록 브랜치명 공유, 또는
2. PR을 열어 리뷰 후 main 머지 (머지해도 라이브 무영향 — §5 참조), 또는
3. `server/`만 별도 리포로 분리 (decisions에서 "별도 리포 미정"으로 남겨둔 항목 — 개발팀과 협의)

### 함께 참고할 문서 (docs/migration/)
| 문서 | 용도 |
|------|------|
| `decisions-2026-07-06.md` | 이관 방향 확정 사항 (런타임·도메인·인증·데이터·알림 등) — **최상위 기준** |
| `stage1-container-design.md` | 1단계 설계 근거 + §8 구현 결과(설계 대비 변경점·검증 내역) |
| `api-contract.md` | 엔드포인트 24종 입출력 스펙 (백엔드 재구현 설계서) |
| `data-schema.md` | bookings 24컬럼 + 부가 시트 + Script Properties/캐시 키 |
| `dependency-inventory.md` | Apps Script API 사용처 → 대체 매핑, 외부 서비스 outbound 검토 |

---

## 3. 이번 주 검토 항목별 상태

### 3-1. 리포트 차트 렌더링 ✅ 구현 완료
- 기존 **QuickChart(외부 URL)** → **컨테이너 내부 렌더링**으로 전환 (`@napi-rs/canvas` + `chart.js` v4). 데이터가 외부로 나가지 않음 (decisions §2-⑦ 충족).
- 차트 3종: 방문 목적 도넛 / ROI 가치 비중 도넛 / 연도별 누적 손익 라인.
- **메일 삽입 방식**: `cid:` 인라인 첨부 (별도 이미지 파트) — 메일 HTML 본문은 가볍게 유지. 미리보기(브라우저)만 `data:` URI.
- 담당자 검수에서 발견된 **글자 깨짐 수정 완료**: ① 미리보기 charset 선언 추가(사파리 모지바케 해소) ② 차트 한글 폰트 등록 + Dockerfile에 폰트 경로 고정(차트 내 □ 해소). 커밋 `e3cd1d9`.

### 3-2. Google 캘린더 API 연동 — 코드 이식 완료, 실동작 검증 대기 (급하지 않음)
- `CalendarApp`(Apps Script) → **googleapis(calendar v3) + 서비스 계정(JWT)** 이식 완료.
- **전체 라이프사이클**: 확정→일정 생성 / 수정→갱신(delete+recreate) / 거절·삭제→제거.
- **회차별 개별 일정** (회차 사이 재정비·점심 공백 때문에 묶지 않음).
- **개인정보 최소 표기**: 일정에 목적·주제·고객사·회차·인원·책임자·활용방안 + 위치만. 방문자 명단·연락처는 **미표기** (처리방침 준수, 의도적).
- 점검 엔드포인트 `?type=calendar_test` 있음.
- **실동작에 필요한 것** (서비스 계정 준비 후 — 시트 실연동과 묶어 1회에): ① 서비스 계정 발급 ② 대상 캘린더에 "일정 변경 권한" 공유 ③ `CALENDAR_ID` env 설정.
- 방향은 확정됨 (decisions: "구글 캘린더는 API 미러링용 엑스트라로 유지"). `CALENDAR_ID` 미설정 시 silent skip이라 다른 기능을 막지 않음.

---

## 4. 개발팀 액션 아이템

| # | 항목 | 담당 | 비고 |
|---|------|------|------|
| 1 | 표준 네트워크에서 `docker build -f server/Dockerfile .` 1회 검증 | 개발팀 | 샌드박스는 apt·컨테이너 내 npm 차단으로 미확인. 런타임은 검증됨 |
| 2 | 서비스 계정 발급 + 시트/캘린더 공유 → `STORE_BACKEND=sheets` 실연동 검증 | 개발팀+운영 | 캘린더 검증도 여기 포함 |
| 3 | MS Teams 워크플로 웹훅 URL 공유 → 페이로드 확정 | 김건우 TL | 나오기 전까진 스텁+로그로 검증 |
| 4 | 사내 SMTP 스펙(발신 주소·한도) 확인 | 개발팀 | 메일 코드는 SMTP 파라미터만 교체하면 됨 |
| 5 | 사내 SSO(팀즈 기반) 요구사항 확인 → auth 미들웨어 교체 설계 | 개발팀 | 현재는 HMAC 토큰 유지 (클라이언트 무변경) |
| 6 | DynamoDB PK/SK·GSI 설계 (DB팀 협의) | 개발팀+DB팀 | 어댑터 인터페이스는 준비됨 (`store/dynamo` 스텁) |
| 7 | `server/` 접근 방법 결정 (브랜치 공유 / PR 머지 / 별도 리포) | 강원석+개발팀 | §2 참조 |

---

## 5. 라이브 시스템 무영향 (확인됨)

- 이 작업은 `server/` **신규 추가 + docs/ 문서**뿐 — 라이브 파일(index.html·thinqreal_admin.html·ThinQReal_AppScript.gs·images/)은 **1바이트도 변경하지 않음**.
- GitHub Pages는 정적 파일만 서빙하므로, 브랜치를 main에 머지해도 `server/` 디렉토리가 추가될 뿐 사이트 동작은 불변 (코드 노출 수준은 기존 `.gs`와 동일, 비밀값 0).
- 프론트의 `SCRIPT_URL`(Apps Script → `/api`) 교체는 **실제 전환 시점(2단계 이후)에만** 수행 — 지금은 현행 운영 유지.

---

## 6. 참고 — 로컬 실행 방법 (요약)

상세는 `server/README.md`. 자격증명 없이 즉시 기동 가능 (memory store + 콘솔 메일):

```bash
# (A) Node 직접 실행
cd server && npm install && AUTH_SECRET=dev-secret npm start
# → http://localhost:8080 (정적 프론트 + /api)

# (B) 도커
docker build -f server/Dockerfile -t thinqreal:local .
docker run --rm -p 8080:8080 --env-file server/.env thinqreal:local
# Docker Hub 제한 환경: --build-arg BASE_IMAGE=mirror.gcr.io/library/node:22-slim
```
