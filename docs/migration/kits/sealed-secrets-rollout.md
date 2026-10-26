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
**Vault 가이드 판독 결과(사내 Claude, 10/26 — 2장·4장③ 기준)**:

| 항목 | 결과 | 내용 |
|---|---|---|
| pod 전달 방식 | ✅ 확인 | **ArgoCD Vault Plugin(AVP)**: Secret YAML의 자리표시자 `<키 \| base64encode>`를 sync 시 Vault 값으로 치환해 **일반 Secret 생성** → `envFrom.secretRef`로 env 주입(가이드 4장③ `sample_app.yaml`). 우리 앱(env만 읽음)과 정합 — 코드·deployment 변경 없음 |
| 생성 창구(Vault 경로·Token) | ⏳ 4장① EC2 Case에 있음 | 4장③이 "Token 발급은 EC2 Case와 동일하여 생략" — **Vault Cloud Key CSR Req 신청·Token 발급** 절차는 4장① 판독 필요 |
| CIDR/role 규칙 | ⏳ 다른 장 | 2장(SSH 접근제어)·4장③에는 없음. KIC-OP Allowed Bound CIDR(internal-context §2-c, 9/15 BE팀 안내)의 출처 장을 목차에서 찾아 판독 |
| 기존 SealedSecret 처리 | **외부 트랙 결정(아래)** | 가이드 범위 밖 |

**결정 — `deploy/kic-op/secret.yaml` 처리(외부 트랙, 10/26)**: 파일 이름·kustomization `resources`·deployment `envFrom.secretRef: thinq-real-db-svc`는 **그대로 두고, 파일 내용만** SealedSecret(BE 제공 DB용 6키) → **일반 `Secret` + AVP 자리표시자 10키**로 교체한다. Secret 이름이 같으므로 매니페스트 다른 곳은 무변경. BE 제공 OP DB는 Aurora 전환과 함께 사용 종료. 형식(가이드 4장③ 예시에 맞춰 사내 Claude가 작성 — `avp.kubernetes.io/path` 주석의 경로 값은 Cloud Key 발급 결과):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: thinq-real-db-svc
  namespace: ns-extapps
  annotations:
    avp.kubernetes.io/path: "<Vault 경로 — 가이드·발급 결과>"
type: Opaque
data:
  DB_HOST: <DB_HOST | base64encode>
  DB_PORT: <DB_PORT | base64encode>
  DB_NAME: <DB_NAME | base64encode>
  DB_USER: <DB_USER | base64encode>
  DB_PASSWORD: <DB_PASSWORD | base64encode>
  AUTH_SECRET: <AUTH_SECRET | base64encode>
  LEGACY_AUTH_SECRET: <LEGACY_AUTH_SECRET | base64encode>
  TEAMS_WEBHOOK_URL: <TEAMS_WEBHOOK_URL | base64encode>
  TELEGRAM_BOT_TOKEN: <TELEGRAM_BOT_TOKEN | base64encode>
  TELEGRAM_CHAT_ID: <TELEGRAM_CHAT_ID | base64encode>
```
Vault 쪽 키 이름은 env 이름과 **동일하게** 등록(치환 실수 방지). 값 등록은 담당자가 Vault UI/CLI에서 55-credentials를 보고 직접.

**BE팀 확인 2건(박현정 책임)**: ① OP ArgoCD Application에 AVP가 이미 적용돼 있는지(configmap 방식/sidecar 방식 중 무엇, 우리가 Application 쪽을 건드릴 필요가 있는지 — 9월 안내 "ArgoCD 섹션 skip, plugin 기설치"의 범위 확인) ② AVP가 Vault를 읽을 때 쓰는 인증(Token/Cloud Key)이 Application 공용인지, 서비스별로 우리가 발급해 등록해야 하는지.

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
