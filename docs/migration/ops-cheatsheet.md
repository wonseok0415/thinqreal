# 담당자 반복 작업 치트시트 — 복사/붙여넣기용 (v1, 2026-09-29)

> **용도**: 이관 작업에서 매번 되풀이되는 명령·주소·프롬프트를 한 곳에. `<…>` 자리만 바꿔 붙여 넣는다 — **꺾쇠 `<` `>`까지 지우고** 값만 넣는다(`token=<토큰>` → `token=eyJ…`). 비밀값·사내 식별자는 없다(토큰은 본인 브라우저에서만).
> **갱신**: 외부 트랙. 절차가 바뀌면 이 표부터 고친다.

## A. 사내 PC 명령 (cmd 또는 PowerShell)

| 언제 | 붙여 넣을 것 | 비고 |
|---|---|---|
| 키트 적용 전 미러 최신화 | `cd /d D:\workspace\50-resources\57-thinqreal-github && git pull` | PowerShell이면 `cd D:\workspace\50-resources\57-thinqreal-github; git pull` |
| 사내 클로드가 준 push가 **rejected (fetch first)** | `cd /d D:\workspace\50-resources\54-thinq-real && git pull --rebase origin main && git push origin main` | 릴리스 봇이 `chore: release` 커밋을 먼저 올려서 생기는 정상 현상. 이 한 줄이면 끝. PowerShell은 `&&` 대신 `;` |
| push 전에 미리 막기 | `git pull --rebase origin main` 을 push 직전에 한 번 | 사내 클로드 프롬프트에 "push 명령은 `git pull --rebase origin main && git push origin main` 로 줘" 라고 적어 두면 됨 |
| 지금 어느 커밋인지 | `git log --oneline -5` | |

## B. 브라우저 주소 (환경별 — `<HOST>`만 바꿈)

| 환경 | `<HOST>` |
|---|---|
| ST | `https://kic-st-thinq-real.thinqcloud.link` |
| QA | `https://kic-qa-thinq-real.thinqcloud.link` |
| OP | `https://thinqreal.lge.com` |

| 확인할 것 | 주소 | 정상 |
|---|---|---|
| 릴리스·pod·캐시·서명 키·DDL 모드 | `<HOST>/healthz` | `version`=최신 릴리스, `env`=환경명, `schema:"ddl"`(ST·QA) 또는 `"verified"`(OP — APP 계정, MGR이 DDL 선반영), `kv:"shared"`, `authSecret:"db"`(또는 `env`). `temp`면 문제 |
| 메일 설정 | `<HOST>/api?type=mail_status` | OP `mailMode:"smtp"`·`smtpPort:25` / ST·QA `console` / `forceSend:false` |
| pod에 들어온 env 이름 | `<HOST>/api?type=env_keys&token=<토큰>` | `groups`의 db·kvstore·smtp·environment true. `names`에서 Ctrl+F로 키 이름 확인 |
| 인터넷 아웃바운드 | `<HOST>/api?type=egress_check&token=<토큰>` | `ok:true`, `count:45` |
| DB·valkey에 pod가 닿나(SG 확인, 키트 v4.12~) | `<HOST>/api?type=db_probe&token=<토큰>&host=<RDS Cluster Writer 엔드포인트>&port=<RDS 포트>` (⚠ RDS 포트는 표준 5432가 아님 — internal-context §2-a 값. valkey는 `host=<clustercfg 엔드포인트>&port=6379`) | `results[0].ok:true`. `ETIMEDOUT`이면 SG 미허용, `ENOTFOUND`면 주소 오타. 엔드포인트는 internal-context §2-a·§2-b 값(꺾쇠 없이). 응답의 host는 마스킹되어 있으니 외부 보고에 그대로 붙여도 됨 |
| 구비 가전(백엔드 살아 있나) | `<HOST>/api?type=appliances` | `count:45` |
| 데이터 이행 패널(키트 v5~) | 같은 브라우저에서 `<HOST>/thinqreal_admin.html` 로그인 후 `<HOST>/api?type=admin_import_page` | 상단 「토큰 있음」. 순서 ① 검사 → ② 적재 → ③ 검증(전 테이블 일치). 입력 파일은 구글 시트 「파일 → 다운로드 → Microsoft Excel(.xlsx)」 |
| 인증 코드 보기(ST·QA만) | `<HOST>/api?type=auth_code_peek&kind=admin&email=<본인메일>` | `code` 6자리. OP는 404가 정상(메일로 옴) |
| 코드 요청(주소창, 페이지 안 될 때) | `<HOST>/api?type=admin_auth_request&email=<본인메일>` | `ok:true` (60초 내 재요청은 `cooldown`) |
| 코드 검증(주소창) | `<HOST>/api?type=admin_auth_verify&email=<본인메일>&code=<6자리>` | `ok:true` + token |
| 메일 실발송 테스트(본인만) | `<HOST>/api?type=mail_test&token=<토큰>&to=<본인메일>` | `accepted:[본인]`, `rejected:[]`. ST·QA는 콘솔 모드라 토큰 불필요·실발송 없음 |

**토큰 얻기**: `<HOST>/thinqreal_admin.html` 로그인(ST·QA는 코드를 peek로) → 같은 탭 F12 → Console → 아래 붙여넣기 → 출력 문자열 복사. 90일 유효. **반드시 그 환경 탭에서** — 현행 사이트(thinqreal.com) 탭의 토큰은 컨테이너에서 `bad_signature`.
```
copy(localStorage.getItem('thinqreal_admin_token'))
```
`copy(...)`는 따옴표 없이 클립보드에 넣는다. 화면에 찍힌 `'…'`를 드래그해 복사하면 **따옴표가 딸려와 `bad_signature`**가 난다(9/29 실사례). 붙여 넣은 토큰은 `eyJ`로 시작하고 따옴표·공백이 없어야 한다.

**로그인 순서(ST·QA)**: 시크릿 창 → 이메일 → [인증 코드 받기] **한 번** → 새 탭 peek → 6자리 입력. 코드를 본 뒤 [받기]를 다시 누르면 새 코드로 바뀜.

## C. 사내 클로드 프롬프트 (54번 폴더, 새 채팅)

| 상황 | 프롬프트 |
|---|---|
| 키트 적용(코드 파일 N개) | `키트 v<번호> 적용. 미러(57번 폴더)의 아래 파일을 Gitea src/ 같은 경로로 복사해줘: <파일 목록>. 커밋 메시지는 반드시 "<feat 또는 fix>: 키트 v<번호> — <한 줄>" (feat/fix 접두여야 빌드가 돎). push 명령은 git pull --rebase origin main && git push origin main 형태로 알려줘.` |
| configmap(env) 변경 | `<환경> configmap에 <KEY=VALUE …>를 추가/삭제해줘. 다른 키는 건드리지 마. configmap만 바뀌면 pod가 재시작되지 않으니 deploy/base/deployment.yaml pod template annotations의 thinqreal/config-rev 값을 +1 해서 같이 커밋해줘(없으면 "1"로 신설). 커밋 메시지 "chore: <내용>". push 명령 알려줘.` |
| 저장소 사실 확인(실행 없이) | `저장소 파일만 읽어서 답해줘(kubectl·LENS 없이). <질문>. 해당 줄을 인용해줘. 값(비밀값·주소·계정)은 마스킹.` |
| internal-context 갱신 | `internal-context.md §<번호>에 다음을 반영하고 커밋(docs:)해줘: <내용>. 값은 채팅에 적은 그대로.` |
| 막혔을 때 | `브리핑 §<번호> 기준으로 "<증상 문구 그대로>"가 났어. 원인 후보와 저장소에서 확인할 수 있는 것만 알려줘. 수정은 내 확인 후.` |

## D. 릴리스 후 확인 루틴 (매 키트 공통, 3분)

1. Gitea Actions에 `chore: release thinq-real <버전>` 커밋 생김.
2. `<HOST>/healthz` ×3 새로고침 — `version` 최신, `pod` 이름 교체, `authSecret:"db"`, `kv:"shared"`.
3. 키트가 env를 건드렸으면 `env_keys`로 키 이름 확인.
4. 외부 트랙에 보고: `healthz` JSON 한 줄 + 특이사항.

## E. 규칙 요약 (틀리기 쉬운 것)

- `docs:`·`chore:` 커밋은 **빌드 없음**. 코드 반영은 `feat:`/`fix:`.
- configmap만 바꾸면 **pod 재시작 없음** → 반드시 롤아웃 유발(config-rev 또는 코드 커밋).
- QA는 메일 없음(peek), SMTP 불가. ST는 메일 억제(콘솔). OP만 실발송.
- OP 호출은 토큰 필수, ST·QA는 SSO 뒤라 토큰 생략 가능(`env_keys`·`egress_check`·`db_probe`·`edge_sync_now`·`mail_test`).
- 사내 식별자·값은 GitHub 어디에도 적지 않음(internal-context만).
