// Google Sheets 저수준 클라이언트 — 서비스 계정 인증 + 탭/헤더 보장 + 행 연산.
// Apps Script SpreadsheetApp 사용부의 대체. 저트래픽 전제로 연산마다 탭 전체를 읽는다
// (현행 Apps Script와 동일 패턴 — DynamoDB 전환 시 이 계층 자체가 사라짐).
import { google } from 'googleapis';

const HEADER_COLOR = { red: 0x3a / 255, green: 0x50 / 255, blue: 0x35 / 255 };

function colToA1(colIndex0) {
  let n = colIndex0 + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export class SheetsClient {
  constructor(serviceAccount, spreadsheetId) {
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.api = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
    this.tabIds = null;         // title → sheetId
    this.headerCache = new Map(); // title → headers[]
    this._writeChain = Promise.resolve(); // 프로세스 내 쓰기 직렬화 (단일 레플리카 전제)
  }

  // 쓰기 연산 직렬화 — Apps Script의 사실상 단일 스레드 특성 보존
  // (행 인덱스 기반 갱신·삭제의 경합 방지)
  serialize(fn) {
    const run = this._writeChain.then(fn, fn);
    this._writeChain = run.catch(() => {});
    return run;
  }

  async loadTabIds(force = false) {
    if (this.tabIds && !force) return this.tabIds;
    const res = await this.api.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    });
    this.tabIds = {};
    for (const s of res.data.sheets || []) {
      this.tabIds[s.properties.title] = s.properties.sheetId;
    }
    return this.tabIds;
  }

  async ensureTab(title) {
    const tabs = await this.loadTabIds();
    if (title in tabs) return tabs[title];
    await this.api.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await this.loadTabIds(true);
    return this.tabIds[title];
  }

  /** 탭 전체 값 읽기 (2D 배열, 표시 문자열 기준) */
  async readAll(title) {
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${title}'`,
    });
    return res.data.values || [];
  }

  /**
   * 헤더 보장 — 없으면 생성, 있으면 누락 컬럼만 끝에 append (getOrCreateHeaders 이식).
   * 반환: 실제 헤더 배열 (기존 순서 유지 + 누락분 뒤에).
   */
  async ensureHeaders(title, HEADERS) {
    const sheetId = await this.ensureTab(title);
    const rows = await this.readAll(title);
    const firstRow = rows[0] || [];

    if (!firstRow[0]) {
      await this.serialize(() => this.api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${title}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      }));
      await this.styleHeader(sheetId, 0, HEADERS.length);
      this.headerCache.set(title, HEADERS.slice());
      return HEADERS.slice();
    }

    const existing = firstRow.map((v) => String(v || ''));
    const missing = HEADERS.filter((h) => !existing.includes(h));
    if (missing.length) {
      const startCol = existing.length;
      await this.serialize(() => this.api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${title}'!${colToA1(startCol)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [missing] },
      }));
      await this.styleHeader(sheetId, startCol, startCol + missing.length);
      const merged = existing.concat(missing);
      this.headerCache.set(title, merged);
      return merged;
    }
    this.headerCache.set(title, existing);
    return existing;
  }

  async styleHeader(sheetId, startCol, endCol) {
    try {
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol },
              cell: {
                userEnteredFormat: {
                  backgroundColor: HEADER_COLOR,
                  textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          }],
        },
      });
    } catch (e) {
      console.warn('[sheets] header style skip: ' + e.message); // 스타일은 장식 — 실패해도 무해
    }
  }

  async appendRow(title, row) {
    return this.serialize(() => this.api.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${title}'`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    }));
  }

  /** updates: [{ rowNum(1-based), colIndex(0-based), value }] */
  async updateCells(title, updates) {
    if (!updates.length) return;
    return this.serialize(() => this.api.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates.map((u) => ({
          range: `'${title}'!${colToA1(u.colIndex)}${u.rowNum}`,
          values: [[u.value]],
        })),
      },
    }));
  }

  async deleteRow(title, rowNum) {
    const sheetId = await this.ensureTab(title);
    return this.serialize(() => this.api.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
          },
        }],
      },
    }));
  }
}
