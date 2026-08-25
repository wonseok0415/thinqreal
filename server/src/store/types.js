// 저장소 어댑터 인터페이스 계약 (JSDoc) — stage1-container-design.md §3
//
// 원칙:
//  - 인터페이스는 도메인 연산 단위 (시트 행 연산 아님) → DynamoDB가 자연스럽게 구현 가능
//  - 레코드는 현행 24컬럼 필드명 그대로의 평면 객체 (data-schema.md §1)
//  - id는 항상 문자열 비교
//  - 값 정규화(date → 'YYYY-MM-DD' 문자열)는 어댑터 내부 책임

/**
 * @typedef {Object<string, any>} Booking — BOOKING_HEADERS 필드명 그대로의 평면 객체
 *
 * @typedef {object} BookingsStore
 * @property {(id: string) => Promise<Booking|null>} getById
 * @property {() => Promise<Booking[]>} listAll                       관리자 표·통계·리포트 집계
 * @property {(date: string) => Promise<Booking[]>} listByDate        availability — DynamoDB date-GSI 대응점
 * @property {(b: Booking) => Promise<void>} append
 * @property {(id: string, fields: object) => Promise<Booking|null>} update  갱신 후 레코드 반환 (없으면 null)
 * @property {(id: string) => Promise<boolean>} remove
 *
 * @typedef {object} RoiStore
 * @property {() => Promise<object[]>} list
 * @property {(snap: object) => Promise<void>} append
 * @property {(id: string) => Promise<boolean>} remove
 *
 * @typedef {object} SlotBlocksStore
 * @property {(date?: string) => Promise<object[]>} list
 * @property {(block: object) => Promise<void>} add
 * @property {(date: string, slot: number) => Promise<number>} removeByDateSlot  제거 건수 반환
 * @property {(id: string) => Promise<number>} removeById
 *
 * @typedef {object} ArticlesStore
 * @property {(month: string) => Promise<object[]>} listByMonth       각 행에 rowRef 포함 (write-back용)
 * @property {() => Promise<object[]>} listAll                        관리자 큐레이션 UI용 (month/title/url/source/published_at)
 * @property {(rowRef: any, fields: object) => Promise<void>} update  빈 칸 write-back
 * @property {(record: object) => Promise<void>} append               article_add (관리자 큐레이션)
 * @property {(month: string, url: string) => Promise<boolean>} remove       article_delete
 * @property {(month: string, url: string, dir: 'up'|'down') => Promise<{ok:boolean, error?:string}>} move  같은 달 이웃 행과 순서 교환
 *
 * @typedef {object} StateStore — Script Properties 상태값 대체 (monthly_report_last_sent_month 등)
 * @property {(key: string) => Promise<string>} get
 * @property {(key: string, value: string) => Promise<void>} set
 *
 * @typedef {object} SurveyStore — 설문 파이프라인 탭 3종
 * 삭제 연산은 테스트·실수 데이터 정리 전용 (2026-07 추가 — .gs survey/ledger/issue_delete와 동일 계약).
 * 실제 성과 기록은 드롭/기각 상태 전환으로 보존이 원칙.
 * @property {() => Promise<object[]>} listResponses
 * @property {() => Promise<object[]>} listLedger
 * @property {() => Promise<object[]>} listIssues
 * @property {(r: object) => Promise<void>} appendResponse
 * @property {(r: object) => Promise<void>} appendLedger
 * @property {(r: object) => Promise<void>} appendIssue
 * @property {(id: string, fields: object) => Promise<object|null>} updateResponse  id = response_id, 갱신 후 레코드
 * @property {(id: string, fields: object) => Promise<object|null>} updateLedger    id = ledger_id
 * @property {(id: string, fields: object) => Promise<object|null>} updateIssue     id = issue_id (est_value 재계산용으로 갱신 레코드 필요)
 * @property {(id: string) => Promise<number>} removeResponse    response_id 일치 행 삭제 (건수 반환 — cascade는 핸들러 책임)
 * @property {(responseId: string) => Promise<number>} removeLedgerByResponse   response_id 연결 대장 행 삭제
 * @property {(responseId: string) => Promise<number>} removeIssueByResponse    response_id 연결 이슈 행 삭제
 * @property {(id: string) => Promise<number>} removeLedger      ledger_id 일치 행 삭제
 * @property {(id: string) => Promise<number>} removeIssue       issue_id 일치 행 삭제
 *
 * @typedef {object} TableStore — 신규 탭 공용 인터페이스 (visitor/insights/best/exportLog/health/voc)
 * @property {() => Promise<object[]>} list
 * @property {(record: object) => Promise<void>} append
 * @property {(id: string, fields: object) => Promise<object|null>} update  idField 기준
 * @property {(id: string) => Promise<number>} remove                       idField 일치 행 삭제 (건수)
 *
 * @typedef {object} Store
 * @property {BookingsStore} bookings
 * @property {RoiStore} roi
 * @property {SlotBlocksStore} slotBlocks
 * @property {ArticlesStore} articles
 * @property {StateStore} state
 * @property {SurveyStore} survey
 * @property {TableStore} visitors   방문자 현장 설문 (visitor_responses)
 * @property {TableStore} insights   월간 리포트 큐레이션 (monthly_insights)
 * @property {TableStore} best       베스트 리뷰어 발송 이력 (best_reviewers)
 * @property {TableStore} exportLog  CSV 내보내기 감사 로그 (export_log)
 * @property {TableStore} health     FieldCheck 점검 이력 (health_checks)
 * @property {TableStore} voc        FieldVoice 리포트 (voc_reports)
 * @property {string} backend
 */

export {};
