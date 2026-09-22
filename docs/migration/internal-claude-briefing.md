# 사내 Claude 브리핑 — 프로젝트 다이제스트·역할 경계·판단 기준

> **읽는 사람**: 사내 Gitea `extapps/thinq-real`에서 일하는 Claude Code(사내 Claude). 매 세션 이 문서를 먼저 읽는다 (루트 `CLAUDE.md`의 읽기 순서 1번).
> **성격**: 외부 트랙(담당자 개인 계정 Claude 세션)이 두 달간 쌓은 결정·근거·현재 상태를 **사내 Claude가 현장에서 스스로 판단할 수 있는 수준**으로 압축한 것. 사내 식별자(계정명·VPC·CIDR·내부 주소·기재값)는 이 퍼블릭 문서에 없다 — **`internal-context.md`(사내 Gitea 전용)** 를 함께 읽어야 완성된다.
> **갱신**: 외부 트랙이 GitHub `wonseok0415/thinqreal`에서 관리. 최신 상황은 `migration-log.md` 마지막 항목이 항상 우선한다. (v1 — 2026-09-15)

## 1. 시스템 한 장

| | 현행 (지금 운영 중) | 이관 목표 (이 저장소) |
|---|---|---|
| 프론트 | GitHub Pages 정적 HTML 6종 (`thinqreal.com`) | 같은 HTML을 컨테이너가 `public/`으로 서빙 |
| 백엔드 | Google Apps Script (`?type=...` GET 19종 + POST 30종) | Node 22 + Express `src/` — **API 계약 100% 동일** (`/api?type=...`) |
| 데이터 | Google Sheets 탭 14종 | PostgreSQL 테이블 14종 (기동 시 자동 생성·진화) + Valkey(캐시·락) |
| 메일·알림 | Gmail(Apps Script) + 텔레그램 | SMTP(사내 스펙 대기) — ST/QA는 실발송 억제(콘솔 로그) |
| 일일 자동 작업 | Apps Script 시간 트리거 | **인앱 스케줄러**(07:40 점검 요약 / 08:30 월간 리포트·설문 초대) — K8s CronJob 불필요 |
| 인증 | 앱 자체 이메일 코드(HMAC 토큰) | 당분간 동일 + 전면에 사내 SSO(MS Entra ID, ops-gateway) |
| 주소 | `thinqreal.com` | **`thinqreal.lge.com`** = OP (사내망 전용, 9/18 CSR 반영 — 구 `kic-op-…thinqcloud.link` URL은 제거됨). ST/QA는 thinqcloud.link 주소 유지 |

**역할 분담**: 현행 사이트의 운영·수정은 외부 트랙(별도 세션). 이 저장소는 **이관 트랙만**. 이관 완료 전까지 현행이 계속 운영되며, 현행의 변경은 외부 트랙이 컨테이너에 동기 이식한 뒤 "키트"(완성 파일 zip)로 사내에 반입한다. **사내 Claude는 코드를 새로 쓰지 않는다** — 키트 적용·검증·기록과 사내 시스템 절차가 일이다.

## 2. 현재 상태 (2026-09-15)

- **과제 A(컨테이너 첫 배포) ✅ / 과제 B(PostgreSQL 영속 저장소 + 인앱 스케줄러) ✅ / 과제 C(ST·QA 발송 억제) ✅** — 릴리스 **0.9.0**이 ST·QA·OP 3환경에서 가동 중. ST `/healthz` = `{"ok":true,"backend":"postgres"}` 실측 확인(9/14).
- **ST/QA**는 BE팀 제공 공용 자원(extapps-db·extapps-kvstore·sealed-secrets) 사용 — 개발 편의용. **OP는 반드시 서비스별 자원을 담당자가 직접 신청**해야 한다(§3). 앱은 env 주입 구조라 **코드 변경 없이** OP 자원으로 갈아 끼운다.
- **SSO(MS Entra ID)가 3환경 전부에 적용**됨 → 사내 계정 없는 호출자(외부 방문객 QR 설문, 점검 장비 API, 공개 열람 페이지)는 차단됨. BE팀 답: **path 단위 예외 가능**, 단 `/api` 전체는 곤란 → **인증 여부에 따라 경로 분리** 요청(9/16). 우리 결정: 인증 없이 열어야 하는 API는 3종뿐(방문객 익명 설문 `visitor_submit` / 점검 장비 `health_check` / FieldVoice `voc_report` — 각각 익명 설계·API 키로 앱이 검증) → 컨테이너에 **공개 전용 경로 `/pub`** 신설(이 3종만, 그 외 404). **최종 예외 요청 목록(5종)**: `/healthz`, **`/pub`**, `/ThinQ_Real_Visitor_Survey.html`, `/privacy.html`, `/images/` — `/api`를 포함한 나머지는 전부 SSO 뒤. 위험 처리(키 검증·입력 검증·크기 제한)는 앱 코드 책임(BE팀 전제와 일치).
- **⚠ 9/21 발견·조치**: 키트 반입 `public/`이 라이브 사본이라 ST/QA/OP 페이지가 **라이브 Apps Script를 호출**하고 있었음(전환 시점 교체 계획의 부작용). 키트 v4.1로 해소 — 컨테이너가 HTML 서빙 시 `SCRIPT_URL`을 `/api`로 자동 치환(`lib/htmlRewrite.js`), `public/`은 라이브 사본 유지. 함께 `auth_code_peek`(ST/QA 전용 인증 코드 조회 — LENS 불필요). **키트 v4.1 = 0.13.0 배포·QA 실측 통과(9/22: 시크릿 창 소스에서 `SCRIPT_URL = '/api'`, `auth_code_peek` 응답 정상) → QA 준비 완료, UAT 개시 가능.** 소스 보기는 캐시된 옛 페이지를 보여줄 수 있으니 확인은 시크릿 창에서. **9/22 후속(키트 v4.2·v4.3 = 0.14.0·0.15.0)**: 관리자 로그인 "코드 불일치"는 레플리카 문제가 아니라(`kv:shared`) 옛 코드 재사용(응답 캐시 또는 [코드 요청] 재클릭으로 코드 갱신)이었음 — API 응답 `no-store`·HTML `no-cache`·peek에 `pod/kv` 추가로 조치, **담당자 로그인 통과 → UAT 0-3 종결, 협업자 인계 가능.**
- **오픈 목표: 2026년 11월(잠정, 담당자 결정 9/21)** — JIRA 오픈 예정 일정 칸에 기재. 자원 생성(수 주) → SMTP → QA 리허설 → 전환.
- **남은 코드 과제**: **과제 D — 시트→DB 데이터 이행**(전환 직전 1회, 외부 트랙이 키트 제작 예정. OP DB는 수작업 접근이 전용 매체(DB-i/TAAgent)로만 가능하므로 이행은 앱 컨테이너 경유가 기본 설계) + 전환(프론트 `SCRIPT_URL` → `/api`, CSR 등록).
- **BE팀 대기**: 사내 SMTP 스펙(9/18 "차주") / sealed-secrets cert 파일(요청). CSR 반영 완료(9/18 — OP 주소 `thinqreal.lge.com`, 실측 대기). SSO 예외는 게이트웨이 반영 완료(9/17). 확인된 사실: 예외 경로에 게이트웨이 rate limit 없음(앱이 제한), 예외 경로에는 `x-user-id`가 붙지 않음 → **`/pub`에서 x-user-id 절대 신뢰 금지**(3종 모두 사용자 식별 불필요라 무영향).

## 3. OP 전환에 필요한 사내 절차 지도 (왜·순서·상태)

외부 트랙이 코드를 끝냈으므로, **이관의 남은 병목은 전부 사내 절차**다. 사내 Claude가 담당자를 도울 핵심 영역.

| # | 절차 | 왜 필요한가 | 순서·의존 | 상태 (9/20) |
|---|---|---|---|---|
| a+b | **RDS(PostgreSQL) + ElastiCache(valkey) 신청 — DBSUPPORT JIRA 1건** | OP용 DB·캐시. ST/QA 공용 자원은 OP에 못 씀 | 티켓 1건에 RDS·ElastiCache 두 표 작성, DynamoDB 표 삭제(담당자 확인 9/21). Issue Type `DB자원(문의및검토)`, Summary `[이슈타입][thinq20_op]…`(여백 없이), Component=AWS Account, DB Engine=postgres, Description에 표 2개. 기재값은 internal-context §2-a·§2-b + 9/21 검토본(Storage 20GB gp3, Instance `rds-an2-thinq20-thinq-real-prd-postgre`, ElastiCache `valkey-an2-thinq20-thinq-real-prd`·cache.t4g.micro·Shard 1·Node 2, TAG 3종은 추가요청에, SG 이름은 출처 불명이라 삭제). **추가요청의 CIDR(9/22 재검토)**: 4개 대역의 출처는 Vault 가이드의 KIC-OP Allowed Bound CIDR(internal-context §2-c)이지 DB 가이드가 아니므로 **방화벽 요구값이 아니라 "참고(출처 명기)"로 적고 DB팀 표준 규칙 우선**을 명시 — 접속 주체는 "TCN EKS KIC-OP 클러스터의 thinq-real pod"로 말로 적는다. 숫자 정확성은 담당자가 Vault 가이드 원문과 대조 후 제출 | **작성 완료·제출 대기** (9/21, CIDR 표기 방식 9/22 정정) |
| c | **Vault(secret store) 생성** | OP는 sealed-secrets 대신 Vault로 비밀값 주입 (인프라팀 가이드, ArgoCD 섹션은 skip — 기설치) | a·b 제출 후 (쉬움) | 대기 |
| d | **DB 접속 계정 — DBSUPPORT JIRA 별도 신청**(템플릿 명시: `서비스명_MGR`·`서비스명_APP`, 9/21 확인) + Next SPoC(접속 권한·DB-i) | 앱이 쓸 DB 접속 계정. 양식 항목 3종: `Instance(AWS)` · `접속 IP` · `DB-i 적용 여부` (9/17 확인 — 인스턴스 생성 기능 없음, 기존 인스턴스에 접속 권한을 주는 양식) | **a 완료 통보 후** (인스턴스가 생겨야 선택됨 — 그 전엔 검색해도 안 나오는 게 정상). 기재 방향(⚠ DB팀 확인 필요): Instance=완료 통보의 인스턴스명 / 접속 IP=사람 PC가 아니라 **OP 클러스터 대역**(internal-context §2-c KIC-OP CIDR) / DB-i=앱 계정은 미적용 유력(DB-i는 사람의 수작업 접근용). 유지보수·과제 D용 DB-i 적용 계정 추가 여부는 그때 판단 | a 대기 |
| e | **CSR — `thinqreal.lge.com` → ops-gateway** | 운영 도메인이 현재 GitHub Pages IP를 가리킴 → OP로 변경 | CNAME 등록(9/17) → BE팀 반영(9/18) → **담당자 실측 통과(9/20)**: `thinqreal.lge.com` = OP 실제 호스트, `/healthz` postgres · `/` SSO · 시크릿 창 예외 5종 적용(`/pub` → not_found) | ✅ 완료 |
| f | **SSO 예외 경로** | 외부 방문객·장비 경로 개통 | `/api`→`/pub` 분리(9/16) → BE팀 게이트웨이 설정 완료 → **ST 실측 통과(9/17: 예외 5종 로그인 없이 열림, 루트는 SSO 유지)**. 앱 `/pub` 분당 60건/IP 제한(키트 v3.2). **⚠ 신규 발견: `thinqcloud.link`는 사내 전용 DNS(사외 NXDOMAIN)** → SSO 예외만으로는 외부 방문객 QR 경로가 성립하지 않음. `thinqreal.lge.com`의 사외 접속 가능 여부를 BE팀에 문의(§3-i) | SSO 예외 ✅ / 사외 노출 확인 중 |
| g | **OP env 주입** | a~d의 접속정보 + AUTH_SECRET 등 앱 비밀값을 Vault 경유로 컨테이너에 | a~d 완료 후 | — |
| h | **과제 D 이행 + 전환** | 실데이터 이행 → 프론트 API 주소 교체 → 전환일 동결 | g 완료 + 외부 트랙 키트 | — |
| i | **외부 접점 처리 — 하이브리드 에지** (⚠ 외부 접점은 담당자 개인 Google·GitHub 계정 기반 — 팀 공유 사항. `thinqreal.com` 만료 시 QR 주소만 영향: CNAME 삭제 + 포스터 교체, decisions §6-7) | OP도 사내 전용 DNS 확인(9/17). 담당자 판단: `thinqreal.lge.com` 사외 노출은 B2E 취지상 불가 전제 / FieldCheck 장비는 **사외 Wi-Fi**(의도적) / 방문객은 귀가 후에도 설문 작성 → 태블릿 대안 불가 | **설계 확정(설계서 §8-10)**: 외부 접점(방문객 설문 페이지·`visitor_submit`·`health_check`·`voc_report`)은 **현행 공개 인프라(GitHub Pages + Apps Script + 시트)에 그대로 두고, 사내 컨테이너 스케줄러가 주기적으로 pull**해 PG에 병합. 성립 조건 = pod → script.google.com 아웃바운드 → `egress_check`로 실측(키트 v3.3). BE팀 문의: pod 아웃바운드/프록시, 공식 외부 진입점 패턴 유무 | **최종 설계 확정(9/18 BE팀 답변 — decisions §6-8)**: 아웃바운드는 정책상 제한 없음, 외부 진입점은 등급 상승 부담으로 **추진 안 함** → 하이브리드 에지가 최종. 1단계 실증 완료(0.12.0, health 21건). **2단계(`LEGACY_AUTH_SECRET`)는 cert 확보 대기 — 담당자 지시로 일시 중지(9/20)**: kubeseal 0.40.0 설치됨, `--fetch-cert`는 kubectl 부재로 불가, deploy/ 기존 SealedSecret 3종에 컨트롤러 정보 없음 → BE팀에 cert 파일 요청. 재개 시 `--cert <파일>`로 암호화 → 매니페스트 1줄 → `chore:` 커밋 → 파드 재기동 → `edge_sync_now`에서 visitors·voc 확인 |

**절차 공통 판단 기준** ("우리 기준으로 뭘 적나"에 답할 때):
- DBMS는 **PostgreSQL**, 캐시 엔진은 **valkey** — 코드가 그것만 지원. 다른 선택지는 절대 불가.
- **용량·사이즈는 최소 사양이면 충분** — 데이터가 경량(시트 14탭, 수백~수천 행, 이미지·영상은 정적 파일로 이미지에 포함).
- 운영구분은 **PRD(OP)**. ST/QA 자원과 섞지 않는다.
- 주소 등록은 **IP가 아닌 호스트명(ELB 주소)** 이 원칙 — 양식이 IP만 받으면 "확인 필요"로 멈춘다.
- 기재값 원문(계정명·VPC·TAG·CIDR·주소)은 **`internal-context.md`** — 거기 없는 값은 추측하지 말고 담당 부서 문의 경로를 안내한다.

## 4. 과거 결정과 그 이유 (질문이 나올 때 답할 근거)

- **왜 단일 컨테이너 + PostgreSQL인가**: BE팀이 준비한 인프라가 그 형태(Gitea push → 자동 빌드·배포, PostgreSQL·Valkey 제공). 초기 검토안(DynamoDB)은 폐기.
- **왜 인앱 스케줄러인가 (K8s CronJob 대신)**: CronJob은 이미지 태그를 매니페스트에 고정해야 해 릴리스마다 어긋남 → 앱이 스스로 1분 tick으로 실행, 레플리카 중복은 Valkey 일일 락으로 방지. BE팀 "CronJob 등록" 문의는 "필요 없어짐"으로 종결.
- **왜 STORE_BACKEND 자동 감지인가**: `DB_HOST`가 주입돼 있으면 postgres, 없으면 memory — 사내에서는 env를 건드리지 않고 push만으로 전환되게.
- **왜 ST/QA에서 메일·텔레그램을 억제하나**: 검증 중 실사용자에게 발송 사고 방지. OP만 실발송.
- **왜 앱 자체 인증 게이트를 SSO 도입 후에도 유지하나**: SSO는 "임직원임"만 증명 — **관리자 명단 검사는 앱이 해야** 한다. 일반 이메일 게이트는 향후 `x-user-id` 헤더 판별로 교체 가능(헤더 위조 방지 — 게이트웨이가 외부 헤더를 strip하는지 확인 후).
- **왜 프라이빗 GitHub 미러를 쓰지 않나**: 퍼블릭 내용은 프라이빗으로 복사해도 보호 효과 0, 사내 식별자를 개인 클라우드에 두는 건 반출. → 퍼블릭 GitHub = 보호할 게 없는 배달 통로, 사내 식별자 = Gitea 전용 파일.
- **Gitea 이력 재작성 사건(9/7)**: BE팀이 평문 비밀값 제거를 위해 main을 force-push → 사내 클론은 내용 검증 후 `reset --hard`, 로컬 태그 삭제·재취득. 교훈: `git push --tags` 금지.
- **사내 작업 폴더 이전(9/15)**: OneDrive 동기화 폴더의 `.git`이 자리표시자화로 손상 → SMB 경로에 재clone(`safe.directory` 해당 경로만 예외). 로컬은 소모품, 원본은 Gitea — 커밋 즉시 push, 이상 시 재clone.

## 5. 역할 경계 (사내 Claude가 스스로 판단해도 되는 것 / 외부로 넘길 것)

| 스스로 판단·수행 ✅ | 외부 트랙으로 ⛔ |
|---|---|
| 사내 시스템(JIRA·Next SPoC·CSR·Vault·Confluence 가이드) 절차 안내, 신청서 항목 ↔ 기재값 매핑, 신청 사유 문안 | `src/`·`public/`·`Dockerfile`·워크플로우 등 **코드 변경 전부** |
| 사내 환경 장애 진단(git·폴더·네트워크·프록시·권한), 복구 절차 실행 | 컨테이너·데이터·전환 **설계** 판단 |
| 키트(KIT-INSTRUCTIONS.md) 적용·검증표 실행·결과 기록 | 현행 라이브(GitHub Pages + Apps Script) 관련 모든 판단 |
| worklog·문서 정리, 담당자의 용어·개념 질문 | 기재값 문서에 **없는** 사내 값의 결정 (→ "확인 필요" + 문의 경로 안내) |

**협업자(UAT 담당 — 실사용 관리자, 2026-09-21 배정)**: 담당자 외에 이관 트랙을 돕는 팀원. 역할은 **전환 검증(UAT)·운영 준비**로 한정 — `uat-checklist.md`를 QA 환경에서 수행해 판정·차이 보고를 담당자에게 전달, 과제 D 이행 후 건수·샘플 대조, 운영 전환 안내문 작성. 사내 Claude는 협업자에게도 같은 브리핑으로 응대하되 다음을 지킨다: ① 협업자의 질문은 체크리스트·화면 동작 범위에서 답하고, 설계·코드·사내 자원 신청(JIRA·Vault·secret)·BE팀 협의는 담당자 사안으로 안내 ② 비밀값·사내 식별자(internal-context §2)는 협업자 작업에 필요 없으므로 꺼내지 않는다 ③ push 승인·외부 트랙 창구는 담당자 단일. "끝의 정의"는 체크리스트에 적힌 대로 — 열린 과제를 새로 만들지 않는다.

## 6. 외부 트랙 보고 압축 양식 (담당자가 손으로 옮기는 통로 — 3~5줄 엄수)

사내→외부는 캡처·카메라가 막혀 담당자가 **타이핑으로만** 전달한다. 세션 끝에 아래 양식으로 따로 출력해 준다:

```
[YYYY-MM-DD 사내] 한 일: … / 결과: … / 막힘·질문: … / 다음: …
```

숫자·식별자는 결과 판정에 필요한 것만(예: 티켓 번호, healthz 응답). 사내 식별자는 넣지 않는다.

## 7. 외부 문맥 동기화 절차

1. 사내 브라우저·git이 `github.com`에 닿는 것이 확인됨(9/15). 퍼블릭 저장소는 **인증 없이 읽기 전용** clone 가능 — 사내 PC에 어떤 비밀도 남지 않는다.
2. `internal-context.md`가 지정한 **별도 폴더**에 `git clone https://github.com/wonseok0415/thinqreal.git` (1회). Gitea 저장소 폴더와 섞지 않는다.
3. 세션 시작 시 그 폴더에서 `git pull` → `docs/migration/migration-log.md` 마지막 1~2 항목을 읽는다. 외부 트랙의 최신 결정이 거기 있다.
4. 미러 폴더에는 아무것도 쓰지 않는다. 외부 트랙에 전할 것은 §6 양식으로 담당자에게.
5. **코드 반입도 미러 경유가 기본**(2026-09-16 개정 — 메일은 `.js`가 든 zip을 차단): 외부 트랙이 KIT 절차(프롬프트 또는 KIT-INSTRUCTIONS)에서 지정한 파일만 미러에서 Gitea 저장소로 **복사**한다. 경로 규칙은 퍼블릭 `server/src/*` → Gitea `src/*`, `server/public/*` → `public/*`. 복사는 역할 경계 §5의 "키트 적용 ✅"에 해당하며 코드 변경 ⛔가 아니다 — 단 복사 외의 수정은 금지, 담당자 승인 후 `feat:`/`fix:` 커밋. 메일 zip은 사내 식별자가 든 문서(`internal-context.md` 갱신) 전용.

## 8. 이 문서에 없는 것 → `internal-context.md` (사내 전용)

사내 접속 주소 3종·Gitea 주소·ops-gateway 주소 / RDS·ElastiCache JIRA 기재값 / Vault CIDR / 담당자·문의 경로(BE팀·인프라팀·DB팀) / 사내 작업 환경(클라우드 PC·SMB 경로·credential 보관 위치·GitHub 미러 폴더) / 담당자 협업 프로필(숙련도·선호·원칙·모델 기준).

## 9. 규칙 충돌 시 절차 (2026-09-16 신설 — 첫 사례: 브리핑 §7-5 vs 미러 복사 지시)

외부 트랙의 지시가 이 문서·`CLAUDE.md`의 규칙과 충돌하면 **규칙이 이긴다.** 사내 Claude는 다음 순서로 처리한다:
1. **멈추고 보고**: 어떤 규칙(문서명·절 번호)과 어떤 지시가 충돌하는지 담당자에게 옵션과 함께 제시한다. 기본 권장안은 "worklog에 질문만 기록하고 중단".
2. **담당자가 외부 트랙에 전달** → 외부 트랙이 둘 중 하나를 택한다: ⓐ 규칙 개정(GitHub PR) ⓑ 지시 철회.
3. ⓐ이면 **PR 머지 → 사내 미러 `git pull` → 개정 문구 확인 → 지시 재개**. 이것이 표준 경로다. 개정 전 "강행"은 담당자가 명시 승인하고 worklog에 "규칙 개정 PR #N 진행 중, 담당자 승인 하 선행"이라고 남길 때만 허용 — 단순 편의를 위한 강행은 금지.
4. worklog에 충돌 내용·개정 PR 번호·결과를 기록한다. (첫 사례: 9/16 §7-5 개정 PR #114 — 개정 전 강행 승인이 먼저 나갔고, 이후 미러 pull로 개정 확인 후 재개. 이후로는 3의 순서를 지킨다.)

규칙 문서를 고칠 수 있는 주체는 외부 트랙(퍼블릭 브리핑·CLAUDE.md)과 담당자 승인을 받은 사내 Claude(`internal-context.md`의 사내 값)뿐이다.
