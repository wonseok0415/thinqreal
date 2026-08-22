# ThinQ Real API 계약 문서

> 사내 인프라 이전 시 백엔드 재구현의 기준 스펙.
> 현재 구현: Google Apps Script Web App (단일 엔드포인트 + `type` 파라미터 라우팅).
> 기준 코드: `ThinQReal_AppScript.gs` (2026-07-05 기준)

## 공통 사항

- **단일 URL** 아래 `type` 값으로 라우팅. GET은 쿼리스트링, POST는 JSON body.
- 모든 응답은 `Content-Type: application/json`.
- 클라이언트(index.html·thinqreal_admin.html·ROI 툴)는 POST를 `mode:'no-cors'`로 호출 → **POST 응답 본문을 읽지 않음** (낙관적 UI + 실패 시 롤백 패턴). 재구현 시 CORS를 정상 허용하면 클라이언트를 응답 확인 방식으로 개선 가능.
- 날짜는 항상 `YYYY-MM-DD` 문자열 (타임존 Asia/Seoul 기준, `toISOString()` 사용 금지 규칙).
- 알 수 없는 `type` → `{ "error": "Unknown type" }`.

## 인증 모델

| 토큰 | 발급 | 유효기간 | payload |
|---|---|---|---|
| 사용자 토큰 | `auth_request` → `auth_verify` | 30일 | `{email, exp}` |
| 관리자 토큰 | `admin_auth_request` → `admin_auth_verify` | 7일 | `{email, exp, admin:true}` |

- 형식: `base64url(payload) + "." + base64url(HMAC-SHA256(payloadB64, AUTH_SECRET))`
- 서명 비교는 상수시간 비교(`constantTimeEquals`).
- 관리자 판정: `AUTH_ADMIN_EMAILS`(영구 7명 — 2026-08-18 기준) OR `AUTH_TEMP_ADMINS`(만료일 기반 임시) — 백엔드 검증이 유일한 방어선.
- 인증 코드: 6자리 숫자, TTL 20분, 재요청 쿨다운 60초, 검증 5회 연속 실패 시 20분 잠금.

## GET 엔드포인트

| type | 파라미터 | 인증 | 응답 (성공) |
|---|---|---|---|
| `availability` | `date=YYYY-MM-DD` | — | `{bookedSlots:[n], pendingCounts:{n:count}, blockedSlots:[n]}` |
| `bookings` | `token` | 관리자 | `{records:[예약 객체 배열]}` — 개인정보 포함이라 토큰 필수 |
| `roi_snapshots` | — | — | 스냅샷 목록 (최신순) |
| `appliances` | — | — | `{count, items:[{category,name,model,maker}]}` (45개) |
| `mail_status` | — | — | 메일 설정 + 남은 일일 할당량 (진단용) |
| `mail_test` | — | — | 테스트 메일 1통 발송 |
| `monthly_report_preview` | `month=YYYY-MM` (생략 시 이번 달) | — | 리포트 HTML 렌더 + **상단 미리보기 배너** (2026-08-03 §8-6 — 발송 아님 명시) |
| `monthly_report_send` | `month` (생략 시 전월) | — | **2단계 발송 (2026-08-03 §8-6)**: 파라미터 없음→확인 화면(수신자·기발송 경고·자동 발송 건너뛰기 체크박스·일회용 토큰 버튼 2종) / `confirm=<토큰>`→전체 발송(+`skipauto=1`이면 가드 키 기록) / `test=<토큰>`→`MONTHLY_REPORT_TEST_TO` 1인 테스트([테스트] 접두·무기록) / `confirm=YES` 레거시는 폐기·안내만. 토큰 10분·일회용 |
| `auth_request` | `email` | — | `{ok:true, ttl:1200}` — @lge.com 한정, 코드 메일 발송 |
| `auth_verify` | `email`, `code` | — | `{ok:true, token, exp}` |
| `admin_auth_request` | `email` | — | 관리자 명단 한정 코드 발송 |
| `admin_auth_verify` | `email`, `code` | — | `{ok:true, token, exp}` (admin 토큰) |
| `slot_blocks` | `date=` (선택) | — | 차단 슬롯 현황 (비민감) |
| `telegram_test` | — | — | `{ok:true}` 또는 `{ok:false, reason:'not_configured'}` |
| `calendar_test` | — | — | 캘린더 연동 점검 (테스트 일정 생성 후 즉시 삭제) |
| `survey_data` | `token` | 관리자 | `{responses:[], ledger:[], issues:[], visitors:[], insights:[], articles:[], bestReviewers:[]}` — 설문·대장·이슈·방문자·큐레이션·기사·베스트 리뷰어 이력 통합 조회 (insights·articles 2026-08-03, bestReviewers 2026-08-22 추가) |
| `health_checks` | `days=` (선택) | — ⚠ 무인증 | FieldCheck 점검 이력 조회 (관리자 🩺 탭용). ⚠ 토큰 게이트 적용 검토는 FieldCheck 전용 세션에 위임 (2026-07-30 관찰) |
| `voc_reports` | `token`, `days=` (선택) | **관리자** | FieldVoice 현장 인사이트 리포트 목록 (관리자 🎙 탭용, 2026-08-19). 방문객 발화 인용이 포함되므로 health_checks와 달리 처음부터 토큰 게이트. ⚠ 기능 상세는 FieldVoice(아이디어 트랙) 소관 — 존재·인증 방식만 등재 |

### 인증 관련 오류 응답
`{ok:false, error:...}` — `not_allowed_domain` / `not_admin` / `cooldown` / `mail_failed` / `invalid_code` / `expired_code` / `too_many_attempts`

## POST 엔드포인트 (JSON body, `type` 필드)

| type | 인증 | 동작 | 부수 효과 |
|---|---|---|---|
| `booking` | — | 신규 예약 행 append (id=`Date.now()` 문자열) | 담당자 알림 메일 + 텔레그램 발송 |
| `update` | 관리자 토큰 | `status` 변경 (확정/거절) | 예약자 확정·거절 메일 + 텔레그램 + 캘린더 동기화 |
| `booking_delete` | 관리자 토큰 | 행 영구 삭제 | 캘린더 이벤트 제거. **메일 미발송** (의도) |
| `admin_booking_create` | 관리자 토큰 | 이력 직접 추가 (기본 status=확정) | **알림 미발송** (의도). 확정이면 캘린더 등록 |
| `admin_booking_edit` | 관리자 토큰 | 편집 가능 필드만 갱신 (`id·timestamp·privacyConsent` 보존) | **알림 미발송**. 캘린더 동기화 |
| `slot_block` | 관리자 토큰 | `{date, slot, reason}` 슬롯 차단 | — |
| `slot_unblock` | 관리자 토큰 | `{date, slot}` 또는 `{id}` 차단 해제 | — |
| `roi_snapshot` | — ⚠️ | ROI 시나리오 저장 `{label, author, inputs, outputs}` | — |
| `roi_delete` | — ⚠️ | ROI 스냅샷 삭제 `{id}` | — |
| `survey_submit` | — | 설문 응답 append + 파생 행(대장 `후보`·이슈 `등록`) 자동 생성 (2026-07-09) | 텔레그램 발송 (관리자 그룹) |
| `visitor_submit` | — | 방문자 현장 설문 append (`visitor_responses`, 익명 — 2026-07-27 §8-5). **파생 없음**, 저장 value는 언어 무관 한국어 canonical | 텔레그램 발송 ("방문자 설문 접수 [KO\|EN]") |
| `visitor_delete` | 관리자 토큰 | 방문자 응답 영구 삭제 (테스트·실수 정리용 — 2026-07-27). cascade 없음(파생 무). **수정 엔드포인트는 의도적으로 없음** — 익명 응답 원문 보존 | — (알림 미발송) |
| `health_check` | **FC_API_KEY** (Script Property — 점검 장비 전용, 2026-07-30 Property 이전) | FieldCheck 점검 결과 append (`health_checks` 12컬럼). ⚠ 기능 상세는 FieldCheck 전용 세션 소관 — 이 표에는 존재·인증 방식만 등재 | FC_IMMEDIATE_ALERT 시 실패 알림 (현재 꺼짐) |
| `voc_report` | **FV_API_KEY** (Script Property — FieldVoice 파이프라인 전용, 2026-08-19) | FieldVoice 1페이지 리포트 append (`voc_reports` 9컬럼, 20KB 초과 거부). ⚠ 기능 상세는 FieldVoice(아이디어 트랙) 소관 — 존재·인증 방식만 등재 | — (알림 미발송) |
| `insight_add` | 관리자 토큰 | 리포트 큐레이션 행 추가 `{month, text, rowType('insight'\|'quote'), source}` → `monthly_insights` (2026-08-03 §8-7). seq는 월·타입별 자동 증가 | — |
| `insight_delete` | 관리자 토큰 | 큐레이션 행 삭제 `{id}` | — |
| `article_add` | 관리자 토큰 | 관련 기사 링크 추가 `{month, url}` → `monthly_articles` (2026-08-03). 제목·출처·요약·썸네일은 서버가 메타 태그에서 자동 추출(실패 시 공란 → 리포트 빌드 때 재시도). month는 텍스트 강제 저장. 같은 달 중복 URL 거부 | — |
| `article_delete` | 관리자 토큰 | 관련 기사 링크 삭제 `{month, url}` | — |
| `insight_move` | 관리자 토큰 | 큐레이션 항목 순서 조정 `{id, dir:'up'|'down'}` — 같은 월·타입 그룹 seq 1..n 재기록 (2026-08-04) | — |
| `article_move` | 관리자 토큰 | 기사 순서 조정 `{month, url, dir}` — 같은 달 이웃 행과 값 교환 (순서 컬럼 없음 — 컬럼 구조 불변) | — |
| `survey_update` | 관리자 토큰 | 설문 응답 내용 정정 (2026-07-14). 불변: `response_id/submitted_at/track/raw_json` + 파생 트리거 3종(`media_link/etc_link/iot_defect`) | — (행 삭제 없음 — 의도) |
| `ledger_update` | 관리자 토큰 | 성과 대장 상태 전환·확정 필드 + 내용 정정(`category/project_name/expected_scale/attribution_pct/visit_date/respondent/dept` — 2026-07-14 확장). `attribution_text`(라디오 원문)는 불변 | — (행 삭제 없음 — 의도) |
| `issue_update` | 관리자 토큰 | 이슈 속성 부여 (`device/symptom/severity/channel/q_ship/status`) + est_value 서버 계산 | — (행 삭제 없음 — 의도) |
| `survey_delete` | 관리자 토큰 | 설문 응답 영구 삭제 (2026-07-16 — 테스트·실수 정리용). **파생 행(대장·이슈, response_id 연결) cascade 삭제** | — (알림 미발송) |
| `ledger_delete` | 관리자 토큰 | 대장 행 영구 삭제 (테스트·실수 정리용 — 실제 성과 기록은 드롭 권장) | — (알림 미발송) |
| `issue_delete` | 관리자 토큰 | 이슈 행 영구 삭제 (테스트·실수 정리용 — 실제 이슈는 기각 권장) | — (알림 미발송) |
| `export_log` | 관리자 토큰 | CSV 내보내기 감사 로그 기록 `{reason, rowCount}` (2026-07-20 — 개인정보보호팀 요구). email은 토큰 payload에서 추출, 파일 비밀번호는 미기록 | — |
| `best_reviewer_send` | 관리자 토큰 | 베스트 리뷰어 축하 메일 발송 `{responseId, month, email, name, dept, visitDate, product}` → `best_reviewers` 이력 기록 (2026-08-22). 가드: 같은 responseId 재발송·월 3명(`BEST_MONTHLY_LIMIT`) 초과·@lge.com 외 수신 거부. 발송 성공 후에만 기록(실패 시 재시도 가능) | 축하 메일 발송 (BCC: 담당자 3+팀장+운영자 — `BEST_REVIEWER_BCC`). **기프티콘은 별도 채널 전달 — 시스템 미경유** |

⚠️ ROI 2종은 토큰 미적용 — ROI 툴이 별창으로도 열려 토큰 전달 경로가 없음 (저위험 판단, 현행 유지). **사내 이전 시 세션 기반 인증으로 보호 권장.**

### `booking` 요청 body 주요 필드
```
type, timestamp(ISO), date, slots(number[]), slot, slotLabel,
name(신청자 "이름 직급" — 2026-07-20부터, 이전 행은 책임자/담당자 이름), org(=subject 미러),
phone(2026-07-20부터 수집 중단 — 항상 ''), email(신청자 — 확정 메일·설문 요청 수신),
purpose(한국어 라벨), count, note, status('대기중'),
subject, clientCompany, visitors(JSON 문자열), usagePlan, expectedEffect,
purposeKey(b2b|rd|pr|content|internal-comm|other),
division(본부), department(부서), privacyConsent('Y')
```

## 메일 발송 규칙 (재구현 시 유지해야 할 비즈니스 로직)

- 담당자 알림: 신규 예약 시 담당자 3명(To) + CC 1명. HTML+평문 동시.
- 예약자 확정 메일: Wi-Fi·도어락 등 **민감 정보는 메일에만** (페이지 노출 금지).
  - R&D 목적(`purpose`에 'R&D' 포함) → 구비 가전 표 첨부
  - B2B·홍보 목적(`/(B2B|홍보)/`) → 웰컴 보드 안내 첨부
  - 주차 안내는 모든 확정 메일에 포함
- 월간 리포트: 매월 마지막 금요일 08:30 KST 자동 발송 (일일 트리거 + `isLastFridayOfMonth` 판정 + 월 중복 가드).
- 모든 발신 표시명: `ThinQ Real`.

## 스케줄 작업

| 작업 | 현재 구현 | 재구현 |
|---|---|---|
| 월간 리포트 자동 발송 | Apps Script 시간 트리거 (매일 08:30) → **매월 첫째 수요일 판정 후 전월 리포트 발송** (2026-07-29 변경) | cron `30 8 * * *` (Asia/Seoul) + 동일 판정 로직 |
| 방문 후기 설문 요청 자동 발송 | Apps Script 시간 트리거 (매일 08:30, `surveyInviteTrigger`) → 전날까지의 확정·미발송 방문 건에 설문 메일 (`surveyInviteSentAt` 마커로 중복 방지, @lge.com 한정, CC 담당자 3+운영자) | cron `30 8 * * *` (Asia/Seoul) + 동일 필터 로직 |
