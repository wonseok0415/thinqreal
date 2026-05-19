# ThinQ Real 운영관리 웹사이트

## 프로젝트 개요
- **공간**: 마곡 LG사이언스파크 W6동 1층, 30평형 AI홈 연구·쇼룸
- **운영 목적**: AI홈 쇼룸 지원 (B2B), 기술 연구·검증, 데이터 축적·고도화
- **호스팅**: GitHub Pages — 저장소 `wonseok0415/thinqreal` (루트 = 사이트 루트)
- **라이브 URL**: https://thinqreal.com
- **백엔드**: Google Apps Script + Google Sheets

## 디자인 시스템
- **스타일**: Apple HIG (Human Interface Guidelines)
- **폰트**: Inter
- **그리드**: 8pt 그리드, 44pt 터치 타깃
- **메인 컬러**: `--c-accent: #3a5035` (다크 올리브 그린)

## 파일 구조
리포 루트 = 사이트 루트 (GitHub Pages가 루트를 그대로 서빙).
```
/  (wonseok0415/thinqreal)
├── index.html                  # 메인 사이트 (홈/공간소개/예약/이용안내) — 사이트 루트 기본 진입 (구 `thinqreal.html`을 GitHub Pages 관례에 맞춰 리네임)
├── thinqreal_admin.html        # 관리자 대시보드 (8개 탭)
├── ThinQReal_AppScript.gs      # Google Apps Script 소스 (실제 배포는 script.google.com에서 관리)
├── ThinQ_Real_ROI_Tool.html    # ROI 분석 시뮬레이션 툴 (관리자 ROI 탭에서 iframe 임베드)
├── CNAME                       # `thinqreal.com` (GitHub Pages 커스텀 도메인)
├── .nojekyll                   # Jekyll 처리 비활성화 (정적 그대로 서빙)
├── README.md                   # 리포 개요
├── CLAUDE.md                   # 이 파일
└── images/                     # 이미지 (상대경로 참조)
    ├── thinqreal_*.png/jpeg    # 메인 사이트 이미지
    └── thinqreal_admin_*.png   # 관리자 페이지 이미지
```

## 이미지 경로 규칙
모든 이미지는 **상대경로**로 참조:
```
images/{파일명}
```

**중요**:
- 이미지를 추가하거나 수정할 때 base64로 HTML에 직접 삽입하지 말 것. 반드시 `images/` 폴더에 별도 파일로 저장하고 상대경로로 참조해야 함. (과거에 base64 삽입으로 HTML이 4.3MB까지 비대해진 이슈가 있었음)
- 절대 URL(`https://raw.githubusercontent.com/...`) 사용 금지. 사이트 루트가 곧 리포 루트이므로 `images/...` 상대경로로 충분하다.

## Google Apps Script 연동
| 항목 | 값 |
|------|-----|
| Sheets ID | `1-Z158TV46MtSEArir9bW4h4KQ438NCuhb3qaGyOooA0` |
| 시트 탭명 | `bookings` (변경 금지) |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbxqmzxbm99Fi9vrKgLxCslUwwEl8TxiyUN6LPMwimf04yjQjIO1s2tjC2jWKnR7iCSrSQ/exec` |
| 관리자 비밀번호 | `thinqreal2026` (3명 공유) |
| 담당자 알림 메일 수신 | 이철호(`ch275.lee@lge.com`), 서문수(`moonsu.seo@lge.com`), 김현진(`hj8462.kim@lge.com`) — 콤마 구분으로 일괄 발송 |
| CC 수신자 | `kang.wonseok@lge.com` (담당자 알림·예약자 메일 모두에 CC) |

### Apps Script 처리 엔드포인트
| 요청 | 처리 |
|------|------|
| `GET ?type=availability&date=YYYY-MM-DD` | 확정 슬롯 번호 배열 반환 |
| `GET ?type=bookings` | 전체 예약 목록 (관리자용) |
| `GET ?type=roi_snapshots` | ROI 시나리오 이력 목록 (최신순) |
| `GET ?type=mail_status` | 메일 발송 설정 + 남은 일일 할당량 (메일 미발송, 진단용) |
| `GET ?type=mail_test` | 테스트 메일 1통 발송 (실패 시 사유 응답) |
| `GET ?type=appliances` | 구비 가전 45개 목록 — `APPLIANCES` 상수의 단일 소스 |
| `POST type:booking` | Sheets 저장 + 담당자 알림 메일 |
| `POST type:update` | 상태 변경 + 예약자 확정/거절 메일 |
| `POST type:roi_snapshot` | ROI 시나리오 스냅샷 저장 (label/author/inputs/outputs) |
| `POST type:roi_delete` | ROI 시나리오 스냅샷 삭제 (id) |

### 예약자 메일 (sendGuestMail)
- **HTML + plain-text 동시 발송** — `MailApp.sendEmail({body, htmlBody})`로 두 버전을 함께 실음. HTML 클라이언트는 카드형 레이아웃, 평문 클라이언트는 평문을 받음.
- HTML은 **인라인 스타일만** 사용 (Gmail/Outlook 호환). 외부 리소스·`<style>` 블록·CSS 변수 사용 금지.
- 다크 올리브 헤더 + 라벨/값 그리드 카드형 디자인. 거절 메일도 동일 톤(헤더 색만 그레이).
- 정보 섹션 이모지 헤더: 📅 일정 / 📍 위치 / 📶 무선 인터넷(2.4G·5G 분리) / ☎ 문의(3명) / 📖 방문 안내(`GUIDE_URL`).
- **R&D 연구 목적이면** 구비 가전 표(HTML `<table>`)를 본문에 첨부 → 브라우저 폭이 좁아져도 칼럼 정렬 유지. 표 아래 안내 문구: "연구 목적의 방문에 도움이 되시도록 구비 가전 정보를 함께 안내드립니다. (R&D 연구 목적으로 예약하신 분께만 발송됩니다.)"
- 빌더: `buildConfirmText` / `buildConfirmHtml` / `buildRejectText` / `buildRejectHtml` / `buildAppliancesText` / `buildAppliancesHtml` / `escapeHtml`

### Sheets 탭 구성
- `bookings` (예약, 변경 금지)
- `roi_snapshots` (ROI 시나리오 이력) — 컬럼: `id`, `timestamp`, `label`, `author`, `inputs(JSON)`, `outputs(JSON)`
  - 시트가 없으면 Apps Script가 첫 호출 시 자동 생성

## 예약 슬롯 (확정, 변경 금지)
| 구분 | 시간 | 비고 |
|------|------|------|
| 1회차 | 09:00–10:30 | 90분 |
| 재정비 | 10:30–11:00 | |
| 점심 | 11:30–13:00 | 예약 불가 |
| 2회차 | 13:00–14:30 | 90분 |
| 재정비 | 14:30–15:00 | |
| 3회차 | 15:00–16:30 | 90분 |

## 메인 사이트 구성 (index.html)
- **홈**: AI홈 쇼룸 지원 → 기술 연구 및 검증 → 데이터 축적 및 고도화 카드 (이 순서 유지)
- **공간 소개**: 01 거실 → 02 주방 → 03 침실 → 04 런드레스룸 → 05 욕실 → 06 현관·복도
- **예약하기**: 달력 → 슬롯 다중 선택(Set 방식 토글) → 폼 → Apps Script POST
- **이용 안내**: 무선 인터넷 → 유의사항(5개 카테고리 그룹) → 기타 이용 안내 → 주차 안내 → 담당자
  - 구비 가전 테이블은 관리자 전용으로 이관됨 (R&D 연구 목적 예약 확정 메일에는 별도로 첨부)

## 관리자 대시보드 탭 (thinqreal_admin.html)
**관리 섹션**
1. 📋 예약 관리 (KPI 카드, 필터, 테이블, 승인/거절, CSV 내보내기)
2. 📊 통계
   - 방문 목적별 바 차트 — `PURPOSE_COLORS` 결정적 매핑으로 목적별 고정 색상 (R&D=올리브, B2B=오렌지, 내부 행사=퍼플, Press Tour=틸, 기타=올리브-mid). 막대 옆 컬러 도트로 시각 인식 보조.
   - 회차별 바 차트
   - 월별 방문 건수 **누적 세로 막대** — 목적별 세그먼트를 한 막대에 쌓음. 카드 상단에 색상 범례. 호버 시 `목적: N건` 툴팁.
3. 🔐 연동 계정 정보 (마스킹 없이 직접 표시, 복사 버튼)
4. 🎬 시연 시나리오 (9개 시나리오 카드)
5. 💡 조명 스위치 안내 (공간별 카드)
6. ⚙️ 시스템 구성 (조명/Homey/ThinQ/난방 카드)
7. 📦 구비 가전 (45개 품목 — 관리자 전용, Apps Script `?type=appliances`에서 fetch 후 메모리 캐시)

**분석 섹션**
8. 📈 ROI 분석 — `ThinQ_Real_ROI_Tool.html`을 iframe으로 임베드 (지연 로드, "새 창에서 열기" 버튼 제공)
   - ROI 툴 내부에 **시나리오 스냅샷 저장/불러오기** 패널 포함 (Apps Script `roi_snapshots` 탭 연동)
   - iframe 하단에 **분석 툴 동작 원리** 설명 패널: BEP / 연간가치 / N년 ROI 산식 박스, V_R&D · V_Sales(A) · V_Sales(B) · V_PR · 비용 구조 · 해석 가이드 6개 카드. 수식 폰트는 Cambria Math 17px / 15.5px (첨자 0.7em baseline 보정).

### 데이터 로딩 — Stale-while-revalidate
`loadData()`는 첫 진입 시:
1. localStorage의 마지막 응답(`thinqreal_bookings_v1`, TTL 30분)으로 **즉시 화면 렌더** — 빈 화면 시간 ≈ 0
2. 동시에 백그라운드에서 `?type=bookings` fresh fetch → 응답 도착하면 캐시 갱신 + 활성 탭 재렌더 + toast 알림

Apps Script 콜드 스타트(1~3초) 자체는 서버 측 제약이라 완전히 없앨 수 없음. 첫 방문(캐시 없음)에서 보이는 회전 스피너 + "Apps Script 콜드 스타트로 1~3초 걸릴 수 있습니다" 메시지가 정상 동작.

## 담당자
| 이름 | 직급 | 이메일 |
|------|------|--------|
| 이철호 | 책임 | ch275.lee@lge.com |
| 서문수 | 선임 | moonsu.seo@lge.com |
| 김현진 | 선임 | hj8462.kim@lge.com |

## 미완료 작업 (TODO)
- [x] **공간 소개에 욕실 추가** — `thinqreal_bathroom.jpg` 사용 (PDF p.16-17에서 추출, room-list 05번에 배치하고 현관·복도를 06번으로 이동)
- [x] **이용 안내 — 유의사항 업데이트** (PDF 슬라이드 5)
  - 카테고리별 그룹(공통/가전/공간/욕실/ThinQ)으로 재구성
  - Wi-Fi 정보: SSID `LGE_AI_HOME_2.4G` / `LGE_AI_HOME`, PW `real2026`
- [x] **이용 안내 — 기타 이용 안내 섹션 추가** (PDF 슬라이드 6)
  - 수압, 촬영, 창호, 조리, 침대, 욕실 이용 시 유의사항
- [x] **이용 안내 — 구비 가전 품목 테이블 추가** (PDF 슬라이드 7, 총 45개 품목) — 제조사 컬럼 포함
- [x] **욕실 이미지 GitHub 업로드** — `images/thinqreal_bathroom.jpg` 업로드 완료 (라이브 확인됨)
- [x] **GitHub Pages 배포** — `wonseok0415/wonseok-lab` 하위경로(`/wonseok-lab/thinqreal/`)로 1차 서빙 완료. 이후 `wonseok0415/thinqreal` 루트 + `thinqreal.com`으로 이전됨 (아래 "완료 내역 — 도메인 이전" 참조).
- [x] **이미지 파일명 재정리** — 해시 기반 → 의미있는 이름으로 일괄 변경 (아래 매핑 표 참조)

### 이미지 파일명 매핑 (2026-05-18 정리)
| 신규 파일명 | 용도 |
|------------|------|
| `thinqreal_home_hero.png` | 홈 페이지 메인 히어로 |
| `thinqreal_about.png` | 홈 About 섹션 (split-media) |
| `thinqreal_space_hero.jpeg` | 공간 소개 페이지 히어로 |
| `thinqreal_living_room.png` | 01 거실 |
| `thinqreal_kitchen.png` | 02 주방 |
| `thinqreal_bedroom.png` | 03 침실 |
| `thinqreal_laundress_room.png` | 04 런드레스룸 |
| `thinqreal_bathroom.jpg` | 05 욕실 |
| `thinqreal_entrance_corridor.png` | 06 현관·복도 |
| `thinqreal_guide_hero.png` | 이용 안내 페이지 히어로 |
| `thinqreal_admin_lighting.png` | 관리자 — 조명 스위치 안내 슬라이드 |
| `thinqreal_admin_system.png` | 관리자 — 시스템 구성 슬라이드 |

## 작업 시 주의사항
- 이미지는 절대 base64로 HTML에 삽입하지 말 것 (반드시 별도 파일 + GitHub URL)
- Apps Script URL과 Sheets ID는 절대 변경하지 말 것 (배포 완료 상태)
- 슬롯 시간표는 확정된 것이므로 변경 금지
- 디자인 시스템(Apple HIG, 다크 올리브 그린 #3a5035) 유지

## 알아두면 좋은 것
| 상황 | 재작업 필요 여부 |
|------|----------------|
| 드라이브 폴더 이동 | ✕ 불필요 (SHEET_ID 불변) |
| 시트 파일명 변경 | ✕ 불필요 |
| 탭명 "bookings" 변경 | ✓ Apps Script `SHEET_NAME` 수정 필요 |
| 시트 삭제 후 재생성 | ✓ SHEET_ID 전체 교체 필요 |
| Apps Script 재배포 | ✓ 새 URL을 두 HTML 파일에 재입력 필요 |

## 최근 작업 내역 (2026-05-17 ~ 2026-05-18)

PDF `ThinQ Real_User Guide_260507_v3.pdf`(21p, 1.87MB)의 슬라이드 5~7, 16~17을 기반으로 `thinqreal.html`을 대폭 보강함.

### 1) 공간 소개 — 욕실 추가
- 새 `room-row` 블록을 런드레스룸 다음에 삽입 (번호 05)
- 기존 현관·복도는 번호 06으로 재배치
- 이미지: `images/thinqreal_bathroom.jpg` (PDF p.16 Image82 추출, 1142×762, 57KB)
- appliance-chip: 바스에어(듀얼 배기), 스마트 수전, 온습도 센서, 재실 센서, 다운라이트, 간접조명

### 2) 유의사항 — 카테고리 그룹 재구성
- 평탄 리스트(10개) → 5개 카테고리 그룹으로 재구성
- 그룹: **공통(기본 유의사항) / 가전(가전·IoT·소품) / 공간(커튼·창호·가구·전기) / 욕실(화장실·슬리퍼) / ThinQ(계정·홈초대)**
- 새 CSS 클래스 도입: `.caution-group`, `.caution-group-header`, `.caution-cat`, `.caution-cat-sub`, 리스트 아이템에 `.note` 서브텍스트
- Wi-Fi: SSID `LGE_AI_HOME_2.4G` / `LGE_AI_HOME`, PW `real2026`

### 3) 기타 이용 안내 섹션 신설
- PDF 슬라이드 6 기반 6개 항목: 수압, 촬영, 창호, 조리, 침대, 욕실 이용
- 위치: 유의사항 다음, 구비 가전 테이블 이전

### 4) 구비 가전 테이블 확장
- 27개 → **45개 품목**으로 확장 (PDF 슬라이드 7 전체 반영)
- **제조사 컬럼 추가**
- 주요 추가: ThinQ ON(HMAK4W.AKOR), 보이스컨트롤러(HAAL3W.AKOR), AP(Unifi U7-Pro-XG), 스마트버튼×2, 도어센서, 모션조도센서, 스마트플러그, 스마트도어락, 전동창호×2, 월패드, 온도조절기, 전동커튼 등

### 핵심 제약 (다음 세션에서도 유지)
- 구비 가전 45개 순서는 PDF 슬라이드 7 그대로 유지 (재정렬 금지)
- 유의사항 카테고리 5개 그룹 구조는 PDF 기준이므로 임의 통합·분리 금지

## 작업 내역 (2026-05-19 세션)

### A. 예약 확정 메일 개편 (Apps Script — 재배포 필요)
- 평문 → **HTML + plain-text 동시 발송** 구조로 전환 (`htmlBody` + `body`)
- 카드형 레이아웃, 정보 섹션을 이모지 헤더로 정렬 (📅 📍 📶 ☎ 📖 📦)
- 무선 인터넷 **2.4 GHz / 5 GHz 분리** 표기 (PW `real2026`)
- 문의 담당자 **3명 모두** 표기 + `mailto:` 링크
- `GUIDE_URL` (이용 안내 페이지 `#page-guide` 앵커) 카드형 링크
- **R&D 연구 목적** 예약자 한정으로 구비 가전 표(HTML `<table>`) 본문 첨부 — 좁은 화면에서도 칼럼 정렬 유지
- 가전 표 아래 부드러운 안내 문구: "연구 목적의 방문에 도움이 되시도록 구비 가전 정보를 함께 안내드립니다."
- 거절 메일도 동일 톤(헤더만 그레이)으로 정렬

### B. 구비 가전 데이터 단일 소스 통합
- 메인 사이트(`thinqreal.html`)의 구비 가전 테이블 **제거** — 일반 방문자 화면에서 빠짐
- 관리자에 📦 구비 가전 탭 신설 (사이드바 "관리" 섹션)
- Apps Script에 `APPLIANCES` 상수 신설 + `GET ?type=appliances` 엔드포인트 노출
- 관리자 페이지는 첫 진입 시 엔드포인트 fetch + 메모리 캐시
- → 가전 추가·변경 시 **Apps Script 한 곳만** 수정하면 메일·관리자 동시 갱신

### C. 통계 차트 개선
- `PURPOSE_COLORS` 결정적 매핑으로 목적별 고정 색상 (위 §관리자 §2 참조)
- 막대 옆 컬러 도트(`::before` 의사 요소 + CSS 변수)
- 월별 방문 건수: 단색 → **목적별 누적 세로 막대** + 색상 범례
- `.month-bar-wrap` (영역) / `.month-bar` (실제 막대) / `.month-segment` (목적별 세그먼트) 3단 구조

### D. ROI 분석 — 동작 원리 설명 패널
- iframe 하단에 신설: BEP / 연간 창출 가치 / N년 ROI 산식 박스
- 6개 카드: 비용 구조 · V_R&D · V_Sales(A) · V_Sales(B) · V_PR · 해석 가이드
- 수식 폰트: SF Mono(12.5–14px) → **Cambria Math 17px / 15.5px**, 첨자 0.7em + baseline 보정으로 가독성 개선

### E. 초기 로딩 — Stale-while-revalidate 캐시
- localStorage 캐시(`thinqreal_bookings_v1`, TTL 30분) + 회전 스피너 UI (위 §관리자 §데이터 로딩 참조)

### 관련 PR
- #15 (8b958a8 — 메일 개편 초안 + 구비 가전 이관 + ROI 동작 원리 초안) — 머지 완료
- #16 (968eb77 + 68c1806 + 22dc358 — 단일 소스 통합 / 폰트 가독성 / 메일 HTML + 통계 색상·누적 + 캐시) — PR #15가 첫 커밋만 머지된 채 닫혀 후속 3건이 누락되어 후속 PR로 분리. 머지 후 Apps Script 재배포 필요.

## 다중 기기 작업 환경
- 이 프로젝트는 맥북 외부(iPhone/iPad/회사 PC)에서도 작업 필요
- 권장 워크플로우: 로컬 수정 → GitHub push → 다른 기기는 `claude.ai/code`(웹)에서 같은 repo 연결하여 이어서 작업
- 새 세션은 이 `CLAUDE.md`를 자동 로드 → 프로젝트 맥락은 유지되나, **개별 채팅 히스토리는 세션 간 이동되지 않음**
- 중요한 결정/변경은 이 파일에 즉시 기록할 것

### 구형 iPad + 셀룰러에서 Claude Code 웹을 쓸 때
사용자 환경: 구형 iPad(Claude 앱 미지원) + 회사 셀룰러 데이터.

**증상**: 타이머는 흘러가는데 응답 내용이 비어 있다가, 브라우저 새로고침을 하면 그동안의 출력이 한꺼번에 나타남.

**원인 요지**: 이통사 미들박스의 유휴 연결 타임아웃 + 구형 Safari의 SSE/스트림 처리 한계로, 서버 측 출력은 계속 진행되지만 클라이언트로의 통로가 조용히 끊김. 새로고침으로 재접속하면 서버에 버퍼된 결과를 다시 받아오는 패턴.

**대응(효과 순)**:
1. **Wi-Fi 우선 사용** — 캐리어 미들박스 자체를 우회
2. iOS 설정 → 셀룰러 → "데이터 절약 모드(Low Data Mode)" 끄기
3. Claude Code 탭을 **포그라운드로 유지** (다른 앱 전환·잠금 금지)
4. VPN (Cloudflare WARP 등) — 미들박스 우회 효과
5. **새로고침을 정상 도구로 활용** — 세션은 서버에 보존되므로 진행 상황이 사라지지 않음. 응답이 오래 멈췄다 싶으면 새로고침하여 재접속
6. 긴 작업은 **GitHub Actions** 트리거로 비동기 실행 (https://code.claude.com/docs/en/claude-code-on-the-web)

## 완료 내역 — 도메인 이전 (2026-05-19)

ThinQ Real을 독립 도메인 `thinqreal.com`(hosting.kr 구입)으로 이전. 기존 `wonseok-lab/thinqreal/` 하위 경로 구조가 `thinqreal.com/thinqreal/thinqreal.html`처럼 지저분해지는 문제를 해결하기 위해, 별도 리포 `wonseok0415/thinqreal`을 만들어 **리포 루트 = 사이트 루트** 구조로 분리했다.

### 결정된 사항
- **도메인**: `thinqreal.com` (hosting.kr 구입)
- **신규 리포**: `wonseok0415/thinqreal` (루트 = 사이트 루트)
- **옛 경로 방침**: 옛 `wonseok-lab/thinqreal/`은 당분간 그대로 둠 (옛 북마크 사용자 대비). 추후 stub 리다이렉트 또는 삭제 여부는 운영하면서 재결정.

### 단계별 체크리스트 (이 PR 시점 기준)
1. [x] hosting.kr에서 `thinqreal.com` 구매
2. [x] GitHub에서 `wonseok0415/thinqreal` 신규 리포 생성
3. [x] Claude App에 신규 리포 접근 권한 부여
4. [x] Claude Code 웹에서 신규 리포로 새 세션 시작
5. [x] `wonseok-lab/thinqreal/` 폴더 전체를 신규 리포 루트로 이전
   - `thinqreal.html`, `thinqreal_admin.html`, `ThinQReal_AppScript.gs`, `ThinQ_Real_ROI_Tool.html`, `CLAUDE.md`, `images/` 통째로 복사
   - **이미지 경로 일괄 교체**: `https://raw.githubusercontent.com/wonseok0415/wonseok-lab/main/thinqreal/images/` → `images/` (HTML/GS/MD 전체에서 잔존 0건 확인)
   - 본 `CLAUDE.md`의 "파일 구조" / "이미지 경로 규칙" / "호스팅" 섹션을 신규 리포 기준으로 갱신
6. [x] `CNAME` (`thinqreal.com`) + `.nojekyll` 파일 추가
7. [ ] 신규 리포 Settings → Pages → Source: `main` / `(root)` 선택 → 임시 주소(`wonseok0415.github.io/thinqreal/`)로 동작 확인 — **PR 머지 후 진행**
8. [ ] hosting.kr DNS 레코드 추가 — **PR 머지 후 진행**:
   ```
   A    @    185.199.108.153
   A    @    185.199.109.153
   A    @    185.199.110.153
   A    @    185.199.111.153
   CNAME www  wonseok0415.github.io
   ```
9. [ ] 신규 리포 Settings → Pages → Custom domain: `thinqreal.com` → Save (이미 커밋된 `CNAME` 파일을 GitHub Pages가 인식)
10. [ ] DNS 전파 후 Enforce HTTPS 체크
11. [ ] **Apps Script `GUIDE_URL` 교체**: `https://wonseok0415.github.io/wonseok-lab/thinqreal/thinqreal.html#page-guide` → `https://thinqreal.com/#page-guide` → **Apps Script 재배포**
12. [x] 본 CLAUDE.md를 "완료 내역"으로 정리하고 호스팅 정보 신규 도메인 기준으로 갱신

### 주의사항 (이전 후에도 유지)
- Apps Script URL, Sheets ID, 슬롯 시간표, 디자인 시스템은 **불변** (기존 §작업 시 주의사항 참조)
- Apps Script 자체는 그대로 사용 (URL 변경 없음). `GUIDE_URL`만 교체 + 재배포 1회 필요.
- 이전 후 이미지가 깨져 보이면 절대 URL 잔존 흔적이므로 `grep -rE 'raw\.githubusercontent\.com/wonseok0415/wonseok-lab'`로 검색해 모두 상대경로로 교체할 것.
