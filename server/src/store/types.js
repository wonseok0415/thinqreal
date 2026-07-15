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
 * @property {(rowRef: any, fields: object) => Promise<void>} update  빈 칸 write-back
 *
 * @typedef {object} StateStore — Script Properties 상태값 대체 (monthly_report_last_sent_month 등)
 * @property {(key: string) => Promise<string>} get
 * @property {(key: string, value: string) => Promise<void>} set
 *
 * @typedef {object} SurveyStore — 설문 파이프라인 탭 3종 (행 삭제 연산은 의도적으로 없음 — 명세 §3)
 * @property {() => Promise<object[]>} listResponses
 * @property {() => Promise<object[]>} listLedger
 * @property {() => Promise<object[]>} listIssues
 * @property {(r: object) => Promise<void>} appendResponse
 * @property {(r: object) => Promise<void>} appendLedger
 * @property {(r: object) => Promise<void>} appendIssue
 * @property {(id: string, fields: object) => Promise<object|null>} updateResponse  id = response_id, 갱신 후 레코드
 * @property {(id: string, fields: object) => Promise<object|null>} updateLedger    id = ledger_id
 * @property {(id: string, fields: object) => Promise<object|null>} updateIssue     id = issue_id (est_value 재계산용으로 갱신 레코드 필요)
 *
 * @typedef {object} Store
 * @property {BookingsStore} bookings
 * @property {RoiStore} roi
 * @property {SlotBlocksStore} slotBlocks
 * @property {ArticlesStore} articles
 * @property {StateStore} state
 * @property {SurveyStore} survey
 * @property {string} backend
 */

export {};
