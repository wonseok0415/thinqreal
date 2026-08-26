# 사내 이관 트랙 — 세션 로그 (외부 Claude 세션 기록)

> CLAUDE.md 전면 개편(2026-08 — 로그는 docs/history.md로 분리) 이전까지 CLAUDE.md에 쌓였던
> **이관 전용 세션 로그**를 이 파일로 이전 보존한다. 이후 이관 세션 로그도 여기에 append.
> 결정·계약의 단일 소스는 decisions-2026-07-06.md · gitea-repo-contract.md · stage1-container-design.md.

## 작업 내역 (2026-07-07 — 사내 이관 방향 확정 기록)

2026-07-06 개발팀 회의(김건우 Task Leader·박현정 책임(BE팀)·강원석 책임)로 사내 인프라 이관 방향이 확정됨. **상세는 `docs/migration/decisions-2026-07-06.md`가 단일 소스** — 이관 관련 작업은 반드시 이 문서를 먼저 읽을 것.

### 확정 요약
- **런타임**: 프론트(정적) + 백엔드를 **단일 도커 컨테이너**로 통합 → 쿠버네티스(EKS) 배포. 1단계 = Apps Script 대체 컨테이너를 로컬 `docker run` 가능한 상태로 (강원석 담당).
- **도메인**: `thinqreal.lge.com` (사내). 기존 `thinqreal.com`은 갱신 유지 안 함.
- **인증**: 사내 SSO(팀즈 기반) 우선 검토 — 인증 후 헤더의 사용자 이메일로 관리자 판별은 뒷단 서버가 처리.
- **데이터**: 사내 DB(DynamoDB 우선 검토, DB팀 협의 필요). **DB 자원 생성 전까지 구글 스프레드시트 유지하며 점진 이관.** 구글 캘린더는 API 미러링용 엑스트라로 유지.
- **알림**: 텔레그램 → MS Teams 워크플로 웹훅. **메일**: 사내 SMTP. **차트**: QuickChart → 오픈소스 라이브러리 서버 내부 렌더링. **스케줄**: Apps Script 트리거 → K8s CronJob. **기사 검색**: Serper 현행 유지.
- **확장**: 창원 등 타 사이트는 통합하지 않고 사이트별 별개 운영.

### 세션 운영 원칙 (혼선 방지)
- **이관 작업은 전용 세션에서 진행** — 운영 유지보수(현행 사이트 수정)와 채팅을 분리한다. 이관 세션은 `docs/migration/decisions-2026-07-06.md` §5(1단계 작업 정의)부터 시작.
- 현행 시스템(GitHub Pages + Apps Script)은 이관 완료 전까지 정상 운영·수정 지속 — 두 트랙이 병행된다.
- 이관 세션에서 결정·진행된 사항도 이 CLAUDE.md 또는 docs/migration/에 기록해 세션 간 맥락을 잇는다.

## 작업 내역 (2026-07-07 — 이관 1단계 설계안 작성 + 구현 완료)

이관 전용 세션 1회차. 설계안 작성 후 같은 세션에서 담당자 승인을 받아 **구현까지 완료** — 코드는 `server/` 하위, 설계·구현 결과는 `docs/migration/stage1-container-design.md`(§8 구현 결과 포함), 실행 가이드는 `server/README.md`가 단일 소스.

### ⚠ 라이브 시스템 무영향 (두 트랙 분리 확인됨)
- 이 작업은 `server/` 디렉토리 **신규 추가 + docs/ 문서**뿐 — 라이브 파일(index.html·thinqreal_admin.html·ThinQReal_AppScript.gs·images/)은 1바이트도 변경하지 않음.
- GitHub Pages는 main 브랜치를 서빙하므로 이관 브랜치가 머지되기 전까지 라이브에 아무 영향 없음. 머지 후에도 `server/`는 정적 파일로 서빙될 뿐(코드 노출 수준은 기존 .gs와 동일, 비밀값 0) 사이트 동작 불변.
- 현행 운영(GitHub Pages + Apps Script)은 이관 완료 전까지 그대로 지속 — 프론트 `SCRIPT_URL` 교체는 실제 전환 시점에만.

### 구현 검증 내역 (2026-07-07 세션)
- memory store + 콘솔 메일 모드로 전 엔드포인트 curl 검증: 인증 플로우(코드→토큰→보호 API), 예약 생애주기(신청→확정→차단→삭제), ROI, 리포트 미리보기(차트 3종 서버 렌더링 임베드), 진단 4종.
- node:22-slim 컨테이너에서 `docker run` 기동 검증 완료. 단 **정식 Dockerfile의 apt/npm 레이어는 개발 샌드박스 네트워크 정책으로 최종 확인 못함** → 담당자 로컬에서 `docker build -f server/Dockerfile .` 1회 확인 필요 (설계 문서 §7 TODO).
- 차트 스택은 설계의 chartjs-node-canvas 대신 **@napi-rs/canvas + chart.js v4** (프리빌드가 npm 레지스트리에 내장 — 사내망/프록시 안전). datalabels 플러그인은 반드시 ESM 빌드로 import (CJS면 도넛 크래시 — charts.js 주석 참조).
- **담당자 검수 피드백 — 미리보기 글자 깨짐 수정 (커밋 `e3cd1d9`)**: ① 미리보기 HTML을 `<meta charset="utf-8">` 포함 완전한 문서로 래핑 (file://로 열면 HTTP charset 헤더가 없어 Safari가 인코딩 오추측) ② 차트는 서버 래스터라 CJK 폰트 필수 — `registerKoreanFont()`(env `CHART_FONT_PATH` → 도커 fonts-noto-cjk → 시스템 스캔) + Dockerfile에 `CHART_FONT_PATH` 고정. 상세는 설계 문서 §8-4.

### 설계 요지
- **런타임**: Node.js 22 LTS + Express, 플레인 JS(ESM) + JSDoc — 현행 .gs 3,038줄(특히 메일 빌더 ~1,200줄)이 JS라 거의 그대로 이식되는 것이 핵심 근거. 빌드 스텝 0. 베이스 이미지 `node:22-slim` + 한글 차트 폰트(fonts-noto-cjk).
- **구조**: 이 리포 `server/` 하위 (별도 리포 미정). API는 `/api` 단일 경로에 현행 `type` 라우팅 그대로 → 프론트 수정은 전환 시점에 `SCRIPT_URL` 3곳만. 정적 파일은 컨테이너가 함께 서빙 (Dockerfile 빌드 컨텍스트 = 리포 루트).
- **저장소 어댑터**: 도메인 연산 단위 인터페이스 5종(Bookings/Roi/SlotBlocks/Articles/State) + `STORE_BACKEND` env 팩토리. 구현체 `memory`(로컬 검증용) → `sheets`(서비스 계정 인증) → `dynamo`(2단계 스텁). 레코드는 현행 24컬럼 필드명 그대로. Script Properties 상태값은 `app_state` 시트 탭으로.
- **비밀값 전부 env로**: `AUTH_SECRET`은 자동 생성 제거·필수 주입 (현행 값 이식 시 기존 토큰 무중단). **Wi-Fi PW·도어락 PIN도 .gs 하드코딩 → env로 이동 (개선점)**.
- **전제**: 단일 레플리카 (인메모리 TTL 캐시 + 프로세스 내 쓰기 mutex — 멀티 레플리카 시 Redis 교체 지점 명시).

### 다음 이관 세션
- 설계 문서 §7 TODO 참조: ① 표준 네트워크에서 `docker build` 정식 검증 ② 서비스 계정 생성 + 시트 공유 후 `STORE_BACKEND=sheets` 실연동 검증 ③ Teams 웹훅 URL 수령 후 페이로드 확정 ④ 사내 SMTP 스펙 ⑤ SSO 검토 ⑥ DynamoDB 설계.

## 작업 내역 (2026-07-07 — 예약 폼 활용 방안·기대 효과 최소 글자 수)

형식적인 한두 줄 신청 방지 요청 반영 (index.html만 변경 — Apps Script 재배포 불필요).

- `MIN_DETAIL_LEN = 30` 상수 신설 (`MAX_VISITORS` 아래). 활용 방안(`fUsagePlan`, b2b 카테고리에선 라벨이 '방문 목적 (구체적)')과 기대 효과(`fExpectedEffect`)가 **30자 미만이면 제출 차단** + "N자 이상 작성해 주세요 (현재 N자)" 토스트. 안내 문구는 카테고리별 라벨(`cfg.usagePlanLabel`)에서 괄호·별표를 제거해 동적 생성.
- **관리자 이력 추가/수정 폼에는 미적용** — 이력 백필은 부분 입력 후 보강이 의도된 동작.
- 기준 글자 수 변경 시 `MIN_DETAIL_LEN` 상수만 수정.

## 작업 내역 (2026-07-09 — ROI 툴 v4.6 교체 (설문 연계 개편))

claude.ai ROI 세션에서 개편된 `ThinQ_ROI_Tool_v46.html`을 리포 `ThinQ_Real_ROI_Tool.html`로 교체. 단순 교체가 아니라 **리포 전용 변경을 보존하는 병합**으로 진행 — 업로드본에는 리포에서 추가했던 기능들이 없었음.

### 병합 방식 (v4.6 베이스 + 리포 전용 변경 이식)
- **v4.6 신규 (채택)**: 카테고리 6→5개(HS/ES 상품기획 삭제 — 기획 검증 가치는 V_R&D로 일원화, 이중계산 방지) / 기여 영업이익 2단계 계산(딜 영업이익 → 귀속분) + 카드별 상태줄(집계 전/부분/산입/파이프라인) / **딜 단계 select** — 미확정 딜은 단계 확률(초기10/제안25/협상50/우선협상75%)로 파이프라인 층위 분리(ROI 미산입·참고 병기) / 이익률 기본값 4.9%(HS사업본부 공시, `DEFAULT_MARGIN`) / V_Quality(품질 가치) 모달 — IoT 한정·미산입·공시 폴백 2.8만원 표현 / 카테고리 입력 라벨이 설문 Track A·B·C 데이터 소스 표기.
- **리포 전용 (보존·이식)**: 다크 올리브 디자인 시스템(팔레트·Inter 폰트·차트 색·전 색상 스윕) / 모바일 media query / **시나리오 스냅샷 저장/불러오기 전체**(CSS·툴바 버튼·패널·다이얼로그·JS, Apps Script `roi_snapshots` 연동).
- **스냅샷 ↔ v4.6 호환 확장**: `collectInputs/applyInputs`에 `stage` 필드 추가(옛 스냅샷은 stage 없음 → 100(확정)으로 복원), `collectOutputs`는 확정(stage 100%)만 `vSalesContrib` 산입 + `vPipeline` 별도 키 저장. 월간 리포트가 읽는 outputs 키(vRnD/vSalesInfra/vSalesContrib/vPR/totalCost)는 불변.
- `ROI_BUILD` 토큰 `20260519a` → `20260709a` (iframe 캐시 무력화).

### 데이터 분류·배포 원칙 (설문 명세 §6.5에서 전입 — 필독)
- 리포는 **퍼블릭** — Pages 배포 여부와 무관하게 커밋 즉시 공개, git 히스토리는 영구 보존. **커밋 전 민감 단가 grep 필수**:
  `grep -rnE "6,220|34,220|114,220|108,000|659원|16,126|Hi-Teleservice|헤이홈" <대상 파일>` → 0건이어야 커밋.
- 커밋 금지: CS 채널별 실단가, 판매량·CS 원단위 실사례, 딜·수주 실데이터, 대장의 실제 과제명·금액, 보고 PPT·사내 메일.
- 커밋 가능: 계산 로직·UI 코드, 공시 기반 수치(HS 4.9%), 방법론 표준값(100만원/일, 단계 앵커), 공시 폴백(출장점검료 약 2.8만원).
- `ThinQ_Real_ROI_Tool.html`은 Pages 배포에서 **제외되지 않음**(리포 루트 전체 서빙 + 관리자 iframe이 로드) — 보호는 파일 제외가 아니라 **내용 수준**(민감 수치 미포함)으로 한다. v4.6은 실단가 안전화 완료본.

### 다음 작업 (설문 데이터 파이프라인 — `ThinQReal_Survey_DB_Spec.md` 기준, 미착수)
**→ 2026-07-09 후속 세션에서 Phase 1~4 구현 완료 (아래 작업 내역 참조). Phase 5(월간 리포트 연계)만 잔여.**
설문 mailto 방식 → 예약과 동일한 fetch POST → Apps Script → Sheets 적재 구조로 전환. Phase 1~5: ① Sheets 신규 탭 3종(survey_responses·performance_ledger·iot_issue_log) + `handleSurveySubmit` ② 설문 HTML fetch 전환(+mailto 폴백, 문구 2건) ③ 파생 행 생성 + Telegram ④ 관리자 「설문·대장」 탭(조회·상태 전환 — 행 삭제 없음) ⑤ 재방문율·월간 집계. 파괴적 작업은 verifyAdminToken 게이트, 제출은 공개 경로(토큰 불요). privacy.html에 설문 수집 고지 추가 필요. 명세 파일은 세션 업로드본 기준 — 리포 미커밋.

## 작업 내역 (2026-07-09 후속 — 설문 데이터 파이프라인 Phase 1~4 구현)

`ThinQReal_Survey_DB_Spec.md`(세션 업로드본) 기준. Phase 5(월간 리포트 설문 지표 연계)만 잔여.

### A. Apps Script (재배포 필요)
- **시트 3종 자동 생성**: `survey_responses`(34컬럼)·`performance_ledger`(15컬럼)·`iot_issue_log`(9컬럼) — `getNamedSheet(name, headers)` 공용 헬퍼 (getRoiSheet 패턴, 올리브 헤더). 컬럼 정의는 `SURVEY_HEADERS`/`LEDGER_HEADERS`/`ISSUE_HEADERS` 상수가 단일 소스.
- **`POST type:survey_submit`** (공개 — 토큰 불요, booking과 동일): 원본 append(raw_json 포함) + 파생 행 생성 + 텔레그램. track 검증(sales/media/etc).
- **파생 규칙**: Track B "특정 캠페인·프로모션과 연결됨" → 대장 `홍보·광고 마케팅` / Track C "신규 Task·과제" → 대장 `신규 Task·기타` (status=후보, `attribution_pct`는 라디오 원문 괄호 `(N%)` 파싱). Track C "발견함" → 이슈 로그(status=등록, symptom=상세 원문).
- **`GET ?type=survey_data&token=`** (관리자 토큰 필수): {responses, ledger, issues} 통합 반환 — 명세의 survey_list/ledger_list/issue_list를 1회 호출로 합침(콜드 스타트 1회).
- **`POST type:ledger_update / issue_update`** (관리자 토큰 게이트): 상태 전환·필드 갱신만. **행 삭제 엔드포인트는 의도적으로 없음** — 드롭·기각도 상태로만 (명세 §3).
- **est_value 서버 계산**: severity(높음50%/가끔10%/드묾1%)·channel·q_ship 3종 모두 있을 때만. **채널 단가는 Script Property `SURVEY_CAS_JSON`에만** — 형식 `{"원격":N,"내방":N,"출장":N}` (원 단위, 실제 값은 콘솔에서 입력 — §6.5 커밋 금지 원칙). 미설정 시 est_value 공란(참고용·ROI 미산입이라 무해).

### B. 설문 HTML (`ThinQ_Real_Visit_Survey.html` — 리포 신규 추가)
- 업로드 기준본(문구 2건·성과 연결 카드·상품기획 제거 반영됨) + **fetch 전환**: `submitForm()`이 no-cors POST(index.html 검증 패턴) → 성공 시 `successCard`(감사+사은품 재노출), 실패(네트워크 차단) 시 `submitViaMail()` mailto 폴백 + `fallbackNote` 안내. 구조화 페이로드는 `buildPayload()`(rawRadio/rawChecks/rawText — 미응답은 빈 문자열).
- 공개 URL(`thinqreal.com/ThinQ_Real_Visit_Survey.html`) — 메인 게이트 미적용(설문은 비보호 의도, privacy.html 고지로 커버).

### C. 관리자 「설문·대장」 탭 (분석 섹션, nav-survey)
- 헤더: **설문 링크 복사 + 설문 폼 새 창 열기** (ROI 탭 패턴). 툴바: 트랙·월 필터 + 새로고침.
- KPI 4종: 응답 수(트랙 분포) / 재방문 응답률(첫·2·3~5·6+ 분포) / 대장(후보·확정·드롭) / 이슈 수.
- 설문 응답 테이블 → 행 클릭 상세 모달(`surveyModalBg`, 조회용 — 백드롭 닫기 바인딩). 성과연결 📒 / 이슈 ⚠ 마커.
- 대장 테이블: 확정/드롭 버튼 → `ledgerModalBg` **입력 폼 모달(백드롭 미바인딩 원칙)**. **확정 금액 단위 = 만원.** "ROI 반영" 체크는 수동 표시(ROI 툴 이중 기입 방지용) — 확정 상태에서만 활성.
- 이슈 테이블: 기기/심각도/채널/목표 수량/상태 행 단위 저장 → 서버 est_value 계산 → 1.5초 후 자동 재조회로 반영.
- 데이터는 탭 첫 진입 시 fetch + 메모리 캐시(`surveyData`), 새로고침 버튼으로 갱신. localStorage 캐시 없음(예약 대비 저빈도).

### D. privacy.html
- §1 수집 항목(방문 후기 설문 행) / §2 목적(설문) / §3 보유 기간(**설문 응답 — 방문일로부터 3년**, 예약과 동일 기준) 추가.

### 재배포 후 확인 절차
1. Apps Script 재배포("배포 관리 → 편집 → 새 버전 → 배포") → 2. 설문 폼에서 테스트 1건 제출(R&D 트랙 + 이슈 '발견함' + 성과 연결 선택 권장) → 3. 시트 3종 행 생성·텔레그램 수신 확인 → 4. 관리자 설문·대장 탭에서 조회·확정/드롭·이슈 저장 동작 확인 → 5. (선택) `SURVEY_CAS_JSON` Script Property 입력 후 est_value 계산 확인.

### 핵심 제약 (다음 세션에서도 유지)
- 설문·대장·이슈에 **행 삭제 기능을 만들지 말 것** — 드롭/기각 상태 전환으로만 (감사 추적 보존).
- **채널 단가(C_AS)는 코드·리포 어디에도 쓰지 말 것** — `SURVEY_CAS_JSON` Script Property가 유일한 위치. 커밋 전 민감 단가 grep(§6.5) 습관 유지.
- 대장 `confirmed_amount`는 **만원 단위** — ROI 툴 반영 시 단위 환산 주의 (ROI 툴 pipe 입력은 백만원 단위).
- 설문 제출(survey_submit)은 공개 경로 유지 — 관리자 토큰 게이트에 넣지 말 것 (응답자는 토큰이 없음).

## 작업 내역 (2026-07-14 — 설문·대장 탭 수정 기능 + 설문 폼 성과 연결 버그 수정)

### A. 설문 폼 성과 연결 상세 칸 버그 수정 (ThinQ_Real_Visit_Survey.html, PR #28)
- **증상**: Track B/C의 7번 성과 연결에서 "연결됨/신규 과제" 선택 시 "아래 항목을 적어주세요"라는데 입력 칸이 안 나타남.
- **원인**: 커스텀 옵션 클릭 핸들러가 `input.checked = true`를 먼저 설정 → 라벨 기본 동작 시점엔 이미 체크 상태라 `change` 이벤트 미발생 → 상세 칸 표시 토글이 실행 안 됨.
- **수정**: 표시 갱신을 `updateLinkDetails()`로 분리하고 옵션 클릭 핸들러에서 직접 호출 (change 리스너는 키보드 대비 유지). **교훈: 커스텀 옵션 UI에서 조건부 표시를 라디오 change 이벤트에만 의존하지 말 것.**

### B. 관리자 설문·대장 탭 — 수정(오탈자·내용 정정) 기능 (Apps Script + thinqreal_admin.html, 재배포 필요)
담당자가 설문 응답·대장·이슈의 오탈자와 내용을 관리자 페이지에서 직접 정정할 수 있게 함.
- **`POST type:survey_update` 신설** (관리자 토큰 게이트): response_id로 행을 찾아 필드 갱신. **불변 필드**: `response_id/submitted_at/track/raw_json`(제출 원문 증빙) + **파생 트리거 3종 `media_link/etc_link/iot_defect`** — 제출 시점에만 대장·이슈 행을 생성하므로 사후 변경 시 파생 행과 어긋남. 연결 오류는 대장 드롭/이슈 기각으로 처리.
- **`ledger_update` EDITABLE 확장**: 기존 상태 필드 5종에 내용 필드 7종 추가(`category/project_name/expected_scale/attribution_pct/visit_date/respondent/dept`). `attribution_text`(라디오 원문)는 증빙으로 불변.
- **관리자 UI**:
  - 설문 상세 모달에 `수정` 버튼 → 수정 폼 모달(`surveyEditBg`, **입력 폼 — 백드롭 미바인딩 원칙**). 공통 8필드 + 트랙별 필드(sales 5/media 7/etc 7)를 동적 생성. 비표준 기존 값은 select에 자동 추가해 보존.
  - 대장 행에 `수정` 버튼 → 기존 `ledgerModalBg`에 '수정' 모드 추가(`lmEditWrap` — 카테고리 select·과제명·예상 규모·기여도%·방문일·응답자·부서). 수정 모드에선 status 미전송(상태 전환과 분리).
  - 이슈 증상(symptom) 셀을 읽기 전용 → 인라인 input으로 변경, 행 저장에 포함.
- 검증: Playwright로 3개 흐름(설문 수정/대장 수정+확정 회귀/이슈 증상) 페이로드까지 확인.

### 핵심 제약 (다음 세션에서도 유지)
- 설문 응답의 **파생 트리거 3종(media_link/etc_link/iot_defect)과 raw_json은 수정 불가** 유지 — 백엔드 IMMUTABLE과 수정 폼 양쪽에서 제외됨. 완화하려면 파생 행 재생성 로직부터 설계할 것.
- 수정 기능은 행 삭제가 아님 — **행 삭제 금지 원칙은 그대로** (드롭/기각 상태 전환만).
- **재배포 필요**: 신규 엔드포인트(survey_update) + ledger_update 필드 확장. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-15 — Survey Spec 잔여분: T8 + S9 + Phase 5)

`ThinQReal_Survey_DB_Spec.md`(2026-07-16 요약판) 기준 잔여 작업 3건 완료. Spec의 나머지(T1~T7·S1~S8·Phase 1~4)는 기구현 확인 — 재구현하지 않음.

### T8 — ROI 툴 (ThinQ_Real_ROI_Tool.html)
- 요약 라벨 `연간 합계` → **`연간 합계 (확정 기준)`** + 소자막 "총식은 덧셈 — 미집계 항은 +0일 뿐, 합계를 훼손하지 않음".
- 기여 영업이익 panel-desc에 안내 추가: "**확정 딜(계약 체결)은 실제 계약 금액을 입력**하세요 — 설문의 범위 하한은 미확정 딜의 파이프라인 계산용입니다." (마스터 §4.6 "확정 딜 + 1억 미만 → 0" 경로 봉쇄)
- V_PR 변경 없음 (Spec 확정 — vpr 팝업 한 줄 추가는 '선택'이라 미적용).
- `ROI_BUILD` `20260709a` → **`20260715a`** (iframe 캐시 무력화).

### S9 — 설문 폼 Track A (ThinQ_Real_Visit_Survey.html)
- **필수 응답 검증**: 딜 단계 항상 필수 / 딜 단계 ≠ "딜 없음"이면 딜 규모·기여 수준도 필수. 위반 시 제출 차단 + 해당 카드 스크롤 + 하이라이트(`.card.need-answer` + `.req-msg`). 답을 고르는 즉시 하이라이트 자동 해제. **다른 트랙(B/C)에는 필수 검증 없음** (기존 동작 유지).
- **`dealAmount` 조건부 필드**: 딜 단계 = "계약 체결 완료 (확정)" 선택 시에만 노출. **무응답 정상 케이스 — 검증 제외** (미입력 시 범위 하한 임시 적용 + 운영팀 확인 안내문 포함). 토글은 `updateLinkDetails()`에 통합 (change 이벤트 의존 금지 교훈 적용). payload `deal_amount` + mailto 폴백 본문에 포함.

### Phase 5 — 월간 리포트 설문 지표 연계 (Apps Script, 재배포 필요)
- `collectMonthlySurvey(month)` 신설: 응답 수·트랙 분포 / 재방문 응답률 / 대장 신규(방문월 기준)·확정(confirmed_date 기준)·드롭 / **월 확정 산입액 합계(만원)** / 이슈 등록 건수(출처 응답의 월로 조인).
- `collectMonthlyData`에 try/catch 격리로 연결(집계 실패가 리포트 발송을 막지 않음) → 본문 **📋 설문·성과 지표** 섹션 (HTML: KPI 4카드 + 트랙/대장 칩, 방문 이력과 ROI 사이 / 텍스트판 동일).
- **`deal_amount` 컬럼(35번째)**: SURVEY_HEADERS 끝에 추가. `getNamedSheet`가 **기존 시트의 누락 헤더를 끝에 자동 append**하도록 확장 (bookings getOrCreateHeaders 패턴). 관리자 상세/수정 폼에도 '실제 계약 금액' 필드 반영.

### 핵심 제약 (다음 세션에서도 유지)
- **SURVEY_HEADERS에 새 컬럼은 반드시 배열 끝에만 추가** — handleSurveySubmit이 상수 순서대로 appendRow하므로 중간 삽입 시 기존 시트와 어긋남. 기존 시트 헤더는 getNamedSheet가 자동 확장.
- dealAmount는 **필수 검증 대상 아님** — "답변하지 않을 수도 있음"이 사용자 확정 사항. 필수는 딜 단계·(딜 있을 때) 규모·기여 수준 3종만.
- BEP 대표 수치는 **1.65년(약 1년 8개월)** — "2년 7개월"은 PR 제외 감응도 체크용이므로 UI·문서에 대표 수치로 쓰지 말 것 (Spec §8-2-C).
- **재배포 필요**: Phase 5 + deal_amount는 Apps Script 변경 — "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-15 — 이관 브랜치 main 병합 + 설문 파이프라인 컨테이너 이식)

이관 전용 세션(브랜치 `claude/magical-babbage-y98vkf`). Stage1 컨테이너가 최신 main 기준으로 포장되도록 정비.

### A. main 병합 (merge main into branch)
- 분기 후 main의 15커밋(설문 폼 개편·ROI v4.6·설문 파이프라인·관리자 설문 탭 등)을 브랜치로 병합.
- 채택 규칙: **라이브 파일(index/admin/ROI/Survey/privacy/.gs)은 main** / **`server/`·`docs/migration/` 이관 작업물은 브랜치** / **CLAUDE.md는 양쪽 로그 보존**. 충돌은 CLAUDE.md 1건뿐(양쪽 로그 append) — 병합 후 라이브 파일 diff 0 검증 완료.

### B. 설문 파이프라인 server/ 이식 (§계약: api-contract.md — "이관 범위 포함 필수")
- .gs 설문 코드(~350줄)를 컨테이너에 완전 이식 — 컨테이너 API는 이제 **GET 16종 + POST 13종**.
- 구현: `handlers/survey.js`(5종) / SurveyStore 인터페이스 + memory·sheets 구현(행 삭제 연산 없음) / 상수 3종(SURVEY·LEDGER·ISSUE_HEADERS) / 알림(텔레그램 .gs 동일 + Teams 카드 additive) / 월간 리포트 📋 설문·성과 지표 섹션(collectMonthlySurvey, try/catch 격리) / Dockerfile에 설문 HTML COPY.
- **채널 단가(C_AS)는 env `SURVEY_CAS_JSON`** — .gs Script Property를 env로 이식 (커밋 금지 원칙 유지, .env.example에 키만 문서화).
- 검증: 트랙 3종 제출→파생(대장 % 파싱·이슈)·불변 필드·확정 처리·est_value 더미 단가 계산·리포트 섹션 기대값·예약/정적 서빙 회귀 전부 통과. 상세는 설계 문서 §8-5.

### 핵심 제약 (다음 세션에서도 유지)
- 이관 브랜치는 이제 main 병합 시점(3c8ed88) 기준 — **이후 main에 라이브 변경이 또 쌓이면 Stage1 최종 전달 전에 재병합**할 것 (같은 채택 규칙).
- 컨테이너 설문 엔드포인트도 .gs와 동일하게 **행 삭제 없음 / 제출 공개 경로 / 불변 필드 7종** 계약 유지.
- `SURVEY_CAS_JSON`은 env로만 — 코드·리포·문서에 실단가 기재 금지 (§6.5 grep 규칙 동일 적용).

## 작업 내역 (2026-08-17 — 사내 인프라 현황 기록 (Teams 박현정 책임, 7/16~8/13))

BE팀이 사내 클라우드에 ThinQ Real 인프라 구축 진행 — **상세는 `docs/migration/decisions-2026-07-06.md` §6 (신설)이 단일 소스**. 요지: 사내 Gitea 저장소(`gitea.thinqcloud.link/extapps/thinq-real`) + push 자동배포 CI/CD + ST/QA 환경 가동(샘플 앱) + **DB는 PostgreSQL로 확정(DynamoDB 검토 대체)** + Valkey(Redis 호환) 제공 + `ENVIRONMENT` 환경변수 + URL `thinq-real`로 하이픈 변경(8/13) + 운영 도메인 `thinqreal.lge.com` 승인 확보(사용은 CSR redirect 등록 필요 — decisions §6). DB 자격증명은 평문 금지(env 주입 — 우리 컨테이너 구조와 일치). 다음 이관 세션: `server/` 코드를 Gitea 샘플 자리에 README 규칙대로 이식 + store의 postgres 어댑터 구현.

## 작업 내역 (2026-08-25 — Gitea 저장소 README 계약 전사)

담당자가 Gitea `extapps/thinq-real` README 캡처 6장을 제공 — 세션에서 사내 Gitea 접근 불가(프록시 403)하므로 **`docs/migration/gitea-repo-contract.md`(신규)에 전사**해 이식 작업 기준 사본으로 확보. 요지: `/healthz` 유지 필수 / 코드 변경 시 Dockerfile·release.yml 테스트 명령 동반 수정 / conventional commits(`feat:`/`fix:`) 안 지키면 배포 안 됨 / DB_* 6종·KVSTORE_* env 제공 / 샘플 `src/server.js` 교체가 공식 절차 / kic-op 미등록 상태. 이식 체크리스트 10항목 §8에 정리 — 다음 이관 세션은 **저장소 zip 업로드받아** §8 순서로 진행. 미결: 앱 커스텀 비밀값(AUTH_SECRET 등) 주입 절차 BE팀 확인 필요.

## 작업 내역 (2026-08-25 후속 — 사내 Claude 인수인계 체계 수립)

담당자의 개인 Claude(외부)와 사내 엔터프라이즈 Claude(한도 작음, Gitea 접근 가능) 간 공유가 보안 결재 필요로 제한됨에 따라, **이관 실작업을 사내 Claude로 넘기는 인수인계 체계**를 수립.

- **`docs/migration/handoff-to-internal-claude.md` 신설** — 사내 Claude의 진입 문서. 30초 요약 / 파일 지도(질문별 읽을 파일) / 절대 규칙 7 / 과제 A~D(이식→postgres 어댑터→ENVIRONMENT 분기→데이터 이행) / BE팀 미결 질문 4 / worklog 프로토콜 / 토큰 절약 수칙.
- **역할 분담 확정**: 현행 사이트 운영·수정 = 외부(이 리포, GitHub) / 이관 실작업 = 사내 Claude(Gitea). 사내→외부 전달은 `docs/migration/internal-worklog.md`(사내 Claude가 append) 파일 하나만 반출 — 결재 부담 최소화.
- 전달 패키지 = **최신 브랜치 zip 1개** (server/ + docs/migration/ 전체 + 이 브리핑 포함, 비밀값 0). 사내 반입 후 Gitea 저장소의 docs/migration/을 최신본으로 교체하면 사내 Claude가 저장소에서 직접 읽음.

## 작업 내역 (2026-08-25 후속 — Gitea 원본 검수 + 멀티 레플리카 대응 + 과제 A 키트)

담당자가 Gitea 저장소를 드라이브(`thinq-real_gitea`)로 반출 → 커넥터로 원문 검수 완료. **상세는 gitea-repo-contract.md §10 + stage1-container-design.md §8-6이 단일 소스.**

- **핵심 발견**: HPA min 2(멀티 레플리카 확정) / alpine·non-root·readOnlyRootFilesystem / memory limit 256Mi / original-code는 7월 초 구버전(설문 폼 없음) / Valkey는 클러스터 모드.
- **server/ 보강 (커밋 `c117295`)**: Valkey 공유 캐시(kvcache.js — 인증 코드·쿨다운·잠금), AUTH_SECRET Valkey 공유(auth/secret.js, SealedSecret 전 임시), ENVIRONMENT=kic-st/qa 실발송 자동 억제, googleapis 지연 로드, alpine 폰트 경로.
- **과제 A 키트 전달** (`thinq-real_kit_A.zip`, 스크래치 산출물 — 리포 미커밋): alpine Dockerfile + release.yml(테스트 명령 1줄 교체) + 병합 package.json + src 44파일 + public/(최신 정적) + KIT-INSTRUCTIONS.md. 사내에서 절차대로 반영→`feat:` push→ST 자동 배포→검증표 확인.
- ⚠ ECR 계정 ID·클러스터 내부 주소는 퍼블릭 리포에 기재 금지 — 키트·스냅샷(스크래치)에만.

## 작업 내역 (2026-08-25~26 — main 재병합 + 신규 기능 전체 이식 + ✅ 과제 A 완료)

**① main 재병합 + 컨테이너 동기화 (2026-08-25, 커밋 `9625b90` → PR #78 머지)**
라이브 트랙이 병합 기준점 이후 126커밋(.gs 3,400→5,052줄) 진행된 것을 담당자 지적으로 확인 → main 재병합 후 신규 기능을 컨테이너에 전량 이식 (API **GET 19종 + POST 29종**). 상세는 stage1-container-design.md §8-7이 단일 소스. 키트도 v2로 재생성·전달 (`thinq-real_kit_A_v2.zip` — src 55파일 + 정적 6종 최신본).
- 메모리 실측: 부팅 43MB → 리포트 도넛 렌더 후 51~54MB — **256Mi 한도의 ~20%, "빡빡하다" 우려 해소** (동적 로드 + 소형 캔버스 효과).
- PR #78로 `server/`·`docs/migration/` 최신본이 main에 반영됨 (라이브 파일 diff 0). 브랜치는 merge 후 origin/main 기준 재시작.

**② ✅ 과제 A 완료 (2026-08-26 — 사내 적용, 담당자 + 사내 Claude 방법 B)**
- 키트 v2를 메일로 사내 반입 → 사내 PC에 작업 폴더(`thinqreal-work\` — OneDrive 동기화 밖) 구성 → 사내 Claude가 KIT-INSTRUCTIONS.md 절차대로 적용·push (잔여 한도 ~20%로 완료).
- Gitea Actions workflow **성공(초록)** 확인 → ST 검증표 **4/4 통과**: `/healthz` `{"ok":true,"backend":"memory"}` / `/` ThinQ Real 메인 페이지(샘플 hello 대체 확인) / `/thinqreal_admin.html` / `/api?type=appliances` 45개.
- **ST에서 우리 컨테이너가 실가동 중** — 단일 도커 컨테이너 이관의 첫 실배포.
- ⚠ 접속 주소 특이사항: 문서 기록 주소(`kic-st-thinq-real.thinqcloud.link`)로는 "연결할 수 없음"이었고, 담당자가 Teams의 `thinqreal`→`thinq-real` 변경 안내를 참고해 수정한 주소로 열림 — **실제 동작 주소 원문 확보 필요** (확보 시 이 문서·KIT·decisions §6 주소 일괄 정정).
- 사내 Claude가 남긴 막힌 것 2건은 사람 몫의 확인으로 해소/이월: Actions 육안 확인(담당자 완료) / 인증 게이트 테스트(LENS 로그 접근 필요 — BE팀에 접근 방법 문의 예정, 출장 복귀 후 수행).

**다음**: BE팀 문의 4+2건(SealedSecret·CronJob 3종 등록·SMTP·SSO 헤더·OP 시점·LENS 접근) 발송 → 담당자 9/1~9/10 IFA 출장 → 복귀 후 과제 B(PostgreSQL 어댑터 — 외부 트랙이 출장 기간 중 사전 제작 검토).

## 작업 내역 (2026-08-26 후속 — BE팀 미결 질문 답변 회수)

박현정 책임 Teams 답변(6건) 회수 — **정리본은 decisions-2026-07-06.md §6-1이 단일 소스.** 요지: SealedSecret·CronJob은 우리가 직접 넣으면 됨 / SMTP는 BE팀 회신 대기 / SSO는 `x-user-id` 헤더로 email 전달 / OP 차주말 완료 예정 + CSR redirect 지금 등록 가능(target=ops-gateway ELB, 주소 원문은 사내 Teams 기록) / ⚠ **OP는 인프라팀 제공 DB(PG+Valkey)·vault 필수, 강원석 직접 신청** (가이드 별도 전달 예정 — env 주입 구조라 앱 코드 영향 0).

담당자 액션: ① CSR redirect 등록 신청(즉시 가능) ② OP용 DB·vault 신청(가이드 수신 후) ③ SMTP 회신 대기. 외부 트랙 후속: 과제 B 키트(postgres 어댑터) + CronJob 매니페스트 3종 사전 제작 검토.
