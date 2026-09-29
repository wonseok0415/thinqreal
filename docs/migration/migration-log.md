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
- **Copilot 기재분 검토**: 🔴 AWS Account `THINQ20`→가이드의 OP 계정명(internal-context §2-a — TAG:System 값과 혼동) / 🔴 VPC "확인 후 기재"→가이드의 OP VPC명(internal-context §2-a) / 🟡 Storage 100GB→20GB(gp3) / 🟡 Engine version 문구 / 🟡 SG 이름(출처 불명) 삭제 / 인스턴스명은 ThinqService 태그와 일치하도록 `thinq-real`. ElastiCache 12칸은 외부 트랙이 작성(cache.t4g.micro·Shard 1·Node 2·valkey·TAG·CIDR·국내 저장). Confluence 가이드의 TAG 3종(Resource/Application/ThinqService)은 템플릿에 칸이 없어 추가요청에 기재.
- JIRA 입력: Issue Type `DB자원(문의및검토)`, Summary `[DB자원(문의및검토)][AWS 계정명]ThinQ Real 운영(OP)용 RDS PostgreSQL 및 ElastiCache valkey 신규 생성 요청`, Component=AWS 계정명(internal-context §2-a), Due Date 기본, DB Engine=postgres, Description=용도 2줄 + 표 2개. 「공통」 탭 필수 칸 확인 필요.
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

## 작업 내역 (2026-09-22 후속 — 0-3 실측: 코드 요청·peek 정상, 일반 창 캐시 함정 확인)

- 담당자 실측: 일반 창 관리자 페이지 [코드 요청] → 메일 없음·peek `no_pending_code` → 원인은 **캐시된 옛 페이지가 구글 백엔드로 요청**. 주소창 직접 `admin_auth_request` → `ok:true`, `auth_code_peek` → 코드 반환 정상. UAT 체크리스트 0-2에 "처음 열 때 Ctrl+F5 / 시크릿 창" 주의 추가.

## 작업 내역 (2026-09-22 후속 2 — 로그인 "코드 불일치" 진단: healthz에 kv·pod 노출 (키트 v4.2)

- 담당자 실측: 정순서(페이지 코드 요청 → peek → 2분 내 입력)로도 "인증 코드 불일치". 유력 원인 = **레플리카 간 캐시 미공유**(Valkey 미설정/연결 실패 → 메모리 폴백: 코드는 A pod, 검증은 B pod). 같은 상태면 `AUTH_SECRET`도 pod별 임시 키가 되어 토큰 검증까지 어긋남(auth/secret.js 경고 경로).
- **구현**: `kvcache.kvStatus()` + `/healthz` → `{ok, backend, kv, pod}`. 브라우저에서 새로고침 몇 번으로 pod 교대·kv 상태를 LENS 없이 확인. 검증: 로컬 `kv:"memory"`, pod 호스트명 표시.
- 판정 기준: `kv:"shared"`면 다른 원인 추적 / `degraded`·`memory`면 QA deploy의 `KVSTORE_ADDR`·Valkey 연결 문제 → BE팀 문의.

## 작업 내역 (2026-09-22 후속 3 — `kv:shared` 확인으로 레플리카 가설 기각 → 캐시 헤더·peek 진단 보강 (키트 v4.3))

- 담당자 실측(키트 v4.2): `/healthz` → `kv:shared`, `pod:thinq-real-556cd94b45-zl68x`. **"레플리카 간 캐시 미공유" 가설 기각**(적어도 응답한 pod는 Valkey 연결). 코드 대조 결과 `verifyCode`(`stored !== code` 문자열 비교)·`kvGet/kvPut`(Valkey get/set, EX TTL)·페이지 호출 형식(`admin_auth_request`→`admin_auth_verify&email&code`)·이메일 소문자 정규화 모두 정상 — 로컬(memory 모드) 재현 시 요청→peek→검증 `ok:true`.
- **남은 원인 후보 3건**: ⓐ 다른 레플리카 한 쪽만 `degraded`(healthz는 응답한 pod 하나만 보여줌 — 코드 발급 pod와 검증 pod가 다르면 20분 TTL로 남은 옛 코드와 어긋남) ⓑ **GET 응답 캐시** — 사내 게이트웨이·프록시·브라우저가 `auth_code_peek` JSON을 재사용해 옛 코드를 보여줌(페이지가 새 코드를 발급했는데 peek는 직전 코드) ⓒ 환경 혼동(ST에서 peek·QA에서 로그인 등 — 환경별 Valkey가 다르면 코드가 다름).
- **구현(키트 v4.3, 3파일)**: `app.js` — `/api`·`/pub`·`/healthz` 응답 `Cache-Control: no-store`(ⓑ 원천 차단) / `lib/htmlRewrite.js` — 치환 HTML `Cache-Control: no-cache`+ETag(UAT 0-2 "옛 페이지 캐시" 함정 차단) / `routes/get.js` — `auth_code_peek` 응답에 `pod`·`kv` 동봉(ⓐ 판별). 로컬 검증: 헤더 3종·요청→peek(2회 동일)→오답 `code_mismatch (남은 시도 4회)`→정답 `ok:true` 토큰.
- **담당자 실측 절차(v4.3 적용 후, QA 한 환경·한 탭·주소창만)**: ① `/healthz` Ctrl+F5 5회 — pod 이름이 바뀌는지, 전부 `kv:shared`인지 ② `admin_auth_request` → `ok:true` ③ peek Ctrl+F5 3회 — `code`·`pod`·`kv` 기록 ④ `admin_auth_verify&code=` → 결과 JSON 전문. 주소창 경로가 `ok:true`면 페이지 경로만 재확인(페이지 [코드 요청] → 즉시 peek Ctrl+F5 → 입력). api-contract·UAT 0-3에 반영.
- 판정표: ④ `ok:true` → 해결(캐시 원인) / ④ `code_mismatch`인데 ③의 pod가 서로 다르고 `kv`에 `degraded`가 섞임 → ⓐ, BE팀에 해당 pod Valkey 연결 확인 요청 / ④ `code_expired` → 요청과 검증이 다른 저장소(ⓐ 또는 ⓒ) / `too_many_attempts` → 20분 대기 후 재시도.

## 작업 내역 (2026-09-22 후속 4 — ✅ 키트 v4.3 적용, QA 관리자 로그인 통과 → UAT 0-3 종결)

- 담당자 실측(v4.3 적용 후, QA 주소창): `/healthz` `kv:shared` / `admin_auth_request` `ok:true`(재클릭 시 `cooldown` — 정상) / peek 코드 확인(재요청으로 140936→193660 갱신됨) / `admin_auth_verify` → **`ok:true` + token**. 이어서 페이지 경로(시크릿 창 → [인증 코드 받기] 1회 → peek → 입력) → **대시보드 진입.**
- **결론**: 코드 발급·Valkey 저장·검증·토큰 서명은 QA 멀티 레플리카에서 정상. 이전 "인증 코드 불일치"는 **옛 코드 재사용** — ⓑ GET 응답 캐시(v4.3 `no-store`로 차단) 또는 [코드 요청] 재클릭으로 코드가 갱신된 뒤 먼저 본 코드를 입력한 경우. 레플리카 캐시 미공유(ⓐ)·환경 혼동(ⓒ)은 아님. UAT 0-3에 "[코드 요청]은 한 번만, 재요청 시 이전 코드 무효" 명시 + ☑.
- 상태: **QA UAT 개시 가능 — 협업자 인계.** 브리핑 §2 갱신. 다음: 담당자 → 현진 선임 인계(0-1~0-7 함께 1회) / DBSUPPORT JIRA 제출 / 박현정 회신(cert). 외부 트랙은 차이 보고(△·×) 대기.

## 작업 내역 (2026-09-22 후속 5 — 협업자 인계 준비 종결·DBSUPPORT JIRA 추가요청 칸 재검토)

- **협업자(UAT) 인계 준비는 여기까지** — 담당자 지시. 산출물(`uat-checklist.md` v1, 브리핑 §5 협업자 항, `CLAUDE-gitea.md` 한 줄)과 QA 0-3 통과로 인계 조건 충족. 실제 인계(0-1~0-7 동행 1회)·주간 체크는 담당자가 사내에서 진행하고, 외부 트랙은 차이 보고(△·×)가 오면 판독한다. 이 건의 열린 항목 없음.
- **JIRA 추가요청 칸 재검토(담당자 요청 — CIDR 기재 여부·정확성)**: 9/21 검토본은 RDS·ElastiCache 두 표의 추가요청에 KIC-OP CIDR 4개를 "방화벽 오픈 요청"으로 적었음. 재검토 결론 — ① 그 4개 대역의 **출처는 Vault 가이드(`tcn.guide.k8s.secret-with-vault`)의 KIC-OP Allowed Bound CIDR**(BE팀 9/15 안내, internal-context §2-c)이며 DB 생성 가이드·JIRA 템플릿은 CIDR 칸을 요구하지 않음(Copilot이 추가한 항목). ② 같은 클러스터 대역일 가능성은 높지만 DB 방화벽 용도로 검증된 값이 아니므로, **요구값으로 단정하지 않고 "참고: Vault 가이드 KIC-OP 대역" + "DB팀 표준 SG/방화벽 규칙과 다르면 표준 우선"으로 표기**, 접속 주체는 말("TCN EKS KIC-OP 클러스터 extapps 네임스페이스의 thinq-real pod")로 적는다 — 틀린 대역만 열려 접속이 막히거나 불필요 규칙이 생기는 위험 회피. ③ 숫자 자체는 외부 트랙이 9/15 안내를 전사한 값이라 독립 검증 불가 — 담당자가 Vault 가이드 원문(또는 internal-context §2-c)과 한 자리씩 대조 후 제출. ④ 나머지(용도·TAG 3종·계정 별도 신청·국내 저장)는 유지. 브리핑 §3-a+b 갱신. 사내 식별자·대역 값은 규칙대로 리포 미기재.
- **⚠ 규칙 위반 정정**: 9/21 기록(migration-log·브리핑 §3-a+b)에 AWS 계정명·VPC명이 그대로 적혀 있었음(사내 식별자 리포 미기재 규칙 위반). 현재 파일에서 "internal-context §2-a 참조"로 치환 — **git 이력에는 남아 있음**(퍼블릭 리포 이력 재작성 여부는 담당자 판단). 이후 사내 식별자 grep(`thinq20|vpc-an2|scg-an2|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/`)을 커밋 전 점검에 추가.

## 작업 내역 (2026-09-23 — DBSUPPORT JIRA 발행, DB팀 요청 "서비스 개요·시스템 아키텍처" 원고 작성)

- 리포 상태: main = #140, 브랜치 동일, 9/21 이후 라이브 델타 0.
- 담당자: DB 생성 JIRA **티켓 발행 완료**(번호·기재 수정분은 추후 전달 예정 — 수신 시 브리핑 §3-a+b에 기록). 추가요청 칸은 9/22 논의(공란 또는 TAG 3종 한 줄) — 최종 선택은 수정분과 함께 확인.
- DB팀 1차 요청: 서비스 개요·시스템 아키텍처 문서. 판단: **이관 목표 시스템(EKS 컨테이너 + RDS + valkey) 기준**으로 작성 — DB팀의 관심은 "무엇이 어떤 방식·규모로 DB에 붙는가"이므로 현행은 배경 한 줄. 원고 `service-overview-architecture.md` v1(8절: 개요 / 구성 요소 / 구성도(텍스트) / RDS 데이터·접속(표 14개·전 컬럼 TEXT·풀 pod당 5·APP 계정 DDL 권한 필요 명시) / valkey 사용 방식(영속 없음) / 하이브리드 에지(3표는 사내 미러) / 과제 D 절차 / 식별자 채움 목록). 식별자는 `《…》`로 비움 — 완성·Word 변환은 사내 Claude(브리핑 §3-a+b 갱신).
- 확인 포인트(DB팀과 조율): APP 계정에 CREATE TABLE·ALTER 권한(기동 시 자동 스키마) — 불가면 MGR로 1회 기동 후 APP 전환 절차.

## 작업 내역 (2026-09-23 후속 — 제출된 DB 요청서 반영: Aurora PostgreSQL 17·추가요청 공란, 아키텍처 원고 v2(외부 접점 배제))

- 담당자가 JIRA에 제출한 RDS·ElastiCache 요청서(md 변환본)를 수령. **9/21 검토본과의 차이**: DBMS `Postgre`→**Aurora PostgreSQL 17.x LTS** / TAG System·HQ 값 변경, TAG 4종을 표 안에 기재 / **추가요청 칸 공란**(9/22 논의의 "공란" 안 채택 — TAG가 표 안에 들어가 한 줄 필요성 소멸) / Summary 접두·Instance 명의 account 자리가 조직 약칭 / 오픈 11월. 값 자체는 사내 식별자라 리포 미기재 — **internal-context §2-a·§2-b를 제출본으로 갱신하는 것은 사내 Claude 작업**(브리핑 §3-a+b에 지시).
- **Aurora 호환 판단**: 앱은 `pg` 드라이버 + 표준 SQL(CREATE TABLE IF NOT EXISTS·ADD COLUMN IF NOT EXISTS·BIGSERIAL)만 사용 → Aurora PostgreSQL 와이어 호환으로 **코드 변경 없음**. 접속은 클러스터 writer 엔드포인트(reader 미사용), TLS on(`DB_SSLMODE` 기본). 외부 검증 16 → 17도 사용 기능 범위 내.
- 제출본 검토 메모(정정은 DB팀 요청 시): valkey Instance 명에 RDS 접미 잔존(복붙 오기 추정) / Aurora에 20GB·gp3 항목 무의미 / ElastiCache TAG Resource `Database`(가이드 예시 `Cache`).
- **`service-overview-architecture.md` v2**: 담당자 지시로 **외부 접점(사외 호출자·pull 동기화) 관련 내용 전부 배제** — 구 §6 하이브리드 에지 삭제, 구성도에서 외부 박스·egress 제거, 기능 목록에서 FieldCheck·FieldVoice 문구 제거, 구성 요소 표에서 외부 연동 행 삭제. 엔진 Aurora PostgreSQL 17 반영(writer 엔드포인트·TLS·자동 확장 스토리지). "DB 접근 주체는 앱 컨테이너 하나(별도 ETL·BI·타 시스템 없음)" 문장 추가. 7절로 재편.

## 작업 내역 (2026-09-23 후속 2 — 제출본 정정 1건 확정, 요청서 파일 Gitea 배치)

- DB팀 확인: ElastiCache Instance 명은 **`-pgsql-aurora` 접미만 삭제**하면 됨(외부 트랙 지적 사항 확인). 담당자가 제출본 `db-request-2026-09-23.md`에 직접 반영 → 리포 기록만 갱신(브리핑 §3-a+b 검토 메모 1건 종결, 나머지 2건은 DB팀 요청 시 대응).
- 요청서 md는 Gitea `docs/migration/db-request-2026-09-23.md`(사내 전용, internal-context 옆)에 배치 — 사내 Claude가 이를 읽어 internal-context §2-a·§2-b 갱신 후 아키텍처 원고 Word 변환(9/23 프롬프트 2단계). 결과 대기.

## 작업 내역 (2026-09-23 후속 3 — Gitea 파일 반입 차단 → 아키텍처 Word를 외부 트랙이 직접 생성·전달)

- 담당자: 사내 보안 프로그램이 요청서 md의 Gitea 반입을 차단(해결은 담당자가 별도 추진). DB팀 제출이 급하므로 우회: **외부 트랙이 원고 v2에 제출 요청서 값을 채운 Word(.docx)를 직접 생성해 담당자에게 전달** — 사내 식별자가 든 문서의 반입 경로는 9/15 internal-context와 동일(담당자 개인 메일 zip → 사내 PC, docx는 차단 대상 아님). 리포에는 미커밋(스크래치 생성).
- 문서 구성: 표지 정보(보안 등급·JIRA Summary·담당) / 1 개요 / 2 구성 요소 + 신청 자원 공통값 한 줄 / 3 구성도(표 박스 4개) / 4 Aurora(클러스터·17.7 LTS·writer·풀 5·계정·DDL 권한) / 5 valkey(수정된 Instance 명) / 6 이행 절차 / **7 DB팀 확인 요청 3건**(APP 계정 DDL 권한, writer 엔드포인트·TLS, valkey 엔드포인트). 스키마 검증 통과(docx validate) — 샌드박스 LibreOffice 고장으로 시각 렌더 미확인, 담당자가 Word에서 표 폭·줄바꿈만 눈으로 확인.
- internal-context §2-a·§2-b 갱신은 파일 없이 진행: 사내 Claude에 **값을 채팅에 직접 붙여 넣어** 갱신 지시(브리핑 §7 압축 양식 — 식별자는 채팅 허용). 요청서 md 반입은 보안 프로그램 해결 후 선택 사항.

## 작업 내역 (2026-09-23 마감 — internal-context 제출본 반영 완료, DB팀 회신 대기)

- 사내 Claude: internal-context §2-a·§2-b를 제출 요청서 값(채팅 붙여넣기)으로 갱신·커밋 완료 — 파일 반입 없이 단일 소스 정합 확보.
- 오늘 결과: QA 관리자 로그인 통과(UAT 0-3 종결, 협업자 인계 가능) / 키트 v4.2·v4.3 = 0.14.0·0.15.0 / DBSUPPORT JIRA 발행(Aurora PostgreSQL 17 + valkey) / 아키텍처 Word 외부 생성·전달 / 9/21 기록의 사내 식별자 치환.
- **대기 항목**: ① 담당자 — Word 확인 후 JIRA 첨부, 티켓 번호 전달 ② DB팀 — 확인 요청 3건 회신(APP 계정 DDL 권한 / writer 엔드포인트·TLS / valkey 엔드포인트) → OP env 주입 설계 확정 ③ BE팀 — sealed-secrets cert·SMTP ④ 협업자 UAT 차이 보고. 외부 트랙 다음 코드 작업 = 과제 D 키트 v5(`admin_import`), DB 생성 완료 통보 후 착수.

## 작업 내역 (2026-09-27 — DBSUPPORT 티켓 진행 중·사내 SMTP 스펙 반영(키트 v4.4)·협업자 할 일 확정)

- 리포 상태: main = #144(9/23 머지 확인), 라이브 델타 0.
- **DB 자원**: DBSUPPORT JIRA 티켓이 발행되어 DB팀 담당자가 진행 중 — **티켓 번호는 internal-context §2-a에 기록(사내 Claude, 채팅 전달)**, 퍼블릭 리포 미기재. 아키텍처 Word 첨부 여부는 담당자 확인.
- **사내 SMTP 스펙 수령(BE팀 9/23 Teams + Confluence 가이드)**: 릴레이 호스트:25, 무인증, DNS 이름 사용, 평문 세션 샘플(Python smtplib), 결과 판정 refused_recipients. **제약: KIC-QA는 방화벽으로 발송 불가(TCP는 붙으나 greeting 전 종료 — 해결에 시간), KIC-ST·KIC-OP는 접수 확인됨.** BE팀 담당 휴가 ~10/5(급한 건 Task Leader에게 같은 채널). 호스트·담당자명은 internal-context §2-d·§3(사내 전용).
- **구현(키트 v4.4, 4파일: `config.js`·`mail/mailer.js`·`handlers/diagnostics.js`·`routes/get.js`)** — 설계 §8-12: `SMTP_IGNORE_TLS`(평문 세션)·`SMTP_TLS_REJECT_UNAUTHORIZED`(기본 false)·`SMTP_EHLO_NAME`·`MAIL_REPLY_TO`·타임아웃 30초 / **`MAIL_FORCE_SEND=true` = 비운영 환경에서 메일만 실발송**(ST SMTP 실측 창구, 텔레그램·Teams 억제 유지) / `sendMail`에 릴레이 응답(accepted·rejected·response) / **`mail_test`는 실발송 환경에서 관리자 토큰 필수 + `to=` 단일 @lge.com 옵션**(첫 실측을 담당자 3인 대신 본인 수신으로) / `mail_status` 필드 확장. 로컬 더미 SMTP(1025, 평문)로 토큰 게이트·to 검증·250 OK 접수·QA 콘솔 모드 확인. api-contract 갱신.
- **적용 절차(브리핑 §3-g2)**: ST configmap에 SMTP env 6종 + `MAIL_FORCE_SEND=true` → 릴리스 → `mail_test&token&to=본인` → accepted 확인·수신함 확인 → OP에 같은 env(강제 변수 없이) → 동일 확인 → ST의 강제 변수 제거. **QA에는 SMTP env를 넣지 않는다.** 발신 주소는 `thinqreal-noreply@lge.com` 형태로 실측 후 릴레이 거부 시 BE팀 문의(휴가 후).
- **협업자 할 일(uat-checklist에 표로 추가)**: ① 1~8단계 UAT 전부(QA) ② 차이 보고 ③ **현행 메일 5종 수신본 확보**(9단계 비교 기준) ④ 운영 전환 안내문 초안 ⑤ 9단계는 OP/ST에서 담당자 신호 후. UAT §9에 "QA 불가 → OP 또는 ST, OP는 [UAT] 접두+담당자 고지" 명시. 루트 CLAUDE.md 이관 상태 줄 갱신.
- 다음: 담당자 — ST/OP SMTP 실측 결과(accepted·발신 주소 거부 여부·Outlook 렌더) / DB팀 회신(APP 계정 DDL 권한·엔드포인트) / 협업자 UAT 착수 신호.

## 작업 내역 (2026-09-28 — UAT 환경 결정: 원안(QA) 유지)

- 담당자 질문 "QA가 불안정하니 ST에서 UAT하는 게 낫지 않나" → 판정: **QA는 불안정하지 않음**(BE팀 언급은 SMTP 발송 불가 한 가지, 로그인·DB·Valkey 실측 통과). 외부 트랙은 협업자 편의(1~9단계를 메일 포함 한 환경에서)와 OP 실알림 회피를 이유로 ST 전환을 제안(필요 env: ST `ADMIN_ALERT_TO/CC`를 협업자·담당자로, `MONTHLY_REPORT_TO` 미설정, UAT 기간 ST 키트 동결).
- **담당자 결정: 원안대로 QA에서 협업자 UAT 진행.** 1~8단계 = QA, 9단계(메일) = 담당자가 시점·환경(OP 또는 ST) 지정 — uat-checklist 현행 문안 그대로. ST는 담당자의 SMTP 실측·키트 검증 전용으로 유지. 체크리스트·브리핑 변경 없음.

## 작업 내역 (2026-09-28 후속 — 협업자 UAT 계획 3주 → 1주로 압축)

- 담당자 지적 "계획이 러프하고 3주는 과함" → 외부 트랙 동의: 1~8단계 57항목은 실작업 4~6시간이라 본업 병행 5일이면 충분. 구 3주 계획은 주 단위 여유를 둔 것이지 작업량 근거가 없었음.
- `uat-checklist.md` 「주간 계획」을 **「1주 계획」(일차별 범위·끝의 정의·비고)**으로 교체: 1일차 0+1단계 / 2일차 2+3 / 3일차 4+5 / 4일차 6+7+차이 보고 / 5일차 리뷰·재현·8단계 정리 = 협업자 UAT 종료. 9단계(메일)는 별도 반나절, 담당자 신호 후(9-5는 익일 08:30 대기 — 「이력 추가」로 어제 날짜 예약 생성 요령 기재). 중간 점검 3일차 15분 1회, "한 항목 30분 이상 매달리지 않기" 규칙. 협업자 할 일 표 1행도 "5일 안에" 로 정정.
- **후속(같은 날)**: 담당자 지시로 "담당자 동행·정기 점검" 요소 전부 삭제 — 0단계는 협업자 혼자(표대로), 1일차 동행 30분·3일차 15분 점검·5일차 30분 리뷰 폐지. 5일차 = 재현 확인 → 정리 → 판정표+차이 보고 전달(비동기, 텍스트). 막힘은 사내 Claude(0-7) 1차 → 담당자 문구 전사, 답을 기다리지 않고 다음 항목.

## 작업 내역 (2026-09-28 후속 2 — ✅ ST SMTP 실측 통과(키트 v4.4))

- 담당자 실측: 키트 v4.4 적용 후 ST에서 `mail_test&token&to=본인` → **성공**(릴레이 접수·수신). 사내 SMTP 릴레이(25/무인증/평문) + `thinqreal-noreply@lge.com` 발신이 ST에서 동작 확인 — 발신 주소 정책 문의는 현재 불필요(거부되면 재론).
- 다음(담당자): ① OP configmap에 같은 env 6종(`MAIL_FORCE_SEND` 없이 — OP는 원래 실발송) → 릴리스 → OP `mail_test&token&to=본인` ② 통과 후 ST의 `MAIL_FORCE_SEND=true` 제거(ST 예약 데이터로 초대·리포트 메일이 실발송되지 않게). ③ OP 통과 시 UAT 9단계 환경·시점 지정 가능. 브리핑 §3-g2 상태 갱신.
- 미결 유지: 일 발송 한도·첨부 크기(월간 리포트 PNG cid) — OP 6-4 테스트 발송으로 확인, 문제 시 BE팀(휴가 후).

## 작업 내역 (2026-09-28 후속 3 — ⚠ OP SMTP env 미반영: 진단용 `/healthz` version·env 추가 (키트 v4.5))

- 담당자 실측: OP configmap에 SMTP env 6종 추가 후 `mail_test` → `ok:true`이지만 메일 미도착. `mail_status` = `mailMode:console`·`smtpHost:미설정`·`smtpPort:587` → **OP pod가 새 env를 읽지 않음**(콘솔 모드의 ok:true는 실발송 아님). 1차 가설 "configmap만 바뀌면 pod 미재시작" → 새 릴리스로 rollout 유도 → **여전히 console** (pod 교체 여부는 미확인).
- 남은 후보: ⓐ 릴리스가 OP에 롤아웃되지 않음(ArgoCD OP 자동 sync 아님 / 릴리스가 OP 대상 아님) ⓑ env를 넣은 파일이 OP deployment가 참조하는 configmap이 아님(overlay 경로·이름 불일치, 또는 deployment가 envFrom이 아니라 명시 env 키만 주입 — ST에서 어떻게 넣었는지와 diff 필요) ⓒ configmap 커밋이 main에 없거나 sync 안 됨.
- **구현(키트 v4.5, `app.js` 1파일)**: `/healthz`에 `version`(package.json — 릴리스 번호)·`env`(ENVIRONMENT) 추가 → 브라우저만으로 "이 환경에 어느 릴리스가 떠 있는가"를 판별(ⓐ 분리). api-contract 갱신. 로컬 검증 `{"version":"0.1.0","env":"kic-op"}`.
- 사내 Claude 확인 지시(브리핑 §7 양식으로 담당자 전달): ① OP configmap 커밋이 main에 있는지 ② OP deployment(또는 kustomize overlay)가 그 configmap을 envFrom으로 참조하는지, ST와 어떻게 다른지(diff) ③ ArgoCD OP 앱의 sync 정책. LENS·BE팀은 ①~③ 결과가 나온 뒤에만.
- **원인 확정(같은 날, 사내 Claude 저장소 판독)**: 후보 **3) — ArgoCD OP 앱이 main이 아닌 별도 브랜치·경로(targetRevision)를 추적**. 릴리스 이미지 태그는 그 경로로 갱신되어 pod는 교체됐지만(healthz pod 변경 확인), main에만 넣은 OP configmap 수정은 OP 앱에 도달하지 않음. ST는 main 추적이라 정상. **규칙 추가(gitea-repo-contract 반영 예정)**: OP 매니페스트(configmap·deployment) 변경은 OP 앱이 추적하는 브랜치에 반영해야 하며, configmap만 바뀌면 pod가 재시작되지 않으므로 반영 후 healthz pod 변경을 확인하고 안 바뀌면 새 릴리스로 rollout. 브랜치명·권한(보호 브랜치 여부)은 사내 Claude 확인 → internal-context.

## 작업 내역 (2026-09-28 후속 4 — "원인 3" 재검토: Gitea 브랜치는 main뿐 → 진단 `env_keys` 추가 (키트 v4.6))

- 사내 Claude 재확인: **Gitea 저장소 브랜치는 main 하나** → "OP 앱이 다른 브랜치 추적" 판정은 저장소에서 읽은 사실이 아니라 추론이었음(ArgoCD Application 정의는 저장소 밖 — BE팀 플랫폼 소관). 남은 후보: ⓐ targetRevision이 태그·SHA 고정 ⓑ source.path가 `deploy/kic-op`가 아닌 다른 경로·**다른 저장소**(9/1 BE팀이 OP 배포를 직접 수행한 이력과 부합 — OP 매니페스트 사본이 BE 측에 있을 가능성) ⓒ OP kustomization resources에 configmap.yaml 미포함(1차 확인 미실행). 확정된 사실은 둘: 릴리스 이미지는 OP에 도달(pod 교체), main의 OP configmap 수정은 미도달.
- **구현(키트 v4.6, `diagnostics.js`·`get.js`)**: GET `env_keys` — pod env **이름만**(값 없음) + 그룹 요약(kvstore/db/smtp/authSecret/legacyAuthSecret/environment). OP 관리자 토큰 필수, ST/QA 생략. 로컬 검증: OP 무토큰 unauthorized / ST 그룹 요약·값 미누출 확인. api-contract 추가. **판독법**: OP에서 `groups.kvstore:true`면 base configmap이 OP에 도달 → SMTP env를 `deploy/base/configmap.yaml`로 옮기면 해결(QA·ST는 발송 억제라 무해, `MAIL_FORCE_SEND`는 base 금지) / `kvstore:false`면 base도 미도달 → OP 매니페스트는 BE 측 관리 → BE팀에 "OP 앱 source(repo·path·revision)" 문의 + SMTP env 6종 반영 요청.
- 사내 Claude 추가 확인 지시: `.gitea/workflows`가 이미지 태그를 **어디에 어떻게** 쓰는지(main의 deploy 파일 커밋? 외부 저장소? ArgoCD API?) — OP 전달 경로의 유일한 저장소 내 단서.

## 작업 내역 (2026-09-28 후속 5 — ✅ OP SMTP 실측 통과, "원인 3" 정정, healthz version 폴백 (키트 v4.7))

- 담당자 실측: OP `mail_test&token&to=본인` → **250 OK·수신**. 사내 SMTP 릴레이 적용은 ST·OP 모두 종결. 키트 v4.5·v4.6 ST·OP 반영 확인(`/healthz` env = kic-st/kic-op).
- **정정**: 사내 Claude 최종 보고 — OP configmap 미반영은 **ArgoCD sync·rollout 지연**이었고 "별도 브랜치 추적"(후속 3 기록)은 틀린 추론(저장소 브랜치는 main뿐). 후속 3에 적은 "OP 매니페스트는 별도 브랜치에 반영" 규칙은 **폐기**. 대신 브리핑 §4에 교훈 추가: 저장소 밖 설정(ArgoCD 등)은 추론으로 확정하지 말고 진단 엔드포인트 실측 + 시간차 재확인으로 판별. deployment env 이동 우회는 미실시(불필요해짐).
- 중간에 나온 `env_keys` `bad_signature`는 토큰 출처(현행 사이트 탭의 동일 localStorage 키) 또는 pod 간 서명 키 문제 후보였으나, 이후 OP 토큰 호출이 정상 통과해 재현되지 않음 — OP `/healthz` `kv` 값은 다음 기회에 확인(shared여야 함).
- **키트 v4.7(`app.js`)**: `/healthz` `version`이 ST·OP에서 `unknown` → 사내 이미지의 package.json 위치가 설계 Dockerfile과 다른 것으로 추정. 해결 순서 `APP_VERSION` env → `npm_package_version` → package.json 후보 3경로(../, cwd, src/, /app). 다음 키트에 동봉(단독 적용 불필요).
- 상태: SMTP 건 종결 → UAT 9단계(메일)는 OP에서 수행 가능(uat-checklist §9 메모). 남은 확인: ST configmap의 `MAIL_FORCE_SEND` 제거 여부, OP `/healthz` kv.
- **후속 확인 완료(같은 날)**: OP `/healthz` `kv:shared`(pod 간 서명 키 공유 정상 — `bad_signature`는 토큰 출처 문제로 종결) / ST `mail_status` `forceSend:false`(`MAIL_FORCE_SEND` 제거 확인). **SMTP 트랙 열린 항목 0.** 브리핑 §3-g2의 "ST MAIL_FORCE_SEND 제거 확인 필요"는 해소.

## 작업 내역 (2026-09-28 후속 6 — DB 생성 대기 중 선행 가능 작업 점검 + ⚠ OP 스케줄러 실발송 위험)

- **⚠ 즉시 조치 권고 — OP `JOBS_DISABLED=true`**: OP에 SMTP가 살아난 순간부터 OP 컨테이너의 인앱 스케줄러가 실메일을 보낼 수 있다. ① 07:40 FieldCheck 일일 요약은 **점검 기록이 없어도 "점검 기록 없음" 메일을 발송**(`FC_TEST_MODE=true`라 운영자 1인 수신) — 현행 Apps Script와 **중복** ② 08:30 설문 초대는 OP DB의 테스트 예약(확정·방문일 경과·@lge.com)에 실발송 ③ 10/7(첫째 수요일) 월간 리포트(`MONTHLY_REPORT_TO` 미설정이라 스킵 예상이나 미검증) ④ edge-sync 10분 pull은 무해하나 전환 전 OP에서는 불필요. → **전환일까지 OP configmap에 `JOBS_DISABLED=true`**(`index.js`가 스케줄러 자체를 띄우지 않음 — 일일 잡·간격 잡 모두 정지). 전환 D-day 체크리스트에 "OP `JOBS_DISABLED` 제거 + 현행 Apps Script 트리거 삭제"를 세트로.
- **DB 생성 전 선행 가능 작업(외부 트랙 판단)**: ⓐ **과제 D 키트 v5(`admin_import` + 관리자 「데이터 이행」 패널 + 스냅샷 추출)** — OP DB와 무관하게 구현·**QA 리허설**까지 가능(QA는 PostgreSQL 가동 중). 설계 §8-9 선행조건 중 SMTP·SSO는 충족, OP 자원은 D-day 적재에만 필요 → **착수 가능, 가장 큰 항목** ⓑ 전환(cutover) 계획서 초안 — 동결·이행·검증·안내·롤백·현행 트리거 정지·QR/CNAME 처리 순서 ⓒ 협업자 UAT 1~8 착수(담당자 신호만) ⓓ Vault secret store(절차 c) — DB와 독립, 사내 절차 ⓔ 접속 계정 DBSUPPORT JIRA(절차 d)는 DB 생성 후. 대기: cert(2단계·Teams 웹훅·캘린더 SA 주입), DB팀 회신.
- **사내 Claude에서 확인받을 사항(담당자 캡처 요청)**: ① Gitea `Dockerfile` 전문(WORKDIR·COPY 순서 — `/healthz version unknown` 원인, APP_VERSION 주입 지점) ② `.gitea/workflows/*.yaml` 릴리스 단계(버전 번호 산출·태그·package.json 갱신 여부·env별 배포 트리거) ③ `deploy/` 트리(base·overlay 파일 목록)와 각 configmap의 **키 이름만**(값 제외) ④ internal-context.md 목차(§2-a 티켓 번호·§2-d SMTP 반영 확인) ⑤ 현재 ST/QA/OP 릴리스 번호(Actions 최신 release 커밋) ⑥ `git log --oneline -15` (사내 커밋 이력 동기화용).

## 작업 내역 (2026-09-28 후속 7 — DBSUPPORT 티켓 1차 회신 대응 + OP 스케줄러 정지 완료)

- **OP `JOBS_DISABLED=true` 반영 완료**(사내 Claude 실행, 담당자 확인) — 전환일까지 OP 인앱 스케줄러 정지(실메일 중복 방지). D-day 체크리스트에 "제거 + 현행 Apps Script 트리거 삭제" 세트 예정.
- **DB팀 1차 회신(티켓 번호는 internal-context §2-a)** 4건과 담당자 회신(외부 트랙 작성):
  ① 자원 구성 → **PRD만** 생성(DEV/QA는 BE팀 공용 자원 사용 중)
  ② 네이밍 → 인프라 표준 네이밍 수용(서비스명 하이픈 제거 형태 — 앱은 env로 주소를 받으므로 무영향, 확정명은 internal-context §2-a·§2-b 갱신 대상)
  ③ 스펙 → 표준 db.r6g.large 대신 요청대로 **db.t4g.medium 수용**(수천 행·동시 접속 10 이하·읽기 위주 — 근거 회신), 오픈 전 Multi-AZ 별도 요청 유지
  ④ Extension → **없음**(표준 SQL·TEXT·BIGSERIAL만)
  + 담당자가 덧붙인 확인 요청 3건: UTF-8 인코딩 / **APP 계정의 CREATE·ALTER 권한**(기동 시 자동 스키마 — 불가 시 MGR 1회 기동 후 APP 전환) / 완료 시 writer 엔드포인트·포트·TLS 방식·Valkey 엔드포인트 전달.
- 담당자 이해용 설명 기록: 테이블=시트 탭 1:1(14개), 앱이 기동 시 자동 생성·확장(현행 Apps Script의 탭 자동 생성 승계) → APP 계정 DDL 권한 유무에 따라 첫 기동 절차만 달라짐(권한 있음: 무조치 / 없음: MGR로 1회 기동 후 env 2줄 교체 — 이후 컬럼 추가 키트마다 MGR 기동 규칙 발생).
- 다음: DB팀 2차 회신(권한·엔드포인트) → 접속 계정 DBSUPPORT JIRA(절차 d) → OP env 주입(g, cert 필요). 병행: 과제 D 키트 v5 착수 여부는 담당자 신호.

## 작업 내역 (2026-09-28 후속 8 — 전환 계획서 `cutover-plan.md` v0.1 초안 + Multi-AZ 항목)

- 담당자 질문 "Multi-AZ 전환이 요청서에 있었나" → DB팀 템플릿 가이드 문구(개발 중 PRD/Single → 오픈 전 PRD/Multi-AZ 추가 요청)이지 담당자 기재가 아님. 의미(다른 가용 영역 대기 인스턴스·자동 failover, 비용 ≈ 인스턴스 2대, Aurora 저장소는 어차피 3AZ 복제라 "멈춤 시간" 차이)와 판단(PRD 표준 준수 권고, 비용 소폭) 설명. 담당자 결정: **전환 계획서에 항목으로 넣는다.**
- **`cutover-plan.md` v0.1 신설**(선행 가능 작업 ⓑ): §0 전제(외부 접점 유지·시트 읽기 전용 보존·한쪽만 켜기) / §1 T-4주~D+7 일정표(**Multi-AZ 요청 = T-1주**, 리허설 후·전환 작업과 안 겹치게) / §2 D-day 10단계(동결→스냅샷→적재→검증→현행 트리거 삭제→OP `JOBS_DISABLED` 제거→현행 사이트 안내→발송→첫 실거래→기록, 단계별 되돌리기) / §3 기능별 스위치 표 / §4 역할 / §5 D-1 사전 조건 / §6 rollback / §7 미결 5건. 브리핑 §3-h·루트 CLAUDE.md 문서 목록에 등재. 담당자 검토 전 초안.

## 작업 내역 (2026-09-28 후속 9 — DB팀 추가 질의: Valkey TLS 활성 → 앱 대응(키트 v4.8))

- DB팀: OP ElastiCache valkey를 **Encryption in transit(TLS) 활성**으로 생성(클라우드 영향평가 기준) — 수용 가능 여부 문의. 외부 트랙 판단: **수용** — 앱은 node-redis 클러스터 클라이언트라 TLS 지원, 코드에 옵션만 추가하면 됨. 반대로 거절하면 표준 예외가 되어 오히려 일정 위험.
- **구현(키트 v4.8, `config.js`·`lib/kvcache.js`)**: `KVSTORE_TLS`/`rediss://`·`KVSTORE_TLS_REJECT_UNAUTHORIZED`·`KVSTORE_USERNAME/PASSWORD` → `createCluster.defaults`(socket.tls·자격 — 클러스터 전 노드 적용). 미설정 시 평문 유지(ST/QA 무영향). 설계 §8-13.
- 담당자 회신문 작성(TLS OK + 확인 3건: AUTH/RBAC 여부·configuration endpoint·인증서 CA). 티켓·값은 internal-context.
- **회신 발송(같은 날)**: 담당자가 DB팀에 "TLS 활성 수용 + 확인 3건(AUTH/RBAC 여부·configuration endpoint·인증서 CA)" 회신. 키트 v4.8은 GitHub 머지(PR #155), 사내 적용은 다음 키트와 동봉(OP 자원 수령 전에는 실측 불가). DB팀 회신 대기 항목: APP 계정 DDL 권한 / Aurora writer 엔드포인트·TLS / valkey endpoint·AUTH 여부·CA.

## 작업 내역 (2026-09-29 — UAT 첫 문의: "구비 가전 Failed to fetch" + 담당자 코드 미수신 → 준비 단계 미적용, 해결)

- 협업자 문의: QA 관리자 구비 가전 탭 "Failed to fetch". 담당자도 인증 코드 미수신. 판독: **옛 페이지(구글 호출본) 캐시**(0-2 함정) — 예약 목록은 localStorage 캐시로 그려져 정상처럼 보이고, 캐시 없는 구비 가전만 실패가 드러남. 담당자 실측: `/api?type=appliances` 직접 호출 45건 정상 → 시크릿 창에서 `SCRIPT_URL='/api'` 확인 → 주소창 `admin_auth_request` ok → peek 코드 → **페이지에서 이메일 재입력·재요청으로 코드 갱신되어 불일치** → peek 재조회 후 입력 → **로그인 성공, 구비 가전 45건 정상**. 컨테이너 결함 아님, 차이 보고 대상 아님.
- uat-checklist에 「막혔을 때 먼저 볼 표」(증상→원인→해결 4행) 추가 — 협업자가 담당자 없이 자가 해결하도록. 순서 원칙 "페이지 요청 → peek → 입력" 재강조.

## 작업 내역 (2026-09-29 후속 — 사내 구조 보고서 판독: 릴리스 메커니즘 확정, configmap-only 무롤아웃 규칙, OP JOBS_DISABLED 미반영 의심)

- 사내 Claude 구조 보고서(7항목) 수령·판독 → `gitea-repo-contract.md` §11 신설(Dockerfile·release.yml·deploy 트리·ConfigMap 키·릴리스 이력), 브리핑 §4 규칙 추가.
- **핵심 발견 3건**: ① 빌드는 커밋 접두(`feat`/`fix`/`perf`/`BREAKING`)로만 — `docs`·`chore`는 무빌드 ② **`deploy/**`만 바뀐 push는 워크플로가 무시 → configmap만 고치면 pod 미재시작·env 미반영** — 9/28 OP SMTP env 미반영의 진짜 메커니즘(이후 `fix`·`feat` 릴리스가 롤아웃을 만들며 반영됨). "sync 지연"도 이 결과 ③ 3환경이 같은 이미지·같은 deployment.yaml(환경 분기 없음).
- **⚠ 즉시 확인**: OP `JOBS_DISABLED=true` 커밋(9/28, `chore:`·deploy만)은 ②에 해당 → **롤아웃이 없었으면 OP 스케줄러가 아직 켜져 있음**(9/29 07:40 FieldCheck 요약 중복 수신 여부로 판별 가능). 담당자에게 `env_keys` names에 `JOBS_DISABLED` 유무 확인 요청 + 없으면 키트 v4.7·v4.8 적용(`feat:` → 0.17.0)으로 롤아웃 유발.
- `version:"unknown"` 원인: Gitea package.json에 version 필드 부재(워크플로도 갱신 안 함) — 키트 v4.7 `APP_VERSION` env로 해결: deployment.yaml pod template에 downward API(`metadata.labels['app.kubernetes.io/version']` 등 sed가 갱신하는 `version:` 줄이 pod 라벨이면) 또는 워크플로 build-arg. 사내 Claude에 `version:` 줄의 정확한 위치 확인 요청.
- 사내 측 소스 수정 발견: `fix: SMTP_PORT 기본값 25`(0.15.1) — GitHub `config.js` 기본값도 25로 정합(이번 커밋). 원칙: 사내 측 소스 수정은 보고 후 GitHub에 역반영해 키트 복사가 되돌리지 않게.
- OP secret `thinq-real-db-svc`(SealedSecret 6키)는 현재 BE 제공 DB — Aurora 전환 시 재봉인 필요 → cert가 OP DB 전환의 선행조건으로 격상(브리핑 §2 대기 항목).

## 작업 내역 (2026-09-29 후속 2 — 0.17.0 롤아웃 확인, `version:unknown` 확정, `bad_signature` 재발 → 서명 키 영속화(키트 v4.9))

- 담당자 실측: 키트 v4.7·v4.8 → **0.17.0 릴리스·OP pod 교체 확인**. `/healthz version` 여전히 `unknown` → Gitea package.json에 version 필드 없음 확정(v4.7 폴백 전부 실패) — deployment `version:` 줄 위치 답변 대기(downward API로 해결 예정). OP `env_keys`는 저장 토큰으로 **`bad_signature` 재발**(9/28에 이어 두 번째, 둘 다 롤아웃 직후).
- 판독: 서명 키의 유일한 저장소가 Valkey라 (a) 키 유실 시 새 키 생성 → 기존 토큰 전부 무효 (b) 부트 직후 연결 실패 시 조용히 pod별 임시 키 폴백. **구현(키트 v4.9, `auth/secret.js`·`lib/kvcache.js`·`index.js`·`app.js`)**: 저장소 app_state 영속 원본 + Valkey 원자적 중재 + 재시도·백그라운드 수렴 + 60초 재대조 + `/healthz authSecret`. 설계 §8-14(⚠ 스펙 대비 변경), api-contract.
- 담당자 즉시 조치: OP 관리자 페이지 **재로그인**으로 새 토큰(현 상태에선 pod마다 키가 다를 수 있어 호출이 간헐 실패 — 새로고침 재시도). 키트 v4.9는 `fix:` 접두로 적용(0.17.1) → 롤아웃 후 `/healthz` `authSecret:"db"` 두 pod 확인 + 기존 토큰 유지 확인. `JOBS_DISABLED` 반영 여부는 이 롤아웃 뒤 `env_keys`로.

## 작업 내역 (2026-09-29 후속 3 — 키트 v4.9 사내 반영, push rejected 원인, 담당자 치트시트 신설)

- 사내: 키트 v4.9 push 완료(사내 Claude가 `git rebase origin/main`으로 해결) → 0.17.1 릴리스 예상. **push rejected(fetch first) 원인 확정**: 직전 push의 릴리스 봇이 `chore: release` 커밋을 main에 먼저 올려서 다음 push가 non-fast-forward가 됨 — 정상 현상. 표준 해법 `git pull --rebase origin main && git push origin main` 한 줄, 사내 Claude 프롬프트에 push 명령을 이 형태로 달라고 명시.
- 담당자 요청 "반복 작업 복붙표" → **`ops-cheatsheet.md` v1** 신설: A 사내 PC 명령(미러 pull·rejected 해결) / B 환경별 주소표(healthz·mail_status·env_keys·egress·peek·request·verify·mail_test)와 토큰 얻기·로그인 순서 / C 사내 Claude 프롬프트 템플릿 5종(키트 적용·configmap 변경+config-rev·저장소 확인·internal-context 갱신·막힘) / D 릴리스 후 3분 루틴 / E 규칙 요약. 루트 CLAUDE.md 문서 목록 등재.
- 대기: 0.17.1 롤아웃 후 OP `/healthz authSecret:"db"`(두 pod)·기존 토큰 유지·`env_keys`의 `JOBS_DISABLED`.

## 작업 내역 (2026-09-29 후속 4 — 0.17.1 롤아웃 후 `authSecret:"db"` 확인, 새 토큰도 `bad_signature` → 토큰 복사 형식 의심·서버 측 정규화(키트 v4.10))

- 담당자 실측: 0.17.1 롤아웃(pod 교체) 후 OP `/healthz authSecret:"db"`. 롤아웃 전 토큰은 `bad_signature`(예상 — 임시 키 서명). **롤아웃 후 재로그인한 새 토큰도 `bad_signature`** → 서명 키 불일치보다 **토큰 문자열 오염** 의심: DevTools Console의 `localStorage.getItem(...)` 출력은 따옴표(`'…'`)를 포함해 표시되며 그대로 복사해 주소에 붙이면 payload·서명 양끝에 따옴표가 붙어 HMAC 불일치 → 정확히 `bad_signature`. 로컬 재현: 정상 토큰 ok / 따옴표 포함 → 실패.
- **구현(키트 v4.10, `auth/token.js` 1줄)**: `verifyAuthToken`이 양끝 따옴표(`'` `"` `` ` ``)·공백을 제거 후 검증 — 복사 실수를 서버가 흡수. 담당자 안내: Console에서 `copy(localStorage.getItem('thinqreal_admin_token'))`로 복사하면 따옴표 없이 클립보드에 들어감(치트시트 반영).
- **원인 확정(같은 날)**: 담당자가 안내문의 자리표시 `<토큰>`을 **꺾쇠까지 포함해** 붙여 넣었음 — 꺾쇠를 빼자 즉시 통과. 서명 키 문제 아님(0.17.1 이후 재로그인 토큰 정상). v4.10 정규화에 꺾쇠(`<` `>`)도 추가. 교훈: 안내문의 `<…>` 자리표시는 기호까지 바꿔 넣는 것임을 치트시트 상단에 명시.
- 잔여 후보(정규화 후에도 실패 시): 두 pod의 DB 키 불일치(60초 재수렴 전) → `env_keys` 5회 반복 호출로 간헐성 확인 + `/healthz` 두 pod `authSecret` 대조.
- **종결 확인(같은 날)**: 담당자 실측 — OP `env_keys` names에 `JOBS_DISABLED` 존재(OP 스케줄러 정지 반영 확정), `/healthz` 두 pod 모두 `authSecret:"db"`(0.17.1, 서명 키 영속화 동작). 9/28~29 인증·SMTP·스케줄러 관련 열린 항목 0. 최종 검증 잔여: 다음 키트 롤아웃 후 같은 토큰으로 `env_keys` 통과(토큰 유지) 1회.

## 작업 내역 (2026-09-29 후속 5 — ✅ 키트 v4.10 = 0.17.2, 롤아웃 후 토큰 유지 검증 통과 (v4.9 최종 검증))

- 담당자 실측: 키트 v4.10 적용(0.17.2) → OP pod 교체·두 pod `authSecret:"db"` → **롤아웃 전에 발급된 관리자 토큰으로 `env_keys` 통과**. 서명 키가 pod 교체를 넘어 유지됨을 확인 — v4.9(저장소 영속화) 최종 검증 완료. 0.17.1 때 같은 시험이 실패했던 것(임시 키 서명)과 대비되는 증거.
- 담당자 질문 "로그인이 남은 시크릿 창에서 했는데 유효한가" → 유효: API는 브라우저 로그인 상태·서버 세션을 보지 않고 URL의 토큰 서명만 재계산해 검증(무상태 HMAC). 판정 근거는 "발급 시점 < 롤아웃 < 검증 시점"이며 창 종류와 무관.
- 상태: 인증·서명 키·스케줄러·SMTP 트랙 열린 항목 0. 사내 릴리스 0.17.2 = GitHub main과 코드 동기.
- **⚠ 정정(담당자 지적, 같은 날)**: 9/28~29의 `bad_signature` 3회(0.17.0 후 저장 토큰 / 0.17.1 전·후 토큰)를 "임시 서명 키"로 설명한 것은 **증거 없는 추론**이었다. 외부 트랙 안내가 처음부터 `token=<관리자 토큰>` 형식이었고 담당자가 직접 성공한 `env_keys` 호출은 꺾쇠를 뺀 오늘이 처음 → **세 번 모두 꺾쇠(`<` `>`) 포함이 원인일 가능성이 가장 높다**(꺾쇠 포함 시 서버는 정확히 `bad_signature`, 로컬 재현). 그 사이의 성공 호출(`mail_test` 등)은 사내 Claude 실행분이라 꺾쇠가 없었음. 후속 2·4의 원인 서술은 이 정정으로 대체. **유지되는 사실**: 0.17.2 검증(꺾쇠 없음)은 유효 — 롤아웃 전 토큰이 롤아웃 후 통과. v4.9의 영속화는 원인 여부와 무관하게 옳은 설계(Valkey 키 유실 시 전 토큰 무효 위험은 실재)이나 "그 위험이 실제로 발생했다"는 근거는 없음. 교훈: 브리핑 §4의 "추론을 확정으로 보고하지 않기"는 외부 트랙에도 동일하게 적용.

## 작업 내역 (2026-09-29 후속 6 — DB팀 계정 생성 완료·접속 정보 수령 → 값 없이 진행 가능한 것 정리, `DB_SCHEMA`(키트 v4.11))

- 담당자: DBSUPPORT에서 Aurora·valkey 생성 및 접속 계정 발급 완료, 접속 정보 수령(사내 캡처 불가 → 외부 전달 불가). **외부 트랙 판단: 값은 외부에 필요 없음** — 사내 클로드가 internal-context §2-a·§2-b에 기록하면 됨(비밀값은 별도 보관 `55-credentials`, internal-context에는 호스트·계정명·포트·TLS/AUTH 여부만). 외부 트랙에 필요한 것은 **구조 사실 5건(예/아니오·이름 없이)**: ① DB명과 스키마명이 같은가 ② APP 계정에 CREATE TABLE·ALTER 권한 ③ Aurora TLS 필수 여부·CA 번들 필요 여부 ④ valkey AUTH 토큰 유무·cluster 모드(configuration endpoint) 여부·포트 표준 여부 ⑤ Multi-AZ 현재 상태(Single).
- **구현(키트 v4.11, `config.js`·`store/postgres/index.js`)**: `DB_SCHEMA` — 별도 스키마로 생성됐을 경우 search_path 고정·기동 시 확인 로그. 설계 §8-15에 OP env 확정 목록·첫 기동 절차(APP 권한 유무 분기)·선행조건(cert) 기록. gitea-repo-contract env 표 갱신.
- **진행 판단**: OP DB 전환은 SealedSecret 재봉인이 필요해 **cert(BE팀 10/6~)가 선행** — 값이 있어도 지금은 넣을 수 없음. 따라서 외부 트랙은 **과제 D 키트 v5(`admin_import` + 관리자 「데이터 이행」 패널 + 스냅샷 추출) 착수**가 최선의 선행 작업(QA 리허설까지 cert 무관). 담당자 승인 시 바로 시작.

## 작업 내역 (2026-09-29 마감 — 세션 종료, 다음 세션 착수 메모: 과제 D 키트 v5)

- **접속 정보 전달 방식 확정**: 사내 Claude도 JIRA를 직접 못 읽음 → 담당자가 프롬프트에 타이핑. **비밀값(DB 비밀번호·valkey AUTH 토큰)은 프롬프트에도 넣지 않고** `55-credentials` 별도 파일에 담당자가 직접 저장, internal-context §2-a·§2-b에는 비밀 아닌 값(엔드포인트·포트·DB명·스키마명·계정명·TLS/AUTH 여부)만 + "55-credentials 참조". 외부 트랙에는 구조 예/아니오 5건만.
- **세션 마감 사유**: 컨텍스트 63% + 새 주제(과제 D)는 새 세션이 유리. 상태는 전부 리포에 있음(아래).
- **다음 세션 착수 메모 — 과제 D 키트 v5** (담당자 "시작" 신호 후):
  - 읽을 것: 루트 `CLAUDE.md` 이관 트랙 절 → `migration-log.md` 마지막 3항목 → `stage1-container-design.md` §8-9(설계 확정본)·§8-15(OP env·첫 기동) → `cutover-plan.md` §2(D-day 순서) → `data-schema.md`(14표 컬럼) → `api-contract.md`(admin 토큰 규칙).
  - 만들 것: ① 스냅샷 추출(현행 시트 14탭 → 탭별 JSON + manifest 건수 — 현행 Apps Script에 `export_snapshot`(관리자 토큰) 추가는 **운영 세션 협의 사항**이라, 1차는 관리자 페이지 CSV/JSONL 내보내기 산출물 또는 시트 다운로드(xlsx→JSON 변환 도구)로 입력 받는 것을 우선 검토) ② 컨테이너 POST `admin_import`(관리자 토큰, 탭별 JSON 업로드, `dry_run` → 건수·컬럼 검증 리포트, 실적재는 id 기준 멱등 upsert, 표별 결과) ③ 관리자 페이지 「데이터 이행」 패널 — **컨테이너 서빙본에만 노출**(htmlRewrite로 주입하거나 `public/` 별도 페이지 `admin_import.html` — 라이브 HTML은 건드리지 않음) ④ QA 리허설 절차(uat-checklist 8단계 뒤 또는 별도 절) ⑤ api-contract·data-schema·설계 §8-16 기록.
  - 제약: 라이브 파일 무수정 원칙, 사내 식별자 미기재, `docs:`·`chore:`는 무빌드(키트는 `feat:`), configmap 변경 시 롤아웃 유발, 민감 단가 grep.
  - 대기 신호: DB팀 구조 답 5건 / cert(10/6~) / deployment `version:` 줄 위치 / 협업자 UAT 차이 보고.

## 작업 내역 (2026-09-29 후속 7 — DB인프라 「DB자원」/「DB계정」 분리 확인 → 접속 정보 등급 분류, 다음 창구는 Next Spoc)

- **담당자 확인**: DB인프라 업무는 두 범주·두 창구 — **DB자원**(생성·삭제·복구·타입 변경·증설·파라미터·임계치·인증서·스토리지 암호화·로그·모니터링 — JIRA) / **DB계정**(계정 생성·삭제·연장·암호 초기화, **권한 부여·SG 허용·스키마 생성/삭제·권한 회수·사용자 확인** — Next Spoc). 9/23 DBSUPPORT 티켓은 DB자원이라 **자원 생성으로 종결**되었고, 회신에 MGR/APP 계정·TLS 필수 여부 언급이 없는 것은 누락이 아니라 범주 밖. → 브리핑 §3-a 상태 ✅·§3-d를 "진행 차례"로, 설계 §8-15 선행조건에 "① DB계정 → ② cert" 두 단계 명시, CLAUDE.md 상태 줄 갱신.
- **수령 정보 등급(외부 트랙 판단)**: 1등급 원석님만(55-credentials, 사내 클로드 프롬프트에도 넣지 않음) = DB 비밀번호·valkey AUTH 토큰·콘솔/mgr 자격 / 2등급 사내 전용(internal-context·사내 클로드 가능, GitHub 금지) = RDS·valkey 엔드포인트, DB명, 계정명, 인스턴스·클러스터·SG 등 리소스 이름 / 3등급 외부 전달 가능 = 포트 표준 여부, 계정 쌍 개수, TLS·cluster 모드·Single 여부, "DB명=스키마명" 같은 예/아니오.
- **후속 6의 구조 질문 5건 재배치**: ①(DB명=스키마명)·②(APP CREATE/ALTER)는 자원 회신으로는 답이 안 나오고 **Next Spoc 요청의 결과로 확정**되는 항목 → 요청서에 넣는다(브리핑 §3-d 요청 내용 4건). ③(Aurora TLS)은 회신 미언급 = 강제 아님으로 보고 `DB_SSLMODE`로 대응(첫 기동 실측) / ④(valkey)는 TLS 활성 확정(9/25 회신), AUTH·cluster 모드는 엔드포인트 이름(`clustercfg`)·Next Spoc 회신으로 / ⑤ Single(템플릿 표준).
- **Next Spoc 요청 골자(담당자 작성용, 값은 internal-context)**: Instance=완료 통보의 RDS·valkey 인스턴스명 / 접속 IP=OP 클러스터 대역(§2-c) + "TCN EKS KIC-OP thinq-real pod" 병기 / DB-i 미적용 / 요청 ① `<서비스명>_APP` 계정(스키마 CREATE·ALTER 포함) ② 사용 스키마명 확정 ③ SG 허용 5432·6379 ④ valkey 사용자·AUTH 발급 여부. MGR·DB-i는 보류(사람 직접 접근 필요 시 추가).
- **판단**: 외부 트랙에 지금 필요한 값은 없음. 다음 실측 관문은 Next Spoc 완료 후 "pod → RDS/valkey TCP 도달"(SG 확인)인데 현재 진단 엔드포인트(`egress_check`)는 Apps Script 고정이라 **키트 v4.12 후보: `db_probe`(관리자 토큰, 호스트는 `*.amazonaws.com`만, TCP connect 결과)** — cert 전에 SG를 검증할 수 있는 유일한 수단. 담당자 신호 시 v4.11과 묶어 제공. 과제 D 키트 v5 착수 메모는 그대로 유효.
