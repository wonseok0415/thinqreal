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

## 4. OP 주입 — Vault (⑤ 완료 후, 세부는 Vault 가이드 판독 후 확정)
**BE팀 확인(10/26)**: OP는 kubeseal이 아니라 **인프라팀 제공 Vault(secret store)**로 주입(브리핑 §3-c, decisions §6-1 ⑥). 현재 OP의 `deploy/kic-op/secret.yaml`(SealedSecret, BE 제공 DB용 6키)은 Vault 전환 시 대체된다.

**넣을 값(55-credentials에서, 10키)** — 방식과 무관하게 동일:
```
DB_HOST=<op-db-app 대상: Cluster Writer 엔드포인트>
DB_PORT=<op-db-app 포트 — 5432 아님>
DB_NAME=<DB명>
DB_USER=<op-db-app 계정 — ⑤ 0번 쿼리로 확인한 대소문자 그대로>
DB_PASSWORD=<op-db-app 값 — 전환 전 Next SPoC 암호 초기화 후의 값>
AUTH_SECRET=<op-auth-secret 값 — 없으면 생성: Git Bash에서 openssl rand -hex 32, 블록에 먼저 기록>
LEGACY_AUTH_SECRET=<legacy-auth-secret 값>
TEAMS_WEBHOOK_URL=<teams-webhook 값>
TELEGRAM_BOT_TOKEN=<telegram-bot 값>
TELEGRAM_CHAT_ID=<telegram-bot 계정/채팅 ID>
```
**Vault 가이드(`tcn.guide.k8s.secret-with-vault`)에서 확정할 것** — 사내 Claude가 판독해 보고:
1. secret store 생성 창구(포털/JIRA/인프라팀 요청)·승인 주체·리드타임.
2. pod에 전달되는 **방식**: (a) ArgoCD vault plugin이 매니페스트의 자리표시자를 sync 시 치환해 일반 Secret 생성 (b) Vault Agent sidecar가 파일로 마운트 (c) External Secrets 등. 앱은 **env만** 읽으므로 (a) 또는 "Secret 리소스 생성" 방식이어야 하고, deployment의 `envFrom.secretRef` 이름을 그 Secret에 맞춘다. (b)면 매니페스트 키트(파일→env 변환)가 추가로 필요 — 외부 트랙에 보고.
3. Allowed Bound CIDR(KIC-OP, internal-context §2-c)·역할(role)·path 네이밍 규칙.
4. `deploy/kic-op/secret.yaml`을 어떻게 바꾸는지(삭제·치환) — kustomization `resources` 조정 포함.

**configmap(Vault와 무관, 같은 커밋)**: `deploy/kic-op/configmap.yaml`에 `DB_SSLMODE=require` `DB_SCHEMA=<스키마명, internal-context §2-a>` `KVSTORE_ADDR=<clustercfg 엔드포인트>:6379` `KVSTORE_TLS=true` `KVSTORE_PREFIX=thinq-real` `ADMIN_PAGE_URL=https://thinqreal.lge.com/thinqreal_admin.html` + `config-rev` +1.

검증(cutover-plan §5 D-1 체크와 동일):

| 확인 | 주소 | 정상 |
|---|---|---|
| 기동 | `<OP>/healthz` | `backend:"postgres"` `schema:"verified"` `kv:"shared"` `authSecret:"env"` `pod` 교체 |
| env | `<OP>/api?type=env_keys&token=` | 위 10키 + configmap 6키 |
| Teams | `<OP>/api?type=teams_test` | `ok:true` + 팀 채널 카드 |
| 텔레그램 | `<OP>/api?type=telegram_test` | `ok:true`(차단이면 `exception` → Teams 단독, `TELEGRAM_*` 제거) |

`schema`가 `"verified"`가 아니고 pod가 CrashLoop이면 ⑤ 누락 표 목록이 로그에 있음(LENS) — 그 목록 보고. 이 시점부터 OP는 Aurora 데이터(빈 표)이며, 실데이터는 D-day 패널 적재(cutover §2).

## 5. 하지 않는 것
- `deploy/kic-qa/secret.yaml`은 건드리지 않는다(QA는 BE 제공 DB 그대로, 리허설 완료). **OP에 kubeseal을 쓰지 않는다**(BE팀 정책).
- SealedSecret 이름 변경·`envFrom` 추가·`optional:` 도입 금지(병합 방식으로 충분).
- cert 파일(`*-cert.pem`)은 공개키라 비밀은 아니지만 Gitea·GitHub에 커밋하지 않는다(55-credentials 옆 보관).
