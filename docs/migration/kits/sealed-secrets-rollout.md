# 매니페스트 키트 M2 — 비밀값 주입 절차 (ST·QA = SealedSecret / OP = Vault)

> 외부 트랙 지정(2026-10-26). 담당자 PC에서 `kubeseal`·`kubectl`로 봉인하고, 사내 Claude는 **명령 조립·파일 위치·커밋**만 돕는다. **비밀값은 55-credentials `thinqreal-credentials.txt`에서 담당자가 직접 꺼내며, 사내 Claude 채팅·프롬프트·커밋 메시지에 평문을 넣지 않는다.** BE팀 가이드(kubeseal·kubectl)의 명령·이름이 이 문서와 다르면 **가이드가 우선**이고, 차이는 "확인 필요"로 외부 트랙에 보고.
> **10/26 정정(BE팀 박현정 책임 확인)**: kubeseal(SealedSecret)은 **ST·QA 전용**이고 **OP는 Vault**로 주입한다(decisions §6-1 ⑥ 그대로). 따라서 §2·§3은 ST 리허설용, §4는 Vault 절차로 교체(세부는 Vault 가이드 판독 후 확정).

## 0. 가이드 확인 결과 (사내 Claude 판독, 10/26)
- cert 방식 **(a) 환경별 cert 파일 다운로드**(콜랩 sealed-secrets 사용자 가이드 Appendix A) — `--fetch-cert` 아님 → **kubeconfig·컨트롤러 이름 불필요**. kubectl은 `--dry-run=client` 평문 초안 생성에만 쓰인다(클러스터 접속 없음).
- 가이드 예시(`-f`/`-w`)는 새 파일을 통째로 쓰는 방식 — 기존 멀티키 `secret.yaml`에 쓰면 다른 키가 유실되므로 **`--merge-into`로 대체**(cert 방식 동일, kubeseal 표준 옵션).
- 적용 범위: **ST·QA만**. OP는 §4.

## 1. 원칙
- 저장소의 SealedSecret 이름·네임스페이스는 **`thinq-real-db-svc` / `ns-extapps`** (deployment `envFrom.secretRef`). 새 Secret을 만들지 않고 **기존 파일에 키를 병합**한다(`kubeseal --merge-into`) — 다른 키의 평문을 몰라도 된다.
- `--merge-into` 대상 = `deploy/<env>/secret.yaml`. 같은 키가 있으면 덮어쓰고, 없으면 추가한다.
- 평문 파일(`*.env`·`plain.yaml`)은 **봉인 직후 삭제**. 커밋 전 `git status`에 평문 파일이 없어야 한다.
- SealedSecret이 바뀌어도 pod는 자동 재시작되지 않는다 → 같은 커밋에 `deploy/base/deployment.yaml` pod template annotation `thinqreal/config-rev` +1.
- **OP의 DB 키 교체(Vault)는 ⑤(MGR DDL 실행, 14표 확인) 이후에만** — APP 계정은 DDL 권한이 없어 표가 없으면 기동 실패(형상 검증 모드).

## 2. 공통 명령 (Windows cmd — 가이드 경로·이름으로 치환)
도구는 `D:\workspace\50-resources\58-tools`(kubeseal 0.40.0·kubectl 1.31.0, 10/26 확인). cmd 창마다 먼저 `set PATH=%PATH%;D:\workspace\50-resources\58-tools`.
```
:: (0) cmd 창(PowerShell 아님 — PowerShell의 > 는 UTF-16으로 써서 kubeseal이 "no secrets found … UTF-8"로 실패)
set PATH=%PATH%;D:\workspace\50-resources\58-tools
cd /d D:\workspace\50-resources\58-tools

:: (1) 이 환경의 cert 파일 — 가이드 Appendix A에서 환경별 다운로드(실제 파일명 예: kic-st-pub-cert.pem), 58-tools에 저장. kubeconfig 불필요

:: (2) 평문 env 파일 — notepad secrets.env → 한 줄 KEY=VALUE(따옴표·공백 없이, 값은 55-credentials) → 「다른 이름으로 저장」 파일 형식 "모든 파일"·인코딩 ANSI(또는 UTF-8) → dir secrets.env 로 존재 확인
::     LEGACY_AUTH_SECRET=...

:: (3)+(4) 평문 초안을 파일 없이 파이프로 바로 병합 (54번 폴더 = Gitea 저장소, 먼저 git pull --rebase origin main)
kubectl create secret generic thinq-real-db-svc -n ns-extapps --from-env-file=secrets.env --dry-run=client -o yaml | kubeseal --cert kic-<환경>-pub-cert.pem --format yaml --merge-into D:\workspace\50-resources\54-thinq-real\deploy\kic-<환경>\secret.yaml

:: (5) 병합 확인 — 반드시 삭제 전에
findstr /c:"LEGACY_AUTH_SECRET" D:\workspace\50-resources\54-thinq-real\deploy\kic-<환경>\secret.yaml

:: (6) 평문 삭제 (findstr에 키가 보인 뒤)
del secrets.env
```
`<환경>`은 `st`·`qa`. 아무 출력 없음 = 성공이지만 **입력 파일이 없어도 조용히 지나가므로 (5)로 꼭 확인**(10/26 실사례: `secrets.env` 부재 상태에서 무출력 → secret.yaml 무변경). `git status --short`에 ` M deploy/kic-<환경>/secret.yaml` 한 줄만 보여야 한다.

## 3. ST 리허설 — ✅ 2026-10-26 통과
목적: 봉인 절차 검증 + 하이브리드 에지 2단계(`LEGACY_AUTH_SECRET`, 9/20 중지분) 재개.
1. §2 (0)~(6)을 `st`로, `secrets.env`는 `LEGACY_AUTH_SECRET=<55-credentials legacy-auth-secret 값>` 1줄.
2. 사내 Claude: `deploy/base/deployment.yaml` `thinqreal/config-rev` +1(없으면 `"1"` 신설) → 커밋 `chore: ST LEGACY_AUTH_SECRET 봉인 + config-rev` → `git pull --rebase origin main && git push origin main`.
3. 검증(담당자, 몇 분 뒤):

| 확인 | 주소 | 정상 |
|---|---|---|
| 키 도달 | `<ST>/api?type=env_keys` | `names`에 `LEGACY_AUTH_SECRET` |
| pod 교체 | `<ST>/healthz` | `pod` 이름 바뀜 |
| 2단계 동작 | `<ST>/api?type=edge_sync_now` | `visitors`·`voc` 건수가 0이 아님(현행 visitor_responses 105건 기준) |

실패 시: `env_keys`에 없으면 컨트롤러가 복호화하지 못한 것(cert가 다른 클러스터 것이거나 name/namespace 불일치 — `kubectl get sealedsecret -n ns-extapps thinq-real-db-svc -o yaml`의 status 인용) / 있는데 `edge_sync_now`가 `bad_signature`면 값 오타(따옴표·공백).

**결과(10/26)**: `env_keys`에 `LEGACY_AUTH_SECRET`, pod 교체, `edge_sync_now` → `visitors fetched 105 / added 105`, `voc 0/0`(현행에 VOC 없음 — 정상), `errors: []`. 하이브리드 에지 2단계(9/20 중지분) 종결.

## 4. OP 주입 — Vault (⑤ 완료 후 매니페스트 교체, CSR·값 등록은 지금)
**절차표 단일 소스: `docs/migration/vault-avp-procedure.md`**(사내 Claude, 가이드 v1.44 전문 근거, 10/27). 아래는 그 위에 얹는 **외부 트랙 결정**과 요약.

**⚠ 10/27 사실 정정**: 10/27 승인된 Catoz CSR은 `DB_CREDENTIAL`(가이드 5장 — `database/` 엔진 Role ddl/dml/exe/read, **사람이 OP Aurora에 접속하는 TTL 1일 임시 계정**)이지 앱 env용 KV 경로가 아니다. 앱 env 10키용 KV 경로는 **아직 미신청** — 「Vault Cloud Key CSR Req」(`key_kvstore`)를 새로 신청해야 한다.

**결정(외부 트랙, 10/27)**
| # | 항목 | 결정 |
|---|---|---|
| 1 | CSR Type | **`key_kvstore`**(가이드 p.28: "API·App Key를 K/V Store로 사용" — 우리 10키가 정확히 이 용도). `key_service`는 AWS 키 전용이라 해당 없음 |
| 2 | Depth1 | **`thinq-real`** 사용 → **실제 발급 경로(10/29): `kv_api/data/tcn/thinq-real/csr-N`**(`tcn/` 접두는 Catoz가 부여, `/data/`는 kv v2 API 세그먼트 — AVP 주석에도 그대로 포함. CSR 번호는 internal-context §2-e) |
| 3 | `kv-version` 주석 | **✅ 10/29 실측 kv v2** → `kv-version: "1"` 조건 **폐기**. 주석 생략(AVP 기본 v2) 또는 `"2"` 명시. 절차표 §4 완성본의 `kv-version: "1"` 줄은 삭제하고 path에 `/data/` 포함 |
| 4 | Allowed Bound CIDR | 절차표 0a대로 **CSR 전에** BE팀에 ArgoCD repo-server egress 대역 + 인프라팀에 값 입력 PC/HUB 처리 방식을 확인 → KIC-OP 대역(§2-c)에 그 답을 더해 기재. 틀리면 Token으로 값 입력 자체가 막히므로 선확인 필수 |
| 5 | Token 전달 | 서비스별 Token이면 BE팀 등록용 — **평문 Teams·메일 금지**, 전달 채널은 BE팀과 합의(사내 암호화 파일 공유 등). 공용이면 전달 불요 |
| 6 | `deploy/kic-op/secret.yaml` | 절차표 §4 완성본 채택(이름·kustomization·deployment 무변경, `sealedsecrets.bitnami.com/managed` 주석 제거). 적용 시점은 **⑤ 14표 확인 후**, 같은 커밋에 configmap 6키 + `config-rev` +1 |
| 7 | 값 등록 방식 | **Vault UI 우선**(CLI는 쉘 히스토리에 값이 남음). Token 정책 밖 403 배너는 정상 거부 — 경로로 직접 진입 |
| 8 | ⑤ DDL 실행 경로 | **✅ 10/29 완료 — (A) MGR + SEAgent/DB-i + DBeaver, `SET ROLE <스키마 소유 역할>` 선행 → 14표·오류 0·소유자=스키마 소유 역할·APP DML 확인.** (B) Vault `-ddl` 임시 계정은 DB팀 지침(SET ROLE 불가·운영 DDL 비권고)으로 **폐기**. 실측: APP 계정명 **`THINQREAL_APP`(대문자)**, 스키마 `thinqreal` → Vault `DB_USER` 값이 대문자인지 확인 필수 |

**순서(현재 기준)**: ⓐ BE팀 확인 a·b·c·g·h(절차표 §6, 문안은 migration-log 10/27) → ⓑ Catoz 「Vault Cloud Key CSR Req」 신청(`key_kvstore`·Depth1 `thinq-real`·CIDR) → ⓒ ✅(10/29) 승인 Token·CSR 번호 → 55-credentials `vault-kv-token` + internal-context §2-e → ⓓ ✅(10/29) Vault UI(LDAP)에서 10키 등록, kv v2 실측(`DB_PASSWORD`는 기존 값 — 암호 초기화 생략 결정 10/28; 등록값 정확성은 ⓗ `env_keys`·`/healthz`로 사후 검증) → ⓔ BE팀 Token 등록(서비스별인 경우) → ⓕ ✅(10/29) ⑤ 14표 확인 → ⓖ ✅(10/30) `secret.yaml`+configmap+config-rev 커밋(+ 옛 SealedSecret prune·Secret 재생성 — `prune:false` 환경에서 잔류 SealedSecret 키가 configmap을 덮는 문제 실측, 절차표 7단계에 반영) → ⓗ 검증: `/healthz` `authSecret:"env"`·`schema:"verified"`·`backend:"postgres"` ✅ · `teams_test`·`telegram_test` ✅ · **`kv:degraded` ✗(valkey SG → ③ JIRA)** · `env_keys`·관리자 로그인은 kv 복구 후(인증 코드 검증이 valkey 타임아웃에 걸려 토큰 발급 불가).

**넣을 값(10키, 55-credentials)**: `DB_HOST`(Cluster Writer) `DB_PORT`(비표준) `DB_NAME` `DB_USER`(0번 쿼리 대소문자) `DB_PASSWORD`(초기화 후) `AUTH_SECRET`(신규) `LEGACY_AUTH_SECRET` `TEAMS_WEBHOOK_URL` `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID`. Vault 키 이름 = env 이름 동일 철자.

## 5. 하지 않는 것
- `deploy/kic-qa/secret.yaml`은 건드리지 않는다(QA는 BE 제공 DB 그대로, 리허설 완료). **OP에 kubeseal을 쓰지 않는다**(BE팀 정책).
- Vault `DB_CREDENTIAL`(사람용 임시 DB 계정)을 앱 env에 쓰지 않는다 — TTL 1일이라 pod가 하루 뒤 접속 불가. 앱은 Next SPoC 발급 `THINQREAL_APP` 고정 계정만.
- SealedSecret 이름 변경·`envFrom` 추가·`optional:` 도입 금지(병합 방식으로 충분).
- cert 파일(`*-cert.pem`)은 공개키라 비밀은 아니지만 Gitea·GitHub에 커밋하지 않는다(55-credentials 옆 보관).
