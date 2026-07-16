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
- 관리자 판정: `AUTH_ADMIN_EMAILS`(영구 5명) OR `AUTH_TEMP_ADMINS`(만료일 기반 임시) — 백엔드 검증이 유일한 방어선.
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
| `monthly_report_preview` | `month=YYYY-MM` (생략 시 이번 달) | — | 리포트 HTML 본문 렌더 (메일 미발송) |
| `monthly_report_send` | `month`, `confirm=YES` 필수, `to=` override | — | 수동 발송. `confirm=YES` 없으면 가드로 미발송 |
| `auth_request` | `email` | — | `{ok:true, ttl:1200}` — @lge.com 한정, 코드 메일 발송 |
| `auth_verify` | `email`, `code` | — | `{ok:true, token, exp}` |
| `admin_auth_request` | `email` | — | 관리자 명단 한정 코드 발송 |
| `admin_auth_verify` | `email`, `code` | — | `{ok:true, token, exp}` (admin 토큰) |
| `slot_blocks` | `date=` (선택) | — | 차단 슬롯 현황 (비민감) |
| `telegram_test` | — | — | `{ok:true}` 또는 `{ok:false, reason:'not_configured'}` |
| `calendar_test` | — | — | 캘린더 연동 점검 (테스트 일정 생성 후 즉시 삭제) |
| `survey_data` | `token` | 관리자 | `{responses:[], ledger:[], issues:[]}` — 설문·대장·이슈 통합 조회 (2026-07-09 추가) |

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
| `survey_update` | 관리자 토큰 | 설문 응답 내용 정정 (2026-07-14). 불변: `response_id/submitted_at/track/raw_json` + 파생 트리거 3종(`media_link/etc_link/iot_defect`) | — (행 삭제 없음 — 의도) |
| `ledger_update` | 관리자 토큰 | 성과 대장 상태 전환·확정 필드 + 내용 정정(`category/project_name/expected_scale/attribution_pct/visit_date/respondent/dept` — 2026-07-14 확장). `attribution_text`(라디오 원문)는 불변 | — (행 삭제 없음 — 의도) |
| `issue_update` | 관리자 토큰 | 이슈 속성 부여 (`device/symptom/severity/channel/q_ship/status`) + est_value 서버 계산 | — (행 삭제 없음 — 의도) |
| `survey_delete` | 관리자 토큰 | 설문 응답 영구 삭제 (2026-07-16 — 테스트·실수 정리용). **파생 행(대장·이슈, response_id 연결) cascade 삭제** | — (알림 미발송) |
| `ledger_delete` | 관리자 토큰 | 대장 행 영구 삭제 (테스트·실수 정리용 — 실제 성과 기록은 드롭 권장) | — (알림 미발송) |
| `issue_delete` | 관리자 토큰 | 이슈 행 영구 삭제 (테스트·실수 정리용 — 실제 이슈는 기각 권장) | — (알림 미발송) |

⚠️ ROI 2종은 토큰 미적용 — ROI 툴이 별창으로도 열려 토큰 전달 경로가 없음 (저위험 판단, 현행 유지). **사내 이전 시 세션 기반 인증으로 보호 권장.**

### `booking` 요청 body 주요 필드
```
type, timestamp(ISO), date, slots(number[]), slot, slotLabel,
name(책임자), org(=subject 미러), phone, email,
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
| 월간 리포트 자동 발송 | Apps Script 시간 트리거 (매일 08:30) → 마지막 금요일 판정 후 발송 | cron `30 8 * * *` (Asia/Seoul) + 동일 판정 로직 |
