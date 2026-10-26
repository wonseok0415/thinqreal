# 매니페스트 키트 M2 — SealedSecret 주입 절차 (ST 리허설 → OP 전환)

> 외부 트랙 지정(2026-10-26). 담당자 PC에서 `kubeseal`·`kubectl`로 봉인하고, 사내 Claude는 **명령 조립·파일 위치·커밋**만 돕는다. **비밀값은 55-credentials `thinqreal-credentials.txt`에서 담당자가 직접 꺼내며, 사내 Claude 채팅·프롬프트·커밋 메시지에 평문을 넣지 않는다.** BE팀 가이드(kubeseal·kubectl)의 명령·이름이 이 문서와 다르면 **가이드가 우선**이고, 차이는 "확인 필요"로 외부 트랙에 보고.

## 0. 먼저 확인할 것 (가이드에서 읽어 보고하는 3가지)
| # | 질문 | 왜 |
|---|---|---|
| a | kubeconfig는 어떻게 받나 — 환경(ST/QA/OP)별 context 이름 | `kubectl`·`kubeseal --fetch-cert`가 어느 클러스터를 보는지 결정. 클러스터가 환경별로 다르면 cert도 환경별로 다르다 |
| b | sealed-secrets 컨트롤러의 **namespace·이름** (`--controller-namespace`·`--controller-name` 값) | `--fetch-cert`에 필요. 가이드에 없으면 기본값(`kube-system` / `sealed-secrets-controller`)으로 시도 후 보고 |
| c | 가이드가 cert **파일을 제공**하는지, `--fetch-cert`로 받으라는지 | 둘 다 결과는 `cert.pem` 하나 |

보고 양식(3줄): `a: <context 이름들> / b: <ns>/<name> / c: 파일|fetch`.

## 1. 원칙
- 저장소의 SealedSecret 이름·네임스페이스는 **`thinq-real-db-svc` / `ns-extapps`** (deployment `envFrom.secretRef`). 새 Secret을 만들지 않고 **기존 파일에 키를 병합**한다(`kubeseal --merge-into`) — 다른 키의 평문을 몰라도 된다.
- `--merge-into` 대상 = `deploy/<env>/secret.yaml`. 같은 키가 있으면 덮어쓰고, 없으면 추가한다.
- 평문 파일(`*.env`·`plain.yaml`)은 **봉인 직후 삭제**. 커밋 전 `git status`에 평문 파일이 없어야 한다.
- SealedSecret이 바뀌어도 pod는 자동 재시작되지 않는다 → 같은 커밋에 `deploy/base/deployment.yaml` pod template annotation `thinqreal/config-rev` +1.
- **OP의 DB 키 교체는 ⑤(MGR DDL 실행, 14표 확인) 이후에만** — APP 계정은 DDL 권한이 없어 표가 없으면 기동 실패(형상 검증 모드).

## 2. 공통 명령 (Windows cmd — 가이드 경로·이름으로 치환)
```
:: (1) 이 환경의 cert 받기 — 환경마다 1회
kubectl config use-context <환경 context>
kubeseal --fetch-cert --controller-namespace <b의 ns> --controller-name <b의 name> > <환경>-cert.pem

:: (2) 평문 env 파일 — 메모장으로 작성, KEY=VALUE 한 줄씩, 따옴표·공백 없이 (값은 55-credentials에서)
::     예: secrets.env
::       LEGACY_AUTH_SECRET=...

:: (3) 평문 Secret 초안(클러스터에 안 올라감: --dry-run=client)
kubectl create secret generic thinq-real-db-svc -n ns-extapps --from-env-file=secrets.env --dry-run=client -o yaml > plain.yaml

:: (4) 기존 SealedSecret 파일에 병합 (54번 폴더 = Gitea 저장소)
kubeseal --cert <환경>-cert.pem --format yaml --merge-into D:\workspace\50-resources\54-thinq-real\deploy\<환경>\secret.yaml < plain.yaml

:: (5) 평문 삭제
del secrets.env plain.yaml
```
`<환경>`은 `kic-st`·`kic-qa`·`kic-op`. (4) 뒤 `secret.yaml`을 열면 `spec.encryptedData`에 키가 늘어 있고 값은 `Ag…` 암호문이어야 한다.

## 3. ST 리허설 (⑤ 무관 — 지금 가능)
목적: 봉인 절차 검증 + 하이브리드 에지 2단계(`LEGACY_AUTH_SECRET`, 9/20 중지분) 재개.
1. §2 (1)~(5)를 `kic-st`로, `secrets.env`는 `LEGACY_AUTH_SECRET=<55-credentials legacy-auth-secret 값>` 1줄.
2. 사내 Claude: `deploy/base/deployment.yaml` `thinqreal/config-rev` +1(없으면 `"1"` 신설) → 커밋 `chore: ST LEGACY_AUTH_SECRET 봉인 + config-rev` → `git pull --rebase origin main && git push origin main`.
3. 검증(담당자, 몇 분 뒤):

| 확인 | 주소 | 정상 |
|---|---|---|
| 키 도달 | `<ST>/api?type=env_keys` | `names`에 `LEGACY_AUTH_SECRET` |
| pod 교체 | `<ST>/healthz` | `pod` 이름 바뀜 |
| 2단계 동작 | `<ST>/api?type=edge_sync_now` | `visitors`·`voc` 건수가 0이 아님(현행 visitor_responses 105건 기준) |

실패 시: `env_keys`에 없으면 컨트롤러가 복호화하지 못한 것(cert가 다른 클러스터 것이거나 name/namespace 불일치 — `kubectl get sealedsecret -n ns-extapps thinq-real-db-svc -o yaml`의 status 인용) / 있는데 `edge_sync_now`가 `bad_signature`면 값 오타(따옴표·공백).

## 4. OP 주입 (⑤ 완료 후)
`secrets.env`(55-credentials에서):
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
같은 커밋에 사내 Claude가 `deploy/kic-op/configmap.yaml`에 추가: `DB_SSLMODE=require` `DB_SCHEMA=<스키마명, internal-context §2-a>` `KVSTORE_ADDR=<clustercfg 엔드포인트>:6379` `KVSTORE_TLS=true` `KVSTORE_PREFIX=thinq-real` `ADMIN_PAGE_URL=https://thinqreal.lge.com/thinqreal_admin.html` + `config-rev` +1. 커밋 `chore: OP Aurora·valkey·알림 secret/configmap 주입`.

검증(cutover-plan §5 D-1 체크와 동일):

| 확인 | 주소 | 정상 |
|---|---|---|
| 기동 | `<OP>/healthz` | `backend:"postgres"` `schema:"verified"` `kv:"shared"` `authSecret:"env"` `pod` 교체 |
| env | `<OP>/api?type=env_keys&token=` | 위 10키 + configmap 6키 |
| Teams | `<OP>/api?type=teams_test` | `ok:true` + 팀 채널 카드 |
| 텔레그램 | `<OP>/api?type=telegram_test` | `ok:true`(차단이면 `exception` → Teams 단독, `TELEGRAM_*` 제거) |

`schema`가 `"verified"`가 아니고 pod가 CrashLoop이면 ⑤ 누락 표 목록이 로그에 있음(LENS) — 그 목록 보고. 이 시점부터 OP는 Aurora 데이터(빈 표)이며, 실데이터는 D-day 패널 적재(cutover §2).

## 5. 하지 않는 것
- `deploy/kic-qa/secret.yaml`은 건드리지 않는다(QA는 BE 제공 DB 그대로, 리허설 완료).
- SealedSecret 이름 변경·`envFrom` 추가·`optional:` 도입 금지(병합 방식으로 충분).
- cert 파일(`*-cert.pem`)은 공개키라 비밀은 아니지만 Gitea·GitHub에 커밋하지 않는다(55-credentials 옆 보관).
