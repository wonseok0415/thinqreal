# OP 비밀값 주입 절차 — Catoz 승인 이후 → pod가 Vault 값을 env로 받기까지

> **외부 트랙 반입본(2026-10-27)**: 사내 Claude가 Vault 사용 가이드 전문·Gitea 저장소를 근거로 작성한 마스킹판을 그대로 반입. **원본·갱신 주체는 사내 Gitea `docs/migration/`**(사내 전용 값은 internal-context §2-c). 외부 트랙 결정은 `kits/sealed-secrets-rollout.md` §4에 표시 — 이 파일은 참고 절차표.

> **외부 트랙 공유용(사내 식별자 마스킹판)** — 사내 Claude 작성 2026-10-27, v1.1(동일일 수정). 근거: 사내 「Vault 사용 가이드 v1.44」(79쪽, 페이지 번호는 그 문서 기준)와 Gitea 저장소 `deploy/`·`README.md`. **실행하지 않은 설계 절차표**이며, 값·주소·계정·CSR 번호·CIDR은 `<…>`/`NNNNN`으로 마스킹했다(원값은 사내 `internal-context.md` §2-c). 키트 M2(`kits/sealed-secrets-rollout.md`) §4와 다른 점은 §4에 표시.
>
> 적용 대상: TCN EKS KIC-OP, `ns-extapps`, ArgoCD로 배포되는 `thinq-real`, env 10키를 `envFrom.secretRef: thinq-real-db-svc`로 주입.

## 0. 전제와 역할 구분

- **KV 경로는 아직 미발급.** 2026-10-27 승인된 Catoz CSR은 `DB_CREDENTIAL`(가이드 5장 「DB 개인계정 사용법」) — `database/` 엔진 Role 4개(ddl/dml/exe/read)로 **사람이 OP Aurora에 접속**하는 경로(TTL 1일 임시 계정, 실측). **앱 env용이 아니다.**
- 앱 env 10키는 가이드 4장①의 **「Vault Cloud Key CSR Req」 → `key_kvstore`**로 KV 경로를 받아 등록하고, 4장③ ArgoCD Vault Plugin(AVP)으로 주입한다.
- 역할: **우리(서비스 담당자)** = CSR 신청·값 등록·저장소 매니페스트·검증 / **ArgoCD·플랫폼(BE팀)** = Token 등록·Application 설정·Sync / **인프라팀(Vault)** = CSR Type·CIDR 권고·승인.

## 1. CSR Type — 가이드 정의와 선택

p.28 원문: *"1) Service 용도로 서버에서 사용 할 것이면 **key_service**로 선택 / 2) Service 용도이지만 Cloud Key가 아닌 API, App Key 들을 K/V Store로 사용하고자 하면 **key_kvstore**로 선택"*. p.32: *"API Key or App Key .. 기타 Credential 들을 직접 KV Store에 Update 하여 Vault로 관리"*.

| Type | 엔진·경로 | kv 버전(가이드 표기) | 용도 |
|---|---|---|---|
| `key_service` | `kv_aws/data/csr-NNNNN` | v2 | 서버가 **AWS Secret/Access Key**를 직접 쓸 때(Catoz가 AWS 키를 생성해 넣어줌) |
| `key_kvstore` | `kv_api/[depth1/[depth2/]]csr-NNNNN` | p.43·54는 v1(+`kv-version: "1"` 주석), p.31 REST 예시는 v2 형식 — **불일치, 승인 후 실측** | **우리가 임의 Key/Value를 직접 등록** → 우리 10키 |
| `key_user` | `aws_user/static-creds/csr-NNNNN` | — | 개인용 AWS 키, 60일 만료, *"서비스 용도로 사용하지 말아주세요"*(p.65) — 해당 없음 |

→ 가이드 근거로 **`key_kvstore` 권고**. 최종 확정은 키트 M2 §4 원칙대로 외부 트랙·인프라팀.

## 2. 절차표

| # | 단계 | 어디서(화면/파일) | 무엇을 | 누가 | p. |
|---|---|---|---|---|---|
| 0a | **사전 확인(CSR 전)** | BE팀·인프라팀 문의 | §6의 **b**(AVP Token 공용/서비스별·`VAULT_NAMESPACE`)와 **c**(Allowed Bound CIDR 범위) 답을 먼저 받는다 — b에 따라 Token 전달이 불필요할 수 있고, c가 틀리면 승인 Token으로 값 입력(3단계) 자체가 막힌다 | 우리 | 28, 33 |
| 0b | CSR 신청 | Catoz → CSR Mgt → **Vault Cloud Key CSR Req** | Account `<Catoz Account>`, Vault CSR Type **`key_kvstore`**, Depth1 `thinq-real`(선택 — 기입 시 경로 `kv_api/thinq-real/csr-NNNNN`, 미기입 시 `kv_api/csr-NNNNN`; 외부 트랙 결정), Allowed Bound CIDR = **AVP가 도는 ArgoCD repo-server egress + 값을 입력할 우리 PC(또는 HUB) IP**(p.33: *"User가 Token을 이용하여 Key Update 시 해당 HUB 또는 특정 서버 IP"*), Etc Request 용도 "앱 env 비밀값 10키, ArgoCD Vault Plugin으로 읽음" | 우리 | 28, 30 |
| 1 | 승인 수령 | Catoz 메일 | **Token + CSR 번호**. *"Key를 제공하는 것이 아니라 Key를 읽을 수 있는 Token을 Catoz Email 통해서 제공함"* → Token은 55-credentials 블록으로 보관(`주입: -`, 용도 "Vault KV 쓰기/AVP 읽기") | 우리 | 28 |
| 2 | Vault 접속 | (A) Vault CLI — 권장 / (B) Vault UI | **(A)** Windows용 `vault.exe` 1개를 `58-tools`에 두고 `VAULT_ADDR=<사내 Vault 주소>` 설정(p.63·71 설치 화면) → `vault login <Token>`. **(B)** UI 로그인 화면에서 Namespace `<Catoz Account>`, **Method: Token**. UI는 Token 정책 밖 조회(`resultant-acl`·목록)가 403으로 떨어져 "Resultant ACL check failed" 배너·"A problem has occurred"가 뜰 수 있다 — **정상 거부**(세션 20 실측). 목록이 안 보이면 주소로 직접 진입. **허용 CIDR 안의 PC에서만** 동작 | 우리 | 28, 32, 63, 68 |
| 3 | secret 생성·10키 등록 | (A) `vault kv put -namespace=<Catoz Account> kv_api/[thinq-real/]csr-NNNNN DB_HOST=<…> DB_PORT=<…> DB_NAME=<…> DB_USER=<…> DB_PASSWORD=<…> AUTH_SECRET=<…> LEGACY_AUTH_SECRET=<…> TEAMS_WEBHOOK_URL=<…> TELEGRAM_BOT_TOKEN=<…> TELEGRAM_CHAT_ID=<…>` / (B) UI: Secrets engines → `kv_api/` → (`thinq-real/`) → **Create secret** → Path `csr-NNNNN`(정확히) → Key/Value 10행 | 키 이름은 **env 이름과 동일 철자**. 값은 55-credentials에서 담당자가 직접(`op-db-app`·`op-auth-secret`(사전 생성: `openssl rand -hex 32`)·`legacy-auth-secret`·`teams-webhook`·`telegram-bot`). CLI는 쉘 히스토리에 값이 남으므로 입력 후 히스토리 삭제, 또는 UI 사용. 수정은 `vault kv patch` | 우리 | 30–32, 58–59 |
| 4 | kv 버전 확정 | UI Secrets engines **Version 컬럼** / secret 화면 Version·History 유무 / `vault kv metadata get` 성공 여부(v2만 있음) | v2면 7단계 `kv-version` 주석 삭제, v1이면 유지 | 우리 | 43, 47 |
| 5 | **Token 등록** | **`argocd` 네임스페이스 Secret** `argocd-vault-plugin-credentials[-x]`(`VAULT_ADDR`·`VAULT_TOKEN`·`VAULT_NAMESPACE`·`AVP_TYPE: vault`·`AVP_AUTH_TYPE: token`) → `argocd-repo-server`(configmap 방식) 또는 sidecar 컨테이너 `avp-<x>`가 `envFrom.secretRef`로 참조 | *"argocd-vault-plugin-credentials.yaml 설치 (kubectl apply -n argocd …)"*, *"argocd-repo-server 설정 편집 (kubectl edit deployment …)"* — **ArgoCD 관리자 작업**. 서비스별 Token이면 우리가 **보안 채널로 BE팀에 전달**(평문 메일·Teams 금지); extapps 공용 Token이면 전달 불요(§6-b) | ArgoCD·플랫폼(BE팀) | 40–41, 48, 51 |
| 6 | Application 설정 | **저장소 밖** — 중앙 `argocd-apps` 저장소의 ApplicationSet(README: *"별도 Git repository에서 클러스터 관리자가 관리"*) | Plugin 지정(`argocd-vault-plugin` configmap 방식 또는 `avp-<x>` sidecar 방식), ENV `VAULT_NAMESPACE=<Catoz Account>`(*"credentials Secret 생성시 Namespace 명시 안했을 경우"*). BE팀 9월 안내 "extapps 전 ArgoCD app에 plugin 기설치" — 어느 방식·어느 credential인지는 BE팀만 앎 | ArgoCD·플랫폼(BE팀) | 42, 45, 49, 56 |
| 7 | 매니페스트 교체 | **저장소 안** `deploy/kic-op/secret.yaml` (+ `deploy/kic-op/configmap.yaml`, `deploy/base/deployment.yaml`) | SealedSecret(BE 제공 DB 6키) → **일반 Secret + AVP 자리표시자 10키**(§4 완성본). 같은 커밋: configmap에 `DB_SSLMODE=require` `DB_SCHEMA=<스키마>` `KVSTORE_ADDR=<valkey clustercfg>:6379` `KVSTORE_TLS=true` `KVSTORE_PREFIX=thinq-real` `ADMIN_PAGE_URL=<운영 관리자 페이지 URL>`, deployment `thinqreal/config-rev` +1. **전제: 절차 ⑤(14표 DDL) 완료** — `database/` `-ddl` Role 자격증명(10/27 발급 성공) 또는 MGR 계정으로 `schema-ddl.sql` 실행 후 | 우리(외부 트랙 지정 → 사내 Claude 적용) | 43, 52, 54 |
| 8 | 배포 | Gitea `main` push → ArgoCD Sync | `chore:` 커밋(`deploy/**`만 → 이미지 빌드 없음) → Sync(auto면 자동, 아니면 BE팀 Sync). *"Sync 성공 하면 위와 같이 Deploy 됨"* | 우리 push / BE팀 Sync | 46, 57 |
| 9 | 치환 확인 | ① `<OP>/healthz` ② `<OP>/api?type=env_keys&token=<관리자 토큰>` ③ Lens Secret 객체 ④ ArgoCD UI | ① `backend:"postgres"` `schema:"verified"` **`authSecret:"env"`** pod 교체 ② 10키 이름 + configmap 6키 ③ `thinq-real-db-svc` Opaque·data 키 10개(값은 보지 않음) ④ App Detail → **Manifest**에 치환본·Sync OK(BE팀, 또는 열람 권한 있으면 우리). 가이드 원방법 `kubectl exec … env \| grep KEY`는 kubectl 없어 ①②로 대체. 이어서 `teams_test`·`telegram_test` | 우리(①②③) / BE팀(④) | 45–47, 58 |
| 10 | 값 변경 시 | Vault secret 수정 → 재배포 | *"KEY 정보 변경 시 Vault에 Update 하고 Application을 전체 재 배포하여 변경 된 KEY가 환경 변수 설정 됨"* → `vault kv patch` 후 `config-rev` +1 커밋으로 pod 재기동 | 우리 | 27, 47 |

실패 시 분기(9단계): `env_keys`에 10키가 없고 pod가 CrashLoop → AVP 치환 실패(경로·네임스페이스·kv 버전·Token 권한 — ArgoCD Manifest/로그는 BE팀) / 10키는 있는데 `schema`가 `"verified"`가 아니고 CrashLoop → ⑤ 누락 표(LENS 로그) / `authSecret`이 `"env"`가 아니면 `AUTH_SECRET` 미주입.

## 3. Token — 어디에, 누가

- 가이드 4장③: Token은 **ArgoCD 쪽** `argocd` 네임스페이스 Secret(`VAULT_TOKEN`)에 들어가고 repo-server(또는 sidecar)가 읽는다(p.40–41, 48, 51). Application 매니페스트에는 Token이 들어가지 않으며, Application plugin ENV는 `VAULT_NAMESPACE` 보완용(p.45).
- 등록 주체는 ArgoCD 관리자(BE팀). 우리는 Catoz 메일로 받은 Token을 보관하고, 서비스별 Token 운영이면 보안 채널로 전달한다.

## 4. `deploy/kic-op/secret.yaml` 완성본 (가이드 p.52·54 형식)

```yaml
---
apiVersion: v1
kind: Secret
metadata:
  name: thinq-real-db-svc
  namespace: ns-extapps
  annotations:
    avp.kubernetes.io/path: "kv_api/thinq-real/csr-NNNNN"   # Depth1 미사용 시 "kv_api/csr-NNNNN"
    avp.kubernetes.io/kv-version: "1"                       # 4단계에서 kv v2로 확인되면 이 줄 삭제
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

키트 M2 §4 양식과 다른 점: ① `path`를 `key_kvstore` 규칙(`kv_api/[depth/]csr-NNNNN`, `/data/` 없음)으로 구체화 ② `kv-version: "1"` 줄을 기본 포함(키트는 "v1이면 추가"로만 서술) ③ 기존 SealedSecret의 `sealedsecrets.bitnami.com/managed` 주석 제거. `deploy/kic-op/kustomization.yaml`(`resources: - secret.yaml`)과 `deploy/base/deployment.yaml`(`envFrom.secretRef`)은 **무변경** — 외부 트랙 10/26 결정과 동일.

## 5. 검증 — kubectl 없이 가능한 순서

`/healthz`의 `authSecret:"env"`(AUTH_SECRET이 env로 들어온 직접 증거) + `schema:"verified"`(DB 5키 정상) → `env_keys`로 10키 이름 → Lens에서 Secret 객체 키 10개(값은 보지 않음) → `teams_test`·`telegram_test`. ArgoCD UI Manifest·Sync 상태는 BE팀(또는 우리 열람 권한 — §6-h).

## 6. 확인 필요 항목과 창구

| | 항목 | 왜 | 창구 |
|---|---|---|---|
| a | extapps ArgoCD가 **kustomize 오버레이 + AVP**를 어떻게 결합하는지 — 가이드 cmp는 `argocd-vault-plugin generate ./`(평문 YAML 디렉터리 전제), 우리는 `deploy/kic-op` kustomize 오버레이 | 결합 방식이 다르면 자리표시자가 치환되지 않음 | BE팀 — 키트 M2 "BE팀 확인 ①" |
| b | AVP Token이 **extapps 공용**인지 **서비스별**인지, 공용이면 `<Catoz Account>` 네임스페이스 `kv_api/…`를 읽을 권한이 있는지 / Application ENV `VAULT_NAMESPACE` 설정 주체 | 공용 Token은 다른 네임스페이스라 못 읽을 수 있음 | BE팀 — 키트 "BE팀 확인 ②" |
| c | **Allowed Bound CIDR**: AVP(argocd-repo-server) egress 대역 + **값 입력 PC(또는 HUB) IP** — 기존 KIC-OP 대역(internal-context §2-c)이 ArgoCD 쪽까지 덮는지 | CIDR 밖 IP에서는 Token 사용 불가 → 3단계가 막힘 | 인프라팀 + BE팀 |
| d | `kv_api`의 실제 kv 버전 | 가이드 p.31(v2 형식) vs p.43·54(v1) 불일치 → 7단계 주석 | 승인 후 UI Version 컬럼 / 인프라팀 |
| e | CSR Type 최종 확정(`key_kvstore`)·Depth1 사용 여부 | 키트 M2 §4 원칙 | 인프라팀 권고 → 외부 트랙 |
| f | Token 전달 채널 | 서비스별 Token이면 BE팀 등록용 전달 필요 — 평문 메일·Teams 금지 | BE팀 |
| g | README "kic-op는 ApplicationSet 미등록" 서술 vs OP 운영 중(0.21.2) | 6단계 작업 대상 파일·현황 확인, 문서 최신화 | BE팀 |
| h | ArgoCD UI 열람 권한(우리) | 9단계 ④를 우리가 직접 볼 수 있는지 | BE팀 |

## 7. 변경 이력

- v1 (2026-10-27): 가이드 전문·저장소 근거로 초안(채팅).
- v1.1 (2026-10-27): 세션 20 실측 반영 — ① UI Token 로그인 시 정책 밖 조회 403·배너는 정상 거부, 목록 안 보이면 직접 진입/CLI 권장 ② Vault CLI 설치 경로(p.63·71) 추가 ③ 0a "CSR 전 b·c 선확인" 단계 신설 ④ 7단계 전제에 `-ddl` Role 자격증명(발급 성공)으로 DDL 실행 가능함을 반영 ⑤ `database/` Role은 사람 접속 전용·앱 env 아님을 §0에 명시 ⑥ CLI 사용 시 쉘 히스토리 주의 추가. 이 파일로 md화.
