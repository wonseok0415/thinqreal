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
