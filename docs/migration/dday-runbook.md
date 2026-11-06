# D-day 실행 런북 — 2026-11-9(월) 목표 (예비 11/10 화 · 11/18 수)

> `cutover-plan.md` §2를 **시각·담당·확인값·붙여넣을 것** 단위로 쪼갠 표. 당일은 이 문서만 보고 위에서 아래로 진행한다. 값(주소·토큰·비밀값)은 없다 — 주소는 치트시트 B, 비밀값은 55-credentials. 결과는 §4 기록 칸에 적어 migration-log로 옮긴다.
> **중지 기준**: 3단계(적재) 실패·4단계(검증) 불일치면 **거기서 멈추고 동결 해제** — 5단계(현행 트리거 삭제) 전까지는 현행이 그대로 살아 있어 되돌릴 것이 없다(§6).

## 0. D-1 (11/6 금) — 저녁까지
| 시각 | 할 일 | 담당 | 확인 |
|---|---|---|---|
| 오전 | 전환 안내 예고 발송(담당자 3·팀장): "11/9(월) 08:00~11:00 예약 접수 일시 중단, 11:00부터 `thinqreal.lge.com`" | 담당자 | 발송 |
| 오전 | 11/9~10 확정 예약 유무 확인 — 있으면 방문 담당자에게 "당일 시스템 전환, 방문은 정상" 구두 안내 | 담당자 | 건수 |
| 오후 | 운영 세션에 **현행 사이트 안내 PR**(§3-A 문안) 준비 요청 — **머지는 D-day 7단계에서** | 담당자→운영 세션 | PR 번호 |
| 오후 | OP `/healthz` 4값(`postgres`·`verified`·`shared`·`env`), `mail_status smtp`, `egress_check ok` 재확인 | 담당자 | 치트시트 B |
| 오후 | **DB-i 매핑이 현재 writer를 가리키는지**: 11/5 failover 후 writer가 두 번째 인스턴스로 교대(failback 없음) → 두 번째 인스턴스 DB-i 등록(Next SPoC, 테스트 직후 신청·11/17 전 완료 목표)이 끝났는지 + DBeaver에서 `SELECT pg_is_in_recovery()` = false 확인. 미완료면 3-e 삭제 SQL 불가 → 사내 Claude가 APP 계정 경로 대안 또는 D-day 연기 판단 | 담당자·사내 Claude | false |
| 오후 | **확정 메일 Wi-Fi·도어락 4키 주입**(11/6 발견 — OP 확정 메일에 "(미설정)"): 사내 Claude가 `deploy/kic-op/configmap.yaml`에 `WIFI_SSID_24G`·`WIFI_SSID_5G`·`WIFI_PASSWORD`·`DOORLOCK_PIN` 4줄 추가(값 = 현행 `.gs` buildConfirm* = CLAUDE.md 규칙 줄, **평문 configmap — 담당자 결정**) + config-rev +1 → `env_keys`에 4키 → 테스트 예약 1건 승인해 확정 메일에 실제 값 확인 후 삭제 | 담당자·사내 Claude | 메일에 SSID·PW·PIN 표시 |
| 오후 | **라이브 정적 재병합 확인**: GitHub에서 `git log --since=2026-09-22 -- '*.html' images`가 비어 있으면 Gitea `public/`은 최신(9/22 키트 v4.1 동기본). 변경이 있으면 사내 Claude에 "미러 루트 HTML 7종·images → Gitea public/ 복사, `fix:` 커밋"(SCRIPT_URL은 서빙 시 치환이라 수정 없이 복사). **D-day 7단계의 안내 배너 PR은 public/에 복사하지 않는다**(OP는 배너 없는 버전) | 담당자·사내 Claude | 변경 0건 또는 복사 완료 |
| 오후 | 사내 Claude에 §3-B D-day 프롬프트 전달해 두기(실행은 당일) | 담당자 | — |
| 저녁 | cutover §5 체크 전부 ☑ 확인 | 담당자 | ☑ |

## 1. D-day 타임라인 (11/9 월)
| 시각 | # | 단계 | 실행(붙여넣기) | 확인값 | 실패 시 |
|---|---|---|---|---|---|
| 08:00 | 1 | **동결** | 담당자 3명 Teams: "지금부터 현행 관리자 페이지·시트 편집 중단" / 현행 관리자 페이지 예약 KPI 화면 캡처(건수 기준점) | 시트 마지막 수정 시각 메모 | — |
| 08:05 | 2 | **현행 상태값 메모** | script.google.com → 프로젝트 설정 → 스크립트 속성에서 `monthly_report_last_sent_month`·`roi_report_snapshot_id` 두 값 메모(패널 ⑤에 입력) | 2값 | — |
| 08:10 | 3-a | **OP 패널 진입** | 시크릿 창 → `https://thinqreal.lge.com/thinqreal_admin.html` 로그인(코드 메일) → 같은 창에서 `https://thinqreal.lge.com/api?type=admin_import_page` → 상단 「토큰 있음」 | 배지 | 로그인 재시도(코드 메일 60초 쿨다운) |
| 08:15 | 3-b | **현행 로그인(패널 안)** | 소스 「현행 시스템에서 직접」 → 메일 → [코드 받기] → 6자리 → [로그인] → "현행 토큰 확보" | 상태 문구 | 코드 재요청 |
| 08:20 | 3-c | **① 검사** | [검사] → 표별 「파일 행」이 1단계 캡처 건수와 일치(bookings 등), 빈 id·중복 0, `export_log`는 미조회 안내 | 12표 판독 | 건수 불일치면 현행에서 동결 후 수정이 있었는지 확인 → 재검사 |
| 08:30 | 3-d | **② 적재** | 전 테이블 체크, 모드 `skip` → [적재] → 완료(≤5분) | 오류 0 | 오류 표만 재적재(멱등) |
| 08:40 | 3-e | **③ 검증** | [검증] → 「전 테이블 일치」 | 일치 | ✗ 표: OP에만 있는 행이면 「4 초과 행 삭제」(OP 테스트 행 — kic-op에서는 패널에 숨김이라 **사내 Claude 초안 SQL을 담당자가 DBeaver에서 MGR 접속 → `SELECT pg_is_in_recovery()`가 false(writer)인지 확인 → `SET ROLE <스키마 소유 역할>` 후 실행** — 11/5 failover 뒤 writer가 두 번째 인스턴스로 교대되므로 **두 번째 인스턴스 DB-i 등록(Next SPoC) 선행**(D-1 체크). true면 중단. 소유 역할이라 DELETE 권한 있음), 현행에만 있으면 재적재 |
| 08:50 | 3-f | **⑤ 상태값** | 2단계 메모 2값 입력 → 저장 | 저장 | — |
| 09:00 | 4 | **샘플 대조** | OP 관리자 페이지: 최근 예약 5건(상태·슬롯·책임자)·설문 3건·대장 2건을 현행 캡처와 대조, 슬롯 차단·ROI 📌 지정·기사 큐레이션 표시 | 전부 일치 | 불일치 → 3-d로(멱등) |
| 09:20 | — | **GO/NO-GO** | 여기까지 전부 ✓이면 진행. 아니면 **중지·동결 해제**(현행 무영향) | 결정 기록 | — |
| 09:25 | 5 | **현행 트리거 정지** | script.google.com → 트리거(⏰) → `monthlyReportTrigger`·설문 초대 트리거 **삭제** (스크립트·웹앱은 유지 — 외부 접점 3종 계속) | 트리거 0건 | `installMonthlyReportTrigger()`·`installSurveyInviteTrigger()` 재실행으로 복원 |
| 09:30 | 6 | **OP 스케줄러 가동** | 사내 Claude: `deploy/kic-op/configmap.yaml`에서 `JOBS_DISABLED` 줄 삭제 + `config-rev` +1 → `chore:` 커밋·push → ArgoCD Synced | `/healthz` pod 교체, `env_keys`에 `JOBS_DISABLED` 없음 | 줄 복원·재커밋 |
| 09:45 | 6-b | **리포트 수신자 설정** | 같은 커밋 또는 직후: `MONTHLY_REPORT_TO`=운영자+담당자 3명(§3-C, DL 미등록), `MONTHLY_REPORT_TEST_TO`=운영자 | `env_keys` | — |
| 10:00 | 7 | **현행 사이트 안내** | 운영 세션이 준비한 PR 머지(안내 배너 + 예약 폼 비활성, 관리자 페이지 동일 / 방문자 설문·privacy·동의서는 그대로) | `thinqreal.com`에서 예약 불가·배너 표시(강력 새로고침) | PR revert |
| 10:15 | 8 | **안내 발송** | 전환 안내문(§3-D) 임직원·담당자·팀장 | 발송 | — |
| 10:30 | 9 | **첫 실거래** | 담당자가 OP에서 예약 1건 접수 → 담당자 알림 메일·Teams 카드·텔레그램 비식별 요약 → 승인 → 확정 메일 → 삭제. **캘린더는 전환 범위 밖(11/2 담당자 결정 — OP env 미설정이라 skip, 추후 방법 결정)** | 메일 2통·카드·텔레그램 1건 | 메일만 실패 → 수동 발송 + 키트 |
| 10:45 | 9-b | **메일 링크 확인** | 9단계 확정 메일의 「이용 안내」 링크와 설문 초대 메일(다음날 08:30) 링크가 `thinqreal.lge.com`인지 — configmap `GUIDE_URL`·`SURVEY_FORM_URL`(11/2 추가) | lge.com 링크 | 두 키 누락 → 추가 커밋 |
| 11:00 | 10 | **기록·해제** | 동결 해제 공지("OP에서 정상 접수"), §4 기록 → migration-log·internal-context | 커밋 | — |

## 2. D+1~D+2 (11/10~11) 모니터링
- 매일 `/healthz`(4값·pod)·`edge_sync_now`(visitors·health·voc 증가)·OP 관리자 페이지 신규 예약 유무.
- 설문 초대 자동 발송(OP 08:30 잡)이 **전날 방문 완료 건에만** 나가는지 — 현행 트리거가 삭제됐으니 이중 발송은 구조상 불가(§3 스위치).
- 되돌리기 창: §6 기준. 11/11 종업 후에도 문제 없으면 11/13(금) 종료 선언.

## 3. 붙여넣을 것
### 3-A. 운영 세션 요청(현행 사이트 안내 PR — D-1 준비, D-day 머지) — 11/6 문안 다듬음
```
이관 세션 요청(전환 D-day 11/9(월) 머지용 PR — 머지 전까지 라이브 무변경):
1. index.html — 게이트 앞과 홈 상단에 안내 배너(다크 올리브 톤, 닫기 버튼 없음):
   제목: 「ThinQ Real 예약은 사내 주소로 이전했습니다」
   본문: 「2026년 11월 9일부터 방문 예약과 관리자 페이지는 https://thinqreal.lge.com 에서 이용하실 수 있습니다(사내망·SSO 로그인).
         이 페이지에서는 더 이상 예약을 받지 않으며, 기존에 접수·확정된 예약은 모두 그대로 유지됩니다.」
   + 예약 탭: 폼 제출 버튼 disabled, 버튼 아래 같은 톤의 한 줄 「예약은 thinqreal.lge.com 에서 진행해 주세요」. 달력·슬롯 표시는 그대로.
2. thinqreal_admin.html — 로그인 화면 상단에 같은 배너(본문 「관리자 페이지는 https://thinqreal.lge.com/thinqreal_admin.html 로 이전했습니다. 이 페이지는 열람용으로만 남습니다」). 로그인 기능은 유지.
3. ThinQ_Real_Visitor_Survey.html · ThinQ_Real_Visit_Survey.html · privacy.html · ThinQ_Real_Visit_Consent.html — 변경 없음(외부 접점·게이트 밖 문서).
4. ThinQReal_AppScript.gs — 변경 없음(visitor_submit·health_check·voc_report·survey_data·health_checks·voc_reports는 계속 호출됨).
5. 배너는 body.unauth 게이트 가림 선택자(direct-child) 밖에서도 보이도록 배치 확인.
PR 제목 "chore: 사내 전환 안내 배너 + 예약 접수 중단 (D-day 머지)". 머지는 담당자가 11/9 10:00 7단계에서.
```
### 3-B. 사내 Claude D-day 프롬프트(6·6-b단계)
```
D-day 6단계. deploy/kic-op/configmap.yaml에서 JOBS_DISABLED 줄을 삭제하고, MONTHLY_REPORT_TO=<운영자+담당자 3명 쉼표 구분, internal-context §2-h>, MONTHLY_REPORT_TEST_TO=<운영자 메일>을 추가/갱신, deploy/base/deployment.yaml config-rev +1.
다른 키는 건드리지 마. 커밋 "chore: D-day — OP 스케줄러 가동(JOBS_DISABLED 제거) + 리포트 수신자 복원", push는 git pull --rebase origin main && git push origin main.
push 후 내가 /healthz·env_keys 결과를 붙이면 pod 교체·JOBS_DISABLED 부재·MONTHLY_REPORT_TO 존재를 판정해줘. internal-worklog에 시각과 함께 기록.
```
### 3-C. 리포트 수신자(6-b) — 11/6 변경(사내 제안 수용)
`MONTHLY_REPORT_TO` = **운영자 + 담당자 3명(4명, configmap 평문 — 메일 주소는 비밀값 아님)**. DL(`DL-pbc-leaderonly`)은 **직접 등록하지 않음** — 2027 조직 개편 예정이라 DL 구성 변동 전까지는 담당자가 Outlook에서 4그룹(팀장 요청 범위)에 수동 전달. `MONTHLY_REPORT_TEST_TO` = 운영자. 값은 internal-context §2-h. **12/2 첫 자동 발송 검증 = 4명 수신 + 전달 본문(도넛 cid 이미지·KPI 카드·범례) 정상**. 나중에 DL로 바꿀 때는 configmap 한 줄 + `config-rev` +1만. 구 명단 백업(10/6, 운영자 보관)은 전달 수신자 재료로만 사용.
### 3-D. 전환 안내문(8단계)
```
[안내] ThinQ Real 예약 시스템 사내 전환 완료
- 오늘(11/9) 11:00부터 예약 신청·관리자 페이지는 사내 주소 https://thinqreal.lge.com 에서 이용해 주세요(사내망, SSO 로그인).
- 기존 주소(thinqreal.com)는 예약을 받지 않으며, 방문 후기 설문·현장 QR 설문·개인정보 처리방침은 기존 그대로 이용 가능합니다.
- 이미 접수·확정된 예약은 모두 그대로 유지됩니다. 확정 일정은 당분간 새 주소의 관리자 페이지에서 확인해 주세요(팀 캘린더 연동은 추후 안내). 문의: 담당자 3명(이철호·서문수·김현진)
```

## 4. 기록 칸 (당일 채움 → migration-log)
| 항목 | 값 |
|---|---|
| 동결 시각 / 해제 시각 | |
| 적재 건수(bookings·survey·visitors·articles·insights·best·ledger·roi·slot_blocks·health·voc) | |
| 적재 소요 / 오류 | |
| 검증 결과 / 초과 행 처리 | |
| 트리거 삭제 시각 / JOBS_DISABLED 제거 커밋 | |
| 첫 실거래 결과(메일 2·Teams·텔레그램·캘린더) | |
| 문제·판단 | |
