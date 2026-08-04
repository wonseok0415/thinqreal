# ThinQ Real 운영관리 웹사이트

> 이 파일은 **현재 상태와 규칙만** 담는다. 날짜별 작업 이력 전문은 `docs/history.md` 참조.
> **작업 기록 규칙**: 새 작업의 상세 내역(증상·원인·구현 경위)은 `docs/history.md` 맨 아래에 추가하고, 이 파일에는 규칙·상태·제약의 변경만 반영한다.

## 프로젝트 개요
- **공간**: 마곡 LG사이언스파크 W6동 1층, 30평형 AI홈 연구·쇼룸
- **운영 목적**: AI홈 쇼룸 지원 (B2E — 임직원 전용), 기술 연구·검증, 데이터 축적·고도화
- **호스팅**: GitHub Pages — 저장소 `wonseok0415/thinqreal` (루트 = 사이트 루트, **퍼블릭 리포**)
- **라이브 URL**: https://thinqreal.com
- **백엔드**: Google Apps Script + Google Sheets
- **사내 이관 진행 중**: `thinqreal.lge.com` + 단일 도커 컨테이너(EKS)로 이관 확정 — 상세는 `docs/migration/decisions-2026-07-06.md`가 단일 소스. 이관 작업은 전용 세션에서, 현행 시스템 운영·수정은 이관 완료 전까지 병행.

## 디자인 시스템
- **스타일**: Apple HIG / **폰트**: Inter / **그리드**: 8pt, 44pt 터치 타깃
- **메인 컬러**: `--c-accent: #3a5035` (다크 올리브 그린)

## 파일 구조
리포 루트 = 사이트 루트 (GitHub Pages가 루트를 그대로 서빙).
```
/  (wonseok0415/thinqreal)
├── index.html                    # 메인 사이트 (홈/공간소개/예약/이용안내) — 이메일 게이트 적용
├── thinqreal_admin.html          # 관리자 대시보드 (9개 탭)
├── ThinQ_Real_Visit_Survey.html  # 방문 후기 설문 폼 (공개 — 게이트 미적용 의도)
├── ThinQ_Real_Visitor_Survey.html # 방문자 현장 설문 (QR·익명·한/영 — 공개, 2026-07-27)
├── ThinQ_Real_ROI_Tool.html      # ROI 분석 툴 (관리자 iframe 임베드 + 별창 열기)
├── privacy.html                  # 개인정보처리방침 (게이트 밖 열람 가능 의도, 현재 v1.2)
├── ThinQReal_AppScript.gs        # Apps Script 소스 (실배포는 script.google.com에서 관리)
├── CNAME / .nojekyll / README.md
├── CLAUDE.md                     # 이 파일 (현재 상태·규칙)
├── docs/
│   ├── history.md                # 날짜별 작업 이력 아카이브 (구 CLAUDE.md 작업 내역 전문)
│   └── migration/                # 사내 이관 문서 (api-contract / data-schema / dependency-inventory / decisions-2026-07-06)
└── images/                       # 이미지 (상대경로 참조)
```

## 이미지 규칙
- 모든 이미지는 **상대경로** `images/{파일명}` 참조. **base64 삽입 절대 금지** (과거 HTML 4.3MB 비대화 사고), 절대 URL(raw.githubusercontent) 금지.
- **최적화**: 공간 사진 렌더는 JPEG(1920px, q85, 장당 ~200KB)로 다운스케일 후 커밋. 관리자 슬라이드(`admin_*`)는 도식이라 PNG(1800px) 유지.
- **ABOUT 영상**(`thinqreal_about.mp4`): 갱신 시 파일명 고정 교체 → 커밋. 캐시 토큰 없음 — 안 바뀌면 강력 새로고침. 제작 파이프라인은 history.md(2026-05-25~26) 참조.
- **설문 모드 썸네일 7종**(`thinqreal_survey_mode_{welcome,sleep,wakeup,cinema,vent,present,away}.png`): 320×278 팔레트 PNG, 파일명 고정 — 변경 시 설문 HTML `src` 7곳 동기화.

### 주요 이미지 파일명
| 파일명 | 용도 |
|---|---|
| `thinqreal_home_hero.png` / `thinqreal_about.png`(영상 poster) | 홈 |
| `thinqreal_space_hero.jpeg` + `living_room/kitchen/bedroom/laundress_room/bathroom/entrance_corridor` | 공간 소개 01~06 |
| `thinqreal_guide_hero.png` | 이용 안내 |
| `thinqreal_admin_lighting.png` / `thinqreal_admin_system.png` | 관리자 슬라이드 |

## Google Apps Script 연동
| 항목 | 값 |
|------|-----|
| Sheets ID | `1-Z158TV46MtSEArir9bW4h4KQ438NCuhb3qaGyOooA0` |
| 시트 탭 | `bookings`(예약) · `roi_snapshots` · `slot_blocks` · `monthly_articles` · `monthly_insights`(리포트 인사이트·한마디 큐레이션) · `survey_responses` · `performance_ledger` · `iot_issue_log` · `export_log` · `visitor_responses`(방문자 현장 설문) · `health_checks`(FieldCheck 자동 점검 — 전용 세션 소관) — bookings 외에는 첫 호출 시 자동 생성 |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbxqmzxbm99Fi9vrKgLxCslUwwEl8TxiyUN6LPMwimf04yjQjIO1s2tjC2jWKnR7iCSrSQ/exec` |
| 스크립트 소유자(발신 계정) | `kangwonseok0415@gmail.com` — 발신 표시명은 모든 메일 `ThinQ Real` 통일 |
| 관리자 인증 | 이메일 코드 (명단 한정) — `AUTH_ADMIN_EMAILS` 6명: kang.wonseok / jhs.kim / ch275.lee / moonsu.seo / hj8462.kim / kwangsoo.park. 토큰 90일 |
| 담당자 알림 수신(ADMIN_EMAILS) | 이철호(ch275.lee) · 서문수(moonsu.seo) · 김현진(hj8462.kim) |
| CC(CC_EMAIL) | kang.wonseok@lge.com |

- **엔드포인트 전체 스펙은 `docs/migration/api-contract.md`가 단일 소스** (GET 16종 + POST 17종, 인증 모델·메일 규칙·스케줄 포함). 여기엔 요약만 둔다:
  - 공개: `booking`(예약 접수→알림 메일+텔레그램), `survey_submit`(설문→파생 행+텔레그램), `visitor_submit`(방문자 현장 설문→텔레그램, 파생 없음), `availability`, `appliances`, `auth_*`/`admin_auth_*`(코드 인증)
  - 관리자 토큰 필수: `bookings` 조회, `update`(확정/거절→예약자 메일+캘린더), `booking_delete`, `admin_booking_create/edit`(알림 미발송 — 백필용), `slot_block/unblock`, `survey/ledger/issue`의 update·delete, `export_log`, `survey_data`
  - ROI `roi_snapshot`/`roi_delete`는 토큰 미적용 (별창 열림 → 토큰 전달 경로 없음, 저위험 수용)

### Script Properties (코드·리포에 두지 않는 값)
`AUTH_SECRET` / `MONTHLY_REPORT_TO`(리포트 수신자) / `MONTHLY_REPORT_TEST_TO`(테스트 발송 수신자 — §8-6) / `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` / `CALENDAR_ID` / `SERPER_API_KEY` / `GOOGLE_CSE_ID`·`GOOGLE_CSE_KEY`(현재 403 차단) / `SURVEY_CAS_JSON`(채널 단가 — **유일한 위치**) / `FC_API_KEY`(FieldCheck 장비 키 — 2026-07-30 이전, rig config.json과 동일 값) / `monthly_report_last_sent_month`(자동 발송 가드 — §8-6 건너뛰기 체크 시에도 기록) / `manual_sent_<YYYY-MM>`·`send_token_*`·`test_token_*`(§8-6 수동 발송 이력·일회용 토큰 — 자동 생성)

## 메일 발송 규칙
- **모든 메일**: HTML + plain-text 동시, 다크 올리브(#3a5035) 카드형, **인라인 스타일만** (Gmail/Outlook 호환 — `<style>`·CSS 변수·외부 리소스 금지). 유일한 예외: 월간 리포트의 Noto Sans KR `@import` 1줄 (차단 환경에선 무시되어 무해).
- **예약 확정 메일**(buildConfirm*): 📅일정/📍위치/📶Wi-Fi(2.4G·5G 분리)/🔐도어락/🅿주차/☎문의/📖안내. **민감 정보는 확정 메일에만** — SSID `ThinQ_REAL_2.4G`/`ThinQ_REAL`, PW `real2026`, 도어락 PIN `509067` (2026-07-20 교체). 값 변경은 buildConfirm* 빌더에서만.
- **조건부 첨부**: R&D 목적(`purpose.indexOf('R&D')`) → 구비 가전 45개 표 / B2B·홍보(`/(B2B|홍보)/`) → 웰컴 보드 안내. 라벨 변경 시 이 정규식들 점검.
- **담당자 알림**(sendAdminAlert): 신규 예약 시 담당자 3 To + CC. 카테고리별 주제 라벨(`ADMIN_ALERT_SUBJ_LABELS`).
- **월간 운영 리포트**: 매월 **첫째 수요일** 08:30 KST에 **전월 리포트** 자동 발송 (2026-07-29 변경 — 매일 트리거 + `isFirstWednesdayOfMonth` + 월 중복 가드. 가드는 자동만 차단).
  - **구성 (2026-08-03 §8-7 개편 + 같은 날 렌더 리뷰 반영)**: ① Executive 요약(KPI **3카드** — 라벨→값→**26년 누적** 보조줄. MoM 표기 폐기 — 2026-08-04 팀장 리뷰) ② 사업부별 활용(확정 기준, **실제 저장된 본부 값 기반** 건수 내림차순 — 고정 6본부 목록 폐기, 고객가치혁신부문 등 별도 표기) ③ 핵심 인사이트(큐레이션, 없으면 생략) ④ 인상 깊은 한마디(큐레이션, 출처=응답자 소속 dept·방문자는 익명 — '인솔자 후기' 워딩 폐기) ⑤ 목적 도넛(**내부 렌더링 PNG** — Apps Script가 직접 그려 메일 cid 인라인 첨부·미리보기는 data URI. QuickChart 폐기 2026-08-04, 이관 결정 §⑦ 선반영·외부 의존 0. 렌더 실패 시 인라인 HTML 막대 폴백) ⑥ 관련 기사(**최대 5건**, 썸네일 카드형 — 수동 링크 우선·미달분 자동 수집 보충, ThinQ Real 한정) ⑦ **투자 대비 성과(ROI) 최하단·고정 수치**(소수 1자리 억원 표기 — 총 투자 2.9억(구축 2.8+운영 0.1/년)·BEP 1.31년·3년 +122.4%·5년 +270.7%. 연간 확정 가치·실측 누적 문장은 삭제 — 2026-08-04 팀장 리뷰). 방문 이력·설문·성과 지표 섹션은 리포트에서 삭제(상세는 관리자 페이지가 소스). 블록별 try-catch 격리.
  - **수동 발송 2단계 (2026-08-03 §8-6)**: `monthly_report_send`는 URL만으로 발송 불가 — 확인 화면(수신자·기발송 경고·**자동 발송 건너뛰기 체크박스**) → 일회용 토큰(10분) 버튼 [전체 발송]/[나에게만 테스트]. `confirm=YES` 레거시 폐기(무해화). 건너뛰기 체크 시에만 `PROP_LAST_SENT_KEY` 기록 → 그 달 자동 발송 스킵. 테스트 발송은 `MONTHLY_REPORT_TEST_TO`로 1인·[테스트] 접두·이력 무기록. `monthlyReportTrigger` 자체는 무변경.
  - 기사는 `monthly_articles` 시트 수동 큐레이션 우선 → Serper → CSE. 인사이트·한마디는 `monthly_insights` 탭(관리자 설문·대장 탭 큐레이션 UI로 입력).
- **설문 요청 메일**: §자동화 참조.

## 예약 슬롯 (확정, 변경 금지)
1회차 09:00–10:30 / 재정비 10:30–11:00 / 점심 11:30–13:00(예약 불가) / 2회차 13:00–14:30 / 재정비 14:30–15:00 / 3회차 15:00–16:30

## 메인 사이트 (index.html)
- **이메일 게이트**: `@lge.com` 6자리 코드 인증 → HMAC 토큰 30일 (`AUTH_ALLOWED_DOMAINS` ↔ index.html 정규식 동기화 필수). 외부 손님은 게이트 통과 불가 → 관리자가 시트 백필.
- **홈**: 쇼룸 지원 → 기술 연구·검증 → 데이터 축적 카드 (순서 유지). ABOUT 우측은 `<video>` 배경 (autoplay muted loop playsinline + poster).
- **공간 소개**: 01 거실 → 02 주방 → 03 침실 → 04 런드레스룸 → 05 욕실 → 06 현관·복도
- **예약**: 달력 → 슬롯 다중 선택 → 폼. 슬롯 상태 4종: 예약 마감(적) / N팀 예약 중(주황, **클릭 가능 유지**) / 예약 불가(관리자 차단, 회색, 최우선) / 선택 가능. `?type=availability` → `{bookedSlots, pendingCounts, blockedSlots}` (기존 키 하위 호환 유지).
- **예약 폼** (2026-07-20 현행): 소속 본부(드롭다운)+부서 → **신청자 이름·직급** → 신청자 이메일 → 방문 목적(6종, 트리거) → 동적 영역(주제/방문자 명단 최대 `MAX_VISITORS`=10/활용 방안/기대 효과 — 활용·기대는 `MIN_DETAIL_LEN`=30자 이상) → 필수 동의 3종(개인정보 수집/국외 이전/파손·분실). 담당자·연락처 필드는 삭제됨 — `name` 컬럼에 신청자 "이름 직급" 저장, `phone`은 빈 값.
- **이용 안내**: 유의사항 5그룹(공통/가전/공간/욕실/ThinQ — 구조 유지, 홈초대 규정은 ThinQ 그룹이 단일 소스) → 기타 이용 안내 → 주차(지하/지상 2카드 + 인라인 SVG 약도) → 웰컴 보드 → 담당자.

## 관리자 대시보드 (thinqreal_admin.html)
- **인증**: 관리자 이메일 코드 (명단 6명 한정) → 토큰 90일. 클라이언트 게이트는 편의일 뿐 — **백엔드 `verifyAdminToken`이 진짜 방어선**.
- **관리 탭**: 📋 예약 관리(KPI·필터·승인/거절·상세 모달·이력 추가/수정·영구 삭제·CSV 내보내기) / 📊 통계 / 🚫 슬롯 제어 / 🔐 연동 계정 / 🎬 시연 시나리오 / 💡 조명 스위치 / ⚙️ 시스템 구성 / 📦 구비 가전(45개, `?type=appliances` fetch)
- **분석 탭**: 📈 ROI 분석(iframe, `ROI_BUILD` 캐시 토큰) / 📝 설문·대장
- **데이터 로딩**: stale-while-revalidate — localStorage 캐시(`thinqreal_bookings_v1`, TTL 30분) 즉시 렌더 + 백그라운드 fresh fetch. 콜드 스타트 1~3초 스피너는 정상.
- **CSV 내보내기**: 모달에서 다운로드 사유(5자+) + 비밀번호(ASCII 8자+) → `export_log` 기록 성공 후에만 ZipCrypto 암호화 ZIP 다운로드.
- **반응형**: 사이드바 240↔64 토글(localStorage `thinqreal_admin_sidebar_collapsed`) / 모바일 오프캔버스 드로어. 표는 `.table-card` 가로 스크롤(booking 760px·survey 780px·ledger 960px·issue 1000px min-width).

## 설문 파이프라인
- **폼**(`ThinQ_Real_Visit_Survey.html`, 공개): 트랙 3종(sales/media/etc) + 공통 문항(8번 블록 8-1~8-5: 인상 깊은 솔루션 7모드+이유 / 도입 의향 1픽 / 음성 제어 공간 / 연결 우선 IoT 최대 3개·"없음" 배타 / 도입 걸림돌 — 2026-07-24 확장, **8-2~8-5는 파생·ROI 미산입** 인사이트 전용, 만족도 등). **sales 트랙은 8번 블록 미노출** (2026-07-27 — 방문자 현장 설문이 방문객에게 직접 수집하므로 대체. 검증 제외 + 페이로드 빈 값 강제 — 트랙 전환 잔존 선택 미누출. 만족도 번호 sales=8/기타=9). **전 문항 필수** (도피 선택지 전제) — 예외: "(선택)" 표기 텍스트·dealAmount. 쿼리 프리필(`?visit_date&name&dept`) 지원 — 기입력 값은 덮어쓰지 않음.
- **제출**: `survey_submit`(공개) → `survey_responses` 원본 + 파생 행 자동 생성 (Track B 캠페인 연결→대장 / Track C 신규 과제→대장, 이슈 발견→`iot_issue_log`) + 텔레그램.
- **관리자 설문·대장 탭**: 조회·수정·상태 전환(후보→확정/드롭, 등록→검토→반영/기각)·영구 삭제(테스트 정리용). est_value는 `SURVEY_CAS_JSON` 있을 때만 서버 계산.
- **설문 요청 메일**: 확정+방문 완료(익일부터)+@lge.com+미발송(`surveyInviteSentAt` 공란) 건에 자동 발송. 이메일 중복 제거(최근 방문 1건 기준 1통).
- **방문자 현장 설문**(`ThinQ_Real_Visitor_Survey.html`, 공개 — 2026-07-27 §8-5): 퇴장 직전 QR 스캔용 **완전 익명** 폼(성명·소속 미수집, `lang`만 기록), 한/영 토글(표시만 전환 — **저장 value는 항상 한국어 canonical**, 운영 설문 8번 블록과 격차 분석 전제). V1 만족도(5단계)~V6 필수+도피, V7 자유의견 선택. `visitor_submit` → `visitor_responses` 11컬럼 + 텔레그램. **파생·ROI 미산입, mailto 폴백 없음**(전송 실패 시 재시도 UI). 관리자 설문·대장 탭: KPI 카드+언어 필터+상세 모달+**영구 삭제**(`visitor_delete`, "삭제" 타이핑 게이트 — 테스트 정리용, 2026-07-27). **수정 기능은 의도적으로 없음** — 익명 응답 원문 보존 (정정 주체가 없는 데이터라 편집 자체가 무결성 훼손).

## FieldCheck 자동 점검 (⚠ 전용 세션에서 작업 진행 중 — 이 섹션은 세션 간 동기화용)
- **소유권**: FieldCheck(ThinQ ON Field 자동 점검 — 점검 장비 rig → `health_check` POST → `health_checks` 시트 → 관리자 🩺 탭 + 일일 요약 메일)는 **별도 클로드코드 세션에서 개발 중**. 본 운영 세션은 기능을 건드리지 않는다 (역방향도 동일 — FieldCheck 세션은 운영 기능 영역을 건드리지 않기).
- **⚠ 운영 세션이 2026-07-30에 변경한 사항 (FieldCheck 세션 필독)**:
  1. `FC_API_KEY` 하드코딩(`fieldcheck2026`)을 제거하고 **Script Property `FC_API_KEY` 조회로 교체** (`getFcApiKey()`, 미설정 시 fail-closed) — 퍼블릭 리포에 평문 키 커밋은 보안 규칙 위반. **코드에 키를 되돌리지 말 것.** 기존 값은 노출로 간주해 폐기 — Property에 새 값 등록 + rig `config.json` `api_key` 동시 교체 + 재배포 필요.
  2. 작업 재개 전 **main 최신 리베이스 필수** (`ThinQReal_AppScript.gs` 상수 블록·`handleNewHealthCheck`가 바뀜).
  3. **기록 규칙 준수 요청**: FieldCheck 작업 내역이 CLAUDE.md·history.md·api-contract·data-schema에 미기록 상태였음 — 이후 작업은 기록 규칙(하단 §기록 규칙)대로 남길 것.
- 관찰 사항 (FieldCheck 세션 판단 위임): `?type=health_checks` GET 조회가 현재 무인증 — 점검 이력(시나리오·STT 텍스트)이 URL만 알면 조회됨. 관리자 토큰 게이트 적용 검토 권장.
- 현황: `FC_TEST_MODE = true` (메일 CC_EMAIL만·텔레그램 미발송), 일일 요약 07:40 목표(트리거 ±15분), 건별 즉시 알림 꺼짐.

## 자동화·연동 현황 (활성)
| 항목 | 상태 |
|---|---|
| 월간 리포트 트리거 | `installMonthlyReportTrigger()` 설치됨 — 매일 08:30, **매월 첫째 수요일에 전월 리포트 발송** (2026-07-29 변경, 트리거 재설치 불필요 — 판정은 코드 내부) |
| 설문 요청 자동 발송 | `installSurveyInviteTrigger()` 설치됨(2026-07-20) — 매일 08:30, CC=담당자3+강원석(`SURVEY_INVITE_CC_AUTO`). 수동 배치 CC=강원석만(`SURVEY_INVITE_CC_BATCH`) |
| 텔레그램 알림 | 신규 예약·확정/거절·설문 제출·방문자 설문 제출 → 그룹 발송. 메일과 독립(try/catch 격리) |
| Google 캘린더 | 확정 예약 → 팀 캘린더(`thinq_real_calendar@gmail.com`) 회차별 개별 일정. 확정→생성/수정→갱신(delete+recreate)/거절·삭제→제거. `calendarEventId`에 id 배열 JSON |
| 기사 검색 | **수동 큐레이션 우선 + 자동 보충 병합**: 관리자 큐레이션 UI(URL 입력 → 메타 태그로 제목·썸네일 자동 추출, **YouTube는 oEmbed+i.ytimg 우회**) 또는 시트 직접 입력한 링크가 먼저 실리고, 5건(`REPORT_ARTICLE_LIMIT`) 미달분만 Serper.dev(`SERPER_API_KEY`, 키워드 `MONTHLY_REPORT_QUERY`='LG전자 ThinQ Real' — 2026-08-04 팀장 리뷰) → CSE 폴백(403 차단 중)으로 보충. **자동 수집은 ThinQ Real/씽큐 리얼 포함 기사만**(`filterThinqRealItems`) — 없으면 0건이 정상. 설명문은 수동/혼합/자동 케이스별 자동 동기화 |

## 데이터 스키마
- **컬럼 정의 단일 소스**: `docs/migration/data-schema.md` + Apps Script의 `HEADERS`/`SURVEY_HEADERS`/`LEDGER_HEADERS`/`ISSUE_HEADERS` 상수.
- **bookings 25컬럼**: `id timestamp date slots slot slotLabel name org phone email purpose count note status subject clientCompany visitors usagePlan expectedEffect purposeKey privacyConsent calendarEventId division department surveyInviteSentAt`
- **purposeKey 6종**: `b2b` / `rd` / `pr` / `content` / `internal-comm` / `other` — 분기 로직은 항상 purposeKey, 통계는 purpose(한국어 라벨) 기준.
- **survey_responses 42컬럼** (raw_json 포함), performance_ledger 15, iot_issue_log 9, export_log 5, visitor_responses 11.

### 시트 백필 규칙 (직접 입력 시)
- 25컬럼 **순서 엄수** — 추측 금지, `HEADERS` 배열이 단일 소스. 헤더 한 칸이라도 틀리면 관리자에서 조용히 누락됨.
- `slots`(JSON 문자열 `"[2]"`)·`slot`(숫자)·`slotLabel`(텍스트) 3종 모두 채울 것. 하나라도 빠지면 후속 컬럼이 밀림.
- id는 13자리 ms 시퀀스(기존 백필 `17799000000xx` 연속). 같은 날 다건이면 회차 분산. `phone·privacyConsent·calendarEventId·division·department·surveyInviteSentAt` 공란 허용.
- 알림이 불필요한 대량 입력은 **시트 직접 입력** — `POST booking`은 담당자 메일+텔레그램을 트리거하므로 백필에 부적합.

## 담당자
| 이름 | 직급 | 이메일 |
|------|------|--------|
| 이철호 | 책임 | ch275.lee@lge.com |
| 서문수 | 선임 | moonsu.seo@lge.com |
| 김현진 | 선임 | hj8462.kim@lge.com |

## 핵심 제약 (통합 — 전 세션 누적, 위반 금지)

### 불변값
- Apps Script URL·Sheets ID·`bookings` 탭명·슬롯 시간표·디자인 시스템(다크 올리브 #3a5035) 변경 금지.
- `monthly_articles` 탭명(`ARTICLES_SHEET_NAME`)·컬럼 구조 변경 금지.
- 구비 가전 45개 순서는 PDF 슬라이드 7 그대로 (재정렬 금지). 유의사항 5그룹 구조 임의 통합·분리 금지.
- 욕실(내부) 조명 카드의 "3구 미사용" 표기는 실제 하드웨어 사양 — 삭제 금지.
- 주차 약도 SVG 위치 번호는 신청 양식과 연동된 운영 정보 — 임의 재배치 금지 (변경은 담당자 확인 후).

### 날짜·데이터 처리
- 날짜에 `toISOString()` 금지 (UTC 변환으로 하루 밀림) — 항상 로컬 `getFullYear/getMonth/getDate` 조합.
- 관리자 표 정렬은 `date` 우선 + timestamp 보조.
- 통계 방문 목적별 차트는 정식 6개 카테고리를 0건 포함 항상 표시 (월별 누적 차트만 등장 목적 한정).

### 동기화 지점 (하나 바꾸면 세트로)
- **목적 카테고리 라벨/키**: `PURPOSE_CONFIG`(index) ↔ `BF_PURPOSE_CONFIG`·`SUBJ_LABELS`·`PURPOSE_COLORS`(admin) ↔ `ADMIN_ALERT_SUBJ_LABELS`·`subjLabelMap`·`PURPOSE_COLORS`(gs) + 라벨 기반 정규식 트리거(`R&D` 가전표, `/(B2B|홍보)/` 웰컴보드·리포트 핵심이력).
- **본부 목록**: index `#fDivision` ↔ admin `BF_DIVISIONS`.
- **허용 도메인**: gs `AUTH_ALLOWED_DOMAINS` ↔ index 정규식.
- **방문자 캡**: `MAX_VISITORS` 상수 + 폼 힌트 문구 + 이 파일.
- **보유 기간 "방문일로부터 3년"**: privacy.html §3 ↔ 폼 동의 문구. 수집 항목 변경 시 동의 문구 + privacy.html §1 + 버전 이력 함께.
- **PURPOSE_COLORS**: admin ↔ gs(월간 리포트 도넛) 양쪽. `ROI_VALUE_LABELS`는 ROI 툴 `collectOutputs` 키(vRnD/vSalesInfra/vSalesContrib/vPR)와 정확히 매칭.

### 보안·개인정보
- **Wi-Fi SSID/PW·도어락 PIN은 메인 페이지 절대 노출 금지** — 확정 메일(buildConfirm*)에서만.
- 모든 파괴적/쓰기 작업과 `bookings`·`survey_data` 조회는 **백엔드 `verifyAdminToken` 게이트** — 우회·약화 금지. 클라이언트 게이트는 편의일 뿐.
- 관리자 명단 단일 소스 = `AUTH_ADMIN_EMAILS`(6명). **임시 권한은 `AUTH_TEMP_ADMINS`로만** (만료일 `'YYYY-MM-DDT23:59:59+09:00'` KST 파싱 유지) — 영구 배열에 직접 추가 금지. 이탈자는 배열 제거+재배포로 즉시 회수(토큰 TTL 90일이지만 매 요청 명단 검사).
- `TELEGRAM_*`·`CALENDAR_ID`·`SURVEY_CAS_JSON`·`FC_API_KEY`(FieldCheck 장비 키 — 2026-07-30 이전) 등 비밀값은 **Script Property에만** — 코드·리포 커밋 금지. FC_API_KEY 교체 시 점검 장비 rig `config.json`과 동시 교체.
- 캘린더 일정에 방문자 명단·연락처 미표기 원칙.
- CSV 내보내기: 파일 비밀번호는 **로그·시트·코드 어디에도 기록 금지**. 사유 기록(`export_log`)이 먼저 — 실패 시 다운로드도 차단. `export_log` 행 삭제 기능 금지.
- **커밋 전 민감 단가 grep 필수 (2026-08-03 확장)**: `grep -rn "6,220\|34,220\|114,220\|108,000\|659원\|16,126\|Hi-Teleservice\|헤이홈\|206,000,000\|258,924,080\|279,417,851\|20,493,771"` → 0건. **콤마 없는 변형(6220 등)도 의심할 것.** 커밋 금지: CS 채널 실단가, 판매량·CS 원단위, 딜·수주 실데이터, 대장 실제 과제명·금액, 보고 PPT·사내 메일, **구축비 항목별 실집행 단가·구축/구매 소계**. 커밋 가능: 총액 요약(2.794억·2.886억), BEP·ROI 지표, KOSA 공표 단가(197,714원). ROI 툴 보호는 파일 제외가 아니라 **내용 수준**(민감 수치 미포함)으로.

### 예약·폼
- 필수 동의 3종(수집/국외이전/파손·분실) 미체크 차단 로직 해제 금지.
- 대기중 예약이 있는 슬롯은 선택 가능 유지 (거절 시 다음 신청자 확정 가능해야 함). `availability` 응답에 새 키 추가 시 기존 키를 깨지 말 것.
- 신규 예약 `name`은 신청자 "이름 직급" 결합 — 분리 컬럼화는 HEADERS 확장+소비처 전수 수정이 필요하므로 신중히. `phone` 컬럼은 시트에서 삭제 금지(과거 행 보존).
- 주차 안내에 ThinQ Real 담당자 개인 이메일 재기재 금지 (mgparking·mgoc·Kuwait.park는 외부 조직이라 예외).

### 관리자 페이지 UI
- 새 모달의 백드롭 닫기는 인라인 onclick 대신 `bindBackdropClose()` 사용. **입력 폼 성격 모달은 백드롭 닫기 자체를 바인딩하지 않는 것이 원칙** (작성 중 내용 소실 방지). 조회용 모달만 백드롭 닫기 허용.
- 영구 삭제류는 **"삭제" 정확 일치 타이핑 게이트** — 약화 금지. `booking_delete`·`admin_booking_create/edit`는 알림 미발송이 의도된 동작.
- ROI 툴 갱신 시 `ROI_BUILD` 토큰 필수 상향 (`?v={token}` — 안 올리면 iframe 캐시로 옛 버전).

### 설문
- `SURVEY_HEADERS` 새 컬럼은 **배열 끝에만** 추가 (appendRow가 상수 순서 의존, 기존 시트는 getNamedSheet가 자동 확장). `survey_submit`은 공개 경로 유지 (응답자는 토큰 없음).
- 파생 트리거 3종(`media_link/etc_link/iot_defect`)과 `raw_json`은 수정 불가 유지. 행 삭제는 테스트·실수 정리용 — 실제 성과·이슈는 드롭/기각 상태 전환으로 보존. `survey_delete`는 파생 행 cascade (응답만 지우고 파생을 남기는 것 불가).
- 대장 `confirmed_amount`는 **만원 단위** (ROI 툴 파이프 입력은 백만원 — 환산 주의).
- 새 문항 추가 시: `firstMissingRequired`(카드 순서 위치)+`REQUIRED_MSG` 등록, 도피 선택지 포함(전 문항 필수의 전제), track 밖 카드면 옵션 클릭 셀렉터에 카드 id 추가. 조건부 표시를 라디오 change 이벤트에만 의존하지 말 것(`updateLinkDetails()` 직접 호출). 조건부 입력 칸은 **라벨 밖에** 배치. dealAmount는 검증 제외(무응답 정상).
- BEP 대표 수치는 **1.31년 (약 1년 4개월)** — 2026-08 확정 기준(구 1.65년 대체). 리포트 ROI는 `ROI_FIXED` 상수(고정 표기)가 단일 소스 — 저장 시나리오 최신값 참조로 회귀 금지.
- **만족도 척도는 0~10 NPS** (2026-08-03 전환, 두 설문 폼 공통 — 저장값 정수 문자열 "0"~"10"). **구 5단계("N - 라벨")와 절대 섞어 평균 금지** — 척도 판별·분리 집계는 `classifySatisfaction()`이 단일 소스. 구 척도만 있는 월은 "N/5 (구 척도)" 표기 + NPS 미표기.
- **수동 발송 2단계 유지** — `confirm=YES` 복원 금지 (URL 단발 발송 사고 방지가 목적). 자동 발송 스킵은 §8-6 건너뛰기 체크(=`PROP_LAST_SENT_KEY` 기록)로만, `monthlyReportTrigger` 로직 수정 금지. 테스트 발송은 이력·가드 무기록 유지.
- `monthly_insights` 탭: 인사이트·한마디 큐레이션 전용 (`id/month/seq/type/text/source/created_at`). type=quote의 source는 **응답자 소속(dept) 또는 '방문자'** (2026-08-04 — 리포트 출처 라벨과 직결, 구 '인솔자' 저장분은 라벨 생략 처리). text에 `**굵게**` 마크다운 지원(HTML 리포트 `<strong>`, 텍스트판은 제거). 항목 순서는 ▲▼(=`insight_move`, 그룹 seq 1..n 재기록)·기사는 `article_move`(행 값 교환). 행 없으면 리포트 블록 자동 생략이 정상.
- **8번 블록 확장 4문항**(`adopt_pick`/`voice_space`/`iot_connect`/`ai_barrier`)은 **파생·ROI 미산입이 확정 설계** — handleSurveySubmit 파생 로직(대장·이슈)에 연결하지 말 것. 용도는 상품기획·엔지니어링 인사이트.
- 8-2(도입 의향) 저장 value는 8-1 모드명 어휘("웰컴 모드" 등)와 **동일 유지** — 인상 vs 도입 의향 격차 분석의 전제이므로 한쪽만 라벨 변경 금지. `iot_connect` 최대 3개는 클라이언트 검증(서버는 관대 수용·raw_json 보존이 의도), "없음" 배타는 `enforceIotConnectRules()`.
- **방문자 현장 설문**: 완전 익명 유지 — 성명·소속 등 개인정보 필드 추가 금지(추가 시 privacy.html 개정 필수). 딜·수주·기여도 등 **내부 정보 문항 추가 금지**(고객이 직접 보는 폼). 저장 value는 운영 설문과 **문자열 완전 동일** 유지(EN 화면도 한국어 canonical 저장 — 한쪽만 변경 금지). `visitor_submit` 공개 경로·파생 미연결·mailto 폴백 없음 유지. 만족도는 방문자 폼만 5단계(운영 폼은 4단계 — 공유 4개 value는 동일).
- **sales 트랙 8번 블록 미노출은 방문자 설문과 세트 설계** — 한쪽만 롤백 금지 (미노출을 되돌리려면 방문자 설문과의 역할 분담 재검토가 전제). 격차 분석 시 인솔자 8블록은 media/etc 트랙만, B2B 방문객은 `visitor_responses` 기준.
- 설문 초대: `surveyInviteSentAt` 마커 임의 삭제 금지(재발송 방지 장치). 발송 대상 @lge.com 한정. CC 변경은 `SURVEY_INVITE_CC_BATCH/AUTO` 상수만 — **관리자 6명 전원 참조로 회귀 금지**(통수 부담으로 폐기된 설계).

### 메인 페이지 구조
- 게이트 가림은 `body.unauth > *:not(...)` **direct-child 선택자** — 새 최상위 요소 추가 시 게이트 동작 확인.

## 배포 절차와 함정
- **Apps Script 재배포**: script.google.com에 `.gs` 전체 반영 → **"배포 관리 → 편집 → 새 버전 → 배포"** (기존 URL 유지). "새 배포"를 누르면 URL이 바뀌어 HTML 2곳의 SCRIPT_URL 교체 필요 — 금지.
- **재배포가 필요한 변경**: 웹 엔드포인트(doGet/doPost 경로) 추가·수정. **재배포 불필요**: 에디터 직접 실행 함수·시간 트리거는 항상 저장된 최신 코드 실행 (코드 반영·저장만 하면 됨).
- **에디터 함정**: 같은 이름 함수가 여러 .gs 파일에 있으면 뒤쪽 파일이 이김(옛 코드 파일 잔존 주의). 함수 드롭다운은 저장 후 갱신. 코드 버전 확인은 특정 문자열 Ctrl+F로.
- 트리거 설치 함수(`installMonthlyReportTrigger` / `installSurveyInviteTrigger`)는 1회 수동 실행 방식 — 이미 설치됨. 재설치 시 기존 트리거 자동 교체.
- GitHub Pages는 파일명이 같으면 브라우저/CDN 캐시가 늦게 풀릴 수 있음 → 강력 새로고침 안내.
- PR 머지 타이밍 레이스 주의: 커밋 푸시 전에 PR이 머지되면 후속 커밋이 누락됨 → `git rebase origin/main` 후 새 PR (#35/36, #39/40에서 두 번 발생).
- 브랜치 운영: 지정 브랜치가 머지되면 `git checkout -B <branch> origin/main`으로 재시작.

## 운영 리마인드
- [x] ~~7/31(금) 08:30 전 에디터 저장~~ — **완료(2026-07-29)**: `isFirstWednesdayOfMonth` 저장 확인, 7월 마지막 금요일 자동 발송 차단됨.
- [x] ~~8/4 리뷰 준비~~ — **완료(2026-08-03)**: PR #52·#53 머지+재배포, 7월 인사이트 4줄+한마디 3건 큐레이션 입력, `MONTHLY_REPORT_TEST_TO` 등록, 발송 확인 화면에서 수신자 26명+CC 정식 명단 확인.
- [x] ~~팀장 리뷰~~ — **완료(2026-08-04)**: 테스트 발송 수신본으로 리뷰, 렌더 후속 4건 반영(도넛 폰트·카드 통일·웹폰트 600·발송 화면 target=_top — PR #59~61).
- [x] ~~7월분 전체 발송~~ — **완료(2026-08-05 오전, 자동 발송 08:30 이전)**: 수신자 3명 추가(`MONTHLY_REPORT_TO` — 확인 화면에서 검증) 후 「자동 발송 건너뛰기」 체크 + [전체 발송하기]. 수동본이 정식본, 8/5 자동 발송은 가드로 스킵됨.
- [ ] **방문자 설문 QR 포스터 부착** (거실 협탁): QR 2종(흑백/올리브, 1960px·오류정정 H) 전달됨. **QR 스캔·동작 확인 완료(2026-07-27)** — 포스터 인쇄·부착만 남음. 테스트 응답은 재배포 후 관리자 설문·대장 탭 → 방문자 상세 모달 → 영구 삭제로 정리.
- [ ] **방문자 테스트 응답 4건 영구 삭제** (7/27 QR 테스트 — KO·구 척도 4건): 삭제 기능 배포 완료, 8월 리포트 지표에 섞이기 전에 정리.
- 기사 섹션: 관리자 큐레이션 UI에서 넣은 링크가 먼저 실리고 5건 미달분은 Serper 자동 수집으로 보충 (2026-08-03 병합 전환 — 구 "행 있으면 자동 미호출" 폐기). 발송 전 품질 확인은 큐레이션 섹션의 [리포트 미리보기] 버튼(=`monthly_report_preview&month`).
- [ ] **Option B — 리포트 전월 대비 증감 표시**: 합의된 후속 작업, 미착수.
- [ ] CSE 403 자동 해소 대기 중 (풀리면 키 동작 재확인 — 단 수동 링크로 5건이 채워진 달엔 호출 안 됨).
- 보류: 담당자 카카오톡 알림(비교 검토만, 텔레그램으로 대체됨), ABOUT 영상 자동화 다양화(Veo 클립 추가 확보 시).

## 다중 기기 작업 환경
- 로컬 수정 → GitHub push → 다른 기기는 claude.ai/code(웹)에서 같은 repo로 이어서 작업. 새 세션은 이 CLAUDE.md를 자동 로드하나 **채팅 히스토리는 세션 간 이동 안 됨** — 중요한 결정은 이 파일(규칙)과 docs/history.md(내역)에 즉시 기록.
- 구형 iPad+셀룰러에서 응답이 멈춰 보이면 새로고침이 정상 도구 (상세는 history.md 부록).

## 알아두면 좋은 것
| 상황 | 재작업 필요 여부 |
|------|----------------|
| 드라이브 폴더 이동 | ✕ 불필요 (SHEET_ID 불변) |
| 시트 파일명 변경 | ✕ 불필요 |
| 탭명 "bookings" 변경 | ✓ Apps Script `SHEET_NAME` 수정 필요 |
| 시트 삭제 후 재생성 | ✓ SHEET_ID 전체 교체 필요 |
| Apps Script 재배포(새 배포) | ✓ 새 URL을 두 HTML에 재입력 필요 — 하지 말 것 |

## 기록 규칙 (모든 세션 공통 — 삭제·요약 금지)
1. 매 세션 종료 전, docs/history.md 맨 아래에 날짜·변경 요약을 기록한다.
   CLAUDE.md 본문에는 규칙·상태·제약의 변경만 반영한다 (상단 규칙과 동일).
2. 스펙 문서(ThinQReal_Survey_DB_Spec.md 등)와 다르게 구현했거나 스펙에 없는
   판단을 내린 경우, 반드시 「⚠ 스펙 대비 변경」 표기로 별도 항목화한다:
   무엇을 / 왜 / 스펙 어느 조항 대비.
3. 이 기록은 claude.ai 설계 세션이 리포를 실측할 때의 유일한 판단 이력 소스다.
   기록 누락 = 설계와 구현의 단절.
