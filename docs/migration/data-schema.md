# ThinQ Real 데이터 스키마 문서

> 현재 저장소: Google Sheets (ID는 CLAUDE.md 참조). 사내 DB 이전 시 테이블 설계 기준.
> 헤더의 단일 소스: `ThinQReal_AppScript.gs`의 `getOrCreateHeaders()` `HEADERS` 배열.

## 1. `bookings` 탭 (예약 — 메인 테이블, 25컬럼)

| # | 컬럼 | 타입 | 설명 |
|---|---|---|---|
| 1 | `id` | string | `Date.now()` 13자리 ms 문자열. **항상 문자열 비교** (PK) |
| 2 | `timestamp` | ISO string | 신청 시각 |
| 3 | `date` | `YYYY-MM-DD` | 방문일 (표 정렬 기준 — date 우선, timestamp 보조) |
| 4 | `slots` | JSON string | 회차 배열 예 `"[2,3]"` |
| 5 | `slot` | number | 첫 회차 (구형 호환) |
| 6 | `slotLabel` | string | 예 `2회차 13:00~14:30 · 3회차 15:00~16:30` |
| 7 | `name` | string | 신청자 "이름 직급" (2026-07-20부터 — 설문 작성자 프리필과 맵핑). 이전 행은 책임자/담당자 이름 |
| 8 | `org` | string | subject 미러 (관리자 표 표시용, 구형 호환) |
| 9 | `phone` | string | 대표 연락처 — **2026-07-20부터 수집 중단** (신규 행 공란, 과거 행만 값 보유) |
| 10 | `email` | string | 신청자 이메일 (확정/거절 메일 수신) |
| 11 | `purpose` | string | 한국어 라벨 (통계 기준) — 아래 enum |
| 12 | `count` | number | 총 방문 인원 |
| 13 | `note` | string | 요청 사항 (legacy) |
| 14 | `status` | enum | `대기중` / `확정` / `거절` |
| 15 | `subject` | string | 목적별 1번째 줄 (고객사/프로젝트명/행사명/촬영명/제목) |
| 16 | `clientCompany` | string | 고객사 — **b2b는 subject와 동일 값** (표시 시 중복 제거 필요) |
| 17 | `visitors` | JSON string | `[{org,name,rank}]` 최대 10명 |
| 18 | `usagePlan` | string | 활용 방안 (줄바꿈 보존) |
| 19 | `expectedEffect` | string | 기대 효과 |
| 20 | `purposeKey` | enum | `b2b` / `rd` / `pr` / `content` / `internal-comm` / `other` — **분기 로직은 항상 이 키 기준** |
| 21 | `privacyConsent` | 'Y'/'' | 개인정보 수집·국외이전 동의 증빙 (동의 시각=timestamp). 백필 행 공란 허용 |
| 22 | `calendarEventId` | JSON string | 캘린더 이벤트 id 배열 (회차마다 개별 일정). 레거시 단일 문자열도 파싱됨 |
| 23 | `division` | string | 신청자 소속 본부 (드롭다운 10종). 2026-07 이전 행 공란 |
| 24 | `department` | string | 신청자 소속 부서 (자유 입력) |
| 25 | `surveyInviteSentAt` | ISO string | 방문 후기 설문 요청 메일 발송 시각 (배치 재실행 시 중복 발송 방지 마커). 미발송 행 공란 |

### `purpose` / `purposeKey` enum (2026-07-05 개편)
| purposeKey | purpose (라벨) |
|---|---|
| `b2b` | B2B 영업 |
| `rd` | R&D |
| `pr` | 홍보 (프레스투어/마케팅) |
| `content` | 콘텐츠 제작 |
| `internal-comm` | 내부 커뮤니케이션 |
| `other` | 기타 |

라벨 기반 트리거 3종 (재구현 시 유지): R&D 가전표 `indexOf('R&D')`, 웰컴보드·리포트 핵심이력 `/(B2B|홍보)/`.

### 회차 (변경 금지)
`1` 09:00–10:30 / `2` 13:00–14:30 / `3` 15:00–16:30 (점심 11:30–13:00 예약 불가)

## 2. `roi_snapshots` 탭

| 컬럼 | 설명 |
|---|---|
| `id` | 스냅샷 id |
| `timestamp` | 저장 시각 (ISO) — 월간 리포트는 `YYYY-MM` prefix 매칭 |
| `label` | 시나리오명 (ISO 타임스탬프 라벨은 표시 시 `YYYY-MM-DD 시나리오`로 변환) |
| `author` | 작성자 |
| `inputs` | JSON — ROI 툴 입력값 |
| `outputs` | JSON — `annualValue, bepYears/bepText, roi3, roi5, profit3, totalCost, vRnD, vSalesInfra, vSalesContrib, vPR` 등 |

## 3. `slot_blocks` 탭 (슬롯 차단)

| 컬럼 | 설명 |
|---|---|
| `id` / `date` / `slot` / `timestamp` / `by`(관리자 이메일) / `reason` |

## 4. `monthly_articles` 탭 (월간 리포트 기사 큐레이션)

| 컬럼 | 필수 | 설명 |
|---|---|---|
| `month` | ✓ | `YYYY-MM` — 발송 월 매칭 |
| `url` | ✓ | 기사 URL |
| `title` / `source` / `summary` / `published_at` / `thumbnail` | 자동 | 비어 있으면 OpenGraph 자동 추출 + 시트 write-back |

우선순위: 시트에 해당 월 행 있으면 그것만 사용 → 없으면 Serper API → 없으면 CSE → 안내문.

## 4.5 설문 파이프라인 탭 3종 (2026-07-09 추가 — 이관 범위 포함 필수)

### `survey_responses` (설문 응답 원본, 42컬럼)
`response_id`(=`Date.now()` 문자열) · `submitted_at`(ISO) · `visit_date/dept/name/client/visit_count` · `track`(sales/media/etc) · `purpose` · Track A(`deal_stage/deal_size/deal_area/reaction/attr`) · Track B(`media_work/media_days/media_alt/media_cost/media_link/media_link_name/media_link_size/media_link_attr`) · Track C(`etc_work/etc_days/etc_alt/iot_defect/iot_defect_detail/etc_link/etc_link_name/etc_link_size/etc_link_attr`) · `satisfaction/feedback` · `raw_json`(페이로드 원본 — 스키마 진화 대비) · `deal_amount`(계약 체결 딜 실제 계약 금액 — 2026-07 S9 추가, 선택 입력. 시트 끝 컬럼 — 신규 컬럼은 상수 끝에만 추가하는 규칙) · `impressive_modes`(인상 깊었던 솔루션 복수 선택, 콤마 구분 — 2026-07 추가) · `desired_solutions`(추가 필요·체험 희망 솔루션 주관식, 선택 입력 — 2026-07 추가) · `impressive_reasons`(모드별 인상 깊었던 이유, "모드명 — 이유; ..." 직렬화 — 2026-07 추가) · **8번 블록 확장 4종** `adopt_pick`(도입 의향 1픽) · `voice_space`(음성 제어 공간) · `iot_connect`(연결 우선 IoT 제품, 콤마 구분 최대 3개 — 최대치는 클라이언트 검증, 서버는 관대 수용) · `ai_barrier`(도입 걸림돌) — 2026-07-24 추가, **파생 없음·ROI 미산입** (상품기획·엔지니어링 인사이트 전용)

### `performance_ledger` (성과 추적 대장, 15컬럼)
`ledger_id`(`{response_id}-L{n}`) · `response_id` · `category`(홍보·광고 마케팅 / 신규 Task·기타) · `project_name/expected_scale` · `attribution_text/attribution_pct`(원문 괄호 `(N%)` 파싱) · `visit_date/respondent/dept` · `status`(**후보→확정/드롭** — 행 삭제 없음) · `confirmed_amount`(**만원 단위**)/`confirmed_date/confirmed_note` · `roi_included`(Y/'')

### `iot_issue_log` (IoT 품질 이슈, 9컬럼)
`issue_id`(`{response_id}-I1`) · `response_id` · `device/symptom` · `severity`(높음50%/가끔10%/드묾1%) · `channel`(원격/내방/출장) · `q_ship` · `status`(등록→검토→반영/기각) · `est_value`(서버 계산 — 참고용, ROI 미산입)

컬럼 단일 소스: `ThinQReal_AppScript.gs`의 `SURVEY_HEADERS`/`LEDGER_HEADERS`/`ISSUE_HEADERS` 상수. 세 탭 모두 첫 호출 시 자동 생성.

## 4.6 `export_log` 탭 (CSV 내보내기 감사 로그 — 2026-07-20 추가)

개인정보보호팀 요구로 CSV 다운로드 시 사유를 기록. 첫 호출 시 자동 생성.

| 컬럼 | 설명 |
|---|---|
| `id` | `Date.now()` 문자열 |
| `timestamp` | 다운로드 시각 (ISO) |
| `email` | 다운로드한 관리자 — **검증된 토큰 payload에서 추출** (클라이언트 입력 불신) |
| `reason` | 다운로드 사유 (최대 500자) |
| `rowCount` | 내보낸 행 수 |

파일 비밀번호는 기록하지 않는다. 감사 로그이므로 행 삭제 기능 없음.

## 5. 런타임 상태 (Script Properties — 이전 시 설정 저장소/환경변수로)

| 키 | 용도 |
|---|---|
| `AUTH_SECRET` | HMAC 서명 비밀키 (없으면 최초 1회 자동 생성) |
| `MONTHLY_REPORT_TO` | 리포트 수신자 (콤마 구분, 현재 20명) |
| `monthly_report_last_sent_month` | 자동 발송 중복 가드 (`YYYY-MM`) — 상태값 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 텔레그램 알림 |
| `CALENDAR_ID` | 팀 공유 캘린더 |
| `SERPER_API_KEY` | 뉴스 검색 (우선) |
| `GOOGLE_CSE_ID` / `GOOGLE_CSE_KEY` | 뉴스 검색 (폴백, 현재 계정 정책으로 차단 상태) |
| `SURVEY_CAS_JSON` | IoT 이슈 est_value용 채널 단가 `{"원격":N,"내방":N,"출장":N}` — **민감 단가라 코드·리포 미기재**, 이 Property가 유일한 위치 |

## 6. 휘발성 캐시 (CacheService — 이전 시 Redis/TTL 테이블로)

| 키 패턴 | TTL | 용도 |
|---|---|---|
| `auth_code_<email>` / `admin_code_<email>` | 20분 | 인증 코드 |
| `auth_cool_<email>` / `admin_cool_<email>` | 60초 | 재발송 쿨다운 |
| `auth_fail_<email>` / `admin_fail_<email>` | 20분 | 검증 실패 카운터 (5회 잠금) |

## 7. 클라이언트 localStorage (참고 — 프론트는 변경 불필요)

| 키 | 용도 |
|---|---|
| `thinqreal_auth_token` | 사용자 토큰 (30일) |
| `thinqreal_admin_token` | 관리자 토큰 (7일) |
| `thinqreal_bookings_v1` | 관리자 stale-while-revalidate 캐시 (TTL 30분) |
| `thinqreal_admin_sidebar_collapsed` | 사이드바 상태 |

## 8. 데이터 취급 규칙 (이전 후에도 유지)

- 개인정보 보유: **방문일로부터 3년** (privacy.html §3와 동기화)
- Wi-Fi·도어락 등 민감 정보는 확정 메일에만 — DB/페이지 노출 금지
- 캘린더 일정에는 방문자 명단·연락처 미표기
- 백필/직접 입력 시 25컬럼 순서 엄수 (`slots`·`slot`·`slotLabel` 3종 모두 필수, `surveyInviteSentAt` 공란 허용)
