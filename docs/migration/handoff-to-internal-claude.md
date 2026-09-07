# 사내 Claude 인수인계 브리핑 (ThinQ Real 이관)

> **이 문서를 읽는 너(사내 Claude)에게**: 너는 ThinQ Real 사내 인프라 이관 작업을 이어받는다.
> 이 문서가 진입점이다 — 먼저 §1~§4를 읽고, 과제별로 §5가 지정하는 파일만 추가로 읽어라.
> 사용 한도가 작은 계정이므로 **불필요한 파일 탐색 금지, 한 세션 한 과제, 결과는 즉시 §7의 worklog에 기록**이 원칙이다.

## 1. 프로젝트 30초 요약

- **ThinQ Real**: 마곡 LG사이언스파크 W6동 1층 AI홈 쇼룸의 예약·운영 시스템. 임직원 전용(B2E).
- **현행(운영 중)**: GitHub Pages 정적 사이트(index.html·thinqreal_admin.html·ROI툴·설문폼) + Google Apps Script 백엔드 + Google Sheets. 이관 완료 전까지 그대로 운영된다.
- **이관 목표**: 프론트+백엔드를 **단일 도커 컨테이너**로 사내 클라우드(TCN, Kubernetes)에 배포. 저장소는 사내 Gitea `extapps/thinq-real`, DB는 PostgreSQL, 도메인은 `thinqreal.lge.com`.
- **역할 분담(중요)**: 현행 사이트 운영·수정은 **외부(개인 계정) Claude 세션**이 담당한다. 너는 **이관 트랙만** 담당한다. `original-code/`의 라이브 파일들은 참고용 — 절대 수정하지 말 것 (수정해도 라이브에 반영 안 되고 혼선만 생긴다).

## 2. 현재 상태 (2026-08-25 기준)

**완료** — Apps Script 전체(5,052줄, 예약·인증·메일·리포트·설문·FieldCheck/FieldVoice·큐레이션 파이프라인)를 대체하는 **Node.js 22 + Express 컨테이너가 이미 구현·검증 완료**됐다. 코드는 `server/` 디렉토리 (**GET 19종 + POST 29종**, 현행 API 계약 100% 호환 — 2026-08-25 main 재병합으로 방문자 설문·FieldCheck·FieldVoice·리포트 큐레이션·베스트 리뷰어·설문 초대 자동 발송·월간 리포트 §8-7 개편판까지 전부 이식됨). memory store + 콘솔 메일 모드로 전 엔드포인트 curl 검증 및 `docker run` 기동 검증까지 끝났다. **너의 일은 처음부터 만드는 게 아니라, 이 완성된 코드를 Gitea 저장소 규칙에 맞춰 이식하고 PostgreSQL을 연결하는 것이다.**

**BE팀(박현정 책임)이 준비해 둔 것**: Gitea 저장소 + push 자동배포 CI/CD + ST/QA 환경 가동(샘플 앱 동작 중) + PostgreSQL·Valkey 연동 + LENS 관찰성. 미완: SealedSecret 설정, SSO(MS Entra ID) in ops-gateway, OP 환경.

## 3. 파일 지도 — 질문별로 어디를 읽나

| 알고 싶은 것 | 읽을 파일 (docs/migration/) |
|---|---|
| 이관 방향·결정사항 전체, 사내 인프라 현황 | `decisions-2026-07-06.md` (§6이 최신 인프라 현황) |
| **Gitea 저장소 규칙·이식 절차·체크리스트** | `gitea-repo-contract.md` ← **이식 작업의 기준** |
| API 입출력 스펙 (엔드포인트 계약) | `api-contract.md` |
| 데이터 스키마 (bookings 24컬럼, 설문 3탭 등) | `data-schema.md` |
| 컨테이너 설계 근거·구현 결과·함정 모음 | `stage1-container-design.md` (특히 §8 — 차트 스택·폰트·인코딩 함정) |
| Apps Script 플랫폼 의존성 → 대체 매핑 | `dependency-inventory.md` |
| 코드 실행법·구조 | `server/README.md` |
| 운영 사이트의 전체 역사(참고용 — 평소 읽지 말 것) | 리포 루트 `CLAUDE.md` (매우 김 — 꼭 필요할 때 해당 섹션만) |

## 4. 절대 규칙 (위반 시 배포가 깨지거나 사고가 남)

1. **`/healthz` 유지** — K8s probe가 사용. 경로 바꾸면 `deploy/base/deployment.yaml` probe 2개도 함께.
2. **코드 변경 = Dockerfile 실행 설정 + `.gitea/workflows/release.yml` 테스트 명령 동반 수정.**
3. **커밋 메시지는 conventional commits** (`feat:` `fix:` `perf:` / `docs:` `chore:`는 버전 안 올림) — 형식 안 지키면 이미지·버전이 안 만들어진다.
4. **비밀값 커밋 금지** — 전부 env 주입. DB는 인프라 제공(`DB_*` 6종), 앱 커스텀 비밀값(AUTH_SECRET 등)은 SealedSecret 절차 확정 대기(§6 질문 1). 커밋 전 민감 단가 grep: `grep -rnE "6,220|34,220|114,220|108,000|659원|16,126|Hi-Teleservice|헤이홈"` → 0건 확인.
5. **설문·대장·이슈 삭제는 "테스트·실수 데이터 정리 전용"** — `survey_delete`(파생 행 cascade)·`ledger_delete`·`issue_delete`가 2026-07부로 존재하지만 전부 관리자 토큰 게이트이며, **실제 성과 기록은 여전히 드롭/기각 상태 전환으로만 보존**한다. 설문 응답 불변 필드 7종(`response_id/submitted_at/track/raw_json/media_link/etc_link/iot_defect`) 유지.
6. Valkey 키는 `thinq-real:<key>` 형식. 코드에 Pod 주소 하드코딩 금지.
7. **`original-code/` 수정 금지** (참고용 사본), 라이브 사이트 관련 판단은 외부 트랙에 넘길 것.

## 5. 과제 목록 (한 세션에 하나씩, 이 순서대로)

**과제 A — server/ 코드를 Gitea 저장소에 이식** ✅ **완료 (2026-08-26)** — 키트 v2 적용·push, Actions 성공, ST 검증표 4/4 통과 (healthz/메인 페이지/관리자/가전 45). 아래 원문은 이력 보존용.
(읽을 것: `gitea-repo-contract.md` §1·§2·§8 + 저장소의 실제 Dockerfile·release.yml·src/server.js)
- `src/server.js`(샘플) 제거 → `server/src/*`를 `src/`로 이동. `server/package.json` 병합(pg 의존성은 샘플 것 유지).
- 정적 프론트(HTML 6종 — index/admin/ROI/Visit_Survey/Visitor_Survey/privacy + images/)도 이미지에 COPY — **키트의 public/이 최신본** (`original-code/`는 7월 초 구버전이라 쓰지 말 것. 이식 시점에 외부 트랙에 최신 여부 재확인).
- Dockerfile: 샘플의 실행 패턴 유지하되 의존성(express·googleapis·nodemailer·iconv-lite·@napi-rs/canvas·chart.js·chartjs-plugin-datalabels) + **fonts-noto-cjk**(차트 한글 필수) 추가, `CMD ["node","src/index.js"]`.
- release.yml 테스트 명령 → `node --check src/index.js`.
- 검증: `ENVIRONMENT` 없이도 기동(memory store) → push → ST 자동 배포 → `https://kic-st-thinq-real.thinqcloud.link/healthz` 및 `/` (index.html) 확인.
- ⚠ 함정 예방: chartjs-plugin-datalabels는 반드시 ESM 빌드 직접 import (이미 코드에 반영돼 있음 — 바꾸지 말 것). 날짜 처리에 `toISOString()` 금지(KST 규칙, lib/dates.js 사용).

**과제 B — PostgreSQL store 어댑터 구현** ✅ **구현 완료 (2026-09-05, 외부 트랙 — 키트 v3로 사내 적용 대기)** — `store/postgres/` + STORE_BACKEND 자동 감지(DB_HOST 있으면 postgres) + 인앱 스케줄러(K8s CronJob 불필요해짐). 사내에서는 키트 v3의 KIT-INSTRUCTIONS.md 절차대로 적용만 하면 됨. 상세: `stage1-container-design.md` §8-8. 아래 원문은 이력 보존용.
(읽을 것: `server/src/store/types.js`·`memory.js`·`sheets/index.js` + 저장소 샘플의 PostgreSQL CRUD 코드 + `data-schema.md`)
- `server/src/store/dynamo/`(스텁) → `postgres/`로 교체. 인터페이스(bookings/roi/slotBlocks/articles/state/survey + 신규 TableStore 6종: visitors/insights/best/exportLog/health/voc — `store/types.js`가 계약)는 그대로 구현만 바꾼다.
- env `DB_HOST/PORT/NAME/USER/PASSWORD/SSLMODE` 사용 (config.js에 추가). 테이블은 시트 탭 구조를 따르되 컬럼명 유지 (bookings **25컬럼**(+surveyInviteSentAt) + roi + slot_blocks + monthly_articles + app_state + 설문 3탭 + visitor_responses·monthly_insights·best_reviewers·export_log·health_checks·voc_reports — `data-schema.md`가 단일 소스).
- `STORE_BACKEND=postgres`로 ST에서 검증. **당분간 운영 데이터 원본은 여전히 구글 시트** — 데이터 이행(시트→PG)은 별도 과제 D.
- 설문 3탭의 remove 연산은 memory/sheets 구현과 동일한 의미(테스트 정리 전용, §4-5)로만 구현할 것.

**과제 C — ENVIRONMENT 분기 + 알림/메일 스위치** ✅ **완료 (2026-08-25 외부 트랙 선반영 — 키트 v2에 포함되어 이미 적용됨)** — config.outboundSuppressed(kic-st/qa 실발송 억제, OUTBOUND_FORCE_SEND 해제). 아래 원문은 이력 보존용.
(읽을 것: `server/src/config.js`·`mail/mailer.js`)
- `ENVIRONMENT` env 읽기 추가. `kic-st`/`kic-qa`에서는 메일 실발송 억제(콘솔 모드)·텔레그램/Teams 스킵, OP에서만 실발송.

**과제 D — 데이터 이행 + 전환** (마지막, OP 준비 후): 시트 → PostgreSQL 이행 스크립트, 프론트 `SCRIPT_URL` 3곳 → `/api` 교체, OP 배포, CSR redirect 등록(외부 트랙과 협의).

## 6. BE팀(박현정 책임)에 물어볼 미결 질문

1. **앱 커스텀 비밀값 주입 절차** — AUTH_SECRET·SMTP·Wi-Fi PW·도어락 PIN 등을 `deploy/<env>/secret.yaml`(sealed)에 우리가 직접 넣는가, 요청 절차인가? (SealedSecret 설정 완료 후)
2. **사내 SMTP 스펙** — 호스트/포트/인증, 발신 주소 정책, HTML 메일 허용.
3. **SSO(MS Entra ID) 헤더 스펙** — 인증 후 사용자 이메일이 어떤 헤더로 넘어오는가 (넘어오면 앱의 HMAC 게이트를 헤더 판별로 교체).
4. **KIC-OP 실가동 여부** — 가동 시 CSR redirect 등록(`thinqreal.lge.com` → OP 주소) 진행.

## 7. 작업 기록·외부 전달 프로토콜 (반드시 지킬 것)

- 모든 세션은 끝나기 전에 **`docs/migration/internal-worklog.md`에 append**한다: 날짜 / 한 일 / 결정 / 막힌 것 / 다음 할 일. (파일이 없으면 생성. 코드 diff는 쓰지 말고 요약만 — 코드는 git이 기록한다.)
- 외부(개인 계정) Claude에게 진행 상황을 전달할 때는 **이 worklog 파일 하나만** 반출하면 된다 — 작은 텍스트라 보안 결재 부담이 적다.
- 외부에서 새 지시·변경이 들어올 때도 같은 형식(md 파일)으로 받는다.

## 8. 토큰 절약 수칙 (한도 작은 계정)

- 한 세션 = 한 과제. 세션 시작 프롬프트: "docs/migration/handoff-to-internal-claude.md의 과제 X를 진행해라."
- §5가 지정한 파일 외에는 열지 말 것. 특히 `CLAUDE.md`(루트)와 `original-code/`는 기본적으로 읽지 않는다.
- 대화로 길게 논의하지 말고 바로 구현 → 검증 → worklog 기록 → 종료.
- 막히면 추측으로 소진하지 말고 worklog에 "막힌 지점"으로 기록 후 종료 — 외부 트랙이 받아 검토한다.

## 9. 세션 시작 프롬프트 모음 (담당자용 — 복사해서 사용)

### 반입 후 준비 (사내 Claude 호출 전, 담당자가 1회 수행)
반입한 zip에서 ① Gitea 저장소 루트에 `docs/migration/` 폴더를 **새로 만들고** zip의 `docs/migration/*` 전체를 넣는다 (현재 저장소에 docs/ 없음 — 7/16 반입분은 보일러플레이트 재구성 때 빠진 것으로 보이며, 있더라도 이번 것이 최신본이므로 덮어쓴다) ② `server/` 폴더를 저장소 루트에 **추가** ③ (Claude Code인 경우) `docs/migration/CLAUDE-gitea.md`를 저장소 **루트에 `CLAUDE.md`로 복사** — 세션마다 자동 로드되는 상시 지침 ④ 커밋 메시지 `chore: 이관 문서·컨테이너 코드 반입` 으로 push (`chore:`는 버전·배포를 발동시키지 않음). 사내 Claude가 Claude Code(저장소 직접 접근)라면 이 단계도 첫 세션에서 시키면 된다. (선택) `.dockerignore`에 `docs/`·`server/`를 추가하면 이미지 빌드 컨텍스트가 가벼워진다 — 필수는 아님(Dockerfile이 COPY하지 않는 폴더는 이미지에 안 들어감).

### 프롬프트 1 — 첫 세션 (온보딩 + 과제 A 착수)
```
너는 ThinQ Real 사내 인프라 이관 작업을 전담하는 개발 어시스턴트다.

[맥락]
- 전체 맥락은 저장소의 docs/migration/handoff-to-internal-claude.md(인수인계 브리핑)에 있다. 이 파일을 먼저 정독해라.
- 외부에서 완성·검증된 컨테이너 코드(server/)를 이 Gitea 저장소의 샘플 자리(src/server.js)에 이식하는 것이 너의 임무다.
- 채팅 기록은 인수인계되지 않았다. 브리핑과 docs/migration/ 문서가 유일한 맥락이다. 문서에 없는 것은 추측하지 말고 물어봐라.

[오늘 할 일]
1. 브리핑을 읽고, 이해한 내용을 10줄 이내로 요약해라 (프로젝트 목표 / 현재 상태 / 과제 A~D / 절대 규칙 7). 내가 확인하고 잘못된 부분을 바로잡겠다.
2. 확인 후 과제 A(server/ 코드 이식)를 브리핑 §5 절차대로 진행해라. 이 저장소의 현재 Dockerfile·.gitea/workflows/release.yml·src/server.js·README.md를 먼저 읽고, §4 절대 규칙을 지키며 교체해라.
3. 아직 push하지 마라 — 변경 요약을 내게 보여주고, 승인받은 뒤 conventional commits 형식(feat: ...)으로 커밋·push해라.
4. 세션을 마치기 전에 docs/migration/internal-worklog.md에 오늘 작업을 기록해라 (없으면 생성).

[제약]
- 사용 한도가 작다. 불필요한 파일 탐색과 긴 설명 없이 작업 중심으로.
- original-code/는 참고용 — 절대 수정 금지.
- 막히면 추측으로 소진하지 말고, 막힌 지점을 worklog에 기록하고 멈춰라.
```

### 프롬프트 2 — 이후 세션 표준형
```
docs/migration/handoff-to-internal-claude.md와 docs/migration/internal-worklog.md의 마지막 기록을 확인한 뒤, 과제 <B/C/D 중 하나>를 이어서 진행해라. push 전에 변경 요약을 보여주고 승인받아라. 끝나면 worklog에 기록해라.
```

### (챗 전용) Projects 설정 — 사내 Claude가 Claude Code가 아니라 일반 채팅이면
프로젝트 "ThinQ Real 이관"을 만들고 `docs/migration/` md 파일들을 프로젝트 지식에 업로드한 뒤, 프로젝트 지침에 아래를 등록:
```
이 프로젝트는 ThinQ Real 사내 이관 작업 전용이다. 프로젝트 지식의 handoff-to-internal-claude.md가 진입점이며, 모든 작업은 그 문서의 규칙(§4)과 과제 순서(§5)를 따른다. 답변은 간결하게, 작업 중심으로 한다. 세션 결과는 internal-worklog.md 형식으로 정리해 준다.
```
채팅에는 저장소 파일 접근이 없으므로, 과제 A는 "필요한 파일(현재 Dockerfile·release.yml 등)을 대화에 첨부받아 → 수정본을 통째로 출력받아 → 담당자가 Gitea에 반영"하는 방식으로 진행한다.
