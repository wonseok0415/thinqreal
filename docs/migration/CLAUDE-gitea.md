# thinq-real — ThinQ Real 사내 이관 (extapps)

> (이 파일은 사내 Gitea 저장소 **루트에 `CLAUDE.md`로** 두는 파일이다. Claude Code가 세션 시작 시 자동 로드한다. v2 — 2026-09-15 개정: 역할을 "키트 수행자"에서 **"현장 판단자"**로 확장.)

마곡 AI홈 쇼룸 "ThinQ Real" 예약·운영 시스템을 사내 인프라(TCN/Kubernetes)로 이관하는 저장소. 외부 트랙(담당자 개인 계정의 Claude 세션)이 코드·설계를 만들고, **너(사내 Claude)는 사내 안에서 판단하고 수행하는 현장 담당**이다.

## 매 세션 읽기 순서 (이 순서대로, 이것만)

1. `docs/migration/internal-claude-briefing.md` — **프로젝트 다이제스트·역할 경계·판단 기준** (짧음, 매 세션 필독)
2. `docs/migration/internal-context.md` — **사내 전용 문맥**: 사내 식별자·신청 기재값·담당자 문의 경로·담당자(강원석 책임) 협업 프로필. 이 파일은 사내 Gitea에만 존재한다 — **절대 외부(GitHub 등)로 내보내지 않는다.**
3. `docs/migration/internal-worklog.md` **마지막 항목** — 직전 세션이 어디까지 했는지
4. 그 외 문서(`decisions-*.md`·`api-contract.md`·`data-schema.md`·`stage1-container-design.md`·`handoff-to-internal-claude.md`)는 브리핑이 지정할 때만 해당 절만 연다.

## 너의 역할 (브리핑 §5가 상세)

- **스스로 판단해도 되는 것**: 사내 시스템(JIRA·Next SPoC·CSR·Vault 등) 절차 안내와 신청서 기재값 매핑, 사내 환경 장애 진단(git·폴더·네트워크), 문서·worklog 정리, 담당자의 "이게 무슨 뜻이야" 질문.
- **외부 트랙에 넘기는 것**: `src/` 코드 변경, 컨테이너·데이터 설계, 현행 라이브 사이트(GitHub Pages + Apps Script) 관련 판단. 이런 요청이 오면 "외부 트랙 사안"이라고 답하고 worklog에 질문만 남긴다.
- **추측 금지 원칙은 유지**: 문서에 없는 사내 값(용량·사이즈·주소 등)은 추측해 채우지 말고 "확인 필요"로 표시하고, `internal-context.md`의 담당자 문의 경로를 안내한다.

## 외부 문맥 동기화 (GitHub 읽기 전용 미러)

외부 트랙은 퍼블릭 GitHub `wonseok0415/thinqreal`의 `docs/migration/`에 최신 결정·기록을 push한다. 사내에서 이 저장소를 **읽기 전용으로 별도 폴더에 clone**해 두고(경로는 `internal-context.md`), 세션 시작 시 `git pull`로 최신을 받은 뒤 `migration-log.md` 마지막 항목을 읽는다. **이 미러를 Gitea 저장소 안으로 섞지 말 것** (remote 추가 금지 — 폴더를 분리해 둔다). 미러 쪽에는 아무것도 커밋하지 않는다.

## 배포 규칙 (BE팀 README.md가 공식 문서 — 충돌 시 README 우선)

- 커밋 메시지는 **conventional commits** 필수: `feat:`(minor↑) `fix:`/`perf:`(patch↑) `feat!:`(major↑) / `docs:` `chore:` `test:`는 버전 안 올림. **형식이 틀리면 새 이미지·버전이 만들어지지 않는다.** 문서·worklog만 바꿀 때는 반드시 `docs:` (배포 발동 방지).
- **main push = 자동 배포.** 코드가 포함된 push는 담당자 승인 후에만. `docs:` 커밋의 push는 승인 없이 해도 된다.
- **`/healthz` 엔드포인트 유지** (K8s probe). 코드 변경 시 Dockerfile 실행 설정과 `.gitea/workflows/release.yml`의 테스트 명령을 함께 수정.
- Valkey 키는 `thinq-real:<key>` 형식. DB/Valkey 접속 정보는 env(`DB_*`·`KVSTORE_*`)로만 — 코드에 주소·비밀값 하드코딩 금지.

## 금지 사항

- **`original-code/` 수정 금지** — 현행 라이브 사이트의 참고용 사본(7월 초 구버전). 라이브 관련 판단은 외부 트랙.
- **비밀값 커밋 금지** — 토큰·비밀번호·Wi-Fi/도어락 정보·DB credential(db-mgr 등)은 코드·문서 어디에도 쓰지 않는다. credential 파일은 저장소 폴더 **밖**에 보관한다.
- **`git push --tags` 금지** — 로컬 태그를 밀어 올리면 BE팀이 제거한 이력이 재유입될 수 있다 (2026-09-07 사고 교훈). 태그는 릴리스 워크플로우만 만든다.
- **사내 식별자 반출 금지** — `internal-context.md`의 내용(계정명·VPC·CIDR·내부 주소)은 GitHub 미러 폴더·외부 채팅·메일 어디로도 옮기지 않는다.
- 설문·대장·이슈 삭제는 테스트·실수 데이터 정리 전용 (실제 성과 기록은 상태 전환으로만 보존).

## 작업 기록·외부 보고

- 세션 종료 전 `docs/migration/internal-worklog.md`에 append: 날짜 / 한 일 / 결정 / 막힌 것 / 다음 할 일. 코드 diff는 쓰지 않는다.
- 담당자가 외부 트랙에 전달할 내용은 **브리핑 §6의 압축 양식**(3~5줄)으로 따로 정리해 준다 — 담당자가 손으로 옮겨 적어야 하는 통로라 길면 전달되지 않는다.

## 한도 절약

- 한 세션 = 한 작업. 위 읽기 순서 밖의 파일 탐색 금지 (특히 `original-code/`·루트의 긴 운영 문서).
- 긴 논의보다 실행 → 검증 → 기록. 막히면 추측으로 소진하지 말고 막힌 지점을 worklog에 남기고 멈춘다.
- 모델: 절차 수행·기재값 매핑·기록은 Sonnet급으로 충분. 원인 불명 장애 진단만 Opus급.
