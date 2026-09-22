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

## 작업 내역 (2026-09-05 — OP 배포 완료·SSO 전 환경 적용 확인)

박현정 책임 Teams(09-01) 확인 — **정리본은 decisions-2026-07-06.md §6-2가 단일 소스.** OP 배포 완료(예상보다 조기), MS Entra ID(SSO)가 ST/QA/OP 전부 적용 → 사내 SSO 계정 보유자만 진입 가능. ⚠ 전환 설계 신규 아젠다 발굴: SSO 전면 적용 시 **방문자 현장 설문(외부 방문객 QR)·FieldCheck/FieldVoice 장비 POST·공개 열람 페이지가 차단**되므로 SSO 예외 경로 협의 필요. OP용 DB·vault 신청 가이드는 계속 대기.

## 작업 내역 (2026-09-05 — 과제 B 구현 완료 + 키트 v3)

담당자 승인으로 과제 B 착수·완료 — **상세는 stage1-container-design.md §8-8이 단일 소스.**

- **8/26 라이브 델타 이식**: article_update·16진 엔티티 디코딩+소급 힐링·봇 차단 UA 재시도·survey_data articles 스키마 확장(summary/thumbnail)·FieldCheck 수신자 분리(env FC_REPORT_EMAILS).
- **인앱 스케줄러** (⚠ 스펙 대비 변경 — CronJob 매니페스트 대신): 이미지 태그 고착·deploy 구조 수정 문제를 피하기 위해 앱이 일일 잡 3종을 스스로 실행 (Valkey 일일 락으로 레플리카 중복 방지). **BE팀 문의 ②(CronJob)는 불필요해짐.**
- **PostgreSQL 어댑터**: 테이블 14종 자동 생성, 전 컬럼 TEXT + rid/ord, STORE_BACKEND 자동 감지(DB_HOST 있으면 postgres) → **사내는 push만으로 영속 저장소 전환**. 로컬 PostgreSQL 16으로 전수 회귀 통과 (예약 생명주기·설문 파이프라인·큐레이션·ROI pin·2단계 발송 토큰·재기동 보존·memory 회귀 포함).
- **키트 v3 전달** (`thinq-real_kit_A_v3.zip`): 적용 5단계 + 검증표 5항(postgres 전환·데이터 영속성·스케줄러). 사내 적용은 담당자 복귀(9/10) 후.
- 남은 것: 과제 D(시트→DB 이행 — 전환 직전) / SSO 예외 경로 협의 / OP용 DB·vault 신청(가이드 대기) / SMTP 회신 대기.

## 작업 내역 (2026-09-07 — ✅ 과제 B 사내 배포 성공 + Gitea 이력 재작성 대응 + 라이브 델타 추가 이식)

**① 과제 B 사내 적용 결과 (담당자 + 사내 Claude)**: 키트 v3 적용 → **릴리스 0.8.1→0.9.0 배포 성공** (태그 v0.9.0, 이미지 thinq-real:0.9.0). 검증표는 ST가 SSO 게이트 뒤로 들어가 curl 무효화 — 담당자가 사내 브라우저(SSO 로그인)로 `/healthz`=`backend:"postgres"`·데이터 영속성 확인 예정.
**② Gitea 이력 재작성 발생·대응 완료**: BE팀이 `deploy/base/secret.yaml`(평문 비밀값) 제거를 위해 main 이력을 force-push로 재작성 → 사내 클론 `git pull` 실패. 대응: 내용 동일성 검증 후 `reset --hard origin/main`, 평문 커밋을 가리키던 로컬 태그 7종(v0.2.0~v0.7.0) 삭제 + `git fetch --tags` 재취득, **`git push --tags` 금지 수칙 신설** (naive merge-push였으면 평문 비밀값 재유입 — 사내 Claude가 회피). 다음 키트 절차서의 git pull 단계에 이 시나리오 대응 반영 예정.
**③ SSO 실측 확인 (§6-2 아젠다 실증)**: ST 전 경로가 302→login.microsoftonline.com. 사내 Claude가 독립적으로 동일 결론 — BE팀 협의 필요 2건: `/healthz` 게이트웨이 경유 외부 모니터링 302 / 비대화형 경로(FC·FV 업로드, 설문 폼) 예외 목록.
**④ 라이브 델타 추가 이식 (#94~#97 — main 재병합 후)**: bookings **26컬럼**(+`applicant` — 신청자/책임자 분리, 공란=책임자 동일 취급), **예약 D+7 버퍼**(서버 강제, 관리자 백필은 무제한), 확정/거절 메일 인사말·설문 초대 링크 작성자 = 신청자 우선, 담당자 알림·텔레그램 신청자 표기, **회차 시간표 2026-08-31 개편본**(09:30/13:30/15:30 — 8/25 이식분에 누락돼 있던 것 발견·정정). memory 검증: D+3 거부(booking_too_soon)·D+8 접수·알림 메일 신청자 줄 확인. PG 스키마는 자동 진화로 applicant 컬럼 자동 추가.

## 작업 내역 (2026-09-14 — 복귀 재개: 출장 기간 델타 동기화)

담당자 IFA 출장 복귀. PR #93(과제 B) 머지 확인 — 컨테이너·이관 문서 전부 main 반영 완료 상태. 출장 기간(9/7~9/14) 라이브 델타(PR #99~#104) 검토·동기화:
- **예약 버퍼 D+7 → D+2 단축** (2026-09-14 운영자 지시) — 컨테이너 handleNewBooking 서버 검증 동기 이식 (D+1 거부·D+3 접수 검증 완료).
- 도어락 PIN 교체(509067→910910)는 컨테이너에선 env `DOORLOCK_PIN` 값 사항 — 코드 무관, 사내 비밀값 주입 시 새 값 사용.
- 달력 안내 문구 등 정적(index.html) 변경은 다음 키트의 public/이 자연 수용.
ST(0.9.0)는 키트 v3 시점 기준이라 D+7로 동작 — ST 내 달력·서버가 서로 일관되므로 무해, 다음 키트에서 D+2로 따라감.

## 작업 내역 (2026-09-14 후속 — ✅ 과제 B 최종 합격 판정)

- **담당자 브라우저 검증 통과**: ST `/healthz` = `{"ok":true,"backend":"postgres"}` — PostgreSQL 영속 저장소 가동 확인. **과제 B(0.9.0) 공식 완료.** (슬롯 차단 영속성 확인은 LENS 코드 확인이 함께 필요해 후속 — 핵심 판정은 backend 전환으로 충족)
- **ST 접속 주소 확정**: `https://kic-st-thinq-real.thinqcloud.link` — **문서 기록과 동일** (9/7 "미접속"은 주소 오기 가능성 — 문서·키트 정정 불필요로 종결).
- 남은 것: BE팀 답변 대기(SSO 예외 경로·OP용 DB/vault 신청 가이드·SMTP) / 과제 D(시트→DB 데이터 이행 — 전환 직전 1회) / LENS 인증 게이트 테스트(여유 시).

## 작업 내역 (2026-09-14 후속 2 — SSO 예외 가능 확인 + OP DB·vault 가이드 수령)

박현정 책임 9/7 Teams·메일 회수 — **정리는 decisions §6-3이 단일 소스.** SSO 예외는 path 단위로 가능(조건: 경로 명확 분리). **이관 트랙 설계 — SSO 예외 요청 경로 목록(안)**:
1. `/healthz` — 모니터링·프로브
2. `/api` — 앱 자체 인증 보유 (관리자 작업=토큰, 장비=API 키, 공개 경로=설계상 공개 — 현행 퍼블릭 인터넷 노출과 동일 보안 수준이라 후퇴 아님)
3. `/ThinQ_Real_Visitor_Survey.html` — 외부 방문객 QR 익명 설문
4. `/privacy.html` — 공개 열람 의도 문서
5. `/images/` — 위 공개 페이지들이 참조하는 정적 자원
나머지 전부(/, 관리자, ROI, 임직원 설문 폼)는 SSO 뒤 유지. `/api` 전체 예외가 부담스럽다는 회신이 오면 컨테이너에 공개 전용 경로(`/pub` 등)를 신설해 공개 타입만 라우팅하는 대안 가능 (코드 소폭).

## 작업 내역 (2026-09-14 후속 3 — OP 접속 확인·주소 출처 정정 + DB·vault 생성 가이드 검수)

**① OP 접속 상태 확인 (담당자 실측)**
- `kic-op-thinq-real.thinqcloud.link` — **접속 가능 확인.** 이 주소는 이관 트랙의 추측이 아니라 **박현정 책임이 8/18 Teams에서 안내한 값**이었음 ("아마도" 단서 포함 — 출처 정정). OP 실가동 재확인.
- `thinqreal.lge.com` — 미접속이나 **정상** (CSR redirect 미등록 상태라 당연함 — 등록 후 열림). CSR target은 8/26 안내대로 ops-gateway ELB 주소 사용이 최신 지침.

**② OP용 DB·KV store·secret store 생성 가이드 원문 검수 (Confluence, 박현정 책임 작성 — 2026-09-10 갱신본)**
- 구조: ST/QA용(관리 주체 TCN — extapps-db·extapps-kvstore·sealed-secrets는 **개발 편의용**)과 OP용(관리 주체 **DB팀·인프라팀**) 분리. OP real-world 서비스는 반드시 OP용으로 배포해야 함 (§6-1 ⑥ 재확인).
- **DB(RDS)·KV(ElastiCache)**: 공식 요청 시스템(JIRA)으로 신청. OP에는 extapps-db 같은 통합 인스턴스가 없어 **서비스별 신청**. 절차 다수·소요 김. **DB 수작업 접근은 전용 매체(DB-i/TAAgent)로만** — ⚠ 과제 D(데이터 이행) 설계 시 고려 (앱 컨테이너 경유 이행이 기본 경로가 될 것).
- **secret store(Vault)**: sealed-secrets 대신 Vault, 운영 주체 인프라팀(담당 김형곤 책임). DB보다 진행 쉬움. ArgoCD 배포 방법 섹션은 skip (extapps 전 ArgoCD app에 plugin 기설치 — ST/QA 포함).
- 신청서 기재값(AWS 계정명·VPC·CIDR 등 사내 식별자)은 퍼블릭 리포 미기재 원칙 — **thinq-real용 기재값 절차서는 외부 트랙이 담당자에게 채팅으로 전달** (가이드 표의 extapps 공통값 + ThinqService=thinq-real).
- 담당자 액션: RDS·ElastiCache JIRA 신청(소요 길어 선행) → Vault 생성 → 완료 시 OP env 주입 준비 완료.

## 작업 내역 (2026-09-15 — 사내 작업 폴더 이전: OneDrive 손상 → SMB 재clone)

**① 증상·원인**: 사내(클라우드 PC) Claude Code가 "작업 폴더가 더이상 존재하지 않습니다" 오류. 기존 작업 폴더가 OneDrive 동기화 경로(문서 폴더) 아래에 있어, 파일 온디맨드(자리표시자화)로 `.git` 로컬 실체가 유실·손상됨 (git 명령 자체가 실패). 탐색기에는 파일이 보이나 실체는 클라우드에만 있는 상태.
**② 대응 — 복구 대신 재clone (Gitea가 원본이므로 무손실)**:
- 커밋·push된 모든 내용은 사내 Gitea 원본에 존재 — 로컬 폴더는 폐기 대상으로 확정, 구 폴더는 untracked 개인 파일만 확인 후 삭제.
- 새 작업 폴더는 OneDrive 동기화 범위 밖의 네트워크 드라이브(SMB) 경로로 이전. SMB는 git이 소유권 확인 불가로 기본 거부 → **`safe.directory` 예외를 해당 경로 한 곳만 등록**(와일드카드 금지) 후 clone 성공 — 사내 Claude가 진단·수행.
- 물리 노트북 로컬 디스크 대안은 미검증 환경(Claude Code·Gitea망 접근 불명)이라 예비 카드로 보류 — 검증된 클라우드 PC 환경 유지가 저리스크.
- DB MGR credential(db-mgr.zip)은 **저장소 폴더 밖** 별도 폴더로 격리 보관 (커밋 유입 원천 차단).
**③ SMB 운영 수칙 신설**: 작업 시작 시 `git status`+`git pull` / 커밋 즉시 push (push 안 된 커밋을 로컬에 묵히지 않기) / 이상 동작 시 수리 시도 대신 재clone. 로컬 사본은 소모품, 원본은 Gitea — 이 원칙이 이번 사고의 피해를 0으로 만듦.

## 작업 내역 (2026-09-15 후속 — 사내 Claude 문맥 팩 v1: 역할 재정의 + 2층 문서 구조 + GitHub 읽기 전용 미러)

**① 문제 진단**: 사내→외부 정보 흐름이 구조적 병목 — 클라우드 PC의 캡처·카메라 제한과 구형 iPad로, 사내 화면·질문이 담당자의 **타이핑으로만** 외부 트랙에 도달. 판단이 전부 외부에 있는 "사내=무판단 수행자" 설계(7~8월, 한도 절약 목적)가 원인. 해결 방향 = 반출을 늘리는 게 아니라 **판단을 사내 Claude로 옮겨 반출 필요량을 줄이는 것.**
**② 결정 — 2층 문서 구조**: 1층 퍼블릭 GitHub(`CLAUDE-gitea.md` v2 + 신규 `internal-claude-briefing.md` — 프로젝트 다이제스트·절차 지도·판단 기준·역할 경계·보고 압축 양식, 사내 식별자 0) / 2층 사내 Gitea 전용(`internal-context.md` — 주소·기재값·CIDR·담당자·작업 환경·담당자 협업 프로필, 메일 zip 반입·외부 반출 금지). **프라이빗 GitHub 미러 안은 불채택**: 퍼블릭 내용은 프라이빗 복사로 보호 효과 0, 사내 식별자를 개인 클라우드에 두는 것은 반출 — 퍼블릭은 "보호할 게 없는 배달 통로"로만.
**③ 채널 — GitHub 읽기 전용 미러**: 사내 브라우저에서 github.com 접속 확인(담당자 실측) → 사내 PC의 별도 폴더에 퍼블릭 저장소를 인증 없이 clone, 세션 시작 시 pull → `migration-log.md` 마지막 항목이 외부 최신 지시. git CLI 접근은 키트 절차의 `ls-remote`로 검증 예정. 코드 키트는 계속 메일 zip(퍼블릭 `server/`와 Gitea 배치가 달라 코드 경로로는 쓰지 않음).
**④ 사내 Gitea 현황 확인(담당자 화면)**: 루트 `CLAUDE.md`(8/26 반입 v1) 존재 확인, 0.9.0 릴리스·태그 12·커밋 39, worklog 커밋 반영됨. `handoff-to-internal-claude.md`는 과제 절차 원문으로 유지하고 상단에 진입점 이관 안내 추가.
**⑤ 한계(정직 기록)**: 외부 트랙이 가진 기억은 이관 세션분뿐 — 운영·FieldCheck·해커톤 세션 대화는 `CLAUDE.md`·`history.md` 기록 범위로만 전달. 문맥 확대는 사내 한도 소모 증가 → "항상 읽는 짧은 CLAUDE.md + 필요 시 여는 상세" 계층화로 억제, 모델 기준(절차=Sonnet급/진단=Opus급) 명시.

## 작업 내역 (2026-09-15 후속 2 — ✅ 문맥 팩 v1 사내 적용 완료·검증 통과)

- **사내 적용**: 담당자가 zip 반입 → 사내 Claude가 KIT-INSTRUCTIONS대로 파일 3종 배치(루트 `CLAUDE.md` v2·`internal-claude-briefing.md`·`internal-context.md`) + **GitHub 읽기 전용 미러 개통**(`git ls-remote` 해시 확인 → 별도 폴더 clone, `migration-log.md` 최신 항목 확인) + `docs:` 커밋. push는 권한 팝업 거부로 담당자가 Claude Code의 터미널 실행 버튼(`>_`)으로 직접 수행 — Gitea 최신 커밋 "docs: 사내 Claude 문맥 팩 v1" 확인.
- **검증 통과**: 새 채팅에서 검증 프롬프트 → 되묻지 않고 OP 전환 사내 절차 8개 표 + "DBMS = Postgre(PostgreSQL 어댑터)" 정답. **사내 Claude가 현장 판단자로 동작 시작.**
- **이후 운영 규칙 확정**: 사내 시스템 질문(JIRA·Next SPoC·CSR·Vault)은 사내 Claude가 1차 처리, 외부 트랙에는 결과·"확인 필요"만 압축 양식(3~5줄)으로. 외부 트랙의 새 결정은 GitHub push → 사내 미러 pull로 전달 (문맥용), 코드 키트는 메일 zip 유지. `internal-context.md` 갱신은 외부 트랙 새 판 반입 또는 담당자 승인 하 사내 직접 기입(`docs:`).
- 권한 팝업 거부 시 대응 수칙: Claude Code가 표시한 명령 옆 `>_` 버튼으로 담당자가 직접 실행 (2회째 발생 — 표준 대응으로 등재).

## 작업 내역 (2026-09-15 후속 3 — 과제 D 설계 확정)

- 담당자 승인으로 **적재 방식 = 관리자 페이지 업로드(`admin_import`, 관리자 토큰)** 확정. 설계 전문은 `stage1-container-design.md` **§8-9** (제약 3·구조 3단계·진행 순서·선행조건·미결 2건·⚠스펙 대비 변경).
- 다음: 키트 v4(admin_import + 이행 패널 + 검증 리포트 + 외부 추출 스크립트) 제작 — 선행조건(OP 자원·SSO 예외·SMTP)이 수 주 소요이므로 그 사이 진행. 미결 ⓐ 라이브 동결 합의 ⓑ thinqreal.com 리다이렉트 기간은 담당자 판단 대기.

## 작업 내역 (2026-09-16 — SSO 예외: `/api`→`/pub` 공개 전용 경로 신설·검증)

- BE팀 답변(박현정 책임, 일부): `/api` 전체 예외 곤란 → 인증 여부로 경로 분리 요청. 위험 처리는 앱 코드 책임 전제. 정리는 **decisions §6-4**.
- **구현**: `routes/post.js`에 `PUB_TYPES`(visitor_submit·health_check·voc_report) + `createPostRouter(store, {onlyTypes})` 화이트리스트, `app.js`에 `/pub` 마운트(그 외 type·GET → 404 `not_found`). `/api`는 무변경(3종은 양쪽 모두 동작). **검증(memory, curl 12건)**: GET /pub 404 / 3종 통과(키 검증 유지) / booking·roi·관리자(update+토큰) 404 / invalid JSON 처리 / `/api` visitor_submit 동작·`/api` update 게이트 유지.
- **문서**: api-contract 공통 사항에 `/pub` 계약 추가, 브리핑 §2·§3-f 갱신(최종 예외 5종: `/healthz`·`/pub`·방문자 설문·privacy·images).
- **키트 v3.1**(`thinq-real_kit_pub_v3.1.zip`): 변경 2파일(src/app.js·src/routes/post.js)만 — 사내 적용 시 `feat:` 커밋으로 0.10.0 릴리스, BE팀 게이트웨이 설정 후 ST에서 `/pub` 실측 예정.
- 담당자 회신 문안(Teams)은 채팅으로 전달. 후속 질문 2건(예외 경로 rate limit/WAF 유무, `x-user-id` strip 여부) 포함.

## 작업 내역 (2026-09-16 후속 — 코드 키트 반입 경로 개정: 메일 zip → GitHub 미러 복사)

- 네이버 메일이 `.js` 포함 zip(키트 v3.1)을 보안 정책으로 차단 → PR #113 머지본을 사내 GitHub 미러에서 pull해 2파일을 복사하는 방식으로 전환. 사내 Claude가 브리핑 §7-5("미러는 문맥 전달용")와의 충돌을 이유로 복사 후 커밋을 거부하고 담당자에게 옵션 질의 — **규칙 준수 동작으로 정상**. 본 개정으로 §7-5를 "코드 반입도 미러 경유가 기본, 지정 파일 복사만 허용(역할 경계의 키트 적용 ✅)"으로 변경. 메일 zip은 `internal-context.md` 갱신 전용으로 축소.

## 작업 내역 (2026-09-16 후속 2 — ✅ 0.10.0 릴리스: `/pub` 사내 배포 완료)

- 사내 Claude가 GitHub 미러에서 2파일 복사 → 담당자 승인 → `feat:` 커밋·push → Gitea Actions 성공 → **릴리스 0.10.0** 확인(담당자). **코드 반입 미러 경유 첫 성공 사례** — 메일 zip 없이 PR 머지 → 미러 pull → 복사 → 릴리스까지 당일 완료.
- **ST 실측 통과(담당자, 9/16)**: `/pub` → `{"error":"not_found"}`, `/healthz` → `backend:"postgres"` 유지. 남은 것: BE팀 회신(최종 예외 5종 + 후속 질문 2건) → 게이트웨이 설정 후 시크릿 창 실측(키트 v3.1 검증표 4번).

## 작업 내역 (2026-09-16 후속 3 — 사내 보고 수신 + 규칙 충돌 절차 신설)

- 사내 Claude 압축 보고 수신: 키트 v3.1 적용·0.10.0 확인·worklog 기록 완료. 지적 사항 — "실시간 거부에 맞춰 정책 개정 → 재지시" 경위가 이례적이었으니 표준 경로 재검토 권장.
- 대응: 브리핑 **§9 "규칙 충돌 시 절차"** 신설 — 규칙 우선, 멈추고 보고 → 외부 트랙이 개정(PR) 또는 철회 → **PR 머지 → 미러 pull → 확인 → 재개**가 표준. 개정 전 강행은 담당자 명시 승인 + worklog 기록 시에만. 오늘 사례(강행 승인이 PR 머지보다 먼저 나감)는 첫 사례로 기록하고 이후 순서 준수.

## 작업 내역 (2026-09-17 — CSR 등록 완료, 게이트웨이 호스트 라우팅 대기)

- 담당자가 `thinqreal.lge.com` CSR 등록 완료. 접속 시 **"listener not found"** — http/https 동일. 판정: 요청이 ops-gateway까지 도달하나(CSR 동작 확인) 게이트웨이에 `thinqreal.lge.com` 호스트 → thinq-real OP 서비스 라우팅(및 lge.com TLS 인증서)이 미등록. decisions §6 "주소창까지 lge.com 유지는 별도 문의" 항목이 현실화된 것 — BE팀(박현정 책임)에 라우팅 등록 요청 발송(SSO 예외 5종과 함께 처리 요청).
- CSR target 기재값(호스트명/고정 IP 여부)은 담당자 확인 후 `internal-context.md`에 사내 기입 예정.

## 작업 내역 (2026-09-17 후속 — Next SPoC 양식 확인으로 절차 순서 확정)

- 담당자 확인: Next SPoC DB 계정 양식 = `DB-i 적용 여부` · `Instance(AWS)` · `접속 IP` 3항목 → 인스턴스 생성 기능 없음. **순서 확정: RDS 인스턴스(JIRA) → Next SPoC 계정.** 브리핑 §3-d에 항목·기재 방향(접속 IP=OP 클러스터 CIDR, DB-i=앱 계정 미적용 유력 — DB팀 확인 필요) 반영. RDS JIRA는 미신청 상태 — 사내 Claude 지원으로 착수.

## 작업 내역 (2026-09-17 후속 2 — BE팀 답변 반영: SSO 예외 완료·`/pub` rate limit 구현)

- BE팀 답변 정리는 **decisions §6-5**. SSO 예외 게이트웨이 설정 완료 → 담당자 실측 6항목 안내(시크릿 창 5종 + **휴대폰 외부망에서 방문자 설문** — 외부 방문객 QR 전제 검증).
- **구현**: `lib/rateLimit.js`(인메모리 고정 창, XFF 첫 IP 기준, 429+Retry-After) + `app.js` `/pub` 앞단 마운트 + `config.pubRateLimit`(env `PUB_RATE_LIMIT`, 기본 60/분). **검증(memory, limit=5)**: 5회 200 → 6·7회 429 / 다른 XFF IP 독립 200 / `/api` 7회 전부 200(무제한) / 429 본문·Retry-After 확인. api-contract `/pub` 항목에 계약 추가.
- **키트 v3.2**(미러 복사 3파일: `src/app.js`·`src/config.js`·`src/lib/rateLimit.js`) — `feat:` 커밋 → 0.11.0.
- 브리핑 §2·§3-e·§3-f 상태 갱신(CSR CNAME 등록 완료·BE팀 처리 중 / SSO 예외 완료·실측 대기).

## 작업 내역 (2026-09-17 후속 3 — SSO 예외 실측 통과 · thinqcloud.link 사내 전용 DNS 발견)

- 담당자 ST 실측: 예외 5종 로그인 없이 열림, 루트는 SSO 유지 → **SSO 예외 건 종결**. 첫 시도는 `thinqreal.lge.com`으로 테스트해 혼선 — 브리핑에 "테스트 주소는 항상 thinqcloud.link, lge.com은 CSR 완료 전 불가" 명시.
- **⚠ 발견**: 사외에서 thinqcloud.link NXDOMAIN → 사내 전용 DNS. 외부 방문객 QR 설문·(네트워크 미확인 시) 점검 장비 경로에 영향. 정리는 decisions **§6-6**, 브리핑 §3-f 갱신 + **§3-i(사외 접속 경로 확보) 신설**. BE팀 문의 발송, 대안(출구 태블릿) 준비.

## 작업 내역 (2026-09-17 후속 4 — 외부 접점 설계 전환: 하이브리드 에지 + egress_check)

- 담당자 확정 사실: OP도 사내 전용 DNS / lge.com 사외 노출 불가 전제(B2E) / FieldCheck 장비 사외 Wi-Fi(의도) / 방문객은 귀가 후 설문 → 태블릿 대안 폐기. 정리 **decisions §6-7**, 설계 **stage1 §8-10**(외부 접점 3종은 현행 GitHub Pages+Apps Script 유지, 사내 스케줄러가 pull·병합, `LEGACY_AUTH_SECRET`로 토큰 자체 발급 → .gs 변경 0, delete-through, ⚠스펙 대비 변경 표기).
- **구현**: `GET /api?type=egress_check` — pod→Apps Script 아웃바운드 진단(ST/QA 토큰 생략, OP 관리자 토큰). `config.legacyScriptUrl`(env `LEGACY_SCRIPT_URL`, 공개 URL 기본값). 검증: 무토큰 거부(OP 모드)·응답 형태 확인(샌드박스는 프록시 정책상 403 — 사내 실측이 목적).
- **키트 v3.3**(미러 복사 3파일: `src/handlers/diagnostics.js`·`src/routes/get.js`·`src/config.js`) → 0.12.0 → ST에서 `egress_check` 실측이 다음 관문. BE팀 문의 2건(pod 아웃바운드/프록시, 공식 외부 진입점 패턴).

## 작업 내역 (2026-09-17 후속 5 — ✅ 아웃바운드 성립 실측 + 키트 v4: 하이브리드 에지 동기화 구현)

- **ST 실측(담당자)**: `egress_check` → `ok:true, status:200, count:45, proxyEnv:"none"` — 사내 pod가 프록시 없이 현행 Apps Script에 직접 도달. **하이브리드 에지 설계 성립.**
- **구현(키트 v4)**: `jobs/edgeSync.js` — health_checks(무인증)·survey_data visitors·voc_reports(관리자 토큰 자체 발급 `signAuthTokenWith(LEGACY_AUTH_SECRET)`)를 pull해 id 기준 멱등 병합, `deleteLegacyVisitor` delete-through. 스케줄러 간격 잡(`INTERVAL_JOBS`, 10분·슬롯 락), GET `edge_sync_now`(ST/QA 토큰 생략), CLI. `.gs` 변경 0.
- **검증**: 2서버 통합(현행 역할=컨테이너 자신) — 1차 3종 병합 / 2차 멱등 / delete-through 후 원본 감소·부활 없음 / OP 무토큰 거부 / 스케줄러 기동 로그 / CLI. 상세 stage1 §8-10 구현 항.
- 사내 적용: 미러 복사 6파일(`src/jobs/edgeSync.js` 신규·`src/auth/token.js`·`src/config.js`·`src/lib/scheduler.js`·`src/handlers/visitors.js`·`src/routes/get.js`) → 0.13.0 → ① `edge_sync_now`로 health 동기화 확인 ② `LEGACY_AUTH_SECRET` sealed-secret 주입(BE팀 가이드 "sealed-secrets 사용법") 후 visitors·voc 확인.

## 작업 내역 (2026-09-18 — ✅ 하이브리드 에지 1단계 실증: 현행 FieldCheck 데이터 사내 유입)

- 키트 v4 사내 적용 → **0.12.0**(v3.2+v3.3이 한 커밋 0.11.0으로 합쳐져 번호가 예측과 1 차이). Actions 1회 실패 → 담당자 재실행으로 성공.
- **ST 실측**: `edge_sync_now` → `health.fetched 21` + `errors:["visitors/voc: LEGACY_AUTH_SECRET 미설정 — 건너뜀"]` — 현행 rig가 올린 최근 3일 점검 21건이 ST DB에 병합됨. **외부 접점(FieldCheck)이 이관 후에도 무변경으로 동작함을 실증.**
- 다음: 2단계 — ST sealed-secret에 `LEGACY_AUTH_SECRET`(현행 Apps Script Script Property `AUTH_SECRET`) 주입 → visitors·voc 동기화 확인. 주입 후 파드 재기동 필요 가능.

## 작업 내역 (2026-09-17 후속 6 — thinqreal.com 만료 영향 점검)

- 담당자 질문(도메인 1년 후 미연장 시 영향) 점검: 컨테이너·edgeSync·장비 경로는 도메인 무관, 방문객 설문 QR 주소만 영향(github.io로 서빙 지속). 만료 전 체크리스트(CNAME 삭제·QR 교체)와 외부 접점의 개인 계정 의존을 decisions §6-7·브리핑 §3-i에 명시.

## 작업 내역 (2026-09-20 — BE팀 답변 4건 반영·하이브리드 에지 최종 확정·2단계 일시 중지·라이브 델타 점검)

**① 사내 Claude 보고 수신(9/18)**: 키트 v4 적용·0.12.0 확인 / sealed-secret `LEGACY_AUTH_SECRET` 추가 착수 → **cert 확보 단계에서 대기**(kubeseal 0.40.0 설치 완료, 이 PC에 kubectl·kubeconfig 없어 `--fetch-cert` 불가, deploy/ 기존 SealedSecret 3종에 컨트롤러 정보 없음, 평문 미공유 원칙 준수). 담당자 지시로 **해당 작업 일시 중지** — 진행 상태만 기록. 재개 조건: BE팀 cert 파일(또는 LENS 터미널에서 `--fetch-cert`).
**② BE팀 답변(9/18)** — 정리는 **decisions §6-8**: 아웃바운드 정책 제한 없음(하이브리드 에지 정식 경로 확정, 외부 잔류 데이터 민감성 평가는 우리 책임 — 현행과 동일 범위) / 외부 진입점은 존재하나 등급 상승 부담 → **추진 안 함, 하이브리드 에지 = 최종 설계** / **CSR 반영 완료 — OP 주소 `thinqreal.lge.com`, 구 thinqcloud OP URL 제거** → 실측 대기(예외 5종 새 호스트 재확인 포함) / SMTP 차주.
**③ 라이브 델타(9/20, 운영 세션 PR #125~#128)**: 처리방침 V3.0(국외 이전 조항 삭제)·동의서 V1.1·index 폼 동의 문구/resetForm·admin 프리필 — 전부 정적 HTML + .gs 주석 2줄. **컨테이너 코드 영향 없음**, 다음 키트 `public/`이 수용. `privacyConsent='Y'` 의미 변경(수집·이용만)을 컨테이너 상수 주석에 패리티 반영.
**④ 다음**: 담당자 — `thinqreal.lge.com` 실측 + 박현정 책임 회신(cert 요청 포함) / 사내 Claude — internal-context §1 OP 주소 행 정정(`docs:`) / 외부 — SMTP 수령 후 메일 설정, 과제 D 키트 v5(admin_import).

## 작업 내역 (2026-09-20 후속 — ✅ OP 주소 `thinqreal.lge.com` 실측 통과, CSR 건 종결)

- 담당자 실측: `/healthz` postgres · `/` SSO 로그인 · 시크릿 창에서 예외 경로 로그인 없이 열림 · `/pub` → `not_found`(설계대로). **CSR·SSO 예외 두 건 모두 새 호스트에서 종결.** 브리핑 §3-e ✅.
- 루트 `CLAUDE.md` "사내 이관 트랙" 상태 줄을 8/25 → 9/20 기준으로 갱신(세션 간 동기화 섹션 — 운영 세션에 "이관 후에도 호출되는 .gs 엔드포인트 6종 계약 변경 전 협의" 요청 명시).

## 작업 내역 (2026-09-21 — 팀원 배정에 따른 역할 분담 검토 기록, 결정 보류)

- 리포 상태: main = #130, 9/21 라이브 델타 0.
- 팀장이 이관 업무에 팀원 1명을 배정. 담당자 질문 "둘이 나눌 수 있는 구조인가" → 이관 트랙 판단: **반반은 불가, 성격이 다른 두 트랙으로는 분할 가능.** A 판단·설계 트랙(외부 트랙 협업·키트 승인·과제 D/전환 계획·BE팀 정책 협의·Gitea push 승인)은 담당자 단일 유지 / B 사내 절차 트랙(RDS·ElastiCache JIRA·Vault·Next SPoC·sealed-secret cert·SMTP 적용·LENS·검증표 실측)은 팀원 적임 — 현 병목이 전부 B이고, 문맥 팩(브리핑 §3·internal-context)이 담당자 외 인원도 사내 절차를 수행할 수 있게 설계돼 있음.
- 분할 시 규칙(안): ① 외부 창구·BE팀 정책 질문은 담당자 한 명 ② push 승인·비밀값 취급은 담당자 ③ 기록은 internal-worklog 하나(팀원도 압축 양식 보고). 온보딩(안): 권한 4종(Gitea·LENS·사내 Claude·JIRA) → 검증 프롬프트로 문맥 확인 → 첫 과제 RDS·ElastiCache JIRA.
- **결정은 담당자 보류("추후 논의")** — 확정 시 브리핑 §5에 담당자/협업자 구분, internal-context §4에 팀원 프로필 추가 예정.

## 작업 내역 (2026-09-21 후속 — OP 자원 JIRA 작성 검토·오픈 목표 11월 확정)

- **DB 생성 4단계(DBMS 선정→DB 생성→접속계정→운영)와 절차 지도 대응 확인**: DBMS = PostgreSQL(유일 선택지 — 컨테이너 어댑터), DB 생성 = DBSUPPORT JIRA, 접속계정 = **DBSUPPORT JIRA 별도 신청**(템플릿 명시 — 절차 d 정정, Next SPoC은 접속 권한·DB-i 단계), 운영 = env 주입·과제 D.
- **JIRA 템플릿(RDS/ElastiCache/DynamoDB 3표)**: 담당자 확인 결과 "티켓 1건에 필요한 표만 작성, 불필요 표 삭제" → RDS+ElastiCache 작성, DynamoDB 삭제. (외부 트랙 1차 답변 "티켓 2건"은 오해 — 정정.)
- **Copilot 기재분 검토**: 🔴 AWS Account `THINQ20`→`thinq20_op`(TAG:System 값과 혼동) / 🔴 VPC "확인 후 기재"→`vpc-an2-op-t20-group` / 🟡 Storage 100GB→20GB(gp3) / 🟡 Engine version 문구 / 🟡 SG 이름(출처 불명) 삭제 / 인스턴스명은 ThinqService 태그와 일치하도록 `thinq-real`. ElastiCache 12칸은 외부 트랙이 작성(cache.t4g.micro·Shard 1·Node 2·valkey·TAG·CIDR·국내 저장). Confluence 가이드의 TAG 3종(Resource/Application/ThinqService)은 템플릿에 칸이 없어 추가요청에 기재.
- JIRA 입력: Issue Type `DB자원(문의및검토)`, Summary `[DB자원(문의및검토)][thinq20_op]ThinQ Real 운영(OP)용 RDS PostgreSQL 및 ElastiCache valkey 신규 생성 요청`, Component=`thinq20_op`, Due Date 기본, DB Engine=postgres, Description=용도 2줄 + 표 2개. 「공통」 탭 필수 칸 확인 필요.
- **오픈 목표 = 2026년 11월(잠정)** — 담당자 결정(10월 검토 후 11월로). JIRA 오픈 예정 일정 칸에 "2026년 11월 중 오픈 예정(잠정)". 브리핑 §2·§3-a+b·§3-d 갱신.
- 다음: 담당자 JIRA 제출 → 티켓 번호 기록. 대기: BE팀 cert·SMTP.

## 작업 내역 (2026-09-21 후속 2 — 협업자 역할 확정: 전환 검증(UAT)·운영 준비)

- 담당자 결정: 배정 팀원(실사용 관리자 1인)의 역할 = **전환 검증(UAT)·운영 준비** — 크리티컬 패스(DB·JIRA) 밖이면서 실사용자만 잡을 수 있는 차이를 찾는 일. DB 절차·FieldVoice 이식은 맡기지 않음(전자는 일정 위험, 후자는 범위 미정·녹음 동의 법무 미확정). FieldVoice 이식 범위 정의는 전환 후 검토.
- **산출물**: `uat-checklist.md` v1 — 0 준비 / 1 예약 흐름 15항 / 2 예약 관리 13항 / 3 슬롯 제어 4항 / 4 기타 탭 3항 / 5 설문·대장·방문자·큐레이션 14항 / 6 리포트·ROI 4항 / 7 공개 경로 4항 / 8 정리 / 9 OP·SMTP 이후 6항 + 차이 보고 양식 + 3주 계획. QA 환경 기준, 판정 ○△×, `[UAT]` 접두 테스트 데이터 규칙, 캡처 불가 대비 문구 전사 원칙.
- 브리핑 §5에 협업자 항(역할 한정·사내 Claude 응대 규칙 3가지), `CLAUDE-gitea.md`에 한 줄 추가 — 사내 Gitea 루트 `CLAUDE.md`는 미러 pull 후 사내 Claude가 갱신(`docs:`).
- 운영 장치: 1주 마일스톤·15분 주간 체크·"끝의 정의" 문서화. 개인 평가는 기록하지 않음(역할만).

## 작업 내역 (2026-09-21 후속 3 — ⚠ 사내 페이지가 라이브 백엔드 호출 중 발견 → 키트 v4.1: SCRIPT_URL 자동 치환 + 인증 코드 peek)

- **발견**: 담당자 "Gitea의 정적 파일이 구버전" 지적을 계기로 확인 — 설계 §3의 "전환 시점에 SCRIPT_URL 교체" 계획 때문에 반입된 `public/`이 라이브 사본 그대로이며, **ST/QA/OP가 서빙하는 페이지는 라이브 Apps Script를 호출**. QA UAT를 그대로 하면 운영 시트 오염·실제 알림 발송. UAT 착수 전 차단.
- **구현(키트 v4.1)**: `lib/htmlRewrite.js`(서빙 시 `SCRIPT_URL`→`/api`, `FRONT_API_BASE`/`FRONT_REWRITE`) + `app.js` 마운트 / `auth/codes.js` `peekCode` + GET `auth_code_peek`(outboundSuppressed만, OP 404) — 담당자·협업자가 LENS 없이 QA 인증 코드 확인. 검증: 치환 4경로·privacy·404·peek QA/OP 게이트 통과. 설계 §8-11(⚠ 스펙 대비 변경), api-contract, 브리핑 §2, UAT 체크리스트 0-0·0-3 갱신.
- **정적 동기화 규칙 확정**: `public/` = 라이브 루트 HTML 7종(`index`·`thinqreal_admin`·`ThinQ_Real_ROI_Tool`·`ThinQ_Real_Visit_Survey`·`ThinQ_Real_Visitor_Survey`·`privacy`·`ThinQ_Real_Visit_Consent`) + `images/` 를 **수정 없이 복사** — 미러 경로 규칙: 퍼블릭 루트 → Gitea `public/`. 키트 v4.1에 포함.
- LENS 사용법 미숙은 peek로 우회 — LENS는 스케줄러·edge-sync 로그 확인 등 선택 항목으로만 남김.

## 작업 내역 (2026-09-22 — ✅ 키트 v4.1 배포(0.13.0)·QA 준비 완료, UAT 개시 가능)

- 사내 적용: 코드 5파일 + `public/` 7파일·images 최신화 → 0.13.0. 담당자 실측: 첫 소스 보기에서는 구글 주소(브라우저 캐시) → **시크릿 창에서 `const SCRIPT_URL = '/api'` 확인**, `auth_code_peek` → `no_pending_code`(신규 코드 가동 증거). **QA 페이지가 사내 컨테이너를 호출하는 상태 확정 — 운영 시트 오염 위험 해소.**
- UAT 체크리스트 0-0 선행 조건 ☑. 협업자에게 인계 가능. 남은 것: 담당자가 0-3(코드 요청→peek→로그인)을 1회 직접 해보고 인계 권장.
