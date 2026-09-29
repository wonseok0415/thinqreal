-- ThinQ Real 컨테이너 저장소 DDL (플랜 B — 앱 계정의 자동 생성이 불허될 때 DB팀 JIRA 첨부용)
-- 생성 기준: server/src/lib/constants.js 상수 + store/postgres/index.js ensureSchema (2026-09-30). 전 컬럼 TEXT, rid BIGSERIAL PK — 설계 §3·§8-15.
-- 스키마명은 DB팀 생성값(internal-context §2-a)으로 치환. 앱은 기동 시 CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS를 다시 실행하므로 미리 만들어 두어도 무해.
-- 컬럼이 늘어나는 키트가 나오면 이 파일도 같은 커밋에서 갱신(앱 계정에 ALTER 권한이 없으면 매번 JIRA).

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

-- 앱 계정 권한(플랜 B에서 DB팀에 함께 요청): 스키마 USAGE + 위 14표 SELECT/INSERT/UPDATE/DELETE + 시퀀스 USAGE
-- GRANT USAGE ON SCHEMA "<스키마명>" TO "<APP 계정>";
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "<스키마명>" TO "<APP 계정>";
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "<스키마명>" TO "<APP 계정>";
