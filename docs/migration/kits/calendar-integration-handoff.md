# 키트 M3 — Google 캘린더 연동 인수인계 (사내 Claude 주도, 2026-11-09)

> **대상 독자: 사내 Claude.** 이 파일 한 장으로 §8-4 캘린더 연동을 끝까지 끌고 간다. 담당자(강원석 책임)가 GCP·캘린더·Vault 화면을 조작하고, 사내 Claude가 **순서 관리·판정·커밋**을 맡는다. 외부 트랙은 결과 보고만 받는다.
> 상위 문서: `cutover-plan.md` §8-4(결정·절차)·§8-4-b(프롬프트·검증 원문) · 키트 M2 §4-b(Vault 2키) · `credentials-format.md` `google-calendar-sa`. 이 파일은 그 셋을 **실행 순서**로 재배열한 것이며, 내용이 어긋나면 cutover §8-4-b가 우선.
> **값 금지**: 서비스 계정 JSON·캘린더 ID·토큰은 채팅·worklog·리포 어디에도 적지 않는다("55-credentials 참조"만).

## 0. 현재 상태 (사내 Claude가 먼저 확인)
| 항목 | 상태 | 확인 방법 |
|---|---|---|
| 컨테이너 캘린더 코드 | **이미 있음** — `src/calendar/google.js`(서비스 계정 JWT·calendar v3), `CALENDAR_ID` 미설정 시 skip | `grep -n "getCalendarApi" src/calendar/google.js` |
| OP 버전 | 0.23.0(JOBS_SKIP) — **키트 v5.12 미적용** | `<OP>/healthz` → `version` |
| 키트 v5.12 | GitHub 머지됨(PR #241) — 57번 미러 `git pull` 후 `server/src/config.js`에 `calendarMinimal` 있어야 함 | `findstr /c:"calendarMinimal" D:\workspace\50-resources\57-thinqreal-github\server\src\config.js` |
| 담당자 결정 | 연동 우선 진행, 보안팀 제재 시 해지. 이벤트는 **비식별 모드(`CALENDAR_MINIMAL=true`) 권고** — 최종 선택 담당자 | — |
| 팀 캘린더 | **기존 팀원 소유 캘린더 그대로**(현행 Script Property `CALENDAR_ID`). 신규 생성 아님 | — |
| GCP 프로젝트 | **기존 `thinqreal-cse` 재사용**(CSE 키용 — 새 프로젝트 불필요) | — |

## 1. 역할
| 누가 | 무엇 |
|---|---|
| 담당자 | A·B·C(GCP 서비스 계정 / 캘린더 공유 / Vault 2키) 화면 조작 · 55-credentials 기록 · 프롬프트 1·2 push 후 `/healthz`·`env_keys`·`calendar_test` 결과 붙여넣기 · 실거래 테스트(예약 승인→거절) |
| 사내 Claude | 아래 §2~§5 순서 관리, 각 단계 **완료 조건** 확인 후 다음으로, 커밋 2건(feat → chore), 결과 판정(§5 분기표), internal-worklog 기록, 외부 보고문 작성 |
| 외부 트랙 | 보고 수신 → cutover §8-4 ✅ · migration-log 기록. 막힘이 분기표 밖이면 외부에 질문 |

## 2. 담당자 선행 A·B·C — 사내 Claude가 하나씩 안내·확인
**A. GCP 서비스 계정 + JSON 키** (담당자 Google 계정, 프로젝트 `thinqreal-cse`)
1. console.cloud.google.com → 상단 프로젝트 선택 `thinqreal-cse`.
2. 「API 및 서비스 → 라이브러리」 → "Google Calendar API" 검색 → **사용**(결제 불필요).
3. 「IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기」: 이름 `thinqreal-op-calendar`, 역할 부여 **없음**(건너뛰기), 완료.
4. 만든 계정 클릭 → 「키」 탭 → 「키 추가 → 새 키 만들기 → JSON」 → 다운로드(파일 1개).
5. 55-credentials `google-calendar-sa` 블록에 JSON 전체 + **서비스 계정 이메일**(`…@thinqreal-cse.iam.gserviceaccount.com`) 기록. 다운로드 폴더의 원본은 삭제.
- **완료 조건(사내 Claude 확인 질문)**: "서비스 계정 이메일이 `@thinqreal-cse.iam.gserviceaccount.com`으로 끝나는가? Calendar API 페이지에 「API 사용 설정됨」이 보이는가?" — 이메일 값 자체는 채팅에 적지 않아도 됨(끝부분만).

**B. 팀 캘린더에 서비스 계정 공유**
1. Google 캘린더(웹) → 왼쪽 「내 캘린더」에서 팀 캘린더 ⋮ → 「설정 및 공유」.
2. 「특정 사용자 및 그룹과 공유 → 사용자 및 그룹 추가」 → 서비스 계정 이메일 → 권한 **「일정 변경」** → 보내기.
3. 같은 설정 화면 아래 「캘린더 통합 → 캘린더 ID」 값이 현행 Script Property `CALENDAR_ID`와 같은지 눈으로 대조(값은 적지 않음).
- **막힘**: 「특정 사용자 및 그룹과 공유」 섹션이 안 보이면 담당자 권한이 「일정 변경」까지라는 뜻 → 캘린더를 만든 팀원에게 "이 이메일을 「일정 변경」으로 추가해 달라"고 요청(또는 담당자 권한을 「변경 및 공유 관리」로 상향 요청).
- **완료 조건**: 공유 목록에 서비스 계정 이메일 + 「일정 변경」이 보임.

**C. Vault KV 2키** (키트 M2 §4-b — 기존 10키와 같은 경로)
1. Vault UI(LDAP 로그인, 경로는 internal-context §2-e) → 기존 앱 키 경로 → 새 버전 만들기.
2. `GOOGLE_SERVICE_ACCOUNT_JSON` = JSON 파일 내용을 **한 줄**로(줄바꿈 제거, 앞이 `{`로 시작, 따옴표로 감싸지 않음, base64 아님). 변환은 메모장에서 줄 끝 합치기 또는 사내 Claude가 PowerShell 한 줄 제공: `(Get-Content <파일> -Raw) -replace "\r?\n","" | Set-Clipboard`.
3. `CALENDAR_ID` = 현행 Script Property 값 그대로.
4. 저장 → 새 버전 번호 확인.
- **완료 조건**: Vault에 12키(기존 10 + 2), `GOOGLE_SERVICE_ACCOUNT_JSON` 값이 `{"type":"service_account"`로 시작.
- **⚠ C가 끝나기 전에 §4 프롬프트 2(secret.yaml)를 커밋하지 않는다** — AVP가 값을 못 찾아 ArgoCD sync가 깨진다.

## 3. 커밋 1 — 키트 v5.12 코드 (feat → 0.24.0)
담당자 "A·B·C 완료" 보고 후 실행. cutover §8-4-b 프롬프트 1과 동일:
- 57번 미러 `git pull` → `server/src/config.js`·`server/src/calendar/google.js`·`server/.env.example` 3파일을 54번 같은 경로(`src/config.js`·`src/calendar/google.js`·`.env.example`)로 복사. `deploy/`는 건드리지 않음.
- 커밋 `feat: 키트 v5.12 — CALENDAR_MINIMAL 캘린더 이벤트 비식별 모드` → `git pull --rebase origin main && git push origin main`.
- **완료 조건**: Gitea Actions `chore: release thinq-real 0.24.0` → `<OP>/healthz` 3회 모두 `version:"0.24.0"`·pod 이름 교체. **0.24.0 전에는 §4로 가지 않는다**(코드보다 `CALENDAR_ID`가 먼저 도달하면 그 사이 승인 건이 전체 표기로 Google에 기록됨).

## 4. 커밋 2 — 주입 (chore)
cutover §8-4-b 프롬프트 2와 동일:
1. `deploy/kic-op/secret.yaml` — 기존 자리표시자 형식 그대로 2개 추가: `GOOGLE_SERVICE_ACCOUNT_JSON: <GOOGLE_SERVICE_ACCOUNT_JSON | base64encode>` / `CALENDAR_ID: <CALENDAR_ID | base64encode>` (→ 12키). AVP 주석·path·이름 무변경.
2. `deploy/kic-op/configmap.yaml` — `CALENDAR_MINIMAL: "true"` 1줄 추가(담당자가 전체 표기를 원하면 이 줄 생략 — 기본 off). 다른 키 무변경.
3. `deploy/base/deployment.yaml` `thinqreal/config-rev` +1.
- 커밋 `chore: OP 캘린더 연동 — secret 2키(서비스 계정·캘린더 ID) + CALENDAR_MINIMAL on + config-rev` → pull --rebase → push.
- **완료 조건**: ArgoCD Synced·Healthy, `/healthz` pod 교체.

## 5. 검증 7단계 + 분기표
cutover §8-4-b 표 그대로 — ① `/healthz` 0.24.0·pod 교체 ② `env_keys`에 `GOOGLE_SERVICE_ACCOUNT_JSON`·`CALENDAR_ID`·`CALENDAR_MINIMAL` ③ `calendar_test` → `ok:true`·`calendarName`·`testedEventId` ④ 팀 캘린더에 「🧪 … 테스트」 잔존 없음 ⑤ 실거래: OP 관리자에서 예약 추가(담당자 본인) → 승인 → 팀 캘린더에 회차별 일정, 제목 `[목적] 본부`, 본문에 **성명·고객사·주제·활용 방안 없음** ⑥ 같은 건 거절 → 일정 전부 제거 ⑦ 기록.
`calendar_test` 응답별 조치는 §8-4-b 분기표(`not_configured`·`no_access`·403·404·`invalid_grant`·`accessNotConfigured`·네트워크 오류). **네트워크 오류**(`ENOTFOUND`/`ETIMEDOUT`)면 pod → `oauth2.googleapis.com`·`www.googleapis.com` 443 차단 → BE팀 경유 방화벽 허용 요청(문안은 사내 Claude 작성, 호스트 2개·포트 443·사유 "팀 캘린더 동기화").

## 6. 보고·기록
- internal-worklog: 단계별 시각 + 판정(값 없음). 55-credentials: `google-calendar-sa` 블록 발급일·서비스 계정 이메일.
- 외부 보고문(담당자가 외부 트랙에 붙여넣기):
  ```
  [날짜 사내] 캘린더 연동 결과
  한 일: A·B·C 완료(공유 권한 「일정 변경」, Vault 12키) / 커밋 feat(0.24.0)·chore(config-rev N) / 검증 ①~⑥
  결과: healthz version·pod 교체 ○ / env_keys 3키 ○ / calendar_test ok:true(calendarName 마스킹) / 테스트 일정 잔존 없음 / 실거래 일정 생성·제거 ○, 본문 비식별 ○
  막힘·질문: (분기표 밖 증상이 있으면 응답 JSON의 error 문자열만)
  다음: 운영 — 승인 시 자동 반영, 해지 필요 시 §8-4 해지 절차
  ```
- 외부 트랙이 cutover §8-4 ✅·migration-log 기록·치트시트 A에 `calendar_test` 행 추가.

## 7. 해지 (보안팀 제재 시 — 담당자 결정)
① `secret.yaml` 2키 자리표시자 삭제 + configmap `CALENDAR_MINIMAL` 삭제 + config-rev +1(`chore:`) → `env_keys`에서 사라짐 확인 ② 팀 캘린더 공유 목록에서 서비스 계정 제거 ③ GCP 서비스 계정 키 삭제(또는 계정 삭제) ④ Vault 2키 삭제(새 버전) ⑤ credentials 블록 교체 이력에 사유·일자. 기존에 생성된 일정은 캘린더에 남음 — 삭제 여부는 담당자 판단.

## 8. 사내 Claude 시작 프롬프트 (담당자가 새 채팅에 붙여넣기)
```
[캘린더 연동 인수] 54번 docs/migration/kits/calendar-integration-handoff.md(없으면 내가 붙여넣는 본문)를 읽고 §8-4 Google 캘린더 연동을 네가 주도해줘. 순서: §0 현재 상태 확인(healthz version, 57번 미러 calendarMinimal 존재) → §2 A·B·C를 나에게 한 단계씩 안내하고 완료 조건을 질문으로 확인(값은 묻지 말고 형식·끝부분만) → 셋 다 끝나면 §3 커밋 1(feat) → 내가 0.24.0 확인 → §4 커밋 2(chore) → §5 검증 7단계 판정(분기표) → §6 worklog 기록 + 외부 보고문 작성. 비밀값·캘린더 ID·토큰은 채팅·worklog에 절대 적지 않음(55-credentials 참조). 라이브 파일(public/ HTML·Apps Script) 무수정. CALENDAR_MINIMAL은 "true"로(내가 달리 말하기 전까지).
```
