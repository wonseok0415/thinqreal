# Gitea `extapps/thinq-real` 저장소 계약 (README 전사 — 2026-08-25)

> 출처: `gitea.thinqcloud.link/extapps/thinq-real` README 화면 캡처 6장 (강원석 제공).
> 이 세션 환경에서는 사내 Gitea 접근 불가(프록시 403)이므로, **이 문서가 이식 작업의 기준 사본**.
> 실제 이식 시점에는 저장소 zip을 세션에 업로드받아 최신 원본과 대조할 것 (README는 계속 갱신되고 있음 — "상당히 많이 바뀌었으니" 8/13 언급).

## 0. 저장소 현황 (08-22 기준 캡처)
- 25 커밋 · 1 브랜치(main) · 7 태그 · 비공개. Languages: HTML 53.8% / JavaScript 45.9% / Dockerfile 0.3% (HTML 비중은 `original-code/`에 넣어둔 우리 라이브 파일들 때문).
- 루트: `.gitea/workflows/` `deploy/` `original-code/`(우리가 전달한 기존 코드) `src/` `.boilerplate.yaml` `.dockerignore` `.gitignore` `Dockerfile` `package.json` `README.md`
- 마지막 커밋들: `chore: restore sealed database Secret manifests` / `ci: fetch full release history` / `feat: add PostgreSQL items CRUD` / `feat: align app with current boilerplate` 등 — 커밋 주체 Hyunjeong Park.

## 1. ⚠ 필수 준수 규칙 (README 명시)
1. **Health check**: `/healthz` 엔드포인트 반드시 유지. K8s readiness/liveness probe가 사용. 바꾸려면 `deploy/base/deployment.yaml`의 probe 2개도 함께 변경.
2. **애플리케이션 코드**: 코드를 변경하면 **Dockerfile의 실행 설정과 release workflow의 테스트 명령도 함께 수정**.
3. **Valkey key**: 다른 앱과의 충돌 방지 위해 `thinq-real:<application-defined-key>` 형식 사용. 기본 key에는 `{repo}` 같은 hash tag 넣지 않음.
4. **커밋 메시지**: 버전·이미지 배포가 동작하도록 `feat:` `fix:` `perf:` 등 정해진 형식으로 작성하고 **main에 push**.
   - `feat:` → 버전 가운데 숫자(minor) ↑ / `fix:` `perf:` → 마지막 숫자(patch) ↑ / `feat!:` 또는 `BREAKING CHANGE:` → 첫 숫자(major) ↑ / `docs:` `chore:` `test:` → 버전 안 올림.
   - **형식을 지키지 않으면 workflow가 규모 판단을 못해 새 이미지·버전이 안 만들어질 수 있음.**

## 2. 샘플 코드 교체 절차 (우리 이식 작업의 공식 근거)
- 샘플 서버 = `src/server.js` 하나. "시작 코드이므로 애플리케이션 코드로 교체하거나 제거해도 됩니다."
- 교체 시 함께 수정해야 하는 것:
  - **Dockerfile**: 현재 `COPY src ./src`, `CMD ["node", "src/server.js"]`. 소스 경로·실행 파일이 바뀌면 COPY·빌드 대상·CMD/ENTRYPOINT를 새 코드에 맞게 변경.
  - **release workflow**: 현재 테스트 명령 `node --check src/server.js` (`.gitea/workflows/release.yml`). 구조 변경 시 테스트 명령도 변경.
  - **의존성**: 새 라이브러리 추가 시 Dockerfile에서 설치하도록 변경 + release workflow에서도 테스트 전 의존성 설치.

## 3. 제공 인프라 (Runtime)
- **Kubernetes**: app 전용 Deployment·Service 일체. 네임스페이스 `ns-extapps`. **Istio sidecar가 모든 pod에 자동 설치** (트래픽 제어·통신 보안·관찰성).
- **Database**: App 전용 PostgreSQL (`cluster/extapps-db`가 환경별로 앱 DB·권한·SVC credential Secret 생성 → `deploy/<environment>/secret.yaml` 갱신).
- **KVStore**: `extapps-kvstore` Valkey Cluster. 자체 운영 Valkey 9.1.1 / AWS ElastiCache for Valkey 엔진 9.1 / **JS client `redis` 6.1.0**. 접속 정보는 `deploy/base/configmap.yaml`에서 주입 — 코드에 Pod 주소 직접 작성 금지.
- **Service 노출**: 사내/외 선택에 따른 앱 전용 도메인·서비스 노출 (ALB 및 gateway).
- **GitOps**: Argo CD ApplicationSet (`cluster/argocd-apps/extapps/dev/thinq-real.yaml` — 별도 저장소, 클러스터 관리자 관리). **현재 kic-st·kic-qa만 등록, kic-op 미등록.**
- **관찰성**: Metric·log 등 TCN LENS 포함 TCN 관찰성 서비스.
- **이미지**: ECR `tcn/extapps/thinq-real:<version>` (kic·aic·eic 리전에 동일 버전 push, multi-architecture).

## 4. 기본 제공 환경변수
| 키 | 용도 |
|---|---|
| `ENVIRONMENT` | 현재 배포 환경 (예: `kic-st`) |
| `PORT` | HTTP 수신 포트 (8080) — **우리 컨테이너 기본값과 동일** |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` `DB_SSLMODE` | PostgreSQL 연결 (환경별 `deploy/<environment>/secret.yaml`에서 주입) |
| `KVSTORE_ADDR` | Valkey Cluster 접속 주소 |
| `KVSTORE_PREFIX` | 앱별 key prefix (`thinq-real`) — 뒤에 `:` 붙여 사용 |
| `KVSTORE_DEFAULT_TTL` | Valkey key 기본 만료 시간(초) |

## 5. 디렉터리 구조 (README 기재)
```
.gitea/workflows/release.yml   # 버전 계산, 이미지 빌드·배포, manifest 갱신
.boilerplate.yaml              # 생성 언어와 선택 기능 메타데이터
.dockerignore / .gitignore
Dockerfile                     # 컨테이너 이미지 빌드·실행 설정
README.md
src/server.js                  # 샘플 HTTP 서버 소스 (교체 대상)
package.json                   # JavaScript 패키지와 PostgreSQL 의존성
deploy/
├── base/
│   ├── deployment.yaml        # Deployment, health probe, nodepool, labels
│   ├── service.yaml           # ClusterIP Service와 selector
│   ├── configmap.yaml         # Valkey 접속정보와 key 설정
│   └── kustomization.yaml     # 공통 Kubernetes 리소스 목록
└── <environment>/             # kic-st / kic-qa
    ├── configmap.yaml         # 현재 배포 환경
    ├── secret.yaml            # PostgreSQL SVC Secret (sealed)
    └── kustomization.yaml     # base를 참조하는 환경별 overlay
```

## 6. 배포 흐름
main에 push → release workflow가 커밋 메시지로 새 버전 결정 → multi-arch 이미지 빌드·ECR push → `deploy/base/deployment.yaml` 갱신 → 중앙 `argocd-apps`의 Argo CD ApplicationSet이 변경 manifest 반영 → Kubernetes가 새 이미지로 Pod 교체.

## 7. 샘플 서버 엔드포인트 (검증용 — 교체 후 제거 가능)
`GET /`(hello + environment) · `GET /healthz` · `GET/PUT/DELETE /kv/{key}`(Valkey) · `GET/POST /items`, `GET/PUT/DELETE /items/{id}`(PostgreSQL CRUD)

## 8. 우리 `server/` 이식 체크리스트 (다음 이관 세션용)
1. **저장소 zip 업로드 받기** — Gitea 접근 불가하므로 담당자가 zip 다운로드 후 세션에 첨부 (README·Dockerfile·release.yml·src/server.js·deploy/ 원본 필요).
2. `src/server.js` → 우리 `server/src/*`로 교체. **정적 프론트(HTML·images)도 이미지에 COPY**해야 함 — 샘플 Dockerfile에는 없는 부분이라 Dockerfile 확장 필요 (단, 그들의 실행 설정·probe 패턴 유지).
3. Dockerfile: 의존성 설치(express·googleapis·nodemailer·iconv-lite + 차트용 @napi-rs/canvas·chart.js), **fonts-noto-cjk**(차트 한글) 설치 추가. CMD → `node src/index.js`.
4. `.gitea/workflows/release.yml`: 테스트 명령을 우리 구조에 맞게 (`node --check src/index.js` 등) + 의존성 설치 단계.
5. `/healthz` 경로 동일 확인 (우리 컨테이너 이미 `/healthz` ✓ — manifest 수정 불필요).
6. config.js: **`DB_*` 6종 env를 읽는 postgres store 어댑터 구현** (dynamo 스텁 대체). `ENVIRONMENT` env 추가 — kic-st/kic-qa에서는 메일 실발송 억제 등 분기.
7. Valkey(선택): 인증 코드 캐시·쓰기 mutex를 다중 레플리카 대비로 옮길 때 `redis` 6.1.0 클라이언트 + `thinq-real:` prefix + `KVSTORE_ADDR` 사용.
8. 커밋 메시지: 그 저장소에서는 **conventional commits(`feat:`/`fix:`)** 필수 — 안 지키면 배포 안 됨.
9. **BE팀 확인 필요(미결)**: 앱 자체 비밀값(AUTH_SECRET·SMTP·Wi-Fi·도어락 PIN·텔레그램 토큰 등)을 어떤 절차로 주입하는지 — `deploy/<env>/secret.yaml`(sealed)에 우리가 직접 추가 가능한지, 클러스터 관리자 요청인지. DB credential은 자동 provisioning이지만 앱 커스텀 secret 절차는 README에 없음.
10. 사내/외 서비스 노출(ALB/gateway) 중 **사내 전용** 선택 확인 (임직원 전용 사이트).

## 9. BE팀 Confluence 진행 현황 (2026-08-20 갱신본 — collab.lge.com "NOW | 박현정 | extapps: ThinQ Real")

- **담당자**: 강원석 책임 (BE 위키에 이 서비스의 공식 담당자로 등재).
- **환경 확정 정보**: Teams 방 `[서버지원] ThinQ Real` / argocd apps `kic-st-thinq-real`·`kic-qa-thinq-real` / Exposed URL `kic-st-thinq-real.thinqcloud.link`·`kic-qa-thinq-real.thinqcloud.link`.
- **Decisions**: ① **ops-gateway 사용** (사내 서비스이므로 — README의 "사내/외 노출 선택"은 사내 게이트웨이로 확정) ② **DB: PostgreSQL**.
- **Progress 체크리스트** (✅=완료):
  - ✅ git repo + boilerplate 생성 / ✅ kic-st ops-gateway 연동(임시 도메인) / ✅ **PostgreSQL 연동** / ✅ ECR 연동(임시 IMAGE REPO 제거) / ✅ LENS(LOG·METRIC) 설정·전달
  - ☐ **SealedSecret 설정 (미완)** — §8-9의 "앱 커스텀 비밀값 주입 절차"가 바로 이 항목에 걸려 있음. BE팀이 SealedSecret 체계를 마저 세팅하면 AUTH_SECRET 등 우리 비밀값을 봉인(seal)해 넣는 절차가 정해질 것. 커밋 `chore: restore sealed database Secret manifests`도 이 맥락.
  - ☐ **SSO(MS Entra ID) 연동 in ops-gateway (미완)** — **인증은 앱 코드가 아니라 ops-gateway 계층에서 MS Entra ID(사내 Microsoft 계정)로 처리하는 방향**. decisions §2의 "SSO 우선 검토 — 인증 후 헤더의 이메일로 관리자 판별" 구도와 일치. 우리 앱은 게이트웨이가 넘겨주는 사용자 헤더를 읽는 쪽으로 준비하면 됨 (현행 HMAC 게이트는 그 전까지 유지).
  - ☐ 수평 전개 (하위 KIC-QA·KIC-OP 체크 표시로 보임) — 단 README(08-22 캡처)는 "kic-op은 ApplicationSet 미등록"이라 명시. **OP 환경 실가동 여부는 박현정 책임에게 확인 필요** (CSR redirect 신청 시점과 직결).
- 관련 문서로 "김건우 | ThinQ Real 방문 예약 관리 시스템 TCN 입점 검토", "260706 사내 인프라 이관 방안 논의" 링크됨. extapps 자체는 "비 서버 전문 팀 주도 서비스를 위한 TCN 입점 모델".

## 10. 저장소 원본 확인 (2026-08-25 — 드라이브 반출본 `thinq-real_gitea` 검수)

캡처가 아닌 **파일 원문**으로 확인한 사실 (README 전사본 §1~§7과 규칙 일치 확인됨):

- **Dockerfile**: `node:22-alpine` + `USER 1000:1000`(non-root) + `COPY src ./src` + `CMD ["node","src/server.js"]`. → 키트도 alpine 유지, 폰트는 `apk add font-noto-cjk`.
- **deployment.yaml**: `replicas: 2`, `readOnlyRootFilesystem: true`, capabilities drop ALL, probe 2종=/healthz, `envFrom`: base configmap(KVSTORE_*) + env overlay configmap(ENVIRONMENT) + DB secret. resources **limit cpu 500m / memory 256Mi**. nodepool arm64 (멀티아치 빌드가 커버).
- **hpa.yaml**: **min 2 / max 10** (CPU 70%·MEM 80%) — ⚠ **멀티 레플리카 확정**. 단일 레플리카 전제(인메모리 인증 코드)가 깨짐 → server/에 Valkey 공유 캐시 구현으로 대응 (stage1-container-design §8-6).
- **release.yml**: main push 트리거(`paths-ignore: deploy/**`), 버전은 deployment.yaml의 `version:` 라벨 기준 + conventional commit 파싱으로 bump 결정, 테스트는 `node --check src/server.js` 한 줄, 멀티아치(amd64+arm64) 빌드 → ECR 3리전 push → deploy yaml 갱신 → bot이 `chore: release ...` 커밋+태그 push. conventional 형식 미준수 시 "No release-worthy commit" 으로 조기 종료(빌드 없음).
- **샘플 server.js**: Valkey는 `redis.createCluster` — **클러스터 모드** 접속. pg Pool은 `DB_SSLMODE==='disable'`이면 ssl off, 아니면 `rejectUnauthorized:false`.
- **original-code/**: 7월 초 버전 (ThinQ_Real_Visit_Survey.html 없음 — 설문 개편 전) → **정적 프론트 원본으로 쓰면 안 됨**. 키트는 최신본을 `public/`으로 신설.
- ECR 계정 ID·클러스터 내부 주소 등 식별자는 이 퍼블릭 리포에 기재하지 않음 — 키트(반입용 zip)와 저장소 원본에만 존재.

### §8 체크리스트 갱신 (키트 반영 후)
- 1(zip)·2(src 교체)·3(Dockerfile)·4(release.yml)·5(/healthz)는 **과제 A 키트(`thinq-real_kit_A.zip`)로 해결** — 적용 절차는 키트의 KIT-INSTRUCTIONS.md.
- 6(postgres 어댑터)·9(커스텀 secret 절차)·10(노출=ops-gateway 확정)은 잔여. **신규**: HPA 멀티 레플리카 대응은 server/ 코드에 선반영됨(Valkey 공유 캐시·AUTH_SECRET 공유·ENVIRONMENT 발송 억제).
