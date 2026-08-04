# ThinQ Real 플랫폼 의존성 인벤토리 (사내 이전용)

> Apps Script 전용 API·외부 서비스 사용처 전수 목록 + 대체 매핑.
> 이 표의 "대체" 열이 사내 이전 시 재구현 범위를 정의한다.
>
> **⚠ 2026-07-06 개발팀 회의로 이관 방향이 확정됨 — 최신 결정은 `decisions-2026-07-06.md`가 우선한다.** (EKS 단일 컨테이너 / DynamoDB 우선 검토 / 사내 SSO / 사내 SMTP / Teams 웹훅 / 차트 내부 렌더링 / CronJob / `thinqreal.lge.com`) 이 문서의 §4(이전 형태 A/B/C)·§5(업무혁신팀 확인 항목)는 회의로 상당 부분 답변됨.

## 1. Google Apps Script 플랫폼 API

| API | 사용처 | 역할 | 사내 대체 |
|---|---|---|---|
| `SpreadsheetApp` | `getSheet()` 등 전 데이터 접근 | **DB** (bookings·roi_snapshots·slot_blocks·monthly_articles) | 사내 RDB (스키마: data-schema.md) |
| `MailApp.sendEmail` | 인증 코드 / 담당자 알림 / 확정·거절 / 월간 리포트 / 테스트 (8곳) | 메일 발송 | **사내 SMTP** — 현재 외부 Gmail 발신이라 사내 수신 시 검역 지연 발생 중. 사내 SMTP 전환 시 이 문제 자체가 해소 (인증 코드 TTL 20분 완화의 원인이었음) |
| `CacheService` | 인증 코드·쿨다운·실패 카운터 | TTL 캐시 | Redis 또는 TTL 컬럼 테이블 |
| `PropertiesService` | 설정 7종 + 발송 가드 상태 | 설정/상태 저장 | 환경변수(비밀) + 설정 테이블(상태) |
| `CalendarApp` | 확정 예약 → 팀 캘린더 동기화 | 일정 등록/갱신/삭제 | 사내 캘린더 API 또는 기능 보류 (부가 기능이라 이전 1차 범위에서 제외 가능) |
| `UrlFetchApp` | Serper 뉴스 / 기사 OG 추출 / Telegram (4곳) | HTTP 클라이언트 | 표준 HTTP 클라이언트 — 단, **사내망 outbound 정책 확인 필요** |
| `Utilities` | HMAC-SHA256, base64, formatDate, UUID (15곳) | 암호화·유틸 | 표준 crypto/시간 라이브러리 (토큰 형식 유지 시 클라이언트 무변경) |
| `ScriptApp` 트리거 | 월간 리포트 (매일 08:30 → 마지막 금요일 판정) | 스케줄러 | cron |
| `Session.getScriptTimeZone` | 날짜 정규화 (7곳) | TZ | `Asia/Seoul` 고정 설정 |
| `ContentService` | `jsonResponse()` | JSON 응답 | HTTP 프레임워크 기본 기능 |
| `Logger` | 진단 로그 (22곳) | 로깅 | 표준 로거 |

## 2. 외부 서비스 (사내망 outbound 정책 검토 대상)

| 서비스 | 용도 | 호출 방향 | 차단 시 영향·대안 |
|---|---|---|---|
| ~~QuickChart.io~~ | ~~월간 리포트 차트 PNG~~ | **폐기 (2026-08-04)** — 목적 분포를 인라인 HTML 막대로 대체, 외부 이미지·서비스 의존 제거 (decisions §⑦ 선반영). 이관 시 별도 대체 불필요 | — |
| Serper.dev | 월간 리포트 기사 검색 | 서버 → 외부 | 차단 시 `monthly_articles` 시트 수동 큐레이션만으로 운영 (이미 우선순위 1순위라 영향 적음) |
| Telegram Bot API | 예약 알림 보조 채널 | 서버 → 외부 | 차단 시 silent skip 설계라 무해. 사내 메신저 웹훅으로 대체 검토 |
| Google Calendar | 팀 일정 동기화 | 서버 → Google | 사내 캘린더로 대체 또는 보류 |
| Gmail (발신) | 모든 메일 | 서버 → 수신자 | 사내 SMTP로 대체 (개선점) |

## 3. 프론트엔드 의존성 (변경 최소)

| 항목 | 내용 | 이전 시 |
|---|---|---|
| 호스팅 | GitHub Pages (리포 루트 = 사이트 루트, CNAME `thinqreal.com`, Cloudflare DNS) | 사내 웹서버로 정적 파일 복사. `thinqreal.lge.com` DNS + 사내 CA 인증서 |
| `SCRIPT_URL` 상수 | index.html · thinqreal_admin.html · ThinQ_Real_ROI_Tool.html · ThinQ_Real_Visit_Survey.html · ThinQ_Real_Visitor_Survey.html 각 1곳 | 사내 API 서버 URL로 교체 (5곳 — 기존 문서의 "3곳"은 설문 폼 누락이었음, 2026-07-27 보정) |
| `mode:'no-cors'` POST | Apps Script CORS 제약 우회용 | 사내 API가 CORS 허용하면 정상 fetch로 개선 가능 (응답 확인 가능해짐) |
| 빌드 도구 | 없음 (순수 정적) | 그대로 이동 |
| 외부 리소스 | 없음 (폰트 Inter도 시스템 폴백, 이미지 전부 상대경로) | 그대로 이동 |

## 4. 이전 형태별 재구현 규모 (업무혁신팀 답변에 따라 택1)

| 시나리오 | 제공 인프라 | 재작업 범위 |
|---|---|---|
| A. 정적 호스팅만 | 웹서버 | **불충분** — 백엔드(예약·인증·메일)가 필수라 이 형태만으로는 이전 불가. Apps Script를 외부에 유지하는 하이브리드는 사이버보안팀 취지와 상충 |
| B. 서버 런타임 + DB | WAS(Java/Node/Python 등) + RDB | 백엔드 전면 재구현 (~2,900줄 → API 25종 + 메일 빌더 + 스케줄러). 프론트는 URL 교체만 |
| C. 사내 로우코드/폼 플랫폼 | 사내 표준 도구 | 기능 매핑 재설계 (동적 폼·메일 규칙·통계 재현 가능성 검토 필요) |

## 5. 업무혁신팀에 확인할 항목 (아키텍처 확정 전제조건)

1. 제공 런타임 종류 (WAS 스택 / 컨테이너 / 서버리스?)
2. DB 제공 여부·종류 (RDB? 용량·백업 정책)
3. **사내 SMTP 릴레이** 사용 가능 여부 (발신 주소·표시명 정책 포함)
4. 스케줄 작업(cron) 지원 여부
5. 사내망 → 외부 outbound 허용 정책 (Telegram·QuickChart·Serper)
6. `thinqreal.lge.com` DNS + TLS 인증서 발급 절차
7. 접근 통제 요건 (현행 이메일 코드 인증 유지 가능? SSO 연동 요구?)
8. 개인정보 저장 위치 요건 (국외 이전 동의 절차가 불필요해지는지 — privacy.html 개정 필요)

## 6. 이전 시 없어지는 제약 (개선 기대 효과)

- 외부 Gmail 발신 → 사내 검역 지연 (인증 코드 5~15분 지연) **해소**
- Apps Script 콜드 스타트 1~3초 **해소**
- `no-cors` 제약 해소 → 클라이언트가 실제 응답 확인 가능
- Sheets 동시성 한계 → RDB 트랜잭션
- 개인정보 국외 이전(Google) 이슈 소멸 → 동의 절차 간소화 가능
