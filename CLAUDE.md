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
| `POST type:booking_delete` | 예약 행 영구 삭제 (id). **메일 미발송** (테스트·실수 데이터 정리용) |
| `POST type:roi_snapshot` | ROI 시나리오 스냅샷 저장 (label/author/inputs/outputs) |
| `POST type:roi_delete` | ROI 시나리오 스냅샷 삭제 (id) |

### 예약자 메일 (sendGuestMail)
- **HTML + plain-text 동시 발송** — `MailApp.sendEmail({body, htmlBody})`로 두 버전을 함께 실음. HTML 클라이언트는 카드형 레이아웃, 평문 클라이언트는 평문을 받음.
- HTML은 **인라인 스타일만** 사용 (Gmail/Outlook 호환). 외부 리소스·`<style>` 블록·CSS 변수 사용 금지.
- 다크 올리브 헤더 + 라벨/값 그리드 카드형 디자인. 거절 메일도 동일 톤(헤더 색만 그레이).
- 정보 섹션 이모지 헤더: 📅 일정 / 📍 위치 / 📶 무선 인터넷(2.4G·5G 분리) / 🔐 도어락 비밀번호 / ☎ 문의(3명) / 📖 방문 안내(`GUIDE_URL`).
- **민감 정보는 메일에만**: 무선 인터넷 SSID/PW와 도어락 비밀번호는 예약 확정 메일에만 노출. 메인 사이트(`index.html`)에는 표시하지 않음 — 일반 공개 페이지 노출 시 보안 위험.
- 현재 값(2026-05-23 갱신): SSID `ThinQ_REAL_2.4G` / `ThinQ_REAL`, PW `real2026`. 도어락 PIN `56720275`.
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
  - 슬롯별 상태 3종: **예약 마감**(확정 1건 이상, 클릭 불가, 적색) · **N팀 예약 중**(대기중만 N건, 클릭 가능하되 주황 톤으로 경합 안내) · **선택 가능**(아무 예약 없음). `?type=availability`가 `{ bookedSlots, pendingCounts }` 형태로 반환.
- **이용 안내**: 유의사항(5개 카테고리 그룹) → 기타 이용 안내 → 주차 안내 → 담당자
  - 기타 이용 안내·주차 안내도 유의사항과 동일한 **`.caution-group` 카드**로 구성 — 헤더(`caution-cat` + `caution-cat-sub`) + 불릿 목록(항목 본문 + 아래 `.note` 설명). 구 평탄 `.guide-list`는 제거됨.
  - 구비 가전 테이블은 관리자 전용으로 이관됨 (R&D 연구 목적 예약 확정 메일에는 별도로 첨부)
  - 무선 인터넷 SSID/PW와 도어락 비밀번호는 메인 페이지에 노출하지 않고 **예약 확정 메일에서만** 안내 (보안)

## 관리자 대시보드 탭 (thinqreal_admin.html)
**관리 섹션**
1. 📋 예약 관리 (KPI 카드, 필터, 테이블, 승인/거절, CSV 내보내기)
2. 📊 통계
   - 방문 목적별 바 차트 — `PURPOSE_COLORS` 결정적 매핑으로 목적별 고정 색상 (R&D=올리브, B2B=오렌지, 내부 행사=퍼플, Press Tour=틸, 기타=올리브-mid). 막대 옆 컬러 도트로 시각 인식 보조.
   - 회차별 바 차트
   - 월별 방문 건수 **누적 세로 막대** — 목적별 세그먼트를 한 막대에 쌓음. 카드 상단에 색상 범례. 호버 시 `목적: N건` 툴팁.
3. 🔐 연동 계정 정보 (마스킹 없이 직접 표시, 복사 버튼)
4. 🎬 시연 시나리오 (9개 시나리오 카드)
5. 💡 조명 스위치 안내 (공간별 카드) — 욕실(내부)은 3구 스위치 중 2구만 사용 (주 조명·간접조명 ON/OFF, 3번째는 미사용)
6. ⚙️ 시스템 구성 (조명/Homey/ThinQ/난방 카드)
7. 📦 구비 가전 (45개 품목 — 관리자 전용, Apps Script `?type=appliances`에서 fetch 후 메모리 캐시)

**분석 섹션**
8. 📈 ROI 분석 — `ThinQ_Real_ROI_Tool.html`을 iframe으로 임베드 (지연 로드, "새 창에서 열기" 버튼 제공)
   - ROI 툴 내부에 **시나리오 스냅샷 저장/불러오기** 패널 포함 (Apps Script `roi_snapshots` 탭 연동)
   - 스냅샷 라벨이 ISO 8601 타임스탬프(`2026-05-18T00:00:00.000Z`)면 표시 시점에 `YYYY-MM-DD 시나리오`로 자동 변환 (`prettyScenarioLabel`). 시트 데이터는 그대로 유지.
   - iframe 하단에 **분석 툴 동작 원리** 설명 패널: BEP / 연간가치 / N년 ROI 산식 박스, V_R&D · V_Sales(A) · V_Sales(B) · V_PR · 비용 구조 · 해석 가이드 6개 카드. 수식 폰트는 Cambria Math 17px / 15.5px (첨자 0.7em baseline 보정).
   - iframe 캐시 무력화: `ROI_BUILD` 상수에 빌드 토큰을 두고 `ThinQ_Real_ROI_Tool.html?v={token}`로 부착. ROI 툴 갱신 시 토큰을 올려야 사용자가 새 버전을 받음.

### 모바일 반응형 (≤900px / ≤768px / ≤480px)
- **사이드바 토글**: 좌상단 부유 `☰` 버튼.
  - 데스크탑: 240px ↔ 64px(아이콘만) 토글. 상태는 localStorage(`thinqreal_admin_sidebar_collapsed`)에 영속화 → 재방문 시 자동 복원.
  - 모바일(≤768px): 오프캔버스 드로어. 배경 백드롭 또는 네비 항목 탭으로 자동 닫힘.
  - 토글 버튼은 데스크탑 expanded 상태에서만 `left:188px`로 사이드바 우측 안쪽에 위치, 그 외에는 `left:12px`.
- **그리드**: KPI 4→2(≤1024)→1(≤480), 통계 2→1(≤900) + wide-card span 해제, 시연/조명/시스템 카드 → 1열(≤900).
- **표**: `.table-card`가 `overflow-x:auto`로 변경, booking 680px / accounts 560px `min-width` 보장 → 좁은 화면에서 가로 스와이프로 모든 컬럼 확인.
- **메인 패딩**: 40px → 24px(≤900) → 20px(≤768) → 16px(≤480).
- **메인 사이트 내비바**: ≤900px에서 `overflow-x:auto` + `flex-shrink:0`로 항목 압축 없이 가로 스와이프 가능. `navbar-spacer`는 모바일에서 `display:none`.

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
  - Wi-Fi 정보는 2026-05-23 보안 정책 강화로 메인 페이지에서 제거 → 예약 확정 메일에서만 노출 (SSID `ThinQ_REAL_2.4G` / `ThinQ_REAL`, PW `real2026`)
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
- 관리자 사이드바 collapsed 상태 키: `thinqreal_admin_sidebar_collapsed` (localStorage). 디버그용으로 수동 초기화 가능.
- ROI 툴 갱신 시 `thinqreal_admin.html`의 `ROI_BUILD` 토큰을 반드시 올릴 것 (`?v={token}` 캐시 키). 안 올리면 GitHub Pages/iframe 캐시로 사용자가 옛 버전을 받음.

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

## 작업 내역 (2026-05-19 후속 — 모바일 반응형)

도메인 이전 직후, 아이폰17 등 모바일에서의 UI 문제를 정리하는 후속 세션. 메인·관리자 양쪽 모두 모바일 대응이 거의 없던 상태였다.

### A. 메인 페이지 내비바 가로 스크롤 (index.html, 커밋 `8de10bd`)
- 증상: 모바일에서 `홈 / 공간 소개 / 예약`까지만 보이고 `이용 안내 / 관리자 / 예약 신청`이 잘림.
- 원인: `.navbar-links`와 `.navbar-spacer` 둘 다 `flex:1`이라 고정폭 컨테이너 안에서 서로 공간을 먹다 항목이 밀려남.
- 처방(≤900px): `.navbar { overflow-x:auto; -webkit-overflow-scrolling:touch }` + 자식 모두 `flex-shrink:0` + `.navbar-links { flex:0 0 auto }` + `.navbar-spacer { display:none }` + 스크롤바 숨김. 가로 스와이프로 끝까지 확인 가능.

### B. 관리자 페이지 반응형 + 사이드바 토글 (thinqreal_admin.html, 커밋 `b4284e2`)
- 증상: 관리자 페이지에 `@media` 블록이 0개였음 → 모바일에서 240px 사이드바가 본문을 짓누르고 표가 화면 밖으로 흘러나감.
- 처방:
  - **사이드바 토글** 신설. 위 §관리자 §모바일 반응형 참조. 데스크탑은 240↔64 collapse(localStorage 영속화), 모바일은 오프캔버스 드로어 + 백드롭.
  - **CSS 변수 도입**: `:root` → `.shell { --sidebar-w: 240px }`, collapsed 시 64px, 모바일 시 0px. `.sidebar { width: var(--sidebar-w) }`, `.main { margin-left: var(--sidebar-w) }`로 단일 소스 제어.
  - **그리드 반응형**: KPI 4→2→1, 통계 2→1, 메인 패딩 단계적 축소.
  - **표 가로 스크롤**: `.table-card`의 `overflow:hidden` → `overflow-x:auto`로 변경. `.booking-table`에 `min-width:680px`, `.accounts-table`에 `min-width:560px`로 컬럼 폭 보장.
  - **ROI iframe**: 메인 패딩 축소 효과로 자동 풀폭. iframe 내부도 ≤600px에서 본문 패딩만 추가로 축소.

### C. 카드 1열 + 데이터 보정 + ROI 라벨 (커밋 `03ae2e4`)
- 시연 시나리오 / 조명 스위치 안내 / 시스템 구성 — 모바일(≤900px)에서 모두 1열로. 카드 본문이 더 이상 끊기지 않고 가로 폭을 다 씀.
- **욕실(내부) 조명 카드 보정**: PDF 스위치 슬라이드에는 주 조명 ON/OFF, 간접조명 ON/OFF, 3번 미사용으로 그려져 있는데 카드에는 `기능 없음`만 단독 표시되던 문제. 실제 슬라이드와 일치하도록 3줄로 펼침.
- **ROI 스냅샷 라벨 변환**: 라벨이 ISO 8601 타임스탬프 패턴(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}`)이면 표시 시점에 `YYYY-MM-DD 시나리오`로 변환 (`prettyScenarioLabel` 헬퍼). 시트 데이터는 그대로 두고 표시만 친화 포맷.
- `ROI_BUILD` 토큰 `20260518a` → `20260519a` 올려서 iframe 캐시 무력화.

### 핵심 제약 (다음 세션에서도 유지)
- 모바일 사이드바 토글 버튼(좌상단 부유 `☰`)은 위치·z-index를 유지할 것. 페이지 헤더 `h1`이 가려지지 않도록 `.main`의 `padding-top:64px`(모바일) 도 함께 유지.
- 욕실(내부) 카드의 "3구 미사용" 표기는 실제 스위치 하드웨어 사양이므로 임의 삭제 금지.

## 작업 내역 (2026-05-23 — 보안 정보 메일 이관 + 대기 인원 표시)

### A. 무선 인터넷 정보를 메인 페이지에서 제거
- `index.html`의 이용 안내 페이지 하단 "무선 인터넷" 섹션 통째 제거 (`.guide-section` + `.wifi-card`).
- 더 이상 사용되지 않는 `.wifi-card` CSS 규칙도 함께 삭제.
- 이유: 일반 공개 페이지에 SSID/PW를 노출하지 않기 위함. 실제 방문이 확정된 사람에게만 메일로 안내.

### B. SSID 갱신 + 도어락 비밀번호 메일 추가 (Apps Script — 재배포 필요)
- SSID 변경: `LGE_AI_HOME_2.4G` → `ThinQ_REAL_2.4G`, `LGE_AI_HOME` → `ThinQ_REAL`. PW `real2026` 유지.
- 🔐 도어락 비밀번호 행 신설 — 무선 인터넷 다음, 문의 이전. 값 `56720275` (메인 페이지에는 반영 금지).
- `buildConfirmText` / `buildConfirmHtml` 양쪽 모두 갱신.

### C. 동일 회차 대기 인원 안내 (Apps Script + index.html)
- `?type=availability` 응답 스키마 확장:
  ```
  { bookedSlots: [확정된 회차들], pendingCounts: { 회차: 대기건수, ... } }
  ```
  기존 `bookedSlots` 키는 그대로 유지 (하위 호환).
- 메인 페이지 슬롯 카드 상태가 3종으로 분기:
  - **예약 마감** (확정 1건 이상) — 적색, 클릭 불가
  - **N팀 예약 중** (대기중만 N건) — 주황 톤, **클릭 가능** (담당자가 거절 시 본인이 확정 받을 수 있으므로)
  - **선택 가능** (예약 없음) — 기본 상태
- 새 CSS 클래스 `.slot-item.pending` (`.booked`와 색만 다른 부드러운 톤). 선택되면 `.selected`가 우선 적용되도록 `:not(.selected)` 조합.
- `applyAvailability(booked, pendingCounts)` 시그니처 + `availabilityCache`에 `pendingCounts` 함께 저장.

### 핵심 제약 (다음 세션에서도 유지)
- 무선 인터넷 SSID/PW, 도어락 비밀번호는 **메인 페이지에 절대 노출 금지**. 추가/변경은 `ThinQReal_AppScript.gs`의 `buildConfirm*` 빌더에서만 한다.
- 대기중 예약이 있는 슬롯은 **선택 가능 상태를 유지**할 것 — 거절 시 다음 신청자가 확정될 수 있어야 함. 회색/마감 처리하면 안 됨.
- Apps Script `?type=availability` 응답에 새 키를 추가할 때는 기존 `bookedSlots`를 깨지 말 것 (메인 페이지 캐시 호환).

## 작업 내역 (2026-05-23 후속 — 메인페이지 카피·약관 정비)

### A. 홈 히어로 정비
- 통계 스트립(`stats-strip` — 30평형/7공간/3회 운영/24+ 기기) 제거. 관련 CSS(`.stats-strip`, `.stat-item`, `.stat-num`, `.stat-label`, 모바일 grid override)도 함께 정리.
- 히어로 카피 변경:
  - 제목: "미래의 집을, 지금 경험하세요." → "LG전자의 AI홈을 직접 경험해 보세요."
  - 서브: "30평형 실제 주거 공간에서 LG AI 가전과 홈 솔루션을 직접 연구하고 시연합니다." → "주거 공간에서 실제 동작하는 최신 가전들과 AI홈 솔루션을 직접 경험할 수 있습니다."

### B. 이용 안내 — 주차 안내 중복 제거
- "그 외 사업장 근무 직원 및 외부 고객"의 안내를 `김현진 선임(hj8462.kim@lge.com)에게 문의` → `담당자에게 문의해 주세요.`로 변경. 페이지 사이드바 담당자 카드에 이메일이 이미 노출되어 있어 중복 방지.

### C. 이용 안내 — ThinQ 홈 초대 규정 정원 항목 추가
- 신규 항목: "동시에 초대 가능한 인원은 **최대 20명**으로 제한됩니다. 정원 초과 시 먼저 승인된 멤버부터 순차적으로 삭제될 수 있습니다."
- **(2026-05-23 후속 업데이트)** 별도 "ThinQ 홈 초대 규정" 섹션은 유의사항의 ThinQ(계정·홈초대) 그룹과 내용이 중복되어 **유의사항 ThinQ 그룹으로 통합**하고 별도 섹션은 제거함. 유의사항 5개 그룹 구조(공통/가전/공간/욕실/ThinQ)는 그대로 유지. 중복 2건(기기 해제·재연결 금지 / 공간 외부 스마트루틴·원격제어 금지)은 기존 ThinQ 그룹 항목에 이미 포함되어 있어 제거, 고유 3건(사전 요청·삭제 / 실명 등록 / 20명 정원)만 ThinQ 그룹으로 흡수. → 홈 초대 관련 안내는 이제 **유의사항 ThinQ 그룹이 단일 소스**.

### D. 예약 폼 — 파손·분실 비용 동의 체크박스
- `예약 신청하기` 버튼 바로 위에 동의 체크박스 신설(`#fAgree`). 본문: "예약한 시간 동안 ThinQ Real 이용 중 시설·집기의 파손이나 분실이 발생할 경우, 시설환경팀이 선처리 후 해당 비용을 예약 팀에 청구함에 동의합니다."
- `.form-agreement` / `.form-agreement-text` CSS 신설(보조 배경 + 보더, 호버 시 accent-mid).
- `submitBooking()`에서 미체크 시 토스트 후 차단. `resetForm()`에서 체크 상태 초기화.

### E. 연락처 입력 길이 제한
- `#fPhone` input에 `maxlength="15"` 부여(하이픈 포함 15자 상한). `inputmode="tel"`도 함께 추가해 모바일 키패드 최적화.

### 핵심 제약 (다음 세션에서도 유지)
- 파손·분실 동의 체크박스는 **필수 동의** — 미체크 시 제출 차단 로직을 임의로 해제하지 말 것.
- 연락처 `maxlength="15"`는 `010-0000-0000`(13자) + 국제번호 마진 기준이므로 임의 축소 금지.
- 주차 안내에 특정 담당자 이메일을 다시 적지 말 것 — 사이드바 담당자 카드와 중복됨. "담당자에게 문의" 표현 유지.

## 작업 내역 (2026-05-23 후속 — 예약 폼 상세화)

담당자 요청으로 예약 폼이 단일 평탄 폼 → **방문 목적 기반 동적 폼**으로 재구성됨. PPT 슬라이드(case 1~6) 기준 6종 카테고리·필드 셋·방문자 명단 다중 입력.

### A. 방문 목적 카테고리 6종으로 재정의
기존 5종(`R&D 연구 / B2B 파트너 시연 / 내부 행사 / Press Tour / 기타`) → 6종으로 일괄 교체:
| key | 라벨 (사용자·메일·통계 표시) | 1번째 줄 라벨 | 방문자 컬럼 |
|-----|---------------------------|--------------|------------|
| `customer` | 고객/고객사 영업 활동 | 고객/고객사 | 이름·직급 (2-col) |
| `rd` | 내부 R&D · 테스트 | 프로젝트명 | 이름·직급 (2-col) |
| `internal-event` | 내부 행사 | 행사명 | 이름·직급 (2-col) |
| `external-event` | 외부 행사 | 행사명 | 소속·이름·직급 (3-col) |
| `content` | 콘텐츠 제작 | 촬영명 | 소속·이름·직급 (3-col) |
| `other` | 기타 | 제목 | 소속·이름·직급 (3-col) |

`PURPOSE_CONFIG`(index.html) 단일 소스에서 라벨·플레이스홀더·힌트·컬럼 수 모두 정의. 카테고리 추가·변경은 이 객체만 수정.

### B. 동적 폼 — 목적 선택 전엔 숨김
- 방문 목적 select가 트리거. 선택 전에는 `dynamicForm` / 동의 체크박스 / 제출 버튼 모두 `display:none`.
- 선택 시 1번째 줄 라벨·플레이스홀더·활용 방안 라벨이 카테고리에 맞춰 변경되고 `purposeHint`(카테고리 설명)가 select 아래 노출됨.

### C. 방문자 명단 다중 입력 (최대 10명)
- `+ 방문자 추가` 버튼으로 행 추가, `×` 버튼으로 삭제. 마지막 1명 삭제 시 자동으로 빈 행 1개 유지.
- `visitorCols=2`(내부)는 이름·직급만, `visitorCols=3`(외부/콘텐츠/기타)은 소속까지.
- 캡 `MAX_VISITORS=10` — 변경 시 상수와 form-hint 문구 동시 수정.
- 모바일(≤768px) 3-col 행은 소속이 한 줄 차지하도록 grid override.

### D. Sheets 스키마 확장 (마이그레이션 지원)
`getOrCreateHeaders()`가 기존 14컬럼에 신규 6컬럼을 끝에 자동 append (이미 있으면 skip).
- 신규 컬럼: `subject`, `clientCompany`, `visitors`(JSON), `usagePlan`, `expectedEffect`, `purposeKey`
- 기존 호환 필드 유지: `name`(=책임자명), `org`(=subject 미러), `count`(=visitors.length)

### E. 메일 / 관리자 화면 동기화
- **담당자 알림 메일** (`sendAdminAlert`): 카테고리별 1번째 줄 라벨(`subjLabelMap`), 방문자 명단, 활용 방안·기대 효과 본문 포함.
- **예약 확정 메일** (`buildConfirm*`): 변경 없음 — 받는 사람은 본인이 신청한 내용이므로 일정·위치·Wi-Fi·도어락만 보내면 충분.
- **R&D 가전표 첨부 트리거**: `data.purpose.indexOf('R&D') >= 0` — 새 라벨 "내부 R&D · 테스트"도 "R&D" 포함하므로 정상 동작.
- **관리자 상세 모달** (`openModal`): 방문자 명단을 HTML 테이블로 렌더(`renderVisitorsTable`), 활용 방안·기대 효과는 줄바꿈 보존(`fmtMultiline`). 신규 필드가 없는 옛 데이터는 `note`만 표시(`showLegacy`).
- **예약 관리 표 컬럼**: `소속` → `주제`로 헤더 변경. `b.subject || b.org` 표시.
- **CSV 내보내기**: 11컬럼 → 13컬럼으로 확장. 방문자 명단은 `소속/이름/직급; ...` 직렬화.
- **통계 차트 색상**: `PURPOSE_COLORS` 6종 새 라벨로 매핑. 내부 R&D·테스트가 다크 올리브, 고객 영업이 오렌지.

### F. 기존 테스트 데이터 처리
사용자 결정으로 기존 Sheets 데이터 **전체 삭제** (테스트 용도였음). Sheets 직접 열어 헤더 행만 남기고 데이터 행 일괄 삭제.

### 핵심 제약 (다음 세션에서도 유지)
- `PURPOSE_CONFIG`(index.html)와 `PURPOSE_COLORS`(thinqreal_admin.html)는 **한국어 라벨 기준으로 동기화** 필수. 라벨 변경 시 두 곳 다 수정.
- Apps Script `subjLabelMap`(sendAdminAlert) / 관리자 `SUBJ_LABELS`(openModal)도 `purposeKey` 매핑이라 카테고리 키 변경 시 함께 수정.
- 방문자 캡 변경 시 `MAX_VISITORS` 상수, 폼 힌트 문구, CLAUDE.md 표 3곳 동기화.
- 신규 컬럼 `purposeKey`(영어 키)와 `purpose`(한국어 라벨)는 별도 컬럼. 통계는 `purpose`(한국어) 기준이지만 카테고리 분기 로직은 항상 `purposeKey` 기반.

## 완료 내역 — 도메인 이전 (2026-05-19)

ThinQ Real을 독립 도메인 `thinqreal.com`(hosting.kr 구입)으로 이전. 기존 `wonseok-lab/thinqreal/` 하위 경로 구조가 `thinqreal.com/thinqreal/thinqreal.html`처럼 지저분해지는 문제를 해결하기 위해, 별도 리포 `wonseok0415/thinqreal`을 만들어 **리포 루트 = 사이트 루트** 구조로 분리했다.

### 결정된 사항
- **도메인**: `thinqreal.com` (hosting.kr 등록)
- **DNS 권한**: Cloudflare (`nico.ns.cloudflare.com`, `raphaela.ns.cloudflare.com`) — hosting.kr 권한 DNS의 파킹 레코드 누수 문제로 이전. 도메인 등록 자체는 hosting.kr에 그대로.
- **신규 리포**: `wonseok0415/thinqreal` (루트 = 사이트 루트)
- **루트 진입 파일**: `index.html` (구 `thinqreal.html`을 리네임)
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
7. [x] 신규 리포 Settings → Pages → Source: `main` / `(root)` 선택 → 임시 주소(`wonseok0415.github.io/thinqreal/`)로 1차 동작 확인 (커밋된 `CNAME`을 GitHub Pages가 자동 인식해 `thinqreal.com`으로 리다이렉트하므로 임시 주소 직접 검증은 사실상 불가 — DNS 완료 후 도메인으로 검증)
8. [x] **DNS 권한 Cloudflare로 위임** (hosting.kr DNS 직접 설정은 권한 서버에 숨겨진 파킹 A 레코드(`75.2.85.42`, `99.83.196.71` AWS CloudFront)가 살아남아 GitHub IP와 번갈아 응답 → DNS check flapping. Cloudflare 무료 플랜으로 권한 자체를 옮겨 우회):
   - Cloudflare에 `thinqreal.com` 추가 → 5개 레코드를 **모두 DNS only (회색 구름)** 으로 등록:
     ```
     A     thinqreal.com    185.199.108.153 / 109.153 / 110.153 / 111.153
     CNAME www              wonseok0415.github.io
     ```
   - hosting.kr 네임서버를 `ns1~4.hosting.co.kr` → `nico.ns.cloudflare.com`, `raphaela.ns.cloudflare.com`로 교체 (도메인 등록은 hosting.kr에 그대로 유지, DNS만 위임)
9. [x] 신규 리포 Settings → Pages → Custom domain: `thinqreal.com` (커밋된 `CNAME` 자동 인식)
10. [x] DNS 전파 후 Enforce HTTPS 체크
11. [x] **Apps Script `GUIDE_URL` 교체**: `https://wonseok0415.github.io/wonseok-lab/thinqreal/thinqreal.html#page-guide` → `https://thinqreal.com/#page-guide` → Apps Script "배포 관리 → 편집 → 새 버전 → 배포"로 **기존 URL 유지**한 채 재배포 완료
12. [x] 본 CLAUDE.md를 "완료 내역"으로 정리하고 호스팅 정보 신규 도메인 기준으로 갱신
13. [x] **루트 진입용 `index.html` 확보**: `thinqreal.html` → `index.html` 리네임 (GitHub Pages가 루트 진입 시 `index.html`을 찾으므로 필수). `thinqreal_admin.html`의 메인 사이트 링크는 `href="./"`로 갱신해 파일명 의존 제거.

### 주의사항 (이전 후에도 유지)
- Apps Script URL, Sheets ID, 슬롯 시간표, 디자인 시스템은 **불변** (기존 §작업 시 주의사항 참조)
- Apps Script 자체는 그대로 사용 (URL 변경 없음). `GUIDE_URL`만 교체 + 재배포 1회 필요.
- 이전 후 이미지가 깨져 보이면 절대 URL 잔존 흔적이므로 `grep -rE 'raw\.githubusercontent\.com/wonseok0415/wonseok-lab'`로 검색해 모두 상대경로로 교체할 것.

### 이번 이전에서 막혔던 핵심 함정 (다음 작업 참고)

1. **hosting.kr "파킹 OFF"는 UI 표시일 뿐, 권한 DNS에는 파킹 A 레코드가 숨어서 살아있음**
   - 증상: DNS Checker 공용 리졸버는 GitHub IP만 보임 → 우리는 다 됐다고 판단 → 그러나 사용자 브라우저는 hosting.kr 파킹 페이지 / GitHub Pages "DNS check unsuccessful"가 끊임없이 toggle
   - 진단 결정타: `dig +trace thinqreal.com` 결과의 권한 응답에 `75.2.85.42`, `99.83.196.71` (AWS CloudFront 파킹 IP) 가 섞여 나옴. `for i in {1..10}; do dig +short thinqreal.com; done` 반복 시에도 파킹 IP가 간헐적으로 끼어듬.
   - 처방: hosting.kr DNS 사용 포기, **DNS 권한을 Cloudflare 등 외부로 위임**해서 hosting.kr 권한 서버를 응답 경로에서 통째로 배제. 도메인 등록은 그대로 hosting.kr.

2. **Cloudflare로 DNS 위임 시 반드시 "DNS only (회색 구름)"**
   - 5개 레코드 모두 회색 구름. 오렌지 구름(`Proxied`)으로 두면 Cloudflare가 중간에 끼어 호스트 헤더가 바뀌고, GitHub Pages가 어느 리포의 사이트인지 식별 못 함 → 404 / 522.
   - Cloudflare 가입 직후 자동 추가되는 레코드는 기본 Proxied로 잡히니, **각 레코드의 토글을 클릭해 회색으로 변경 필수**.
   - 가입 마지막에 뜨는 "thinqreal.com is not fully protected ... Update one or more records to proxied"는 **의도된 상태**라 `I'll do this later`로 무시.

3. **GitHub Pages는 루트 진입 시 `index.html`을 기본 탐색** — `thinqreal.html` 같은 파일명만 있고 `index.html`이 없으면 apex 진입 시 GitHub Pages 404 ("you must provide an index.html file"). 메인 페이지는 항상 `index.html`로 두기.

4. **GitHub Pages "DNS check" 상태는 잘 캐싱되어 늦게 풀림** — 실제 DNS가 정상이어도 GitHub UI는 30분~수 시간 unsuccessful로 표시될 수 있음. `Check again` 클릭 + 빈 커밋 푸시로 재배포 트리거 + 시간 대기 조합으로 풀린다.

5. **Apps Script 재배포는 "배포 관리 → 편집 → 새 버전 → 배포" 경로**가 정답. "새 배포"를 누르면 새 URL이 발급되어 `index.html` / `thinqreal_admin.html`의 `SCRIPT_URL`까지 다 교체해야 함. 코드만 갱신할 때는 반드시 편집 모드를 쓸 것.

## 작업 내역 (2026-05-24 — 예약 영구 삭제 기능)

테스트·실수로 입력된 예약을 관리자가 직접 제거할 수 있는 삭제 기능 추가. 결정 사항: **영구 삭제(하드) + "삭제" 타이핑 확인 + 상세 모달에만 배치**.

### A. Apps Script (재배포 필요)
- `POST type:booking_delete` 엔드포인트 + `handleDeleteBooking(data)` 신설. `handleDeleteRoiSnapshot` 패턴 그대로 — id로 `bookings` 시트 행을 찾아 `sheet.deleteRow()`. **메일은 발송하지 않음** (거절과 달리 예약자에게 알림 불필요).

### B. 관리자 페이지 (thinqreal_admin.html)
- 상세 모달 액션 줄에 빨간 테두리 `영구 삭제` 버튼(`.modal-btn-danger`) 추가. `margin-right:auto`로 좌측에 떼어 닫기·거절·확정과 분리(오클릭 방지). 모든 상태의 예약에 노출.
- 클릭 시 모달 액션이 숨고 **삭제 확인 패널**(`#modalDeleteConfirm`)이 열림: ⚠️ 경고 + `[날짜·이름·목적]` 요약 + "삭제" 타이핑 입력란. 입력값이 정확히 `삭제`일 때만 빨간 `영구 삭제` 확정 버튼 활성화.
- `startDelete`/`onDeleteInput`/`cancelDelete`/`confirmDelete`/`deleteBooking` 함수 신설. `deleteBooking`은 `updateStatus`와 동일한 **낙관적 UI + 실패 시 롤백** 패턴 사용. 성공·롤백 양쪽에서 `saveCache(allBookings)` 호출 → 재로드 시 지운 항목이 다시 보이지 않게 캐시 동기화.
- `openModal` 진입 시 삭제 패널을 항상 닫고 액션을 복원.

### 핵심 제약 (다음 세션에서도 유지)
- 삭제 확인은 **"삭제" 정확 일치 타이핑**이 게이트 — 임의로 약화하지 말 것.
- `booking_delete`는 **메일 미발송**이 의도된 동작 — 거절(`update`)과 혼동 금지.
- 이 기능은 Apps Script **재배포 후에만** 동작함 (엔드포인트 신규 추가이므로).
