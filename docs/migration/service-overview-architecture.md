# ThinQ Real — 서비스 개요·시스템 아키텍처 (DB 자원 신청 첨부용 초안)

> **용도**: DBSUPPORT JIRA(OP용 RDS PostgreSQL + ElastiCache valkey 신청) 담당자가 요청한 "서비스 개요·시스템 아키텍처" 자료의 **원고**. 이관 목표 시스템(사내 EKS 단일 컨테이너) 기준으로 작성한다 — DB팀이 알아야 할 것은 "무엇이 어떤 방식으로 DB에 붙는가"이므로 현행(GitHub Pages + Apps Script)은 배경 한 줄로만 둔다.
> **완성 절차**: 이 문서는 퍼블릭 리포라 사내 식별자를 비워 두었다(`《…》` 표기). 사내 Claude가 미러 pull 후 `internal-context.md` 값으로 채워 Word(.docx)로 만들고, 담당자가 JIRA 티켓에 첨부한다. 구성도는 §3의 텍스트 도식을 Word 표 또는 PPT 도형 5개로 옮기면 충분하다.
> **작성**: 외부 트랙 2026-09-23 (v1). 사실 출처: `decisions-2026-07-06.md` §1·§6, `stage1-container-design.md` §8-6~§8-11, `data-schema.md`, `api-contract.md`.

## 1. 서비스 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | ThinQ Real 운영관리 시스템 (사내 AI홈 연구·쇼룸 예약·운영) |
| 대상 | **B2E — LG전자 임직원 전용** (외부 고객 미노출). 사용자 = 예약 신청 임직원, 관리자 = 운영 담당자 7명 이내 |
| 기능 | ① 방문 예약(달력·회차 선택·신청 폼) ② 관리자 대시보드(예약 승인·거절·통계·슬롯 차단·CSV 내보내기) ③ 방문 후기 설문·성과 대장·IoT 이슈 관리 ④ 월간 운영 리포트 메일(차트 내부 렌더링) ⑤ 현장 자동 점검(FieldCheck)·현장 인사이트(FieldVoice) 이력 조회 |
| 규모 | 예약 월 수십 건, 설문 응답 월 수십 건. **누적 데이터 수천 행**(표 14개 합계), 성장률 연 수천 행 수준. 동시 사용자 수 명 — **저트래픽·경량** |
| 운영 시간 | 상시(사내망). 일일 자동 작업 3종(아침 07:40·08:30) + 10분 주기 동기화 1종 |
| 현행 → 이관 | 현행은 GitHub Pages(정적) + Google Apps Script(백엔드) + Google Sheets(저장소). **사내 EKS 단일 컨테이너 + RDS PostgreSQL + ElastiCache valkey**로 이관 중(과제 A·B·C 완료, ST/QA/OP 가동). 오픈 목표 2026년 11월(잠정) |
| 개인정보 | 예약자 성명·직급·이메일·소속, 방문자 명단(성명·소속·직급). 처리방침 V3.0(2026-09-20) — **국외 이전 없음**, 사내 DB 저장이 전제 |

## 2. 시스템 구성 요소 (이관 목표)

| 구성요소 | 내용 | 비고 |
|---|---|---|
| 앱 컨테이너 | Node.js 22 + Express **단일 이미지** — 정적 프론트(HTML 7종·이미지) + API(`/api?type=…` GET 19종·POST 30종) + 인앱 스케줄러를 한 프로세스에서 처리 | Gitea `extapps/thinq-real`, Gitea Actions → ArgoCD 배포. 버전 0.15.0(2026-09-22) |
| K8s 배포 | TCN EKS, 네임스페이스 `extapps`, **HPA min 2 레플리카** | 환경 3종: ST(kic-st)·QA(kic-qa)·OP(kic-op) |
| 진입·인증 | 사내 ops-gateway **SSO(MS Entra ID)** 전면 적용 → 앱은 자체 이메일 코드 인증(HMAC 토큰)을 당분간 병행. SSO 예외 경로 5종(`/healthz`·`/pub`·방문자 설문 페이지·privacy·images) | OP 주소 `thinqreal.lge.com` (사내망 전용) |
| **RDS PostgreSQL** (신청 대상) | 운영 데이터 전부. 표 14개, 전 컬럼 TEXT(시트 승계), 기동 시 스키마 자동 생성·진화(`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`) | §4 |
| **ElastiCache valkey** (신청 대상) | 레플리카 간 공유 캐시: 인증 코드(TTL 20분)·재요청 쿨다운(60초)·실패 카운트·**토큰 서명 키 1건(영구, SET NX)**·스케줄러 분산 락 | §5. 영속 데이터 없음(키 1건 제외 — 유실 시 자동 재생성, 기존 토큰만 무효) |
| 메일 | 사내 SMTP(스펙 BE팀 대기) — 예약 확정·설문 초대·월간 리포트·인증 코드 | ST/QA는 실발송 억제 |
| 메신저 | MS Teams 워크플로 웹훅(현행 텔레그램 대체) | |
| 외부 연동(egress) | ① 현행 Apps Script **pull**(하이브리드 에지 — §6) ② 기사 검색 API(Serper) ③ Google 캘린더 동기화(엑스트라) | pod 아웃바운드 실측 통과(2026-09-17) |
| 스케줄러 | 인앱(K8s CronJob 불필요): 07:40 점검 요약 메일 / 08:30 월간 리포트(첫째 수요일)·설문 초대 / 10분 edge-sync. 레플리카 중복 실행은 valkey 락으로 방지 | |

## 3. 시스템 구성도

```
[임직원 브라우저]──SSO(ops-gateway)──▶ ┌───────────────────────────────────────┐
                                        │  thinq-real pod ×2 (HPA)  ns=extapps  │
[방문객 QR 설문·점검 장비]              │  Express: 정적 / /api / /pub / 스케줄러 │
      │ (사외 — 사내 진입 불가)          └──────┬──────────────┬─────────────────┘
      ▼                                       │ TCP 5432     │ TCP 6379(cluster)
[GitHub Pages + Apps Script (현행 외부 접점)]  ▼              ▼
      ▲            ┌──────────────────────────┐  ┌──────────────────────────────┐
      └──10분 pull─│ RDS PostgreSQL  《인스턴스》│  │ ElastiCache valkey 《클러스터》│
   (edge-sync,     │ DB 《schema》 · 표 14개     │  │ prefix `thinq-real:` · TTL 키  │
    GET only)      └──────────────────────────┘  └──────────────────────────────┘
                                    │ SMTP(사내) · Teams 웹훅 · 캘린더/기사 API(egress)
                                    ▼
                          [메일 · Teams 채널 · 외부 API]
```

- **동일 VPC 내부 통신**: 앱 pod → RDS·valkey는 `《VPC명 — internal-context §2-a》` 안에서 프라이빗 통신. 외부(인터넷)에서 DB로 향하는 경로 없음.
- **데이터 경계**: 예약·인증·관리자 데이터는 사내 DB에만. 외부에 남는 것은 익명 방문자 설문·장비 점검 로그·현장 리포트(현행과 동일 위치) — §6.

## 4. RDS PostgreSQL — 데이터·접속 방식

| 항목 | 내용 |
|---|---|
| 엔진·버전 | PostgreSQL 16.x(최신 안정). 외부 검증 16, 14 이상 호환 |
| 문자 인코딩 | UTF-8 (한글 저장) |
| 스키마 | 1개(`《Database Schema — internal-context §2-a》`). 표 14개 — `bookings`(예약 26컬럼) · `roi_snapshots` · `slot_blocks` · `monthly_articles` · `survey_responses`(42) · `performance_ledger`(16) · `iot_issue_log`(9) · `visitor_responses`(11) · `monthly_insights`(7) · `best_reviewers`(10) · `export_log`(5) · `health_checks` · `voc_reports` · `app_state`(key/value) |
| 컬럼 타입 | 전 컬럼 **TEXT** + `rid BIGSERIAL PK`(append 순서). 수치 집계는 앱 레벨(저트래픽 전제). 인덱스는 PK만 — 표당 수천 행이라 풀스캔 무해 |
| 용량 | 현재 수천 행·수 MB. **20GB(gp3)** 면 수년 여유 |
| 접속 | 앱 컨테이너가 env(`DB_HOST/PORT/NAME/USER/PASSWORD/DB_SSLMODE`)로 직접 접속 — sealed-secret 주입. **커넥션 풀 pod당 최대 5**(`max: 5`), 레플리카 2 → 동시 접속 10 이하 |
| 계정 | `《서비스명》_MGR`(스키마 관리) / `《서비스명》_APP`(앱 접속) — DBSUPPORT JIRA 별도 신청 예정. 앱은 APP 계정만 사용, DDL은 기동 시 자동 생성이라 **APP 계정에 CREATE TABLE·ALTER 권한 필요**(또는 MGR로 1회 기동 후 APP으로 전환 — DB팀 표준에 따름) |
| 부하 패턴 | 읽기 위주(관리자 대시보드 조회·30분 캐시), 쓰기는 예약·설문 제출 시 건별 INSERT/UPDATE. 배치는 일 1회 리포트 집계(수천 행 읽기) |
| 백업·가용성 | 표준 백업(일 1회·7일 보존 수준)이면 충분. 개발·검증 기간 PRD/Single, 오픈 전 Multi-AZ 전환 별도 요청 |
| 수작업 접근 | 일상 운영에서 불필요(관리자 페이지가 전부 처리). 데이터 이행(과제 D)도 앱 경유(관리자 페이지 업로드) — DB-i/TAAgent 경로는 비상용 |

## 5. ElastiCache valkey — 사용 방식

| 항목 | 내용 |
|---|---|
| 엔진 | valkey (cluster 모드, redis JS client 6.x `createCluster`) |
| 키 규칙 | 전부 `thinq-real:` 접두(env `KVSTORE_PREFIX`), hash tag 미사용 |
| 키 종류 | 인증 코드 `auth_code_*`/`admin_code_*`(TTL 20분) · 쿨다운(60초) · 실패 카운트(20분) · `app:auth-secret`(영구 1건, SET NX) · 잡 락(분·일 단위 TTL) |
| 데이터량 | 동시 수십 키, 수 KB. **영속 데이터 없음** — 유실 시 사용자는 코드 재요청, 서명 키는 자동 재생성(기존 로그인 토큰만 무효) |
| 사양 | 최소(cache.t4g.micro), Shard 1, Node 2. 장애 시 앱은 메모리 폴백(단일 pod 한정 동작 — 로그인이 pod에 따라 어긋날 수 있어 valkey 정상이 전제) |
| 접속 | env `KVSTORE_ADDR`(host:port) — 동일 VPC 프라이빗 |

## 6. 외부 접점 — 하이브리드 에지 (DB팀 참고)

사내 인프라는 사외 비노출(사내 전용 DNS·SSO)이라 외부 호출자 3종은 사내로 들어올 수 없다. 이들은 **현행 Google 경로(GitHub Pages + Apps Script + Sheets)에 그대로 남기고**, 사내 컨테이너가 10분 간격으로 pull(GET)해 RDS에 병합(id 기준 멱등)한다.

| 흐름 | 외부(현행 유지) | 사내(RDS 반영) |
|---|---|---|
| 방문객 QR 설문(익명) | 휴대폰 → Apps Script → 시트 | `visitor_responses` 표에 병합 |
| FieldCheck 점검 장비(사외 Wi-Fi) | rig → Apps Script → 시트 | `health_checks` 표에 병합 |
| FieldVoice 현장 리포트 | 파이프라인 → Apps Script → 시트 | `voc_reports` 표에 병합 |

DB 관점: 위 3표는 **사내 조회용 미러**(원본은 외부 시트), 나머지 11표는 사내 RDS가 원본. 인바운드 pull만 있고 DB에서 외부로 나가는 데이터는 없다.

## 7. 데이터 이행(과제 D) — DB 생성 후 절차

1. RDS·valkey 생성 → 접속 계정 발급 → env 주입(sealed-secret) → OP 컨테이너 기동 시 표 14개 자동 생성.
2. 현행 시트 데이터를 탭별 JSON 스냅샷으로 추출 → 관리자 페이지 「데이터 이행」 패널에서 업로드(`admin_import`, dry-run → 실적재, 멱등). DB 직접 접근 불필요.
3. QA에서 리허설 후 D-day 1회 적재 + 건수·샘플 대조.

## 8. 사내 식별자 채움 목록 (사내 Claude 작업 — internal-context.md 참조)

| 표기 | 값의 위치 |
|---|---|
| `《VPC명》` · `《인스턴스》` · `《schema》` · `《서비스명》` | internal-context §2-a (RDS 기재값) |
| `《클러스터》` | internal-context §2-b (ElastiCache 기재값) |
| 접속 대역·계정 | internal-context §2-c — **문서에는 적지 않음**(DB팀 표준 규칙 우선, 9/22 결정). 요청받으면 별도 회신 |
| 담당자·연락처 | internal-context §3 |
