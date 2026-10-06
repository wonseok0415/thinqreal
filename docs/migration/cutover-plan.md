# ThinQ Real 사내 전환(cutover) 계획 — v0.1 초안 (2026-09-28)

> **목적**: 현행(GitHub Pages + Apps Script + Google Sheets)에서 사내(EKS 컨테이너 + Aurora PostgreSQL + valkey, `thinqreal.lge.com`)로 넘어가는 날 전후에 **누가·언제·무엇을** 하는지 한 장으로 고정한다. 오픈 목표 **2026년 11월(잠정)**.
> **읽는 사람**: 담당자(강원석 책임)·협업자(UAT)·사내 Claude·외부 트랙. 사내 식별자·비밀값은 없다(internal-context 참조).
> **상태**: 초안 — 담당자 검토 전. 확정되면 상단 상태와 날짜를 갱신한다. 변경 이력은 `migration-log.md`.

## 0. 전제와 원칙

- **외부 접점 3종은 전환 후에도 현행 Google 경로 유지**(하이브리드 에지, decisions §6-7·§6-8): 방문객 QR 설문·FieldCheck 장비·FieldVoice는 그대로, 사내 컨테이너가 pull. 따라서 **Apps Script 자체는 폐기하지 않는다** — 자동 발송 트리거만 끈다.
- **데이터 원본**: 전환 후 예약·설문·관리자 데이터의 원본은 사내 DB. 시트는 전환 후 **읽기 전용 보존**(외부 접점 3탭만 계속 쓰임).
- **되돌리기 가능 구간**: D-day에 현행 트리거를 삭제하기 **전까지**는 아무것도 되돌릴 필요가 없다(현행이 그대로 살아 있음). 삭제 후 되돌리려면 §6.
- **메일 이중 발송 금지**: 같은 날 두 시스템이 같은 메일을 보내면 안 된다 — OP 스케줄러(`JOBS_DISABLED`)와 현행 트리거는 **한쪽만** 켜져 있어야 한다.

**DB팀 요청 리드타임(9/30 가이드)**: DB인프라(자원·계정) 요청은 **작업 완료 시점 기준 최소 7일 전** 접수. 창구 3종 — Next SPoC(계정 생성/삭제/연장/암호초기화) · JIRA(그 외 전부: SG 허용·권한·스키마·파라미터·Multi-AZ·데이터 추출/이관) · DBDIP(Object 반영관리 — 주요 서비스 QA 권역 이상만, 우리는 해당 없음 → JIRA).

## 1. 단계별 일정 (D = 전환일, 평일 오전 권장)

| 시점 | 할 일 | 담당 | 끝의 정의 |
|---|---|---|---|
| **T-4주** | OP 자원 완료: Aurora·valkey 생성(DBSUPPORT JIRA — ✅ 9/29) → **APP 계정 생성(Next Spoc) → 서비스 계정 SG 허용·권한(JIRA DB계정 변경승인요청, 작업일 최소 7일 전)** → 엔드포인트·계정 수령 | 담당자·DB팀 | internal-context §2-a·§2-b에 엔드포인트·계정명 기록 |
| T-4주 | **MGR(DB-i)로 `schema-ddl.sql` 1회 실행**(테이블 14종 + APP GRANT — 앱 첫 기동 전 필수, 설계 §8-18) | 담당자(SEAgent+DB-i)·DB팀 | `SELECT count(*) FROM information_schema.tables WHERE table_schema='<스키마명>'` = 14 |
| T-4주 | OP env 주입(DB_*·KVSTORE_*·AUTH_SECRET·LEGACY_AUTH_SECRET 등 — sealed-secret/Vault) | 담당자·사내 Claude·BE팀(cert) | OP `/healthz` `backend:"postgres"`·`kv:"shared"` |
| T-4주 | 과제 D 키트 v5 배포(`admin_import` + 관리자 「데이터 이행」 패널) | 외부 트랙·사내 Claude | QA에서 스냅샷 업로드 dry-run 통과 |
| **T-3주** | 협업자 UAT 1~8 완료(QA) + 차이 보고 판독·수정 키트 반영 | 협업자·외부 트랙 | 차이 항목 0 또는 "무해" 합의 |
| T-3주 | **QA 리허설**: 현행 시트 스냅샷 → QA 적재 → 건수·샘플 대조 → 관리자 페이지 확인 | 담당자·협업자 | 14표 건수 일치, 샘플 5건 필드 일치 |
| **T-2주** | UAT 9단계(메일)를 OP에서 — `[UAT]` 접두, 담당자 3인 사전 고지 | 협업자 | 9-1~9-6 판정 기입 |
| T-2주 | 운영 전환 안내문 확정(주소 변경·SSO 로그인·달라지는 점 없음·문의처) | 협업자 초안 → 담당자 확정 | 발송 대상·시점 확정(D-3 예고, D-day 본문) |
| **T-2주** | **Reader instance 추가 + 가용성(failover) 테스트 요청** — DB팀 안내(10/6): "PRD는 최초 Single Instance, 서비스 오픈 2주 전에 reader instance 추가 및 가용성 테스트 요청". JIRA DB자원(변경승인요청)에 **작업 완료 희망일 최소 7일 전**으로 ① Aurora reader instance 1대 추가(다른 AZ = Multi-AZ 성립) ② DB팀 주관 failover 테스트 일정 요청. 앱은 Cluster Writer 엔드포인트라 failover 시 엔드포인트가 새 writer로 자동 전환, pg Pool은 끊긴 커넥션을 버리고 재연결(키트 v5.3, 설계 §8-20). 리허설이 끝난 뒤 넣어 전환 작업과 겹치지 않게 | 담당자 → DB팀 | DB팀 완료 통보 + **failover 테스트 중 OP `/healthz` 계속 200·테스트 후 예약 조회 정상**(pod 재시작 없음 — `pod` 이름 불변) |
| T-1주 | 전환일 확정·공지(팀장·담당자 3인·협업자), 현행 예약 접수 동결 시각 합의 | 담당자 | 캘린더 공지 |
| T-1주 | OP 사전 점검: SSO·예외 경로 5종·`mail_status` smtp·`egress_check`·`env_keys`(smtp/db/kvstore true) | 담당자 | 전부 정상 |
| **D-1** | 현행 사이트에 "내일 HH:MM부터 새 주소로 이전" 배너(운영 세션에 요청) / 관리자에게 D-day 동안 시트·관리자 페이지 편집 금지 고지 | 담당자·운영 세션 | 배너 게시 |
| **D-day** | §2 실행 순서 | 담당자·사내 Claude·외부 트랙(대기) | §2 마지막 항목 ☑ |
| D+1 | 07:40 FieldCheck 요약·08:30 설문 초대가 **사내에서만** 나갔는지 수신함 확인(중복 0) / edge-sync 10분 반영 확인(방문자 설문 1건 테스트) | 담당자 | 중복 0, 반영 확인 |
| D+7 | 일주일 관찰 종료: 예약 접수·확정 메일·캘린더·리포트 미리보기 정상 → **전환 완료 선언**, 팀장 보고 | 담당자 | 보고 완료 |
| 이후 | 첫째 수요일 월간 리포트가 사내에서 발송되는지(가드 `PROP_LAST_SENT_KEY` 이행 여부 확인) / `thinqreal.com` 만료 전 CNAME 삭제·QR 포스터 교체(운영 세션) / 시트 보존 정책 확정 | 담당자·운영 세션 | — |

## 2. D-day 실행 순서 (약 2~3시간, 되돌릴 수 있는 순서로 배치)

| # | 단계 | 실행 | 확인 | 되돌리기 |
|---|---|---|---|---|
| 1 | **동결** | 현행 관리자에게 편집 중단 통보, 예약 접수 동결 시각 도래 | 시트 마지막 수정 시각 기록 | — |
| 2 | **스냅샷** | 현행 구글 시트 「파일 → 다운로드 → Microsoft Excel(.xlsx)」 1파일(13탭 전체) + Script Properties 2값(`monthly_report_last_sent_month`·`roi_report_snapshot_id`) 메모 — 키트 v5(설계 §8-17)는 별도 추출 도구 없이 이 파일을 그대로 받는다 | 패널 ① 검사의 「파일 행」 = 시트 각 탭 행수 | 재다운로드 |
| 3 | **적재** | OP `…/api?type=admin_import_page`(관리자 로그인 후) → ① 검사 → ② 적재(전 테이블, `skip`) → ⑤ 상태값 2개 저장 | ③ 검증 「전 테이블 일치」·오류 0 | 재적재(`skip`은 멱등 — 이미 들어간 id는 건너뜀) |
| 4 | **검증** | OP 관리자 페이지에서 최근 예약 5건·설문 3건·대장 2건 샘플 대조, 슬롯 차단·ROI 스냅샷·기사 큐레이션 표시 확인 | 샘플 전부 일치 | 3으로 |
| 5 | **현행 트리거 정지** | Apps Script 에디터 → 트리거 페이지에서 월간 리포트·설문 초대 트리거 **삭제**(스크립트·웹앱은 유지 — 외부 접점 3종 계속 동작) | 트리거 목록 0건(외부 접점용 트리거는 원래 없음) | `installMonthlyReportTrigger()`·`installSurveyInviteTrigger()` 재실행 |
| 6 | **OP 스케줄러 가동** | OP configmap에서 `JOBS_DISABLED=true` 제거 → sync → `/healthz` pod 교체 확인 | 기동 로그에 스케줄러 잡 3종 + edge-sync 등록 | 값 복원 |
| 7 | **현행 사이트 전환 안내** | 운영 세션에 요청: index.html 게이트 앞 안내("새 주소 `thinqreal.lge.com`")·예약 폼 비활성 / 관리자 페이지 동일. 방문자 설문·privacy·동의서는 **그대로**(외부 접점) | 현행 사이트에서 예약 불가 | 파일 원복(PR revert) |
| 8 | **안내 발송** | 전환 안내문 발송(임직원·담당자·팀장) | 발송 완료 | — |
| 9 | **첫 실거래** | 담당자가 OP에서 예약 1건 접수 → 담당자 알림 메일·Teams → 승인 → 확정 메일·캘린더 → 삭제 | 메일 2통·캘린더 1건 | — |
| 10 | **기록** | migration-log에 D-day 결과(건수·시각·문제) + internal-context 갱신 | 커밋 | — |

## 3. 시스템별 스위치 정리 (한쪽만 켜기)

| 기능 | 전환 전 | 전환 후 |
|---|---|---|
| 예약 접수·확정 메일·캘린더 | 현행 Apps Script | 사내 컨테이너 |
| 월간 리포트·설문 초대(일일 잡) | 현행 트리거 2종 | OP 인앱 스케줄러(`JOBS_DISABLED` 제거) |
| 월간 리포트 수신자 | Script Property `MONTHLY_REPORT_TO` = 운영자 1인(10/6 전환 — 외부 Gmail 발신이라 사내 DL 직접 투입 보류, 운영자가 사내 계정에서 전달) | OP configmap `MONTHLY_REPORT_TO`에 **DL(`DL-pbc-leaderonly`)+개인 명단 직접 등록** — 사내 SMTP 발신이라 DL 정책 통과 가능. 전환 전 OP에서 `[테스트]` 발송으로 DL 수신 실측(운영 세션 10/6 기록의 "이관 완료 후 복원" 항목) |
| FieldCheck 일일 요약 | 현행(`FC_TEST_MODE`) | OP 스케줄러 07:40 — **현행 쪽 요약 발송 함수가 별도 트리거면 함께 정지**(FieldCheck 세션 확인) |
| 방문객 QR 설문·FieldCheck 장비·FieldVoice | Apps Script `visitor_submit`·`health_check`·`voc_report` | **동일(유지)** + 사내 edge-sync pull |
| 담당자 메신저 알림 | 텔레그램(현행 Apps Script, 상세) | **OP = Teams 웹훅(상세) + 텔레그램(비식별 요약 — 성명·소속·연락처·주제·고객사 없음, 키트 v5.2 kic-op 자동)** — 절충안 2026-10-01. 외부 접점(방문객 설문·FieldCheck·FieldVoice) 제출 알림은 Apps Script가 텔레그램으로 계속 |
| 데이터 저장 | Google Sheets | Aurora PostgreSQL(외부 접점 3탭은 시트 원본 + DB 미러) |

## 4. 역할

| 역할 | 담당 |
|---|---|
| 총괄·판단·BE/DB팀 창구·push 승인·비밀값 | 담당자 |
| UAT·리허설 대조·안내문 초안·D-day 검증 보조 | 협업자 |
| 키트 적용·configmap 변경·internal-context 기록 | 사내 Claude(담당자 실행) |
| 키트 설계·코드·계획서 갱신·차이 판독 | 외부 트랙 |
| 현행 사이트 안내 배너·폼 비활성·CNAME/QR | 운영 세션 |
| cert·게이트웨이·OP 플랫폼 설정 | BE팀 |
| Aurora·valkey·계정·Multi-AZ | DB팀 |

## 5. 사전 조건 체크(D-1 저녁까지 전부 ☑)

- [ ] OP `/healthz`: `backend:postgres`·`kv:shared`·`env:kic-op`·`version` 최신
- [ ] OP `env_keys`: db·kvstore·smtp·authSecret·legacyAuthSecret 전부 true
- [ ] OP `/healthz` `backend:"postgres"`·`schema:"verified"`(APP 계정으로 형상 검증 통과)
- [ ] OP `teams_test` `{ok:true}` (secret의 `TEAMS_WEBHOOK_URL` 주입 — 채널에 테스트 카드 1건 도착)
- [ ] OP `telegram_test` `{ok:true}` (secret의 `TELEGRAM_*` 주입 + pod → api.telegram.org 아웃바운드 실측 — 차단이면 텔레그램 병행 포기, Teams만) + 예약 1건으로 비식별 요약 형식 확인(성명 없음)
- [ ] OP `mail_status` smtp / `egress_check` ok / SSO 예외 5종 로그인 없이 열림
- [ ] Reader instance 추가·failover 테스트 완료 통보(§1 T-2주 요청) — 테스트 중 `/healthz` pod 이름 불변 확인
- [ ] QA 리허설 건수 일치 기록 있음
- [ ] UAT 1~9 판정 기입, △·× 처리 완료
- [ ] 전환 안내문 확정, 발송 대상 목록
- [ ] 되돌리기 담당·연락 경로 확인(§6)

## 6. 되돌리기(rollback)

| 상황 | 조치 |
|---|---|
| D-day §2-3 적재 실패 | 사내 쪽만 정리(멱등 재적재 또는 표 비우기). 현행은 손대지 않았으므로 **아무 영향 없음** — 동결 해제 공지 후 재시도일 잡기 |
| §2-5 이후(현행 트리거 삭제 후) 사내 장애 | 현행 사이트 안내 배너 제거(§2-7 revert) → `installMonthlyReportTrigger()`·`installSurveyInviteTrigger()` 재실행 → OP `JOBS_DISABLED=true` 복원. 동결 이후 사내에 들어온 예약은 **수동으로 시트 백필**(CLAUDE.md 백필 규칙) |
| 부분 장애(메일만 안 감 등) | 사내 유지 + 담당자가 확정 메일 수동 발송, 원인 수정 키트 |

## 7. 미결 (확정되면 본문에 반영)

- 전환일(11월 중 평일) · 예약 접수 동결 시간 · 안내문 발송 대상(전 임직원? 최근 방문자?) — 담당자
- FieldCheck 일일 요약의 현행 트리거 존재 여부·정지 방법 — FieldCheck 세션 확인
- Teams 웹훅 URL: **담당자가 Teams 채널 → 워크플로에서 직접 생성 가능**(BE팀 불필요, Power Automate 템플릿 「웹후크 요청을 받으면 채널에 게시」) → 55-credentials `teams-webhook` 블록 → cert 후 secret 주입 → D-1 `teams_test`. 외부 접점 알림의 Teams 통합 여부는 운영 세션 협의
- 시트 보존 기간·접근 권한 정리(개인정보 보유 3년 규칙과 정합) — 담당자·법무
- `thinqreal.com` 만료일과 QR 교체 일정 — 운영 세션
