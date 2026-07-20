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
    ├── thinqreal_about.mp4     # 홈 ABOUT 패널 배경 영상 (정지 이미지 대체, 아래 영상 작업 내역 참조)
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
| 관리자 인증 | **이메일 코드 (명단 한정)** — 공유 비밀번호(`thinqreal2026`) 폐기. `AUTH_ADMIN_EMAILS` 6명만 로그인·삭제·슬롯 제어 가능 (2026-06-11 §접근 통제 강화 참조) |
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
| `GET ?type=monthly_report_preview&month=YYYY-MM` | 월간 리포트 HTML 본문 미리보기 (메일 미발송, month 생략 시 이번 달) |
| `GET ?type=monthly_report_send&month=YYYY-MM&confirm=YES` | 월간 리포트 수동 발송. `confirm=YES` 없으면 가드로 미발송. `&to=` 로 수신자 override |
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
  - **ABOUT 섹션 우측 패널은 `<video>` 배경**(`images/thinqreal_about.mp4`) — 정지 이미지에서 영상으로 교체됨. `autoplay muted loop playsinline` + `poster="images/thinqreal_about.png"`(자동재생 차단 시 폴백). 모바일 동일 재생. CSS `.split-media`는 `object-fit:cover`. 제작·갱신은 아래 "영상 작업 내역" 참조.
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
   - 방문 목적별 바 차트 — `PURPOSE_COLORS` 결정적 매핑으로 목적별 고정 색상 (고객/고객사 영업=오렌지, 내부 R&D·테스트=올리브, 내부 행사=퍼플, 외부 행사=틸, 콘텐츠 제작=앰버, 기타=올리브-mid). 막대 옆 컬러 도트로 시각 인식 보조. **정식 6개 카테고리는 0건이어도 항상 모두 표시**(고정 순서, 0건 행은 `.bar-zero`로 흐리게) — 일부만 보여 카테고리가 누락된 것처럼 오해하는 것 방지. 6개에 없는 비표준(옛) 라벨이 데이터에 있으면 건수 내림차순으로 뒤에 덧붙임. 월별 누적 차트는 종전처럼 **데이터에 등장한 목적만** 범례·세그먼트에 표시.
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
| `thinqreal_living_room.jpg` | 01 거실 |
| `thinqreal_kitchen.jpg` | 02 주방 |
| `thinqreal_bedroom.jpg` | 03 침실 |
| `thinqreal_laundress_room.jpg` | 04 런드레스룸 |
| `thinqreal_bathroom.jpg` | 05 욕실 |
| `thinqreal_entrance_corridor.jpg` | 06 현관·복도 |
| `thinqreal_guide_hero.png` | 이용 안내 페이지 히어로 |
| `thinqreal_admin_lighting.png` | 관리자 — 조명 스위치 안내 슬라이드 |
| `thinqreal_admin_system.png` | 관리자 — 시스템 구성 슬라이드 |

> **이미지 포맷·최적화 (2026-05-24 갱신)**: 6개 공간 사진 렌더는 **JPEG(.jpg)** 로 보관 — 사진 콘텐츠라 PNG보다 훨씬 가볍다. 새 렌더를 받으면 GitHub에 원본(2560px·수 MB PNG)을 그대로 올리지 말고, **표시 폭에 맞춰 1920px·JPEG q85로 다운스케일**한 뒤 교체할 것(장당 ~200KB). 관리자 슬라이드(`admin_*`)는 도식 캡처라 PNG 유지(1800px). 욕실은 원래부터 `.jpg`.

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

## 작업 내역 (2026-05-24 후속 — 예약 백필 + 통계 6개 카테고리)

담당자가 엑셀로 정리해 온 실제 예약 5건을 시스템 데이터 컨셉에 맞춰 `bookings` 시트에 입력하고, 그 과정에서 발견된 시트 헤더 누락 문제 및 통계 차트 보강을 처리.

### A. 담당자 예약 5건 백필 (시트 직접 입력)
- 입력 방식 결정: **시트 붙여넣기/가져오기용 CSV 생성** (Apps Script `POST`는 담당자 3명+CC에게 알림 메일이 발송되므로 백필에 부적합 — 특히 한 건은 수신자 본인이 예약자라 자기 자신에게 메일이 감).
- 옛 목적 라벨 → 현행 6개 카테고리 매핑: `Press Tour`→**외부 행사**(external-event), `B2B 파트너 시연`→**고객/고객사 영업 활동**(customer), `R&D 연구`→**내부 R&D · 테스트**(rd).
- 회차 충돌 해소: 5/26 2회차를 2번(용인초입마을 B2B)·3번(김동훈 R&D)이 함께 잡던 것을 **3번을 3회차로** 옮겨 해소 → 5/26은 1·2·3회차가 각기 다른 팀.
- `status=확정`으로 넣어 메인 캘린더에서 해당 회차가 즉시 마감 처리되게 함. 이메일은 엑셀에 없어 **공란**(추후 확정/거절 메일 보내려면 그때 `email` 채우면 됨).
- 단체 인원(`기자단 10명`, `현대건설 고객 30명`)은 방문자 1행으로 묶고 `count`에 총원 반영. 개인별 연락처는 스키마상 대표 1명(`phone`)만 저장.
- 생성 스크립트는 `/tmp`에서 Python `csv` 모듈로 작성(visitors JSON의 콤마·따옴표 안전 인코딩). 리포에는 커밋하지 않음(1회성 데이터 산출물).

### B. ⚠️ 시트 헤더 20열 필수 (재발 방지 메모)
- **증상**: CSV를 가져왔는데 관리자 상세 모달에 방문자 명단·활용 방안이 안 뜨고 목적 라벨이 '소속'으로 표기됨.
- **원인**: 시트 1행 헤더가 옛 14열(`id`~`status`)까지만 있고, 폼 상세화로 추가된 6열 헤더(`subject`, `clientCompany`, `visitors`, `usagePlan`, `expectedEffect`, `purposeKey`)가 **비어 있었음**. `handleGetBookings`는 헤더명으로 필드를 매핑하므로(`obj[headerName]=row[j]`), 헤더가 공란이면 해당 데이터가 `obj['']`로 들어가 읽히지 않음.
- **처방**: 시트 **O1~T1**에 위 6개 헤더를 **대소문자까지 정확히** 입력. (또는 새 폼으로 예약이 1건 들어오면 `getOrCreateHeaders`가 자동으로 누락 헤더를 끝에 append.)
- 다음 세션 참고: 시트에 데이터를 직접 넣을 땐 **헤더 20열 존재부터 확인**. 헤더는 `getOrCreateHeaders`의 `HEADERS` 배열(`ThinQReal_AppScript.gs`)이 단일 소스.

### C. 통계 — 방문 목적별 6개 카테고리 항상 표시 (thinqreal_admin.html, 커밋 `b2a0060`)
- 기존엔 데이터에 등장한 목적만 막대로 그려 0건 카테고리가 누락돼 보임 → 카테고리가 빠진 것처럼 오해.
- `renderStats()`의 방문 목적별 차트를 **정식 6개(`Object.keys(PURPOSE_COLORS)`) 고정 순서로 항상 렌더**, 0건 행은 `.bar-zero`(opacity .5)로 흐리게. 6개에 없는 비표준 라벨은 건수 내림차순으로 뒤에 덧붙여 누락 방지.
- **월별 누적 차트는 종전 유지** — 데이터에 등장한 목적만 범례·세그먼트에 표시(`activePurposes`를 `purposes`에서 별도 산출).

### 핵심 제약 (다음 세션에서도 유지)
- 시트 직접 입력 시 **헤더 20열**(`id`~`purposeKey`) 정합성 우선 확인 — 한 칸이라도 헤더명이 틀리면 관리자에서 조용히 누락됨.
- 통계 방문 목적별 6개 항상 표시(0건 포함) 규칙 유지 — 임의로 "데이터 있는 것만" 으로 되돌리지 말 것.
- 백필처럼 알림이 불필요한 대량 입력은 **시트 직접 입력**으로 — `POST type:booking`은 담당자 메일을 트리거하므로 지양.

## 작업 내역 (2026-05-25~26 — ABOUT 영상화 + 예약 날짜 버그 수정)

### A. 예약 날짜 오프바이원(하루 밀림) 버그 수정 (index.html)
- **증상**: 고객이 5/27 1회차로 신청해도 시트엔 5/26로 저장됨.
- **원인**: 예약 제출부(`submitBooking`)에서 `selectedDate.toISOString().slice(0,10)`로 날짜 생성. `toISOString()`이 **로컬 자정을 UTC로 변환**해 KST(UTC+9)에서 하루 빠짐(5/27 00:00 KST → 5/26 15:00 UTC). 빈자리 조회·달력 표시는 로컬 날짜를 써서 **조회는 맞고 저장만 어긋나는** 상태였음.
- **수정**: 제출부도 로컬 `getFullYear/getMonth/getDate` 조합으로 변경(빈자리 조회 코드와 동일 패턴). Apps Script는 클라이언트 문자열을 그대로 저장·반환하므로 **재배포 불필요**, HTML만 배포.
- **주의**: 날짜를 다룰 땐 `toISOString()` 금지(UTC 변환). 항상 로컬 Y/M/D 조합 사용. 기존에 잘못 저장된 예약은 코드로 자동 교정 안 되니 시트에서 +1일 수동 보정 필요.

### B. 홈 ABOUT 패널 정지 이미지 → 영상 교체 (index.html + images/thinqreal_about.mp4)
- ABOUT 우측 `.split-media` div(배경이미지) → `<video class="split-media" autoplay muted loop playsinline poster="images/thinqreal_about.png">`로 교체. CSS에 `object-fit:cover; width/height:100%` 추가. **모바일도 동일 재생**(playsinline+muted). poster는 자동재생 차단(iOS 저전력) 시 폴백.
- 최종 영상(`thinqreal_about.mp4`): **거실→주방→침실→욕실** 순, 낮→밤 흐름, 1280×852 H.264 ~2.8MB, 23.6초 심리스 루프.

### C. 영상 제작 파이프라인 (로컬 전용 — 리포에 스크립트 미커밋)
이 클라우드 작업 환경에서 **Python(PIL) + `imageio`/`imageio-ffmpeg`(번들 ffmpeg)** 로 영상을 직접 생성. (`pip install Pillow imageio imageio-ffmpeg numpy` 필요. 외부 영상생성 모델은 못 씀 — Claude는 푸티지 생성 불가.)
- **켄번스**: 정지 렌더에 줌/팬(`Image.resize(box=...)` 크롭) + 사인 이즈. 장면 내 모션은 한 줄기로 연속, 디졸브 구간은 앞뒤 끝(느린 구간)끼리만 겹치게 해 끊김 방지(되감김 버그 주의).
- **그레이딩**: 따뜻한 톤(대비·채도 약간 + R↑/B↓) + 비네팅. 모든 클립에 동일 적용해 통일감.
- **전환**: 슬라이드·딥투블랙·블러는 "흔들림"처럼 느껴져 **긴 디졸브로 통일**.
- **Gemini(Veo) image-to-video 클립 혼합**: 담당자가 제공한 자동화 영상 3개(g2 거실 조명 OFF→ON, g3 주방, g1 침실 커튼→야경)를 기존 공간 렌더와 섞음. 클립은 cover-crop으로 16:9(1280×720)→3:2(1280×852) 맞춤(좌우 ~15% 크롭, 내용 중앙이라 무난).
- **Veo 워터마크 제거**: Gemini ✦ 마크는 우하단 고정(1280×720 기준 중심 ≈1183,618). **`delogo=x=1153:y=588:w=64:h=64`** 로 주변 픽셀 보간 제거(크롭 없이). 밝은·어두운 배경 모두 깨끗. 보이지 않는 SynthID는 남음.
- **속도 조절**: Veo 클립은 프레임 샘플링으로 리타이밍(예 10초→7초 빠르게, 또는 네이티브 10초로 느리게). 네이티브보다 더 느리게 하려면 인접 프레임 블렌드 보간 필요(약한 모션블러).
- **최종 인코딩**: `ffmpeg -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart -an`. CRF 23이면 20초대 ~2.8MB.

### D. ABOUT 영상 갱신 방법 (다음 세션 참고)
1. 로컬에서 위 파이프라인으로 새 `*.mp4` 생성 → 2. `images/thinqreal_about.mp4` 교체(파일명 고정) → 3. 커밋·푸시(main). 마크업·CSS는 이미 `<video>`라 손댈 필요 없음. poster(`thinqreal_about.png`)도 유지. **`ROI_BUILD` 같은 캐시 토큰은 영상엔 없음** — 파일명이 같아 GitHub Pages/브라우저 캐시가 늦게 풀릴 수 있으니, 안 바뀌면 강력 새로고침 또는 쿼리스트링 고려.

### E. 담당자 알림 카카오톡 — 논의만 (보류, 코드 변경 없음)
- 예약 시 담당자 3명에게 메일 외 **카카오톡 알림** 가능성 검토. 비교표는 채팅에만 두고 **리포 미커밋**(내부 논의용).
- 결론(보류): **카카오 "나에게 보내기"**(무료·사업자 불필요, 각자 1회 OAuth, 2개월 무알림 시 토큰 만료) vs **알림톡**(사업자·채널·대행사·건당 비용, 발신주체 브랜딩 가능) vs **텔레그램 봇**(무료·간단, 전원 설치 필요). 담당자 논의 후 방향 확정 예정. 실제 연동·테스트는 외부 통신이 막힌 이 환경 밖(Apps Script 콘솔)에서 해야 함.

### F. 영상 후속 TODO
- B/D 스토리("살아있는 집") 자동화 다양화: 조명 on/off·커튼 외에 **가전 on/off 등** 더 다양한 동작 추가(추후 Gemini Veo로 클립 확보 후 혼합). D(디테일 매크로)는 실제 촬영본 필요.

## 작업 내역 (2026-05-28 — 월간 운영 리포트 자동 발송)

매월 마지막 금요일 08:30 KST에 ThinQ Real 운영 결과(예약·방문 이력·ROI 스냅샷·관련 기사)를 메일로 자동 발송하는 기능 추가. 본문 톤은 기존 예약 확정/거절 메일과 동일한 다크 올리브 카드형. 외부 키 3종은 Apps Script Script Properties로 분리되어 있어 코드 수정 없이 운영 가능.

### A. 메일 본문 구성 (`buildMonthlyReportHtml/Text`)
- 헤더: `YYYY년 N월 운영 리포트` (다크 올리브 #3a5035)
- 📊 **핵심 지표** — 총 신청 / 확정 / 거절 / 방문 인원 4종 KPI 카드
- 🎯 **방문 목적별 분포** (확정 기준) — 라벨·비율 막대·건수 (내림차순)
- 📅 **방문 이력** (확정) — 테이블: 일자·회차·목적·주제·소속·책임자·인원
- 💰 **ROI 신규 스냅샷** — 해당 월 timestamp의 스냅샷만 추출 (라벨·작성자·연간가치·BEP·3년/5년 ROI 칩)
- 📰 **관련 기사** — Google Custom Search JSON API로 `LG전자 ThinQ Real` 최근 1개월 결과 최대 10건 (제목·출처·요약·링크)
- 푸터: HS플랫폼사업센터 AI홈솔루션엔지니어링팀

### B. 자동 발송 트리거
- `installMonthlyReportTrigger()` — 스크립트 에디터에서 **1회 직접 실행** → 매일 08:30 시간 트리거 등록 (기존 등록 있으면 자동 교체).
- `monthlyReportTrigger()` — 매일 호출됨. `isLastFridayOfMonth(now)` 체크 + Script Property `monthly_report_last_sent_month`로 이번 달 이미 보냈으면 skip → 동일 달 중복 발송 방지.
- **마지막 금요일 판정**: 오늘이 금요일(`u=5`)이고 +7일 후가 다음 달이면 마지막 금요일. 스크립트 TZ 기준.

### C. Script Properties (스크립트 에디터 → 프로젝트 설정 → 스크립트 속성)
| 키 | 용도 | 미설정 시 동작 |
|---|---|---|
| `MONTHLY_REPORT_TO` | 콤마 구분 수신자 메일 주소 | 트리거가 skip, Logger 로그만 (PROP_LAST_SENT_KEY 미갱신 → 재시도 가능) |
| `GOOGLE_CSE_ID` | Programmable Search Engine ID (cx) | 기사 섹션 본문에 "Google Custom Search 키 미설정"으로 표시, 다른 섹션은 정상 |
| `GOOGLE_CSE_KEY` | Custom Search JSON API Key | 동상 |

**Google Custom Search 설정 절차** (무료, 일 100 쿼리 한도. 월 1회 호출이라 여유 충분):
1. https://programmablesearchengine.google.com → 새 검색 엔진 → "전체 웹 검색" 활성화
2. "검색 엔진 ID" 복사 → `GOOGLE_CSE_ID`에 저장
3. https://console.cloud.google.com → API 라이브러리 → "Custom Search API" 활성화
4. 사용자 인증 정보 → API 키 생성 → `GOOGLE_CSE_KEY`에 저장
5. Apps Script 프로젝트 설정 → 스크립트 속성에 두 값 등록

### D. 발신자 (현행 유지)
- `MailApp.sendEmail(..., { name: 'ThinQ Real' })` — 표시 이름만 'ThinQ Real'로 설정. 실제 발신 주소는 **스크립트 소유자 Gmail (`kangwonseok0415@gmail.com`)** — `kang.wonseok@lge.com`은 CC 수신자이지 발신자가 아님. (Apps Script 편집기 로그인 계정 = `kangwonseok0415@gmail.com`이 소유자. 외부 gmail 발신이라 사내 수신자에게 갈 때 LG 보안 게이트웨이 스캔 큐를 타 메일 지연이 생김.)
- 별도 도메인 메일(`thinqreal@thinqreal.com`)을 발신자로 쓰려면 **Google Workspace 가입(~$7/월) + Send-as alias 등록 + `GmailApp.sendEmail({from: ...})` 변경**이 필요. 본 세션에서는 추가 비용 없이 현행 유지로 합의.

### E. 미리보기 / 수동 발송
- `GET ?type=monthly_report_preview&month=YYYY-MM` — HTML 본문 그대로 브라우저에 렌더 (메일 미발송). `month` 생략 시 이번 달.
- `GET ?type=monthly_report_send&month=YYYY-MM` — **`confirm=YES`가 없으면 가드로 미발송**, 제목만 반환. `&confirm=YES` 명시 시 실제 발송. `&to=foo@bar.com`로 수신자 override (테스트용).

### 핵심 제약 (다음 세션에서도 유지)
- 이 기능은 **Apps Script 재배포 후에만 동작** (엔드포인트·트리거 함수 신규). 재배포는 "배포 관리 → 편집 → 새 버전 → 배포"로 기존 URL 유지.
- 재배포 후 **`installMonthlyReportTrigger()` 1회 수동 실행 필수** — 트리거는 자동 등록되지 않음.
- 수신자 확정 후 `MONTHLY_REPORT_TO` Script Property에 입력. 코드는 수정하지 말 것 — 키·수신자 분리가 의도된 구조.
- 중복 발송 방지 키 `monthly_report_last_sent_month`는 수동으로 비우면 같은 달에 다시 발송 가능 (테스트/재발송 시).
- 한 달치 데이터 필터링은 booking의 `date` 필드와 ROI의 `timestamp` 필드 모두 **앞 7자(`YYYY-MM`)로 prefix 매칭**한다. 시트에 시간대 변환된 Date 객체가 들어가도 `normalizeDate`로 KST `YYYY-MM-DD`로 정규화하므로 안전.

### F-2. Serper.dev로 우회 (2026-05-30)
CSE 정책이 5/30 시점에도 여전히 동일 403(`This project does not have the access to Custom Search JSON API`)으로 막혀 있어, **Serper.dev**로 대체. Google 결과를 우회 제공하는 유료 API의 무료 티어(월 2,500 calls — 월 1회 호출이라 사실상 무제한).

**Apps Script 동작 변경**: `fetchThinqRealArticles()`가 분기 처리됨.
1. **`SERPER_API_KEY` 있으면** → `fetchArticlesViaSerper()` 호출 (POST `https://google.serper.dev/news`, body `{q, gl:'kr', hl:'ko', num:10, tbs:'qdr:m'}`)
2. **없으면** → 기존 CSE 폴백 (`fetchArticlesViaCSE()`)
3. **둘 다 없으면** → 안내 메시지

**우선순위 의도**: Serper가 메인. CSE 정책이 향후 풀리면 `SERPER_API_KEY` 지우기만 하면 자동으로 CSE로 복귀.

**Serper 응답 매핑** (CSE 대비 추가):
- `imageUrl` → `thumbnail` (썸네일 자동 활용 — 메일 본문에 카드형 레이아웃 트리거)
- `date` → `publishedAt` ("1 day ago" 같은 상대 시간 표시)

**Script Property 설정 절차**:
1. https://serper.dev → 회원가입 (Google 계정 OAuth)
2. Dashboard → API Key 복사
3. Apps Script 프로젝트 설정 → 스크립트 속성 → `SERPER_API_KEY` 추가
4. (선택) 기존 `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY`는 그대로 둬도 됨 (Serper가 우선이라 사용 안 됨, 그러나 향후 CSE 복구 대비 보존)
5. Apps Script 재배포 (편집 모드)

**우선순위 분기 코드는 `articles.provider`에 'serper'/'cse' 기록** — 향후 디버깅 시 어떤 API가 호출됐는지 확인 가능. `collectMonthlyData`에서 `articles.source = articles.provider || 'auto'` 매핑.

### F. CSE 시도 보류 (2026-05-28)
`thinqreal-cse-v2` Cloud 프로젝트·신규 키·결제 계정 연결까지 시도했으나 `PERMISSION_DENIED: This project does not have the access to Custom Search JSON API` 가 일관되게 반환됨. 표준 변수 모두 통제(프로젝트 활성화 ✓ / API 키 ✓ / 키 제한 ✓ / PSE 엔진 정상 ✓ / 결제 계정 ✓)했음에도 차단되는 패턴이라, Google의 미공개 신규 계정 정책으로 결론. 며칠~몇 주 후 자동 풀릴 가능성 있어 대기 중. 운영은 아래 G(수동 큐레이션)으로 안정화.

### G. 기사 섹션 — 수동 큐레이션 (CSE 대안)
CSE가 막혀 있는 동안 Google Sheets의 **`monthly_articles` 탭**에 담당자가 행을 추가하면 그 내용이 메일 본문 📰 섹션에 자동 포함되도록 구현. CSE 키가 비어 있거나(현재 상태) 동작 안 해도, 시트에 행만 있으면 그게 우선 사용됨.

#### 시트 구성 (`monthly_articles` 탭)
첫 호출 시 Apps Script(`getOrCreateArticlesHeaders`)가 자동 생성. 컬럼:

| 컬럼 | 필수 | 예시 |
|---|---|---|
| `month` | ✓ | `2026-05` (또는 Date 객체) — 발송 월과 매칭되는 행만 표시 |
| `url` | ✓ | `https://www.lgnewsroom.com/2026/05/...` |
| `title` | 자동 채움 | `LG 마곡 사이언스파크에 ThinQ Real 쇼룸 오픈` — 비어 있으면 URL에서 자동 추출 |
| `source` | 자동 채움 | `LG뉴스룸`, `전자신문` 등 매체명 |
| `summary` | 자동 채움 | 기사 요약 (최대 200자, 초과 시 `…`) |
| `published_at` | 자동 채움 | `2026-05-20` |
| `thumbnail` | 자동 채움 | 기사 대표 이미지 URL (`og:image`) — 메일 본문에 카드형으로 표시 |

#### URL 자동 추출 + 시트 write-back (Lazy 입력)
`title`이 비어 있으면 Apps Script가 URL을 fetch해서 **OpenGraph 메타 태그**(`og:title`, `og:description`, `og:site_name`, `article:published_time`, `og:image`)에서 자동 추출 → **추출 성공 시 시트의 빈 칸에 자동 write-back** (담당자가 직접 채운 값은 보존).

운영 모드:
- **Lazy**: `month` + `url`만 입력 → 나머지 자동 추출 + 시트에 채워짐
- **수동**: `title`까지 입력 → fetch 안 함, 입력값 그대로
- **혼합**: 일부만 채우고 나머지 비우기 → 비운 칸만 자동

#### 한글 인코딩 처리
국내 일부 뉴스 사이트(예: news.nate.com 일부 페이지)가 EUC-KR/MS949 인코딩을 쓸 때 한글이 깨지는 문제 → 응답 헤더(`Content-Type: charset=`)와 HTML `<meta charset>`을 순서대로 검사해 적절한 인코딩으로 재디코딩. UTF-8 / EUC-KR / MS949(=CP949·Windows-949) 자동 처리.

#### 자동 추출 한계
- 사이트가 봇 차단 시 fetch 실패 → `title`은 URL 자체, `source`는 도메인으로 폴백 (시트엔 write-back 안 함)
- 자바스크립트 렌더링 사이트(SPA)는 OG 태그가 서버 응답에 없으면 추출 실패
- Apps Script가 지원 안 하는 charset은 UTF-8로 폴백 (드물게 깨질 수 있음)
- `description`은 200자 초과 시 말줄임표(`…`)로 잘림
- 썸네일(`og:image`)이 없으면 카드 레이아웃 대신 텍스트만 표시 (다단 호환)

#### 운영 흐름
1. 매월 마지막 금요일(자동 발송일) **직전 며칠 안에** 담당자가 `monthly_articles` 시트 열기
2. 그 달에 보도된 기사 3~10건 정도 행으로 추가
3. 자동 발송 시 Apps Script가 해당 월(`month` 컬럼) 행을 모두 수집하여 메일 본문에 포함
4. 행이 없으면 CSE 호출 시도(현재는 키 없어 skip 표시), 그것도 없으면 빈 섹션 안내문

#### 우선순위 로직 (`collectMonthlyData`)
1. 시트의 `monthly_articles`에서 이번 달 행 조회 → 1건 이상이면 그것만 사용 (CSE 호출 안 함)
2. 0건이면 `fetchThinqRealArticles()` 호출 → CSE 키 있으면 호출, 없으면 skip 표시

→ 즉 CSE가 향후 복구돼도 시트에 행이 있으면 수동이 우선 적용. 담당자가 큐레이션 100% 통제 가능.

#### 메일 본문 표시
- 섹션 부제목: 수동이면 "담당자 큐레이션 · N건", CSE면 "Google ... · 최근 1개월"
- 행마다 제목(링크) · 출처·게재일(있을 때) · 요약(있을 때) 순으로 표시

#### 핵심 제약 (다음 세션에서도 유지)
- 시트 탭 이름 `monthly_articles` 변경 금지 (`ARTICLES_SHEET_NAME` 상수와 일치 필요)
- 헤더 6개 컬럼 순서 변경 금지 (위치 인덱스가 아닌 이름 기반 매칭이지만 일관성 유지)
- `month` 값이 빈 행, `title`/`url` 둘 중 하나라도 빈 행은 자동 skip됨 (안전장치)
- 수동 큐레이션이 있는 동안 CSE 호출 안 함 — CSE 디버깅하려면 시트의 해당 월 행을 일시 제거하거나 다음 달 미리 보기로 확인할 것

### H. 임원 가독성 우선 — 본문 시각화 개편 (2026-05-28 후속)

수신자(센터장 · 담당 · 실장 등 임원진) 가독성을 우선해, 메일 본문을 시각화 중심으로 정리:

#### 섹션 헤더
- 모든 섹션 제목 폰트 11px(uppercase) → **20px bold**로 확대
- 부제 위치에 **한 줄 설명**을 명시(섹션 의도를 즉시 이해할 수 있도록)

#### 핵심 지표 — 2개로 축소
- 총 신청·확정·거절·방문 인원 4개 카드 → **확정 방문 · 총 방문 인원 2개 카드**로 축소
- 큰 숫자(42px)와 단위(18px) 분리, 카드 한 장에 시선 집중

#### 방문 목적별 분포 — 도넛 차트
- 가로 막대 비교 → **QuickChart.io 도넛 차트** (PNG 이미지)
- 색상은 관리자 페이지 `PURPOSE_COLORS`와 동기화 (6개 카테고리 고정 매핑, Apps Script에도 동일 상수 보관)
- 우측 범례 + 슬라이스 내부에 건수 표시

#### 방문 이력 — 3열로 축약
- 일자/회차/목적/주제·소속/책임자/인원 6열 → **일자/목적/주제 및 소속 3열**
- 한눈에 "언제 무엇을 누가" 만 보이도록

#### ROI 누적 분석 결과 — 그래프 중심 재구성
- 섹션 제목을 "ROI 신규 스냅샷" → **"N월 ROI 누적 분석 결과"** (월 동적)
- 표시 데이터의 기준 시나리오:
  - `collectMonthlyData`가 별도로 `roiLatest`를 계산 — 보고월 말 시점까지 저장된 시나리오 중 가장 최근 1건
  - 보고월 이전 시나리오만 있어도 그것을 사용 (월별 누적 분석이라는 의미와 일치)
- 본문 구성:
  - 4개 KPI 카드 (연간 가치 / BEP / 3년 누적 ROI / 5년 누적 ROI)
  - **가치 항목별 비중 도넛 차트** (vRnD·vSalesInfra·vSalesContrib·vPR 색상 매핑 `ROI_VALUE_LABELS`)
  - **연도별 누적 손익 막대 그래프** (Y0~Y5, 음수는 빨강 #dc2626, 양수는 다크 올리브)
  - 우하단에 "기준 시나리오: 라벨 · 작성자" 표기
- 섹션 설명문: "영업 지원 · 기여 영업 이익은 실제 영업 진행 상황에 따라 매월 갱신되므로, 본 수치는 작성 시점의 시나리오를 기준으로 한 추정치입니다."

#### 푸터 폰트 확대
- 13px gray → **15px** (감사 인사 굵게 + 팀명 별도 줄)

#### 차트 렌더링 방식
- **QuickChart.io** (https://quickchart.io/chart?c=...) 외부 PNG로 렌더 — Gmail/Outlook/Apple Mail 모두 표준 `<img>` 지원이라 호환성 우수
- Chart.js v2 spec을 JSON 직렬화 → URL 인코딩으로 GET 호출
- `chartjs-plugin-datalabels`로 슬라이스/막대 내부에 값 표시
- Apps Script `quickChartUrl(config, {w, h, bkg})` 헬퍼

#### 핵심 제약 (다음 세션에서도 유지)
- `PURPOSE_COLORS` 상수는 **Apps Script와 thinqreal_admin.html 양쪽 모두 동기화 필수** — 관리자 페이지에서 색이 바뀌면 메일 본문도 같이 바꿀 것
- `ROI_VALUE_LABELS` 라벨/색상은 ROI 툴(`ThinQ_Real_ROI_Tool.html`)의 `collectOutputs` 키와 정확히 매칭해야 함 — vRnD, vSalesInfra, vSalesContrib, vPR
- 누적 손익 막대 그래프는 `totalCost`가 outputs에 없으면 `annualValue * 3 - profit3`으로 역산 — ROI 툴이 totalCost를 항상 저장하도록 유지하는 게 안전 (현재 ROI 툴 line 1966 기준 저장됨)
- QuickChart.io는 외부 서비스 — 가용성 문제가 생기면 차트 자리에 깨진 이미지가 표시될 수 있으므로 alt 텍스트는 의미 있게 유지

### I. 수신자 관리 — Script Property `MONTHLY_REPORT_TO` (코드 미포함, 운영 분리)
수신자 명단은 **리포·코드에 두지 않고** Apps Script Script Property `MONTHLY_REPORT_TO`(콤마 구분 문자열)에만 둔다. 명단 변경 시 콘솔에서 값만 교체 → **코드 수정·재배포 불필요**. 임시 제외/복원도 문자열만 바꾸면 됨.

- **현재 운영 명단**: HS플랫폼사업센터 AI홈솔루션엔지니어링팀 20명 (센터장 1·담당 1·실장 1·팀장 1·책임 12·선임 4).
- **테스트/일부 발송**: `?type=monthly_report_send&...&to=foo@bar.com` 의 `&to=` override가 `MONTHLY_REPORT_TO`보다 우선 → 본인에게만 안전 발송 가능 (Script Property 안 건드림).
- **수신자 오타 이력**(2026-05-28~29 정정, 다음 입력 시 주의): 김재훈 `jsh.kim`→`jhs.kim`, 이철호 `ch275`→`ch275.lee`, 박진우 `jin0618.park`→`jn0618.park`.

### J. 첫 정식 발송 완료 (2026-05-29 09:16 KST) ✅
- 매월 마지막 금요일 트리거가 **2026-05-29(5월 마지막 금요일) 08:30 트리거로 정상 자동 발송됨** — 첫 운영 실증 성공.
- 첫 회차는 임원 검토 부담 고려해 **17명**(센터장 정기현·담당 노범준·실장 박제원 3명 임시 제외) 으로 발송. 본문(요약·KPI 2카드·목적 도넛·방문이력 3열·ROI 누적 그래프·기사 5건)·차트 모두 정상 렌더 확인.
- 5월 기사 섹션은 `monthly_articles` 시트 **수동 큐레이션 5건**으로 채움 (CSE는 보류 상태라 호출 안 함 — §G 우선순위 로직대로).
- 발송 직후 토스트/로그 정상, 중복발송 가드(`monthly_report_last_sent_month`=`2026-05`) 기록됨.

#### 발송 후속 운영 메모 (다음 세션 반드시 확인)
- [ ] **6월부터 20명 전체로 복원** — 첫 회차 임시 제외했던 3명을 다시 포함. `MONTHLY_REPORT_TO`에 20명 문자열 저장 (§I). 아직 17명 상태일 수 있으니 6월 발송 전 확인 필수.
- [ ] **Option B — 전월 대비 증감 표시 (6월 작업 예정)**: 핵심 지표 카드(확정 방문·총 방문 인원)에 전월 대비 ±증감(델타) 추가. 사용자가 5/28 "A 먼저, B는 6월에" 로 합의한 후속 작업.
- [ ] **CSE 재시도 대기**: Google 신규 계정 정책 추정 403이 며칠~몇 주 후 자동 해소될 수 있음. 풀리면 `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY` 동작 재확인. 단 시트 수동 큐레이션이 있는 달엔 CSE 호출 안 하므로(§G), 디버깅하려면 해당 월 시트 행을 비우거나 빈 달 미리보기로 확인.
- 중복발송 가드 키(`monthly_report_last_sent_month`)는 **자동 트리거만** 막음 — `monthly_report_send` 수동 호출은 매번 새로 발송됨(테스트 자유로움). 같은 달 자동 재발송이 필요하면 이 키를 수동으로 비울 것.

## 작업 내역 (2026-05-29 후속 — 실제 방문 데이터 19건 백필 + 표 정렬 보정)

예약 시스템 구축 전(2026-03-24~2026-06-25)에 외부 채널로 잡힌 방문 22건 중 19건을 시트에 직접 백필. 진행 중 발견된 두 가지 함정 정리.

### A. 시트 헤더 정확한 20컬럼 순서 (재발 방지)
CLAUDE.md 이전 기록의 "헤더 20열(id~purposeKey)" 추상 표기가 추측을 유도했음. 실제 `getOrCreateHeaders`(ThinQReal_AppScript.gs:1770)의 정확한 컬럼 순서:

```
1.id  2.timestamp  3.date  4.slots  5.slot  6.slotLabel
7.name  8.org  9.phone  10.email  11.purpose  12.count  13.note  14.status
15.subject  16.clientCompany  17.visitors  18.usagePlan  19.expectedEffect  20.purposeKey
```

**중요 함정**:
- `slots`(JSON 배열, 예 `[2]` 또는 `[2,3]`)·`slot`(단일 번호)·`slotLabel`(텍스트, 예 `2회차 13:00~14:30`) **3개 컬럼이 모두 있어야** 함. 한 개라도 빠지면 시트 가져오기 시 모든 후속 컬럼이 한 칸씩 밀려서 들어감.
- `ip`/`ua` 컬럼은 **존재하지 않음**. 첫 백필에서 이걸 잘못 추가해 컬럼이 어긋났음.
- 백필 CSV 생성 시 헤더 배열은 위 20개를 그대로 순서대로 사용할 것. 추측 금지.

### B. 표 정렬 키 변경 — timestamp → date 우선
**기존**: `data.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))` — timestamp(신청 시점) 내림차순.

**문제**: 백필 행처럼 timestamp가 같으면 19건 사이 정렬이 시트 행 순서로 떨어져 방문일이 뒤죽박죽으로 보임.

**변경**: 방문일(`date`) 우선 + 같은 날이면 timestamp 보조. 운영상 "최근 방문 → 옛 방문" 순서가 더 자연스럽기도 함.
```js
data.sort((a,b)=>{
  const dateCmp = (b.date||'').localeCompare(a.date||'');
  if (dateCmp !== 0) return dateCmp;
  return new Date(b.timestamp)-new Date(a.timestamp);
});
```
`localeCompare`로 `YYYY-MM-DD` 문자열 직접 비교 → Date 객체 생성 비용 없이 안전.

### C. ID 형식 일관성 — 13자리 시퀀스
정식 예약 POST는 `String(Date.now())`(13자리 ms)로 id 부여. 기존 백필 5건은 `1779900000001~05` 패턴. 새 19건 백필 시 id를 같은 13자리 시퀀스(`1779900000006~24`)로 부여해야 시트 일관성 유지. UUID 형식도 기능엔 무관(Apps Script `update`/`delete`는 String 비교만 함)하지만 시각적 혼란·정렬 이질감 발생.

### 핵심 제약 (다음 세션에서도 유지)
- 시트 백필용 CSV 만들 땐 위 §A의 20컬럼 순서를 **정확히** 따를 것. 추측 금지, ThinQReal_AppScript.gs:1770의 `HEADERS` 배열이 단일 소스.
- `slots`는 JSON 배열 문자열(`"[2]"`), `slot`은 숫자(`2`), `slotLabel`은 텍스트 — 3개 모두 채울 것.
- 같은 날 2건 이상이면 회차 충돌 회피용으로 슬롯을 분산(1·2·3 중 비어있는 자리). 단일 슬롯 백필은 디폴트 2회차.
- 표 정렬은 `date` 우선이므로, 백필 행의 `timestamp`는 작업 시점 그대로 둬도 표는 방문일 순으로 깔끔히 보임. timestamp는 본래 의미(신청 시점)로 보존.

## 작업 내역 (2026-06-10 — 사이트 접근 통제 4안 적용)

팀장 요청으로 임직원만 접근 가능하도록 **사이트 전체 이메일 게이트(4안)** 적용. 경쟁사 도메인 접근 차단 + 부적절한 일반 고객 예약 신청 차단 + 관리자 거절 부담 경감.

### A. 동작 흐름 (index.html + Apps Script)
1. 사이트 진입 → `body.unauth` 클래스로 모든 콘텐츠 가림 + 게이트 카드만 노출
2. `@lge.com` 메일 입력 → `?type=auth_request&email=...` 호출 → Apps Script가 6자리 코드 생성·캐시(10분)·메일 발송
3. 코드 입력 → `?type=auth_verify&email=...&code=...` → 일치 시 HMAC-SHA256 서명 토큰 반환
4. 토큰을 `localStorage('thinqreal_auth_token')`에 저장 → 30일간 유효
5. 재방문 시 토큰 payload의 `exp` 검사 → 유효하면 즉시 입장(마찰 없음)

### B. 핵심 제약 (다음 세션에서도 유지)
- **허용 도메인 단일 소스**: Apps Script `AUTH_ALLOWED_DOMAINS = ['lge.com']`. index.html의 정규식 `@lge\.com$`도 함께 동기화 필수. 추가 도메인(예: `lgepartner.com`) 허용 시 양쪽 모두 수정.
- **토큰 형식**: `base64url(payload).base64url(HMAC-SHA256)` — payload = `{email, exp}`. 클라이언트는 payload `exp`만 검사(서명 검증은 서버 신뢰). 서명 비밀키는 Script Property `AUTH_SECRET` (없으면 UUID 2회로 자동 생성).
- **레이트 리미트**: 동일 메일 60초 쿨다운(`AUTH_COOLDOWN_SEC`). 메일 스팸 발생 시 이 값을 늘릴 것.
- **외부 손님 처리**: 게이트 통과 불가 → 한영본/사업관리팀이 시트(`bookings`)에 직접 백필(2026-05-29 후속 §A의 20컬럼 헤더 규칙대로).
- **관리자 페이지**: `thinqreal_admin.html`은 자체 비밀번호 그대로 유지(이중 인증 불필요). 게이트는 메인 사이트에만 적용.
- **CSS 게이트 가림 메커니즘**: `body.unauth > *:not(.auth-gate):not(.toast):not(script) { display: none !important; }` — direct child 선택자라 게이트 카드와 토스트, 스크립트만 살아남는다. 새 최상위 요소(예: `<header>`, `<aside>`)를 추가할 땐 게이트 가림 동작에 영향 없는지 확인.
- **재배포 필요**: Apps Script에 신규 엔드포인트(`auth_request`/`auth_verify`)를 추가했으므로 "배포 관리 → 편집 → 새 버전 → 배포"로 기존 URL 유지한 채 재배포 필수.

## 작업 내역 (2026-06-11 — 개인정보처리방침 + 국외 이전 동의)

개인정보 영향평가 심사에서 식별된 미비 사항 2건(국외 이전 동의 절차 부재, 처리방침 페이지 부재)을 선제 구현.

### A. privacy.html 신설 (독립 페이지)
- **게이트 밖에서도 열람 가능** — index.html의 인증 게이트와 무관한 별도 파일. 정보주체가 동의 전에 방침을 검토할 수 있어야 하므로 의도적으로 비보호.
- 구성: 수집 항목·방법 / 수집·이용 목적 / 보유 기간(인증 코드 10분·토큰 30일·예약 정보 **방문일로부터 3년**) / **국외 이전(Google LLC, 법 제28조의8 고지 5요소)** / 제3자 제공·위탁 없음 / 파기 / 정보주체 권리(보호 담당: 이철호 책임) / 안전성 확보 조치 / 변경 이력(v1.0 2026-06-11).
- GitHub Pages에는 개인정보 미저장(코드만 호스팅) — 국외 이전 대상은 **Google만** 기재.

### B. 예약 폼 — 필수 동의 체크박스 2개 추가 (index.html)
- `#fPrivacyCollect`(수집·이용 동의) + `#fPrivacyTransfer`(국외 이전 동의) — **법상 국외 이전은 별도 동의**가 필요해 체크박스 분리. 기존 파손·분실 동의(`#fAgree`) 위에 `#privacyBoxes` 래퍼로 배치.
- 거부권 고지문(`.form-agreement-note`) 포함. `privacy.html` "자세히 보기" 링크는 `target="_blank"`(폼 상태 보존). label 내부 `<a>`는 HTML 스펙상 체크박스를 토글하지 않음.
- `renderFormByPurpose()`에서 `agreementBox`와 함께 토글, `submitBooking()`에서 2건 모두 미체크 시 차단, `resetForm()`에서 초기화.
- payload에 `privacyConsent: 'Y'` 추가 → 시트에 동의 증빙 기록 (동의 시각 = `timestamp`).

### C. 인증 게이트·푸터 고지 (index.html)
- 게이트 카드 하단: "입력하신 이메일은 임직원 인증 목적으로만 사용됩니다" + 처리방침 링크.
- 4개 페이지 푸터: `© 2026 LG Electronics · 개인정보처리방침` 링크.

### D. Apps Script — HEADERS에 `privacyConsent` 컬럼 추가 (21번째)
- `getOrCreateHeaders`의 `HEADERS` 배열 끝에 추가 — 다음 예약 POST 시 시트에 헤더 자동 append.
- **재배포 필요** ("배포 관리 → 편집 → 새 버전 → 배포").

### 핵심 제약 (다음 세션에서도 유지)
- 시트 백필 시 컬럼은 이제 **21열**(`id`~`privacyConsent`). 백필 행은 `privacyConsent` 공란 허용(시스템 외 접수 건).
- 보유 기간 "방문일로부터 3년"은 처리방침(privacy.html §3)과 폼 체크박스 문구 양쪽에 기재 — 변경 시 두 곳 동기화.
- 개인정보 보호 담당(이철호 책임) 변경 시 privacy.html §7 갱신.
- 두 동의 체크박스는 **필수** — 미체크 차단 로직을 임의로 해제하지 말 것 (파손·분실 동의와 동일 규칙).

## 작업 내역 (2026-06-11 후속 — 관리자 보안 강화 + 권한 통제 + 슬롯 제어)

침투테스트 대응 + 팀장 요청. 세 가지를 하나의 토큰 기반 구조로 통합 구현.

### ⚠️ 배경 — 기존 관리자 "보안"의 실체
- `const ADMIN_PW = 'thinqreal2026'`이 **클라이언트 HTML에 평문 노출** (소스 보기로 즉시 탈취).
- 더 심각: **백엔드(Apps Script)에 인증이 전혀 없었음**. SCRIPT_URL만 알면 비밀번호 없이 `?type=bookings`로 전 직원 개인정보 조회, `POST booking_delete`로 임의 삭제 가능. 비밀번호 게이트는 화면만 가리는 눈속임이었음.

### A. 관리자 인증 — 이메일 코드 (명단 한정)
- 공유 비밀번호 폐기 → 관리자 본인 `@lge.com` 이메일 + 6자리 코드 (메인 게이트 흐름 재사용, 단 허용 대상을 명단으로 한정).
- **단일 소스**: Apps Script `AUTH_ADMIN_EMAILS` (kang.wonseok / jhs.kim / ch275.lee / moonsu.seo / hj8462.kim / kwangsoo.park 6명 — 박광수 책임은 2026-07-07 추가). 명단 변경 시 이 배열만 수정.
- 엔드포인트: `?type=admin_auth_request` / `?type=admin_auth_verify`. 코드 캐시 키는 `admin_code_<email>` (메인 게이트 `auth_code_`와 분리).
- 관리자 토큰은 payload `{email, exp, admin:true}` HMAC-SHA256 서명, **90일 유효**(`AUTH_ADMIN_TOKEN_TTL_DAYS` — 도입 시 7일이었으나 재로그인 빈도 완화 요청으로 2026-07-07 90일로 연장). `localStorage('thinqreal_admin_token')`.

### B. 백엔드 권한 통제 (핵심 — 화면 우회 방어)
- `doPost`에서 파괴적 작업(`update`·`booking_delete`·`roi_delete`·`slot_block`·`slot_unblock`)은 **모두 `verifyAdminToken(data.token)` 통과 필수**. 명단 외·만료·위조 토큰은 백엔드가 거부.
- `?type=bookings`(개인정보 포함)도 토큰 필수 — `handleGetBookings(token)`. 무토큰 조회 차단 → 개인정보 영향평가 관점에서도 개선.
- `verifyAuthToken`: 서명 재계산 + 상수시간 비교(`constantTimeEquals`) + exp 검사. `verifyAdminToken`: 추가로 `admin` 플래그 + 명단 포함 검사.
- 관리자 페이지의 모든 파괴적 fetch에 `token:adminToken()` 동반. `mode:'no-cors'`라 응답은 못 읽지만(낙관적 UI), 백엔드가 진짜 게이트. 클라이언트도 `adminTokenValid()` 선검사로 만료 시 `adminSessionExpired()` 로그아웃.

### C. 슬롯 제어 (신규 기능)
- 관리자가 날짜·회차를 "예약 불가"로 잠금 → 메인 예약 페이지에 즉시 반영. 내부 사정으로 예약 못 받는 시점 대응.
- 저장: 신규 시트 탭 **`slot_blocks`** (컬럼 `id`,`date`,`slot`,`timestamp`,`by`,`reason`). 첫 호출 시 `getSlotBlocksSheet()`가 자동 생성.
- 엔드포인트: `GET ?type=slot_blocks[&date=]` (현황, 비민감) / `POST slot_block` `{date,slot,reason,token}` / `POST slot_unblock` `{date,slot,token}` 또는 `{id,token}`.
- `handleAvailability` 응답에 **`blockedSlots` 추가** (기존 `bookedSlots`·`pendingCounts` 호환 유지).
- 메인 페이지(`index.html`) `applyAvailability(booked, pendingCounts, blocked)`: 차단이 **최우선** — 예약/대기와 무관하게 "예약 불가"(중립 회색, 마감 적색과 구분). `.slot-item.blocked` CSS. 선택돼 있던 회차는 자동 해제.
- 관리자 UI: 사이드바 "슬롯 제어" 탭(🚫). 날짜 선택(오늘/내일/모레 퀵버튼) → 회차별 상태(예약 가능/확정 있음/대기/차단) + 차단·해제 토글. 하단에 "예정된 차단" 칩 목록(과거 차단은 숨김).

### 핵심 제약 (다음 세션에서도 유지)
- 관리자 명단 단일 소스 = Apps Script `AUTH_ADMIN_EMAILS`. 추가/제외 시 이 배열만 수정 후 재배포 (코드 외 분리 안 함).
- **모든 파괴적 작업은 백엔드 토큰 검증이 진짜 방어선**. 클라이언트 게이트(화면)는 편의일 뿐 — 백엔드 `verifyAdminToken` 게이트를 임의로 우회·약화하지 말 것.
- `?type=bookings`는 토큰 필수 — 관리자 페이지는 `&token=adminToken()` 동반. 토큰 없으면 `{error:'unauthorized'}` 반환되며 페이지는 `adminSessionExpired()`로 로그인 복귀.
- 슬롯 차단은 `slot_blocks` 탭이 단일 소스. 메인 페이지 가용성 캐시(15초 TTL)로 차단 직후 최대 15초 지연 가능(의도).
- ROI 스냅샷 `roi_snapshot`(생성)·`roi_delete`(삭제)는 **토큰 미적용** — ROI 툴이 관리자 iframe 외에 별창(`ThinQ_Real_ROI_Tool.html` 직접 URL)으로도 열려 토큰 전달 경로가 없기 때문. 저위험(시나리오 메모 수준)이라 현행 유지. 향후 보호하려면 ROI 툴에 관리자 토큰 주입 필요(§향후 검토).
- **재배포 필요**: Apps Script 신규 엔드포인트(admin_auth_*, slot_*) + 토큰 게이트 추가. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-06-11 후속 — 텔레그램 예약 알림 연동)

이메일 외에 담당자 그룹 텔레그램으로도 알림을 보내는 보조 채널 추가. 메일 발송과 직교(서로 영향 없음).

### A. 연동 구조
- **수신 방식**: 그룹 채팅 1개(=chat_id 1개). 담당자 추가/제외는 텔레그램 그룹 멤버 관리로 처리 → 코드 수정 불필요.
- **알림 트리거 2종**:
  1. **새 예약 신청** — `handleNewBooking`에서 `sendAdminAlert` 다음에 `sendTelegramNewBooking(data, id)` 호출
  2. **예약 확정/거절** — `handleUpdateStatus`에서 `sendGuestMail` 다음에 `sendTelegramStatusChange(row, headers, status)` 호출 (시트 원본 행 데이터 사용)
- **설정 분리**: 봇 토큰·chat_id는 코드/리포에 두지 않고 **Script Property**에만 (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). 둘 중 하나라도 비어 있으면 silent skip — 다른 동작은 영향 없음.
- **실패 격리**: `sendTelegramMessage`가 try/catch + `muteHttpExceptions:true`. 텔레그램 장애·미설정 상태에서도 예약 저장과 메일 발송은 정상.

### B. 메시지 포맷 (Telegram HTML parse_mode)
- 새 예약: `🆕 새 예약 신청` + 📅 일자/회차 + 🎯 목적 + 📝 주제 + 🏢 고객사 + 👤 책임자/인원 + ☎ 연락처 + 관리자 페이지 링크.
- 상태 변경: `✅ 예약 확정` / `❌ 예약 거절` + 📅/🎯/📝/👤. 시트 원본 값 사용 (POST 페이로드 누락 무관).
- HTML 이스케이프 헬퍼 `escapeTelegramHtml` — 메일 본문용 `escapeHtml`과 별도. parse_mode HTML 명세상 `& < >` 3종만 변환.

### C. 봇 셋업 절차 (운영자가 1회 수행)
1. 텔레그램에서 `@BotFather` 시작 → `/newbot` → 봇 이름/유저네임 입력 → **토큰 발급**
2. 알림용 텔레그램 **그룹 생성** (예: "ThinQ Real 예약 알림") → 담당자 5명 초대 + 봇 초대
3. 그룹에서 봇에게 아무 메시지 1회 전송 → 브라우저로 `https://api.telegram.org/bot<TOKEN>/getUpdates` 열어 **chat.id**(보통 음수) 확인
4. Apps Script 프로젝트 설정 → 스크립트 속성 → `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 등록
5. 재배포 (편집 모드)
6. `GET ?type=telegram_test` 호출하여 테스트 메시지 1통 수신 확인

### D. 테스트 엔드포인트
- `GET ?type=telegram_test` — 봇/chat_id 설정 검증. 미설정 시 `{ok:false, reason:'not_configured'}`. 발송 시 `{ok:true}` + 그룹에 `🧪 ThinQ Real 텔레그램 연동 테스트` 도착.

### 핵심 제약 (다음 세션에서도 유지)
- `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`는 **Script Property에만** — 코드·리포에 토큰 커밋 금지(노출 시 즉시 BotFather에서 revoke 가능하지만 사전 방지).
- 텔레그램 발송은 **이메일 발송과 독립** — 한쪽 실패가 다른 쪽을 막지 않도록 try/catch 격리 구조 유지.
- 신규 알림 이벤트를 추가하려면 (예: 슬롯 차단) `sendTelegramMessage()`를 직접 호출하면 됨 — 헬퍼는 메시지 문자열만 받음.
- **재배포 필요**: 신규 엔드포인트(`telegram_test`) + 훅 추가. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-06-14 — 담당자 알림 메일 카드형 개편 + 발신자명 통일)

신규 예약 접수 시 담당자 3명+CC에게 가던 평문 알림 메일을 **예약 확정 메일과 동일한 다크 올리브 카드형 레이아웃**으로 개편. 발신자 표시명도 `ThinQ Real`로 통일.

### A. `sendAdminAlert` 재구성 (ThinQReal_AppScript.gs)
- 평문 본문 한 줄짜리 → **HTML + plain-text 동시 발송** 구조로 전환 (`buildAdminAlertText` / `buildAdminAlertHtml` 분리).
- HTML 레이아웃: `buildConfirmHtml`과 동일한 다크 올리브(#3a5035) 헤더 + 라벨/값 그리드 카드. 헤더 서브타이틀 "새 예약 신청이 접수되었습니다" + 예약 ID.
- 정보 섹션 이모지 헤더: 📅 일정 / 🎯 목적 / 📝 주제(목적 카테고리별 동적 라벨) / 🏢 고객사(있을 때만) / 👤 책임자 / ☎ 연락처+이메일 / 👥 인원+방문자 명단 표 / 💡 활용 방안 / ✨ 기대 효과.
- 활용 방안·기대 효과는 회색 배경(`#f5f5f7`) + 좌측 액센트 보더(#8fa889) 블록으로 가독성 강화. 줄바꿈 보존(`<br>`). 빈 값이면 "(작성된 내용 없음)" 회색 표기.
- 방문자 명단은 zebra-stripe 표(소속·이름·직급 가운뎃점 구분).
- CTA 버튼: "관리자 페이지에서 승인 / 거절하기 ↗" (https://thinqreal.com/thinqreal_admin.html). 메일 클라이언트 호환 위해 인라인 스타일 다크 올리브 버튼.
- `ADMIN_ALERT_SUBJ_LABELS` 상수로 목적별 1번째 줄 라벨 매핑(customer→고객/고객사, rd→프로젝트명, internal/external-event→행사명, content→촬영명, other→제목).

### B. 발신자 표시명 통일
- `sendAdminAlert` · `sendGuestMail` 양쪽 `MailApp.sendEmail`에 `name: 'ThinQ Real'` 추가. 기존 월간 운영 리포트와 동일.
- 실제 발신 주소는 스크립트 소유자 Gmail(`kangwonseok0415@gmail.com`) 유지. 수신자에게는 `ThinQ Real <kangwonseok0415@gmail.com>`로 노출. (`kang.wonseok@lge.com`은 CC 수신자)

### 핵심 제약 (다음 세션에서도 유지)
- 모든 ThinQ Real 발신 메일(담당자 알림·게스트 확정/거절·월간 리포트)은 `name: 'ThinQ Real'`로 통일 — 신규 메일 종류 추가 시도 동일하게 설정.
- `ADMIN_ALERT_SUBJ_LABELS`는 `PURPOSE_CONFIG`(index.html) 카테고리 키와 동기화 필수 — 신규 카테고리 추가 시 양쪽 다 수정.
- 카드형 HTML은 인라인 스타일만 사용(Gmail/Outlook 호환). `<style>` 블록·CSS 변수·외부 리소스 금지.
- **재배포 필요**: `sendAdminAlert` 시그니처는 동일하나 내부가 바뀜. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-06-14 후속 — 관리자 예약 직접 입력/수정 (이력 관리))

시스템 정식 오픈 전, 외부 채널로 잡힌 과거 방문 이력을 관리자가 **예약 관리 탭에서 직접 추가·수정**할 수 있게 함. 고객이 대충 적은 상세를 담당자가 보강·정정해 두면 월간 리포트·월별 PPT 출력 시 재작업이 줄어든다. **저장 시 알림(담당자 메일·텔레그램) 미발송**이 핵심 — 실제 신규 신청이 아니라 이력 입력이므로.

### A. Apps Script — 신규 엔드포인트 2종 (재배포 필요)
- `POST type:admin_booking_create` → `handleAdminCreateBooking(data, byEmail)`: 시트에 행 append. **메일·텔레그램 미발송**. id는 클라이언트가 보낸 값 우선(낙관적 UI와 동일 id 유지), 없으면 서버 생성. status 기본 `확정`.
- `POST type:admin_booking_edit` → `handleAdminEditBooking(data, byEmail)`: id로 행을 찾아 **편집 가능 필드만** 갱신(`date·slots·slot·slotLabel·name·org·phone·email·purpose·count·note·status·subject·clientCompany·visitors·usagePlan·expectedEffect·purposeKey`). `id·timestamp·privacyConsent`는 보존. 미포함 필드는 건너뜀. **메일·텔레그램 미발송**.
- 둘 다 `doPost`의 **관리자 토큰 게이트**에 포함 — `verifyAdminToken` 통과 필수(파괴적/쓰기 작업 동일 방어선).
- 회차 입력 정규화 헬퍼 `normalizeSlotsInput(slots, slot)` 신설 — 배열/JSON 문자열/단일값 모두 number[]로 변환.

### B. 관리자 페이지 — 입력/수정 폼 모달 (thinqreal_admin.html)
- 예약 관리 툴바에 **`＋ 이력 추가`** 버튼, 상세 모달 액션에 **`수정`** 버튼(`.modal-btn-edit`, 모든 상태의 예약에 노출).
- 공용 폼 모달 `#bookingFormBg`: 방문 목적(select) → 카테고리별 라벨/힌트/고객사 노출 동적 변경(`BF_PURPOSE_CONFIG`, index.html `PURPOSE_CONFIG` 미러). 주제·날짜(지난 날짜 허용)·상태·회차(칩 다중 선택)·책임자·인원·연락처·이메일·방문자 명단(동적 행, 최대 10명)·활용 방안·기대 효과·메모.
- **필수**: 방문 목적·주제·날짜·회차(1+)·책임자. 나머지(연락처·이메일·방문자·활용/기대·메모)는 선택 — 이력은 부분 입력 후 나중에 보강 가능.
- 인원: 입력값 우선, 비우면 방문자 수로 자동 설정. `org`(표 '주제' 컬럼)는 subject 미러로 저장. 고객(`customer`)은 고객사 비우면 subject와 동일 저장.
- **낙관적 UI**: create는 클라이언트 생성 id를 서버에 함께 전송(동일 id로 즉시 편집·삭제 가능). edit는 기존 행 in-place 갱신 + 실패 시 롤백. 양쪽 모두 `saveCache` 동기화 + 활성 탭(표·KPI·stats) 재렌더(`bfRefreshViews`).
- 폼 상단 배너에 "저장해도 담당자 알림 메일·텔레그램은 발송되지 않습니다" 명시.

### 핵심 제약 (다음 세션에서도 유지)
- `admin_booking_create`/`admin_booking_edit`는 **알림 미발송**이 의도된 동작 — `handleNewBooking`(메일+텔레그램 발송)과 혼동 금지. 백필·이력 정정용이다.
- `BF_PURPOSE_CONFIG`(thinqreal_admin.html)는 `PURPOSE_CONFIG`(index.html) 한국어 라벨과 동기화 필수. 카테고리 변경 시 두 곳 + `ADMIN_ALERT_SUBJ_LABELS`(Apps Script) + `SUBJ_LABELS`(openModal) 함께 수정.
- edit 시 옛 비표준 목적 라벨(예 `R&D 연구`)은 드롭다운에서 `기타`로 폴백되어 저장 시 `기타`로 바뀔 수 있음 — 수정 화면에서 올바른 카테고리를 다시 선택하면 됨.
- 두 엔드포인트 모두 관리자 토큰 게이트 통과 필수 — 백엔드 검증이 진짜 방어선(클라이언트 게이트는 편의).
- **재배포 필요**: 신규 엔드포인트(admin_booking_create/edit). "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-06-14 후속 — Google 캘린더 연동 (팀 공유 캘린더))

팀이 예약·사용 현황을 캘린더에서 바로 보도록, **확정된 예약을 팀 공유 Google 캘린더에 일정으로 자동 등록**. 메일·텔레그램과 직교(서로 영향 없음). 백엔드 전용 변경이라 HTML/GitHub Pages 머지 불필요 — Apps Script 재배포만으로 동작.

### A. 동작 (등록 시점·라이프사이클)
- **확정 시 등록** (사용 현황 중심). 신청(대기중)·거절 건은 캘린더에 안 올라감.
- **풀 라이프사이클**: 확정 → 일정 생성 / 수정(상세 보강) → 일정 갱신 / 거절·삭제 → 일정 제거. 캘린더가 항상 실제 현황과 일치.
- 훅 위치: `handleUpdateStatus`(확정→`syncCalendarUpsert`, 거절→`syncCalendarDelete`) · `handleAdminCreateBooking`(status 확정이면 등록) · `handleAdminEditBooking`(갱신 후 최종 상태 기준 동기화) · `handleDeleteBooking`(행 삭제 **전에** 이벤트 제거). `handleNewBooking`(대기중)에는 훅 없음.
- 일정 시간 = 날짜 + 회차 시간표(`SLOT_TIMES`, 1회차 09:00–10:30 등) 자동 매핑. **다중 회차는 회차마다 개별 일정으로 생성**(`buildCalendarEvents` 배열 반환) — 회차 사이 재정비·점심 공백이 있어 1·3회차처럼 떨어진 회차를 한 일정으로 묶으면 빈 시간까지 점유한 것처럼 보이기 때문. **스크립트 TZ가 Asia/Seoul이어야 시각이 KST로 맞음**(월간 리포트와 동일 전제).
- 갱신은 **delete+recreate** — upsert 시 기존 이벤트를 모두 지우고 회차별로 새로 만든다(회차 구성이 1→2개 등으로 바뀌어도 정확히 반영). `calendarEventId`에는 생성된 이벤트 id **배열을 JSON 문자열**로 저장(`parseEventIds`가 신규 JSON 배열·레거시 단일 문자열 모두 파싱).

### B. 표기 범위 — 운영 정보만 (공유 노출 최소화)
- 제목: `[목적] 주제 · 책임자`. 본문: 목적·주제·고객사·회차·인원·책임자·활용 방안 + 위치(마곡 W6동 1층) + 관리자 페이지 링크.
- **방문자 전체 명단·연락처(전화·이메일)는 캘린더에 미표기** — 개인정보 처리방침·국외이전 동의 운영 중이라 의도적으로 제외. 상세는 관리자 페이지에서만 확인.

### C. 설정 (Script Property + 캘린더 접근)
- `CALENDAR_ID` (Script Property) = `thinq_real_calendar@gmail.com`. 미설정 시 silent skip(다른 동작 영향 없음).
- **스크립트 소유자 = `kangwonseok0415@gmail.com`(개인 gmail, 편집기 로그인 계정)** 이고, 이 계정이 ThinQ Real 캘린더(`thinq_real_calendar@gmail.com`)에 **읽기/쓰기 권한 보유** → 별도 공유 없이 바로 동작. (소유자가 사내 계정이었다면 그 계정에 "변경 권한" 공유가 필요했겠지만, 실제 소유자는 개인 gmail이라 불필요.)
- 캘린더 ID 위치: 캘린더 설정 → 해당 캘린더 → "캘린더 통합" → 캘린더 ID.
- 시트에 **`calendarEventId` 컬럼(22번째)** 자동 append — 이벤트 갱신·삭제 추적용. 백필 시 공란 허용.

### D. 검증 엔드포인트
- `GET ?type=calendar_test` — CALENDAR_ID 설정 + 쓰기 권한 점검. 1시간 뒤 테스트 일정을 만들었다 즉시 삭제. 미설정 `{ok:false, reason:'not_configured'}` / 접근 불가 `no_access` / 쓰기 실패 `write_failed` / 정상 `{ok:true, calendarName}`.

### 핵심 제약 (다음 세션에서도 유지)
- `CALENDAR_ID`는 **Script Property에만**. 스크립트 소유자(`kangwonseok0415@gmail.com`)가 대상 캘린더에 쓰기 권한이 있어야 함 — 현재 `thinq_real_calendar@gmail.com`은 소유자 개인 계정에 읽기/쓰기 연동돼 있어 충족.
- 캘린더 동기화는 **메일·텔레그램과 독립** — `getBookingCalendar()`가 null(미설정/권한없음)이면 조용히 skip, 예약 저장·메일은 정상.
- 캘린더에 **방문자 명단·연락처 미표기** 원칙 유지 — 표기 범위 넓히려면 `buildCalendarEvent`만 수정하되 개인정보 노출 검토 필수.
- 회차 시간표(`SLOT_TIMES`)는 확정 슬롯과 동일 — 슬롯 변경 금지 원칙에 종속.
- 등록 시점을 "신청 즉시(대기중 포함)"로 바꾸려면 `handleNewBooking`에 `syncCalendarByStatus(id,'대기중')`이 아닌 별도 처리 필요(현재는 확정 전용). 요청 시 확장.
- **재배포 필요**: 신규 엔드포인트(`calendar_test`) + 캘린더 훅 + HEADERS `calendarEventId` 추가. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-06-25 — 임시 관리자 권한 (자동 만료))

사내 정보보호팀 침투테스트(2026-06-29~07-03) 대비, 외부 감사·위탁 점검 등 한시적 관리자 권한 부여가 반복될 가능성이 높아 **만료 기반 임시 권한 메커니즘**을 추가. 영구 명단(`AUTH_ADMIN_EMAILS`)을 늘렸다 줄였다 하는 방식은 회수 누락 위험이 커서 채택 안 함.

### A. 구조 (ThinQReal_AppScript.gs, 코드 변경 3곳)
- 상수 `AUTH_TEMP_ADMINS = { '이메일': 'YYYY-MM-DD' }` (line 53~) — 만료일은 KST 23:59:59까지 유효, 다음날 00:00부터 자동 거부.
- 헬퍼 `isTempAdminActive(email)` — 등록 + 미만료 검사 1줄 함수.
- `isAdminEmail`: 영구 OR 활성 임시 둘 다 허용 → 인증 코드 발급 게이트.
- `verifyAdminToken`: 영구 OR 활성 임시 둘 다 허용 → 모든 파괴적 작업의 백엔드 게이트.
- 토큰 자체 TTL(`AUTH_ADMIN_TOKEN_TTL_DAYS`, 2026-07-07부터 90일)은 그대로. 임시 만료일 이후엔 토큰이 남아 있어도 백엔드가 거부 → **이중 방어**. (임시 관리자의 실효 기간은 토큰 TTL이 아니라 `AUTH_TEMP_ADMINS` 만료일이 기준)

### B. 운영 절차
1. 새 임시 권한 부여: `AUTH_TEMP_ADMINS`에 한 줄 추가 (이메일 → 만료일, 주석에 사유 명시) → 재배포.
2. 만료 후: 코드 청소는 선택. 만료된 항목은 검사 함수가 자동 차단하므로 그대로 둬도 무해. 정기 청소는 분기 단위로.
3. 회수가 급할 땐: 만료일을 과거 날짜로 바꾸거나 항목 삭제 후 재배포.

### 핵심 제약 (다음 세션에서도 유지)
- 임시 권한은 반드시 `AUTH_TEMP_ADMINS`로 — `AUTH_ADMIN_EMAILS`에 직접 추가 금지(회수 누락 사고 원인).
- 만료일은 **KST 기준** 23:59:59까지. 다른 타임존(UTC 등)으로 해석되지 않게 `'YYYY-MM-DDT23:59:59+09:00'`로 파싱 — `isTempAdminActive` 변경 시 동일 패턴 유지.
- 침투테스트/감사가 끝나면 결과 보고서로 발견된 취약점 후속 패치 필요할 수 있음.
- **재배포 필요**: 코드 상수·검사 함수 추가. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-05 — B2E 전환: 소속 입력 + 방문 목적 카테고리 개편)

팀장 코멘트("현재 분류 안에 대해 구분이 어렵다") 반영. 사이트가 임직원 전용(B2E)으로 전환됨에 따라 신청자 소속 파악 항목 추가 + 방문 목적 6종을 새 체계로 교체.

### A. 신청자 소속 입력 (index.html + Apps Script + 관리자)
- 예약 폼에 **소속 본부(드롭다운) + 소속 부서(직접 입력)** 신설 — 둘 다 필수. 본부는 고정 목록, 부서는 조직개편으로 수시 변경되어 자유 입력.
- 본부 목록 (index.html `#fDivision` / 관리자 `BF_DIVISIONS` 동기화 필수): HS사업본부 / MS사업본부 / VS사업본부 / ES사업본부 / 한국영업본부 / 해외영업본부 / CTO부문 / CX센터 / 고객가치혁신부문 / 디자인경영센터 / 홍보담당 / 기타 (ES사업본부·홍보담당은 2026-07-07 추가)
- Sheets HEADERS에 **`division`(23)·`department`(24) 컬럼 추가** → 백필 시 컬럼은 이제 **24열**. 옛 행은 공란 허용.
- 담당자 알림 메일(🏛 소속 행)·텔레그램(🏛 줄)·관리자 상세 모달·이력 추가/수정 폼·CSV(소속본부·소속부서 컬럼)에 반영.
- 개인정보 수집 항목에 "소속(본부·부서)" 추가 — index.html 동의 문구 + privacy.html §1 양쪽 갱신.

### B. 방문 목적 카테고리 개편 (구 6종 → 신 6종)
| 구 라벨 (key) | 신 라벨 (key) |
|---|---|
| 고객/고객사 영업 활동 (customer) | **B2B 영업 (b2b)** |
| 내부 R&D · 테스트 (rd) | **R&D (rd)** |
| 외부 행사 (external-event) | **홍보 (프레스투어/마케팅) (pr)** |
| 콘텐츠 제작 (content) | 콘텐츠 제작 (content) — 동일 |
| 내부 행사 (internal-event) | **내부 커뮤니케이션 (internal-comm)** |
| 기타 (other) | 기타 (other) — 동일 (변경안 5개에 없지만 도피처로 유지 결정) |

- 동기화 지점 4곳 모두 갱신: `PURPOSE_CONFIG`(index.html) / `BF_PURPOSE_CONFIG`·`SUBJ_LABELS`·`PURPOSE_COLORS`(thinqreal_admin.html) / `ADMIN_ALERT_SUBJ_LABELS`·`subjLabelMap`·`PURPOSE_COLORS`(Apps Script).
- 색상 연속성 유지: B2B 영업=오렌지, R&D=올리브, 홍보=틸(구 외부행사), 콘텐츠=앰버, 내부 커뮤니케이션=퍼플(구 내부행사), 기타=올리브-mid.
- R&D 가전표 첨부 트리거(`purpose.indexOf('R&D')`)는 신 라벨 'R&D'에도 그대로 동작.
- 마이그레이션 전 옛 데이터 호환: 관리자 `BF_LEGACY_KEYS`(구 키→신 키) + `SUBJ_LABELS`에 구 키 병기.

### C. 기존 이력 마이그레이션 — `migratePurposeCategories2026()` (1회 실행 필요)
- Apps Script 끝에 1회성 함수 추가. 에디터에서 함수 선택 후 실행하면 `bookings` 시트의 `purpose`/`purposeKey`를 위 표대로 일괄 변환. **멱등**(재실행 안전) — 이미 신 라벨인 행은 건너뜀.
- 옛 비표준 라벨 안전망 포함: `B2B 파트너 시연`→b2b, `R&D 연구`→rd, `Press Tour`→pr.
- 실행 순서: ① 코드 재배포 → ② `migratePurposeCategories2026` 1회 실행 → ③ 관리자 페이지에서 통계 확인.

### 핵심 제약 (다음 세션에서도 유지)
- 본부 목록 변경 시 index.html `#fDivision` 옵션과 관리자 `BF_DIVISIONS` **양쪽 동시 수정**.
- 카테고리 라벨/키 변경 시 위 §B의 동기화 지점 4곳 + CLAUDE.md 함께 수정 (기존 규칙과 동일).
- 시트 백필 컬럼은 이제 **24열**(`id`~`department`). `division`/`department`는 옛 행 공란 허용.
- purposeKey 신 체계: `b2b`/`rd`/`pr`/`content`/`internal-comm`/`other` — 구 키(customer 등)는 마이그레이션 후 시트에 남지 않아야 정상.
- **재배포 필요** + **마이그레이션 함수 1회 실행 필요** (§C 순서대로).

### 후속 보완 (2026-07-05, 담당자 피드백 3건)
1. **폼 순서 변경**: 소속 본부/부서 + 신청자 이메일을 **방문 목적보다 위**로 이동 — 목적과 무관한 신청자 기본 정보라 항상 표시 영역(트리거 밖)에 배치. 동적 영역에는 주제/책임자/연락처/방문자/활용/기대만 남음.
2. **'고객/고객사' → '고객사'**: b2b 카테고리의 1번째 줄 라벨·담당자 라벨을 '고객사'로 통일. 반영 지점 4곳 — `PURPOSE_CONFIG`(index) / `SUBJ_LABELS`·`BF_PURPOSE_CONFIG`(admin) / `ADMIN_ALERT_SUBJ_LABELS`·`subjLabelMap`(Apps Script).
3. **관리자 표 방문 목적 한 줄 표기**: 목적 셀에 `white-space:nowrap` + `.booking-table` min-width 680→760px (모바일 가로 스크롤 보장 폭 상향).

## 작업 내역 (2026-07-05 후속 — 주차 안내 개편 + 웰컴 보드 안내 신설)

관리 멤버 요청 3건. VIP·프레스투어 대응 확대에 따른 안내 보강.

### A. 이용 안내 — 주차 안내 개편 (index.html)
- 기존 단일 그룹 → **지하 / 지상 2개 카드**로 분리.
  - 지하: 기존 내용 유지 (SP Portal 셀프 신청 / 그 외는 담당자 문의 — 특정 담당자 이메일 미기재 규칙 유지).
  - 지상 (VIP·프레스투어 등): 신청 양식 표(날짜·입출차 시간·신청자·연락처·위치·방문 목적·차량번호·차량종류) + 마곡주차관리자(`mgparking@lge.com`) 메일 신청 안내.
- **지상주차 위치 약도**: 구글맵 스크린샷 대신 **인라인 SVG 약도**로 자체 제작 (디자인 시스템 톤 일치, 코드로 수정 용이). 위치 ①~④ + W6동 ThinQ Real 표기.
  - 최종 배치는 **드래그 에디터로 담당자가 직접 배치한 스크린샷 기반** (v4, 2026-07-05 확정). 붙은 쌍(W10+W8/W6+W4/W9+W7/W5+W3)은 높이가 다른 두 사각형이 맞닿은 형태, 마커는 ①W10·W8 사이 북측/②W4 앞/③W9·W7 사이 남측/④W3 앞.
  - 향후 배치 수정 시: 세션 스크래치의 `map_editor.html`(드래그 에디터, 680×420 좌표계) 패턴을 재사용하면 담당자가 직접 배치 → 좌표 추출 가능. SVG는 `<rect>/<circle>` 좌표만 수정.
- 신규 CSS: `.guide-table-wrap`(가로 스크롤) / `.guide-table` / `.parking-map` / `.parking-map-caption`.

### B. 이용 안내 — 웰컴 보드 섹션 신설 (index.html)
- ThinQ Real 내 웰컴보드 시설 없음 → 건물 1층 사이니지 2대(W4쪽·W6동쪽) 활용 안내.
- 신청: 사진(3840×2160) + 양식을 박형기 책임(`Kuwait.park@lge.com`)·마곡운영지원센터(`mgoc@lge.com`)로 송부.
- 양식 표: 요청일/본부/요청자/분류/송출 위치/시작일/종료일/시간/송출 내용. 송출 위치는 W1~W10·지하 중 선택, ThinQ Real 방문 고객용으로는 W4·W6 권장 문구.
- PPT의 사이니지 실사 2장은 **미첨부 결정** (W4·W6 외관 유사, 텍스트 안내로 충분).

### C. 예약 확정 메일 — 주차·웰컴 보드 안내 추가 (Apps Script, 재배포 필요)
- `buildConfirmText`/`buildConfirmHtml` 양쪽에 🅿 주차 섹션 추가 (도어락 다음, 문의 이전) — **모든 확정 메일**에 포함. 지하(SP Portal)·지상(양식→mgparking) 요약 + "양식·약도는 이용 안내 페이지 참조".
- 🖥 웰컴 보드 섹션은 **B2B 영업·홍보 목적 확정 메일에만** 포함 — `includeWelcomeBoard = /(B2B|홍보)/.test(data.purpose)` (R&D 가전표 트리거와 동일한 라벨 기반 패턴).

### 핵심 제약 (다음 세션에서도 유지)
- 웰컴 보드 메일 트리거는 purpose **라벨 기반** (`B2B`/`홍보` 포함 여부) — 카테고리 라벨 변경 시 이 정규식도 함께 점검.
- 약도 SVG의 위치 번호는 양식 '위치' 칸과 연동되는 실제 운영 정보 — 임의 재배치 금지, 변경 시 담당자 확인 후 좌표 수정.
- 주차 안내에 ThinQ Real 담당자 개인 이메일 미기재 규칙은 유지 (mgparking·mgoc·Kuwait.park는 외부 지원 조직이라 예외).
- **재배포 필요**: 확정 메일 빌더 변경. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-05 후속 — 월간 리포트 방문 이력 핵심만 표시)

임원진 수신자 가독성을 위해 월간 운영 리포트의 📅 방문 이력 섹션을 **핵심 이력(B2B 영업 · 홍보)만 상세 표시**로 변경. KPI 카드(확정 방문·총 방문 인원)와 🎯 목적별 분포 도넛은 **전체 확정 기준 유지** — 전체 현황 파악용 통계는 그대로 두고 상세 테이블만 좁힘.

- 필터: `/(B2B|홍보)/.test(purpose)` — 웰컴보드·R&D 가전표와 동일한 라벨 기반 트리거 패턴.
- 생략된 그 외 목적 건수는 테이블 하단에 "그 외 목적 N건은 생략 — 전체 내역은 관리자 페이지" 문구로 표기 → KPI 숫자와 테이블 행수 불일치 오해 방지.
- `buildMonthlyReportText`/`buildMonthlyReportHtml` 양쪽 + 섹션 설명(`descVisits`) 동기화.
- 카테고리 라벨 변경 시 이 정규식도 함께 점검 (웰컴보드 트리거와 동일 규칙).
- **재배포 필요** (월간 리포트 빌더 변경 — 7월 리포트 발송 전까지 반영하면 됨).
- **(후속) 카테고리별 그룹 표시**: 방문 이력 테이블을 단일 표 → **카테고리 그룹**(■ B2B 영업 → ■ 홍보 고정 순서)으로 재구성. 그룹 헤더 = 컬러 도트(PURPOSE_COLORS 동기화) + 라벨 + 건수, 표 컬럼은 일자/주제·소속 2열 (목적 컬럼은 그룹 헤더로 대체). 0건 그룹은 생략.

## 작업 내역 (2026-07-05 후속 — 사내 이전 준비 문서 3종)

사이버보안팀 "사내 인프라 사용" 권고에 따른 이전 준비. 업무혁신팀 답변(제공 인프라 형태) 대기 중에 미리 만들 수 있는 재료를 `docs/migration/`에 작성 — 답변이 오면 이전 계획서로 조립.

- `docs/migration/api-contract.md` — 전체 엔드포인트(GET 15종 + POST 9종) 입출력 스펙, 인증 모델(HMAC 토큰·코드 TTL·잠금), 메일 발송 규칙, 스케줄 작업. 백엔드 재구현 시 설계서.
- `docs/migration/data-schema.md` — bookings 24컬럼 + roi_snapshots/slot_blocks/monthly_articles + Script Properties/캐시 키/localStorage + 데이터 취급 규칙.
- `docs/migration/dependency-inventory.md` — Apps Script 플랫폼 API 사용처·대체 매핑, 외부 서비스(QuickChart·Serper·Telegram·Calendar) outbound 검토, 이전 형태별(A/B/C) 재구현 규모, 업무혁신팀 확인 항목 8개, 이전 시 개선 효과.

**주의**: 문서에 비밀값(도어락·Wi-Fi PW·토큰)은 미기재. 문서 갱신 시에도 동일 규칙 유지.

## 작업 내역 (2026-07-06 — 관리자 모달 오닫힘 수정)

이력 추가/수정 폼 작성 중 여러 번 클릭하다 보면 모달이 닫히는 버그 수정 (thinqreal_admin.html만 변경 — Apps Script 재배포 불필요).

- **원인**: 백드롭의 `onclick="if(event.target===this)close...()"` 패턴. `click` 이벤트는 mousedown/mouseup의 **공통 조상**에서 발생하므로, 모달 안에서 누르고(입력란 텍스트 드래그 선택 등) 백드롭 위에서 손을 떼면 백드롭 클릭으로 판정돼 닫혔음. 클릭으로 레이아웃이 변하는 요소(방문자 행 × 삭제 등) 연타 시에도 발생.
- **수정**: 인라인 onclick 제거 → `bindBackdropClose(bgId, closeFn)` 헬퍼 신설 (`closeBookingForm` 아래). `pointerdown`과 `pointerup`이 **모두 백드롭 자신**일 때만 닫음. 상세 모달(`modalBg`)·폼 모달(`bookingFormBg`) 둘 다 적용.
- **유지되는 동작**: 순수하게 배경을 클릭하면 여전히 닫힘 (백드롭 닫기 기능 자체는 존치). ✕/취소 버튼 경로는 무관.
- **핵심 제약**: 새 모달을 추가할 때 백드롭 닫기는 인라인 `onclick` 대신 `bindBackdropClose()`를 쓸 것 — 같은 버그 재발 방지.
- **(2026-07-07 후속) 이력 추가/수정 폼은 백드롭 닫기 자체를 제거**: 담당자 확인 결과 순수 바깥 클릭에도 작성 중 입력 내용이 사라지는 게 문제 → `bookingFormBg`에는 `bindBackdropClose`를 바인딩하지 않음. 폼 모달은 ✕/취소 버튼으로만 닫힘. 조회용 상세 모달(`modalBg`)은 백드롭 클릭 닫기 유지. **입력 폼 성격의 모달은 앞으로도 백드롭 닫기 미바인딩이 원칙.**

## 작업 내역 (2026-07-07 — 관리자 계정 추가 + 토큰 유효 기간 연장)

- **관리자 추가**: `AUTH_ADMIN_EMAILS`에 박광수 책임(`kwangsoo.park@lge.com`) 추가 — 5명 → **6명**.
- **관리자 토큰 유효 기간 연장**: `AUTH_ADMIN_TOKEN_TTL_DAYS` **7 → 90** — 주 단위 재로그인 마찰 완화 요청 반영. 토큰이 길어진 만큼 명단 이탈자 발생 시 배열에서 즉시 제거 + 재배포로 회수할 것 (백엔드 `verifyAdminToken`이 명단 포함 여부를 매 요청 검사하므로 토큰이 남아 있어도 제거 즉시 차단됨).
- **재배포 필요**: 두 변경 모두 Apps Script 상수 — script.google.com에서 동일하게 수정 후 "배포 관리 → 편집 → 새 버전 → 배포" (기존 URL 유지).

## 작업 내역 (2026-07-07 — 사내 이관 방향 확정 기록)

2026-07-06 개발팀 회의(김건우 Task Leader·박현정 책임(BE팀)·강원석 책임)로 사내 인프라 이관 방향이 확정됨. **상세는 `docs/migration/decisions-2026-07-06.md`가 단일 소스** — 이관 관련 작업은 반드시 이 문서를 먼저 읽을 것.

### 확정 요약
- **런타임**: 프론트(정적) + 백엔드를 **단일 도커 컨테이너**로 통합 → 쿠버네티스(EKS) 배포. 1단계 = Apps Script 대체 컨테이너를 로컬 `docker run` 가능한 상태로 (강원석 담당).
- **도메인**: `thinqreal.lge.com` (사내). 기존 `thinqreal.com`은 갱신 유지 안 함.
- **인증**: 사내 SSO(팀즈 기반) 우선 검토 — 인증 후 헤더의 사용자 이메일로 관리자 판별은 뒷단 서버가 처리.
- **데이터**: 사내 DB(DynamoDB 우선 검토, DB팀 협의 필요). **DB 자원 생성 전까지 구글 스프레드시트 유지하며 점진 이관.** 구글 캘린더는 API 미러링용 엑스트라로 유지.
- **알림**: 텔레그램 → MS Teams 워크플로 웹훅. **메일**: 사내 SMTP. **차트**: QuickChart → 오픈소스 라이브러리 서버 내부 렌더링. **스케줄**: Apps Script 트리거 → K8s CronJob. **기사 검색**: Serper 현행 유지.
- **확장**: 창원 등 타 사이트는 통합하지 않고 사이트별 별개 운영.

### 세션 운영 원칙 (혼선 방지)
- **이관 작업은 전용 세션에서 진행** — 운영 유지보수(현행 사이트 수정)와 채팅을 분리한다. 이관 세션은 `docs/migration/decisions-2026-07-06.md` §5(1단계 작업 정의)부터 시작.
- 현행 시스템(GitHub Pages + Apps Script)은 이관 완료 전까지 정상 운영·수정 지속 — 두 트랙이 병행된다.
- 이관 세션에서 결정·진행된 사항도 이 CLAUDE.md 또는 docs/migration/에 기록해 세션 간 맥락을 잇는다.

## 작업 내역 (2026-07-07 — 예약 폼 활용 방안·기대 효과 최소 글자 수)

형식적인 한두 줄 신청 방지 요청 반영 (index.html만 변경 — Apps Script 재배포 불필요).

- `MIN_DETAIL_LEN = 30` 상수 신설 (`MAX_VISITORS` 아래). 활용 방안(`fUsagePlan`, b2b 카테고리에선 라벨이 '방문 목적 (구체적)')과 기대 효과(`fExpectedEffect`)가 **30자 미만이면 제출 차단** + "N자 이상 작성해 주세요 (현재 N자)" 토스트. 안내 문구는 카테고리별 라벨(`cfg.usagePlanLabel`)에서 괄호·별표를 제거해 동적 생성.
- **관리자 이력 추가/수정 폼에는 미적용** — 이력 백필은 부분 입력 후 보강이 의도된 동작.
- 기준 글자 수 변경 시 `MIN_DETAIL_LEN` 상수만 수정.

## 작업 내역 (2026-07-09 — ROI 툴 v4.6 교체 (설문 연계 개편))

claude.ai ROI 세션에서 개편된 `ThinQ_ROI_Tool_v46.html`을 리포 `ThinQ_Real_ROI_Tool.html`로 교체. 단순 교체가 아니라 **리포 전용 변경을 보존하는 병합**으로 진행 — 업로드본에는 리포에서 추가했던 기능들이 없었음.

### 병합 방식 (v4.6 베이스 + 리포 전용 변경 이식)
- **v4.6 신규 (채택)**: 카테고리 6→5개(HS/ES 상품기획 삭제 — 기획 검증 가치는 V_R&D로 일원화, 이중계산 방지) / 기여 영업이익 2단계 계산(딜 영업이익 → 귀속분) + 카드별 상태줄(집계 전/부분/산입/파이프라인) / **딜 단계 select** — 미확정 딜은 단계 확률(초기10/제안25/협상50/우선협상75%)로 파이프라인 층위 분리(ROI 미산입·참고 병기) / 이익률 기본값 4.9%(HS사업본부 공시, `DEFAULT_MARGIN`) / V_Quality(품질 가치) 모달 — IoT 한정·미산입·공시 폴백 2.8만원 표현 / 카테고리 입력 라벨이 설문 Track A·B·C 데이터 소스 표기.
- **리포 전용 (보존·이식)**: 다크 올리브 디자인 시스템(팔레트·Inter 폰트·차트 색·전 색상 스윕) / 모바일 media query / **시나리오 스냅샷 저장/불러오기 전체**(CSS·툴바 버튼·패널·다이얼로그·JS, Apps Script `roi_snapshots` 연동).
- **스냅샷 ↔ v4.6 호환 확장**: `collectInputs/applyInputs`에 `stage` 필드 추가(옛 스냅샷은 stage 없음 → 100(확정)으로 복원), `collectOutputs`는 확정(stage 100%)만 `vSalesContrib` 산입 + `vPipeline` 별도 키 저장. 월간 리포트가 읽는 outputs 키(vRnD/vSalesInfra/vSalesContrib/vPR/totalCost)는 불변.
- `ROI_BUILD` 토큰 `20260519a` → `20260709a` (iframe 캐시 무력화).

### 데이터 분류·배포 원칙 (설문 명세 §6.5에서 전입 — 필독)
- 리포는 **퍼블릭** — Pages 배포 여부와 무관하게 커밋 즉시 공개, git 히스토리는 영구 보존. **커밋 전 민감 단가 grep 필수**:
  `grep -rnE "6,220|34,220|114,220|108,000|659원|16,126|Hi-Teleservice|헤이홈" <대상 파일>` → 0건이어야 커밋.
- 커밋 금지: CS 채널별 실단가, 판매량·CS 원단위 실사례, 딜·수주 실데이터, 대장의 실제 과제명·금액, 보고 PPT·사내 메일.
- 커밋 가능: 계산 로직·UI 코드, 공시 기반 수치(HS 4.9%), 방법론 표준값(100만원/일, 단계 앵커), 공시 폴백(출장점검료 약 2.8만원).
- `ThinQ_Real_ROI_Tool.html`은 Pages 배포에서 **제외되지 않음**(리포 루트 전체 서빙 + 관리자 iframe이 로드) — 보호는 파일 제외가 아니라 **내용 수준**(민감 수치 미포함)으로 한다. v4.6은 실단가 안전화 완료본.

### 다음 작업 (설문 데이터 파이프라인 — `ThinQReal_Survey_DB_Spec.md` 기준, 미착수)
**→ 2026-07-09 후속 세션에서 Phase 1~4 구현 완료 (아래 작업 내역 참조). Phase 5(월간 리포트 연계)만 잔여.**
설문 mailto 방식 → 예약과 동일한 fetch POST → Apps Script → Sheets 적재 구조로 전환. Phase 1~5: ① Sheets 신규 탭 3종(survey_responses·performance_ledger·iot_issue_log) + `handleSurveySubmit` ② 설문 HTML fetch 전환(+mailto 폴백, 문구 2건) ③ 파생 행 생성 + Telegram ④ 관리자 「설문·대장」 탭(조회·상태 전환 — 행 삭제 없음) ⑤ 재방문율·월간 집계. 파괴적 작업은 verifyAdminToken 게이트, 제출은 공개 경로(토큰 불요). privacy.html에 설문 수집 고지 추가 필요. 명세 파일은 세션 업로드본 기준 — 리포 미커밋.

## 작업 내역 (2026-07-09 후속 — 설문 데이터 파이프라인 Phase 1~4 구현)

`ThinQReal_Survey_DB_Spec.md`(세션 업로드본) 기준. Phase 5(월간 리포트 설문 지표 연계)만 잔여.

### A. Apps Script (재배포 필요)
- **시트 3종 자동 생성**: `survey_responses`(34컬럼)·`performance_ledger`(15컬럼)·`iot_issue_log`(9컬럼) — `getNamedSheet(name, headers)` 공용 헬퍼 (getRoiSheet 패턴, 올리브 헤더). 컬럼 정의는 `SURVEY_HEADERS`/`LEDGER_HEADERS`/`ISSUE_HEADERS` 상수가 단일 소스.
- **`POST type:survey_submit`** (공개 — 토큰 불요, booking과 동일): 원본 append(raw_json 포함) + 파생 행 생성 + 텔레그램. track 검증(sales/media/etc).
- **파생 규칙**: Track B "특정 캠페인·프로모션과 연결됨" → 대장 `홍보·광고 마케팅` / Track C "신규 Task·과제" → 대장 `신규 Task·기타` (status=후보, `attribution_pct`는 라디오 원문 괄호 `(N%)` 파싱). Track C "발견함" → 이슈 로그(status=등록, symptom=상세 원문).
- **`GET ?type=survey_data&token=`** (관리자 토큰 필수): {responses, ledger, issues} 통합 반환 — 명세의 survey_list/ledger_list/issue_list를 1회 호출로 합침(콜드 스타트 1회).
- **`POST type:ledger_update / issue_update`** (관리자 토큰 게이트): 상태 전환·필드 갱신만. **행 삭제 엔드포인트는 의도적으로 없음** — 드롭·기각도 상태로만 (명세 §3).
- **est_value 서버 계산**: severity(높음50%/가끔10%/드묾1%)·channel·q_ship 3종 모두 있을 때만. **채널 단가는 Script Property `SURVEY_CAS_JSON`에만** — 형식 `{"원격":N,"내방":N,"출장":N}` (원 단위, 실제 값은 콘솔에서 입력 — §6.5 커밋 금지 원칙). 미설정 시 est_value 공란(참고용·ROI 미산입이라 무해).

### B. 설문 HTML (`ThinQ_Real_Visit_Survey.html` — 리포 신규 추가)
- 업로드 기준본(문구 2건·성과 연결 카드·상품기획 제거 반영됨) + **fetch 전환**: `submitForm()`이 no-cors POST(index.html 검증 패턴) → 성공 시 `successCard`(감사+사은품 재노출), 실패(네트워크 차단) 시 `submitViaMail()` mailto 폴백 + `fallbackNote` 안내. 구조화 페이로드는 `buildPayload()`(rawRadio/rawChecks/rawText — 미응답은 빈 문자열).
- 공개 URL(`thinqreal.com/ThinQ_Real_Visit_Survey.html`) — 메인 게이트 미적용(설문은 비보호 의도, privacy.html 고지로 커버).

### C. 관리자 「설문·대장」 탭 (분석 섹션, nav-survey)
- 헤더: **설문 링크 복사 + 설문 폼 새 창 열기** (ROI 탭 패턴). 툴바: 트랙·월 필터 + 새로고침.
- KPI 4종: 응답 수(트랙 분포) / 재방문 응답률(첫·2·3~5·6+ 분포) / 대장(후보·확정·드롭) / 이슈 수.
- 설문 응답 테이블 → 행 클릭 상세 모달(`surveyModalBg`, 조회용 — 백드롭 닫기 바인딩). 성과연결 📒 / 이슈 ⚠ 마커.
- 대장 테이블: 확정/드롭 버튼 → `ledgerModalBg` **입력 폼 모달(백드롭 미바인딩 원칙)**. **확정 금액 단위 = 만원.** "ROI 반영" 체크는 수동 표시(ROI 툴 이중 기입 방지용) — 확정 상태에서만 활성.
- 이슈 테이블: 기기/심각도/채널/목표 수량/상태 행 단위 저장 → 서버 est_value 계산 → 1.5초 후 자동 재조회로 반영.
- 데이터는 탭 첫 진입 시 fetch + 메모리 캐시(`surveyData`), 새로고침 버튼으로 갱신. localStorage 캐시 없음(예약 대비 저빈도).

### D. privacy.html
- §1 수집 항목(방문 후기 설문 행) / §2 목적(설문) / §3 보유 기간(**설문 응답 — 방문일로부터 3년**, 예약과 동일 기준) 추가.

### 재배포 후 확인 절차
1. Apps Script 재배포("배포 관리 → 편집 → 새 버전 → 배포") → 2. 설문 폼에서 테스트 1건 제출(R&D 트랙 + 이슈 '발견함' + 성과 연결 선택 권장) → 3. 시트 3종 행 생성·텔레그램 수신 확인 → 4. 관리자 설문·대장 탭에서 조회·확정/드롭·이슈 저장 동작 확인 → 5. (선택) `SURVEY_CAS_JSON` Script Property 입력 후 est_value 계산 확인.

### 핵심 제약 (다음 세션에서도 유지)
- 설문·대장·이슈에 **행 삭제 기능을 만들지 말 것** — 드롭/기각 상태 전환으로만 (감사 추적 보존).
- **채널 단가(C_AS)는 코드·리포 어디에도 쓰지 말 것** — `SURVEY_CAS_JSON` Script Property가 유일한 위치. 커밋 전 민감 단가 grep(§6.5) 습관 유지.
- 대장 `confirmed_amount`는 **만원 단위** — ROI 툴 반영 시 단위 환산 주의 (ROI 툴 pipe 입력은 백만원 단위).
- 설문 제출(survey_submit)은 공개 경로 유지 — 관리자 토큰 게이트에 넣지 말 것 (응답자는 토큰이 없음).

## 작업 내역 (2026-07-14 — 설문·대장 탭 수정 기능 + 설문 폼 성과 연결 버그 수정)

### A. 설문 폼 성과 연결 상세 칸 버그 수정 (ThinQ_Real_Visit_Survey.html, PR #28)
- **증상**: Track B/C의 7번 성과 연결에서 "연결됨/신규 과제" 선택 시 "아래 항목을 적어주세요"라는데 입력 칸이 안 나타남.
- **원인**: 커스텀 옵션 클릭 핸들러가 `input.checked = true`를 먼저 설정 → 라벨 기본 동작 시점엔 이미 체크 상태라 `change` 이벤트 미발생 → 상세 칸 표시 토글이 실행 안 됨.
- **수정**: 표시 갱신을 `updateLinkDetails()`로 분리하고 옵션 클릭 핸들러에서 직접 호출 (change 리스너는 키보드 대비 유지). **교훈: 커스텀 옵션 UI에서 조건부 표시를 라디오 change 이벤트에만 의존하지 말 것.**

### B. 관리자 설문·대장 탭 — 수정(오탈자·내용 정정) 기능 (Apps Script + thinqreal_admin.html, 재배포 필요)
담당자가 설문 응답·대장·이슈의 오탈자와 내용을 관리자 페이지에서 직접 정정할 수 있게 함.
- **`POST type:survey_update` 신설** (관리자 토큰 게이트): response_id로 행을 찾아 필드 갱신. **불변 필드**: `response_id/submitted_at/track/raw_json`(제출 원문 증빙) + **파생 트리거 3종 `media_link/etc_link/iot_defect`** — 제출 시점에만 대장·이슈 행을 생성하므로 사후 변경 시 파생 행과 어긋남. 연결 오류는 대장 드롭/이슈 기각으로 처리.
- **`ledger_update` EDITABLE 확장**: 기존 상태 필드 5종에 내용 필드 7종 추가(`category/project_name/expected_scale/attribution_pct/visit_date/respondent/dept`). `attribution_text`(라디오 원문)는 증빙으로 불변.
- **관리자 UI**:
  - 설문 상세 모달에 `수정` 버튼 → 수정 폼 모달(`surveyEditBg`, **입력 폼 — 백드롭 미바인딩 원칙**). 공통 8필드 + 트랙별 필드(sales 5/media 7/etc 7)를 동적 생성. 비표준 기존 값은 select에 자동 추가해 보존.
  - 대장 행에 `수정` 버튼 → 기존 `ledgerModalBg`에 '수정' 모드 추가(`lmEditWrap` — 카테고리 select·과제명·예상 규모·기여도%·방문일·응답자·부서). 수정 모드에선 status 미전송(상태 전환과 분리).
  - 이슈 증상(symptom) 셀을 읽기 전용 → 인라인 input으로 변경, 행 저장에 포함.
- 검증: Playwright로 3개 흐름(설문 수정/대장 수정+확정 회귀/이슈 증상) 페이로드까지 확인.

### 핵심 제약 (다음 세션에서도 유지)
- 설문 응답의 **파생 트리거 3종(media_link/etc_link/iot_defect)과 raw_json은 수정 불가** 유지 — 백엔드 IMMUTABLE과 수정 폼 양쪽에서 제외됨. 완화하려면 파생 행 재생성 로직부터 설계할 것.
- 수정 기능은 행 삭제가 아님 — **행 삭제 금지 원칙은 그대로** (드롭/기각 상태 전환만).
- **재배포 필요**: 신규 엔드포인트(survey_update) + ledger_update 필드 확장. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-15 — Survey Spec 잔여분: T8 + S9 + Phase 5)

`ThinQReal_Survey_DB_Spec.md`(2026-07-16 요약판) 기준 잔여 작업 3건 완료. Spec의 나머지(T1~T7·S1~S8·Phase 1~4)는 기구현 확인 — 재구현하지 않음.

### T8 — ROI 툴 (ThinQ_Real_ROI_Tool.html)
- 요약 라벨 `연간 합계` → **`연간 합계 (확정 기준)`** + 소자막 "총식은 덧셈 — 미집계 항은 +0일 뿐, 합계를 훼손하지 않음".
- 기여 영업이익 panel-desc에 안내 추가: "**확정 딜(계약 체결)은 실제 계약 금액을 입력**하세요 — 설문의 범위 하한은 미확정 딜의 파이프라인 계산용입니다." (마스터 §4.6 "확정 딜 + 1억 미만 → 0" 경로 봉쇄)
- V_PR 변경 없음 (Spec 확정 — vpr 팝업 한 줄 추가는 '선택'이라 미적용).
- `ROI_BUILD` `20260709a` → **`20260715a`** (iframe 캐시 무력화).

### S9 — 설문 폼 Track A (ThinQ_Real_Visit_Survey.html)
- **필수 응답 검증**: 딜 단계 항상 필수 / 딜 단계 ≠ "딜 없음"이면 딜 규모·기여 수준도 필수. 위반 시 제출 차단 + 해당 카드 스크롤 + 하이라이트(`.card.need-answer` + `.req-msg`). 답을 고르는 즉시 하이라이트 자동 해제. **다른 트랙(B/C)에는 필수 검증 없음** (기존 동작 유지).
- **`dealAmount` 조건부 필드**: 딜 단계 = "계약 체결 완료 (확정)" 선택 시에만 노출. **무응답 정상 케이스 — 검증 제외** (미입력 시 범위 하한 임시 적용 + 운영팀 확인 안내문 포함). 토글은 `updateLinkDetails()`에 통합 (change 이벤트 의존 금지 교훈 적용). payload `deal_amount` + mailto 폴백 본문에 포함.

### Phase 5 — 월간 리포트 설문 지표 연계 (Apps Script, 재배포 필요)
- `collectMonthlySurvey(month)` 신설: 응답 수·트랙 분포 / 재방문 응답률 / 대장 신규(방문월 기준)·확정(confirmed_date 기준)·드롭 / **월 확정 산입액 합계(만원)** / 이슈 등록 건수(출처 응답의 월로 조인).
- `collectMonthlyData`에 try/catch 격리로 연결(집계 실패가 리포트 발송을 막지 않음) → 본문 **📋 설문·성과 지표** 섹션 (HTML: KPI 4카드 + 트랙/대장 칩, 방문 이력과 ROI 사이 / 텍스트판 동일).
- **`deal_amount` 컬럼(35번째)**: SURVEY_HEADERS 끝에 추가. `getNamedSheet`가 **기존 시트의 누락 헤더를 끝에 자동 append**하도록 확장 (bookings getOrCreateHeaders 패턴). 관리자 상세/수정 폼에도 '실제 계약 금액' 필드 반영.

### 핵심 제약 (다음 세션에서도 유지)
- **SURVEY_HEADERS에 새 컬럼은 반드시 배열 끝에만 추가** — handleSurveySubmit이 상수 순서대로 appendRow하므로 중간 삽입 시 기존 시트와 어긋남. 기존 시트 헤더는 getNamedSheet가 자동 확장.
- dealAmount는 **필수 검증 대상 아님** — "답변하지 않을 수도 있음"이 사용자 확정 사항. 필수는 딜 단계·(딜 있을 때) 규모·기여 수준 3종만.
- BEP 대표 수치는 **1.65년(약 1년 8개월)** — "2년 7개월"은 PR 제외 감응도 체크용이므로 UI·문서에 대표 수치로 쓰지 말 것 (Spec §8-2-C).
- **재배포 필요**: Phase 5 + deal_amount는 Apps Script 변경 — "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-15 후속 — 월간 리포트 한글 폰트 개선)

- **월간 리포트 본문 폰트**: 시스템 스택(맑은 고딕+Segoe UI 혼용) → **Noto Sans KR 웹폰트 우선** + 맑은 고딕 폴백. `buildMonthlyReportHtml` 반환부에 `<style>@import>` 1줄 + font-family 재정렬.
- **"인라인 스타일만, <style> 금지" 규칙의 의도적 예외**: @import는 웹폰트 허용 환경(브라우저 미리보기·Apple Mail 등)에서만 적용되고, 차단 환경(PC Outlook·Gmail)은 무시 → 인라인 스타일 폴백이 그대로 살아 무해. 레이아웃·색상은 여전히 인라인만 사용.
- 적용 범위는 **월간 리포트만** — 예약 확정/거절·담당자 알림 메일은 현행 유지 (원하면 동일 패턴 확장 가능).
- **재배포 필요** (buildMonthlyReportHtml 변경).

## 작업 내역 (2026-07-15 후속 — 설문 폼 전 문항 필수 검증)

담당자 요청("필수 항목 미작성 시 제출 차단")으로 S9의 Track A 한정 검증을 **전 트랙·전 문항**으로 확장. **직전 S9의 "다른 트랙(B/C)에는 필수 검증 없음" 제약은 본 변경으로 대체됨.**

### 필수 규칙 (ThinQ_Real_Visit_Survey.html — `firstMissingRequired`)
1. **선택형 문항(라디오·체크)은 전부 필수** — 모든 문항에 '모름/해당 없음/특별한 변화 없음/발견하지 못함' 류 도피 선택지가 있어 응답 부담 없음.
2. **텍스트 입력은 기본 정보 3종(방문일·소속·작성자)만 필수** — "(선택)"·"(해당 시)" 표기 칸(고객사·실비·계약 금액·이슈 상세·과제명·자유 의견)은 자유.
3. **조건부 문항은 트리거 선택 시에만 필수**: 딜 규모·기여 수준(딜 있음 시) / 캠페인 예상 규모·기여 수준(연결됨 시) / 과제 예상 규모·기여 수준(신규 Task 시).
4. dealAmount는 여전히 검증 제외 (무응답 정상 — Spec §8-2-B 확정 유지).
- 검사는 **카드 등장 순서대로** — 첫 미작성 문항으로 스크롤+하이라이트, 답 선택/타이핑 즉시 해제. 필수 텍스트 3종은 `input` 이벤트로 해제.
- Playwright 17케이스 검증 (공통 4단계·Track B 순차 7단계·Track C 도피 선택지 통과·Track A 딜 없음 회귀).

### 핵심 제약 (다음 세션에서도 유지)
- 새 문항을 추가하면 `firstMissingRequired`(카드 순서 위치)와 `REQUIRED_MSG`에 함께 등록할 것 — 누락 시 그 문항만 필수에서 빠짐.
- 도피 선택지가 없는 선택형 문항을 새로 만들지 말 것 — 전 문항 필수 규칙의 전제.

## 작업 내역 (2026-07-16 — 설문 폼 「인상 깊었던 솔루션」 문항 신설)

"ThinQ Real LG AI Home 주요 시나리오" 슬라이드 기반 공통 문항 추가 (담당자 요청 — 설명 문구는 슬라이드 원문 최대 유지).

- **8번 공통 카드 `#modesCard`** (트랙 카드 7번과 만족도 사이, 만족도 카드는 8→9번): 7개 모드(웰컴/취침/기상/시네마/환기/프리젠테이션/외출) **복수 선택** + "특별히 없음 / 기억나지 않음" 도피 선택지 (전 문항 필수 규칙 준수).
- **선택지 구성**: opt-title = 슬라이드 제목 원문("나를 반겨주는 집 [웰컴 모드]"), opt-sub = 슬라이드 불릿 2개를 " — "로 이은 원문, 좌측 썸네일 `images/thinqreal_survey_mode_*.png` 7종 (welcome/sleep/wakeup/cinema/vent/present/away).
- **이미지는 담당자가 별도 업로드** (Gemini 생성 일러스트 — 공개 리포 게시 무해 확인됨). `onerror`로 미존재 시 자동 숨김 + `loading="lazy"` — 이미지 없이도 폼 정상 동작.
- 시트 값은 짧은 모드명(콤마 구분: "웰컴 모드, 시네마 모드"). `SURVEY_HEADERS` 끝에 **`impressive_modes`(36번째)** — 기존 시트는 getNamedSheet가 자동 확장.
- 반영 지점: buildPayload(공통)·mailto 폴백·필수 검증(`firstMissingRequired` 만족도 앞 + `REQUIRED_MSG`)·옵션 클릭 셀렉터(`#modesCard .opt`)·관리자 상세/수정 폼(`SV_FIELD_LABELS`/`SV_EDIT_COMMON`)·data-schema.md.
- **mode-opt 전용 CSS**: opt-sub 괄호 스타일 해제 + 블록형, `.opt-img` 84×62(모바일 60×45).
- **재배포 필요** (SURVEY_HEADERS 변경 — Apps Script).

### 핵심 제약 (다음 세션에서도 유지)
- 새 공통 카드를 track 밖에 추가할 땐 **옵션 클릭 셀렉터에 카드 id 추가 필수** (`.track .opt, #modesCard .opt, #commonCard .opt, ...`) — 누락 시 선택 자체가 안 됨.
- 모드 이미지 파일명 7종은 위 목록 고정 — 변경 시 HTML `src` 7곳 동기화.

## 작업 내역 (2026-07-16 후속 — 설문·대장·이슈 영구 삭제 기능)

테스트 제출로 쌓인 데이터 정리를 위해 담당자 요청으로 추가. **기존 "행 삭제 기능을 만들지 말 것" 제약의 의도적 개정** — 예약 booking_delete와 같은 성격(테스트·실수 데이터 정리)의 도구가 필요해짐. 원칙은 다음과 같이 조정:
- **실제 성과 기록·이슈는 여전히 드롭/기각 상태 전환으로 보존 권장** (감사 추적).
- **삭제는 테스트·실수 데이터 정리용** — "삭제" 정확 일치 타이핑 게이트 + 백엔드 관리자 토큰 검증(예약 삭제와 동일 이중 안전장치).

### 구현 (Apps Script 재배포 필요)
- **엔드포인트 3종** (`doPost` 관리자 토큰 게이트): `survey_delete`(response_id) / `ledger_delete`(ledger_id) / `issue_delete`(issue_id). 공용 헬퍼 `deleteRowsByValue`(아래→위 삭제로 인덱스 안전). **알림 미발송** (booking_delete와 동일).
- **survey_delete는 cascade**: 응답 행 + 그 응답에서 파생된 대장·이슈 행(response_id 연결)을 함께 삭제 — 고아 행 방지. 삭제 전 확인 모달에 "대장 N건 · 이슈 N건 함께 삭제" 경고 표시.
- **관리자 UI**: 설문 상세 모달에 `영구 삭제`(modal-btn-danger, 좌측 분리) / 대장·이슈 행에 빨간 `삭제` 버튼 → 공용 확인 모달(`svDelBg`, 백드롭 미바인딩). 낙관적 로컬 제거 + 전송 실패 시 `loadSurveyData(true)`로 서버 재동기화. 표 min-width 상향(대장 960px·이슈 1000px).
- Playwright 검증: cascade 경고·타이핑 게이트(오타 비활성)·3종 삭제·취소 경로 미전송.

### 핵심 제약 (다음 세션에서도 유지)
- 삭제 확인은 **"삭제" 정확 일치 타이핑** — 임의로 약화하지 말 것 (예약 삭제와 동일 규칙).
- survey_delete의 **cascade 규칙**(파생 행 동반 삭제)을 깨지 말 것 — 대장·이슈만 지우고 응답을 남기는 건 가능(개별 삭제), 응답만 지우고 파생을 남기는 건 불가(고아 행).
- **재배포 필요**: 신규 엔드포인트 3종. "배포 관리 → 편집 → 새 버전 → 배포".

## 작업 내역 (2026-07-16 후속 — 인상 솔루션 카드에 주관식 추가)

- 8번 카드(`#modesCard`) 하단에 **주관식 `#desiredSolutions`** 신설: "추가로 필요하거나 체험해 보고 싶은 솔루션 (선택)" — 안내문 "오늘 체험하신 솔루션 외에, 비즈니스에 필요하다고 생각되거나 다음 방문에서 체험해 보고 싶은 솔루션이 있다면 자유롭게 적어주세요."
- **선택 입력** — 전 문항 필수 규칙의 텍스트 예외("(선택)" 표기)라 검증 미적용. payload `desired_solutions` + mailto 폴백 포함.
- `SURVEY_HEADERS` 끝에 **`desired_solutions`(37번째)** — 기존 시트 자동 확장. 관리자 상세(`SV_FIELD_LABELS`)·수정 폼(`SV_EDIT_COMMON`, textarea) 반영.
- **재배포 필요** (SURVEY_HEADERS 변경).

## 작업 내역 (2026-07-16 후속 — 모드 선택 시 이유 입력 칸)

- 인상 깊었던 솔루션(8번 카드)에서 **모드를 선택하면 해당 옵션 바로 아래에 이유 입력 칸이 펼쳐짐** — "이 솔루션이 인상 깊었던 이유를 간단히 적어주세요 (선택)". 체크 해제 시 칸 숨김 + 수집 제외.
- 구조: 각 라벨 **밖**에 `.mode-reason` div(`#modeReason-{key}`) — 라벨 안에 넣으면 input 클릭이 체크박스를 토글해버림. 토글은 `updateLinkDetails()`에 통합(체크박스 `data-key` 기반, '특별히 없음'은 data-key 없어 제외).
- 저장: `collectModeReasons()`가 표시 중 + 비어있지 않은 칸만 **"모드명 — 이유; ..."로 직렬화** → `impressive_reasons`(SURVEY_HEADERS 38번째). 선택 입력이라 필수 검증 미적용.
- 관리자 상세(`인상 깊었던 이유`)·수정 폼(textarea) 반영. mailto 폴백 포함.
- **재배포 필요** (SURVEY_HEADERS 변경).

### 핵심 제약 (다음 세션에서도 유지)
- 조건부 입력 칸은 **라벨 밖에 배치** — 라벨 안의 input은 클릭 시 체크박스가 토글되는 부작용 (이번 구조가 선례).

## 작업 내역 (2026-07-20 — 예약 폼 신청자 정보 전환 (담당자·연락처 삭제))

방문 후기 설문이 **신청자 이메일**로 발송되므로, 설문 작성자와 예약 데이터가 올바르게 맵핑되도록 폼 구조 전환 (index.html + privacy.html — Apps Script 무변경·재배포 불필요).

- **신청자 이름(`fName`)·직급(`fRank`) 필드 신설** — 신청자 이메일 위, 항상 표시 영역. 둘 다 필수.
- **동적 영역의 담당자(`fLeader`)·담당자 연락처(`fPhone`) 삭제** — `PURPOSE_CONFIG`의 `leaderLabel/leaderPlaceholder`도 제거. 방문 인원은 방문자 명단으로 커버.
- **`name` 컬럼 = 신청자 "이름 직급"** (예: `강원석 책임`) — 별도 컬럼 추가 없이 기존 책임자 컬럼 재사용 → 관리자 표·알림 메일·캘린더·월간 리포트·설문 프리필(`buildSurveyInviteLink`의 `name=`) 모두 자동 반영. **`phone`은 항상 빈 값 전송** (컬럼은 유지 — 과거 행 호환).
- 백엔드 무변경 근거: 텔레그램 ☎ 줄은 `if (data.phone)` 조건부, 알림 메일 연락처 행은 빈 phone이면 이메일만 표시, 신규 예약 저장에 phone 필수 검증 없음.
- 개인정보 동의 문구(index.html)·privacy.html §1 수집 항목 동기화: "신청자 이름·직급·이메일·소속". privacy.html **버전 1.1** (2026-07-20 개정 이력 추가).
- **과거 데이터는 수정하지 않음** (forward-only 결정): 기존 행의 `name`=담당자는 당시 기록으로 보존, 이미 발송된 설문 프리필은 응답자가 작성자 칸을 수정 가능. 잘못 입력된 기존 설문 응답은 관리자 설문 수정 기능으로 개별 정정.

### 핵심 제약 (다음 세션에서도 유지)
- 신규 예약의 `name`은 "이름 직급" 결합 형식 — 분리 컬럼을 만들려면 Apps Script HEADERS 확장 + 소비처(알림·캘린더·리포트) 전수 수정 필요하므로 신중히.
- `phone` 컬럼을 시트에서 삭제하지 말 것 — 과거 행 데이터 보존 + 25컬럼 백필 순서 유지 (백필 시 phone 공란 허용).
- 연락처 `maxlength="15"` 제약은 필드 삭제로 소멸 — 관리자 이력 추가/수정 폼의 연락처 입력은 백필용으로 유지.

## 작업 내역 (2026-07-19 — 방문 후기 설문 요청 메일 배치)

지금까지 시스템으로 예약한 방문객(신청 시 입력한 이메일)에게 설문 폼 링크를 담은 요청 메일을 발송하는 기능. 확정 메일과 동일한 다크 올리브 카드형 + 발신명 'ThinQ Real'.

### A. Apps Script — 에디터 직접 실행 배치 3종 (재배포 불필요)
- **웹 엔드포인트가 아니라 에디터에서 실행하는 함수** — 코드 저장만 하면 되고 재배포는 필요 없음 (`migratePurposeCategories2026` 패턴).
- 실행 순서: ① `previewSurveyInviteTargets()` (발송 없이 명단·할당량 로그) → ② `sendSurveyInviteTest()` (스크립트 소유자 본인에게만 1통, 시트 기록 없음 — 실제 대상자 첫 건 데이터 사용, 대상 없으면 더미) → ③ `sendSurveyInviteBatch()` (실제 발송 + 기록).
- **대상 필터**: status=확정 + **방문 다음날부터**(방문일 < 오늘 — 아침 자동 발송이 방문 전에 나가는 것 방지) + 이메일 보유 + **`@lge.com` 주소만**(`AUTH_ALLOWED_DOMAINS` 재사용 — 도메인 외 주소는 제외 후 로그로 표시) + `surveyInviteSentAt` 공란. 백필 행은 이메일이 공란이라 자동 제외됨.
- **이메일 중복 제거**: 같은 이메일 다건이면 가장 최근 방문 1건 기준으로 1통만. 발송 성공 시 그 이메일의 **모든 해당 행**에 `surveyInviteSentAt`(ISO) 기록 → 재실행해도 중복 발송 없음. 발송 후 새 예약이 들어와 방문이 끝나면 그 건은 다시 대상이 됨(의도 — 방문별 후기).
- bookings HEADERS 끝에 **`surveyInviteSentAt`(25번째)** 추가 — `getOrCreateHeaders`가 기존 시트에 자동 append. 백필 시 공란 허용.
- **참조(CC) 설계 (2026-07-19 확정)**: 관리자 6명 전원 참조는 통수 부담(각자 발송 통수만큼 수신)으로 **미채택**. 수동 배치(`sendSurveyInviteBatch`)는 `SURVEY_INVITE_CC_BATCH`=운영자(강원석)만, 자동 발송(`surveyInviteTrigger`)은 `SURVEY_INVITE_CC_AUTO`=담당자 3명(이철호·서문수·김현진)+강원석. 기존 상수(`CC_EMAIL`·`ADMIN_EMAILS`) 재사용이라 담당자 변경 시 자동 반영.
- 일일 메일 할당량 초과 시 발송 없이 중단 로그 (`MailApp.getRemainingDailyQuota()` 선검사). 할당량은 **수신자 수 기준**이라 통당 소모 = 1+참조 수 — preview가 필요/남은 할당량을 함께 표시.
- 빌더: `buildSurveyInviteSubject/Text/Html/Link`. 민감 정보(Wi-Fi·도어락) 미포함. 사은품 문구는 설문 폼과 동일 톤.

### B. 방문 다음날 자동 발송 — 옵션 A 구현 (2026-07-19 확정)
- `surveyInviteTrigger()` — 매일 08:30경 시간 트리거. 전날까지의 미발송 방문 건을 자동 발송 (대상 없는 날은 로그만). 참조 = `SURVEY_INVITE_CC_AUTO` 4명.
- `installSurveyInviteTrigger()` — **에디터에서 1회 직접 실행 필수** (월간 리포트 `installMonthlyReportTrigger` 패턴, 기존 등록 있으면 교체). 실행 전까지 자동 발송은 동작하지 않음.
- 발송 코어는 `sendSurveyInvitesCore(cc, label)`로 공용화 — 수동 배치와 자동 발송이 같은 대상 필터·기록 로직 사용. `surveyInviteSentAt` 마커 덕에 수동·자동이 겹쳐도 중복 발송 없음.

### C. 설문 폼 — 쿼리 파라미터 프리필 (ThinQ_Real_Visit_Survey.html)
- 메일 링크가 `?visit_date=YYYY-MM-DD&name=…&dept=…`를 실어 보내면 폼이 방문일·작성자·소속을 미리 채움 (`prefillFromQuery` IIFE, 스크립트 끝).
- **이미 입력된 값은 덮어쓰지 않음** — 프리필은 편의일 뿐 수정 자유. 쿼리 없으면 기존 동작 그대로.
- dept 값은 예약의 `division + ' ' + department` 조합 (Apps Script `buildSurveyInviteLink`).

### 핵심 제약 (다음 세션에서도 유지)
- `sendSurveyInviteBatch` 재실행 안전장치는 `surveyInviteSentAt` 마커 — 임의로 지우면 그 행이 다시 발송 대상이 되므로 재발송 목적이 아니면 건드리지 말 것.
- 시트 백필 컬럼은 이제 **25열**(`id`~`surveyInviteSentAt`).
- 이 기능은 재배포 없이 동작하지만, **코드를 script.google.com에 반영(저장)해야** 에디터에서 함수가 보임. 다른 변경과 함께 재배포해도 무해.
- 옵션 A(방문 익일 자동 설문 발송)는 §B로 **구현 완료** — `installSurveyInviteTrigger()` 1회 실행이 활성화 조건.
- 참조 명단을 바꿀 땐 `SURVEY_INVITE_CC_BATCH`/`SURVEY_INVITE_CC_AUTO` 상수만 수정 — 관리자 6명 전원 참조로 되돌리지 말 것 (통수 부담으로 폐기된 설계).
