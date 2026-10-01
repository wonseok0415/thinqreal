# 비밀값 보관 파일 포맷 (55-credentials — 사내 PC 전용, 리포 밖)

> 이 문서는 **포맷만** 정의한다. 실제 값은 담당자 PC의 `55-credentials` 폴더 안 `thinqreal-credentials.txt` 한 파일에만 둔다.
> 그 파일은 Gitea·GitHub·미러 폴더(54·57번) 밖에 있어야 하고, 채팅·사내 Claude 프롬프트·캡처에 절대 올리지 않는다.
> 다른 문서(internal-context 등)에는 "55-credentials 참조"라고만 적는다.

## 규칙

1. **항목 하나 = 블록 하나.** 블록은 `=====` 줄로 구분하고, 키 이름은 아래 11개를 항상 같은 순서로 쓴다(값이 없으면 `-`).
2. **`주입`** 줄에는 그 값이 들어갈 자리의 이름만 적는다(OP secret의 env 이름 또는 Apps Script Script Property 이름). 이 줄이 있어야 cert 이후 secret 봉인 때 무엇을 어디에 넣는지 헷갈리지 않는다.
3. **값을 바꾸면 `값`을 덮어쓰고 `교체 이력`에 한 줄 추가**한다(날짜·사유). 이전 값은 남기지 않는다.
4. **`출처`**에는 티켓 번호·메일 제목처럼 나중에 찾을 수 있는 단서만 적는다(메일 본문·캡처는 저장하지 않음).
5. 파일 맨 위에 `최종 수정` 날짜 한 줄. 파일을 열 때마다 이 줄을 갱신한다.
6. 파일은 PC 로그인 암호로 보호되는 개인 폴더에 두고, 공유 드라이브·메신저·메일로 보내지 않는다.

## 블록 템플릿

```
=====
키        : <짧은 식별자 — 영문·하이픈, 예: op-db-app>
용도      : <한 줄 설명>
대상      : <시스템/인스턴스 — 이름만, 엔드포인트는 internal-context 참조>
계정      : <계정명 — 대소문자 그대로. 미확정이면 "(pg_roles 확인 전)">
값        : <비밀번호/토큰>
발급일    : <YYYY-MM-DD>
출처      : <티켓 번호·발급 경로>
주입      : <OP secret env 이름 또는 Script Property 이름 — 없으면 "-">
교체 주기 : <정책이 있으면 — 없으면 "-">
교체 이력 : <YYYY-MM-DD 사유> (여러 줄 가능)
비고      : <주의사항>
```

## 초기 파일 예시 (값은 전부 자리표시자)

```
최종 수정 : 2026-10-01

=====
키        : op-db-app
용도      : OP Aurora 서비스 계정 — 컨테이너가 접속(DML·조회만)
대상      : OP Aurora PostgreSQL (internal-context §2-a)
계정      : THINQREAL_APP (pg_roles 확인 전)
값        : ********
발급일    : 2026-10-01
출처      : Next SPoC RITM(계정 생성 완료 메일) — ITSM 오류로 10/2 13시 이후 재요청 예정
주입      : DB_USER / DB_PASSWORD (OP SealedSecret thinq-real-db-svc)
교체 주기 : -
교체 이력 : (OP 전환 전 암호 초기화 1회 예정 — 외부 경로 경유 값)
비고      : DDL 권한 없음. 표 생성은 op-db-mgr로.

=====
키        : op-db-mgr
용도      : OP Aurora 관리자 계정 — 사람이 DB-i로 접속해 DDL(schema-ddl.sql) 실행
대상      : OP Aurora PostgreSQL (internal-context §2-a)
계정      : THINQREAL_MGR (pg_roles 확인 전)
값        : ********
발급일    : 2026-10-01
출처      : Next SPoC RITM(계정 생성 완료 메일, DB-i 매핑 연장 승인)
주입      : - (컨테이너에 넣지 않음 — 사람 전용)
교체 주기 : -
교체 이력 : (OP 전환 전 암호 초기화 1회 예정)
비고      : DB-i 접속 시 CATOZ 승인 Vault 개인계정으로 도구 로그인 후 이 계정으로 DB 로그인(첫 접속에서 확인).

=====
키        : op-valkey
용도      : OP valkey — AUTH 미사용(비밀값 없음)
대상      : OP valkey (internal-context §2-b)
계정      : -
값        : - (AUTH/RBAC 미사용, TLS만)
발급일    : -
출처      : DBSUPPORT 회신 2026-09-30
주입      : - (KVSTORE_ADDR·KVSTORE_TLS=true는 configmap)
교체 주기 : -
교체 이력 : -
비고      : 비밀값이 없다는 사실 자체를 기록해 둠.

=====
키        : op-auth-secret
용도      : 컨테이너 토큰 서명 키(OP) — 현행 Apps Script AUTH_SECRET과 다른 새 값
대상      : OP 컨테이너
계정      : -
값        : ******** (cert 수령 후 생성)
발급일    : -
출처      : 담당자 생성(무작위 64자 이상)
주입      : AUTH_SECRET (OP SealedSecret)
교체 주기 : -
교체 이력 : -
비고      : 바꾸면 발급된 관리자·임직원 토큰이 전부 무효. 전환 후에는 바꾸지 않는다.

=====
키        : legacy-auth-secret
용도      : 현행 Apps Script의 AUTH_SECRET — 하이브리드 에지 2단계(사내 pull이 현행 토큰 발급에 사용)
대상      : Apps Script Script Property
계정      : -
값        : ********
발급일    : -
출처      : script.google.com 프로젝트 설정 → Script Properties
주입      : LEGACY_AUTH_SECRET (OP SealedSecret) / AUTH_SECRET (Script Property)
교체 주기 : -
교체 이력 : -
비고      : 양쪽 값이 같아야 한다. 한쪽만 바꾸면 edge-sync의 voc·visitors pull이 unauthorized.

=====
키        : telegram-bot
용도      : 텔레그램 알림 봇
대상      : Telegram
계정      : (봇 이름)
값        : ******** (토큰) / 채팅 ID: ********
발급일    : -
출처      : Script Properties TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID
주입      : TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (OP SealedSecret — 전환 시)
교체 주기 : -
교체 이력 : -
비고      : 전환 후에도 현행 Apps Script가 외부 접점 알림에 계속 사용 — 양쪽 동일 값.

=====
키        : teams-webhook
용도      : OP 담당자 알림 — MS Teams 워크플로 웹훅(전환 후 메인 채널, decisions §⑤)
대상      : 담당자 Teams 채널(워크플로 「웹후크 요청을 받으면 채널에 게시」)
계정      : -
값        : ******** (웹훅 URL 전체 — URL 자체가 비밀값)
발급일    : -
출처      : 담당자가 Teams 채널 → 워크플로에서 직접 생성
주입      : TEAMS_WEBHOOK_URL (OP SealedSecret)
교체 주기 : -
교체 이력 : -
비고      : 설정하면 컨테이너는 텔레그램과 Teams 양쪽에 보냄(둘 다 env 없으면 skip). OP는 Teams만 두는 것이 원칙 — TELEGRAM_* 미주입.

=====
키        : fc-api-key
용도      : FieldCheck 점검 장비 키
대상      : Apps Script Script Property FC_API_KEY ↔ rig config.json
계정      : -
값        : ********
발급일    : 2026-07-30 (Property 이전)
출처      : FieldCheck 세션
주입      : FC_API_KEY (Script Property — 외부 접점은 현행 유지라 OP 미주입)
교체 주기 : -
교체 이력 : -
비고      : 교체 시 rig config.json과 동시 교체.
```

## 전환 시점에 이 파일에서 꺼내 쓰는 순서 (cutover-plan T-4주 "OP env 주입")

1. `op-db-app`의 계정·값 → `DB_USER`·`DB_PASSWORD`
2. `op-auth-secret` 생성·기록 → `AUTH_SECRET`
3. `legacy-auth-secret` → `LEGACY_AUTH_SECRET`
4. `teams-webhook` → `TEAMS_WEBHOOK_URL` (OP 알림은 Teams만 — `telegram-bot`은 외부 접점용 Apps Script에 남기고 OP에는 주입하지 않음, 2026-10-01 결정)
5. 봉인(kubeseal) → 매니페스트 커밋 → 롤아웃 → `/healthz` `backend:"postgres"`·`schema:"verified"`·`authSecret:"env"`

위 순서 외의 값(SERPER·CSE·CALENDAR·SURVEY_CAS_JSON 등 Script Properties)은 전환 범위에 따라 같은 포맷으로 블록을 추가한다.
