# thinq-real — ThinQ Real 사내 이관 (extapps)

> (이 파일은 사내 Gitea 저장소 **루트에 `CLAUDE.md`로** 두는 파일이다. Claude Code가 세션 시작 시 자동 로드한다.)

마곡 AI홈 쇼룸 "ThinQ Real" 예약·운영 시스템을 사내 인프라(TCN/Kubernetes)로 이관하는 저장소.
외부에서 완성·검증된 Node.js 컨테이너(`server/`)를 이 저장소의 규칙에 맞춰 이식하는 작업이 진행 중이다.

## 작업 지침 (모든 세션 필수)

- **진입점**: `docs/migration/handoff-to-internal-claude.md` — 모든 작업은 이 브리핑의 절대 규칙(§4)과 과제 순서(§5)를 따른다. 새 세션은 이 파일부터 읽을 것. 브리핑과 문서에 없는 것은 추측하지 말고 담당자에게 물어본다.
- **진행 기록**: 세션 종료 전 `docs/migration/internal-worklog.md`에 반드시 append — 날짜 / 한 일 / 결정 / 막힌 것 / 다음 할 일. 이 파일이 외부 트랙(개인 계정 Claude)과의 유일한 연락 통로다. 코드 diff는 쓰지 말고 요약만.
- **push 전 승인**: main push = 자동 배포다. 변경 요약을 담당자(강원석 책임)에게 보여주고 승인받은 뒤에만 커밋·push한다.

## 배포 규칙 (BE팀 README.md가 공식 문서 — 충돌 시 README 우선)

- 커밋 메시지는 **conventional commits** 필수: `feat:`(minor↑) `fix:`/`perf:`(patch↑) `feat!:`(major↑) / `docs:` `chore:` `test:`는 버전 안 올림. **형식이 틀리면 새 이미지·버전이 만들어지지 않는다.**
- **`/healthz` 엔드포인트 유지** (K8s readiness/liveness probe 사용).
- 코드 변경 시 **Dockerfile 실행 설정과 `.gitea/workflows/release.yml`의 테스트 명령을 함께 수정**한다. 새 의존성은 Dockerfile 설치 + release workflow의 테스트 전 설치에 반영.
- Valkey 키는 `thinq-real:<application-defined-key>` 형식. DB/Valkey 접속 정보는 env(`DB_*`·`KVSTORE_*`)로만 — 코드에 주소·비밀값 하드코딩 금지.

## 금지 사항

- **`original-code/` 수정 금지** — 현행 라이브 사이트(GitHub Pages + Apps Script)의 참고용 사본일 뿐, 여기서 고쳐도 라이브에 반영되지 않는다. 라이브 관련 판단은 외부 트랙 담당.
- **비밀값 커밋 금지** — 토큰·비밀번호·Wi-Fi/도어락 정보·CS 채널 단가 등은 코드·문서 어디에도 쓰지 않는다 (env/SealedSecret 주입).
- **설문·대장·이슈 데이터에 행 삭제 기능 추가 금지** — 드롭/기각은 상태 전환으로만 (감사 추적 보존).

## 한도 절약 (사용량 작은 계정 — 중요)

- 한 세션 = 한 과제 (브리핑 §5의 A→B→C→D 순서).
- 브리핑 §3 파일 지도가 지정한 파일 외에는 열지 않는다. 특히 `original-code/`는 기본적으로 읽지 않는다.
- 긴 논의 없이 구현 → 검증 → worklog 기록 → 종료. 막히면 추측으로 소진하지 말고 막힌 지점을 worklog에 기록하고 멈춘다.
