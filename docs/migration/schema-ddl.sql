-- ThinQ Real 컨테이너 저장소 DDL — OP 초기 형상 (MGR 계정이 DB-i로 1회 실행, 설계 §8-18)
-- 생성 기준: server/src/lib/constants.js 상수 + store/postgres/index.js applyDdl (2026-09-30). 전 컬럼 TEXT, rid BIGSERIAL PK — 설계 §3·§8-15.
-- DB팀 정책(9/30): 서비스 계정 thinqreal_APP은 DML·조회만(DDL 없음) → 테이블 생성·컬럼 추가는 MGR이 이 파일로 수행.
-- 앱은 기동 시 DDL을 시도하다 권한 오류가 나면 형상 검증 모드로 넘어간다(/healthz schema:"verified") — 누락이 있으면 기동 실패 메시지에 목록이 찍힌다.
-- 실행 전 치환 2곳: <스키마명> → internal-context §2-a의 DB 스키마명, <APP 계정> → Next SPoC로 발급된 서비스 계정명.
-- 컬럼이 늘어나는 키트가 나오면 이 파일 하단 「델타」 절에 ALTER를 추가하고, 롤아웃 전에 MGR이 델타를 먼저 실행한다(gitea-repo-contract 규칙).

-- 0) 먼저 실행 — 발급 계정의 실제 역할명(대소문자)을 확인한다. DB팀 메일은 대문자(THINQREAL_APP)로 표기하지만
--    PostgreSQL은 따옴표 없이 만들면 소문자로 저장되므로, 아래 결과의 rolname을 "<APP 계정>" 치환값으로 그대로 쓴다(따옴표 안이라 대소문자 정확히).
--    같은 값이 OP secret의 DB_USER가 된다.
SELECT rolname FROM pg_roles WHERE rolname ILIKE 'thinqreal%';

SET search_path TO "<스키마명>";

CREATE TABLE IF NOT EXISTS "bookings" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "timestamp" TEXT,
  "date" TEXT,
  "slots" TEXT,
  "slot" TEXT,
  "slotLabel" TEXT,
  "name" TEXT,
  "org" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "purpose" TEXT,
  "count" TEXT,
  "note" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "clientCompany" TEXT,
  "visitors" TEXT,
  "usagePlan" TEXT,
  "expectedEffect" TEXT,
  "purposeKey" TEXT,
  "privacyConsent" TEXT,
  "calendarEventId" TEXT,
  "division" TEXT,
  "department" TEXT,
  "surveyInviteSentAt" TEXT,
  "applicant" TEXT
);

CREATE TABLE IF NOT EXISTS "roi_snapshots" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "timestamp" TEXT,
  "label" TEXT,
  "author" TEXT,
  "inputs" TEXT,
  "outputs" TEXT
);

CREATE TABLE IF NOT EXISTS "slot_blocks" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "date" TEXT,
  "slot" TEXT,
  "timestamp" TEXT,
  "by" TEXT,
  "reason" TEXT
);

CREATE TABLE IF NOT EXISTS "monthly_articles" (
  rid BIGSERIAL PRIMARY KEY,
  "month" TEXT,
  "title" TEXT,
  "url" TEXT,
  "source" TEXT,
  "summary" TEXT,
  "published_at" TEXT,
  "thumbnail" TEXT,
  ord BIGINT
);

CREATE TABLE IF NOT EXISTS "survey_responses" (
  rid BIGSERIAL PRIMARY KEY,
  "response_id" TEXT,
  "submitted_at" TEXT,
  "visit_date" TEXT,
  "dept" TEXT,
  "name" TEXT,
  "client" TEXT,
  "visit_count" TEXT,
  "track" TEXT,
  "purpose" TEXT,
  "deal_stage" TEXT,
  "deal_size" TEXT,
  "deal_area" TEXT,
  "reaction" TEXT,
  "attr" TEXT,
  "media_work" TEXT,
  "media_days" TEXT,
  "media_alt" TEXT,
  "media_cost" TEXT,
  "media_link" TEXT,
  "media_link_name" TEXT,
  "media_link_size" TEXT,
  "media_link_attr" TEXT,
  "etc_work" TEXT,
  "etc_days" TEXT,
  "etc_alt" TEXT,
  "iot_defect" TEXT,
  "iot_defect_detail" TEXT,
  "etc_link" TEXT,
  "etc_link_name" TEXT,
  "etc_link_size" TEXT,
  "etc_link_attr" TEXT,
  "satisfaction" TEXT,
  "feedback" TEXT,
  "raw_json" TEXT,
  "deal_amount" TEXT,
  "impressive_modes" TEXT,
  "desired_solutions" TEXT,
  "impressive_reasons" TEXT,
  "adopt_pick" TEXT,
  "voice_space" TEXT,
  "iot_connect" TEXT,
  "ai_barrier" TEXT
);

CREATE TABLE IF NOT EXISTS "performance_ledger" (
  rid BIGSERIAL PRIMARY KEY,
  "ledger_id" TEXT,
  "response_id" TEXT,
  "category" TEXT,
  "project_name" TEXT,
  "expected_scale" TEXT,
  "attribution_text" TEXT,
  "attribution_pct" TEXT,
  "visit_date" TEXT,
  "respondent" TEXT,
  "dept" TEXT,
  "status" TEXT,
  "confirmed_amount" TEXT,
  "confirmed_date" TEXT,
  "confirmed_note" TEXT,
  "roi_included" TEXT,
  "amount_basis" TEXT
);

CREATE TABLE IF NOT EXISTS "iot_issue_log" (
  rid BIGSERIAL PRIMARY KEY,
  "issue_id" TEXT,
  "response_id" TEXT,
  "device" TEXT,
  "symptom" TEXT,
  "severity" TEXT,
  "channel" TEXT,
  "q_ship" TEXT,
  "status" TEXT,
  "est_value" TEXT
);

CREATE TABLE IF NOT EXISTS "visitor_responses" (
  rid BIGSERIAL PRIMARY KEY,
  "response_id" TEXT,
  "submitted_at" TEXT,
  "lang" TEXT,
  "satisfaction" TEXT,
  "impressive_modes" TEXT,
  "adopt_pick" TEXT,
  "voice_space" TEXT,
  "iot_connect" TEXT,
  "ai_barrier" TEXT,
  "feedback" TEXT,
  "raw_json" TEXT
);

CREATE TABLE IF NOT EXISTS "monthly_insights" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "month" TEXT,
  "seq" TEXT,
  "type" TEXT,
  "text" TEXT,
  "source" TEXT,
  "created_at" TEXT
);

CREATE TABLE IF NOT EXISTS "best_reviewers" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "month" TEXT,
  "response_id" TEXT,
  "name" TEXT,
  "dept" TEXT,
  "email" TEXT,
  "visit_date" TEXT,
  "product" TEXT,
  "sent_at" TEXT,
  "sent_by" TEXT
);

CREATE TABLE IF NOT EXISTS "export_log" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "timestamp" TEXT,
  "email" TEXT,
  "reason" TEXT,
  "rowCount" TEXT
);

CREATE TABLE IF NOT EXISTS "health_checks" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "timestamp" TEXT,
  "level" TEXT,
  "scenario_id" TEXT,
  "scenario_label" TEXT,
  "result" TEXT,
  "latency_ms" TEXT,
  "detail" TEXT,
  "stt_text" TEXT,
  "expected" TEXT,
  "media_ref" TEXT,
  "note" TEXT
);

CREATE TABLE IF NOT EXISTS "voc_reports" (
  rid BIGSERIAL PRIMARY KEY,
  "id" TEXT,
  "timestamp" TEXT,
  "visit_date" TEXT,
  "session_id" TEXT,
  "purpose" TEXT,
  "one_liner" TEXT,
  "report_md" TEXT,
  "consent" TEXT,
  "author" TEXT
);

CREATE TABLE IF NOT EXISTS "app_state" ("key" TEXT PRIMARY KEY, "value" TEXT);

-- ── APP 계정 권한 (MGR이 테이블 소유자이므로 MGR이 직접 실행 가능) ──
GRANT USAGE ON SCHEMA "<스키마명>" TO "<APP 계정>";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "<스키마명>" TO "<APP 계정>";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "<스키마명>" TO "<APP 계정>";  -- rid BIGSERIAL(nextval)에 필요
-- MGR이 앞으로 만드는 표·시퀀스에도 자동 부여 (델타 실행 때 GRANT를 잊어도 안전)
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA "<스키마명>" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "<APP 계정>";
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA "<스키마명>" GRANT USAGE, SELECT ON SEQUENCES TO "<APP 계정>";

-- ── 델타 (컬럼 추가 키트마다 아래에 append — 실행한 항목은 날짜·릴리스 주석) ──
-- (없음)
